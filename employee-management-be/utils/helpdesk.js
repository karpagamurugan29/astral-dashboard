import mongoose from "mongoose";
import ticketModel, { TICKET_PRIORITIES } from "../models/ticketModel.js";
import CompanySettings from "../models/CompanySettingsModel.js";
import employeeModel from "../models/employeeModel.js";
import { notify } from "./notify.js";
import { scopeOf, visibleIds, stepOf } from "./hierarchy.js";
import { getAccess } from "./access.js";

/* --------------------------------------------------------------------------
   HR helpdesk rules — one place for who may see and do what with a ticket.

   - Owner      the employee who raised it: reply, withdraw, confirm / reopen, feedback.
   - Desk       Admin and HR (helpdesk module on): every ticket — assign, triage, any valid move.
   - Assignee   whoever the ticket is assigned to: work it through to Resolved.
   - Supervisor managers / leads (helpdesk module on) for their own team's tickets, and firm-wide
                seniors for everyone's: comment, ask for information, escalate to HR.
                Confidential categories (pay, workplace issues) are desk + assignee only.
   Internal notes are visible to staff only — never to the owner, even when the owner is HR.
   -------------------------------------------------------------------------- */

export const ACTIVE = ["Open", "Assigned", "In Progress", "Pending Employee", "Pending HR", "Escalated", "Reopened"];
export const FINAL = ["Closed", "Rejected"];

export const DEFAULT_CATEGORIES = [
    { key: "payroll", name: "Payroll and Salary", icon: "mdi-cash-multiple", color: "#059669", confidential: true, hint: "Salary, payslips, deductions, tax" },
    { key: "attendance", name: "Attendance and Timesheets", icon: "mdi-clock-outline", color: "#0d9488", hint: "Check-ins, corrections, timesheets" },
    { key: "leave", name: "Leave and Holidays", icon: "mdi-beach", color: "#0284c7", hint: "Balances, approvals, holiday list" },
    { key: "benefits", name: "Employee Benefits", icon: "mdi-heart-pulse", color: "#e11d48", hint: "Insurance, reimbursements, perks" },
    { key: "documents", name: "Employee Documents and Letters", icon: "mdi-file-document-outline", color: "#4f46e5", hint: "Letters, certificates, records" },
    { key: "onboarding", name: "Onboarding and Offboarding", icon: "mdi-account-switch-outline", color: "#7c3aed", hint: "Joining, exit, handover, F&F" },
    { key: "workplace", name: "Workplace Issues", icon: "mdi-account-alert-outline", color: "#dc2626", confidential: true, hint: "Concerns about conduct or environment" },
    { key: "it", name: "IT and System Access", icon: "mdi-laptop", color: "#2563eb", hint: "Laptop, accounts, app access" },
    { key: "policy", name: "Policy and Compliance", icon: "mdi-book-open-variant", color: "#d97706", hint: "Rules, policies, compliance" },
    { key: "other", name: "Other HR Queries", icon: "mdi-help-circle-outline", color: "#64748b", hint: "Anything else" },
].map((c, i) => ({ active: true, confidential: false, defaultAssignee: null, sla: {}, order: i, ...c }));

// categories used before the helpdesk was rebuilt
export const LEGACY_CATEGORY = { Payroll: "Payroll and Salary", Leave: "Leave and Holidays", "IT Support": "IT and System Access", "HR Policy": "Policy and Compliance", Attendance: "Attendance and Timesheets", Other: "Other HR Queries" };

export const DEFAULT_SETTINGS = {
    categories: DEFAULT_CATEGORIES,
    // hours: first response / resolution
    sla: { Critical: { response: 1, resolution: 8 }, High: { response: 4, resolution: 24 }, Medium: { response: 8, resolution: 48 }, Low: { response: 24, resolution: 96 } },
    attachments: { maxSizeMB: 5, maxFiles: 5, types: ["pdf", "png", "jpg", "jpeg", "gif", "webp", "doc", "docx", "xls", "xlsx", "csv", "txt"] },
    reopenDays: 7, // employee may reopen within this many days of resolution
    maxReopens: 3,
    autoCloseDays: 5, // resolved tickets close by themselves after this many days without a reply
    reminderAt: 0.75, // remind the assignee once this share of the resolution window has passed
    autoEscalate: true, // escalate overdue tickets, and critical ones nobody has answered in time
};

let cache = null;
export const invalidateHelpdeskSettings = () => { cache = null; };
export const settingsDoc = async () => (await CompanySettings.findOne()) || (await CompanySettings.create({ companyName: "Astral Consulting Limited" }));
export const helpdeskSettings = async () => {
    if (cache && cache.at > Date.now() - 30000) return cache.value;
    const saved = (await CompanySettings.findOne().select("helpdesk").lean())?.helpdesk || {};
    const value = {
        ...DEFAULT_SETTINGS,
        ...saved,
        sla: Object.fromEntries(TICKET_PRIORITIES.map((p) => [p, { ...DEFAULT_SETTINGS.sla[p], ...(saved.sla?.[p] || {}) }])),
        attachments: { ...DEFAULT_SETTINGS.attachments, ...(saved.attachments || {}) },
        categories: (saved.categories?.length ? saved.categories : DEFAULT_CATEGORIES).map((c, i) => ({ active: true, confidential: false, sla: {}, order: i, ...c })).sort((a, b) => a.order - b.order),
    };
    cache = { at: Date.now(), value };
    return value;
};
export const categoryOf = (settings, name) => settings.categories.find((c) => c.name === name) || null;

/* ---------------- who is asking ---------------- */

// desk = Admin, or HR staff with the helpdesk module; mod = may use staff screens at all
export const helpdeskCtx = async (req) => {
    if (req._helpdesk) return req._helpdesk;
    const scope = await scopeOf(req);
    let mod = scope.role === "Admin";
    if (!mod) {
        const access = await getAccess(req.user);
        mod = !(access.denied || []).includes("helpdesk") && ((access.roleAllow || []).includes("helpdesk") || (access.granted || []).includes("helpdesk"));
    }
    const hrReach = scope.role === "HR" || stepOf(scope.designation)?.reach === "people";
    const desk = scope.role === "Admin" || (hrReach && mod);
    const ids = visibleIds(scope, "people");
    req._helpdesk = { me: scope.me, scope, desk, mod, visible: ids ? new Set(ids.map(String)) : null };
    return req._helpdesk;
};

const idOf = (v) => String(v?._id || v || "");

// owner | desk | assignee | supervisor | null
export const relationTo = (t, ctx, settings) => {
    if (idOf(t.employeeId) === ctx.me) return "owner";
    if (ctx.desk) return "desk";
    if (t.assignedTo && idOf(t.assignedTo) === ctx.me) return "assignee";
    const cat = categoryOf(settings, t.category);
    if (ctx.mod && !cat?.confidential && (ctx.visible === null || ctx.visible.has(idOf(t.employeeId)))) return "supervisor";
    return null;
};

// Mongo filter for tickets someone may see in the staff queue (never their own)
export const queueFilter = (ctx, settings) => {
    const notMine = { employeeId: { $ne: new mongoose.Types.ObjectId(ctx.me) } };
    if (ctx.desk) return notMine;
    const open = settings.categories.filter((c) => !c.confidential).map((c) => c.name);
    const or = [{ assignedTo: new mongoose.Types.ObjectId(ctx.me) }];
    if (ctx.mod) {
        const team = ctx.visible === null ? {} : { employeeId: { $in: [...ctx.visible].filter((x) => x !== ctx.me).map((x) => new mongoose.Types.ObjectId(x)) } };
        or.push({ ...team, category: { $in: open } });
    }
    return { ...notMine, $or: or };
};

/* ---------------- transitions ---------------- */

const DESK = {
    Open: ["In Progress", "Pending Employee", "Escalated", "Resolved", "Rejected"],
    Assigned: ["In Progress", "Pending Employee", "Escalated", "Resolved", "Rejected"],
    "In Progress": ["Pending Employee", "Escalated", "Resolved", "Rejected"],
    "Pending Employee": ["In Progress", "Escalated", "Resolved", "Closed"],
    "Pending HR": ["In Progress", "Pending Employee", "Escalated", "Resolved", "Rejected"],
    Escalated: ["In Progress", "Pending Employee", "Resolved", "Rejected"],
    Reopened: ["In Progress", "Pending Employee", "Escalated", "Resolved", "Rejected"],
    Resolved: ["Closed", "Reopened"],
    Closed: ["Reopened"],
    Rejected: ["Reopened"],
};
const ASSIGNEE_BLOCKED = ["Rejected", "Closed"];

// what each move needs from the person making it
export const MOVE = {
    "In Progress": { label: "Start work", icon: "mdi-play-outline" },
    "Pending Employee": { label: "Ask employee", icon: "mdi-account-question-outline", needs: "Question for the employee" },
    Escalated: { label: "Escalate", icon: "mdi-arrow-up-bold-outline", needs: "Why it needs escalating" },
    Resolved: { label: "Resolve", icon: "mdi-check-circle-outline", needs: "Resolution — what was done" },
    Rejected: { label: "Reject", icon: "mdi-close-octagon-outline", needs: "Reason for rejecting" },
    Closed: { label: "Close", icon: "mdi-lock-outline" },
    Reopened: { label: "Reopen", icon: "mdi-restore", needs: "Why it needs reopening" },
};

const canReopenAsOwner = (t, settings) => {
    if (!t.resolvedAt || t.status === "Rejected") return false;
    if ((t.reopenCount || 0) >= settings.maxReopens) return false;
    return Date.now() - new Date(t.resolvedAt).getTime() <= settings.reopenDays * 864e5;
};

// [{ to, label, icon, needs, tone }]
export const allowedMoves = (t, relation, settings) => {
    let to = [];
    if (relation === "desk") to = DESK[t.status] || [];
    else if (relation === "assignee") to = (DESK[t.status] || []).filter((s) => !ASSIGNEE_BLOCKED.includes(s) && s !== "Reopened");
    else if (relation === "supervisor") to = ACTIVE.includes(t.status) ? ["Pending Employee", "Escalated"].filter((s) => s !== t.status) : [];
    else if (relation === "owner") {
        if (ACTIVE.includes(t.status)) to = ["Closed"];
        else if (t.status === "Resolved") to = ["Closed", ...(canReopenAsOwner(t, settings) ? ["Reopened"] : [])];
        else if (t.status === "Closed" && canReopenAsOwner(t, settings)) to = ["Reopened"];
    }
    return to.map((s) => {
        const m = { to: s, ...MOVE[s] };
        if (relation === "owner" && s === "Closed") Object.assign(m, t.status === "Resolved" ? { label: "Confirm & close", icon: "mdi-check-all" } : { label: "Withdraw", icon: "mdi-undo-variant", needs: "Reason (optional)", optional: true });
        if (relation !== "owner" && s === "Closed" && t.status === "Pending Employee") Object.assign(m, { label: "Close — no reply", needs: "Closing note for the employee" });
        return m;
    });
};

/* ---------------- SLA ---------------- */

export const slaTargets = (settings, priority, category) => {
    const base = settings.sla[priority] || settings.sla.Medium;
    const over = Number(categoryOf(settings, category)?.sla?.[priority]);
    return { response: Number(base.response) || 8, resolution: over > 0 ? over : Number(base.resolution) || 48 };
};
export const setDueDates = (t, settings) => {
    const { response, resolution } = slaTargets(settings, t.priority, t.category);
    const start = new Date(t.createdAt || Date.now()).getTime();
    t.responseDueAt = new Date(start + response * 36e5);
    t.dueAt = new Date(start + resolution * 36e5 + (t.pausedMs || 0));
};
// pause while waiting on the employee; resume pushes the due date out by the time paused
export const pauseClock = (t, nextStatus) => {
    if (nextStatus === "Pending Employee" && !t.pausedAt) t.pausedAt = new Date();
    else if (nextStatus !== "Pending Employee" && t.pausedAt) {
        const ms = Date.now() - new Date(t.pausedAt).getTime();
        t.pausedMs = (t.pausedMs || 0) + ms;
        if (t.dueAt) t.dueAt = new Date(new Date(t.dueAt).getTime() + ms);
        t.pausedAt = null;
    }
};

const mins = (a, b) => (a && b ? Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000)) : null);
export const slaOf = (t, settings) => {
    const now = Date.now();
    const done = t.resolvedAt && !ACTIVE.includes(t.status);
    const due = t.dueAt ? new Date(t.dueAt).getTime() : null;
    const resolution = slaTargets(settings, t.priority, t.category).resolution * 36e5;
    let state = "none";
    if (t.status === "Rejected") state = "none";
    else if (done) state = due && new Date(t.resolvedAt).getTime() > due ? "breached" : "met";
    else if (t.pausedAt) state = "paused";
    else if (due) state = now > due ? "overdue" : due - now <= resolution * (1 - settings.reminderAt) ? "due-soon" : "on-track";
    return {
        state,
        dueAt: t.dueAt,
        responseDueAt: t.responseDueAt,
        responseBreached: t.responseDueAt ? (t.firstResponseAt ? new Date(t.firstResponseAt) > new Date(t.responseDueAt) : now > new Date(t.responseDueAt).getTime() && ACTIVE.includes(t.status)) : false,
        firstResponseMins: mins(t.createdAt, t.firstResponseAt),
        resolutionMins: mins(t.createdAt, t.resolvedAt),
    };
};

/* ---------------- numbering, people, backfill ---------------- */

export const nextTicketNo = async () => {
    const year = new Date().getFullYear();
    const c = await mongoose.connection.db.collection("counters").findOneAndUpdate({ _id: `ticket-${year}` }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: "after" });
    const seq = (c?.value ?? c)?.seq || 1;
    return `HD-${year}-${String(seq).padStart(4, "0")}`;
};

// HR desk people who hear about new and escalated tickets
export const deskPeople = async (except = null) => {
    const people = await employeeModel.find({ status: "Active", $or: [{ role: "HR" }, { designation: { $in: ["HR Head", "HR Manager", "HR Executive", "HR"] } }] }).select("_id").lean();
    const ids = people.map((p) => String(p._id)).filter((id) => id !== String(except || ""));
    if (ids.length) return ids;
    return (await employeeModel.find({ status: "Active", role: "Admin" }).select("_id").lean()).map((p) => String(p._id)).filter((id) => id !== String(except || ""));
};
export const tell = (ids, title, message, t) => [...new Set(ids.filter(Boolean).map(String))].forEach((id) => notify(id, title, message, "Ticket", `/helpdesk/t/${t._id}`));

// Older tickets: number them, map old category names, add a "created" entry and due dates.
let backfilled = false;
export const ensureTicketBackfill = async () => {
    if (backfilled) return;
    backfilled = true;
    try {
        const settings = await helpdeskSettings();
        const old = await ticketModel.find({ $or: [{ ticketNo: { $exists: false } }, { ticketNo: null }, { category: { $in: Object.keys(LEGACY_CATEGORY) } }, { dueAt: null }] }).sort({ createdAt: 1 });
        for (const t of old) {
            if (!t.ticketNo) t.ticketNo = await nextTicketNo();
            if (LEGACY_CATEGORY[t.category]) t.category = LEGACY_CATEGORY[t.category];
            if (!t.history?.length) t.history.push({ at: t.createdAt, by: t.employeeId, action: "created", to: t.status === "Open" ? "Open" : "Open", note: "" });
            if (!t.dueAt) setDueDates(t, settings);
            if (t.assignedTo && !t.assignedAt) t.assignedAt = t.createdAt;
            if (["Resolved", "Closed"].includes(t.status) && !t.resolvedAt) t.resolvedAt = t.updatedAt;
            if (t.status === "Closed" && !t.closedAt) t.closedAt = t.updatedAt;
            if (t.status !== "Open" && !t.firstResponseAt) t.firstResponseAt = t.updatedAt;
            t.lastActivityAt = t.updatedAt || t.createdAt;
            await t.save();
        }
    } catch (err) {
        backfilled = false;
        console.error("Helpdesk backfill failed:", err.message);
    }
};

/* ---------------- the SLA job ---------------- */

// Reminders before the due time, breach marking + escalation after it, and auto-close of
// resolved tickets nobody replied to. Runs on a timer locally and lazily on reads (Vercel).
let lastRun = 0;
export const runHelpdeskSla = async ({ force = false } = {}) => {
    if (!force && Date.now() - lastRun < 5 * 60000) return null;
    lastRun = Date.now();
    const settings = await helpdeskSettings();
    const now = new Date();
    const out = { reminded: 0, breached: 0, escalated: 0, autoClosed: 0 };
    const desk = await deskPeople();
    const escalate = (t, why) => {
        if (!settings.autoEscalate || t.status === "Escalated") return;
        t.history.push({ at: now, by: null, action: "status", from: t.status, to: "Escalated", note: why, internal: true });
        t.status = "Escalated"; t.escalationLevel = (t.escalationLevel || 0) + 1; t.escalatedAt = now;
        out.escalated++;
        tell([...desk, t.assignedTo], `Escalated: ${t.ticketNo}`, `${t.subject} — ${why}`, t);
    };

    const active = await ticketModel.find({ status: { $in: ACTIVE.filter((s) => s !== "Pending Employee") }, dueAt: { $ne: null } });
    for (const t of active) {
        let dirty = false;
        const due = new Date(t.dueAt).getTime();
        const window = slaTargets(settings, t.priority, t.category).resolution * 36e5;
        if (!t.breachedAt && now.getTime() > due) {
            t.breachedAt = now; dirty = true; out.breached++;
            t.history.push({ at: now, by: null, action: "sla", to: "Overdue", note: "Resolution target missed", internal: true });
            tell(t.assignedTo ? [t.assignedTo] : desk, `Overdue: ${t.ticketNo}`, `${t.subject} has passed its resolution target.`, t);
            escalate(t, "Overdue — resolution target missed");
        } else if (!t.reminderSentAt && !t.breachedAt && due - now.getTime() <= window * (1 - settings.reminderAt)) {
            t.reminderSentAt = now; dirty = true; out.reminded++;
            const left = Math.max(1, Math.round((due - now.getTime()) / 36e5));
            tell(t.assignedTo ? [t.assignedTo] : desk, `Due soon: ${t.ticketNo}`, `${t.subject} is due in about ${left}h.`, t);
        }
        if (t.priority === "Critical" && !t.firstResponseAt && t.responseDueAt && now > t.responseDueAt && t.status !== "Escalated") {
            escalate(t, "Critical ticket not answered within the response target"); dirty = true;
        }
        if (dirty) await t.save();
    }

    if (settings.autoCloseDays > 0) {
        const stale = await ticketModel.find({ status: "Resolved", resolvedAt: { $lt: new Date(now.getTime() - settings.autoCloseDays * 864e5) } });
        for (const t of stale) {
            t.history.push({ at: now, by: null, action: "status", from: "Resolved", to: "Closed", note: `Closed automatically ${settings.autoCloseDays} days after resolution` });
            t.status = "Closed"; t.closedAt = now; t.lastActivityAt = now;
            await t.save(); out.autoClosed++;
            tell([t.employeeId], `Ticket closed: ${t.ticketNo}`, `"${t.subject}" was closed automatically. Raise a new ticket if you still need help.`, t);
        }
    }
    return out;
};

export const startHelpdeskScheduler = (ensureDb = async () => {}) => {
    const tick = async () => {
        try { await ensureDb(); await ensureTicketBackfill(); await runHelpdeskSla({ force: true }); } catch (err) { console.error("Helpdesk SLA job failed:", err.message); }
    };
    setTimeout(tick, 20000);
    return setInterval(tick, 10 * 60000);
};
