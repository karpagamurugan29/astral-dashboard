import mongoose from "mongoose";
import employeeModel from "../models/employeeModel.js";
import attendanceModel from "../models/attendanceModel.js";
import leaveModel from "../models/leaveModel.js";
import expenseModel from "../models/expenseModel.js";
import ticketModel from "../models/ticketModel.js";
import { ACTIVE as ACTIVE_TICKETS } from "../utils/helpdesk.js";
import taskModel from "../models/taskModel.js";
import ProjectModel from "../models/ProjectModel.js";
import { scopeOf, workFilter, visibleIds } from "../utils/hierarchy.js";
// Everyone in the caller's team (any depth), shaped like a find() result.
const teamOf = async (req) => [...(await scopeOf(req)).team].map((id) => ({ _id: new mongoose.Types.ObjectId(id) }));

// aggregate()'s $match stage doesn't auto-cast strings to ObjectId the way find() does.
const oid = (id) => new mongoose.Types.ObjectId(id);

// Firm-wide seniors and HR see firm totals; everyone else the totals for themselves and their team.
const peopleMatch = async (req, field = "employeeId") => {
    const ids = visibleIds(await scopeOf(req), "people");
    return ids ? { [field]: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } } : {};
};

export const getDashboardSummary = async (req, res) => {
    try {
        const [who, emp] = await Promise.all([peopleMatch(req), peopleMatch(req, "_id")]);
        const today = new Date().toISOString().split("T")[0];

        const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

        const [
            totalEmployees,
            presentToday,
            onLeaveToday,
            pendingLeaveApprovals,
            openTickets,
            pendingExpenses,
            newEmployeesThisMonth,
        ] = await Promise.all([
            employeeModel.countDocuments({ ...emp, status: "Active" }),
            attendanceModel.countDocuments({ ...who, attendanceDate: today, "checkIn.time": { $ne: null } }),
            leaveModel.countDocuments({
                ...who,
                status: "Approved",
                fromDate: { $lte: new Date(today) },
                toDate: { $gte: new Date(today) },
            }),
            leaveModel.countDocuments({ ...who, status: "Pending" }),
            ticketModel.countDocuments({ ...who, status: { $in: ACTIVE_TICKETS } }),
            expenseModel.countDocuments({ ...who, status: "Pending" }),
            employeeModel.countDocuments({ ...emp, joiningDate: { $gte: monthStart } }),
        ]);

        const absentToday = Math.max(0, totalEmployees - presentToday - onLeaveToday);

        return res.status(200).json({
            success: true,
            data: {
                totalEmployees,
                presentToday,
                absentToday,
                onLeaveToday,
                pendingLeaveApprovals,
                openTickets,
                pendingExpenses,
                newEmployeesThisMonth,
            },
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getAttendanceTrend = async (req, res) => {
    try {
        const days = Number(req.query.days) || 7;
        const dates = [];
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            dates.push(d.toISOString().split("T")[0]);
        }

        const counts = await attendanceModel.aggregate([
            { $match: { ...(await peopleMatch(req)), attendanceDate: { $in: dates } } },
            { $group: { _id: "$attendanceDate", present: { $sum: 1 } } },
        ]);

        const countMap = counts.reduce((acc, c) => ({ ...acc, [c._id]: c.present }), {});

        return res.status(200).json({
            success: true,
            data: dates.map((d) => ({ date: d, present: countMap[d] || 0 })),
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getLeaveTrend = async (req, res) => {
    try {
        const year = Number(req.query.year) || new Date().getFullYear();

        const results = await leaveModel.aggregate([
            { $match: { ...(await peopleMatch(req)), fromDate: { $gte: new Date(`${year}-01-01`), $lte: new Date(`${year}-12-31`) } } },
            { $group: { _id: { $month: "$fromDate" }, count: { $sum: 1 } } },
        ]);

        const byMonth = Array.from({ length: 12 }, (_, i) => {
            const found = results.find((r) => r._id === i + 1);
            return found ? found.count : 0;
        });

        return res.status(200).json({ success: true, data: byMonth });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getHeadcountByDepartment = async (req, res) => {
    try {
        const results = await employeeModel.aggregate([
            { $match: { ...(await peopleMatch(req, "_id")), status: "Active" } },
            { $group: { _id: "$department", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
        ]);

        return res.status(200).json({
            success: true,
            data: results.map((r) => ({ department: r._id, count: r.count })),
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// Task status breakdown for the "Task Pipeline" dashboard widget — same scope as the
// plain task list (own tasks, + direct reports' + own projects' for Manager/Team Lead, everyone's for Admin/HR).
export const getTaskStatusBreakdown = async (req, res) => {
    try {
        let filter = { assignedTo: oid(req.user.id) };

        if ((await scopeOf(req)).firm) {
            filter = {};
        } else if ((await scopeOf(req)).leads) {
            const [reports, scopedProjects] = await Promise.all([
                teamOf(req),
                ProjectModel.find({ $or: [{ projectManager: req.user.id }, { teamMembers: req.user.id }] }).select("_id"),
            ]);
            filter = {
                $or: [
                    { assignedTo: oid(req.user.id) },
                    { assignedTo: { $in: reports.map((r) => r._id) } },
                    { projectId: { $in: scopedProjects.map((p) => p._id) } },
                ],
            };
        }

        const counts = await taskModel.aggregate([
            { $match: filter },
            { $group: { _id: "$status", count: { $sum: 1 } } },
        ]);

        const statuses = ["To Do", "In Progress", "In Review", "Blocked", "Done"];
        const data = statuses.map((s) => ({ status: s, count: counts.find((c) => c._id === s)?.count || 0 }));

        return res.status(200).json({ success: true, data });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// Leave-by-type breakdown (approved, current year) for the "Leave Mix" widget — same
// direct-report scope as Leave Approvals; Employee sees only their own.
export const getLeaveBreakdown = async (req, res) => {
    try {
        const year = new Date().getFullYear();
        const match = {
            status: "Approved",
            fromDate: { $gte: new Date(`${year}-01-01`), $lte: new Date(`${year}-12-31`) },
        };

        const scope = await scopeOf(req);
        if (scope.people) {
            // HR and firm-wide seniors — no employeeId filter, firm-wide.
        } else if (scope.leads) {
            const reports = await teamOf(req);
            match.employeeId = { $in: [oid(req.user.id), ...reports.map((r) => r._id)] };
        } else {
            match.employeeId = oid(req.user.id);
        }

        const counts = await leaveModel.aggregate([
            { $match: match },
            { $group: { _id: "$leaveType", totalDays: { $sum: "$totalDays" }, count: { $sum: 1 } } },
            { $sort: { totalDays: -1 } },
        ]);

        return res.status(200).json({
            success: true,
            data: counts.map((c) => ({ leaveType: c._id, totalDays: c.totalDays, count: c.count })),
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// Top projects by progress for the "Project Momentum" widget — same scope as the plain
// project list (own/managed projects for Manager/Team Lead/Employee, everyone's for Admin/HR).
export const getProjectProgress = async (req, res) => {
    try {
        const filter = { isDeleted: false, ...(await workFilter(req)) };

        const projects = await ProjectModel.find(filter)
            .select("projectName progress status")
            .sort({ progress: -1 })
            .limit(8);

        return res.status(200).json({ success: true, data: projects });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
