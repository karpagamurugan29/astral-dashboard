import mongoose from "mongoose";
import AuditProjectModel from "../models/auditProjectModel.js";
import AuditClientModel from "../models/auditClientModel.js";
import AuditEngagementModel from "../models/auditEngagementModel.js";
import AuditTimeLogModel from "../models/auditTimeLogModel.js";
import employeeModel from "../models/employeeModel.js";
import { PERSON } from "../utils/auditShared.js";
import { logAudit } from "../utils/audit.js";
import { notify } from "../utils/notify.js";
import { canSeeMoney } from "../utils/money.js";
import { isAuditLeader, isFinance, canCreateAudits, visibleAuditFilter, idStr } from "../utils/auditAccess.js";
import { normalizeTasks } from "../utils/auditTasks.js";
import { scopeOf } from "../utils/hierarchy.js";

/* Audit projects: Company (client) → Project → Engagements. A project carries the budget,
   deadline, manager and partner for a body of work; its numbers roll up from its engagements. */

const httpError = (status, message) => Object.assign(new Error(message), { status });
const fail = (res, err) => res.status(err.status || 500).json({ success: false, message: err.message });
const txt = (v, n) => String(v ?? "").trim().slice(0, n);

const visibleProjectFilter = async (req) => {
    if ((await isAuditLeader(req)) || (await isFinance(req))) return { isDeleted: false };
    const s = await scopeOf(req);
    const ids = [s.me, ...s.team];
    const engagements = await AuditEngagementModel.find({ isDeleted: false, projectId: { $ne: null }, ...(await visibleAuditFilter(req)) }).distinct("projectId");
    return { isDeleted: false, $or: [{ manager: { $in: ids } }, { partner: { $in: ids } }, { _id: { $in: engagements } }] };
};
const canEditProject = async (req, p) => (await isAuditLeader(req)) || [p.manager, p.partner].some((x) => idStr(x) === String(req.user.id));
const nextCode = async () => {
    const year = new Date().getFullYear();
    const last = await AuditProjectModel.findOne({ projectCode: new RegExp(`^PRJ-${year}-`) }).sort({ projectCode: -1 }).select("projectCode").lean();
    return `PRJ-${year}-${String((Number(last?.projectCode?.split("-")[2]) || 0) + 1).padStart(3, "0")}`;
};

// roll-up of engagements, tasks and time for a set of projects
const rollup = async (projectIds) => {
    const engagements = await AuditEngagementModel.find({ isDeleted: false, projectId: { $in: projectIds } }).select("projectId status estimatedHours fee endDate milestones.status milestones.done milestones.dueDate milestones.stage milestones.mandatory milestones.optional").lean();
    const logs = await AuditTimeLogModel.find({ auditId: { $in: engagements.map((e) => e._id) } }).select("auditId durationMinutes endTime startTime").lean();
    const minsBy = new Map();
    logs.forEach((l) => minsBy.set(String(l.auditId), (minsBy.get(String(l.auditId)) || 0) + (l.endTime ? l.durationMinutes || 0 : Math.round((Date.now() - new Date(l.startTime)) / 60000))));
    const out = new Map();
    const now = new Date();
    engagements.forEach((e) => {
        const k = String(e.projectId);
        const r = out.get(k) || { engagements: 0, active: 0, estimatedHours: 0, minutes: 0, fee: 0, tasks: 0, done: 0, overdue: 0, blocked: 0 };
        const tasks = e.milestones || [];
        normalizeTasks(tasks);
        r.engagements++; if (!["Completed", "Cancelled"].includes(e.status)) r.active++;
        r.estimatedHours += e.estimatedHours || 0; r.minutes += minsBy.get(String(e._id)) || 0; r.fee += e.fee || 0;
        r.tasks += tasks.filter((t) => t.status !== "Cancelled").length; r.done += tasks.filter((t) => t.done).length;
        r.overdue += tasks.filter((t) => !t.done && t.status !== "Cancelled" && t.dueDate && new Date(t.dueDate) < now).length;
        r.blocked += tasks.filter((t) => t.status === "Blocked").length;
        out.set(k, r);
    });
    return out;
};

export const listProjects = async (req, res) => {
    try {
        const filter = await visibleProjectFilter(req);
        if (req.query.clientId && mongoose.isValidObjectId(req.query.clientId)) filter.clientId = req.query.clientId;
        const projects = await AuditProjectModel.find(filter).populate("clientId", "name clientCode").populate("manager partner", PERSON).sort({ createdAt: -1 }).lean();
        const roll = await rollup(projects.map((p) => p._id));
        const money = await canSeeMoney(req);
        return res.status(200).json({
            success: true,
            data: projects.map((p) => { const r = roll.get(String(p._id)) || {}; const x = { ...p, summary: r }; if (!money) { delete x.budgetFee; if (x.summary) delete x.summary.fee; } return x; }),
            canCreate: await canCreateAudits(req),
        });
    } catch (err) { return fail(res, err); }
};

export const getProject = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) throw httpError(404, "Project not found.");
        const p = await AuditProjectModel.findOne({ _id: req.params.id, ...(await visibleProjectFilter(req)) }).populate("clientId", "name clientCode city").populate("manager partner", PERSON).lean();
        if (!p) throw httpError(404, "Project not found.");
        const engagements = await AuditEngagementModel.find({ isDeleted: false, projectId: p._id, ...(await visibleAuditFilter(req)) }).select("auditCode engagementName auditType financialYear status startDate endDate estimatedHours auditManager teamMembers").populate("auditManager", PERSON).lean();
        const roll = (await rollup([p._id])).get(String(p._id)) || {};
        if (!(await canSeeMoney(req))) { delete p.budgetFee; delete roll.fee; }
        return res.status(200).json({ success: true, data: { ...p, engagements, summary: roll, canEdit: await canEditProject(req, p) } });
    } catch (err) { return fail(res, err); }
};

const validate = async (b, current = {}) => {
    const out = {};
    if (b.name !== undefined || !current.name) { out.name = txt(b.name, 160); if (!out.name) throw httpError(400, "Name the project."); }
    if (b.clientId !== undefined || !current.clientId) {
        if (!mongoose.isValidObjectId(b.clientId) || !(await AuditClientModel.exists({ _id: b.clientId, isDeleted: false }))) throw httpError(400, "Choose the company.");
        out.clientId = b.clientId;
    }
    for (const f of ["manager", "partner"]) {
        if (b[f] === undefined) continue;
        if (!b[f]) { if (f === "manager") throw httpError(400, "Choose the project manager."); out[f] = null; continue; }
        if (!mongoose.isValidObjectId(b[f]) || !(await employeeModel.exists({ _id: b[f], status: "Active" }))) throw httpError(400, `Choose an active employee as ${f}.`);
        out[f] = b[f];
    }
    if (!current.manager && !out.manager) throw httpError(400, "Choose the project manager.");
    ["financialYear", "description"].forEach((f) => { if (b[f] !== undefined) out[f] = txt(b[f], f === "description" ? 2000 : 20); });
    ["startDate", "endDate"].forEach((f) => { if (b[f] !== undefined) out[f] = b[f] ? new Date(b[f]) : null; });
    const s = out.startDate ?? current.startDate, e = out.endDate ?? current.endDate;
    if (s && e && new Date(e) < new Date(s)) throw httpError(400, "The end date can't be before the start date.");
    ["budgetHours", "budgetFee"].forEach((f) => { if (b[f] !== undefined) out[f] = Math.max(0, Number(b[f]) || 0); });
    if (b.status !== undefined) { if (!["Planning", "Active", "On Hold", "Completed", "Cancelled"].includes(b.status)) throw httpError(400, "Pick a valid status."); out.status = b.status; }
    return out;
};

export const createProject = async (req, res) => {
    try {
        if (!(await canCreateAudits(req))) throw httpError(403, "Only managers and audit leadership can create projects.");
        const data = await validate(req.body || {});
        if (!(await canSeeMoney(req))) delete data.budgetFee;
        const p = await AuditProjectModel.create({ ...data, projectCode: await nextCode(), createdBy: req.user.id });
        [p.manager, p.partner].filter((x) => x && String(x) !== String(req.user.id)).forEach((x) => notify(x, "Audit project assigned", `You're on the project “${p.name}” (${p.projectCode}).`, "Audit", `/audits/projects/${p._id}`));
        logAudit(req, "project.create", `Created project ${p.projectCode} “${p.name}”`, { type: "AuditProject", id: p._id });
        return res.status(201).json({ success: true, message: `Project ${p.projectCode} created.`, data: p });
    } catch (err) { return fail(res, err); }
};

export const updateProject = async (req, res) => {
    try {
        const p = mongoose.isValidObjectId(req.params.id) ? await AuditProjectModel.findOne({ _id: req.params.id, isDeleted: false }) : null;
        if (!p) throw httpError(404, "Project not found.");
        if (!(await canEditProject(req, p))) throw httpError(403, "Only the project's manager / partner or audit leadership can change it.");
        const data = await validate(req.body || {}, p.toObject());
        if (data.clientId && String(data.clientId) !== String(p.clientId) && (await AuditEngagementModel.exists({ projectId: p._id, isDeleted: false }))) throw httpError(400, "Move or archive its engagements before changing the company.");
        if (!(await canSeeMoney(req))) delete data.budgetFee;
        Object.assign(p, data);
        await p.save();
        logAudit(req, "project.update", `Updated project ${p.projectCode}`, { type: "AuditProject", id: p._id });
        return res.status(200).json({ success: true, message: "Project updated.", data: p });
    } catch (err) { return fail(res, err); }
};

export const deleteProject = async (req, res) => {
    try {
        const p = mongoose.isValidObjectId(req.params.id) ? await AuditProjectModel.findOne({ _id: req.params.id, isDeleted: false }) : null;
        if (!p) throw httpError(404, "Project not found.");
        if (!(await canEditProject(req, p))) throw httpError(403, "Only the project's manager / partner or audit leadership can archive it.");
        if (await AuditEngagementModel.exists({ projectId: p._id, isDeleted: false, status: { $nin: ["Completed", "Cancelled"] } })) throw httpError(400, "It still has running engagements — complete, cancel or move them first.");
        p.isDeleted = true;
        await p.save();
        logAudit(req, "project.delete", `Archived project ${p.projectCode}`, { type: "AuditProject", id: p._id });
        return res.status(200).json({ success: true, message: "Project archived." });
    } catch (err) { return fail(res, err); }
};
