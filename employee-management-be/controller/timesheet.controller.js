import mongoose from "mongoose";
import AuditTimeLogModel from "../models/auditTimeLogModel.js";
import AuditEngagementModel from "../models/auditEngagementModel.js";
import attendanceModel from "../models/attendanceModel.js";
import leaveModel from "../models/leaveModel.js";
import { logAudit } from "../utils/audit.js";
import { notify } from "../utils/notify.js";
import { auditAccess, onTeam, idStr, isAuditLeader } from "../utils/auditAccess.js";
import { scopeOf } from "../utils/hierarchy.js";
import { resolveStep } from "./auditWorkflow.controller.js";
import { closeStaleTimers } from "../utils/timerGuard.js";

/* Timesheets for audit work. Entries come from the timer or are typed in (manual); a week is
   submitted, the engagement's manager (or audit leadership) approves or returns entries, and
   approved time is locked — corrections go through a recorded adjustment. Attendance hours are
   shown alongside for comparison only; they never count as project time. */

const TZ = () => process.env.COMPANY_TIMEZONE || "Asia/Kolkata";
const ymd = (d) => new Date(d).toLocaleDateString("en-CA", { timeZone: TZ() });
const httpError = (status, message) => Object.assign(new Error(message), { status });
const fail = (res, err) => res.status(err.status || 500).json({ success: false, message: err.message });
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "") && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const addDays = (k, n) => { const d = new Date(`${k}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const weekOf = (k) => { const d = new Date(`${k}T00:00:00Z`); return addDays(k, -((d.getUTCDay() + 6) % 7)); }; // Monday
const PERSON = "employeeId firstName lastName designation";
const MAX_DAY_MIN = 16 * 60;
const net = (l) => Math.max(0, (l.durationMinutes || 0));

// one-time: older entries get a work date, an entry type and a status
let backfilled = false;
export const ensureTimesheetBackfill = async () => {
    if (backfilled) return;
    backfilled = true;
    try {
        const thisWeek = new Date(`${weekOf(ymd(new Date()))}T00:00:00+05:30`);
        const old = await AuditTimeLogModel.find({ $or: [{ status: { $exists: false } }, { workDate: { $in: ["", null] } }] }).select("startTime status workDate billedInvoice reviewedAt endTime").lean();
        const ops = old.map((l) => ({
            updateOne: {
                filter: { _id: l._id },
                update: { $set: {
                    workDate: l.workDate || ymd(l.startTime),
                    ...(l.status ? {} : { status: l.billedInvoice || l.reviewedAt || (l.endTime && new Date(l.startTime) < thisWeek) ? "Approved" : "Draft", entryType: "timer" }),
                } },
            },
        }));
        if (ops.length) await AuditTimeLogModel.bulkWrite(ops);
    } catch (err) { backfilled = false; console.error("Timesheet backfill failed:", err.message); }
};

// who approves an entry: the engagement's manager / project lead / audit leadership — never yourself
const canApprove = async (req, log, audit) => {
    const a = await auditAccess(req, audit);
    if (!a.manage) return false;
    if (idStr(log.employeeId) === a.me && !a.leader) return false;
    return true;
};

const dayTotal = async (employeeId, workDate, exceptId) => {
    const logs = await AuditTimeLogModel.find({ employeeId, workDate, _id: { $ne: exceptId } }).select("durationMinutes endTime startTime").lean();
    return logs.reduce((t, l) => t + (l.endTime ? net(l) : Math.round((Date.now() - new Date(l.startTime)) / 60000)), 0);
};
const overlaps = async (employeeId, start, end, exceptId) => AuditTimeLogModel.exists({ employeeId, _id: { $ne: exceptId }, startTime: { $lt: end }, $or: [{ endTime: { $gt: start } }, { endTime: null }] });

// validate + compute a manual entry
const buildEntry = async (req, b, audit, existing = null) => {
    const workDate = b.workDate || existing?.workDate;
    if (!isDay(workDate)) throw httpError(400, "Pick the work date.");
    if (workDate > ymd(new Date())) throw httpError(400, "Time can't be logged for a future date.");
    const brk = Math.min(600, Math.max(0, Number(b.breakMinutes ?? existing?.breakMinutes) || 0));
    let start, end, minutes;
    if (b.startTime && b.endTime) {
        start = new Date(`${workDate}T${b.startTime}:00+05:30`);
        end = new Date(`${workDate}T${b.endTime}:00+05:30`);
        if (Number.isNaN(+start) || Number.isNaN(+end) || end <= start) throw httpError(400, "The end time must be after the start time.");
        minutes = Math.round((end - start) / 60000) - brk;
        if (await overlaps(req.user.id, start, end, existing?._id)) throw httpError(400, "That overlaps time you've already logged.");
    } else {
        minutes = Math.round(Number(b.minutes ?? (b.hours !== undefined ? Number(b.hours) * 60 : existing?.durationMinutes)) || 0);
        start = new Date(`${workDate}T09:00:00+05:30`);
        end = new Date(start.getTime() + Math.max(0, minutes + brk) * 60000);
    }
    if (!(minutes > 0)) throw httpError(400, "Enter the time worked (more than zero).");
    if (minutes > MAX_DAY_MIN) throw httpError(400, "One entry can't be more than 16 hours.");
    if ((await dayTotal(req.user.id, workDate, existing?._id)) + minutes > MAX_DAY_MIN) throw httpError(400, "That takes the day over 16 hours of logged time.");
    const description = String(b.description ?? b.note ?? existing?.note ?? "").trim().slice(0, 500);
    if (!description) throw httpError(400, "Describe the work done.");
    return { workDate, startTime: start, endTime: end, durationMinutes: minutes, breakMinutes: brk, note: description, ...resolveStep(audit, b.step ?? existing?.milestoneKey), billable: b.billable !== false };
};

const loadAuditFor = async (req, auditId) => {
    if (!mongoose.isValidObjectId(auditId)) throw httpError(400, "Pick the engagement.");
    const audit = await AuditEngagementModel.findOne({ _id: auditId, isDeleted: false });
    if (!audit) throw httpError(404, "Engagement not found.");
    if (!onTeam(audit, req.user.id)) throw httpError(403, "You can only log time on engagements you're assigned to.");
    if (["Completed", "Cancelled"].includes(audit.status)) throw httpError(400, `This engagement is ${audit.status.toLowerCase()}.`);
    return audit;
};

/* ---------------- my week ---------------- */

// GET /timesheets/me?week=YYYY-MM-DD
export const myTimesheet = async (req, res) => {
    try {
        await ensureTimesheetBackfill();
        await closeStaleTimers({ employeeId: req.user.id });
        const week = weekOf(isDay(req.query.week) ? req.query.week : ymd(new Date()));
        const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
        const me = new mongoose.Types.ObjectId(req.user.id);
        const [entries, attendance, leaves, audits] = await Promise.all([
            AuditTimeLogModel.find({ employeeId: me, workDate: { $in: days } }).populate("auditId", "auditCode clientName engagementName auditType").populate("approvedBy", "firstName lastName").sort({ startTime: 1 }).lean(),
            attendanceModel.find({ employeeId: me, attendanceDate: { $in: days } }).select("attendanceDate workingHours status").lean(),
            leaveModel.find({ employeeId: me, status: "Approved", fromDate: { $lte: new Date(`${days[6]}T23:59:59`) }, toDate: { $gte: new Date(`${days[0]}T00:00:00`) } }).select("fromDate toDate leaveType").lean(),
            AuditEngagementModel.find({ isDeleted: false, status: { $nin: ["Completed", "Cancelled"] }, $or: [{ auditManager: me }, { teamMembers: me }] }).select("auditCode clientName engagementName auditType milestones.key milestones.label milestones.stage milestones.status milestones.assignee").lean(),
        ]);
        const onLeave = (d) => leaves.find((l) => ymd(l.fromDate) <= d && ymd(l.toDate) >= d)?.leaveType || "";
        const perDay = days.map((d) => ({
            date: d,
            minutes: entries.filter((e) => e.workDate === d).reduce((t, e) => t + (e.endTime ? net(e) : Math.round((Date.now() - new Date(e.startTime)) / 60000)), 0),
            attendanceHours: attendance.find((a) => a.attendanceDate === d)?.workingHours || 0,
            leave: onLeave(d),
        }));
        const count = (s) => entries.filter((e) => e.status === s).length;
        const status = !entries.length ? "Empty" : count("Draft") + count("Rejected") ? (count("Submitted") + count("Approved") ? "Partly submitted" : "Draft") : count("Submitted") ? "Submitted" : "Approved";
        return res.status(200).json({
            success: true,
            data: {
                week, days: perDay, entries, status,
                totals: { minutes: perDay.reduce((t, d) => t + d.minutes, 0), draft: count("Draft"), submitted: count("Submitted"), approved: count("Approved"), rejected: count("Rejected"), running: entries.some((e) => !e.endTime) },
                engagements: audits.map((a) => ({ _id: a._id, auditCode: a.auditCode, clientName: a.clientName, title: a.engagementName || `${a.auditType} audit`, tasks: (a.milestones || []).filter((t) => !["invoice", "payment"].includes(t.key) && t.status !== "Cancelled").map((t) => ({ key: t.key, label: t.label, stage: t.stage, mine: idStr(t.assignee) === req.user.id })) })),
            },
        });
    } catch (err) { return fail(res, err); }
};

// POST /timesheets/entries — manual entry
export const addEntry = async (req, res) => {
    try {
        await ensureTimesheetBackfill();
        const audit = await loadAuditFor(req, req.body?.auditId);
        const e = await buildEntry(req, req.body || {}, audit);
        const log = await AuditTimeLogModel.create({ ...e, auditId: audit._id, employeeId: req.user.id, entryType: "manual", status: "Draft" });
        return res.status(201).json({ success: true, message: "Time added to your timesheet.", data: log });
    } catch (err) { return fail(res, err); }
};

// PUT /timesheets/entries/:id — while Draft / Rejected (timer entries: description, task, billable, break only)
export const updateEntry = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) throw httpError(404, "Entry not found.");
        const log = await AuditTimeLogModel.findById(req.params.id);
        if (!log || idStr(log.employeeId) !== String(req.user.id)) throw httpError(404, "Entry not found.");
        if (!["Draft", "Rejected"].includes(log.status)) throw httpError(400, `This time is ${log.status.toLowerCase()} — ${log.status === "Approved" ? "request a correction instead" : "wait for your manager"}.`);
        if (!log.endTime) throw httpError(400, "Stop the timer first.");
        const audit = await AuditEngagementModel.findById(log.auditId);
        if (log.entryType === "manual") Object.assign(log, await buildEntry(req, req.body || {}, audit, log));
        else {
            if (req.body?.description !== undefined) log.note = String(req.body.description).trim().slice(0, 500);
            if (req.body?.step !== undefined) Object.assign(log, resolveStep(audit, req.body.step));
            if (req.body?.billable !== undefined) log.billable = req.body.billable !== false;
        }
        await log.save();
        return res.status(200).json({ success: true, message: "Entry updated.", data: log });
    } catch (err) { return fail(res, err); }
};

// DELETE /timesheets/entries/:id — manual Draft / Rejected entries only
export const deleteEntry = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) throw httpError(404, "Entry not found.");
        const log = await AuditTimeLogModel.findById(req.params.id);
        if (!log || idStr(log.employeeId) !== String(req.user.id)) throw httpError(404, "Entry not found.");
        if (log.entryType !== "manual") throw httpError(400, "Timer sessions can't be deleted — correct them instead.");
        if (!["Draft", "Rejected"].includes(log.status)) throw httpError(400, `This time is ${log.status.toLowerCase()}.`);
        await log.deleteOne();
        return res.status(200).json({ success: true, message: "Entry removed." });
    } catch (err) { return fail(res, err); }
};

// POST /timesheets/submit { week }
export const submitWeek = async (req, res) => {
    try {
        await ensureTimesheetBackfill();
        const week = weekOf(isDay(req.body?.week) ? req.body.week : ymd(new Date()));
        const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
        const entries = await AuditTimeLogModel.find({ employeeId: req.user.id, workDate: { $in: days }, status: { $in: ["Draft", "Rejected"] } });
        if (!entries.length) throw httpError(400, "Nothing to submit for this week.");
        if (entries.some((e) => !e.endTime)) throw httpError(400, "Stop your running timer before submitting.");
        if (entries.some((e) => !String(e.note || "").trim())) throw httpError(400, "Add a work description to every entry before submitting.");
        const now = new Date();
        for (const e of entries) { e.status = "Submitted"; e.submittedAt = now; e.reviewComment = ""; await e.save(); }
        // tell each engagement's manager once
        const audits = await AuditEngagementModel.find({ _id: { $in: [...new Set(entries.map((e) => String(e.auditId)))] } }).select("auditManager auditCode clientName").lean();
        const mins = (id) => entries.filter((e) => String(e.auditId) === String(id)).reduce((t, e) => t + net(e), 0);
        audits.forEach((a) => { if (idStr(a.auditManager) !== String(req.user.id)) notify(a.auditManager, "Timesheet to approve", `${a.clientName} (${a.auditCode}): ${Math.round(mins(a._id) / 6) / 10}h submitted for the week of ${week}.`, "Audit", "/timesheets?tab=approvals"); });
        logAudit(req, "timesheet.submit", `Submitted ${entries.length} entries for the week of ${week}`, { type: "Timesheet" });
        return res.status(200).json({ success: true, message: `Week of ${week} submitted — ${entries.length} entr${entries.length === 1 ? "y" : "ies"}.` });
    } catch (err) { return fail(res, err); }
};

/* ---------------- approvals ---------------- */

// GET /timesheets/approvals?status=Submitted — entries this person may approve
export const approvals = async (req, res) => {
    try {
        await ensureTimesheetBackfill();
        const status = ["Submitted", "Approved", "Rejected"].includes(req.query.status) ? req.query.status : "Submitted";
        const leader = await isAuditLeader(req);
        const s = await scopeOf(req);
        const auditFilter = leader ? { isDeleted: false } : { isDeleted: false, auditManager: s.me };
        const AuditProjectModel = (await import("../models/auditProjectModel.js")).default;
        const projects = leader ? [] : await AuditProjectModel.find({ isDeleted: false, $or: [{ manager: s.me }, { partner: s.me }] }).select("_id").lean();
        if (projects.length) { delete auditFilter.auditManager; auditFilter.$or = [{ auditManager: s.me }, { projectId: { $in: projects.map((p) => p._id) } }]; }
        const audits = await AuditEngagementModel.find(auditFilter).select("auditCode clientName engagementName auditType auditManager").lean();
        const since = status === "Submitted" ? new Date(0) : new Date(Date.now() - 60 * 864e5);
        const entries = await AuditTimeLogModel.find({ auditId: { $in: audits.map((a) => a._id) }, status, ...(leader ? {} : { employeeId: { $ne: new mongoose.Types.ObjectId(s.me) } }), updatedAt: { $gte: since } })
            .populate("employeeId", PERSON).sort({ workDate: 1, startTime: 1 }).limit(1000).lean();
        const byAudit = new Map(audits.map((a) => [String(a._id), a]));
        const groups = new Map();
        entries.forEach((e) => {
            const k = `${idStr(e.employeeId)}|${weekOf(e.workDate || ymd(e.startTime))}`;
            if (!groups.has(k)) groups.set(k, { employee: e.employeeId, week: weekOf(e.workDate || ymd(e.startTime)), minutes: 0, entries: [] });
            const g = groups.get(k);
            g.minutes += net(e);
            g.entries.push({ ...e, audit: byAudit.get(String(e.auditId)) });
        });
        return res.status(200).json({ success: true, data: [...groups.values()].sort((a, b) => a.week.localeCompare(b.week)), status });
    } catch (err) { return fail(res, err); }
};

// POST /timesheets/decide { ids: [], decision: "approve" | "reject", comment }
export const decide = async (req, res) => {
    try {
        const { ids = [], decision, comment = "" } = req.body || {};
        if (!["approve", "reject"].includes(decision)) throw httpError(400, "Approve or return the time.");
        if (decision === "reject" && !String(comment).trim()) throw httpError(400, "Say what needs correcting.");
        const list = (Array.isArray(ids) ? ids : []).filter((x) => mongoose.isValidObjectId(x)).slice(0, 500);
        if (!list.length) throw httpError(400, "Pick the entries.");
        const logs = await AuditTimeLogModel.find({ _id: { $in: list } });
        const audits = new Map((await AuditEngagementModel.find({ _id: { $in: [...new Set(logs.map((l) => String(l.auditId)))] } }).lean()).map((a) => [String(a._id), a]));
        const now = new Date();
        let done = 0; const skipped = []; const who = new Map();
        for (const l of logs) {
            const a = audits.get(String(l.auditId));
            if (l.status !== "Submitted") { skipped.push("not submitted"); continue; }
            if (!a || !(await canApprove(req, l, a))) { skipped.push("not yours to approve"); continue; }
            l.status = decision === "approve" ? "Approved" : "Rejected";
            l.approvedBy = decision === "approve" ? req.user.id : null;
            l.approvedAt = decision === "approve" ? now : null;
            l.reviewComment = String(comment).slice(0, 500);
            if (decision === "approve") { l.needsReview = false; l.reviewedBy = req.user.id; l.reviewedAt = now; }
            await l.save(); done++;
            const k = String(l.employeeId); who.set(k, (who.get(k) || 0) + net(l));
        }
        if (!done) throw httpError(400, `Nothing changed${skipped.length ? ` (${[...new Set(skipped)].join(", ")})` : ""}.`);
        who.forEach((m, id) => notify(id, decision === "approve" ? "Timesheet approved" : "Timesheet returned for correction", decision === "approve" ? `${Math.round(m / 6) / 10}h approved.` : `${Math.round(m / 6) / 10}h returned — ${comment}`, "Audit", "/timesheets"));
        logAudit(req, `timesheet.${decision}`, `${decision === "approve" ? "Approved" : "Returned"} ${done} time entr${done === 1 ? "y" : "ies"}${comment ? ` — ${String(comment).slice(0, 120)}` : ""}`, { type: "Timesheet" });
        return res.status(200).json({ success: true, message: `${done} entr${done === 1 ? "y" : "ies"} ${decision === "approve" ? "approved" : "returned"}${skipped.length ? `; ${skipped.length} skipped` : ""}.` });
    } catch (err) { return fail(res, err); }
};

/* ---------------- corrections to approved time ---------------- */

// POST /timesheets/entries/:id/adjustments { minutes, reason } — the employee asks; the manager decides
export const requestAdjustment = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) throw httpError(404, "Entry not found.");
        const log = await AuditTimeLogModel.findById(req.params.id);
        if (!log || idStr(log.employeeId) !== String(req.user.id)) throw httpError(404, "Entry not found.");
        if (log.status !== "Approved") throw httpError(400, "Only approved time needs a correction request — edit it directly.");
        if (log.billedInvoice) throw httpError(400, "This time is already billed.");
        const minutes = Math.round(Number(req.body?.minutes));
        const reason = String(req.body?.reason || "").trim().slice(0, 500);
        if (!(minutes >= 0 && minutes <= MAX_DAY_MIN)) throw httpError(400, "Enter the corrected minutes.");
        if (!reason) throw httpError(400, "Give a reason for the correction.");
        if (log.adjustments.some((a) => a.status === "Requested")) throw httpError(400, "A correction is already waiting for approval.");
        log.adjustments.push({ by: req.user.id, fromMinutes: log.durationMinutes, toMinutes: minutes, reason, status: "Requested" });
        await log.save();
        const audit = await AuditEngagementModel.findById(log.auditId).select("auditManager auditCode").lean();
        notify(audit.auditManager, "Time correction requested", `${audit.auditCode}: ${Math.round(log.durationMinutes / 6) / 10}h → ${Math.round(minutes / 6) / 10}h — ${reason}`, "Audit", "/timesheets?tab=approvals");
        return res.status(201).json({ success: true, message: "Correction sent for approval.", data: log });
    } catch (err) { return fail(res, err); }
};

// POST /timesheets/entries/:id/adjustments/:aid { decision: apply | decline }
export const decideAdjustment = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) throw httpError(404, "Entry not found.");
        const log = await AuditTimeLogModel.findById(req.params.id);
        if (!log) throw httpError(404, "Entry not found.");
        const audit = await AuditEngagementModel.findById(log.auditId).lean();
        if (!(await canApprove(req, log, audit))) throw httpError(403, "Only the engagement's manager or audit leadership can decide this.");
        const adj = log.adjustments.id(req.params.aid);
        if (!adj || adj.status !== "Requested") throw httpError(404, "No pending correction.");
        if (log.billedInvoice) throw httpError(400, "This time is already billed.");
        const apply = req.body?.decision === "apply";
        adj.status = apply ? "Applied" : "Declined"; adj.decidedBy = req.user.id; adj.decidedAt = new Date();
        if (apply) {
            if (log.originalMinutes == null) log.originalMinutes = log.durationMinutes;
            log.durationMinutes = adj.toMinutes;
            log.endTime = new Date(new Date(log.startTime).getTime() + (adj.toMinutes + (log.breakMinutes || 0)) * 60000);
        }
        await log.save();
        notify(log.employeeId, apply ? "Time correction applied" : "Time correction declined", `${audit.auditCode}: ${Math.round(adj.fromMinutes / 6) / 10}h → ${Math.round(adj.toMinutes / 6) / 10}h.`, "Audit", "/timesheets");
        logAudit(req, "timesheet.adjust", `${audit.auditCode}: correction ${apply ? "applied" : "declined"} (${adj.fromMinutes}m → ${adj.toMinutes}m) — ${adj.reason}`, { type: "Timesheet", id: log._id });
        return res.status(200).json({ success: true, message: apply ? "Correction applied." : "Correction declined.", data: log });
    } catch (err) { return fail(res, err); }
};

// GET /timesheets/adjustments — pending corrections this person can decide
export const pendingAdjustments = async (req, res) => {
    try {
        const leader = await isAuditLeader(req);
        const s = await scopeOf(req);
        const audits = await AuditEngagementModel.find(leader ? { isDeleted: false } : { isDeleted: false, auditManager: s.me }).select("_id auditCode clientName").lean();
        const logs = await AuditTimeLogModel.find({ auditId: { $in: audits.map((a) => a._id) }, "adjustments.status": "Requested" }).populate("employeeId", PERSON).lean();
        const byId = new Map(audits.map((a) => [String(a._id), a]));
        return res.status(200).json({ success: true, data: logs.map((l) => ({ ...l, audit: byId.get(String(l.auditId)), adjustment: l.adjustments.find((a) => a.status === "Requested") })) });
    } catch (err) { return fail(res, err); }
};
