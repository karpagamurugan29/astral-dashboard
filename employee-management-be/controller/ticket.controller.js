import mongoose from "mongoose";
import { Readable } from "stream";
import ticketModel, { TICKET_STATUSES, TICKET_PRIORITIES } from "../models/ticketModel.js";
import employeeModel from "../models/employeeModel.js";
import { logAudit } from "../utils/audit.js";
import {
    ACTIVE, FINAL, DEFAULT_SETTINGS, helpdeskSettings, invalidateHelpdeskSettings, settingsDoc, categoryOf, helpdeskCtx, relationTo,
    queueFilter, allowedMoves, slaTargets, setDueDates, pauseClock, slaOf, nextTicketNo, deskPeople, tell, ensureTicketBackfill, runHelpdeskSla,
} from "../utils/helpdesk.js";

/* HR helpdesk: employees raise and track tickets, HR / Admin work them end to end, managers
   help on their team's. Every rule about who may do what lives in utils/helpdesk.js. */

const PERSON = "firstName lastName employeeId department designation profileImage";
const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "ticketFiles" });
const fail = (res, status, message) => res.status(status).json({ success: false, message });
const idOf = (v) => String(v?._id || v || "");
const nameOf = (p) => (p ? `${p.firstName || ""} ${p.lastName || ""}`.trim() : "");
const clean = (s, max) => String(s ?? "").trim().slice(0, max);
const escRx = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const validId = (id) => mongoose.isValidObjectId(id);

const track = (t, by, action, from = "", to = "", note = "", internal = false) => t.history.push({ at: new Date(), by, action, from: String(from ?? ""), to: String(to ?? ""), note, internal });
const touch = (t) => { t.lastActivityAt = new Date(); };
// the first thing staff say or do counts as the first response
const responded = (t, rel) => { if (rel !== "owner" && !t.firstResponseAt) t.firstResponseAt = new Date(); };

// attachments: type and size rules come from settings
const checkFiles = (files, settings) => {
    const rules = settings.attachments;
    if (files.length > rules.maxFiles) return `Attach up to ${rules.maxFiles} files at a time.`;
    for (const f of files) {
        const ext = (f.originalname.split(".").pop() || "").toLowerCase();
        if (!rules.types.includes(ext)) return `"${f.originalname}" isn't an allowed file type (${rules.types.join(", ")}).`;
        if (f.size > rules.maxSizeMB * 1024 * 1024) return `"${f.originalname}" is larger than ${rules.maxSizeMB} MB.`;
    }
    return null;
};
const storeFiles = (files, t, by, internal = false, commentId = null) => Promise.all(files.map((f) => new Promise((resolve, reject) => {
    const up = bucket().openUploadStream(f.originalname, { metadata: { ticket: t._id, by, contentType: f.mimetype } });
    Readable.from(f.buffer).pipe(up).on("error", reject).on("finish", () => {
        const a = { fileId: up.id, name: f.originalname, size: f.size, type: f.mimetype, uploadedBy: by, uploadedAt: new Date(), internal, commentId };
        t.attachments.push(a);
        resolve(up.id);
    });
})));

// what a person gets to see of a ticket
const view = (t, rel, settings, { full = false } = {}) => {
    const o = typeof t.toObject === "function" ? t.toObject() : t;
    const staff = rel && rel !== "owner";
    const cat = categoryOf(settings, o.category);
    const out = {
        _id: o._id, ticketNo: o.ticketNo, subject: o.subject, category: o.category, priority: o.priority, status: o.status,
        employeeId: o.employeeId, assignedTo: o.assignedTo, assignedAt: o.assignedAt, createdAt: o.createdAt, updatedAt: o.updatedAt,
        lastActivityAt: o.lastActivityAt || o.updatedAt, resolvedAt: o.resolvedAt, closedAt: o.closedAt, escalationLevel: o.escalationLevel || 0,
        confidential: !!cat?.confidential, sla: slaOf(o, settings), feedback: o.feedback?.rating ? o.feedback : null,
        attachmentCount: (o.attachments || []).filter((a) => staff || !a.internal).length,
        replies: (o.comments || []).filter((c) => !c.internal).length,
    };
    if (!full) return out;
    return {
        ...out,
        description: o.description, resolution: o.resolution, rejectionReason: o.rejectionReason, reopenCount: o.reopenCount || 0,
        firstResponseAt: o.firstResponseAt, escalatedAt: o.escalatedAt, resolvedBy: o.resolvedBy, closedBy: o.closedBy, assignedBy: o.assignedBy,
        comments: (o.comments || []).filter((c) => staff || !c.internal),
        attachments: (o.attachments || []).filter((a) => staff || !a.internal).map((a) => ({ ...a, url: `/tickets/${o._id}/files/${a.fileId}` })),
        history: (o.history || []).filter((h) => staff || !h.internal),
    };
};

const loadFor = async (req, res, id) => {
    if (!validId(id)) { fail(res, 400, "Invalid ticket id."); return null; }
    const t = await ticketModel.findById(id);
    if (!t) { fail(res, 404, "Ticket not found."); return null; }
    const [ctx, settings] = await Promise.all([helpdeskCtx(req), helpdeskSettings()]);
    const rel = relationTo(t, ctx, settings);
    if (!rel) { fail(res, 403, "You don't have access to this ticket."); return null; }
    return { t, ctx, settings, rel };
};

const detail = async (t, rel, ctx, settings) => {
    const fresh = await ticketModel.findById(t._id).populate("employeeId", PERSON).populate("assignedTo", PERSON).populate("comments.employeeId", PERSON).populate("history.by", "firstName lastName").populate("resolvedBy closedBy assignedBy", "firstName lastName");
    const staff = rel !== "owner";
    return {
        ...view(fresh, rel, settings, { full: true }),
        me: {
            relation: rel,
            moves: allowedMoves(fresh, rel, settings),
            canAssign: rel === "desk" && !FINAL.includes(fresh.status),
            canTriage: (rel === "desk" || rel === "assignee") && !FINAL.includes(fresh.status),
            canComment: !FINAL.includes(fresh.status) || rel === "desk",
            canNote: staff,
            canFeedback: rel === "owner" && ["Resolved", "Closed"].includes(fresh.status) && !!fresh.resolvedAt,
        },
    };
};

/* ---------------- list ---------------- */

// GET /tickets?view=mine|queue&status=&priority=&category=&assignee=&employee=&from=&to=&q=&sla=&sort=&dir=&page=&limit=
export const getTickets = async (req, res) => {
    try {
        await ensureTicketBackfill();
        runHelpdeskSla().catch(() => {});
        const [ctx, settings] = await Promise.all([helpdeskCtx(req), helpdeskSettings()]);
        const q = req.query;
        const mine = q.view !== "queue";
        if (!mine && !ctx.desk && !ctx.mod && !(await ticketModel.exists({ assignedTo: ctx.me }))) return fail(res, 403, "Only HR, managers and admins can work the ticket queue.");
        const base = mine ? { employeeId: new mongoose.Types.ObjectId(ctx.me) } : queueFilter(ctx, settings);

        const and = [base];
        if (q.status === "active") and.push({ status: { $in: ACTIVE } });
        else if (q.status && TICKET_STATUSES.includes(q.status)) and.push({ status: q.status });
        if (q.priority && TICKET_PRIORITIES.includes(q.priority)) and.push({ priority: q.priority });
        if (q.category) and.push({ category: String(q.category) });
        if (q.assignee === "none") and.push({ assignedTo: null });
        else if (q.assignee === "me") and.push({ assignedTo: new mongoose.Types.ObjectId(ctx.me) });
        else if (q.assignee && validId(q.assignee)) and.push({ assignedTo: new mongoose.Types.ObjectId(q.assignee) });
        if (!mine && q.employee && validId(q.employee)) and.push({ employeeId: new mongoose.Types.ObjectId(q.employee) });
        if (/^\d{4}-\d{2}-\d{2}$/.test(q.from || "")) and.push({ createdAt: { $gte: new Date(`${q.from}T00:00:00`) } });
        if (/^\d{4}-\d{2}-\d{2}$/.test(q.to || "")) and.push({ createdAt: { $lte: new Date(`${q.to}T23:59:59.999`) } });
        if (q.sla === "overdue") and.push({ status: { $in: ACTIVE.filter((s) => s !== "Pending Employee") }, dueAt: { $lt: new Date() } });
        if (q.q && String(q.q).trim()) {
            const rx = new RegExp(escRx(String(q.q).trim().slice(0, 80)), "i");
            const people = mine ? [] : await employeeModel.find({ $or: [{ firstName: rx }, { lastName: rx }, { employeeId: rx }] }).select("_id").limit(200).lean();
            and.push({ $or: [{ subject: rx }, { ticketNo: rx }, { description: rx }, ...(people.length ? [{ employeeId: { $in: people.map((p) => p._id) } }] : [])] });
        }
        const filter = and.length > 1 ? { $and: and } : base;

        const SORTS = { createdAt: "createdAt", updated: "lastActivityAt", priority: "priorityRank", due: "dueAt", status: "status", ticketNo: "ticketNo" };
        const dir = q.dir === "asc" ? 1 : -1;
        const sortKey = SORTS[q.sort] || "lastActivityAt";
        const sort = sortKey === "priorityRank" ? { priorityRank: -dir, dueAt: 1 } : { [sortKey]: dir, _id: -1 };
        const limit = Math.min(100, Math.max(5, Number(q.limit) || 20));
        const page = Math.max(1, Number(q.page) || 1);

        const [rows, total, byStatus, overdue, unassigned, stats] = await Promise.all([
            ticketModel.find(filter).select("-comments -history -description").sort(sort).skip((page - 1) * limit).limit(limit).populate("employeeId", PERSON).populate("assignedTo", PERSON).lean(),
            ticketModel.countDocuments(filter),
            ticketModel.aggregate([{ $match: base }, { $group: { _id: "$status", n: { $sum: 1 } } }]),
            ticketModel.countDocuments({ ...base, status: { $in: ACTIVE.filter((s) => s !== "Pending Employee") }, dueAt: { $lt: new Date() } }),
            mine ? 0 : ticketModel.countDocuments({ ...base, status: { $in: ACTIVE }, assignedTo: null }),
            mine ? null : ticketModel.aggregate([
                { $match: { ...base, createdAt: { $gte: new Date(Date.now() - 30 * 864e5) } } },
                { $group: {
                    _id: null,
                    // ignore records whose dates run backwards (imported / hand-edited data)
                    response: { $avg: { $cond: [{ $and: [{ $ifNull: ["$firstResponseAt", false] }, { $gte: ["$firstResponseAt", "$createdAt"] }] }, { $subtract: ["$firstResponseAt", "$createdAt"] }, null] } },
                    resolution: { $avg: { $cond: [{ $and: [{ $ifNull: ["$resolvedAt", false] }, { $gte: ["$resolvedAt", "$createdAt"] }] }, { $subtract: ["$resolvedAt", "$createdAt"] }, null] } },
                    resolved: { $sum: { $cond: [{ $ifNull: ["$resolvedAt", false] }, 1, 0] } },
                    met: { $sum: { $cond: [{ $and: [{ $ifNull: ["$resolvedAt", false] }, { $lte: ["$resolvedAt", "$dueAt"] }] }, 1, 0] } },
                } },
            ]),
        ]);
        const counts = Object.fromEntries(TICKET_STATUSES.map((s) => [s, 0]));
        byStatus.forEach((b) => { counts[b._id] = b.n; });
        counts.active = ACTIVE.reduce((n, s) => n + counts[s], 0);
        const s = stats?.[0];
        return res.status(200).json({
            success: true,
            data: rows.map((t) => view(t, mine ? "owner" : relationTo(t, ctx, settings), settings)),
            total, page, pages: Math.max(1, Math.ceil(total / limit)), limit,
            counts: { ...counts, overdue, unassigned },
            stats: s ? { avgResponseMins: s.response ? Math.round(s.response / 60000) : null, avgResolutionMins: s.resolution ? Math.round(s.resolution / 60000) : null, slaMet: s.resolved ? Math.round((s.met / s.resolved) * 100) : null } : null,
        });
    } catch (error) {
        return fail(res, 500, error.message);
    }
};

// GET /tickets/meta — categories, priorities, statuses, upload rules, and what this person may do
export const getTicketMeta = async (req, res) => {
    try {
        const [ctx, settings] = await Promise.all([helpdeskCtx(req), helpdeskSettings()]);
        const assigned = await ticketModel.exists({ assignedTo: ctx.me });
        let agents = [];
        if (ctx.desk) {
            const people = await employeeModel.find({ status: "Active" }).select(`${PERSON} role`).sort({ firstName: 1 }).lean();
            agents = people.filter((p) => ["Admin", "HR", "Manager", "Team Lead"].includes(p.role) || /HR/.test(p.designation || ""))
                .map((p) => ({ _id: p._id, name: nameOf(p), designation: p.designation, group: p.role === "HR" || /HR/.test(p.designation || "") ? "HR desk" : "Managers & leads" }));
        }
        return res.status(200).json({
            success: true,
            data: {
                categories: settings.categories.map(({ key, name, icon, color, hint, active, confidential, order }) => ({ key, name, icon, color, hint, active, confidential, order })),
                priorities: TICKET_PRIORITIES, statuses: TICKET_STATUSES, active: ACTIVE,
                sla: settings.sla, attachments: settings.attachments, reopenDays: settings.reopenDays,
                me: { desk: ctx.desk, queue: ctx.desk || ctx.mod || !!assigned, settings: ctx.desk },
                agents,
            },
        });
    } catch (error) {
        return fail(res, 500, error.message);
    }
};

/* ---------------- one ticket ---------------- */

export const getTicket = async (req, res) => {
    try {
        await ensureTicketBackfill();
        const got = await loadFor(req, res, req.params.id);
        if (!got) return;
        return res.status(200).json({ success: true, data: await detail(got.t, got.rel, got.ctx, got.settings) });
    } catch (error) {
        return fail(res, 500, error.message);
    }
};

// POST /tickets (JSON or multipart with files[])
export const createTicket = async (req, res) => {
    try {
        const settings = await helpdeskSettings();
        const subject = clean(req.body.subject, 150);
        const description = clean(req.body.description, 5000);
        const priority = TICKET_PRIORITIES.includes(req.body.priority) ? req.body.priority : "Medium";
        const cat = categoryOf(settings, req.body.category);
        const errors = {};
        if (subject.length < 3) errors.subject = "Add a short subject (at least 3 characters).";
        if (description.length < 10) errors.description = "Describe the issue (at least 10 characters).";
        if (!cat || !cat.active) errors.category = "Pick a category.";
        if (Object.keys(errors).length) return res.status(400).json({ success: false, message: Object.values(errors)[0], errors });
        const files = req.files || [];
        const bad = checkFiles(files, settings);
        if (bad) return fail(res, 400, bad);

        const me = req.user.id;
        const t = new ticketModel({ ticketNo: await nextTicketNo(), employeeId: me, subject, description, category: cat.name, priority, status: "Open", lastActivityAt: new Date() });
        t.createdAt = new Date();
        setDueDates(t, settings);
        track(t, me, "created", "", "Open");
        if (files.length) { await storeFiles(files, t, me); track(t, me, "attachment", "", "", `${files.length} file${files.length > 1 ? "s" : ""} attached`); }
        // assignment rule: a category can name a default assignee
        if (cat.defaultAssignee && validId(cat.defaultAssignee) && String(cat.defaultAssignee) !== String(me) && (await employeeModel.exists({ _id: cat.defaultAssignee, status: "Active" }))) {
            t.assignedTo = cat.defaultAssignee; t.assignedAt = new Date(); t.status = "Assigned";
            track(t, null, "assigned", "", nameOf(await employeeModel.findById(cat.defaultAssignee).select("firstName lastName").lean()), `Auto-assigned (${cat.name})`);
            track(t, null, "status", "Open", "Assigned");
        }
        await t.save();

        const who = nameOf(await employeeModel.findById(me).select("firstName lastName").lean());
        tell([...(await deskPeople(me)), t.assignedTo], `New ticket ${t.ticketNo}`, `${who}: ${subject} (${cat.name}, ${priority})`, t);
        logAudit(req, "ticket.create", `Raised ${t.ticketNo}: ${subject}`, { type: "Ticket", id: t._id });
        return res.status(201).json({ success: true, message: `Ticket ${t.ticketNo} raised. HR will get back to you.`, data: { _id: t._id, ticketNo: t.ticketNo } });
    } catch (error) {
        return fail(res, 500, error.message);
    }
};

// PUT /tickets/:id/status { status, note }
export const updateTicketStatus = async (req, res) => {
    try {
        const got = await loadFor(req, res, req.params.id);
        if (!got) return;
        const { t, ctx, settings, rel } = got;
        const to = req.body.status;
        const move = allowedMoves(t, rel, settings).find((m) => m.to === to);
        if (!move) return fail(res, 400, `You can't move this ticket from ${t.status} to ${to || "that status"}.`);
        const note = clean(req.body.note, 3000);
        if (move.needs && !move.optional && !note) return fail(res, 400, `${move.needs} is required.`);

        const from = t.status;
        const me = ctx.me;
        const now = new Date();
        pauseClock(t, to);
        t.status = to;
        touch(t);
        responded(t, rel);
        const internal = to === "Escalated";
        track(t, me, "status", from, to, note, internal);
        const kind = { "Pending Employee": "info-request", Resolved: "resolution", Rejected: "rejection", Reopened: "reopen", Escalated: "escalation", Closed: rel === "owner" && from !== "Resolved" ? "withdrawal" : "comment" }[to] || "comment";
        if (note) t.comments.push({ employeeId: me, message: note, internal, kind });

        if (to === "Resolved") { t.resolvedAt = now; t.resolvedBy = me; t.resolution = note; t.closedAt = null; }
        if (to === "Rejected") { t.rejectionReason = note; t.closedAt = now; t.closedBy = me; }
        if (to === "Closed") { t.closedAt = now; t.closedBy = me; }
        if (to === "Reopened") {
            t.reopenCount = (t.reopenCount || 0) + 1; t.closedAt = null; t.breachedAt = null; t.reminderSentAt = null;
            // a fresh resolution window from now
            t.dueAt = new Date(now.getTime() + slaTargets(settings, t.priority, t.category).resolution * 36e5);
        }
        if (to === "Escalated") { t.escalationLevel = (t.escalationLevel || 0) + 1; t.escalatedAt = now; }
        await t.save();

        const owner = idOf(t.employeeId);
        const label = `${t.ticketNo}: ${t.subject}`;
        if (rel !== "owner") {
            const msg = {
                "In Progress": "HR has started working on your ticket.",
                "Pending Employee": `HR needs more information: ${note}`,
                Resolved: `Resolved — ${note}. Close it if you're happy, or reopen within ${settings.reopenDays} days.`,
                Rejected: `Rejected — ${note}`,
                Closed: "Your ticket has been closed.",
                Reopened: "Your ticket has been reopened.",
            }[to];
            if (msg) tell([owner], `Ticket ${to.toLowerCase()}`, `${label} — ${msg}`, t);
            if (to === "Escalated") tell([...(await deskPeople(me)), t.assignedTo].filter((x) => idOf(x) !== me), `Escalated: ${t.ticketNo}`, `${t.subject} — ${note}`, t);
        } else {
            tell(t.assignedTo ? [t.assignedTo] : await deskPeople(owner), `Ticket ${to === "Reopened" ? "reopened" : "closed"} by employee`, `${label}${note ? ` — ${note}` : ""}`, t);
        }
        logAudit(req, "ticket.status", `${t.ticketNo}: ${from} → ${to}${note && !internal ? ` (${note.slice(0, 120)})` : ""}`, { type: "Ticket", id: t._id });
        return res.status(200).json({ success: true, message: `Ticket moved to ${to}.`, data: await detail(t, rel, ctx, settings) });
    } catch (error) {
        return fail(res, 500, error.message);
    }
};

// PUT /tickets/:id/assign { assignedTo } — HR / Admin
export const assignTicket = async (req, res) => {
    try {
        const got = await loadFor(req, res, req.params.id);
        if (!got) return;
        const { t, ctx, settings, rel } = got;
        if (rel !== "desk") return fail(res, 403, "Only HR or Admin can assign tickets.");
        if (FINAL.includes(t.status)) return fail(res, 400, `A ${t.status.toLowerCase()} ticket can't be reassigned.`);
        const toId = req.body.assignedTo || null;
        if (toId && !validId(toId)) return fail(res, 400, "Pick someone to assign it to.");
        if (toId && String(toId) === idOf(t.employeeId)) return fail(res, 400, "A ticket can't be assigned to the person who raised it.");
        const person = toId ? await employeeModel.findOne({ _id: toId, status: "Active" }).select("firstName lastName").lean() : null;
        if (toId && !person) return fail(res, 400, "That person isn't an active employee.");
        if (idOf(t.assignedTo) === String(toId || "")) return res.status(200).json({ success: true, message: "No change.", data: await detail(t, rel, ctx, settings) });

        const before = t.assignedTo ? nameOf(await employeeModel.findById(t.assignedTo).select("firstName lastName").lean()) : "";
        t.assignedTo = toId; t.assignedBy = ctx.me; t.assignedAt = toId ? new Date() : null;
        track(t, ctx.me, "assigned", before, person ? nameOf(person) : "Unassigned");
        if (toId && ["Open", "Reopened"].includes(t.status)) { track(t, ctx.me, "status", t.status, "Assigned"); t.status = "Assigned"; }
        touch(t);
        await t.save();
        if (toId) {
            if (String(toId) !== ctx.me) tell([toId], `Ticket assigned to you: ${t.ticketNo}`, `${t.subject} (${t.priority})`, t);
            tell([t.employeeId], "Your ticket has been assigned", `${t.ticketNo}: ${t.subject} — ${nameOf(person)} is looking into it.`, t);
        }
        logAudit(req, "ticket.assign", `${t.ticketNo} assigned to ${person ? nameOf(person) : "nobody"}`, { type: "Ticket", id: t._id });
        return res.status(200).json({ success: true, message: person ? `Assigned to ${nameOf(person)}.` : "Unassigned.", data: await detail(t, rel, ctx, settings) });
    } catch (error) {
        return fail(res, 500, error.message);
    }
};

// PUT /tickets/:id { priority, category } — HR / Admin / assignee
export const triageTicket = async (req, res) => {
    try {
        const got = await loadFor(req, res, req.params.id);
        if (!got) return;
        const { t, ctx, settings, rel } = got;
        if (!["desk", "assignee"].includes(rel) || FINAL.includes(t.status)) return fail(res, 403, "You can't change this ticket.");
        let changed = false;
        if (req.body.priority !== undefined && req.body.priority !== t.priority) {
            if (!TICKET_PRIORITIES.includes(req.body.priority)) return fail(res, 400, "Pick a valid priority.");
            track(t, ctx.me, "priority", t.priority, req.body.priority); t.priority = req.body.priority; changed = true;
        }
        if (req.body.category !== undefined && req.body.category !== t.category) {
            const cat = categoryOf(settings, req.body.category);
            if (!cat || !cat.active) return fail(res, 400, "Pick a valid category.");
            track(t, ctx.me, "category", t.category, cat.name); t.category = cat.name; changed = true;
        }
        if (!changed) return res.status(200).json({ success: true, message: "No change.", data: await detail(t, rel, ctx, settings) });
        setDueDates(t, settings); t.reminderSentAt = null;
        if (t.breachedAt && new Date(t.dueAt) > new Date()) t.breachedAt = null;
        responded(t, rel); touch(t);
        await t.save();
        logAudit(req, "ticket.update", `${t.ticketNo}: priority ${t.priority}, category ${t.category}`, { type: "Ticket", id: t._id });
        return res.status(200).json({ success: true, message: "Ticket updated.", data: await detail(t, rel, ctx, settings) });
    } catch (error) {
        return fail(res, 500, error.message);
    }
};

// POST /tickets/:id/comments { message, internal } + files[]
export const addTicketComment = async (req, res) => {
    try {
        const got = await loadFor(req, res, req.params.id);
        if (!got) return;
        const { t, ctx, settings, rel } = got;
        const message = clean(req.body.message, 3000);
        const internal = String(req.body.internal) === "true" && rel !== "owner";
        const files = req.files || [];
        if (!message && !files.length) return fail(res, 400, "Write a message or attach a file.");
        if (FINAL.includes(t.status) && !(rel === "desk" && internal)) return fail(res, 400, `This ticket is ${t.status.toLowerCase()}. ${rel === "owner" ? "Raise a new ticket if you need more help." : ""}`.trim());
        const bad = checkFiles(files, settings);
        if (bad) return fail(res, 400, bad);

        const commentId = new mongoose.Types.ObjectId();
        const ids = files.length ? await storeFiles(files, t, ctx.me, internal, commentId) : [];
        t.comments.push({ _id: commentId, employeeId: ctx.me, message, internal, kind: "comment", attachments: ids });
        track(t, ctx.me, internal ? "note" : "comment", "", "", files.length ? `${files.length} file${files.length > 1 ? "s" : ""} attached` : "", internal);
        if (!internal) responded(t, rel);
        // the employee answered HR's question → back to HR
        if (rel === "owner" && t.status === "Pending Employee") { pauseClock(t, "Pending HR"); track(t, ctx.me, "status", "Pending Employee", "Pending HR", "Employee replied"); t.status = "Pending HR"; }
        touch(t);
        await t.save();

        const label = `${t.ticketNo}: ${t.subject}`;
        if (rel === "owner") tell(t.assignedTo ? [t.assignedTo] : await deskPeople(ctx.me), `Employee replied — ${t.ticketNo}`, `${label} — ${message.slice(0, 140) || "sent a file"}`, t);
        else if (!internal) tell([t.employeeId], `HR replied — ${t.ticketNo}`, `${label} — ${message.slice(0, 140) || "sent a file"}`, t);
        else if (t.assignedTo && idOf(t.assignedTo) !== ctx.me) tell([t.assignedTo], `Internal note — ${t.ticketNo}`, message.slice(0, 140), t);
        return res.status(201).json({ success: true, message: internal ? "Internal note added." : "Reply sent.", data: await detail(t, rel, ctx, settings) });
    } catch (error) {
        return fail(res, 500, error.message);
    }
};

// POST /tickets/:id/feedback { rating 1-5, comment }
export const ticketFeedback = async (req, res) => {
    try {
        const got = await loadFor(req, res, req.params.id);
        if (!got) return;
        const { t, ctx, settings, rel } = got;
        if (rel !== "owner" || !["Resolved", "Closed"].includes(t.status) || !t.resolvedAt) return fail(res, 400, "Feedback can be given on your own resolved tickets.");
        const rating = Math.round(Number(req.body.rating));
        if (!(rating >= 1 && rating <= 5)) return fail(res, 400, "Pick a rating from 1 to 5.");
        t.feedback = { rating, comment: clean(req.body.comment, 1000), at: new Date() };
        track(t, ctx.me, "feedback", "", `${rating}/5`, t.feedback.comment);
        touch(t);
        await t.save();
        if (t.resolvedBy) tell([t.resolvedBy], `Feedback on ${t.ticketNo}`, `${rating}/5${t.feedback.comment ? ` — ${t.feedback.comment}` : ""}`, t);
        return res.status(200).json({ success: true, message: "Thanks for the feedback.", data: await detail(t, rel, ctx, settings) });
    } catch (error) {
        return fail(res, 500, error.message);
    }
};

// GET /tickets/:id/files/:fileId — same access as the ticket; internal files are staff only
export const downloadTicketFile = async (req, res) => {
    try {
        const got = await loadFor(req, res, req.params.id);
        if (!got) return;
        const a = got.t.attachments.find((x) => String(x.fileId) === String(req.params.fileId));
        if (!a || (a.internal && got.rel === "owner")) return fail(res, 404, "File not found.");
        res.set("Content-Type", a.type || "application/octet-stream");
        res.set("Content-Disposition", `attachment; filename="${encodeURIComponent(a.name || "file")}"`);
        bucket().openDownloadStream(a.fileId).on("error", () => { if (!res.headersSent) fail(res, 404, "File not found."); else res.end(); }).pipe(res);
    } catch (error) {
        return fail(res, 500, error.message);
    }
};

/* ---------------- settings ---------------- */

export const getHelpdeskSettings = async (req, res) => {
    try {
        const ctx = await helpdeskCtx(req);
        if (!ctx.desk) return fail(res, 403, "Only HR or Admin can change helpdesk settings.");
        const settings = await helpdeskSettings();
        const counts = await ticketModel.aggregate([{ $group: { _id: "$category", n: { $sum: 1 } } }]);
        return res.status(200).json({ success: true, data: { ...settings, usage: Object.fromEntries(counts.map((c) => [c._id, c.n])), defaults: DEFAULT_SETTINGS } });
    } catch (error) {
        return fail(res, 500, error.message);
    }
};

export const saveHelpdeskSettings = async (req, res) => {
    try {
        const ctx = await helpdeskCtx(req);
        if (!ctx.desk) return fail(res, 403, "Only HR or Admin can change helpdesk settings.");
        const current = await helpdeskSettings();
        const b = req.body || {};
        const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

        const cats = Array.isArray(b.categories) ? b.categories : current.categories;
        const seen = new Set();
        const categories = [];
        for (const [i, c] of cats.entries()) {
            const name = clean(c.name, 60);
            if (!name) return fail(res, 400, "Every category needs a name.");
            if (seen.has(name.toLowerCase())) return fail(res, 400, `"${name}" is listed twice.`);
            seen.add(name.toLowerCase());
            const sla = Object.fromEntries(TICKET_PRIORITIES.map((p) => [p, num(c.sla?.[p], 0, 2000, 0)]).filter(([, v]) => v > 0));
            categories.push({
                key: clean(c.key, 40) || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
                name, icon: clean(c.icon, 60) || "mdi-help-circle-outline", color: /^#[0-9a-f]{6}$/i.test(c.color || "") ? c.color : "#64748b",
                hint: clean(c.hint, 120), active: c.active !== false, confidential: !!c.confidential, order: i,
                defaultAssignee: c.defaultAssignee && validId(c.defaultAssignee) ? c.defaultAssignee : null, sla,
            });
        }
        if (!categories.some((c) => c.active)) return fail(res, 400, "Keep at least one category active.");

        const sla = Object.fromEntries(TICKET_PRIORITIES.map((p) => {
            const r = num(b.sla?.[p]?.response, 0.25, 720, current.sla[p].response);
            const z = num(b.sla?.[p]?.resolution, 0.5, 2000, current.sla[p].resolution);
            return [p, { response: r, resolution: Math.max(r, z) }];
        }));
        const types = (Array.isArray(b.attachments?.types) ? b.attachments.types : current.attachments.types).map((x) => String(x).trim().toLowerCase().replace(/^\./, "")).filter((x) => /^[a-z0-9]{1,8}$/.test(x));
        const helpdesk = {
            categories, sla,
            attachments: { maxSizeMB: num(b.attachments?.maxSizeMB, 1, 20, current.attachments.maxSizeMB), maxFiles: num(b.attachments?.maxFiles, 1, 10, current.attachments.maxFiles), types: types.length ? [...new Set(types)] : current.attachments.types },
            reopenDays: num(b.reopenDays, 0, 90, current.reopenDays),
            maxReopens: num(b.maxReopens, 0, 10, current.maxReopens),
            autoCloseDays: num(b.autoCloseDays, 0, 60, current.autoCloseDays),
            reminderAt: num(b.reminderAt, 0.5, 0.95, current.reminderAt),
            autoEscalate: b.autoEscalate !== undefined ? !!b.autoEscalate : current.autoEscalate,
        };

        // renamed categories carry their tickets with them (matched by key)
        const renames = categories.map((c) => [current.categories.find((o) => o.key === c.key)?.name, c.name]).filter(([o, n]) => o && o !== n);
        for (const [o, n] of renames) await ticketModel.updateMany({ category: o }, { $set: { category: n } });

        const doc = await settingsDoc();
        doc.helpdesk = helpdesk;
        doc.markModified("helpdesk");
        await doc.save();
        invalidateHelpdeskSettings();
        logAudit(req, "helpdesk.settings", `Updated helpdesk settings (${categories.length} categories)`, { type: "Settings" });
        return res.status(200).json({ success: true, message: "Helpdesk settings saved.", data: await helpdeskSettings() });
    } catch (error) {
        return fail(res, 500, error.message);
    }
};
