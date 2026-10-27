import mongoose from "mongoose";
import attendanceModel from "../models/attendanceModel.js";
import leaveModel from "../models/leaveModel.js";
import payrollRunModel from "../models/payrollRunModel.js";
import expenseModel from "../models/expenseModel.js";
import ProjectModel from "../models/ProjectModel.js";
import taskModel from "../models/taskModel.js";
import employeeModel from "../models/employeeModel.js";
import holidayModel from "../models/holidayModel.js";
import { getHeadcountByDepartment } from "./dashboard.controller.js";
import { scopeOf, visibleIds, workFilter } from "../utils/hierarchy.js";

// Attendance for a month, per active employee, measured against the working calendar:
// working days = weekdays up to today (or month end) minus holidays; absent = working days with
// neither a check-in nor approved leave. (Days without a check-in have no attendance record, so
// they can't be counted from records alone.) Managers / Team Leads see their direct reports.
export const attendanceReport = async (req, res) => {
    try {
        const currentDate = new Date();
        const month = Number(req.query.month) || currentDate.getMonth() + 1;
        const year = Number(req.query.year) || currentDate.getFullYear();
        const pad = (n) => String(n).padStart(2, "0");
        const startDate = `${year}-${pad(month)}-01`;
        const endDay = new Date(year, month, 0).getDate();
        const endDate = `${year}-${pad(month)}-${pad(endDay)}`;

        const empFilter = { status: "Active" };
        const teamIds = visibleIds(await scopeOf(req), "people");
        if (teamIds) empFilter._id = { $in: teamIds };
        const employees = await employeeModel.find(empFilter).select("employeeId firstName lastName department designation joiningDate").lean();
        const ids = employees.map((e) => e._id);

        const holidays = await holidayModel.find({ date: { $gte: new Date(`${startDate}T00:00:00Z`), $lte: new Date(`${endDate}T23:59:59Z`) } }).select("date").lean().catch(() => []);
        const holidaySet = new Set(holidays.map((h) => new Date(h.date).toISOString().slice(0, 10)));
        const todayKey = new Date().toISOString().slice(0, 10);
        const workdays = [];
        for (let d = 1; d <= endDay; d++) {
            const key = `${year}-${pad(month)}-${pad(d)}`;
            if (key > todayKey) break;
            const dow = new Date(`${key}T12:00:00Z`).getUTCDay();
            if (dow === 0 || dow === 6 || holidaySet.has(key)) continue;
            workdays.push(key);
        }

        const records = await attendanceModel.find({ employeeId: { $in: ids }, attendanceDate: { $gte: startDate, $lte: endDate } }).select("employeeId attendanceDate status workingHours lateByMinutes").lean();
        const leaves = await leaveModel.find({ employeeId: { $in: ids }, status: "Approved", fromDate: { $lte: new Date(`${endDate}T23:59:59Z`) }, toDate: { $gte: new Date(`${startDate}T00:00:00Z`) } }).select("employeeId fromDate toDate").lean();

        const data = employees.map((e) => {
            const mine = records.filter((r) => String(r.employeeId) === String(e._id));
            const joined = e.joiningDate ? new Date(e.joiningDate).toISOString().slice(0, 10) : null;
            const days = workdays.filter((k) => !joined || k >= joined);
            const leaveDays = new Set();
            leaves.filter((l) => String(l.employeeId) === String(e._id)).forEach((l) => {
                days.forEach((k) => { if (k >= new Date(l.fromDate).toISOString().slice(0, 10) && k <= new Date(l.toDate).toISOString().slice(0, 10)) leaveDays.add(k); });
            });
            const count = (st) => mine.filter((r) => r.status === st).length;
            const present = count("Present") + count("Late");
            const half = count("Half Day");
            const worked = new Set(mine.map((r) => r.attendanceDate));
            const absent = days.filter((k) => !worked.has(k) && !leaveDays.has(k)).length;
            const base = Math.max(0, days.length - leaveDays.size);
            // rate only counts days inside the calendar (weekend work or records before joining
            // would otherwise push it past 100%)
            const inCalendar = new Set(days.filter((k) => !leaveDays.has(k)));
            const credited = mine.filter((r) => inCalendar.has(r.attendanceDate)).reduce((t, r) => t + (r.status === "Half Day" ? 0.5 : ["Present", "Late"].includes(r.status) ? 1 : 0), 0);
            const hours = mine.reduce((t, r) => t + (Number(r.workingHours) || 0), 0);
            const statuses = [...new Set(mine.map((r) => r.status))].map((st) => ({ status: st, count: count(st) }));
            if (absent) statuses.push({ status: "Absent", count: absent });
            return {
                _id: e._id, employeeId: e.employeeId, firstName: e.firstName, lastName: e.lastName, department: e.department, designation: e.designation,
                statuses, workingDays: days.length, present, late: count("Late"), half, leave: leaveDays.size, absent,
                hours: +hours.toFixed(1), avgHours: present + half ? +(hours / (present + half)).toFixed(1) : 0,
                lateMinutes: mine.reduce((t, r) => t + (r.lateByMinutes || 0), 0),
                rate: base ? Math.min(100, Math.round((credited / base) * 100)) : 0,
            };
        });

        return res.status(200).json({ success: true, month, year, workingDays: workdays.length, data });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const leaveReport = async (req, res) => {
    try {
        const year = Number(req.query.year) || new Date().getFullYear();
        const ids = visibleIds(await scopeOf(req), "people");
        const who = ids ? { employeeId: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } } : {};

        const byType = await leaveModel.aggregate([
            { $match: { ...who, fromDate: { $gte: new Date(`${year}-01-01`), $lte: new Date(`${year}-12-31`) } } },
            { $group: { _id: "$leaveType", totalDays: { $sum: "$totalDays" }, count: { $sum: 1 } } },
        ]);

        const byStatus = await leaveModel.aggregate([
            { $match: { ...who, fromDate: { $gte: new Date(`${year}-01-01`), $lte: new Date(`${year}-12-31`) } } },
            { $group: { _id: "$status", count: { $sum: 1 } } },
        ]);

        return res.status(200).json({
            success: true,
            year,
            data: {
                byType: byType.map((t) => ({ leaveType: t._id, totalDays: t.totalDays, count: t.count })),
                byStatus: byStatus.map((s) => ({ status: s._id, count: s.count })),
            },
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const payrollReport = async (req, res) => {
    try {
        const runs = await payrollRunModel.find({}).sort({ period: -1 }).limit(12);
        return res.status(200).json({ success: true, data: runs });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const headcountReport = async (req, res) => {
    return getHeadcountByDepartment(req, res);
};

// A Manager/Team Lead's project/task reports are scoped to the projects they manage or are a
// member of, matching the same scoping already used for the plain project list (getAllProjects).
// Now: the projects the caller or anyone in their team leads or works on (firm-wide seniors: all).
const projectScopeFilter = (req) => workFilter(req);

export const projectReport = async (req, res) => {
    try {
        const { projectId, projectManager, status, startDate, endDate } = req.query;

        const filter = { isDeleted: false, ...(await projectScopeFilter(req)) };
        if (projectId) filter._id = projectId;
        if (projectManager) filter.projectManager = projectManager;
        if (status) filter.status = status;
        if (startDate || endDate) {
            filter.startDate = {};
            if (startDate) filter.startDate.$gte = new Date(startDate);
            if (endDate) filter.startDate.$lte = new Date(endDate);
        }

        const projects = await ProjectModel.find(filter)
            .populate("projectManager", "employeeId firstName lastName")
            .populate("teamMembers", "employeeId firstName lastName")
            .sort({ startDate: -1 });

        const taskCounts = await taskModel.aggregate([
            { $match: { projectId: { $in: projects.map((p) => p._id) } } },
            {
                $group: {
                    _id: "$projectId",
                    totalTasks: { $sum: 1 },
                    completedTasks: { $sum: { $cond: [{ $eq: ["$status", "Done"] }, 1, 0] } },
                    overdueTasks: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $ne: ["$status", "Done"] },
                                        { $ne: ["$dueDate", null] },
                                        { $lt: ["$dueDate", new Date()] },
                                    ],
                                },
                                1,
                                0,
                            ],
                        },
                    },
                },
            },
        ]);
        const countMap = new Map(taskCounts.map((c) => [String(c._id), c]));

        const data = projects.map((p) => {
            const counts = countMap.get(String(p._id)) || { totalTasks: 0, completedTasks: 0, overdueTasks: 0 };
            return {
                _id: p._id,
                projectCode: p.projectCode,
                projectName: p.projectName,
                projectManager: p.projectManager,
                teamMembers: p.teamMembers,
                startDate: p.startDate,
                endDate: p.endDate,
                status: p.status,
                progress: p.progress,
                totalTasks: counts.totalTasks,
                completedTasks: counts.completedTasks,
                pendingTasks: counts.totalTasks - counts.completedTasks,
                overdueTasks: counts.overdueTasks,
            };
        });

        return res.status(200).json({ success: true, total: data.length, data });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const taskReport = async (req, res) => {
    try {
        const { projectId, assignedTo, status, priority, startDate, endDate, overdue } = req.query;

        const filter = {};
        if (projectId) filter.projectId = projectId;
        if (assignedTo) filter.assignedTo = assignedTo;
        if (status) filter.status = status;
        if (priority) filter.priority = priority;
        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) filter.createdAt.$lte = new Date(endDate);
        }
        if (overdue === "true") {
            filter.dueDate = { $ne: null, $lt: new Date() };
            if (!filter.status) filter.status = { $ne: "Done" };
        }

        const scope = await scopeOf(req);
        if (!scope.firm) {
            const scopedProjects = await ProjectModel.find(await projectScopeFilter(req)).select("_id");
            const reports = [...scope.team].map((id) => ({ _id: id }));
            filter.$and = [
                {
                    $or: [
                        { projectId: { $in: scopedProjects.map((p) => p._id) } },
                        { assignedTo: { $in: reports.map((r) => r._id) } },
                        { assignedTo: req.user.id },
                    ],
                },
            ];
        }

        const tasks = await taskModel
            .find(filter)
            .populate("assignedTo", "employeeId firstName lastName")
            .populate("projectId", "projectName projectCode")
            .sort({ dueDate: 1 });

        const data = tasks.map((t) => ({
            _id: t._id,
            title: t.title,
            project: t.projectId,
            assignedTo: t.assignedTo,
            priority: t.priority,
            status: t.status,
            dueDate: t.dueDate,
            createdAt: t.createdAt,
            isCompleted: t.status === "Done",
            isOverdue: t.status !== "Done" && !!t.dueDate && new Date(t.dueDate) < new Date(),
        }));

        return res.status(200).json({ success: true, total: data.length, data });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const expenseReport = async (req, res) => {
    try {
        const byCategory = await expenseModel.aggregate([
            { $match: { status: { $in: ["Approved", "Processing", "Reimbursed"] } } },
            { $group: { _id: "$category", total: { $sum: "$amount" }, count: { $sum: 1 } } },
            { $sort: { total: -1 } },
        ]);

        const byStatus = await expenseModel.aggregate([
            { $group: { _id: "$status", total: { $sum: "$amount" }, count: { $sum: 1 } } },
        ]);

        return res.status(200).json({
            success: true,
            data: {
                byCategory: byCategory.map((c) => ({ category: c._id, total: c.total, count: c.count })),
                byStatus: byStatus.map((s) => ({ status: s._id, total: s.total, count: s.count })),
            },
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
