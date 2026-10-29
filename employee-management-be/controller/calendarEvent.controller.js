import mongoose from "mongoose";
import CalendarEventModel from "../models/calendarEventModel.js";
import ReminderModel from "../models/reminderModel.js";
import ProjectModel from "../models/ProjectModel.js";
import taskModel from "../models/taskModel.js";
import holidayModel from "../models/holidayModel.js";
import leaveModel from "../models/leaveModel.js";
import employeeModel from "../models/employeeModel.js";
import NotificationPrefModel from "../models/notificationPrefModel.js";
import { notify } from "../utils/notify.js";
import { allowedContactIds } from "../utils/chatAccess.js";
import { canManageProjects } from "./projectWorkspace.controller.js";
import { occurrences, parseRecurrence, validTimeZone } from "../utils/recurrence.js";
import { syncEventReminders, processDueReminders, runReminderJobs, prefsOf, PREF_DEFAULTS, eventLink, recipientsOf } from "../utils/reminders.js";

// Calendar: personal and project events (with repeats and reminders) shown together with task
// deadlines, personal to-dos, holidays and approved leave. Tasks stay the source of truth for
// their own dates — the calendar reads them, it doesn't copy them.

const fail = (res, err) => res.status(err.status || 500).json({ success: false, message: err.message });
const httpError = (status, message) => Object.assign(new Error(message), { status });
const idStr = (x) => String(x?._id || x || "");
const PERSON = "firstName lastName employeeId designation profileImage email";
const WORK_TYPES = ["Meeting", "Reminder", "Deadline", "Project event"];
// plans for life outside work — private to the owner and anyone they invite, never on a project
export const PERSONAL_TYPES = ["Personal", "Personal meeting", "Family", "Health", "Travel", "Birthday", "Fitness", "Bills", "Study", "Other"];
const TYPES = [...WORK_TYPES, ...PERSONAL_TYPES];
const PRIORITIES = ["Low", "Medium", "High", "Critical"];
const REMINDER_CHOICES = [0, 5, 10, 15, 30, 60, 120, 1440, 2880];
const MAX_RANGE = 400 * 864e5;

// Projects whose events I see: the ones I lead or work on.
const myProjects = async (me) => ProjectModel.find({ isDeleted: false, $or: [{ projectManager: me }, { teamMembers: me }] }).select("_id projectManager projectCode projectName teamMembers").lean();
const visibleFilter = (me, projectIds) => ({ $or: [{ createdBy: me }, { assignee: me }, { participants: me }, { projectId: { $in: projectIds } }] });

const loadEvent = async (req, id) => {
    if (!mongoose.isValidObjectId(id)) throw httpError(404, "Event not found.");
    const me = idStr(req.user.id);
    const ev = await CalendarEventModel.findById(id);
    if (!ev) throw httpError(404, "Event not found.");
    const projects = await myProjects(me);
    const inProject = ev.projectId && projects.some((p) => idStr(p._id) === idStr(ev.projectId));
    const seen = idStr(ev.createdBy) === me || idStr(ev.assignee) === me || (ev.participants || []).some((p) => idStr(p) === me) || inProject;
    if (!seen) throw httpError(404, "Event not found.");
    const leads = ev.projectId && projects.some((p) => idStr(p._id) === idStr(ev.projectId) && idStr(p.projectManager) === me);
    const canEdit = idStr(ev.createdBy) === me || !!leads || (!!ev.projectId && (await canManageProjects(req)));
    return { ev, me, canEdit, projects };
};

// Clean and check the event fields from a request.
const pickEvent = async (req, b, current = {}) => {
    const me = idStr(req.user.id);
    const o = {};
    const has = (k) => b[k] !== undefined;
    if (has("title") || !current.title) { o.title = String(b.title || "").trim().slice(0, 160); if (!o.title) throw httpError(400, "Give the event a title."); }
    if (has("description")) o.description = String(b.description || "").slice(0, 4000);
    if (has("location")) o.location = String(b.location || "").trim().slice(0, 200);
    if (has("link")) {
        o.link = String(b.link || "").trim().slice(0, 500);
        if (o.link && !/^https?:\/\//i.test(o.link)) throw httpError(400, "Links must start with http:// or https://");
    }
    if (has("eventType")) { if (!TYPES.includes(b.eventType)) throw httpError(400, "Pick an event type."); o.eventType = b.eventType; }
    if (has("priority")) { if (!PRIORITIES.includes(b.priority)) throw httpError(400, "Pick a priority."); o.priority = b.priority; }
    if (has("allDay")) o.allDay = !!b.allDay;
    if (has("timezone")) { if (!validTimeZone(b.timezone)) throw httpError(400, "That time zone isn't recognised."); o.timezone = b.timezone; }
    if (has("start") || !current.start) { o.start = new Date(b.start); if (isNaN(o.start)) throw httpError(400, "Pick a start date and time."); }
    if (has("end") || !current.end) { o.end = b.end ? new Date(b.end) : new Date((o.start || current.start).getTime() + 3600000); if (isNaN(o.end)) throw httpError(400, "The end time isn't valid."); }
    const start = o.start || current.start, end = o.end || current.end;
    if (end < start) throw httpError(400, "The event can't end before it starts.");
    if (end - start > 31 * 864e5) throw httpError(400, "An event can last at most 31 days.");
    if (has("reminders")) {
        const list = (Array.isArray(b.reminders) ? b.reminders : []).map(Number);
        if (list.some((n) => !Number.isFinite(n) || n < 0 || n > 60 * 24 * 60)) throw httpError(400, "Reminders must be between the start time and 60 days before.");
        o.reminders = [...new Set(list)].slice(0, 6).sort((x, y) => y - x);
    }
    if (has("emailReminders")) o.emailReminders = !!b.emailReminders;
    if (has("recurrence")) o.recurrence = parseRecurrence(b.recurrence, start);

    // project, task and people
    if (has("projectId")) {
        o.projectId = b.projectId || null;
        if (o.projectId) {
            if (!mongoose.isValidObjectId(o.projectId)) throw httpError(400, "Choose a project.");
            const p = await ProjectModel.findOne({ _id: o.projectId, isDeleted: false }).select("projectManager teamMembers").lean();
            if (!p) throw httpError(400, "Choose a project.");
            const member = idStr(p.projectManager) === me || (p.teamMembers || []).some((m) => idStr(m) === me);
            if (!member && !(await canManageProjects(req))) throw httpError(403, "You can only add events to projects you're on.");
        }
    }
    if (has("taskId")) {
        o.taskId = b.taskId || null;
        if (o.taskId && (!mongoose.isValidObjectId(o.taskId) || !(await taskModel.exists({ _id: o.taskId, $or: [{ assignedTo: me }, { createdBy: me }, { projectId: o.projectId ?? current.projectId ?? null }] })))) throw httpError(400, "Choose one of your tasks.");
    }
    if (has("assignee") || has("participants")) {
        const allowed = await allowedContactIds(me);
        const ok = (id) => id === me || allowed.has(id);
        if (has("assignee")) {
            o.assignee = b.assignee || null;
            if (o.assignee && (!mongoose.isValidObjectId(o.assignee) || !ok(idStr(o.assignee)))) throw httpError(400, "Choose someone you work with as the responsible person.");
        }
        if (has("participants")) {
            const ids = [...new Set((Array.isArray(b.participants) ? b.participants : []).map(idStr).filter((x) => mongoose.isValidObjectId(x)))].slice(0, 100);
            if (ids.some((x) => !ok(x))) throw httpError(400, "You can only invite people you work with.");
            const active = await employeeModel.countDocuments({ _id: { $in: ids }, status: "Active" });
            if (active !== ids.length) throw httpError(400, "One of the people isn't an active employee.");
            o.participants = ids;
        }
    }
    const type = o.eventType || current.eventType;
    if (PERSONAL_TYPES.includes(type)) {
        if ((o.projectId ?? current.projectId) || (o.taskId ?? current.taskId)) { o.projectId = null; o.taskId = null; }
    }
    return o;
};

// Overlapping events for the people involved — a warning, never a block.
const conflictsFor = async (ev, me) => {
    const people = recipientsOf(ev);
    const from = new Date(ev.start), to = new Date(ev.end);
    if (ev.allDay) return [];
    const others = await CalendarEventModel.find({
        _id: { $ne: ev._id }, status: "Scheduled", allDay: false,
        $or: [{ createdBy: { $in: people } }, { assignee: { $in: people } }, { participants: { $in: people } }],
        start: { $lte: to }, $and: [{ $or: [{ "recurrence.freq": { $ne: "none" } }, { end: { $gte: from } }] }],
    }).select("title start end recurrence exdates timezone").limit(200).lean();
    const out = [];
    for (const o of others) {
        const len = new Date(o.end) - new Date(o.start);
        const hit = occurrences(o, new Date(from.getTime() - len), to).find((s) => s < to && new Date(s.getTime() + len) > from);
        if (hit) out.push(`Overlaps “${o.title}” at ${hit.toISOString()}`);
        if (out.length >= 3) break;
    }
    return out;
};

const tellPeople = (ids, me, title, message, link) => ids.filter((id) => id && id !== me).forEach((id) => notify(id, title, message, "Calendar", link));

/* ---------------- calendar feed ---------------- */
// GET /calendar?from&to — everything I should see between two instants, one list.
export const calendarFeed = async (req, res) => {
    try {
        const me = idStr(req.user.id);
        const from = new Date(req.query.from), to = new Date(req.query.to);
        if (isNaN(from) || isNaN(to) || to < from) throw httpError(400, "Give a valid date range.");
        if (to - from > MAX_RANGE) throw httpError(400, "Ask for at most about a year at a time.");
        const projects = await myProjects(me);
        const pids = projects.map((p) => p._id);
        const led = projects.filter((p) => idStr(p.projectManager) === me).map((p) => p._id);
        const today = new Date(); today.setHours(0, 0, 0, 0);

        const [events, tasks, todos, holidays, leaves] = await Promise.all([
            CalendarEventModel.find({
                ...visibleFilter(me, pids), status: "Scheduled", start: { $lte: to },
                $and: [{ $or: [{ "recurrence.freq": "none", end: { $gte: from } }, { "recurrence.freq": { $ne: "none" }, $or: [{ "recurrence.until": null }, { "recurrence.until": { $gte: from } }] }] }],
            }).populate("projectId", "projectCode projectName").lean(),
            taskModel.find({ personal: { $ne: true }, closedAt: null, dueDate: { $gte: from, $lte: to }, $or: [{ assignedTo: me }, { createdBy: me }, { watchers: me }, { projectId: { $in: led } }] })
                .select("title status priority dueDate startDate projectId assignedTo taskNo").populate("projectId", "projectCode projectName").populate("assignedTo", "firstName lastName").lean(),
            taskModel.find({ personal: true, createdBy: me, dueDate: { $gte: from, $lte: to } }).select("title status priority dueDate").lean(),
            holidayModel.find({ date: { $gte: from, $lte: to } }).lean(),
            leaveModel.find({ employeeId: me, status: "Approved", fromDate: { $lte: to }, toDate: { $gte: from } }).select("leaveType fromDate toDate totalDays").lean(),
        ]);

        const items = [];
        for (const ev of events) {
            const len = new Date(ev.end) - new Date(ev.start);
            for (const s of occurrences(ev, new Date(from.getTime() - len), to)) {
                items.push({
                    key: `ev:${ev._id}:${s.getTime()}`, kind: "event", id: ev._id, occurrence: s, title: ev.title, start: s, end: new Date(s.getTime() + len), allDay: ev.allDay,
                    eventType: ev.eventType, priority: ev.priority, location: ev.location, project: ev.projectId ? { _id: ev.projectId._id, code: ev.projectId.projectCode, name: ev.projectId.projectName } : null,
                    recurring: ev.recurrence?.freq !== "none", done: (ev.completed || []).some((d) => new Date(d).getTime() === s.getTime()), personal: PERSONAL_TYPES.includes(ev.eventType),
                    mine: idStr(ev.createdBy) === me, link: eventLink(ev._id, s),
                });
            }
        }
        for (const t of tasks) {
            items.push({
                key: `task:${t._id}`, kind: "task", id: t._id, title: t.title, start: t.dueDate, end: t.dueDate, allDay: true, status: t.status, priority: t.priority, taskNo: t.taskNo,
                project: t.projectId ? { _id: t.projectId._id, code: t.projectId.projectCode, name: t.projectId.projectName } : null,
                assignee: t.assignedTo ? `${t.assignedTo.firstName} ${t.assignedTo.lastName || ""}`.trim() : "",
                overdue: t.status !== "Done" && new Date(t.dueDate) < today, link: t.projectId ? `/projects/${t.projectId._id}` : "/projects/my-tasks",
            });
        }
        for (const t of todos) items.push({ key: `todo:${t._id}`, kind: "todo", id: t._id, title: t.title, start: t.dueDate, end: t.dueDate, allDay: true, status: t.status, priority: t.priority, overdue: t.status !== "Done" && new Date(t.dueDate) < today, link: "/tasks" });
        for (const h of holidays) items.push({ key: `hol:${h._id}`, kind: "holiday", id: h._id, title: h.name, start: h.date, end: h.date, allDay: true, holidayType: h.type });
        for (const l of leaves) items.push({ key: `leave:${l._id}`, kind: "leave", id: l._id, title: l.leaveType, start: l.fromDate, end: l.toDate, allDay: true, link: "/leave" });
        items.sort((a, b) => new Date(a.start) - new Date(b.start));
        return res.status(200).json({ success: true, data: items });
    } catch (err) { return fail(res, err); }
};

/* ---------------- events ---------------- */
const populated = (id) => CalendarEventModel.findById(id).populate("createdBy assignee participants", PERSON).populate("projectId", "projectCode projectName").populate("taskId", "title taskNo").lean();

export const createEvent = async (req, res) => {
    try {
        const me = idStr(req.user.id);
        const data = await pickEvent(req, { reminders: [], recurrence: { freq: "none" }, ...req.body });
        if (!data.timezone) data.timezone = (await prefsOf(me)).timezone;
        if (!data.eventType) data.eventType = data.projectId ? "Project event" : "Meeting";
        const ev = await CalendarEventModel.create({ ...data, createdBy: me });
        await syncEventReminders(ev);
        const warnings = await conflictsFor(ev, me);
        tellPeople([idStr(ev.assignee), ...(ev.participants || []).map(idStr)], me, "You're invited", `“${ev.title}”`, eventLink(ev._id, ev.start));
        return res.status(201).json({ success: true, message: "Event saved.", data: await populated(ev._id), warnings });
    } catch (err) { return fail(res, err); }
};

export const getEvent = async (req, res) => {
    try {
        const { ev, canEdit, me } = await loadEvent(req, req.params.id);
        const mine = await ReminderModel.find({ eventId: ev._id, userId: me, dueAt: { $gte: new Date(Date.now() - 7 * 864e5) } }).sort({ dueAt: 1 }).limit(20).lean();
        return res.status(200).json({ success: true, data: await populated(ev._id), canEdit, myReminders: mine });
    } catch (err) { return fail(res, err); }
};

// The copy fields used when a series is split.
const seriesFields = (ev) => ({
    title: ev.title, description: ev.description, eventType: ev.eventType, priority: ev.priority, allDay: ev.allDay, timezone: ev.timezone, location: ev.location, link: ev.link,
    projectId: ev.projectId, taskId: ev.taskId, createdBy: ev.createdBy, assignee: ev.assignee, participants: ev.participants, reminders: ev.reminders, emailReminders: ev.emailReminders,
});

// PUT /calendar/events/:id { ...fields, scope: "all" | "one" | "future", occurrence }
export const updateEvent = async (req, res) => {
    try {
        const { ev, me, canEdit } = await loadEvent(req, req.params.id);
        if (!canEdit) throw httpError(403, "Only the organiser or the project lead can change this event.");
        if (ev.status === "Cancelled") throw httpError(409, "This event was cancelled.");
        const scope = ["one", "future", "all"].includes(req.body?.scope) ? req.body.scope : "all";
        const recurring = ev.recurrence?.freq && ev.recurrence.freq !== "none";
        const occ = req.body?.occurrence ? new Date(req.body.occurrence) : null;
        if (recurring && scope !== "all" && (!occ || isNaN(occ) || !occurrences(ev, occ, occ).length)) throw httpError(400, "Pick which occurrence to change.");
        const beforePeople = recipientsOf(ev), beforeStart = new Date(ev.start).getTime();
        let target = ev;

        if (recurring && scope === "one") {
            // that day becomes its own event; the series skips it
            const len = ev.end - ev.start;
            const from = req.body.start ? new Date(req.body.start) : occ;
            const data = await pickEvent(req, { start: occ, end: new Date(from.getTime() + len), ...req.body, recurrence: { freq: "none" } }, {});
            target = await CalendarEventModel.create({ ...seriesFields(ev), ...data, seriesId: ev._id, originalStart: occ });
            ev.exdates.push(occ); await ev.save(); await syncEventReminders(ev);
        } else if (recurring && scope === "future" && occ.getTime() !== beforeStart) {
            // the series ends before this occurrence; a new series carries on from it
            const len = ev.end - ev.start;
            const from = req.body.start ? new Date(req.body.start) : occ;
            const data = await pickEvent(req, { start: occ, end: new Date(from.getTime() + len), recurrence: { ...ev.recurrence.toObject(), count: null }, ...req.body }, {});
            ev.recurrence.until = new Date(occ.getTime() - 1000); ev.recurrence.count = null; await ev.save(); await syncEventReminders(ev);
            target = await CalendarEventModel.create({ ...seriesFields(ev), ...data, seriesId: ev._id });
        } else {
            // the whole event / series. Moving one occurrence of the series moves them all by the same amount.
            const body = { ...req.body };
            if (recurring && occ && body.start) {
                const shift = new Date(req.body.start) - occ;
                const length = req.body.end ? new Date(req.body.end) - new Date(req.body.start) : ev.end - ev.start;
                body.start = new Date(ev.start.getTime() + shift);
                body.end = new Date(body.start.getTime() + length);
            }
            Object.assign(ev, await pickEvent(req, body, ev));
            await ev.save();
        }
        await syncEventReminders(target);
        const after = recipientsOf(target);
        const added = after.filter((p) => !beforePeople.includes(p));
        tellPeople(added, me, "You're invited", `“${target.title}”`, eventLink(target._id, target.start));
        if (new Date(target.start).getTime() !== beforeStart || scope !== "all") tellPeople(after.filter((p) => !added.includes(p)), me, "Event time changed", `“${target.title}” was rescheduled.`, eventLink(target._id, target.start));
        return res.status(200).json({ success: true, message: "Event updated.", data: await populated(target._id), warnings: await conflictsFor(target, me) });
    } catch (err) { return fail(res, err); }
};

// DELETE /calendar/events/:id?scope=one|future|all&occurrence=ISO
export const deleteEvent = async (req, res) => {
    try {
        const { ev, me, canEdit } = await loadEvent(req, req.params.id);
        if (!canEdit) throw httpError(403, "Only the organiser or the project lead can cancel this event.");
        const scope = ["one", "future", "all"].includes(req.query.scope) ? req.query.scope : "all";
        const recurring = ev.recurrence?.freq && ev.recurrence.freq !== "none";
        const occ = req.query.occurrence ? new Date(req.query.occurrence) : null;
        if (recurring && scope !== "all" && (!occ || isNaN(occ))) throw httpError(400, "Pick which occurrence to remove.");
        if (recurring && scope === "one") ev.exdates.push(occ);
        else if (recurring && scope === "future" && occ.getTime() > new Date(ev.start).getTime()) { ev.recurrence.until = new Date(occ.getTime() - 1000); ev.recurrence.count = null; }
        else { ev.status = "Cancelled"; ev.cancelledAt = new Date(); }
        await ev.save();
        await syncEventReminders(ev);
        tellPeople(recipientsOf(ev), me, "Event cancelled", `“${ev.title}”${scope === "one" && occ ? " (one occurrence)" : ""} was cancelled.`, "/calendar");
        return res.status(200).json({ success: true, message: ev.status === "Cancelled" ? "Event cancelled." : "Removed from the series." });
    } catch (err) { return fail(res, err); }
};

export const duplicateEvent = async (req, res) => {
    try {
        const { ev, me } = await loadEvent(req, req.params.id);
        const copy = await CalendarEventModel.create({ ...seriesFields(ev), title: `${ev.title} (copy)`.slice(0, 160), start: ev.start, end: ev.end, recurrence: ev.recurrence, createdBy: me });
        await syncEventReminders(copy);
        return res.status(201).json({ success: true, message: "Event duplicated.", data: await populated(copy._id) });
    } catch (err) { return fail(res, err); }
};

// POST /calendar/events/:id/complete { occurrence, done }
export const completeEvent = async (req, res) => {
    try {
        const { ev, me, canEdit } = await loadEvent(req, req.params.id);
        const isAssignee = idStr(ev.assignee) === me;
        if (!canEdit && !isAssignee) throw httpError(403, "Only the organiser or the responsible person can mark this done.");
        const occ = req.body?.occurrence ? new Date(req.body.occurrence) : new Date(ev.start);
        if (!occurrences(ev, occ, occ).length) throw httpError(400, "That isn't one of this event's dates.");
        const done = req.body?.done !== false;
        const t = occ.getTime();
        ev.completed = (ev.completed || []).filter((d) => new Date(d).getTime() !== t);
        if (done) ev.completed.push(occ);
        await ev.save();
        if (done) await ReminderModel.updateMany({ eventId: ev._id, occurrence: occ, status: { $in: ["Pending", "Sent"] } }, { $set: { status: "Completed", acknowledgedAt: new Date(), lockedUntil: null } });
        else await syncEventReminders(ev);
        return res.status(200).json({ success: true, message: done ? "Marked done." : "Marked not done." });
    } catch (err) { return fail(res, err); }
};

// GET /calendar/events — the management list: filters + pages.
export const listEvents = async (req, res) => {
    try {
        const me = idStr(req.user.id);
        const pids = (await myProjects(me)).map((p) => p._id);
        const q = { ...visibleFilter(me, pids) };
        const and = [];
        if (req.query.q) and.push({ title: { $regex: String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").slice(0, 80), $options: "i" } });
        if (TYPES.includes(req.query.type)) and.push({ eventType: req.query.type });
        if (PRIORITIES.includes(req.query.priority)) and.push({ priority: req.query.priority });
        if (mongoose.isValidObjectId(req.query.project)) and.push({ projectId: req.query.project });
        if (req.query.owner === "me") and.push({ createdBy: me });
        and.push({ status: req.query.status === "Cancelled" ? "Cancelled" : "Scheduled" });
        if (req.query.from && !isNaN(new Date(req.query.from))) and.push({ $or: [{ end: { $gte: new Date(req.query.from) } }, { "recurrence.freq": { $ne: "none" } }] });
        if (req.query.to && !isNaN(new Date(req.query.to))) and.push({ start: { $lte: new Date(req.query.to) } });
        if (and.length) q.$and = and;
        const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 25));
        const page = Math.max(1, Number(req.query.page) || 1);
        const [rows, total] = await Promise.all([
            CalendarEventModel.find(q).sort({ start: -1 }).skip((page - 1) * limit).limit(limit).populate("createdBy", "firstName lastName").populate("participants", "firstName lastName profileImage").populate("projectId", "projectCode projectName").lean(),
            CalendarEventModel.countDocuments(q),
        ]);
        const stats = await ReminderModel.aggregate([{ $match: { eventId: { $in: rows.map((r) => r._id) } } }, { $group: { _id: { e: "$eventId", s: "$status" }, n: { $sum: 1 }, emailFailed: { $sum: { $cond: [{ $regexMatch: { input: "$delivery.email", regex: "^failed" } }, 1, 0] } } } }]);
        const by = {};
        stats.forEach((s) => { const k = idStr(s._id.e); by[k] = by[k] || { emailFailed: 0 }; by[k][s._id.s] = s.n; by[k].emailFailed += s.emailFailed; });
        return res.status(200).json({ success: true, data: rows.map((r) => ({ ...r, delivery: by[idStr(r._id)] || {} })), total, page, limit });
    } catch (err) { return fail(res, err); }
};

/* ---------------- reminders ---------------- */
// GET /reminders/due — my reminders that are due and not yet dealt with, plus today's plan.
// Delivers anything of mine that's due first, so the popup works even without a scheduler.
export const dueReminders = async (req, res) => {
    try {
        const me = idStr(req.user.id);
        await processDueReminders({ userId: req.user.id });
        const since = new Date(Date.now() - 864e5);
        const rows = await ReminderModel.find({ userId: me, status: "Sent", dueAt: { $gte: since, $lte: new Date() } }).sort({ dueAt: 1 }).limit(30).lean();
        const events = await CalendarEventModel.find({ _id: { $in: rows.map((r) => r.eventId) } }).select("title eventType priority location allDay projectId timezone start end").populate("projectId", "projectCode projectName").lean();
        const evById = new Map(events.map((e) => [idStr(e._id), e]));
        const data = rows.map((r) => {
            const e = evById.get(idStr(r.eventId));
            return e && { _id: r._id, eventId: r.eventId, occurrence: r.occurrence, dueAt: r.dueAt, offset: r.offset, title: e.title, eventType: e.eventType, priority: e.priority, location: e.location, allDay: e.allDay, project: e.projectId ? { code: e.projectId.projectCode, name: e.projectId.projectName } : null, link: eventLink(e._id, r.occurrence) };
        }).filter(Boolean);
        const prefs = await prefsOf(me);
        return res.status(200).json({ success: true, data, dailySummary: prefs.dailySummary, snoozeDefault: prefs.snoozeDefault });
    } catch (err) { return fail(res, err); }
};

const loadMyReminder = async (req) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw httpError(404, "Reminder not found.");
    const r = await ReminderModel.findOne({ _id: req.params.id, userId: req.user.id });
    if (!r) throw httpError(404, "Reminder not found.");
    return r;
};

// POST /reminders/:id/snooze { minutes } or { until } — the same reminder comes back later.
export const snoozeReminder = async (req, res) => {
    try {
        const r = await loadMyReminder(req);
        if (!["Sent", "Pending"].includes(r.status)) throw httpError(409, "This reminder is already dealt with.");
        const ev = await CalendarEventModel.findById(r.eventId).select("status").lean();
        if (!ev || ev.status === "Cancelled") throw httpError(409, "The event was cancelled.");
        const now = Date.now();
        const until = req.body?.until ? new Date(req.body.until) : new Date(now + (Number(req.body?.minutes) || 0) * 60000);
        if (isNaN(until) || until.getTime() < now + 60000) throw httpError(400, "Snooze for at least a minute.");
        if (until.getTime() > now + 14 * 864e5) throw httpError(400, "Snooze for at most 14 days.");
        await ReminderModel.updateOne({ _id: r._id, status: { $in: ["Sent", "Pending"] } }, { $set: { status: "Pending", dueAt: until, sentAt: null, lockedUntil: null }, $inc: { snoozeCount: 1 } });
        return res.status(200).json({ success: true, message: "Snoozed.", data: { dueAt: until } });
    } catch (err) { return fail(res, err); }
};

// POST /reminders/:id/ack { action: "dismiss" | "complete" }
export const acknowledgeReminder = async (req, res) => {
    try {
        const r = await loadMyReminder(req);
        const action = req.body?.action === "complete" ? "complete" : "dismiss";
        await ReminderModel.updateOne({ _id: r._id }, { $set: { status: action === "complete" ? "Completed" : "Dismissed", acknowledgedAt: new Date(), lockedUntil: null } });
        if (action === "complete") {
            // the organiser or responsible person completing it closes the occurrence for everyone
            const ev = await CalendarEventModel.findById(r.eventId);
            const me = idStr(req.user.id);
            if (ev && (idStr(ev.createdBy) === me || idStr(ev.assignee) === me)) {
                const t = new Date(r.occurrence).getTime();
                if (!(ev.completed || []).some((d) => new Date(d).getTime() === t)) { ev.completed.push(r.occurrence); await ev.save(); }
                await ReminderModel.updateMany({ eventId: ev._id, occurrence: r.occurrence, status: { $in: ["Pending", "Sent"] } }, { $set: { status: "Completed", acknowledgedAt: new Date(), lockedUntil: null } });
            }
        }
        return res.status(200).json({ success: true, message: action === "complete" ? "Marked done." : "Dismissed." });
    } catch (err) { return fail(res, err); }
};

/* ---------------- preferences ---------------- */
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const getNotificationPrefs = async (req, res) => {
    try { return res.status(200).json({ success: true, data: await prefsOf(req.user.id), emailAvailable: !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) }); }
    catch (err) { return fail(res, err); }
};
export const updateNotificationPrefs = async (req, res) => {
    try {
        const b = req.body || {};
        const o = {};
        for (const k of ["inApp", "email", "dailySummary"]) if (b[k] !== undefined) o[k] = !!b[k];
        if (b.timezone !== undefined) { if (!validTimeZone(b.timezone)) throw httpError(400, "That time zone isn't recognised."); o.timezone = b.timezone; }
        if (b.defaultReminder !== undefined) { const n = Number(b.defaultReminder); if (!REMINDER_CHOICES.includes(n)) throw httpError(400, "Pick a default reminder time."); o.defaultReminder = n; }
        if (b.snoozeDefault !== undefined) { const n = Number(b.snoozeDefault); if (![5, 10, 30, 60].includes(n)) throw httpError(400, "Pick a default snooze."); o.snoozeDefault = n; }
        for (const k of ["quietStart", "quietEnd"]) if (b[k] !== undefined) { if (b[k] && !HHMM.test(b[k])) throw httpError(400, "Quiet hours use HH:MM."); o[k] = b[k] || ""; }
        if (Array.isArray(b.muted)) o.muted = b.muted.filter((x) => ["Reminder", "Task", "Project", "Calendar"].includes(x));
        const data = await NotificationPrefModel.findOneAndUpdate({ employeeId: req.user.id }, { $set: o, $setOnInsert: { employeeId: req.user.id } }, { new: true, upsert: true }).lean();
        return res.status(200).json({ success: true, message: "Notification settings saved.", data: { ...PREF_DEFAULTS, ...data } });
    } catch (err) { return fail(res, err); }
};

/* ---------------- cron ---------------- */
// GET /cron/reminders — for Vercel Cron or any external scheduler; needs "Authorization: Bearer <CRON_SECRET>".
export const cronReminders = async (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (!secret) return res.status(503).json({ success: false, message: "CRON_SECRET is not set" });
    if (req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ success: false, message: "Unauthorized" });
    try { return res.status(200).json({ success: true, data: await runReminderJobs({ force: req.query.full === "1" }) }); }
    catch (err) { return fail(res, err); }
};
