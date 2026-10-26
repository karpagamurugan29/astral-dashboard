import mongoose from "mongoose";
import { Readable } from "stream";
import AuditEngagementModel from "../models/auditEngagementModel.js";
import AuditProjectModel from "../models/auditProjectModel.js";
import employeeModel from "../models/employeeModel.js";
import { logAudit } from "../utils/audit.js";
import { notify } from "../utils/notify.js";
import { auditAccess, idStr, onTeam } from "../utils/auditAccess.js";
import { normalizeTasks, checkTransition, applyTransition, allowedActions, DONE, AUTO_KEYS } from "../utils/auditTasks.js";

/* Work on one audit task: status actions (start, block, submit, review, approve, reopen, cancel),
   assignment, checklist, comments / clarifications, and workpaper uploads (versioned).
   Every change lands in the task's history; the people involved are told. */

const httpError = (status, message) => Object.assign(new Error(message), { status });
const fail = (res, err) => res.status(err.status || 500).json({ success: false, message: err.message });
const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "auditWorkpapers" });
const ALLOWED = ["pdf", "xlsx", "xls", "csv", "doc", "docx", "png", "jpg", "jpeg", "txt", "zip", "msg", "eml"];

const load = async (req) => {
    const { id, key } = req.params;
    if (!mongoose.isValidObjectId(id)) throw httpError(404, "Audit not found.");
    const audit = await AuditEngagementModel.findOne({ _id: id, isDeleted: false });
    if (!audit) throw httpError(404, "Audit not found.");
    const project = audit.projectId ? await AuditProjectModel.findById(audit.projectId).lean() : null;
    const access = await auditAccess(req, audit, project);
    if (!access.view) throw httpError(403, "You are not assigned to this audit.");
    normalizeTasks(audit.milestones);
    const task = key ? audit.milestones.find((t) => t.key === key) : null;
    if (key && !task) throw httpError(404, "Task not found.");
    return { audit, access, task };
};
const where = (a) => `${a.clientName} (${a.auditCode})`;
const link = (a, t) => `/audits/${a._id}?tab=workflow&task=${t.key}`;
const tell = (ids, title, msg, a, t, except) => [...new Set(ids.filter(Boolean).map(String))].filter((x) => x !== String(except)).forEach((x) => notify(x, title, msg, "Audit", link(a, t)));
const reviewerOf = (a, t) => t.reviewer || a.auditManager;

// the task as this viewer sees it
const view = (audit, task, access) => {
    const t = task.toObject ? task.toObject() : task;
    return { ...t, actions: allowedActions(t, audit.milestones.map((x) => x.toObject?.() || x), access), attachments: (t.attachments || []).map((f) => ({ ...f, url: `/audits/${audit._id}/tasks/${t.key}/files/${f.fileId}` })) };
};

// POST /audits/:id/tasks/:key/action { action, note, override }
export const taskAction = async (req, res) => {
    try {
        const { audit, access, task } = await load(req);
        if (!access.workpapers) throw httpError(403, "Only the audit team can work on tasks.");
        const { action, note = "", override = false } = req.body || {};
        const chk = checkTransition(task.toObject(), audit.milestones.map((t) => t.toObject()), access, action, { note, override });
        if (chk.error) throw httpError(400, chk.error);
        const stageBefore = audit.milestones.filter((t) => t.stage === task.stage).every((t) => DONE.includes(t.status) || t.status === "Cancelled");
        const entry = applyTransition(task, action, { by: req.user.id, note: String(note).slice(0, 2000) });
        if (action === "start" && !task.assignee) task.assignee = req.user.id; // picking up an unassigned task
        task.history.push(entry);
        if (note && ["requestChanges", "block", "reopen", "cancel"].includes(action)) task.comments.push({ by: req.user.id, text: String(note).slice(0, 3000), kind: action === "requestChanges" ? "review" : action === "block" ? "blocker" : "comment" });
        // tasks waiting on this one may now be ready
        const readyBefore = new Set(audit.milestones.filter((t) => t.status === "Ready").map((t) => t.key));
        normalizeTasks(audit.milestones);
        await audit.save();

        const w = where(audit);
        if (action === "submit") tell([reviewerOf(audit, task)], "Task submitted for your review", `${w}: “${task.label}”.`, audit, task, req.user.id);
        if (action === "requestChanges") tell([task.assignee], "Changes requested on your task", `${w}: “${task.label}” — ${note}`, audit, task, req.user.id);
        if (action === "approve") tell([task.assignee], "Your task was approved", `${w}: “${task.label}”.`, audit, task, req.user.id);
        if (action === "block") tell([audit.auditManager, task.reviewer], "Task blocked", `${w}: “${task.label}” — ${note}`, audit, task, req.user.id);
        if (action === "reopen" || action === "cancel") tell([task.assignee], action === "reopen" ? "Task reopened" : "Task cancelled", `${w}: “${task.label}” — ${note}`, audit, task, req.user.id);
        audit.milestones.filter((t) => t.status === "Ready" && !readyBefore.has(t.key)).forEach((t) => tell([t.assignee], "Task ready to start", `${w}: “${t.label}” — its prerequisites are done.`, audit, t, req.user.id));
        const stageAfter = audit.milestones.filter((t) => t.stage === task.stage).every((t) => DONE.includes(t.status) || t.status === "Cancelled");
        if (!stageBefore && stageAfter) tell([audit.auditManager], `${task.stage} complete`, `${w}: every ${task.stage} task is done.`, audit, task, req.user.id);
        if (action === "start" && entry.note) logAudit(req, "audit.task_override", `${audit.auditCode}: started “${task.label}” before prerequisites — ${entry.note}`, { type: "AuditEngagement", id: audit._id });
        if (["approve", "reopen", "cancel"].includes(action)) logAudit(req, `audit.task_${action}`, `${audit.auditCode}: ${action} “${task.label}”${note ? ` — ${String(note).slice(0, 120)}` : ""}`, { type: "AuditEngagement", id: audit._id });
        return res.status(200).json({ success: true, message: `“${task.label}” is now ${task.status}.`, data: view(audit, task, access) });
    } catch (err) { return fail(res, err); }
};

// PUT /audits/:id/tasks/:key/assign { assignee, reviewer, dueDate?, estimatedHours?, plannedStart?, priority? } — managers
export const assignTask = async (req, res) => {
    try {
        const { audit, access, task } = await load(req);
        if (!access.manage) throw httpError(403, "Only the engagement's manager or audit leadership can assign work.");
        if (AUTO_KEYS.includes(task.key)) throw httpError(400, "Billing steps are recorded automatically.");
        const b = req.body || {};
        const now = new Date();
        const pick = async (v, label) => {
            if (!v) return null;
            if (!mongoose.isValidObjectId(v) || !(await employeeModel.exists({ _id: v, status: "Active" }))) throw httpError(400, `Pick an active employee as ${label}.`);
            return v;
        };
        const prevA = idStr(task.assignee), prevR = idStr(task.reviewer);
        if (b.assignee !== undefined) task.assignee = await pick(b.assignee, "assignee");
        if (b.reviewer !== undefined) task.reviewer = await pick(b.reviewer, "reviewer");
        if (task.reviewer && idStr(task.reviewer) === idStr(task.assignee)) throw httpError(400, "The reviewer must be someone other than the person doing the task.");
        if (b.dueDate !== undefined) task.dueDate = b.dueDate ? new Date(b.dueDate) : null;
        if (b.plannedStart !== undefined) task.plannedStart = b.plannedStart ? new Date(b.plannedStart) : null;
        if (b.estimatedHours !== undefined) task.estimatedHours = Math.max(0, Number(b.estimatedHours) || 0);
        if (b.priority && ["Low", "Medium", "High", "Critical"].includes(b.priority)) task.priority = b.priority;
        if (b.location !== undefined) task.location = String(b.location).slice(0, 200);
        const names = async (id) => (id ? (await employeeModel.findById(id).select("firstName lastName").lean()) : null);
        const nm = (p) => (p ? `${p.firstName} ${p.lastName}`.trim() : "nobody");
        if (prevA !== idStr(task.assignee)) task.history.push({ at: now, by: req.user.id, action: prevA ? "reassigned" : "assigned", from: nm(await names(prevA)), to: nm(await names(task.assignee)), note: String(b.note || "").slice(0, 300) });
        if (prevR !== idStr(task.reviewer)) task.history.push({ at: now, by: req.user.id, action: "reviewer", from: nm(await names(prevR)), to: nm(await names(task.reviewer)) });
        // whoever works or reviews it is on the team
        [task.assignee, task.reviewer].filter(Boolean).forEach((p) => { if (!onTeam(audit, p)) audit.teamMembers.push(p); });
        normalizeTasks(audit.milestones);
        await audit.save();
        const w = where(audit);
        if (task.assignee && prevA !== idStr(task.assignee)) tell([task.assignee], "Audit task assigned to you", `${w}: “${task.label}”${task.dueDate ? ` — due ${new Date(task.dueDate).toLocaleDateString("en-IN")}` : ""}.`, audit, task, req.user.id);
        if (prevA && prevA !== idStr(task.assignee)) tell([prevA], "Task reassigned", `${w}: “${task.label}” moved to someone else. Your logged time stays with you.`, audit, task, req.user.id);
        if (task.reviewer && prevR !== idStr(task.reviewer)) tell([task.reviewer], "You're reviewing an audit task", `${w}: “${task.label}”.`, audit, task, req.user.id);
        return res.status(200).json({ success: true, message: "Task updated.", data: view(audit, task, access) });
    } catch (err) { return fail(res, err); }
};

// PUT /audits/:id/tasks/:key/checklist/:index { done }
export const tickChecklist = async (req, res) => {
    try {
        const { audit, access, task } = await load(req);
        const mine = idStr(task.assignee) === access.me;
        if (!(mine || access.manage)) throw httpError(403, "Only the person doing the task (or the manager) can tick its checklist.");
        if (DONE.includes(task.status) || task.status === "Cancelled") throw httpError(400, `The task is ${task.status.toLowerCase()}.`);
        const item = task.checklist[Number(req.params.index)];
        if (!item) throw httpError(404, "Checklist item not found.");
        item.done = !!req.body?.done; item.doneBy = item.done ? req.user.id : null; item.doneAt = item.done ? new Date() : null;
        await audit.save();
        return res.status(200).json({ success: true, message: item.done ? "Ticked." : "Unticked.", data: view(audit, task, access) });
    } catch (err) { return fail(res, err); }
};

// POST /audits/:id/tasks/:key/comments { text, kind: comment | clarification | reply }
export const commentTask = async (req, res) => {
    try {
        const { audit, access, task } = await load(req);
        if (!access.workpapers) throw httpError(403, "Only the audit team can comment on tasks.");
        const text = String(req.body?.text || "").trim().slice(0, 3000);
        if (!text) throw httpError(400, "Write a comment.");
        const kind = ["comment", "clarification", "reply"].includes(req.body?.kind) ? req.body.kind : "comment";
        task.comments.push({ by: req.user.id, text, kind });
        if (kind === "clarification") task.history.push({ at: new Date(), by: req.user.id, action: "clarification", note: text.slice(0, 200) });
        await audit.save();
        const w = where(audit);
        if (kind === "clarification") tell([audit.auditManager, task.reviewer], "Clarification requested", `${w}: “${task.label}” — ${text.slice(0, 160)}`, audit, task, req.user.id);
        else tell([task.assignee, task.reviewer, ...(task.comments || []).slice(-5).map((c) => c.by)], "New comment on an audit task", `${w}: “${task.label}” — ${text.slice(0, 160)}`, audit, task, req.user.id);
        return res.status(201).json({ success: true, message: kind === "clarification" ? "Clarification requested." : "Comment added.", data: view(audit, task, access) });
    } catch (err) { return fail(res, err); }
};

// PUT /audits/:id/tasks/:key/comments/:cid/resolve
export const resolveComment = async (req, res) => {
    try {
        const { audit, access, task } = await load(req);
        if (!access.workpapers) throw httpError(403, "Only the audit team can do that.");
        const c = task.comments.id(req.params.cid);
        if (!c) throw httpError(404, "Comment not found.");
        if (!(access.manage || idStr(task.reviewer) === access.me || idStr(c.by) === access.me)) throw httpError(403, "Only the reviewer, the manager or the author can resolve it.");
        c.resolved = true;
        await audit.save();
        return res.status(200).json({ success: true, message: "Resolved.", data: view(audit, task, access) });
    } catch (err) { return fail(res, err); }
};

// POST /audits/:id/tasks/:key/files (multipart files[]) — workpapers; same name = new version
export const uploadWorkpaper = async (req, res) => {
    try {
        const { audit, access, task } = await load(req);
        const mine = idStr(task.assignee) === access.me;
        if (!(mine || access.manage || (access.member && !task.assignee))) throw httpError(403, "Only the person doing the task (or the manager) can add workpapers.");
        if ((DONE.includes(task.status) || task.status === "Cancelled") && !access.manage) throw httpError(400, `The task is ${task.status.toLowerCase()} — ask the manager to reopen it.`);
        const files = req.files || [];
        if (!files.length) throw httpError(400, "Choose a file.");
        for (const f of files) {
            const ext = (f.originalname.split(".").pop() || "").toLowerCase();
            if (!ALLOWED.includes(ext)) throw httpError(400, `“${f.originalname}” isn't an allowed type (${ALLOWED.join(", ")}).`);
            if (f.size > 20 * 1024 * 1024) throw httpError(400, `“${f.originalname}” is over 20 MB.`);
        }
        for (const f of files) {
            const id = await new Promise((resolve, reject) => {
                const up = bucket().openUploadStream(f.originalname, { metadata: { auditId: audit._id, task: task.key, by: req.user.id, contentType: f.mimetype } });
                Readable.from(f.buffer).pipe(up).on("error", reject).on("finish", () => resolve(up.id));
            });
            const version = (task.attachments || []).filter((a) => a.name === f.originalname).length + 1;
            task.attachments.push({ fileId: id, name: f.originalname, size: f.size, type: f.mimetype, uploadedBy: req.user.id, uploadedAt: new Date(), version });
            task.history.push({ at: new Date(), by: req.user.id, action: "workpaper", note: `${f.originalname}${version > 1 ? ` (v${version})` : ""}` });
        }
        await audit.save();
        return res.status(201).json({ success: true, message: `${files.length} file${files.length === 1 ? "" : "s"} added.`, data: view(audit, task, access) });
    } catch (err) { return fail(res, err); }
};

// GET /audits/:id/tasks/:key/files/:fileId — the audit team only (never Finance / HR)
export const downloadWorkpaper = async (req, res) => {
    try {
        const { access, task } = await load(req);
        if (!access.workpapers) throw httpError(403, "Workpapers are for the audit team only.");
        const f = (task.attachments || []).find((a) => String(a.fileId) === String(req.params.fileId));
        if (!f) throw httpError(404, "File not found.");
        res.set("Content-Type", f.type || "application/octet-stream");
        res.set("Content-Disposition", `attachment; filename="${encodeURIComponent(f.name || "file")}"`);
        bucket().openDownloadStream(f.fileId).on("error", () => { if (!res.headersSent) fail(res, httpError(404, "File not found.")); else res.end(); }).pipe(res);
    } catch (err) { return fail(res, err); }
};

// PUT /audits/:id/milestones/:key { done } — the older one-click tick, mapped onto the lifecycle
export const tickTask = async (req, res) => {
    try {
        const { audit, access, task } = await load(req);
        const tasks = () => audit.milestones.map((t) => t.toObject());
        const steps = req.body?.done
            ? (task.status === "In Progress" ? [] : ["start"]).concat(task.requiresReview ? ["submit"] : ["complete"])
            : ["reopen"];
        for (const action of steps) {
            const chk = checkTransition(task.toObject(), tasks(), access, action, { note: action === "reopen" ? (req.body?.note || "Unticked") : "" });
            if (chk.error) throw httpError(400, chk.error);
            task.history.push(applyTransition(task, action, { by: req.user.id, note: action === "reopen" ? (req.body?.note || "Unticked") : "" }));
            if (action === "start" && !task.assignee) task.assignee = req.user.id;
        }
        normalizeTasks(audit.milestones);
        await audit.save();
        if (task.status === "Submitted") tell([reviewerOf(audit, task)], "Task submitted for your review", `${where(audit)}: “${task.label}”.`, audit, task, req.user.id);
        return res.status(200).json({ success: true, message: `“${task.label}” is now ${task.status}.`, data: audit.milestones });
    } catch (err) { return fail(res, err); }
};
