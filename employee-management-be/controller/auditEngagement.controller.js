import mongoose from "mongoose";
import AuditEngagementModel from "../models/auditEngagementModel.js";
import AuditTimeLogModel from "../models/auditTimeLogModel.js";
import AuditClientModel from "../models/auditClientModel.js";
import AuditProjectModel from "../models/auditProjectModel.js";
import WorkflowTemplate from "../models/workflowTemplateModel.js";
import employeeModel from "../models/employeeModel.js";
import { PERSON, summarise, findOrCreateClientByName, linkLegacyAudits } from "../utils/auditShared.js";
import { logAudit } from "../utils/audit.js";
import { notify } from "../utils/notify.js";
import { parseLocation, fillAddressLater, LOCATION_REQUIRED } from "../utils/location.js";
import { canSeeMoney } from "../utils/money.js";
import { auditAccess, visibleAuditFilter, canCreateAudits, onTeam, idStr } from "../utils/auditAccess.js";
import { normalizeTasks, allowedActions, completionBlockers, depsMet } from "../utils/auditTasks.js";
import { pickTemplate, instantiate, DEFAULT_STAGES } from "../utils/workflowTemplates.js";
import { resolveStep, configureRights } from "./auditWorkflow.controller.js";
import { closeStaleTimers, flagIfLong } from "../utils/timerGuard.js";

/* Audit engagements: create (from a workflow template), view, edit, team, timer.
   Access rules live in utils/auditAccess.js; task rules in utils/auditTasks.js. */

const CLIENT = "name clientCode city contactPerson phone email";
const PROJECT = "projectCode name financialYear manager partner budgetHours budgetFee endDate status";
const fail = (res, err) => res.status(err.status || 500).json({ success: false, message: err.message });
const httpError = (status, message) => Object.assign(new Error(message), { status });
const ymd = (d) => new Date(d).toLocaleDateString("en-CA", { timeZone: process.env.COMPANY_TIMEZONE || "Asia/Kolkata" });
// minutes between two instants (the old helper returned the stored 0 once endTime was set)
const elapsed = (start, end) => Math.max(0, Math.round((new Date(end) - new Date(start)) / 60000));

const resolveClient = async (body, userId) => {
    if (body.clientId) {
        if (!mongoose.isValidObjectId(body.clientId)) throw httpError(400, "Client not found");
        const client = await AuditClientModel.findOne({ _id: body.clientId, isDeleted: false });
        if (!client) throw httpError(400, "Client not found");
        return client;
    }
    if (body.clientName) return findOrCreateClientByName(body.clientName, userId);
    return null;
};
const resolveProject = async (projectId, clientId) => {
    if (!projectId) return null;
    if (!mongoose.isValidObjectId(projectId)) throw httpError(400, "Project not found.");
    const p = await AuditProjectModel.findOne({ _id: projectId, isDeleted: false });
    if (!p) throw httpError(400, "Project not found.");
    if (String(p.clientId) !== String(clientId)) throw httpError(400, "That project belongs to a different company.");
    return p;
};
const activePeople = async (ids) => {
    const list = [...new Set(ids.filter(Boolean).map(String))];
    if (list.some((x) => !mongoose.isValidObjectId(x))) throw httpError(400, "Pick valid people for the team.");
    const n = await employeeModel.countDocuments({ _id: { $in: list }, status: "Active" });
    if (n !== list.length) throw httpError(400, "Everyone on the engagement must be an active employee.");
};
const checkDates = (start, end) => {
    if (start && end && new Date(end) < new Date(start)) throw httpError(400, "The end date can't be before the start date.");
};
const loadAudit = async (req, id) => {
    if (!mongoose.isValidObjectId(id)) throw httpError(404, "Audit not found");
    const audit = await AuditEngagementModel.findOne({ _id: id, isDeleted: false });
    if (!audit) throw httpError(404, "Audit not found");
    const project = audit.projectId ? await AuditProjectModel.findById(audit.projectId).lean() : null;
    return { audit, project, access: await auditAccess(req, audit, project) };
};

export const createAudit = async (req, res) => {
    try {
        if (!(await canCreateAudits(req))) throw httpError(403, "Only managers and audit leadership can create engagements.");
        const b = req.body || {};
        if (!String(b.auditCode || "").trim()) throw httpError(400, "Give the engagement a code.");
        if (await AuditEngagementModel.findOne({ auditCode: String(b.auditCode).trim() })) throw httpError(409, "An audit with this code already exists");
        const client = await resolveClient(b, req.user.id);
        if (!client) throw httpError(400, "Choose the client this audit is for");
        const project = await resolveProject(b.projectId, client._id);
        checkDates(b.startDate, b.endDate);
        if (!b.auditManager) throw httpError(400, "Choose the audit manager.");
        await activePeople([b.auditManager, ...(b.teamMembers || [])]);

        // workflow: the template picked in the form, else the most specific active one
        let template = null;
        if (b.workflowTemplateId) {
            template = mongoose.isValidObjectId(b.workflowTemplateId) ? await WorkflowTemplate.findOne({ _id: b.workflowTemplateId, status: "Active" }).lean() : null;
            if (!template) throw httpError(400, "That workflow template isn't active.");
        } else template = await pickTemplate({ auditType: b.auditType || "Statutory", clientId: client._id, projectId: project?._id });
        const tasks = template ? await instantiate(template, { startDate: b.startDate, auditManager: b.auditManager, teamMembers: b.teamMembers || [] }) : [];
        normalizeTasks(tasks);

        const { milestones, workflowTemplate, completionOverride, workflowHistory, workflowTemplateId, ...safe } = b;
        const audit = await AuditEngagementModel.create({
            ...safe, auditCode: String(b.auditCode).trim(), clientId: client._id, clientName: client.name, projectId: project?._id || null, createdBy: req.user.id,
            milestones: tasks, stages: template?.stages || DEFAULT_STAGES,
            workflowTemplate: template ? { id: template._id, name: template.name, version: template.version, family: template.family } : undefined,
            workflowHistory: template ? [{ by: req.user.id, action: "generated", note: `${template.name} v${template.version} — ${tasks.length} tasks` }] : [],
        });

        logAudit(req, "audit.create", `Created audit ${audit.auditCode} for ${audit.clientName}${template ? ` from “${template.name}” v${template.version}` : ""}`, { type: "AuditEngagement", id: audit._id });
        [...new Set([String(audit.auditManager), ...(audit.teamMembers || []).map(String)])].forEach((id) =>
            notify(id, "Assigned to an audit", `You have been assigned to ${audit.clientName} (${audit.auditCode}).`, "Audit", `/audits/${audit._id}`));
        const mine = new Map();
        tasks.forEach((t) => { if (t.assignee) mine.set(String(t.assignee), (mine.get(String(t.assignee)) || 0) + 1); });
        mine.forEach((n, id) => notify(id, "Audit tasks assigned to you", `${audit.clientName} (${audit.auditCode}): ${n} task${n === 1 ? "" : "s"} — see My Work.`, "Audit", "/my-work"));

        return res.status(201).json({ success: true, message: "Audit created successfully", data: audit });
    } catch (err) { return fail(res, err); }
};

export const updateAudit = async (req, res) => {
    try {
        const { audit, access } = await loadAudit(req, req.params.id);
        if (!access.manage) throw httpError(403, "Only the engagement's manager or audit leadership can change it.");
        const update = { ...req.body };
        ["clientName", "milestones", "auditCode", "workflowTemplate", "workflowHistory", "completionOverride", "createdBy", "isDeleted", "stages"].forEach((k) => delete update[k]);
        if (!(await canSeeMoney(req))) delete update.fee;
        if (update.clientId && String(update.clientId) !== String(audit.clientId)) {
            const client = await resolveClient({ clientId: update.clientId }, req.user.id);
            update.clientName = client.name;
        }
        if (update.projectId !== undefined) update.projectId = (await resolveProject(update.projectId || null, update.clientId || audit.clientId))?._id || null;
        checkDates(update.startDate || audit.startDate, update.endDate || audit.endDate);
        if (update.auditManager || update.teamMembers) await activePeople([update.auditManager || audit.auditManager, ...(update.teamMembers || [])]);

        // completing needs every mandatory task done — or audit leadership overriding with a reason
        if (update.status === "Completed" && audit.status !== "Completed") {
            normalizeTasks(audit.milestones);
            const open = completionBlockers(audit.milestones);
            if (open.length) {
                if (!(access.leader && String(req.body.overrideReason || "").trim())) {
                    throw httpError(400, `${open.length} mandatory task${open.length === 1 ? " is" : "s are"} still open (${open.slice(0, 3).map((t) => t.label).join(", ")}${open.length > 3 ? "…" : ""}). Finish or cancel them first${access.leader ? ", or give an override reason" : ""}.`);
                }
                update.completionOverride = { by: req.user.id, at: new Date(), reason: String(req.body.overrideReason).slice(0, 500) };
            }
        }
        delete update.overrideReason;

        Object.assign(audit, update);
        await audit.save();
        logAudit(req, "audit.update", `Updated audit ${audit.auditCode}${update.status ? ` (status ${update.status}${update.completionOverride ? ", completion override" : ""})` : ""}`, { type: "AuditEngagement", id: audit._id });
        return res.status(200).json({ success: true, message: "Audit updated successfully", data: audit });
    } catch (err) { return fail(res, err); }
};

export const deleteAudit = async (req, res) => {
    try {
        const { audit, access } = await loadAudit(req, req.params.id);
        if (!access.manage) throw httpError(403, "Only the engagement's manager or audit leadership can archive it.");
        audit.isDeleted = true;
        await audit.save();
        const now = new Date();
        const running = await AuditTimeLogModel.find({ auditId: audit._id, endTime: null });
        await Promise.all(running.map((l) => { l.endTime = now; l.durationMinutes = elapsed(l.startTime, now); return l.save(); }));
        logAudit(req, "audit.delete", `Archived audit ${audit.auditCode}`, { type: "AuditEngagement", id: audit._id });
        return res.status(200).json({ success: true, message: "Audit archived successfully" });
    } catch (err) { return fail(res, err); }
};

export const getAllAudits = async (req, res) => {
    try {
        await linkLegacyAudits();
        const filter = { isDeleted: false, ...(await visibleAuditFilter(req)) };
        if (req.query.clientId && mongoose.isValidObjectId(req.query.clientId)) filter.clientId = req.query.clientId;
        if (req.query.projectId && mongoose.isValidObjectId(req.query.projectId)) filter.projectId = req.query.projectId;

        const audits = await AuditEngagementModel.find(filter)
            .select("-milestones.comments -milestones.history -milestones.attachments")
            .populate("clientId", CLIENT).populate("projectId", PROJECT)
            .populate("auditManager", PERSON).populate("teamMembers", PERSON)
            .sort({ createdAt: -1 }).lean();

        const logs = await AuditTimeLogModel.find({ auditId: { $in: audits.map((a) => a._id) } }).select("auditId employeeId startTime endTime durationMinutes").lean();
        const byAudit = {};
        logs.forEach((l) => { (byAudit[l.auditId] ||= []).push(l); });
        const now = new Date();
        const data = audits.map((a) => {
            const mine = byAudit[a._id] || [];
            const s = summarise(mine);
            const tasks = a.milestones || [];
            normalizeTasks(tasks);
            const { milestones, ...rest } = a;
            return {
                ...rest,
                taskSummary: { total: tasks.length, done: tasks.filter((t) => t.done).length, overdue: tasks.filter((t) => !t.done && t.status !== "Cancelled" && t.dueDate && new Date(t.dueDate) < now).length, blocked: tasks.filter((t) => t.status === "Blocked").length, inReview: tasks.filter((t) => ["Submitted", "Under Review"].includes(t.status)).length },
                timeSummary: { totalMinutes: s.totalMinutes, daysWorked: s.daysWorked, sessions: s.sessions, activeNow: [...new Set(mine.filter((l) => !l.endTime).map((l) => String(l.employeeId)))] },
            };
        });
        if (!(await canSeeMoney(req))) data.forEach((d) => { delete d.fee; });
        return res.status(200).json({ success: true, data });
    } catch (err) { return fail(res, err); }
};

export const getAuditById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) throw httpError(404, "Audit not found");
        const raw = await AuditEngagementModel.findOne({ _id: id, isDeleted: false });
        if (!raw) throw httpError(404, "Audit not found");
        const project = raw.projectId ? await AuditProjectModel.findById(raw.projectId).populate("manager partner", PERSON).lean() : null;
        const access = await auditAccess(req, raw, project);
        if (!access.view) throw httpError(403, "You are not assigned to this audit");

        // older engagements: generate tasks once, and bring the old tick into the task lifecycle
        if (!raw.milestones?.length) {
            const template = await pickTemplate({ auditType: raw.auditType, clientId: raw.clientId, projectId: raw.projectId });
            if (template) {
                raw.milestones = await instantiate(template, { startDate: raw.startDate, auditManager: raw.auditManager, teamMembers: raw.teamMembers });
                raw.stages = template.stages;
                raw.workflowTemplate = { id: template._id, name: template.name, version: template.version, family: template.family };
            }
        }
        normalizeTasks(raw.milestones);
        if (raw.isModified()) await raw.save();

        await closeStaleTimers({ auditId: raw._id });
        const audit = await AuditEngagementModel.findById(id)
            .populate("clientId", CLIENT).populate("auditManager", PERSON).populate("teamMembers", PERSON)
            .populate("milestones.assignee", PERSON).populate("milestones.reviewer", PERSON)
            .populate("milestones.comments.by", PERSON).populate("milestones.history.by", "firstName lastName")
            .populate("milestones.attachments.uploadedBy", "firstName lastName")
            .lean();
        const logs = await AuditTimeLogModel.find({ auditId: id }).populate("employeeId", PERSON).populate("approvedBy", "firstName lastName").sort({ startTime: -1 }).lean();

        // what this viewer may do on each task; Finance never sees workpapers or review comments
        const plain = audit.milestones;
        audit.milestones = plain.map((t) => ({
            ...t,
            comments: access.workpapers ? t.comments : [],
            attachments: access.workpapers ? (t.attachments || []).map((a) => ({ ...a, url: `/audits/${id}/tasks/${t.key}/files/${a.fileId}` })) : [],
            history: access.workpapers ? t.history : [],
            actions: allowedActions(t, plain, access),
        }));
        const people = new Map();
        [audit.auditManager, ...(audit.teamMembers || [])].filter(Boolean).forEach((p) => people.set(String(p._id), { employee: p, logs: [] }));
        logs.forEach((l) => {
            const key = String(l.employeeId?._id || l.employeeId);
            if (!people.has(key)) people.set(key, { employee: l.employeeId, logs: [] });
            people.get(key).logs.push(l);
        });
        const byEmployee = [...people.values()].map(({ employee, logs: mine }) => ({ employee, ...summarise(mine) }));
        const money = await canSeeMoney(req);
        if (!money) delete audit.fee;
        const rights = await configureRights(req, raw);
        const latest = audit.workflowTemplate?.family ? await WorkflowTemplate.findOne({ family: audit.workflowTemplate.family, status: "Active" }).select("version name").lean() : null;

        return res.status(200).json({
            success: true,
            data: {
                ...audit, project, stages: audit.stages?.length ? audit.stages : DEFAULT_STAGES,
                timeSummary: summarise(logs), byEmployee, logs, canSeeMoney: money,
                canConfigure: rights.configure, canSetStandard: rights.standard,
                newerTemplate: latest && latest.version > (audit.workflowTemplate?.version || 0) ? latest : null,
                access: { manage: access.manage, leader: access.leader, member: access.member, workpapers: access.workpapers, finance: access.finance },
            },
        });
    } catch (err) { return fail(res, err); }
};

export const addAuditMember = async (req, res) => {
    try {
        const { audit, access } = await loadAudit(req, req.params.id);
        if (!access.manage) throw httpError(403, "Only the engagement's manager or audit leadership can change the team.");
        const { employeeId } = req.body || {};
        await activePeople([employeeId]);
        if (onTeam(audit, employeeId)) return res.status(200).json({ success: true, message: "Already on the team", data: audit });
        audit.teamMembers.push(employeeId);
        await audit.save();
        notify(employeeId, "Assigned to an audit", `You have been assigned to ${audit.clientName} (${audit.auditCode}).`, "Audit", `/audits/${audit._id}`);
        logAudit(req, "audit.member_add", `Added a member to ${audit.auditCode}`, { type: "AuditEngagement", id: audit._id });
        return res.status(200).json({ success: true, message: "Member added successfully", data: audit });
    } catch (err) { return fail(res, err); }
};

export const removeAuditMember = async (req, res) => {
    try {
        const { audit, access } = await loadAudit(req, req.params.id);
        if (!access.manage) throw httpError(403, "Only the engagement's manager or audit leadership can change the team.");
        const { userId } = req.params;
        if (idStr(audit.auditManager) === String(userId)) throw httpError(400, "Change the audit manager instead of removing them.");
        audit.teamMembers = audit.teamMembers.filter((m) => String(m) !== String(userId));
        // their open tasks go back to the manager to reassign; history and logged time stay
        audit.milestones.forEach((t) => {
            if (idStr(t.assignee) === String(userId) && !t.done && t.status !== "Cancelled") {
                t.history.push({ at: new Date(), by: req.user.id, action: "unassigned", note: "Removed from the engagement" });
                t.assignee = null;
            }
            if (idStr(t.reviewer) === String(userId)) t.reviewer = null;
        });
        normalizeTasks(audit.milestones);
        await audit.save();
        const now = new Date();
        const running = await AuditTimeLogModel.findOne({ auditId: audit._id, employeeId: userId, endTime: null });
        if (running) { running.endTime = now; running.durationMinutes = elapsed(running.startTime, now); await running.save(); }
        logAudit(req, "audit.member_remove", `Removed a member from ${audit.auditCode}`, { type: "AuditEngagement", id: audit._id });
        return res.status(200).json({ success: true, message: "Member removed successfully", data: audit });
    } catch (err) { return fail(res, err); }
};

/* ---------------------------------- timer --------------------------------- */

export const startAuditTimer = async (req, res) => {
    try {
        await closeStaleTimers({ employeeId: req.user.id });
        const { audit } = await loadAudit(req, req.params.id);
        const location = parseLocation(req.body);
        if (!location) throw httpError(400, LOCATION_REQUIRED);
        if (!onTeam(audit, req.user.id)) throw httpError(403, "Only people assigned to this audit can log time on it");
        if (["Completed", "Cancelled"].includes(audit.status)) throw httpError(400, `This audit is ${audit.status.toLowerCase()} — time can no longer be logged`);

        const running = await AuditTimeLogModel.findOne({ employeeId: req.user.id, endTime: null }).populate("auditId", "auditCode clientName");
        if (running) {
            const where = String(running.auditId?._id) === String(audit._id) ? "this audit" : `${running.auditId?.clientName || "another audit"} (${running.auditId?.auditCode || ""})`;
            throw httpError(409, `Your timer is already running on ${where}. Stop it first.`);
        }
        const step = resolveStep(audit, req.body?.step);
        const now = new Date();
        const log = await AuditTimeLogModel.create({ auditId: audit._id, employeeId: req.user.id, startTime: now, workDate: ymd(now), startLocation: location, entryType: "timer", ...step });
        fillAddressLater(location, (addr) => AuditTimeLogModel.updateOne({ _id: log._id }, { "startLocation.address": addr }).catch(() => {}));

        // starting work moves a planned audit into fieldwork, and the person's ready task into progress
        if (audit.status === "Planning") audit.status = "Fieldwork";
        const task = step.milestoneKey && audit.milestones.find((t) => t.key === step.milestoneKey);
        if (task && ["Assigned", "Ready", "Not Started"].includes(task.status) && (idStr(task.assignee) === String(req.user.id) || !task.assignee) && depsMet(task, audit.milestones)) {
            task.history.push({ at: now, by: req.user.id, action: "start", from: task.status, to: "In Progress", note: "Timer started" });
            task.status = "In Progress"; task.startedAt = task.startedAt || now;
            if (!task.assignee) task.assignee = req.user.id;
        }
        if (audit.isModified()) await audit.save();
        return res.status(201).json({ success: true, message: "Timer started", data: log });
    } catch (err) { return fail(res, err); }
};

export const stopAuditTimer = async (req, res) => {
    try {
        const location = parseLocation(req.body);
        if (!location) throw httpError(400, LOCATION_REQUIRED);
        const log = await AuditTimeLogModel.findOne({ auditId: req.params.id, employeeId: req.user.id, endTime: null });
        if (!log) throw httpError(404, "You have no running timer on this audit");
        const now = new Date();
        log.endTime = now;
        log.durationMinutes = elapsed(log.startTime, now);
        log.note = String(req.body?.note || "").slice(0, 500);
        log.stopLocation = location;
        flagIfLong(log);
        await log.save();
        fillAddressLater(location, (addr) => AuditTimeLogModel.updateOne({ _id: log._id }, { "stopLocation.address": addr }).catch(() => {}));
        return res.status(200).json({ success: true, message: "Timer stopped", data: log });
    } catch (err) { return fail(res, err); }
};

export const getMyActiveAuditTimer = async (req, res) => {
    try {
        await closeStaleTimers({ employeeId: req.user.id });
        const log = await AuditTimeLogModel.findOne({ employeeId: req.user.id, endTime: null })
            .populate("auditId", "auditCode clientName engagementName auditType financialYear").lean();
        return res.status(200).json({ success: true, data: log || null });
    } catch (err) { return fail(res, err); }
};
