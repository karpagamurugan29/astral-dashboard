import mongoose from "mongoose";
import WorkflowTemplate from "../models/workflowTemplateModel.js";
import AuditEngagementModel from "../models/auditEngagementModel.js";
import { logAudit } from "../utils/audit.js";
import { isAuditLeader, canCreateAudits } from "../utils/auditAccess.js";
import { ensureTemplates, DEFAULT_STAGES } from "../utils/workflowTemplates.js";
import { hasCycle } from "../utils/auditTasks.js";

/* Workflow template library (Audits → Workflow templates). Audit leadership create, edit drafts,
   version, duplicate, activate and deactivate; managers can browse and pick them.
   An Active version is never edited in place — changes go into a new version. */

const httpError = (status, message) => Object.assign(new Error(message), { status });
const fail = (res, err) => res.status(err.status || 500).json({ success: false, message: err.message });
const txt = (v, n) => String(v ?? "").trim().slice(0, n);
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "task";
const mustLead = async (req) => { if (!(await isAuditLeader(req))) throw httpError(403, "Only audit leadership (Partners, Directors, Senior Managers, Admin) can change workflow templates."); };
const mustSee = async (req) => { if (!(await canCreateAudits(req))) throw httpError(403, "Workflow templates are for managers and audit leadership."); };

const clean = (b, current = {}) => {
    const stages = (Array.isArray(b.stages) && b.stages.length ? b.stages : current.stages || DEFAULT_STAGES).map((s) => txt(s, 40)).filter(Boolean);
    if (new Set(stages).size !== stages.length) throw httpError(400, "Stage names must be different.");
    const used = new Set();
    const tasks = (Array.isArray(b.tasks) ? b.tasks : current.tasks || []).map((t) => {
        const label = txt(t.label, 140);
        if (!label) throw httpError(400, "Every task needs a name.");
        let key = txt(t.key, 40) || slug(label);
        while (used.has(key)) key = `${key}-${Math.random().toString(36).slice(2, 5)}`;
        used.add(key);
        return {
            key, label, stage: stages.includes(t.stage) ? t.stage : stages[0],
            description: txt(t.description, 4000), instructions: txt(t.instructions, 4000),
            deliverables: (t.deliverables || []).map((d) => txt(d, 200)).filter(Boolean).slice(0, 20),
            checklist: (t.checklist || []).map((d) => txt(typeof d === "string" ? d : d.text, 200)).filter(Boolean).slice(0, 30),
            responsibleRole: txt(t.responsibleRole, 60), reviewerRole: txt(t.reviewerRole, 60),
            estimatedHours: Math.min(2000, Math.max(0, Number(t.estimatedHours) || 0)), offsetDays: Math.min(730, Math.max(0, Math.round(Number(t.offsetDays) || 0))),
            priority: ["Low", "Medium", "High", "Critical"].includes(t.priority) ? t.priority : "Medium",
            dependsOn: [...new Set((t.dependsOn || []).map(String))], mandatory: t.mandatory !== false, optional: !!t.optional, condition: txt(t.condition, 200),
            requiresReview: !!t.requiresReview, requiresEvidence: !!t.requiresEvidence,
        };
    });
    if (!tasks.length) throw httpError(400, "Add at least one task.");
    const keys = new Set(tasks.map((t) => t.key));
    tasks.forEach((t) => { t.dependsOn = t.dependsOn.filter((k) => k !== t.key && keys.has(k)); });
    if (hasCycle(tasks)) throw httpError(400, "Those prerequisites go round in a circle.");
    const esc = b.escalation || current.escalation || {};
    return {
        name: txt(b.name ?? current.name, 120) || "Untitled workflow", description: txt(b.description ?? current.description, 1000),
        auditType: txt(b.auditType ?? current.auditType, 40),
        scope: { clientId: mongoose.isValidObjectId(b.scope?.clientId) ? b.scope.clientId : (b.scope ? null : current.scope?.clientId || null), projectId: mongoose.isValidObjectId(b.scope?.projectId) ? b.scope.projectId : (b.scope ? null : current.scope?.projectId || null) },
        stages, tasks: stages.flatMap((s) => tasks.filter((t) => t.stage === s)),
        escalation: { remindBeforeDays: Math.min(30, Math.max(0, Number(esc.remindBeforeDays ?? 1))), escalateAfterDays: Math.min(60, Math.max(0, Number(esc.escalateAfterDays ?? 2))), escalateTo: esc.escalateTo === "partner" ? "partner" : "manager" },
        changeNote: txt(b.changeNote, 300),
    };
};

// GET /workflow-templates — every family with its versions (newest first)
export const listTemplates = async (req, res) => {
    try {
        await mustSee(req);
        await ensureTemplates();
        const all = await WorkflowTemplate.find().select("-tasks.description -tasks.instructions").populate("scope.clientId", "name").populate("scope.projectId", "name").sort({ family: 1, version: -1 }).lean();
        const usage = await AuditEngagementModel.aggregate([{ $match: { isDeleted: false, "workflowTemplate.id": { $ne: null } } }, { $group: { _id: "$workflowTemplate.id", n: { $sum: 1 } } }]);
        const used = new Map(usage.map((u) => [String(u._id), u.n]));
        const families = new Map();
        all.forEach((t) => {
            if (!families.has(t.family)) families.set(t.family, []);
            families.get(t.family).push({ ...t, taskCount: t.tasks.length, hours: t.tasks.reduce((h, x) => h + (x.estimatedHours || 0), 0), engagements: used.get(String(t._id)) || 0, tasks: undefined });
        });
        return res.status(200).json({ success: true, data: [...families.entries()].map(([family, versions]) => ({ family, active: versions.find((v) => v.status === "Active") || null, latest: versions[0], versions })), canEdit: await isAuditLeader(req) });
    } catch (err) { return fail(res, err); }
};

export const getTemplate = async (req, res) => {
    try {
        await mustSee(req);
        if (!mongoose.isValidObjectId(req.params.id)) throw httpError(404, "Template not found.");
        const t = await WorkflowTemplate.findById(req.params.id).populate("scope.clientId", "name").populate("scope.projectId", "name").lean();
        if (!t) throw httpError(404, "Template not found.");
        return res.status(200).json({ success: true, data: t, canEdit: await isAuditLeader(req) });
    } catch (err) { return fail(res, err); }
};

// POST /workflow-templates — a new template (Draft)
export const createTemplate = async (req, res) => {
    try {
        await mustLead(req);
        const body = clean(req.body || {});
        const family = `${slug(body.name)}-${Date.now().toString(36)}`;
        const t = await WorkflowTemplate.create({ ...body, family, version: 1, status: "Draft", createdBy: req.user.id });
        logAudit(req, "workflow.create", `Created workflow template “${t.name}”`, { type: "WorkflowTemplate", id: t._id });
        return res.status(201).json({ success: true, message: "Template created as a draft.", data: t });
    } catch (err) { return fail(res, err); }
};

// PUT /workflow-templates/:id — drafts only
export const updateTemplate = async (req, res) => {
    try {
        await mustLead(req);
        const t = mongoose.isValidObjectId(req.params.id) ? await WorkflowTemplate.findById(req.params.id) : null;
        if (!t) throw httpError(404, "Template not found.");
        if (t.status !== "Draft") throw httpError(409, `v${t.version} is ${t.status.toLowerCase()} — create a new version to change it, so engagements using it aren't affected.`);
        Object.assign(t, clean(req.body || {}, t.toObject()));
        await t.save();
        return res.status(200).json({ success: true, message: "Draft saved.", data: t });
    } catch (err) { return fail(res, err); }
};

// POST /workflow-templates/:id/version — copy into a new Draft version of the same template
export const newVersion = async (req, res) => {
    try {
        await mustLead(req);
        const t = mongoose.isValidObjectId(req.params.id) ? await WorkflowTemplate.findById(req.params.id).lean() : null;
        if (!t) throw httpError(404, "Template not found.");
        const draft = await WorkflowTemplate.findOne({ family: t.family, status: "Draft" });
        if (draft) return res.status(200).json({ success: true, message: `v${draft.version} is already a draft — continue there.`, data: draft });
        const last = await WorkflowTemplate.findOne({ family: t.family }).sort({ version: -1 }).lean();
        const { _id, createdAt, updatedAt, activatedAt, activatedBy, ...rest } = t;
        const v = await WorkflowTemplate.create({ ...rest, version: last.version + 1, status: "Draft", changeNote: "", createdBy: req.user.id });
        return res.status(201).json({ success: true, message: `Draft v${v.version} created.`, data: v });
    } catch (err) { return fail(res, err); }
};

// POST /workflow-templates/:id/duplicate — a separate template to adapt
export const duplicateTemplate = async (req, res) => {
    try {
        await mustLead(req);
        const t = mongoose.isValidObjectId(req.params.id) ? await WorkflowTemplate.findById(req.params.id).lean() : null;
        if (!t) throw httpError(404, "Template not found.");
        const { _id, createdAt, updatedAt, activatedAt, activatedBy, family, ...rest } = t;
        const name = txt(req.body?.name, 120) || `${t.name} (copy)`;
        const copy = await WorkflowTemplate.create({ ...rest, name, family: `${slug(name)}-${Date.now().toString(36)}`, version: 1, status: "Draft", changeNote: `Copied from “${t.name}” v${t.version}`, createdBy: req.user.id });
        return res.status(201).json({ success: true, message: "Copy created as a draft.", data: copy });
    } catch (err) { return fail(res, err); }
};

// POST /workflow-templates/:id/activate — this version becomes the one new engagements use
export const activateTemplate = async (req, res) => {
    try {
        await mustLead(req);
        const t = mongoose.isValidObjectId(req.params.id) ? await WorkflowTemplate.findById(req.params.id) : null;
        if (!t) throw httpError(404, "Template not found.");
        await WorkflowTemplate.updateMany({ family: t.family, status: "Active", _id: { $ne: t._id } }, { $set: { status: "Inactive" } });
        t.status = "Active"; t.activatedBy = req.user.id; t.activatedAt = new Date();
        if (req.body?.changeNote) t.changeNote = txt(req.body.changeNote, 300);
        await t.save();
        const behind = await AuditEngagementModel.countDocuments({ isDeleted: false, status: { $nin: ["Completed", "Cancelled"] }, "workflowTemplate.family": t.family, "workflowTemplate.version": { $lt: t.version } });
        logAudit(req, "workflow.activate", `Activated “${t.name}” v${t.version}`, { type: "WorkflowTemplate", id: t._id });
        return res.status(200).json({ success: true, message: `v${t.version} is now active for new engagements.${behind ? ` ${behind} running engagement${behind === 1 ? " uses" : "s use"} an older version — they keep it until their manager moves them.` : ""}`, data: t });
    } catch (err) { return fail(res, err); }
};

export const deactivateTemplate = async (req, res) => {
    try {
        await mustLead(req);
        const t = mongoose.isValidObjectId(req.params.id) ? await WorkflowTemplate.findById(req.params.id) : null;
        if (!t) throw httpError(404, "Template not found.");
        if (t.family === "firm-standard" && t.status === "Active" && !(await WorkflowTemplate.exists({ status: "Active", _id: { $ne: t._id }, auditType: "", "scope.clientId": null, "scope.projectId": null }))) throw httpError(400, "Keep the firm standard active — it's the fallback for every audit type.");
        t.status = "Inactive";
        await t.save();
        logAudit(req, "workflow.deactivate", `Deactivated “${t.name}” v${t.version}`, { type: "WorkflowTemplate", id: t._id });
        return res.status(200).json({ success: true, message: "Deactivated — new engagements won't use it.", data: t });
    } catch (err) { return fail(res, err); }
};
