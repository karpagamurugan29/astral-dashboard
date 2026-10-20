import attendanceModel from "../models/attendanceModel.js";
import leaveModel from "../models/leaveModel.js";
import payrollRunModel from "../models/payrollRunModel.js";
import expenseModel from "../models/expenseModel.js";
import ProjectModel from "../models/ProjectModel.js";
import taskModel from "../models/taskModel.js";
import employeeModel from "../models/employeeModel.js";
import { getHeadcountByDepartment } from "./dashboard.controller.js";

export const attendanceReport = async (req, res) => {
    try {
        const currentDate = new Date();
        const month = Number(req.query.month) || currentDate.getMonth() + 1;
        const year = Number(req.query.year) || currentDate.getFullYear();

        const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
        const endDay = new Date(year, month, 0).getDate();
        const endDate = `${year}-${String(month).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;

        const results = await attendanceModel.aggregate([
            { $match: { attendanceDate: { $gte: startDate, $lte: endDate } } },
            {
                $group: {
                    _id: { employeeId: "$employeeId", status: "$status" },
                    count: { $sum: 1 },
                },
            },
            {
                $group: {
                    _id: "$_id.employeeId",
                    statuses: { $push: { status: "$_id.status", count: "$count" } },
                },
            },
            {
                $lookup: {
                    from: "employees",
                    localField: "_id",
                    foreignField: "_id",
                    as: "employee",
                },
            },
            { $unwind: "$employee" },
            {
                $project: {
                    employeeId: "$employee.employeeId",
                    firstName: "$employee.firstName",
                    lastName: "$employee.lastName",
                    department: "$employee.department",
                    statuses: 1,
                },
            },
        ]);

        return res.status(200).json({ success: true, month, year, data: results });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const leaveReport = async (req, res) => {
    try {
        const year = Number(req.query.year) || new Date().getFullYear();

        const byType = await leaveModel.aggregate([
            { $match: { fromDate: { $gte: new Date(`${year}-01-01`), $lte: new Date(`${year}-12-31`) } } },
            { $group: { _id: "$leaveType", totalDays: { $sum: "$totalDays" }, count: { $sum: 1 } } },
        ]);

        const byStatus = await leaveModel.aggregate([
            { $match: { fromDate: { $gte: new Date(`${year}-01-01`), $lte: new Date(`${year}-12-31`) } } },
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
const projectScopeFilter = (user) => {
    if (["Manager", "Team Lead"].includes(user.role)) {
        return { $or: [{ projectManager: user.id }, { teamMembers: user.id }] };
    }
    return {};
};

export const projectReport = async (req, res) => {
    try {
        const { projectId, projectManager, status, startDate, endDate } = req.query;

        const filter = { isDeleted: false, ...projectScopeFilter(req.user) };
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

        if (["Manager", "Team Lead"].includes(req.user.role)) {
            const scopedProjects = await ProjectModel.find(projectScopeFilter(req.user)).select("_id");
            const reports = await employeeModel.find({ manager: req.user.id }).select("_id");
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
            { $match: { status: { $in: ["Approved", "Reimbursed"] } } },
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
