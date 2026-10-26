import mongoose from "mongoose";
import AuditEngagementModel from "../models/auditEngagementModel.js";
import AuditTimeLogModel from "../models/auditTimeLogModel.js";
import WorkflowTemplate from "../models/workflowTemplateModel.js";
import employeeModel from "../models/employeeModel.js";
import { logAudit } from "../utils/audit.js";
import { notify } from "../utils/notify.js";
import { closeStaleTimers, flagIfLong } from "../utils/timerGuard.js";
import { auditAccess, idStr } from "../utils/auditAccess.js";
import { normalizeTasks, hasCycle, AUTO_KEYS } from "../utils/auditTasks.js";
import { pickTemplate, migrationPlan, DEFAULT_STAGES } from "../utils/workflowTemplates.js";

/* One engagement's workflow: the manager / audit leadership shape its tasks (owner, reviewer,
   hours, dates, prerequisites, review and evidence rules), can publish it as the standard
   template for the audit type, and can move it to a newer template version under control.
   Time is logged against a task. */

const httpError = (status, message) => Object.assign(new Error(message), { status });
const fail = (res, err) => res.status(err.status || 500).json({ success: false, message: err.message });
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "task";
const txt = (v, n) => String(v ?? "").trim().slice(0, n);
const oid = (v) => (v && mongoose.isValidObjectId(v) ? v : null);

// configure = the engagement's manager or audit leadership; standard = audit leadership only
export const configureRights = async (req, audit) => {
    const a = await auditAccess(req, audit);
    return { configure: a.manage, standard: a.leader };
};

const cleanTasks = (incoming, existing, stages) => {
    if (!Array.isArray(incoming) || !incoming.length) throw httpError(400, "Add at least one task.");
    if (incoming.length > 120) throw httpError(400, "Keep the workflow under 120 tasks.");
    const byKey = new Map(existing.map((m) => [m.key, m]));
    const used = new Set();
    const out = incoming.map((m) => {
        const label = txt(m.label, 140);
        if (!label) throw httpError(400, "Every task needs a name.");
        let key = m.key && byKey.has(m.key) ? m.key : slug(label);
        while (used.has(key)) key = `${key}-${Math.random().toString(36).slice(2, 5)}`;
        used.add(key);
        const prev = byKey.get(key);
        const base = prev ? (prev.toObject?.() || prev) : { status: "Not Started", history: [], comments: [], attachments: [], reviewCycles: 0 };
        return {
            ...base,
            key, label, stage: AUTO_KEYS.includes(key) ? "Billing" : stages.includes(m.stage) ? m.stage : stages[0],
            description: txt(m.description, 4000), instructions: txt(m.instructions, 4000),
            deliverables: (Array.isArray(m.deliverables) ? m.deliverables : []).map((d) => txt(d, 200)).filter(Boolean).slice(0, 20),
            checklist: (Array.isArray(m.checklist) ? m.checklist : []).map((c) => (typeof c === "string" ? { text: c } : c)).map((c) => {
                const old = (base.checklist || []).find((x) => x.text === txt(c.text, 200));
                return { text: txt(c.text, 200), done: old?.done || false, doneBy: old?.doneBy, doneAt: old?.doneAt };
            }).filter((c) => c.text).slice(0, 30),
            priority: ["Low", "Medium", "High", "Critical"].includes(m.priority) ? m.priority : "Medium",
            dependsOn: [...new Set((Array.isArray(m.dependsOn) ? m.dependsOn : []).map(String))],
            mandatory: m.mandatory !== false, optional: !!m.optional,
            requiresReview: !!m.requiresReview, requiresEvidence: !!m.requiresEvidence,
            responsibleRole: txt(m.responsibleRole, 60), reviewerRole: txt(m.reviewerRole, 60), location: txt(m.location, 200),
            assignee: oid(m.assignee), reviewer: oid(m.reviewer),
            estimatedHours: Math.min(2000, Math.max(0, Number(m.estimatedHours) || 0)),
            plannedStart: m.plannedStart && !Number.isNaN(Date.parse(m.plannedStart)) ? new Date(m.plannedStart) : null,
            dueDate: m.dueDate && !Number.isNaN(Date.parse(m.dueDate)) ? new Date(m.dueDate) : null,
        };
    });
    const keys = new Set(out.map((t) => t.key));
    out.forEach((t) => { t.dependsOn = t.dependsOn.filter((k) => k !== t.key && keys.has(k)); });
    if (hasCycle(out)) throw httpError(400, "Those prerequisites go round in a circle — a task can't (indirectly) depend on itself.");
    for (const k of AUTO_KEYS) if (!keys.has(k) && byKey.has(k)) out.push(byKey.get(k).toObject?.() || byKey.get(k));
    return stages.flatMap((s) => out.filter((m) => m.stage === s));
};

// PUT /audits/:id/workflow { milestones: [...], saveAsStandard?, changeNote? }
export const saveWorkflow = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) throw httpError(404, "Audit not found.");
        const audit = await AuditEngagementModel.findOne({ _id: req.params.id, isDeleted: false });
        if (!audit) throw httpError(404, "Audit not found.");
        const rights = await configureRights(req, audit);
        if (!rights.configure) throw httpError(403, "Only the audit manager or audit leadership can change the workflow.");
        if (req.body?.saveAsStandard && !rights.standard) throw httpError(403, "Only audit leadership can change the standard workflow.");

        const stages = audit.stages?.length ? audit.stages : DEFAULT_STAGES;
        const before = new Map((audit.milestones || []).map((m) => [m.key, { a: idStr(m.assignee), r: idStr(m.reviewer) }]));
        const tasks = cleanTasks(req.body?.milestones, audit.milestones || [], stages);
        const people = [...new Set(tasks.flatMap((t) => [idStr(t.assignee), idStr(t.reviewer)]).filter(Boolean))];
        if (people.length && (await employeeModel.countDocuments({ _id: { $in: people }, status: "Active" })) !== people.length) throw httpError(400, "A task is assigned to someone who isn't an active employee.");
        if (tasks.some((t) => t.reviewer && idStr(t.reviewer) === idStr(t.assignee))) throw httpError(400, "A task's reviewer must be someone other than the person doing it.");

        const now = new Date();
        tasks.forEach((t) => {
            const b = before.get(t.key);
            if (!b) t.history = [...(t.history || []), { at: now, by: req.user.id, action: "created", to: t.status, note: "Added to the workflow" }];
            else {
                if (b.a !== idStr(t.assignee)) t.history = [...(t.history || []), { at: now, by: req.user.id, action: b.a ? "reassigned" : "assigned", note: "" }];
                if (b.r !== idStr(t.reviewer)) t.history = [...(t.history || []), { at: now, by: req.user.id, action: "reviewer", note: "" }];
            }
        });
        normalizeTasks(tasks);
        audit.milestones = tasks;
        audit.workflowUpdatedBy = req.user.id;
        audit.workflowUpdatedAt = now;
        audit.workflowHistory.push({ at: now, by: req.user.id, action: "edited", note: txt(req.body?.changeNote, 300) || `${tasks.length} tasks` });
        const team = new Set([idStr(audit.auditManager), ...(audit.teamMembers || []).map(idStr)]);
        people.forEach((p) => { if (!team.has(p)) audit.teamMembers.push(p); });
        await audit.save();

        let published = null;
        if (req.body?.saveAsStandard) {
            const family = `type-${String(audit.auditType).toLowerCase()}`;
            const last = await WorkflowTemplate.findOne({ family }).sort({ version: -1 }).lean();
            await WorkflowTemplate.updateMany({ family, status: "Active" }, { $set: { status: "Inactive" } });
            published = await WorkflowTemplate.create({
                family, name: last?.name || `${audit.auditType} audit`, auditType: audit.auditType, version: (last?.version || 0) + 1, status: "Active", stages,
                tasks: tasks.map((t) => ({ key: t.key, label: t.label, stage: t.stage, description: t.description, instructions: t.instructions, deliverables: t.deliverables, checklist: (t.checklist || []).map((c) => c.text), responsibleRole: t.responsibleRole, reviewerRole: t.reviewerRole, estimatedHours: t.estimatedHours, offsetDays: t.dueDate && audit.startDate ? Math.max(0, Math.round((new Date(t.dueDate) - new Date(audit.startDate)) / 864e5)) : 0, priority: t.priority, dependsOn: t.dependsOn, mandatory: t.mandatory, optional: t.optional, requiresReview: t.requiresReview, requiresEvidence: t.requiresEvidence })),
                changeNote: `Published from ${audit.auditCode}`, createdBy: req.user.id, activatedBy: req.user.id, activatedAt: now,
            });
        }

        tasks.forEach((t) => {
            const b = before.get(t.key) || {};
            const where = `${audit.clientName} (${audit.auditCode})`;
            if (t.assignee && idStr(t.assignee) !== b.a && idStr(t.assignee) !== String(req.user.id)) notify(t.assignee, "Audit task assigned to you", `${where}: “${t.label}”${t.dueDate ? ` — due ${new Date(t.dueDate).toLocaleDateString("en-IN")}` : ""}.`, "Audit", `/audits/${audit._id}?tab=workflow&task=${t.key}`);
            if (t.reviewer && idStr(t.reviewer) !== b.r && idStr(t.reviewer) !== String(req.user.id)) notify(t.reviewer, "You're reviewing an audit task", `${where}: “${t.label}”.`, "Audit", `/audits/${audit._id}?tab=workflow&task=${t.key}`);
        });
        logAudit(req, "audit.workflow", `Workflow updated on ${audit.auditCode} (${tasks.length} tasks)${published ? `; published as ${audit.auditType} standard v${published.version}` : ""}`, { type: "AuditEngagement", id: audit._id });
        return res.status(200).json({ success: true, message: published ? `Workflow saved — and published as the ${audit.auditType} standard (v${published.version}).` : "Workflow saved.", data: audit.milestones });
    } catch (err) { return fail(res, err); }
};

// GET /audits/workflow-template?type=&clientId=&projectId= — the template a new engagement would use
export const getWorkflowTemplate = async (req, res) => {
    try {
        const t = await pickTemplate({ auditType: String(req.query.type || ""), clientId: req.query.clientId, projectId: req.query.projectId });
        return res.status(200).json({ success: true, data: t?.tasks || [], template: t ? { _id: t._id, name: t.name, version: t.version, family: t.family, stages: t.stages } : null, custom: !!t && t.family !== "firm-standard" });
    } catch (err) { return fail(res, err); }
};

/* ---------------- controlled migration to a newer template version ---------------- */

// GET /audits/:id/workflow/migrate?templateId= — preview; POST — apply
export const migrateWorkflow = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) throw httpError(404, "Audit not found.");
        const audit = await AuditEngagementModel.findOne({ _id: req.params.id, isDeleted: false });
        if (!audit) throw httpError(404, "Audit not found.");
        if (!(await configureRights(req, audit)).configure) throw httpError(403, "Only the audit manager or audit leadership can change the workflow.");
        const templateId = req.query.templateId || req.body?.templateId;
        const template = templateId && mongoose.isValidObjectId(templateId)
            ? await WorkflowTemplate.findById(templateId).lean()
            : audit.workflowTemplate?.family ? await WorkflowTemplate.findOne({ family: audit.workflowTemplate.family, status: "Active" }).lean() : null;
        if (!template) throw httpError(404, "No template to move to.");
        const plan = migrationPlan(audit.milestones || [], template);
        const summary = { add: plan.add.map((t) => t.label), update: plan.update.map((t) => t.label), retire: plan.retire.map((t) => t.label), keep: plan.keep.length };
        if (req.method === "GET") return res.status(200).json({ success: true, data: { template: { _id: template._id, name: template.name, version: template.version }, ...summary } });

        const now = new Date();
        const note = `Moved to “${template.name}” v${template.version}`;
        for (const t of plan.update) {
            const cur = audit.milestones.find((m) => m.key === t.key);
            Object.assign(cur, { label: t.label, stage: t.stage, estimatedHours: t.estimatedHours, dependsOn: t.dependsOn, requiresReview: t.requiresReview, requiresEvidence: t.requiresEvidence, description: t.description, instructions: t.instructions });
            cur.history.push({ at: now, by: req.user.id, action: "migrated", note });
        }
        for (const t of plan.retire) {
            const cur = audit.milestones.find((m) => m.key === t.key);
            cur.history.push({ at: now, by: req.user.id, action: "cancel", from: cur.status, to: "Cancelled", note: `${note} — not in the new version` });
            cur.status = "Cancelled";
        }
        for (const t of plan.add) {
            audit.milestones.push({ key: t.key, label: t.label, stage: t.stage, description: t.description, instructions: t.instructions, deliverables: t.deliverables, checklist: (t.checklist || []).map((text) => ({ text })), responsibleRole: t.responsibleRole, reviewerRole: t.reviewerRole, estimatedHours: t.estimatedHours, priority: t.priority, dependsOn: t.dependsOn, mandatory: t.mandatory, optional: t.optional, requiresReview: t.requiresReview, requiresEvidence: t.requiresEvidence, dueDate: audit.startDate ? new Date(new Date(audit.startDate).getTime() + (t.offsetDays || 0) * 864e5) : null, status: "Not Started", history: [{ at: now, by: req.user.id, action: "created", note }] });
        }
        const stages = template.stages?.length ? template.stages : DEFAULT_STAGES;
        audit.milestones = stages.flatMap((s) => audit.milestones.filter((m) => m.stage === s)).concat(audit.milestones.filter((m) => !stages.includes(m.stage)));
        audit.stages = stages;
        normalizeTasks(audit.milestones);
        audit.workflowTemplate = { id: template._id, name: template.name, version: template.version, family: template.family };
        audit.workflowHistory.push({ at: now, by: req.user.id, action: "migrated", note: `${note}: +${plan.add.length} added, ${plan.update.length} updated, ${plan.retire.length} retired` });
        await audit.save();
        logAudit(req, "audit.workflow_migrate", `${audit.auditCode}: ${note}`, { type: "AuditEngagement", id: audit._id });
        return res.status(200).json({ success: true, message: `${note}. ${plan.add.length} added, ${plan.update.length} updated, ${plan.retire.length} retired; work in progress was kept.`, data: summary });
    } catch (err) { return fail(res, err); }
};

/* ---------------- time against a task ---------------- */

const stepOf = (audit, key) => {
    if (!key) return null;
    const m = (audit.milestones || []).find((x) => x.key === key);
    if (!m) throw httpError(400, "That workflow task doesn't exist on this audit.");
    if (AUTO_KEYS.includes(m.key)) throw httpError(400, "Billing steps are recorded by Accounts — pick a work task.");
    if (m.status === "Cancelled") throw httpError(400, "That task was cancelled.");
    return m;
};
export const resolveStep = (audit, key) => { const m = stepOf(audit, key); return m ? { milestoneKey: m.key, milestoneLabel: m.label } : { milestoneKey: "", milestoneLabel: "" }; };

// PUT /audits/timelogs/:id/step { step } — the person who logged it (while not approved), or the manager
export const setLogStep = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) throw httpError(404, "Session not found.");
        const log = await AuditTimeLogModel.findById(req.params.id);
        if (!log) throw httpError(404, "Session not found.");
        const audit = await AuditEngagementModel.findById(log.auditId);
        if (!audit) throw httpError(404, "Audit not found.");
        const mine = idStr(log.employeeId) === String(req.user.id);
        const { configure } = await configureRights(req, audit);
        if (!mine && !configure) throw httpError(403, "Only the person who logged it or the audit manager can change its task.");
        if (log.billedInvoice) throw httpError(400, "This session is already billed.");
        if (mine && !configure && ["Submitted", "Approved"].includes(log.status)) throw httpError(400, `This time is ${log.status.toLowerCase()} — ask your manager to change it.`);
        Object.assign(log, resolveStep(audit, req.body?.step));
        await log.save();
        return res.status(200).json({ success: true, message: log.milestoneLabel ? `Moved to “${log.milestoneLabel}”.` : "Task cleared.", data: log });
    } catch (err) { return fail(res, err); }
};

// POST /audits/:id/timer/switch { step } — close the running session and carry on under another task
export const switchTimerStep = async (req, res) => {
    try {
        await closeStaleTimers({ employeeId: req.user.id });
        const log = await AuditTimeLogModel.findOne({ auditId: req.params.id, employeeId: req.user.id, endTime: null });
        if (!log) throw httpError(404, "You have no running timer on this audit.");
        const audit = await AuditEngagementModel.findById(req.params.id);
        const step = resolveStep(audit, req.body?.step);
        if (step.milestoneKey === log.milestoneKey) return res.status(200).json({ success: true, message: "Already on that task.", data: log });
        const now = new Date();
        if (now - log.startTime < 60000) {
            Object.assign(log, step);
            await log.save();
            return res.status(200).json({ success: true, message: `Now on “${step.milestoneLabel || "General"}”.`, data: log });
        }
        log.endTime = now;
        log.durationMinutes = Math.max(0, Math.round((now - log.startTime) / 60000));
        log.stopLocation = log.startLocation;
        flagIfLong(log);
        await log.save();
        const next = await AuditTimeLogModel.create({ auditId: log.auditId, employeeId: log.employeeId, startTime: now, workDate: log.workDate, startLocation: log.startLocation, entryType: "timer", ...step });
        return res.status(201).json({ success: true, message: `Switched to “${step.milestoneLabel || "General"}”.`, data: next });
    } catch (err) { return fail(res, err); }
};
