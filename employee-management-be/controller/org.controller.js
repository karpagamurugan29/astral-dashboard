import mongoose from "mongoose";
import employeeModel from "../models/employeeModel.js";
import attendanceModel from "../models/attendanceModel.js";
import leaveModel from "../models/leaveModel.js";
import taskModel from "../models/taskModel.js";
import ProjectModel from "../models/ProjectModel.js";
import { LADDER, stepOf, tierOf, scopeOf, visibleIds, chainAbove, wouldLoop, invalidateHierarchy, circleOf } from "../utils/hierarchy.js";
import { invalidateAccessCache } from "../utils/access.js";
import { sessionsOf, openSession } from "../utils/attendanceSessions.js";
import { localDayStart } from "../utils/autoCheckout.js";
import { logAudit } from "../utils/audit.js";

const idStr = (v) => (v?._id ?? v)?.toString?.() ?? null;
const fail = (res, err) => res.status(err.status || 500).json({ success: false, message: err.message });

// Today's status, open work and pending leave for a set of people.
const liveStats = async (ids) => {
    if (!ids.length) return {};
    const oids = ids.map((id) => new mongoose.Types.ObjectId(id));
    const since = localDayStart();
    const now = new Date();
    const [att, leaves, tasks, projects, pending] = await Promise.all([
        attendanceModel.find({ employeeId: { $in: oids }, "checkIn.time": { $gte: new Date(since.getTime() - 864e5) } }).lean(),
        leaveModel.find({ employeeId: { $in: oids }, status: "Approved", fromDate: { $lte: now }, toDate: { $gte: since } }).select("employeeId leaveType").lean(),
        taskModel.find({ assignedTo: { $in: oids }, status: { $ne: "Done" }, personal: { $ne: true } }).select("assignedTo dueDate").lean(),
        ProjectModel.find({ isDeleted: false, status: { $nin: ["Completed", "Cancelled"] }, $or: [{ projectManager: { $in: oids } }, { teamMembers: { $in: oids } }] }).select("projectManager teamMembers").lean(),
        leaveModel.find({ employeeId: { $in: oids }, status: "Pending" }).select("employeeId").lean(),
    ]);
    const out = Object.fromEntries(ids.map((id) => [id, { today: "not-in", openTasks: 0, overdueTasks: 0, projects: 0, pendingLeave: 0 }]));
    att.forEach((r) => {
        const s = out[idStr(r.employeeId)];
        if (!s || !sessionsOf(r).some((x) => x.checkIn?.time && new Date(x.checkIn.time) >= since)) return;
        s.today = openSession(r) ? "in" : "out";
    });
    leaves.forEach((l) => { const s = out[idStr(l.employeeId)]; if (s && s.today === "not-in") { s.today = "leave"; s.leaveType = l.leaveType; } });
    tasks.forEach((t) => {
        const s = out[idStr(t.assignedTo)];
        if (!s) return;
        s.openTasks += 1;
        if (t.dueDate && new Date(t.dueDate) < since) s.overdueTasks += 1;
    });
    projects.forEach((p) => new Set([idStr(p.projectManager), ...(p.teamMembers || []).map(idStr)]).forEach((id) => { if (out[id]) out[id].projects += 1; }));
    pending.forEach((l) => { const s = out[idStr(l.employeeId)]; if (s) s.pendingLeave += 1; });
    return out;
};

// GET /org/tree — the whole firm's reporting tree (names and designations, visible to everyone),
// the viewer's reporting line, and live stats for the people the viewer looks after.
export const orgTree = async (req, res) => {
    try {
        const scope = await scopeOf(req);
        // Managers and below see only their own circle (officials above, team mates, their team).
        const circle = await circleOf(scope);
        const people = await employeeModel.find({ status: "Active", ...(circle ? { _id: { $in: [...circle] } } : {}) })
            .select("employeeId firstName lastName designation department profileImage manager email joiningDate")
            .sort({ firstName: 1 }).lean();
        const ids = new Set(people.map((p) => idStr(p._id)));
        const allActive = circle ? new Set((await employeeModel.find({ status: "Active" }).select("_id").lean()).map((p) => idStr(p._id))) : ids;
        const data = people.map((p) => {
            const m = idStr(p.manager);
            const step = stepOf(p.designation);
            return {
                _id: idStr(p._id), employeeId: p.employeeId, firstName: p.firstName, lastName: p.lastName,
                designation: p.designation, department: p.department, profileImage: p.profileImage, email: p.email, joiningDate: p.joiningDate,
                manager: m && ids.has(m) ? m : null,
                orphan: !!m && !allActive.has(m), // points at someone who left
                tier: tierOf(p.designation),
                level: step?.title || p.designation,
            };
        });
        const seeIds = visibleIds(scope, "people") || [...ids];
        // within a circle, someone whose manager sits outside it is shown at the top, not as "orphaned"
        if (circle) data.forEach((p) => { p.orphan = false; });
        const stats = await liveStats(seeIds.filter((id) => ids.has(id)));
        return res.status(200).json({
            success: true,
            data: {
                people: data,
                me: scope.me,
                chain: await chainAbove(scope.me),
                stats,
                ladder: LADDER.map(({ tier, key, title, duty, reach, designations }) => ({ tier, key, title, duty, reach, designations })),
                scope: { firm: scope.firm, people: scope.people, finance: scope.finance, leads: scope.leads, teamSize: scope.team.size, direct: scope.direct.size },
                canEdit: scope.firm || scope.people,
            },
        });
    } catch (err) { return fail(res, err); }
};

// PUT /org/:id/manager { manager } — change who someone reports to (Admin, HR, firm-wide seniors).
export const setManager = async (req, res) => {
    try {
        const scope = await scopeOf(req);
        if (!(scope.firm || scope.people)) return res.status(403).json({ success: false, message: "Only HR or the firm's leadership can change reporting lines." });
        const { id } = req.params;
        const manager = req.body?.manager || null;
        if (!mongoose.isValidObjectId(id) || (manager && !mongoose.isValidObjectId(manager))) return res.status(400).json({ success: false, message: "Pick a valid person." });
        const [emp, boss] = await Promise.all([employeeModel.findById(id).select("firstName lastName designation"), manager ? employeeModel.findById(manager).select("firstName lastName designation status") : null]);
        if (!emp) return res.status(404).json({ success: false, message: "Employee not found." });
        if (manager && (!boss || boss.status !== "Active")) return res.status(400).json({ success: false, message: "The new manager must be an active employee." });
        if (await wouldLoop(id, manager)) return res.status(400).json({ success: false, message: `${boss.firstName} already reports to ${emp.firstName} — that would make a loop.` });
        emp.manager = manager;
        await emp.save({ validateBeforeSave: false });
        invalidateHierarchy();
        invalidateAccessCache();
        const warn = boss && tierOf(boss.designation) > tierOf(emp.designation) ? `Heads up: ${boss.firstName} (${boss.designation}) is junior to ${emp.firstName} (${emp.designation}).` : "";
        logAudit(req, "employee.update", `${emp.firstName} ${emp.lastName} now reports to ${boss ? `${boss.firstName} ${boss.lastName}` : "nobody"}`, { type: "Employee", id: emp._id });
        return res.status(200).json({ success: true, message: boss ? `${emp.firstName} now reports to ${boss.firstName} ${boss.lastName}.` : `${emp.firstName} no longer has a manager.`, warning: warn });
    } catch (err) { return fail(res, err); }
};
