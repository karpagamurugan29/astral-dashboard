import Leave from "../models/leaveModel.js";
import LeaveBalance from "../models/LeaveBalanceModel.js";
import employeeModel from "../models/employeeModel.js";
import { logAudit } from "../utils/audit.js";
import { notify, notifyApprovers } from "../utils/notify.js";

const daysBetween = (fromDate, toDate) => {
    const from = new Date(fromDate);
    const to = new Date(toDate);
    return Math.round((to - from) / (1000 * 60 * 60 * 24)) + 1;
};

// A Manager/Team Lead may only act on leave requests belonging to their direct reports.
// Admin/HR are unrestricted. Returns true if `actor` is allowed to view/decide `targetEmployeeId`'s leave.
const isWithinApproverScope = async (actor, targetEmployeeId) => {
    if (actor.role === "Admin" || actor.role === "HR") return true;
    if (actor.role === "Manager" || actor.role === "Team Lead") {
        const target = await employeeModel.findById(targetEmployeeId).select("manager");
        return target?.manager && String(target.manager) === String(actor.id);
    }
    return false;
};

const leaveTypeMap = {
    "Casual Leave": "casual",
    "Sick Leave": "sick",
    "Earned Leave": "earned",
    "Compensatory Leave": "compensatory",
    "Optional Holiday": "optionalHoliday",
    "Work From Home": "workFromHome",
    "Loss Of Pay": "lossOfPay",
};

// ==============================
// Apply Leave
// ==============================
export const applyLeave = async (req, res) => {
    try {
        const employeeId = req.user.id;

        const { leaveType, fromDate, toDate, halfDay, session, reason, attachment, } = req.body;

        if (!leaveType || !fromDate || !toDate || !reason) {
            return res.status(400).json({
                success: false,
                message: "All required fields are mandatory.",
            });
        }

        if (isNaN(new Date(fromDate).getTime()) || isNaN(new Date(toDate).getTime())) {
            return res.status(400).json({
                success: false,
                message: "Please provide valid dates.",
            });
        }

        if (new Date(fromDate) > new Date(toDate)) {
            return res.status(400).json({
                success: false,
                message: "From date cannot be after to date.",
            });
        }

        if (halfDay && fromDate !== toDate) {
            return res.status(400).json({
                success: false,
                message: "Half-day leave must be for a single date.",
            });
        }

        // Recompute totalDays server-side — the client-supplied value is display-only and must not be trusted,
        // otherwise a caller could under-report days to slip past the balance check below.
        const totalDays = halfDay ? 0.5 : daysBetween(fromDate, toDate);

        const overlapCandidates = await Leave.find({
            employeeId,
            status: { $in: ["Pending", "Approved"] },
            fromDate: { $lte: new Date(toDate) },
            toDate: { $gte: new Date(fromDate) },
        });

        // Two half-day requests on the same single date only conflict if they share a session
        // (or either one is a full day) — otherwise "First Half" + "Second Half" legitimately coexist.
        const overlap = overlapCandidates.find((existing) => {
            const sameSingleDay =
                halfDay && existing.halfDay &&
                fromDate === toDate &&
                new Date(existing.fromDate).toDateString() === new Date(fromDate).toDateString() &&
                new Date(existing.toDate).toDateString() === new Date(fromDate).toDateString();

            if (sameSingleDay) {
                return existing.session === session;
            }
            return true;
        });

        if (overlap) {
            return res.status(400).json({
                success: false,
                message: "Leave already exists for selected dates.",
            });
        }

        const balance = await LeaveBalance.findOne({
            employeeId,
        });

        if (!balance) {
            return res.status(404).json({
                success: false,
                message: "Leave balance not found.",
            });
        }

        const balanceKey = leaveTypeMap[leaveType];

        if (balanceKey && balanceKey !== "lossOfPay") {
            const available =
                balance[balanceKey].balance;

            if (available < totalDays) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Insufficient leave balance.",
                });
            }
        }

        const leave = await Leave.create({ employeeId, leaveType, fromDate, toDate, totalDays, halfDay, session, reason, attachment, });

        notifyApprovers("New leave request", `A ${leaveType} request for ${totalDays} day(s) is waiting for your review.`, "Leave", "/leave/approvals");

        return res.status(201).json({
            success: true,
            message:
                "Leave applied successfully.",
            data: leave,
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
};

// ==============================
// Leave History
// ==============================
export const leaveHistory = async (
    req,
    res
) => {
    try {
        const employeeId = req.user.id;

        const history = await Leave.find({
            employeeId,
        }).sort({
            createdAt: -1,
        });

        return res.status(200).json({
            success: true,
            total: history.length,
            data: history,
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
};

// ==============================
// Leave Details
// ==============================
export const leaveDetails = async (
    req,
    res
) => {
    try {
        const leave = await Leave.findById(
            req.params.id
        );

        if (!leave) {
            return res.status(404).json({
                success: false,
                message: "Leave not found.",
            });
        }

        const isOwner = String(leave.employeeId) === String(req.user.id);
        if (!isOwner && !(await isWithinApproverScope(req.user, leave.employeeId))) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to view this leave request.",
            });
        }

        return res.status(200).json({
            success: true,
            data: leave,
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
};

// ==============================
// Leave Balance
// ==============================
export const leaveBalance = async (
    req,
    res
) => {
    try {
        const employeeId = req.user.id;

        const balance =
            await LeaveBalance.findOne({
                employeeId,
            });

        return res.status(200).json({
            success: true,
            data: balance,
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
};

// ==============================
// Pending Leaves
// ==============================
export const pendingLeaves = async (
    req,
    res
) => {
    try {

        const filter = { status: "Pending" };

        // A Manager/Team Lead only sees pending requests from their direct reports; Admin/HR see everyone's.
        if (["Manager", "Team Lead"].includes(req.user.role)) {
            const reports = await employeeModel.find({ manager: req.user.id }).select("_id");
            filter.employeeId = { $in: reports.map((r) => r._id) };
        }

        const leaves = await Leave.find(filter).populate(
            "employeeId",
            "employeeId firstName lastName department designation"
        );

        return res.status(200).json({
            success: true,
            total: leaves.length,
            data: leaves,
        });

    } catch (err) {

        return res.status(500).json({
            success: false,
            message: err.message,
        });

    }
};

// ==============================
// Approve Leave
// ==============================
export const approveLeave = async (
    req,
    res
) => {
    try {

        const leave = await Leave.findById(
            req.params.id
        );

        if (!leave) {
            return res.status(404).json({
                success: false,
                message: "Leave not found.",
            });
        }

        if (leave.status !== "Pending") {
            return res.status(400).json({
                success: false,
                message:
                    "Leave already processed.",
            });
        }

        if (!(await isWithinApproverScope(req.user, leave.employeeId))) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to approve this employee's leave.",
            });
        }

        leave.status = "Approved";
        leave.approvedBy = req.user.id;
        leave.approvedAt = new Date();

        await leave.save();

        const balance =
            await LeaveBalance.findOne({
                employeeId:
                    leave.employeeId,
            });

        const balanceKey =
            leaveTypeMap[
            leave.leaveType
            ];

        if (
            balance &&
            balanceKey &&
            balanceKey !==
            "lossOfPay"
        ) {
            balance[balanceKey].used +=
                leave.totalDays;

            balance[
                balanceKey
            ].balance -=
                leave.totalDays;

            await balance.save();
        }

        logAudit(req, "leave.approve", `Approved a ${leave.leaveType} request`, { type: "Leave", id: leave._id });
        notify(leave.employeeId, "Leave approved", `Your ${leave.leaveType} request was approved.`, "Leave", "/leave");

        return res.status(200).json({
            success: true,
            message:
                "Leave approved successfully.",
        });

    } catch (err) {

        return res.status(500).json({
            success: false,
            message: err.message,
        });

    }
};

// ==============================
// Reject Leave
// ==============================
export const rejectLeave = async (
    req,
    res
) => {
    try {

        const { rejectionReason } =
            req.body;

        const leave = await Leave.findById(
            req.params.id
        );

        if (!leave) {
            return res.status(404).json({
                success: false,
                message: "Leave not found.",
            });
        }

        if (leave.status !== "Pending") {
            return res.status(400).json({
                success: false,
                message: "Leave already processed.",
            });
        }

        if (!(await isWithinApproverScope(req.user, leave.employeeId))) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to reject this employee's leave.",
            });
        }

        leave.status = "Rejected";
        leave.rejectedAt = new Date();
        leave.rejectionReason =
            rejectionReason;

        await leave.save();

        logAudit(req, "leave.reject", `Rejected a ${leave.leaveType} request`, { type: "Leave", id: leave._id });
        notify(leave.employeeId, "Leave rejected", `Your ${leave.leaveType} request was rejected.`, "Leave", "/leave");

        return res.status(200).json({
            success: true,
            message:
                "Leave rejected successfully.",
        });

    } catch (err) {

        return res.status(500).json({
            success: false,
            message: err.message,
        });

    }
};

// ==============================
// Cancel Leave
// ==============================
export const cancelLeave = async (
    req,
    res
) => {
    try {

        const { cancellationReason } =
            req.body;

        const leave = await Leave.findOne({
            _id: req.params.id,
            employeeId: req.user.id,
        });

        if (!leave) {
            return res.status(404).json({
                success: false,
                message: "Leave not found.",
            });
        }

        if (leave.status !== "Pending") {
            return res.status(400).json({
                success: false,
                message:
                    "Only pending leave can be cancelled.",
            });
        }

        leave.status = "Cancelled";
        leave.cancelledAt = new Date();
        leave.cancellationReason =
            cancellationReason;

        await leave.save();

        return res.status(200).json({
            success: true,
            message:
                "Leave cancelled successfully.",
        });

    } catch (err) {

        return res.status(500).json({
            success: false,
            message: err.message,
        });

    }
};

// ==============================
// Team Leave Calendar — everyone's approved/pending leave in a month
// ==============================
export const teamLeaveCalendar = async (req, res) => {
    try {
        const currentDate = new Date();
        const month = Number(req.query.month) || currentDate.getMonth() + 1;
        const year = Number(req.query.year) || currentDate.getFullYear();

        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59);

        const leaves = await Leave.find({
            status: { $in: ["Pending", "Approved"] },
            fromDate: { $lte: endDate },
            toDate: { $gte: startDate },
        })
            .populate("employeeId", "employeeId firstName lastName department")
            .sort({ fromDate: 1 });

        return res.status(200).json({
            success: true,
            month,
            year,
            data: leaves,
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
};

// ==============================
// Admin - All Leaves
// ==============================
export const getAllLeaves = async (
    req,
    res
) => {
    try {

        const leaves = await Leave.find()
            .populate(
                "employeeId",
                "employeeId firstName lastName department designation"
            )
            .sort({
                createdAt: -1,
            });

        return res.status(200).json({
            success: true,
            total: leaves.length,
            data: leaves,
        });

    } catch (err) {

        return res.status(500).json({
            success: false,
            message: err.message,
        });

    }
};