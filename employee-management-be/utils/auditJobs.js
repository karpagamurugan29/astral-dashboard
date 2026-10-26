import AuditEngagementModel from "../models/auditEngagementModel.js";
import AuditTimeLogModel from "../models/auditTimeLogModel.js";
import AuditProjectModel from "../models/auditProjectModel.js";
import WorkflowTemplate from "../models/workflowTemplateModel.js";
import { notify } from "./notify.js";
import { normalizeTasks, DONE } from "./auditTasks.js";

/* Audit task and timesheet reminders, run hourly. Each kind of message goes out at most once
   per task per day (lastReminderAt), and escalation to the manager happens once per task.
     - due tomorrow                → the assignee
     - overdue                     → the assignee, daily
     - overdue N days (template)   → the engagement manager (or the project partner), once
     - blocked 2+ days             → the engagement manager, once
     - Monday: last week's time still in Draft → the employee
     - submitted time waiting 3+ days        → the approver, once a day */

const TZ = () => process.env.COMPANY_TIMEZONE || "Asia/Kolkata";
const ymd = (d) => new Date(d).toLocaleDateString("en-CA", { timeZone: TZ() });
const DAY = 864e5;
let lastRun = 0;

export const runAuditReminders = async ({ force = false } = {}) => {
    if (!force && Date.now() - lastRun < 55 * 60000) return null;
    lastRun = Date.now();
    const now = new Date();
    const today = ymd(now), tomorrow = ymd(new Date(now.getTime() + DAY));
    const out = { dueSoon: 0, overdue: 0, escalated: 0, blocked: 0, timesheet: 0, approvals: 0 };
    const templates = new Map((await WorkflowTemplate.find().select("escalation").lean()).map((t) => [String(t._id), t.escalation || {}]));
    const audits = await AuditEngagementModel.find({ isDeleted: false, status: { $nin: ["Completed", "Cancelled", "On Hold"] } });
    for (const a of audits) {
        normalizeTasks(a.milestones);
        const esc = templates.get(String(a.workflowTemplate?.id)) || {};
        const remindBefore = esc.remindBeforeDays ?? 1, escalateAfter = esc.escalateAfterDays ?? 2;
        let partner = null;
        if (esc.escalateTo === "partner" && a.projectId) partner = (await AuditProjectModel.findById(a.projectId).select("partner").lean())?.partner;
        let dirty = false;
        for (const t of a.milestones) {
            if (DONE.includes(t.status) || t.status === "Cancelled" || ["invoice", "payment"].includes(t.key)) continue;
            const sentToday = t.lastReminderAt && ymd(t.lastReminderAt) === today;
            const link = `/audits/${a._id}?tab=workflow&task=${t.key}`;
            const where = `${a.clientName} (${a.auditCode})`;
            if (t.dueDate && !sentToday) {
                const due = ymd(t.dueDate);
                const daysLeft = Math.round((new Date(`${due}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / DAY);
                if (daysLeft >= 0 && daysLeft <= remindBefore && due >= today && t.assignee && !["Submitted", "Under Review"].includes(t.status)) {
                    notify(t.assignee, daysLeft === 0 ? "Task due today" : "Task due soon", `${where}: “${t.label}” is due ${daysLeft === 0 ? "today" : due === tomorrow ? "tomorrow" : `in ${daysLeft} days`}.`, "Audit", link);
                    t.lastReminderAt = now; dirty = true; out.dueSoon++;
                } else if (due < today) {
                    const late = Math.round((new Date(`${today}T00:00:00Z`) - new Date(`${due}T00:00:00Z`)) / DAY);
                    if (t.assignee && !["Submitted", "Under Review"].includes(t.status)) { notify(t.assignee, "Task overdue", `${where}: “${t.label}” was due ${late} day${late === 1 ? "" : "s"} ago.`, "Audit", link); out.overdue++; }
                    if (late >= escalateAfter && !(t.history || []).some((h) => h.action === "escalated")) {
                        notify(partner || a.auditManager, "Overdue task escalated", `${where}: “${t.label}” is ${late} days overdue (${t.status}).`, "Audit", link);
                        t.history.push({ at: now, action: "escalated", note: `Overdue ${late} days — escalated to the ${partner ? "partner" : "manager"}` });
                        out.escalated++;
                    }
                    t.lastReminderAt = now; dirty = true;
                }
            }
            if (t.status === "Blocked" && !(t.history || []).some((h) => h.action === "blocked-escalated")) {
                const since = [...(t.history || [])].reverse().find((h) => h.to === "Blocked")?.at;
                if (since && now - new Date(since) > 2 * DAY) {
                    notify(a.auditManager, "Task blocked for 2+ days", `${a.clientName} (${a.auditCode}): “${t.label}” — ${t.blockedReason || "no reason given"}`, "Audit", link);
                    t.history.push({ at: now, action: "blocked-escalated", note: "Blocked for more than 2 days" });
                    dirty = true; out.blocked++;
                }
            }
        }
        if (dirty) await a.save();
    }

    // timesheets
    const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
    if (dow === 1 && Number(new Date().toLocaleString("en-GB", { timeZone: TZ(), hour: "2-digit", hour12: false })) >= 10) {
        const lastMon = ymd(new Date(now.getTime() - 7 * DAY)), lastSun = ymd(new Date(now.getTime() - DAY));
        const drafts = await AuditTimeLogModel.aggregate([{ $match: { status: { $in: ["Draft", "Rejected"] }, workDate: { $gte: lastMon, $lte: lastSun }, $or: [{ lastNudgedOn: { $exists: false } }, { lastNudgedOn: { $ne: today } }] } }, { $group: { _id: "$employeeId", n: { $sum: 1 }, m: { $sum: "$durationMinutes" } } }]);
        for (const d of drafts) { notify(d._id, "Submit last week's timesheet", `${d.n} entr${d.n === 1 ? "y" : "ies"} (${Math.round(d.m / 6) / 10}h) from last week are not submitted yet.`, "Audit", "/timesheets"); out.timesheet++; }
        if (drafts.length) await AuditTimeLogModel.updateMany({ status: { $in: ["Draft", "Rejected"] }, workDate: { $gte: lastMon, $lte: lastSun } }, { $set: { lastNudgedOn: today } }, { strict: false });
    }
    const stale = await AuditTimeLogModel.aggregate([{ $match: { status: "Submitted", submittedAt: { $lt: new Date(now.getTime() - 3 * DAY) } } }, { $group: { _id: "$auditId", n: { $sum: 1 } } }]);
    if (stale.length) {
        const owners = await AuditEngagementModel.find({ _id: { $in: stale.map((s) => s._id) } }).select("auditManager auditCode approvalNudgedOn").lean();
        for (const o of owners) {
            if (o.approvalNudgedOn === today) continue;
            notify(o.auditManager, "Timesheets waiting for approval", `${o.auditCode}: ${stale.find((s) => String(s._id) === String(o._id)).n} entries submitted 3+ days ago.`, "Audit", "/timesheets?tab=approvals");
            await AuditEngagementModel.updateOne({ _id: o._id }, { $set: { approvalNudgedOn: today } }, { strict: false });
            out.approvals++;
        }
    }
    return out;
};

export const startAuditJobs = (ensureDb = async () => {}) => {
    const tick = async () => { try { await ensureDb(); await runAuditReminders(); } catch (err) { console.error("Audit reminders failed:", err.message); } };
    setTimeout(tick, 30000);
    return setInterval(tick, 15 * 60000);
};
