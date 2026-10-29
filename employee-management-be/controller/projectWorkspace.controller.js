import mongoose from "mongoose";
import ProjectModel from "../models/ProjectModel.js";
import taskModel from "../models/taskModel.js";
import ProjectTimeLogModel from "../models/projectTimeLogModel.js";
import employeeModel from "../models/employeeModel.js";
import { getAccess } from "../utils/access.js";
import { parseLocation, LOCATION_REQUIRED, fillAddressLater } from "../utils/location.js";
import { logAudit } from "../utils/audit.js";
import { notify } from "../utils/notify.js";
import { scopeOf, workFilter } from "../utils/hierarchy.js";

// Project workspace: every project has its own task board, a work timer with location, a team
// view and a time log. People who manage projects (Admin / HR / Managers with the "projects"
// permission) see and run every project; everyone else works in the projects they're part of.

const PERSON = "employeeId firstName lastName email designation department profileImage";
const fail = (res, err) => res.status(err.status || 500).json({ success: false, message: err.message });
const httpError = (status, message) => Object.assign(new Error(message), { status });
const idStr = (x) => String(x?._id || x || "");
const CLOSED = ["Completed", "Cancelled"];
const TASK_STATUSES = ["To Do", "In Progress", "In Review", "Blocked", "Done"];
const minutesOf = (l, now = Date.now()) => (l.endTime ? l.durationMinutes || Math.round((new Date(l.endTime) - new Date(l.startTime)) / 60000) : Math.round((now - new Date(l.startTime)) / 60000));

export const canManageProjects = async (req) => {
    if (req.user.role === "Admin") return true;
    const a = await getAccess(req.user);
    if (a.denied.includes("projects")) return false;
    return (["HR", "Manager", "Team Lead"].includes(req.user.role) && a.roleAllow.includes("projects")) || a.granted.includes("projects");
};

const isMember = (p, me) => idStr(p.projectManager) === me || (p.teamMembers || []).some((m) => idStr(m) === me);

// A project the user may open: managers any; others only theirs.
const loadProject = async (req, id, { manage } = {}) => {
    if (!mongoose.isValidObjectId(id)) throw httpError(404, "Project not found.");
    const p = await ProjectModel.findOne({ _id: id, isDeleted: false });
    if (!p) throw httpError(404, "Project not found.");
    const me = idStr(req.user.id);
    const scope = await scopeOf(req);
    const lead = idStr(p.projectManager) === me;
    // Seniors above the project lead in the reporting line (and firm-wide seniors) run it too;
    // seniors of anyone on the team can look in.
    const manager = scope.firm || scope.team.has(idStr(p.projectManager));
    const oversees = manager || [p.projectManager, ...(p.teamMembers || [])].some((m) => scope.team.has(idStr(m)));
    if (!oversees && !isMember(p, me)) throw httpError(403, "You're not on this project.");
    if (manage && !manager && !lead) throw httpError(403, "Only the project lead or their seniors can do that.");
    return { p, me, manager, lead };
};

const nextCode = async () => {
    const all = await ProjectModel.find({ projectCode: /^PRJ-\d+$/ }).select("projectCode").lean();
    const n = all.reduce((m, x) => Math.max(m, Number(x.projectCode.slice(4)) || 0), 0) + 1;
    return `PRJ-${String(n).padStart(4, "0")}`;
};

/* ---------------- list ---------------- */
// GET /projects — managers: every project; others: projects they're on. With task and hour totals.
export const listProjects = async (req, res) => {
    try {
        const me = idStr(req.user.id);
        const manager = await canManageProjects(req);
        const viewer = await scopeOf(req);
        // firm-wide seniors: every project; everyone else: projects they or their team work on
        const filter = { isDeleted: false, ...(await workFilter(req)) };
        const projects = await ProjectModel.find(filter).populate("projectManager", PERSON).populate("teamMembers", PERSON).sort({ createdAt: -1 }).lean();
        const ids = projects.map((p) => p._id);
        const [tasks, logs] = await Promise.all([
            taskModel.find({ projectId: { $in: ids } }).select("projectId status dueDate assignedTo").lean(),
            ProjectTimeLogModel.find({ projectId: { $in: ids } }).select("projectId employeeId startTime endTime durationMinutes").lean(),
        ]);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const weekAgo = Date.now() - 7 * 864e5;
        const data = projects.map((p) => {
            const t = tasks.filter((x) => idStr(x.projectId) === idStr(p._id));
            const l = logs.filter((x) => idStr(x.projectId) === idStr(p._id));
            const done = t.filter((x) => x.status === "Done").length;
            return {
                ...p,
                taskCounts: {
                    total: t.length, done, open: t.length - done,
                    overdue: t.filter((x) => x.status !== "Done" && x.dueDate && new Date(x.dueDate) < today).length,
                    mine: t.filter((x) => x.status !== "Done" && idStr(x.assignedTo) === me).length,
                },
                progress: t.length ? Math.round((done / t.length) * 100) : p.progress || 0,
                loggedMinutes: l.reduce((s, x) => s + minutesOf(x), 0),
                weekMinutes: l.filter((x) => new Date(x.startTime) >= weekAgo).reduce((s, x) => s + minutesOf(x), 0),
                runningNow: l.filter((x) => !x.endTime).length,
                myRole: idStr(p.projectManager?._id) === me ? "Lead" : (p.teamMembers || []).some((m) => idStr(m) === me) ? "Member" : viewer.firm ? null : "My team",
                daysLeft: p.endDate ? Math.ceil((new Date(p.endDate).setHours(0, 0, 0, 0) - today) / 864e5) : null,
            };
        });
        const running = await ProjectTimeLogModel.findOne({ employeeId: me, endTime: null }).populate("projectId", "projectName projectCode").lean();
        return res.status(200).json({ success: true, data, canManage: manager, myTimer: running || null });
    } catch (err) { return fail(res, err); }
};

/* ---------------- one project, everything the workspace needs ---------------- */
export const projectWorkspace = async (req, res) => {
    try {
        await ensureTaskNos();
        const { p, me, manager, lead } = await loadProject(req, req.params.id);
        await p.populate([{ path: "projectManager", select: PERSON }, { path: "teamMembers", select: PERSON }, { path: "createdBy", select: "firstName lastName" }]);
        const [tasks, logs, myRunning] = await Promise.all([
            taskModel.find({ projectId: p._id }).select("-history").populate("assignedTo", PERSON).populate("createdBy", "firstName lastName").populate("comments.employeeId", "firstName lastName profileImage").sort({ order: 1, createdAt: 1 }).lean(),
            ProjectTimeLogModel.find({ projectId: p._id }).populate("employeeId", PERSON).populate("taskId", "title").sort({ startTime: -1 }).limit(200).lean(),
            ProjectTimeLogModel.findOne({ employeeId: me, endTime: null }).populate("projectId", "projectName projectCode").populate("taskId", "title").lean(),
        ]);
        const now = Date.now();
        const byPerson = new Map();
        logs.forEach((l) => {
            const k = idStr(l.employeeId);
            const x = byPerson.get(k) || { employee: l.employeeId, minutes: 0, sessions: 0, last: null };
            x.minutes += minutesOf(l, now); x.sessions++;
            if (!x.last || new Date(l.startTime) > new Date(x.last)) x.last = l.startTime;
            byPerson.set(k, x);
        });
        const taskMinutes = {};
        logs.forEach((l) => { if (l.taskId) taskMinutes[idStr(l.taskId)] = (taskMinutes[idStr(l.taskId)] || 0) + minutesOf(l, now); });
        const done = tasks.filter((t) => t.status === "Done").length;
        const open = tasks.filter((t) => !t.closedAt);
        const closed = tasks.filter((t) => t.closedAt).sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt));
        const closers = new Map((await employeeModel.find({ _id: { $in: [...new Set(closed.map((t) => idStr(t.closedBy)).filter(Boolean))] } }).select("firstName lastName").lean()).map((e) => [idStr(e._id), e]));
        return res.status(200).json({
            success: true,
            data: {
                project: { ...p.toObject(), progress: tasks.length ? Math.round((done / tasks.length) * 100) : p.progress || 0 },
                tasks: open.map((t) => ({ ...t, loggedMinutes: taskMinutes[idStr(t._id)] || 0 })),
                closedTasks: closed.map((t) => ({ _id: t._id, taskNo: t.taskNo, title: t.title, type: t.type, priority: t.priority, assignedTo: t.assignedTo, closedAt: t.closedAt, closedBy: closers.get(idStr(t.closedBy)) || null, closeNote: t.closeNote, completedAt: t.completedAt, loggedMinutes: taskMinutes[idStr(t._id)] || 0 })),
                logs: logs.map((l) => ({ ...l, minutes: minutesOf(l, now), running: !l.endTime })),
                team: [...byPerson.values()].sort((a, b) => b.minutes - a.minutes),
                totals: { loggedMinutes: logs.reduce((s, l) => s + minutesOf(l, now), 0), runningNow: logs.filter((l) => !l.endTime).length },
                myTimer: myRunning || null,
                canManage: manager || lead,
                isMember: isMember(p, me),
            },
        });
    } catch (err) { return fail(res, err); }
};

/* ---------------- create / update project ---------------- */
const pickProject = (b) => {
    const o = {};
    ["projectName", "description", "clientName", "priority", "status", "workMode"].forEach((k) => { if (b[k] !== undefined) o[k] = typeof b[k] === "string" ? b[k].trim() : b[k]; });
    ["startDate", "endDate"].forEach((k) => { if (b[k]) o[k] = new Date(b[k]); });
    if (b.estimatedHours !== undefined) o.estimatedHours = Number(b.estimatedHours) || 0;
    if (b.budget !== undefined) o.budget = Number(b.budget) || 0;
    if (b.projectManager) o.projectManager = b.projectManager;
    if (Array.isArray(b.teamMembers)) o.teamMembers = [...new Set(b.teamMembers.map(String))];
    if (b.location) o.location = { siteName: String(b.location.siteName || "").slice(0, 120), address: String(b.location.address || "").slice(0, 300) };
    return o;
};

// Managers and below staff projects from their own team; firm-wide seniors from anyone.
const ownTeamOnly = async (req, data) => {
    const scope = await scopeOf(req);
    if (scope.firm) return;
    const mine = new Set([scope.me, ...scope.team]);
    const outside = [data.projectManager, ...(data.teamMembers || [])].filter(Boolean).map(String).filter((id) => !mine.has(id));
    if (outside.length) throw httpError(403, "You can only put people from your own team on a project.");
};

export const createProjectV2 = async (req, res) => {
    try {
        if (!(await canManageProjects(req))) throw httpError(403, "Only managers can create projects.");
        const data = pickProject(req.body || {});
        if (!data.projectName) throw httpError(400, "Give the project a name.");
        if (!data.projectManager) throw httpError(400, "Choose a project lead.");
        if (!data.startDate || !data.endDate) throw httpError(400, "Set the start and end dates.");
        if (data.endDate < data.startDate) throw httpError(400, "The end date is before the start date.");
        await ownTeamOnly(req, data);
        const code = String(req.body?.projectCode || "").trim() || (await nextCode());
        if (await ProjectModel.exists({ projectCode: code })) throw httpError(409, `Project code ${code} is already used.`);
        const p = await ProjectModel.create({ ...data, projectCode: code, createdBy: req.user.id });
        const notifyIds = new Set([idStr(p.projectManager), ...(p.teamMembers || []).map(idStr)]);
        notifyIds.delete(idStr(req.user.id));
        notifyIds.forEach((id) => notify(id, "Added to a project", `You're on “${p.projectName}” (${p.projectCode}).`, "Project", `/projects/${p._id}`));
        logAudit(req, "project.create", `Created project ${p.projectCode} ${p.projectName}`, { type: "Project", id: p._id });
        return res.status(201).json({ success: true, message: "Project created.", data: p });
    } catch (err) { return fail(res, err); }
};

export const updateProjectV2 = async (req, res) => {
    try {
        const { p } = await loadProject(req, req.params.id, { manage: true });
        const before = new Set((p.teamMembers || []).map(idStr));
        const changes = pickProject(req.body || {});
        // newly added people must come from the editor's team
        await ownTeamOnly(req, { projectManager: changes.projectManager && changes.projectManager !== idStr(p.projectManager) ? changes.projectManager : null, teamMembers: (changes.teamMembers || []).filter((id) => !before.has(id)) });
        Object.assign(p, changes);
        if (p.endDate < p.startDate) throw httpError(400, "The end date is before the start date.");
        await p.save();
        (p.teamMembers || []).map(idStr).filter((id) => !before.has(id) && id !== idStr(req.user.id)).forEach((id) => notify(id, "Added to a project", `You're on “${p.projectName}” (${p.projectCode}).`, "Project", `/projects/${p._id}`));
        logAudit(req, "project.update", `Updated project ${p.projectCode} ${p.projectName}`, { type: "Project", id: p._id });
        return res.status(200).json({ success: true, message: "Project updated.", data: p });
    } catch (err) { return fail(res, err); }
};

/* ---------------- timer (one running timer per person across projects) ---------------- */
export const startProjectTimer = async (req, res) => {
    try {
        const { p, me } = await loadProject(req, req.params.id);
        if (!isMember(p, me)) throw httpError(403, "Only people on this project can log time on it.");
        if (CLOSED.includes(p.status)) throw httpError(400, `This project is ${p.status.toLowerCase()} — time can no longer be logged.`);
        const location = parseLocation(req.body);
        if (!location) throw httpError(400, LOCATION_REQUIRED);
        const running = await ProjectTimeLogModel.findOne({ employeeId: me, endTime: null }).populate("projectId", "projectName");
        if (running) throw httpError(409, `Your timer is already running on ${idStr(running.projectId) === idStr(p._id) ? "this project" : `“${running.projectId?.projectName || "another project"}”`}. Stop it first.`);
        let taskId = null;
        if (req.body?.taskId && mongoose.isValidObjectId(req.body.taskId) && (await taskModel.exists({ _id: req.body.taskId, projectId: p._id }))) taskId = req.body.taskId;
        const log = await ProjectTimeLogModel.create({ projectId: p._id, taskId, employeeId: me, startTime: new Date(), startLocation: location });
        fillAddressLater(location, (addr) => ProjectTimeLogModel.updateOne({ _id: log._id }, { "startLocation.address": addr }).catch(() => {}));
        if (p.status === "Planning") { p.status = "Active"; await p.save(); }
        if (taskId) await taskModel.updateOne({ _id: taskId, status: "To Do" }, { $set: { status: "In Progress" } });
        return res.status(201).json({ success: true, message: "Timer started.", data: log });
    } catch (err) { return fail(res, err); }
};

export const stopProjectTimer = async (req, res) => {
    try {
        const me = idStr(req.user.id);
        const location = parseLocation(req.body);
        if (!location) throw httpError(400, LOCATION_REQUIRED);
        const log = await ProjectTimeLogModel.findOne({ employeeId: me, endTime: null, ...(mongoose.isValidObjectId(req.params.id) ? { projectId: req.params.id } : {}) });
        if (!log) throw httpError(404, "You don't have a timer running on this project.");
        log.endTime = new Date();
        log.durationMinutes = Math.max(1, Math.round((log.endTime - log.startTime) / 60000));
        log.stopLocation = location;
        log.note = String(req.body?.note || "").slice(0, 500);
        await log.save();
        fillAddressLater(location, (addr) => ProjectTimeLogModel.updateOne({ _id: log._id }, { "stopLocation.address": addr }).catch(() => {}));
        return res.status(200).json({ success: true, message: `Timer stopped — ${Math.floor(log.durationMinutes / 60)}h ${log.durationMinutes % 60}m logged.`, data: log });
    } catch (err) { return fail(res, err); }
};

/* ---------------- tasks inside a project ---------------- */
const canEditTask = (t, me, manageable) => manageable || idStr(t.assignedTo) === me || idStr(t.createdBy) === me;
const pickTask = (b) => {
    const o = {};
    ["title", "description", "priority"].forEach((k) => { if (b[k] !== undefined) o[k] = typeof b[k] === "string" ? b[k].trim() : b[k]; });
    if (b.type !== undefined && TASK_TYPES.includes(b.type)) o.type = b.type;
    if (b.status !== undefined && TASK_STATUSES.includes(b.status)) o.status = b.status;
    ["startDate", "dueDate"].forEach((k) => { if (b[k] !== undefined) o[k] = b[k] ? new Date(b[k]) : null; });
    if (b.estimatedHours !== undefined) o.estimatedHours = b.estimatedHours === "" || b.estimatedHours === null ? null : Number(b.estimatedHours);
    if (b.assignedTo !== undefined) o.assignedTo = b.assignedTo || null;
    if (Array.isArray(b.labels)) o.labels = b.labels.map((x) => String(x).trim()).filter(Boolean).slice(0, 6);
    if (Array.isArray(b.checklist)) o.checklist = b.checklist.filter((c) => String(c.text || "").trim()).slice(0, 30).map((c) => ({ text: String(c.text).trim().slice(0, 200), done: !!c.done }));
    return o;
};
// The workflow rules every status change goes through (task window, board drag, bulk, older routes).
// On project tasks the assignee sends work for review and the lead marks it Done; "Blocked" and
// sending work back from review need a reason so the next person knows what to do.
const reasonOk = (note) => String(note || "").trim().length >= 3;
const checkTransition = (t, to, me, manageable, note) => {
    if (!to || to === t.status) return;
    if (t.projectId && to === "Done" && !manageable) throw httpError(403, "Send it for review — the project lead marks it Done.");
    if (to === "Blocked" && !reasonOk(note)) throw httpError(400, "Say what's blocking it, so the lead can help.");
    if (t.projectId && t.status === "In Review" && ["To Do", "In Progress"].includes(to) && idStr(t.assignedTo) !== me && !reasonOk(note)) throw httpError(400, "Say what needs to change before sending it back.");
};
const START_STATUSES = ["To Do", "In Progress"];
const checkDue = (d) => {
    if (!d) return;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (new Date(d) < today) throw httpError(400, "Pick a due date from today onwards.");
};

const populateTask = (q) => q.populate("assignedTo", PERSON).populate("createdBy", "firstName lastName").populate("comments.employeeId", "firstName lastName profileImage");
const TASK_TYPES = ["Task", "Issue", "Query", "Review point"];

// Tracker numbers (#T-0001). Older tasks get theirs in the order they were made.
const nextTaskNo = async () => ((await taskModel.findOne({ taskNo: { $gt: 0 } }).sort({ taskNo: -1 }).select("taskNo").lean())?.taskNo || 0) + 1;
let numbered = false;
const ensureTaskNos = async () => {
    if (numbered) return;
    const missing = await taskModel.find({ $or: [{ taskNo: null }, { taskNo: { $exists: false } }] }).sort({ createdAt: 1 }).select("_id").lean();
    let n = await nextTaskNo();
    for (const m of missing) await taskModel.updateOne({ _id: m._id }, { $set: { taskNo: n++ } });
    numbered = true;
};
const nameOf = async (id) => { if (!id) return "Nobody"; const e = await employeeModel.findById(id).select("firstName lastName").lean(); return e ? `${e.firstName} ${e.lastName}`.trim() : "Someone"; };
const fmtDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "none");
const track = (t, by, action, from = "", to = "", note = "") => t.history.push({ by, action, from: String(from ?? ""), to: String(to ?? ""), note });
// tell the people on a task (assignee, reporter, watchers) — never the person who made the change
const tellFollowers = (t, by, title, message, p) => {
    const ids = new Set([t.assignedTo, t.createdBy, ...(t.watchers || [])].map(idStr).filter(Boolean));
    ids.delete(idStr(by));
    ids.forEach((id) => notify(id, title, message, "Task", p ? `/projects/${idStr(p._id || p)}` : "/projects/my-tasks"));
};
const tag = (t) => `#T-${String(t.taskNo || 0).padStart(4, "0")}`;

export const createProjectTask = async (req, res) => {
    try {
        const { p, me, manager, lead } = await loadProject(req, req.params.id);
        if (!manager && !isMember(p, me)) throw httpError(403, "Only people on this project can add tasks.");
        const data = pickTask(req.body || {});
        if (!data.title) throw httpError(400, "Give the task a title.");
        if (data.status && !START_STATUSES.includes(data.status)) data.status = "To Do";
        checkDue(data.dueDate);
        if (data.assignedTo && !isMember(p, idStr(data.assignedTo))) throw httpError(400, "Assign the task to someone on this project.");
        if (!(manager || lead) && data.assignedTo && idStr(data.assignedTo) !== me) throw httpError(403, "Only the project lead can assign tasks to others.");
        const last = await taskModel.findOne({ projectId: p._id, status: data.status || "To Do" }).sort({ order: -1 }).select("order").lean();
        await ensureTaskNos();
        const t = await taskModel.create({ ...data, projectId: p._id, createdBy: me, order: (last?.order || 0) + 1, completedAt: data.status === "Done" ? new Date() : null, taskNo: await nextTaskNo(), watchers: [me], history: [{ by: me, action: "created", to: data.status || "To Do" }] });
        if (t.assignedTo && idStr(t.assignedTo) !== me) notify(t.assignedTo, "New task for you", `“${t.title}” in ${p.projectName}`, "Task", `/projects/${p._id}`);
        return res.status(201).json({ success: true, message: "Task added.", data: await populateTask(taskModel.findById(t._id)).lean() });
    } catch (err) { return fail(res, err); }
};

// POST /todos — a personal to-do: just for me, no project and no review step.
export const createTodo = async (req, res) => {
    try {
        const me = idStr(req.user.id);
        const data = pickTask(req.body || {});
        if (!data.title) throw httpError(400, "What do you need to do?");
        checkDue(data.dueDate);
        await ensureTaskNos();
        const t = await taskModel.create({
            title: data.title, description: data.description || "", priority: data.priority || "Medium", dueDate: data.dueDate || null,
            checklist: data.checklist || [], labels: data.labels || [], personal: true, projectId: null, assignedTo: me, createdBy: me,
            status: "To Do", taskNo: await nextTaskNo(), watchers: [me], history: [{ by: me, action: "created", to: "To Do" }],
        });
        return res.status(201).json({ success: true, message: "Added to your to-do list.", data: await populateTask(taskModel.findById(t._id)).lean() });
    } catch (err) { return fail(res, err); }
};

// GET /todos — my personal to-dos: everything open, plus what I finished in the last 30 days.
export const listTodos = async (req, res) => {
    try {
        const since = new Date(Date.now() - 30 * 864e5);
        const data = await taskModel.find({ personal: true, createdBy: req.user.id, $or: [{ status: { $ne: "Done" } }, { completedAt: { $gte: since } }] })
            .select("title description priority status dueDate checklist completedAt createdAt updatedAt personal").sort({ dueDate: 1, createdAt: -1 }).limit(500).lean();
        return res.status(200).json({ success: true, data: data.map((t) => ({ ...t, personal: true })) });
    } catch (err) { return fail(res, err); }
};

const loadTask = async (req, id) => {
    if (!mongoose.isValidObjectId(id)) throw httpError(404, "Task not found.");
    const t = await taskModel.findById(id);
    if (!t) throw httpError(404, "Task not found.");
    if (t.personal) {
        if (idStr(t.createdBy) !== idStr(req.user.id)) throw httpError(404, "Task not found.");
        return { t, me: idStr(req.user.id), manager: false, lead: false, p: null };
    }
    const scope = await scopeOf(req);
    const ctx = t.projectId ? await loadProject(req, t.projectId) : { me: idStr(req.user.id), manager: scope.firm || scope.team.has(idStr(t.assignedTo)), lead: false, p: null };
    if (!t.projectId && !ctx.manager && idStr(t.assignedTo) !== ctx.me) throw httpError(403, "This task isn't yours.");
    return { t, ...ctx };
};

export const updateProjectTask = async (req, res) => {
    try {
        const { t, me, manager, lead, p } = await loadTask(req, req.params.id);
        const manageable = manager || lead;
        if (!canEditTask(t, me, manageable)) throw httpError(403, "Only the person on the task or the project lead can change it.");
        if (t.closedAt) throw httpError(409, "This task is closed — reopen it first.");
        const data = pickTask(req.body || {});
        const note = String(req.body?.note || "").trim().slice(0, 1000);
        if (t.personal) delete data.assignedTo; // personal to-dos stay with their owner
        checkTransition(t, data.status, me, manageable, note);
        if (data.assignedTo !== undefined && idStr(data.assignedTo) !== idStr(t.assignedTo)) {
            if (!manageable) throw httpError(403, "Only the project lead can reassign tasks.");
            if (data.assignedTo && p && !isMember(p, idStr(data.assignedTo))) throw httpError(400, "Assign the task to someone on this project.");
            if (data.assignedTo && idStr(data.assignedTo) !== me) notify(data.assignedTo, "Task assigned to you", `“${t.title}”${p ? ` in ${p.projectName}` : ""}`, "Task", p ? `/projects/${p._id}` : "/projects/my-tasks");
        }
        if (data.status && data.status !== t.status) data.completedAt = data.status === "Done" ? new Date() : null;
        // history of what changed
        if (data.status && data.status !== t.status) { track(t, me, "status", t.status, data.status, note); if (note) t.comments.push({ employeeId: me, message: note }); }
        if (data.assignedTo !== undefined && idStr(data.assignedTo) !== idStr(t.assignedTo)) track(t, me, "assigned", await nameOf(t.assignedTo), await nameOf(data.assignedTo));
        if (data.priority && data.priority !== t.priority) track(t, me, "priority", t.priority, data.priority);
        if (data.type && data.type !== t.type) track(t, me, "type", t.type, data.type);
        if (data.title && data.title !== t.title) track(t, me, "title", t.title, data.title);
        if (data.dueDate !== undefined && fmtDate(data.dueDate) !== fmtDate(t.dueDate)) {
            track(t, me, "due", fmtDate(t.dueDate), fmtDate(data.dueDate));
            data.dueSoonNotifiedAt = null; data.overdueNotifiedAt = null; // deadline alerts follow the new date
            if (!t.personal && t.assignedTo && idStr(t.assignedTo) !== me) notify(t.assignedTo, "Due date changed", `“${t.title}” is now due ${data.dueDate ? fmtDate(data.dueDate) : "with no date"}.`, "Task", p ? `/projects/${p._id}` : "/projects/my-tasks");
        }
        if (data.checklist) {
            const before = (t.checklist || []).filter((c) => c.done).length, after = data.checklist.filter((c) => c.done).length;
            if (before !== after || (t.checklist || []).length !== data.checklist.length) track(t, me, "checklist", `${before}/${(t.checklist || []).length}`, `${after}/${data.checklist.length}`);
        }
        const statusChanged = data.status && data.status !== t.status;
        Object.assign(t, data);
        await t.save();
        if (statusChanged) tellFollowers(t, me, `${tag(t)} is now ${t.status}`, `“${t.title}”${note ? ` — ${note.slice(0, 80)}` : ""}`, p);
        return res.status(200).json({ success: true, message: "Task updated.", data: await populateTask(taskModel.findById(t._id)).lean() });
    } catch (err) { return fail(res, err); }
};

// PUT /tasks/:id/move { status, order } — drag & drop on the board
export const moveTask = async (req, res) => {
    try {
        const { t, me, manager, lead } = await loadTask(req, req.params.id);
        if (!canEditTask(t, me, manager || lead)) throw httpError(403, "Only the person on the task or the project lead can move it.");
        if (t.closedAt) throw httpError(409, "This task is closed — reopen it first.");
        const status = TASK_STATUSES.includes(req.body?.status) ? req.body.status : t.status;
        const note = String(req.body?.note || "").trim().slice(0, 1000);
        checkTransition(t, status, me, manager || lead, note);
        if (status !== t.status) { t.completedAt = status === "Done" ? new Date() : null; track(t, me, "status", t.status, status, note); }
        if (note) t.comments.push({ employeeId: me, message: note });
        const changed = status !== t.status;
        t.status = status;
        if (Number.isFinite(Number(req.body?.order))) t.order = Number(req.body.order);
        await t.save();
        if (changed) tellFollowers(t, me, `${tag(t)} is now ${t.status}`, `“${t.title}”${note ? ` — ${note.slice(0, 80)}` : ""}`, t.projectId);
        return res.status(200).json({ success: true, data: { _id: t._id, status: t.status, order: t.order } });
    } catch (err) { return fail(res, err); }
};

export const commentOnTask = async (req, res) => {
    try {
        const { t, me } = await loadTask(req, req.params.id);
        const message = String(req.body?.message || "").trim().slice(0, 1000);
        if (!message) throw httpError(400, "Write a comment first.");
        t.comments.push({ employeeId: me, message });
        track(t, me, "note", "", "", message.slice(0, 140));
        await t.save();
        tellFollowers(t, me, `New note on ${tag(t)}`, `“${t.title}”: ${message.slice(0, 100)}`, t.projectId);
        return res.status(201).json({ success: true, data: await populateTask(taskModel.findById(t._id)).lean() });
    } catch (err) { return fail(res, err); }
};

export const deleteProjectTask = async (req, res) => {
    try {
        const { t, me, manager, lead } = await loadTask(req, req.params.id);
        if (!(manager || lead || idStr(t.createdBy) === me)) throw httpError(403, "Only the project lead or whoever created the task can delete it.");
        await t.deleteOne();
        await ProjectTimeLogModel.updateMany({ taskId: t._id }, { $set: { taskId: null } });
        return res.status(200).json({ success: true, message: "Task deleted." });
    } catch (err) { return fail(res, err); }
};

/* ---------------- my tasks across projects ---------------- */
// My tasks (tracker): tasks I'm involved in — assigned to me, reported by me or monitored by me
// (open, plus anything closed in the last 30 days) — the tasks waiting for my review, and my
// running timer. ?scope=team adds every task in the projects my team works on (leads / seniors).
export const myTasks = async (req, res) => {
    try {
        await ensureTaskNos();
        const scope = await scopeOf(req);
        const since = new Date(Date.now() - 30 * 864e5);
        const PROJ = "projectName projectCode status isDeleted projectManager";
        const recent = { $or: [{ status: { $ne: "Done" } }, { completedAt: { $gte: since } }, { updatedAt: { $gte: since } }] };
        const me = req.user.id;
        const find = (filter) => taskModel.find({ ...filter, ...recent, closedAt: null, personal: { $ne: true } }).select("-history -comments.message")
            .populate("projectId", PROJ).populate("assignedTo", PERSON).populate("createdBy", "firstName lastName").sort({ updatedAt: -1 }).limit(800).lean();
        let projectIds = null;
        if (req.query.scope === "team") projectIds = (await ProjectModel.find({ isDeleted: false, ...(await workFilter(req)) }).select("_id").lean()).map((p) => p._id);
        const [involved, ledProjects, timer, team] = await Promise.all([
            find({ $and: [{ $or: [{ assignedTo: me }, { createdBy: me }, { watchers: me }] }] }),
            ProjectModel.find({ isDeleted: false, projectManager: { $in: [scope.me, ...scope.team] } }).select("_id").lean(),
            ProjectTimeLogModel.findOne({ employeeId: me, endTime: null }).populate("projectId", "projectName projectCode").populate("taskId", "title taskNo").lean(),
            projectIds ? find({ projectId: { $in: projectIds } }) : null,
        ]);
        const closedList = await taskModel.find({ $or: [{ assignedTo: me }, { createdBy: me }, { watchers: me }], personal: { $ne: true }, closedAt: { $ne: null, $gte: new Date(Date.now() - 365 * 864e5) } })
            .select("taskNo title type priority projectId assignedTo closedAt closedBy closeNote completedAt").populate("projectId", PROJ).populate("assignedTo", PERSON).populate("closedBy", "firstName lastName").sort({ closedAt: -1 }).limit(300).lean();
        const review = ledProjects.length ? await taskModel.find({ projectId: { $in: ledProjects.map((p) => p._id) }, status: "In Review", assignedTo: { $ne: me }, closedAt: null })
            .select("-history").populate("projectId", PROJ).populate("assignedTo", PERSON).sort({ updatedAt: -1 }).lean() : [];
        const live = (l) => (l || []).filter((t) => !t.projectId?.isDeleted).map((t) => ({ ...t, watching: (t.watchers || []).some((w) => idStr(w) === idStr(me)), notes: (t.comments || []).length, comments: undefined }));
        return res.status(200).json({ success: true, data: live(involved), team: team ? live(team) : null, review: live(review), closed: closedList.filter((t) => !t.projectId?.isDeleted), myTimer: timer, canSeeTeam: scope.firm || scope.leads });
    } catch (err) { return fail(res, err); }
};

// GET /tasks/:id — one task with notes and full history, for the issue screen.
export const getTask = async (req, res) => {
    try {
        await ensureTaskNos();
        const { t, me, manager, lead, p } = await loadTask(req, req.params.id);
        const full = await populateTask(taskModel.findById(t._id)).populate("projectId", "projectName projectCode projectManager teamMembers status")
            .populate("watchers", "firstName lastName profileImage").populate("history.by", "firstName lastName profileImage").populate("closedBy", "firstName lastName").lean();
        const members = p ? await employeeModel.find({ _id: { $in: [p.projectManager, ...(p.teamMembers || [])] } }).select(PERSON).lean() : [];
        return res.status(200).json({ success: true, data: { ...full, watching: (full.watchers || []).some((w) => idStr(w) === me) }, members, canManage: manager || lead, canEdit: canEditTask(t, me, manager || lead) });
    } catch (err) { return fail(res, err); }
};

// POST /tasks/:id/watch — start / stop monitoring a task.
export const watchTask = async (req, res) => {
    try {
        const { t, me } = await loadTask(req, req.params.id);
        const on = !(t.watchers || []).some((w) => idStr(w) === me);
        t.watchers = on ? [...(t.watchers || []), me] : t.watchers.filter((w) => idStr(w) !== me);
        track(t, me, "watch", "", on ? "started monitoring" : "stopped monitoring");
        await t.save();
        return res.status(200).json({ success: true, message: on ? `You'll be told about changes to ${tag(t)}.` : `You stopped monitoring ${tag(t)}.`, data: { watching: on } });
    } catch (err) { return fail(res, err); }
};

// PUT /tasks/bulk { ids, status } — change many tasks at once (only the ones you may change).
export const bulkMoveTasks = async (req, res) => {
    try {
        const status = req.body?.status;
        if (!TASK_STATUSES.includes(status)) throw httpError(400, "Pick a status.");
        const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).filter((id) => mongoose.isValidObjectId(id)).slice(0, 200);
        const note = String(req.body?.note || "").trim().slice(0, 1000);
        let done = 0, skipped = 0, needReview = 0;
        for (const id of ids) {
            try {
                const { t, me, manager, lead } = await loadTask(req, id);
                if (!canEditTask(t, me, manager || lead) || t.closedAt) { skipped++; continue; }
                if (t.status === status) continue;
                try { checkTransition(t, status, me, manager || lead, note); } catch (e) { if (e.status === 403) needReview++; else skipped++; continue; }
                track(t, me, "status", t.status, status, note || "bulk update");
                t.completedAt = status === "Done" ? new Date() : null;
                t.status = status;
                await t.save();
                tellFollowers(t, me, `${tag(t)} is now ${status}`, `“${t.title}”`, t.projectId);
                done++;
            } catch { skipped++; }
        }
        const extra = [needReview && `${needReview} need the lead's review`, skipped && `${skipped} skipped (not yours to change)`].filter(Boolean).join(" · ");
        return res.status(200).json({ success: true, message: `${done} task${done === 1 ? "" : "s"} moved to ${status}${extra ? ` · ${extra}` : ""}.`, data: { done, skipped, needReview } });
    } catch (err) { return fail(res, err); }
};


// POST /tasks/:id/close { note } — close a Done task with a closing note; it leaves the boards
// and moves to the closed history. The assignee, reporter, project lead or their seniors can close.
const closeOne = async (req, id, note) => {
    const { t, me, manager, lead } = await loadTask(req, id);
    if (!canEditTask(t, me, manager || lead)) throw httpError(403, "Only the person on the task, its reporter or the project lead can close it.");
    if (t.closedAt) throw httpError(409, `${tag(t)} is already closed.`);
    if (t.status !== "Done") throw httpError(400, "Mark the task Done before closing it.");
    t.closedAt = new Date(); t.closedBy = me; t.closeNote = note;
    t.comments.push({ employeeId: me, message: `Closed: ${note}` });
    track(t, me, "closed", "Done", "Closed", note);
    await t.save();
    tellFollowers(t, me, `${tag(t)} was closed`, `“${t.title}” — ${note.slice(0, 100)}`, t.projectId);
    return t;
};
const closingNote = (b) => {
    const note = String(b?.note || "").trim().slice(0, 1000);
    if (note.length < 3) throw httpError(400, "Add a closing note — what was done, or why it's closed.");
    return note;
};
export const closeTask = async (req, res) => {
    try {
        const t = await closeOne(req, req.params.id, closingNote(req.body));
        return res.status(200).json({ success: true, message: `${tag(t)} closed and moved to history.`, data: { _id: t._id, closedAt: t.closedAt } });
    } catch (err) { return fail(res, err); }
};
// PUT /tasks/bulk-close { ids, note } — close several Done tasks with one note.
export const bulkCloseTasks = async (req, res) => {
    try {
        const note = closingNote(req.body);
        const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).filter((id) => mongoose.isValidObjectId(id)).slice(0, 200);
        let done = 0, skipped = 0;
        for (const id of ids) { try { await closeOne(req, id, note); done++; } catch { skipped++; } }
        return res.status(200).json({ success: true, message: `${done} task${done === 1 ? "" : "s"} closed${skipped ? ` · ${skipped} skipped (not Done, already closed or not yours)` : ""}.`, data: { done, skipped } });
    } catch (err) { return fail(res, err); }
};
// POST /tasks/:id/reopen { note } — bring a closed task back to In Progress, with the reason.
export const reopenTask = async (req, res) => {
    try {
        const note = String(req.body?.note || "").trim().slice(0, 1000);
        if (note.length < 3) throw httpError(400, "Say why the task is being reopened.");
        const { t, me, manager, lead } = await loadTask(req, req.params.id);
        if (!canEditTask(t, me, manager || lead)) throw httpError(403, "Only the person on the task, its reporter or the project lead can reopen it.");
        if (!t.closedAt) throw httpError(409, `${tag(t)} isn't closed.`);
        t.closedAt = null; t.closedBy = null; t.closeNote = "";
        t.status = "In Progress"; t.completedAt = null;
        t.comments.push({ employeeId: me, message: `Reopened: ${note}` });
        track(t, me, "reopened", "Closed", "In Progress", note);
        await t.save();
        tellFollowers(t, me, `${tag(t)} was reopened`, `“${t.title}” — ${note.slice(0, 100)}`, t.projectId);
        return res.status(200).json({ success: true, message: `${tag(t)} reopened and back on the board.`, data: { _id: t._id, status: t.status } });
    } catch (err) { return fail(res, err); }
};
