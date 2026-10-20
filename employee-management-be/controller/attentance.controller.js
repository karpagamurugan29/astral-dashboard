import attendanceModel from "../models/attendanceModel.js";
import CompanySettings from "../models/CompanySettingsModel.js";
import regularizationModel from "../models/regularizationModel.js";
import employeeModel from "../models/employeeModel.js";
import leaveModel from "../models/leaveModel.js";
import { notify, notifyApprovers } from "../utils/notify.js";
import { logAudit } from "../utils/audit.js";
import { parseLocation, fillAddressLater, LOCATION_REQUIRED } from "../utils/location.js";
import { sessionsOf, openSession, workedHoursOf, ensureSessions, statusFor } from "../utils/attendanceSessions.js";

export const checkIn = async (req, res) => {
    try {
        const employeeId = req.user.id;
        const {
            attendanceType,
            address,
            device,
            remarks,
        } = req.body;

        const location = parseLocation(req.body);
        if (!location) {
            return res.status(400).json({ success: false, message: LOCATION_REQUIRED });
        }

        const attendanceDate = new Date().toISOString().split("T")[0];
        const checkInTime = new Date();
        const punchIn = { time: checkInTime, ...location, address, device, ipAddress: req.ip, remarks };

        let attendance = await attendanceModel.findOne({ employeeId, attendanceDate });

        if (attendance) {
            // Checking in again later the same day starts a new session.
            if (openSession(attendance)) {
                return res.status(400).json({ success: false, message: "You're already checked in. Check out first." });
            }
            ensureSessions(attendance);
            attendance.sessions.push({ mode: attendanceType || attendance.attendanceType, checkIn: punchIn, checkOut: { time: null } });
            attendance.checkOut = { time: null };
            await attendance.save();
        } else {
            const companySettings = await CompanySettings.findOne();
            const expectedCheckIn = companySettings?.workingHours?.checkInTime || "09:30";
            const graceMinutes = companySettings?.workingHours?.gracePeriodMinutes ?? 15;

            const [expectedHour, expectedMinute] = expectedCheckIn.split(":").map(Number);
            const expectedWithGrace = new Date(checkInTime);
            expectedWithGrace.setHours(expectedHour, expectedMinute + graceMinutes, 0, 0);

            // Lateness is judged on the first check-in of the day only.
            const lateByMinutes = checkInTime > expectedWithGrace
                ? Math.round((checkInTime - expectedWithGrace) / 60000)
                : 0;

            attendance = await attendanceModel.create({
                employeeId,
                attendanceDate,
                attendanceType,
                checkIn: punchIn,
                sessions: [{ mode: attendanceType, checkIn: punchIn, checkOut: { time: null } }],
                lateByMinutes,
                status: lateByMinutes > 0 ? "Late" : "Present",
            });
        }

        const idx = attendance.sessions.length - 1;
        fillAddressLater({ ...location, address }, (addr) => {
            const set = { [`sessions.${idx}.checkIn.address`]: addr };
            if (idx === 0) set["checkIn.address"] = addr;
            attendanceModel.updateOne({ _id: attendance._id }, { $set: set }).catch(() => {});
        });

        return res.status(201).json({
            success: true,
            message: idx === 0 ? "Checked in successfully." : "Checked in again.",
            data: attendance,
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
};

export const attendanceHistory = async (req, res) => {
    try {
        const employeeId = req.user.id;

        const currentDate = new Date();

        const month = Number(req.query.month) || currentDate.getMonth() + 1;
        const year = Number(req.query.year) || currentDate.getFullYear();

        const startDate = `${year}-${String(month).padStart(2, "0")}-01`;

        const endDate = new Date(year, month, 0).getDate();

        const endDateString = `${year}-${String(month).padStart(2, "0")}-${String(endDate).padStart(2, "0")}`;

        const attendance = await attendanceModel
            .find({
                employeeId,
                attendanceDate: {
                    $gte: startDate,
                    $lte: endDateString,
                },
            })
            .sort({ attendanceDate: 1 });

        return res.status(200).json({
            success: true,
            month,
            year,
            totalRecords: attendance.length,
            data: attendance,
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
};

export const todayAttendance = async (req, res) => {
    try {
        const employeeId = req.user.id;

        const attendanceDate = new Date()
            .toISOString()
            .split("T")[0];

        const attendance = await attendanceModel.findOne({
            employeeId,
            attendanceDate,
        });

        if (!attendance) {
            return res.status(404).json({
                success: false,
                message: "No attendance found for today.",
            });
        }

        const requiredHours = 9;
        const open = openSession(attendance);
        const workedHours = Number(workedHoursOf(attendance, new Date()).toFixed(2));

        const remainingHours = Math.max(
            0,
            Number((requiredHours - workedHours).toFixed(2))
        );

        return res.status(200).json({
            success: true,
            data: {
                attendanceDate,
                attendanceType: attendance.attendanceType,
                status: attendance.status,
                lateByMinutes: attendance.lateByMinutes,

                checkIn: attendance.checkIn.time,
                checkOut: open ? null : attendance.checkOut?.time || null,

                workedHours,
                requiredHours,
                remainingHours,

                // isCheckedOut = no session is open right now; they can still check in again.
                autoCheckedOut: !!attendance.autoCheckedOut && !open,
                isCheckedIn: !!open,
                isCheckedOut: !open,
                currentSessionStart: open ? open.checkIn.time : null,
                sessions: sessionsOf(attendance).map((x) => ({
                    mode: x.mode || attendance.attendanceType,
                    checkIn: x.checkIn?.time || null,
                    checkOut: x.checkOut?.time || null,
                    checkInAddress: x.checkIn?.address || "",
                    checkOutAddress: x.checkOut?.address || "",
                })),
            },
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
};

export const checkOut = async (req, res) => {
    try {
        const employeeId = req.user.id;

        const {
            address,
            device,
            remarks,
        } = req.body;

        const location = parseLocation(req.body);
        if (!location) {
            return res.status(400).json({ success: false, message: LOCATION_REQUIRED });
        }

        const attendanceDate = new Date()
            .toISOString()
            .split("T")[0];

        const attendance = await attendanceModel.findOne({
            employeeId,
            attendanceDate,
        });

        if (!attendance) {
            return res.status(404).json({
                success: false,
                message: "Please check in first.",
            });
        }

        if (!openSession(attendance)) {
            return res.status(400).json({
                success: false,
                message: "You're not checked in right now.",
            });
        }

        const punchOut = { time: new Date(), ...location, address, device, ipAddress: req.ip, remarks };

        ensureSessions(attendance);
        const idx = attendance.sessions.length - 1;
        attendance.sessions[idx].checkOut = punchOut;
        attendance.checkOut = punchOut;
        attendance.workingHours = Number(workedHoursOf(attendance).toFixed(2));

        const companySettings = await CompanySettings.findOne();
        const halfDayHours =
            companySettings?.workingHours?.halfDayHours || 4.5;
        attendance.status = statusFor(attendance, halfDayHours);

        await attendance.save();

        fillAddressLater({ ...location, address }, (addr) =>
            attendanceModel.updateOne(
                { _id: attendance._id },
                { $set: { [`sessions.${idx}.checkOut.address`]: addr, "checkOut.address": addr } }
            ).catch(() => {})
        );

        return res.status(200).json({
            success: true,
            message: "Checked out successfully.",
            data: attendance,
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
};

// ==============================
// Team Attendance — today's status for everyone (Manager/HR/Admin)
// ==============================
export const teamAttendance = async (req, res) => {
    try {
        const attendanceDate = req.query.date || new Date().toISOString().split("T")[0];
        const { department, branch } = req.query;

        const employeeFilter = { status: "Active" };
        if (department) employeeFilter.department = department;
        if (branch) employeeFilter.branch = branch;
        // A Manager/Team Lead only sees their own direct reports; Admin/HR see the whole active roster.
        if (["Manager", "Team Lead"].includes(req.user.role)) employeeFilter.manager = req.user.id;

        const employees = await employeeModel
            .find(employeeFilter)
            .select("employeeId firstName lastName department designation profileImage branch")
            .sort({ firstName: 1 });

        const records = await attendanceModel.find({ attendanceDate, employeeId: { $in: employees.map((e) => e._id) } });
        const recordMap = new Map(records.map((r) => [String(r.employeeId), r]));

        const onLeave = await leaveModel.find({
            status: "Approved",
            fromDate: { $lte: new Date(attendanceDate) },
            toDate: { $gte: new Date(attendanceDate) },
            employeeId: { $in: employees.map((e) => e._id) },
        }).select("employeeId");
        const onLeaveSet = new Set(onLeave.map((l) => String(l.employeeId)));

        const data = employees.map((emp) => {
            const record = recordMap.get(String(emp._id));

            if (record) {
                return {
                    employeeId: emp,
                    status: record.status,
                    checkIn: record.checkIn?.time || null,
                    checkOut: record.checkOut?.time || null,
                    lateByMinutes: record.lateByMinutes || 0,
                    workingHours: record.workingHours || 0,
                };
            }

            return {
                employeeId: emp,
                status: onLeaveSet.has(String(emp._id)) ? "On Leave" : "Absent",
                checkIn: null,
                checkOut: null,
                lateByMinutes: 0,
                workingHours: 0,
            };
        });

        return res.status(200).json({
            success: true,
            date: attendanceDate,
            data,
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
};

// ==============================
// Regularization
// ==============================
export const requestRegularization = async (req, res) => {
    try {
        const employeeId = req.user.id;
        const { attendanceDate, requestedCheckIn, requestedCheckOut, reason } = req.body;

        if (!attendanceDate || !reason) {
            return res.status(400).json({
                success: false,
                message: "Attendance date and reason are required.",
            });
        }

        const regularization = await regularizationModel.create({
            employeeId, attendanceDate, requestedCheckIn, requestedCheckOut, reason,
        });

        logAudit(req, "attendance.regularization_request", `Requested regularization for ${attendanceDate}`, { type: "Regularization", id: regularization._id });
        notifyApprovers("Attendance regularization request", `A correction request for ${attendanceDate} is waiting for your review.`, "General", "/attendance/regularization");

        return res.status(201).json({
            success: true,
            message: "Regularization request submitted.",
            data: regularization,
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
};

export const getMyRegularizations = async (req, res) => {
    try {
        const records = await regularizationModel
            .find({ employeeId: req.user.id })
            .sort({ createdAt: -1 });

        return res.status(200).json({ success: true, data: records });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

export const getPendingRegularizations = async (req, res) => {
    try {
        const records = await regularizationModel
            .find({ status: "Pending" })
            .populate("employeeId", "employeeId firstName lastName department")
            .sort({ createdAt: -1 });

        return res.status(200).json({ success: true, data: records });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

export const decideRegularization = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // "Approved" | "Rejected"

        const regularization = await regularizationModel.findById(id);

        if (!regularization) {
            return res.status(404).json({ success: false, message: "Regularization request not found." });
        }

        regularization.status = status;
        regularization.approvedBy = req.user.id;
        await regularization.save();

        if (status === "Approved") {
            // The corrected check-in is the day's first; the corrected check-out closes the day's last session.
            const at = (hhmm) => new Date(`${regularization.attendanceDate}T${hhmm}:00`);
            let attendance = await attendanceModel.findOne({ employeeId: regularization.employeeId, attendanceDate: regularization.attendanceDate });
            if (!attendance) {
                attendance = new attendanceModel({ employeeId: regularization.employeeId, attendanceDate: regularization.attendanceDate, attendanceType: "Office" });
            }
            ensureSessions(attendance);
            if (regularization.requestedCheckIn) {
                const t = at(regularization.requestedCheckIn);
                if (!attendance.sessions.length) attendance.sessions.push({ mode: attendance.attendanceType, checkIn: { time: t }, checkOut: { time: null } });
                else attendance.sessions[0].checkIn.time = t;
                attendance.set("checkIn.time", t);
            }
            if (regularization.requestedCheckOut && attendance.sessions.length) {
                const t = at(regularization.requestedCheckOut);
                attendance.sessions[attendance.sessions.length - 1].checkOut.time = t;
                attendance.set("checkOut.time", t);
            }
            attendance.workingHours = Number(workedHoursOf(attendance).toFixed(2));
            attendance.status = "Present";
            await attendance.save();
        }

        notify(regularization.employeeId, `Regularization ${status}`, `Your attendance correction for ${regularization.attendanceDate} was ${status.toLowerCase()}.`, "General", "/attendance/regularization");
        logAudit(req, "attendance.regularization_decision", `${status} a regularization request`, { type: "Regularization", id: regularization._id });

        return res.status(200).json({
            success: true,
            message: `Request ${status.toLowerCase()}.`,
            data: regularization,
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
};