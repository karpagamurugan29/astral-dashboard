import mongoose from "mongoose";
import AuditEngagementModel from "../models/auditEngagementModel.js";
import AuditTimeLogModel from "../models/auditTimeLogModel.js";
import AuditProjectModel from "../models/auditProjectModel.js";
import employeeModel from "../models/employeeModel.js";
import leaveModel from "../models/leaveModel.js";
import { PERSON } from "../utils/auditShared.js";
import { auditAccess, isAuditLeader, isFinance, visibleAuditFilter, canCreateAudits, idStr } from "../utils/auditAccess.js";
import { normalizeTasks, allowedActions, DONE } from "../utils/auditTasks.js";
import { canSeeMoney } from "../utils/money.js";
import { scopeOf } from "../utils/hierarchy.js";
import { ensureTimesheetBackfill, weekOf } from "./timesheet.controller.js";

/* My Work (employee), Work allocation (managers) and the audit management dashboard with
   productivity analytics. Everything is computed from recorded tasks and time; the formulas are
   returned with the numbers so the screens can explain them. */

const httpError = (status, message) => Object.assign(new Error(message), { status });
const fail = (res, err) => res.status(err.status || 500).json({ success: false, message: err.message });
const TZ = () => process.env.COMPANY_TIMEZONE || "Asia/Kolkata";
const ymd = (d) => new Date(d).toLocaleDateString("en-CA", { timeZone: TZ() });
const DAY = 864e5;
const HOURS_PER_DAY = Number(process.env.WORK_HOURS_PER_DAY) || 8;
const mins = (l, now = Date.now()) => (l.endTime ? l.durationMinutes || 0 : Math.max(0, Math.round((now - new Date(l.startTime)) / 60000)));
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");
const r1 = (n) => Math.round(n * 10) / 10;
const OPEN_WORK = ["Assigned", "Ready", "In Progress", "Blocked", "Changes Requested", "Not Started"];

// working days (Mon–Fri) in [from, to], minus approved leave
const capacityHours = (from, to, leaves = []) => {
    let days = 0;
    for (let t = new Date(`${from}T12:00:00Z`).getTime(); t <= new Date(`${to}T12:00:00Z`).getTime(); t += DAY) {
        const d = new Date(t); const dow = d.getUTCDay(); const k = d.toISOString().slice(0, 10);
        if (dow === 0 || dow === 6) continue;
        if (leaves.some((l) => ymd(l.fromDate) <= k && ymd(l.toDate) >= k)) continue;
        days++;
    }
    return days * HOURS_PER_DAY;
};
const tasksWithContext = (audits) => audits.flatMap((a) => (a.milestones || []).map((t) => ({ t, a })));

/* ---------------- My Work ---------------- */

// GET /audit-work/me?clientId&projectId&status&priority&due=overdue|today|week
export const myWork = async (req, res) => {
    try {
        await ensureTimesheetBackfill();
        const me = req.user.id;
        const oMe = new mongoose.Types.ObjectId(me);
        const audits = await AuditEngagementModel.find({ isDeleted: false, $or: [{ auditManager: oMe }, { teamMembers: oMe }, { "milestones.assignee": oMe }, { "milestones.reviewer": oMe }] })
            .select("auditCode clientName clientId projectId engagementName auditType status endDate auditManager teamMembers milestones")
            .populate("projectId", "name projectCode").populate("milestones.assignee milestones.reviewer", PERSON).lean();
        const today = ymd(new Date());
        const weekEnd = ymd(new Date(Date.now() + 7 * DAY));
        const q = req.query;
        const tasks = [], reviews = [];
        for (const a of audits) {
            normalizeTasks(a.milestones || []);
            const access = await auditAccess(req, a);
            for (const t of a.milestones || []) {
                const row = () => ({
                    auditId: a._id, auditCode: a.auditCode, clientName: a.clientName, clientId: a.clientId, project: a.projectId, engagement: a.engagementName || `${a.auditType} audit`,
                    key: t.key, label: t.label, stage: t.stage, status: t.status, priority: t.priority, dueDate: t.dueDate, plannedStart: t.plannedStart, estimatedHours: t.estimatedHours,
                    assignee: t.assignee, reviewer: t.reviewer, requiresReview: t.requiresReview, location: t.location, reviewCycles: t.reviewCycles, submittedAt: t.submittedAt,
                    lastReview: [...(t.comments || [])].reverse().find((c) => c.kind === "review")?.text || "",
                    overdue: !!t.dueDate && !DONE.includes(t.status) && t.status !== "Cancelled" && ymd(t.dueDate) < today,
                    actions: allowedActions(t, a.milestones, access),
                });
                if (idStr(t.assignee?._id || t.assignee) === me && (OPEN_WORK.includes(t.status) || ["Submitted", "Under Review"].includes(t.status) || (DONE.includes(t.status) && t.doneAt && Date.now() - new Date(t.doneAt) < 14 * DAY))) tasks.push(row());
                const reviewer = t.reviewer ? idStr(t.reviewer?._id || t.reviewer) === me : idStr(a.auditManager) === me && t.requiresReview;
                if (reviewer && ["Submitted", "Under Review"].includes(t.status) && idStr(t.assignee?._id || t.assignee) !== me) reviews.push(row());
            }
        }
        const filt = (x) => (!q.clientId || String(x.clientId) === q.clientId) && (!q.projectId || String(x.project?._id || "") === q.projectId)
            && (!q.status || (q.status === "open" ? !DONE.includes(x.status) && x.status !== "Cancelled" : x.status === q.status)) && (!q.priority || x.priority === q.priority)
            && (!q.due || (q.due === "overdue" ? x.overdue : q.due === "today" ? x.dueDate && ymd(x.dueDate) <= today && !DONE.includes(x.status) : x.dueDate && ymd(x.dueDate) <= weekEnd && !DONE.includes(x.status)));
        const PR = { Critical: 0, High: 1, Medium: 2, Low: 3 };
        const sorter = (x, y) => (x.overdue === y.overdue ? 0 : x.overdue ? -1 : 1) || (DONE.includes(x.status) - DONE.includes(y.status)) || ((x.dueDate ? new Date(x.dueDate) : Infinity) - (y.dueDate ? new Date(y.dueDate) : Infinity)) || (PR[x.priority] - PR[y.priority]);
        const week = weekOf(today);
        const logs = await AuditTimeLogModel.find({ employeeId: oMe, workDate: { $gte: week } }).select("workDate durationMinutes endTime startTime status auditId milestoneLabel").lean();
        const open = tasks.filter((x) => !DONE.includes(x.status));
        return res.status(200).json({
            success: true,
            data: {
                tasks: tasks.filter(filt).sort(sorter), reviews: reviews.sort((x, y) => new Date(x.submittedAt || 0) - new Date(y.submittedAt || 0)),
                companies: [...new Map(audits.map((a) => [String(a.clientId), { _id: a.clientId, name: a.clientName }])).values()],
                projects: [...new Map(audits.filter((a) => a.projectId).map((a) => [String(a.projectId._id), a.projectId])).values()],
                stats: {
                    open: open.length, overdue: open.filter((x) => x.overdue).length, dueToday: open.filter((x) => x.dueDate && ymd(x.dueDate) === today).length,
                    blocked: open.filter((x) => x.status === "Blocked").length, changesRequested: open.filter((x) => x.status === "Changes Requested").length,
                    inReview: tasks.filter((x) => ["Submitted", "Under Review"].includes(x.status)).length, toReview: reviews.length,
                    todayMinutes: logs.filter((l) => l.workDate === today).reduce((t, l) => t + mins(l), 0),
                    weekMinutes: logs.reduce((t, l) => t + mins(l), 0),
                    timesheet: { draft: logs.filter((l) => ["Draft", "Rejected"].includes(l.status)).length, rejected: logs.filter((l) => l.status === "Rejected").length, submitted: logs.filter((l) => l.status === "Submitted").length, approved: logs.filter((l) => l.status === "Approved").length, week },
                },
            },
        });
    } catch (err) { return fail(res, err); }
};

/* ---------------- Work allocation ---------------- */

const managedAudits = async (req, extra = {}) => {
    if (await isAuditLeader(req)) return AuditEngagementModel.find({ isDeleted: false, status: { $nin: ["Completed", "Cancelled"] }, ...extra });
    const s = await scopeOf(req);
    const projects = await AuditProjectModel.find({ isDeleted: false, $or: [{ manager: s.me }, { partner: s.me }] }).distinct("_id");
    return AuditEngagementModel.find({ isDeleted: false, status: { $nin: ["Completed", "Cancelled"] }, $or: [{ auditManager: s.me }, { projectId: { $in: projects } }], ...extra });
};

// GET /audit-work/allocation?clientId&projectId&auditId&days=14
export const allocation = async (req, res) => {
    try {
        if (!(await canCreateAudits(req))) throw httpError(403, "Work allocation is for managers and audit leadership.");
        const extra = {};
        ["clientId", "projectId"].forEach((k) => { if (mongoose.isValidObjectId(req.query[k])) extra[k] = req.query[k]; });
        if (mongoose.isValidObjectId(req.query.auditId)) extra._id = req.query.auditId;
        const audits = await (await managedAudits(req, extra)).map((a) => a); // docs
        const plain = audits.map((a) => a.toObject());
        plain.forEach((a) => normalizeTasks(a.milestones || []));
        const horizon = Math.min(60, Math.max(7, Number(req.query.days) || 14));
        const today = ymd(new Date());
        const until = ymd(new Date(Date.now() + (horizon - 1) * DAY));
        const peopleIds = [...new Set(plain.flatMap((a) => [a.auditManager, ...(a.teamMembers || []), ...(a.milestones || []).flatMap((t) => [t.assignee, t.reviewer])]).filter(Boolean).map(String))];
        const [people, leaves, logs, elsewhere] = await Promise.all([
            employeeModel.find({ _id: { $in: peopleIds }, status: "Active" }).select(`${PERSON} manager`).lean(),
            leaveModel.find({ employeeId: { $in: peopleIds }, status: "Approved", toDate: { $gte: new Date(`${today}T00:00:00`) }, fromDate: { $lte: new Date(`${until}T23:59:59`) } }).select("employeeId fromDate toDate").lean(),
            AuditTimeLogModel.find({ employeeId: { $in: peopleIds }, workDate: { $gte: weekOf(today) } }).select("employeeId auditId milestoneKey durationMinutes endTime startTime").lean(),
            // their open work on engagements outside this view (counted, not shown)
            AuditEngagementModel.find({ isDeleted: false, status: { $nin: ["Completed", "Cancelled"] }, _id: { $nin: plain.map((a) => a._id) }, "milestones.assignee": { $in: peopleIds } }).select("milestones.assignee milestones.status milestones.estimatedHours milestones.dueDate").lean(),
        ]);
        const loggedOnTask = new Map();
        const allTaskLogs = await AuditTimeLogModel.aggregate([{ $match: { auditId: { $in: plain.map((a) => a._id) }, milestoneKey: { $ne: "" } } }, { $group: { _id: { a: "$auditId", k: "$milestoneKey" }, m: { $sum: "$durationMinutes" } } }]);
        allTaskLogs.forEach((x) => loggedOnTask.set(`${x._id.a}|${x._id.k}`, x.m));
        const rows = people.map((p) => {
            const id = String(p._id);
            const mine = tasksWithContext(plain).filter(({ t }) => idStr(t.assignee) === id && !DONE.includes(t.status) && t.status !== "Cancelled");
            const remaining = (t, a) => Math.max(0, (t.estimatedHours || 0) - (loggedOnTask.get(`${a._id}|${t.key}`) || 0) / 60);
            const dueSoon = mine.filter(({ t }) => !t.dueDate || ymd(t.dueDate) <= until);
            const other = elsewhere.flatMap((a) => (a.milestones || []).filter((t) => idStr(t.assignee) === id && !["Approved", "Completed", "Cancelled"].includes(t.status)));
            const plannedHours = dueSoon.reduce((h, { t, a }) => h + remaining(t, a), 0) + other.filter((t) => !t.dueDate || ymd(t.dueDate) <= until).reduce((h, t) => h + (t.estimatedHours || 0), 0);
            const cap = capacityHours(today, until, leaves.filter((l) => String(l.employeeId) === id));
            return {
                person: p,
                openTasks: mine.length, overdue: mine.filter(({ t }) => t.dueDate && ymd(t.dueDate) < today).length, blocked: mine.filter(({ t }) => t.status === "Blocked").length,
                remainingHours: r1(mine.reduce((h, { t, a }) => h + remaining(t, a), 0)), plannedHours: r1(plannedHours), capacityHours: cap,
                utilization: cap ? Math.round((plannedHours / cap) * 100) : null,
                loggedThisWeek: r1(logs.filter((l) => String(l.employeeId) === id).reduce((t, l) => t + mins(l), 0) / 60),
                otherEngagements: { tasks: other.length, hours: r1(other.reduce((h, t) => h + (t.estimatedHours || 0), 0)) },
                onLeaveDays: leaves.filter((l) => String(l.employeeId) === id).length,
                tasks: mine.map(({ t, a }) => ({ auditId: a._id, auditCode: a.auditCode, clientName: a.clientName, key: t.key, label: t.label, stage: t.stage, status: t.status, priority: t.priority, dueDate: t.dueDate, estimatedHours: t.estimatedHours, loggedHours: r1((loggedOnTask.get(`${a._id}|${t.key}`) || 0) / 60), location: t.location, reviewer: t.reviewer })),
            };
        }).map((r) => ({ ...r, load: r.utilization === null ? "unknown" : r.utilization > 110 ? "over" : r.utilization > 85 ? "full" : r.utilization < 40 ? "light" : "ok" }))
            .sort((a, b) => (b.utilization ?? -1) - (a.utilization ?? -1));
        const unassigned = tasksWithContext(plain).filter(({ t }) => !t.assignee && !["invoice", "payment"].includes(t.key) && !DONE.includes(t.status) && t.status !== "Cancelled")
            .map(({ t, a }) => ({ auditId: a._id, auditCode: a.auditCode, clientName: a.clientName, key: t.key, label: t.label, stage: t.stage, priority: t.priority, dueDate: t.dueDate, estimatedHours: t.estimatedHours, responsibleRole: t.responsibleRole }));
        return res.status(200).json({
            success: true,
            data: {
                horizon, from: today, to: until, people: rows, unassigned: unassigned.slice(0, 200),
                engagements: plain.map((a) => ({ _id: a._id, auditCode: a.auditCode, clientName: a.clientName, clientId: a.clientId, projectId: a.projectId, team: [a.auditManager, ...(a.teamMembers || [])].map(String) })),
                formulas: {
                    plannedHours: `Remaining estimate on open tasks due in the next ${horizon} days (task estimate minus hours already logged on it), plus estimates of their open tasks on other engagements.`,
                    capacityHours: `Working days (Mon–Fri) in the next ${horizon} days, minus approved leave, × ${HOURS_PER_DAY}h.`,
                    utilization: "Planned hours ÷ capacity hours. Over 110% = overloaded; 85–110% = full; under 40% = light.",
                },
            },
        });
    } catch (err) { return fail(res, err); }
};

/* ---------------- Management dashboard + productivity ---------------- */

// GET /audit-work/dashboard?clientId&projectId&managerId&employeeId&from&to
export const dashboard = async (req, res) => {
    try {
        const leaderOrManager = await canCreateAudits(req);
        const finance = await isFinance(req);
        if (!leaderOrManager && !finance) throw httpError(403, "The audit dashboard is for managers, audit leadership and Accounts.");
        await ensureTimesheetBackfill();
        const q = req.query;
        const to = isDay(q.to) ? q.to : ymd(new Date());
        const from = isDay(q.from) ? q.from : ymd(new Date(Date.now() - 29 * DAY));
        if (from > to) throw httpError(400, "Pick a valid date range.");
        const filter = { isDeleted: false, ...(await visibleAuditFilter(req)) };
        if (!(await isAuditLeader(req)) && !finance) {
            // managers: engagements they manage or are on, and their team's
            const s = await scopeOf(req);
            const projects = await AuditProjectModel.find({ isDeleted: false, $or: [{ manager: s.me }, { partner: s.me }] }).distinct("_id");
            filter.$or = [...(filter.$or || []), { projectId: { $in: projects } }];
        }
        ["clientId", "projectId"].forEach((k) => { if (mongoose.isValidObjectId(q[k])) filter[k] = new mongoose.Types.ObjectId(q[k]); });
        if (mongoose.isValidObjectId(q.managerId)) filter.auditManager = new mongoose.Types.ObjectId(q.managerId);
        const audits = (await AuditEngagementModel.find(filter).populate("projectId", "name projectCode budgetHours budgetFee endDate").populate("auditManager", PERSON).lean());
        audits.forEach((a) => normalizeTasks(a.milestones || []));
        const ids = audits.map((a) => a._id);
        const empFilter = mongoose.isValidObjectId(q.employeeId) ? { employeeId: new mongoose.Types.ObjectId(q.employeeId) } : {};
        const allLogs = await AuditTimeLogModel.find({ auditId: { $in: ids }, ...empFilter }).select("auditId employeeId milestoneKey durationMinutes endTime startTime workDate status billable").lean();
        const inRange = allLogs.filter((l) => (l.workDate || ymd(l.startTime)) >= from && (l.workDate || ymd(l.startTime)) <= to);
        const today = ymd(new Date());
        const active = audits.filter((a) => !["Completed", "Cancelled"].includes(a.status));
        const allTasks = tasksWithContext(audits).filter(({ t }) => t.status !== "Cancelled" && !["invoice", "payment"].includes(t.key) && (!empFilter.employeeId || idStr(t.assignee) === q.employeeId));
        const openTasks = allTasks.filter(({ t, a }) => !DONE.includes(t.status) && !["Completed", "Cancelled"].includes(a.status));
        // lookup tables built once (the loops below would otherwise rescan every entry)
        const byAudit = new Map(), byTask = new Map(), byTaskPerson = new Map(), byTaskAfter = new Map();
        const nowMs = Date.now();
        for (const l of allLogs) {
            const m = mins(l, nowMs), a = String(l.auditId);
            byAudit.set(a, (byAudit.get(a) || 0) + m);
            if (l.milestoneKey) {
                const k = `${a}|${l.milestoneKey}`;
                byTask.set(k, (byTask.get(k) || 0) + m);
                const kp = `${k}|${l.employeeId}`;
                byTaskPerson.set(kp, (byTaskPerson.get(kp) || 0) + m);
                if (!byTaskAfter.has(kp)) byTaskAfter.set(kp, []);
                byTaskAfter.get(kp).push([new Date(l.startTime).getTime(), m]);
            }
        }
        const auditMins = (id) => byAudit.get(String(id)) || 0;
        const money = await canSeeMoney(req);

        // engagements at risk: time used outpaces task progress, or overdue with little left before the deadline
        const engRows = active.map((a) => {
            const tasks = (a.milestones || []).filter((t) => t.status !== "Cancelled" && !["invoice", "payment"].includes(t.key));
            const progress = tasks.length ? Math.round((tasks.filter((t) => DONE.includes(t.status)).length / tasks.length) * 100) : 0;
            const start = new Date(a.startDate).getTime(), end = new Date(a.endDate).getTime();
            const elapsed = end > start ? Math.round(Math.min(1, Math.max(0, (Date.now() - start) / (end - start))) * 100) : 0;
            const hours = auditMins(a._id) / 60;
            const hoursPct = a.estimatedHours ? Math.round((hours / a.estimatedHours) * 100) : null;
            const overdue = tasks.filter((t) => !DONE.includes(t.status) && t.dueDate && ymd(t.dueDate) < today).length;
            const reasons = [];
            if (elapsed - progress >= 20) reasons.push(`${elapsed}% of time used, ${progress}% of tasks done`);
            if (hoursPct !== null && hoursPct >= 90 && progress < 75) reasons.push(`${hoursPct}% of budgeted hours used`);
            if (overdue && end - Date.now() < 7 * DAY) reasons.push(`${overdue} overdue task${overdue === 1 ? "" : "s"}, deadline within a week`);
            if (end < Date.now()) reasons.push("past its deadline");
            return { _id: a._id, auditCode: a.auditCode, clientName: a.clientName, clientId: a.clientId, project: a.projectId, manager: a.auditManager, status: a.status, endDate: a.endDate, progress, elapsed, estimatedHours: a.estimatedHours, hours: r1(hours), hoursPct, overdue, blocked: tasks.filter((t) => t.status === "Blocked").length, inReview: tasks.filter((t) => ["Submitted", "Under Review"].includes(t.status)).length, risk: reasons.length ? (reasons.length > 1 || end < Date.now() ? "high" : "medium") : "low", reasons, ...(money ? { fee: a.fee } : {}) };
        });

        // roll-ups
        const groupBy = (keyFn, labelFn) => {
            const m = new Map();
            audits.forEach((a) => {
                const k = keyFn(a); if (!k) return;
                const r = m.get(k) || { key: k, label: labelFn(a), engagements: 0, active: 0, estimatedHours: 0, hours: 0, tasks: 0, done: 0, overdue: 0 };
                const tasks = (a.milestones || []).filter((t) => t.status !== "Cancelled" && !["invoice", "payment"].includes(t.key));
                r.engagements++; if (!["Completed", "Cancelled"].includes(a.status)) r.active++;
                r.estimatedHours += a.estimatedHours || 0; r.hours += auditMins(a._id) / 60;
                r.tasks += tasks.length; r.done += tasks.filter((t) => DONE.includes(t.status)).length;
                r.overdue += tasks.filter((t) => !DONE.includes(t.status) && t.dueDate && ymd(t.dueDate) < today).length;
                m.set(k, r);
            });
            return [...m.values()].map((r) => ({ ...r, hours: r1(r.hours) })).sort((a, b) => b.hours - a.hours);
        };

        // people in view: utilization and productivity over the range
        const peopleIds = [...new Set([...inRange.map((l) => String(l.employeeId)), ...allTasks.map(({ t }) => idStr(t.assignee)).filter(Boolean)])];
        const [people, leaves] = await Promise.all([
            employeeModel.find({ _id: { $in: peopleIds } }).select(PERSON).lean(),
            leaveModel.find({ employeeId: { $in: peopleIds }, status: "Approved", toDate: { $gte: new Date(`${from}T00:00:00`) }, fromDate: { $lte: new Date(`${to}T23:59:59`) } }).select("employeeId fromDate toDate").lean(),
        ]);
        const inR = (d) => d && ymd(d) >= from && ymd(d) <= to;
        const productivity = people.map((p) => {
            const id = String(p._id);
            const logged = inRange.filter((l) => String(l.employeeId) === id).reduce((t, l) => t + mins(l), 0) / 60;
            const cap = capacityHours(from, to, leaves.filter((l) => String(l.employeeId) === id));
            const completed = allTasks.filter(({ t }) => idStr(t.assignee) === id && DONE.includes(t.status) && inR(t.doneAt));
            const onTime = completed.filter(({ t }) => !t.dueDate || new Date(t.doneAt) <= new Date(new Date(t.dueDate).getTime() + DAY - 1));
            const estDone = completed.reduce((h, { t }) => h + (t.estimatedHours || 0), 0);
            const actDone = completed.reduce((h, { t, a }) => h + (byTaskPerson.get(`${a._id}|${t.key}|${id}`) || 0) / 60, 0);
            const reviewed = completed.filter(({ t }) => t.requiresReview);
            const rework = completed.filter(({ t }) => (t.reviewCycles || 0) > 0 && t.firstSubmittedAt).reduce((h, { t, a }) => { const after = new Date(t.firstSubmittedAt).getTime(); return h + (byTaskAfter.get(`${a._id}|${t.key}|${id}`) || []).filter(([st]) => st > after).reduce((x, [, m]) => x + m, 0) / 60; }, 0);
            const asReviewer = allTasks.filter(({ t, a }) => (idStr(t.reviewer) === id || (!t.reviewer && idStr(a.auditManager) === id && t.requiresReview)) && t.approvedAt && t.submittedAt && inR(t.approvedAt));
            const billable = inRange.filter((l) => String(l.employeeId) === id && l.billable !== false).reduce((t, l) => t + mins(l), 0) / 60;
            return {
                person: p, loggedHours: r1(logged), capacityHours: cap, utilization: cap ? Math.round((logged / cap) * 100) : null,
                ...(money ? { billableHours: r1(billable), billableUtilization: cap ? Math.round((billable / cap) * 100) : null } : {}),
                tasksCompleted: completed.length, onTimeRate: completed.length ? Math.round((onTime.length / completed.length) * 100) : null,
                estimateAccuracy: actDone > 0 && estDone > 0 ? Math.round((estDone / actDone) * 100) : null,
                firstTimeApproval: reviewed.length ? Math.round((reviewed.filter(({ t }) => !t.reviewCycles).length / reviewed.length) * 100) : null,
                avgReviewCycles: reviewed.length ? r1(reviewed.reduce((c, { t }) => c + (t.reviewCycles || 0), 0) / reviewed.length) : null,
                reworkHours: r1(rework),
                reviewTurnaroundHours: asReviewer.length ? r1(asReviewer.reduce((h, { t }) => h + (new Date(t.approvedAt) - new Date(t.submittedAt)) / 36e5, 0) / asReviewer.length) : null,
                reviewsDone: asReviewer.length,
                openTasks: openTasks.filter(({ t }) => idStr(t.assignee) === id).length,
                blocked: openTasks.filter(({ t }) => idStr(t.assignee) === id && t.status === "Blocked").length,
                dataComplete: logged > 0 || completed.length > 0,
            };
        }).sort((a, b) => b.loggedHours - a.loggedHours);

        // time per stage (from first start to approval, tasks completed in range)
        const stageStats = new Map();
        allTasks.filter(({ t }) => DONE.includes(t.status) && t.startedAt && inR(t.doneAt)).forEach(({ t, a }) => {
            const s = stageStats.get(t.stage) || { stage: t.stage, tasks: 0, days: 0, hours: 0 };
            s.tasks++; s.days += (new Date(t.doneAt) - new Date(t.startedAt)) / DAY;
            s.hours += (byTask.get(`${a._id}|${t.key}`) || 0) / 60;
            stageStats.set(t.stage, s);
        });
        const blockedReasons = openTasks.filter(({ t }) => t.status === "Blocked").map(({ t, a }) => ({ auditCode: a.auditCode, auditId: a._id, clientName: a.clientName, key: t.key, label: t.label, reason: t.blockedReason, since: [...(t.history || [])].reverse().find((h) => h.to === "Blocked")?.at }));
        const submittedTime = allLogs.filter((l) => l.status === "Submitted");
        const upcoming = openTasks.filter(({ t }) => t.dueDate && ymd(t.dueDate) >= today && ymd(t.dueDate) <= ymd(new Date(Date.now() + 7 * DAY)))
            .map(({ t, a }) => ({ auditId: a._id, auditCode: a.auditCode, clientName: a.clientName, key: t.key, label: t.label, dueDate: t.dueDate, status: t.status, assignee: t.assignee })).sort((x, y) => new Date(x.dueDate) - new Date(y.dueDate)).slice(0, 15);

        return res.status(200).json({
            success: true,
            data: {
                range: { from, to },
                cards: {
                    companies: new Set(active.map((a) => String(a.clientId))).size,
                    projects: new Set(active.map((a) => String(a.projectId?._id || "")).filter(Boolean)).size,
                    engagements: active.length,
                    tasksAssigned: openTasks.filter(({ t }) => ["Assigned", "Ready"].includes(t.status)).length,
                    tasksInProgress: openTasks.filter(({ t }) => t.status === "In Progress").length,
                    tasksBlocked: openTasks.filter(({ t }) => t.status === "Blocked").length,
                    tasksOverdue: openTasks.filter(({ t }) => t.dueDate && ymd(t.dueDate) < today).length,
                    unassigned: openTasks.filter(({ t }) => !t.assignee).length,
                    pendingReviews: openTasks.filter(({ t }) => ["Submitted", "Under Review"].includes(t.status)).length,
                    timesheetsAwaiting: { entries: submittedTime.length, hours: r1(submittedTime.reduce((t, l) => t + mins(l), 0) / 60), people: new Set(submittedTime.map((l) => String(l.employeeId))).size },
                    estimatedHours: active.reduce((h, a) => h + (a.estimatedHours || 0), 0),
                    actualHours: r1(active.reduce((h, a) => h + auditMins(a._id), 0) / 60),
                    hoursInRange: r1(inRange.reduce((t, l) => t + mins(l), 0) / 60),
                    atRisk: engRows.filter((e) => e.risk !== "low").length,
                    ...(money ? { feeActive: active.reduce((t, a) => t + (a.fee || 0), 0) } : {}),
                },
                engagements: engRows.sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.risk] - { high: 0, medium: 1, low: 2 }[b.risk]) || new Date(a.endDate) - new Date(b.endDate)),
                byCompany: groupBy((a) => String(a.clientId), (a) => a.clientName),
                byProject: groupBy((a) => (a.projectId ? String(a.projectId._id) : null), (a) => `${a.projectId.name} · ${a.clientName}`),
                stages: [...stageStats.values()].map((s) => ({ stage: s.stage, tasks: s.tasks, avgDays: r1(s.days / s.tasks), avgHours: r1(s.hours / s.tasks) })),
                productivity, blockedReasons, upcoming,
                filters: {
                    companies: [...new Map(audits.map((a) => [String(a.clientId), { _id: a.clientId, name: a.clientName }])).values()],
                    projects: [...new Map(audits.filter((a) => a.projectId).map((a) => [String(a.projectId._id), { _id: a.projectId._id, name: a.projectId.name }])).values()],
                    managers: [...new Map(audits.filter((a) => a.auditManager).map((a) => [String(a.auditManager._id), a.auditManager])).values()],
                    people,
                },
                formulas: {
                    utilization: `Hours logged in the range ÷ capacity. Capacity = working days (Mon–Fri) minus approved leave × ${HOURS_PER_DAY}h. Based on recorded time only — gaps in time recording lower it.`,
                    billableUtilization: "Billable hours logged ÷ capacity (shown only to people who can see fees).",
                    onTimeRate: "Tasks completed in the range on or before their due date ÷ tasks completed in the range.",
                    estimateAccuracy: "Estimated hours ÷ actual hours logged on the tasks completed in the range. 100% = on estimate; under 100% = took longer.",
                    firstTimeApproval: "Reviewed tasks approved with no change request ÷ reviewed tasks completed.",
                    reworkHours: "Hours logged on a task after it was first submitted, for tasks that had changes requested.",
                    reviewTurnaround: "Average hours from submission to approval, for tasks this person reviewed.",
                    risk: "An engagement is at risk when time elapsed runs 20+ points ahead of task progress, 90%+ of budgeted hours are used with under 75% of tasks done, it has overdue tasks within a week of its deadline, or it is past its deadline.",
                    caution: "These are decision-support figures, not rankings. Read them with task complexity, review quality, leave and assignment mix in mind; rows marked 'limited data' have little recorded time or completed work in the range.",
                },
            },
        });
    } catch (err) { return fail(res, err); }
};
