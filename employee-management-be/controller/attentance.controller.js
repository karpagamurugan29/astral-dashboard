import attendanceModel from "../models/attendanceModel.js";
import CompanySettings from "../models/CompanySettingsModel.js";
import regularizationModel from "../models/regularizationModel.js";
import employeeModel from "../models/employeeModel.js";
import leaveModel from "../models/leaveModel.js";
import { notify, notifyApprovers } from "../utils/notify.js";
import { logAudit } from "../utils/audit.js";
import { parseLocation, fillAddressLater, LOCATION_REQUIRED } from "../utils/location.js";
import { sessionsOf, openSession, workedHoursOf, ensureSessions, statusFor } from "../utils/attendanceSessions.js";
import { scopeOf, visibleIds } from "../utils/hierarchy.js";
import { stopTimersAtCheckout } from "../utils/timerGuard.js";

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
            // not checked in yet today — a normal state, not an error
            return res.status(200).json({ success: true, data: null, message: "Not checked in yet today." });
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
        // leaving for the day stops any audit timer still running, so it can't run on overnight
        const timersStopped = await stopTimersAtCheckout(employeeId, new Date());

        fillAddressLater({ ...location, address }, (addr) =>
            attendanceModel.updateOne(
                { _id: attendance._id },
                { $set: { [`sessions.${idx}.checkOut.address`]: addr, "checkOut.address": addr } }
            ).catch(() => {})
        );

        return res.status(200).json({
            success: true,
            message: timersStopped ? `Checked out — your audit timer was stopped too.` : "Checked out successfully.",
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
        // Leads see their whole team (any depth); HR and firm-wide seniors see everyone.
        const ids = visibleIds(await scopeOf(req), "people");
        if (ids) employeeFilter._id = { $in: ids };

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
                const sessions = sessionsOf(record);
                const last = sessions[sessions.length - 1];
                const where = (p) => (p && Number.isFinite(p.latitude) ? { latitude: p.latitude, longitude: p.longitude, accuracy: p.accuracy ?? null, address: p.address || "" } : null);
                return {
                    employeeId: emp,
                    status: record.status,
                    mode: record.attendanceType,
                    checkIn: record.checkIn?.time || null,
                    checkOut: openSession(record) ? null : record.checkOut?.time || null,
                    checkInPlace: where(record.checkIn),
                    checkOutPlace: openSession(record) ? null : where(last?.checkOut),
                    remarks: record.checkIn?.remarks || "",
                    sessions: sessions.length,
                    autoCheckedOut: !!record.autoCheckedOut,
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
        notifyApprovers("Attendance regularization request", `A correction request for ${attendanceDate} is waiting for your review.`, "General", "/attendance/regularization", employeeId);

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
        const scope = await scopeOf(req);
        const records = await regularizationModel
            .find({ status: "Pending", employeeId: scope.people ? { $ne: req.user.id } : { $in: [...scope.team] } })
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
        const scope = await scopeOf(req);
        if (String(regularization.employeeId) === String(req.user.id) || !(scope.people || scope.team.has(String(regularization.employeeId)))) {
            return res.status(403).json({ success: false, message: "Only someone above this person in the reporting line, or HR, can decide this." });
        }
        if (!["Approved", "Rejected"].includes(status)) {
            return res.status(400).json({ success: false, message: "Choose Approve or Reject." });
        }
        // decided once: approving again would re-apply the correction, rejecting later wouldn't undo it
        if (regularization.status !== "Pending") {
            return res.status(409).json({ success: false, message: `This request was already ${String(regularization.status).toLowerCase()}.` });
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
// ==============================
// Subordinate attendance — a month calendar per person for the people you look after
// (leads: their team, any depth; HR / firm-wide seniors: everyone). Each day is one of:
// present (office), wfh, field (client / field visit), half, leave, holiday, weekend,
// absent (a past working day with nothing recorded), rejected leave, or upcoming.
// ==============================
export const subordinateAttendance = async (req, res) => {
    try {
        const now = new Date();
        const year = Number(req.query.year) || now.getFullYear();
        const month = Number(req.query.month) || now.getMonth() + 1;
        const pad = (n) => String(n).padStart(2, "0");
        const days = new Date(year, month, 0).getDate();
        const from = `${year}-${pad(month)}-01`, to = `${year}-${pad(month)}-${pad(days)}`;
        const scope = await scopeOf(req);
        const ids = visibleIds(scope, "people");
        const filter = { status: "Active" };
        if (ids) filter._id = { $in: ids.filter((id) => id !== scope.me) };
        else filter._id = { $ne: req.user.id };
        if (req.query.department) filter.department = req.query.department;
        const people = await employeeModel.find(filter).select("employeeId firstName lastName designation department profileImage manager").sort({ firstName: 1 }).lean();
        const pids = people.map((p) => p._id);
        const { default: holidayModel } = await import("../models/holidayModel.js");
        const [records, leaves, holidays] = await Promise.all([
            attendanceModel.find({ employeeId: { $in: pids }, attendanceDate: { $gte: from, $lte: to } }).select("employeeId attendanceDate attendanceType status workingHours sessions checkIn checkOut").lean(),
            leaveModel.find({ employeeId: { $in: pids }, status: { $in: ["Approved", "Rejected", "Pending"] }, fromDate: { $lte: new Date(`${to}T23:59:59`) }, toDate: { $gte: new Date(`${from}T00:00:00`) } }).select("employeeId leaveType status fromDate toDate").lean(),
            holidayModel.find({ date: { $gte: new Date(`${from}T00:00:00Z`), $lte: new Date(`${to}T23:59:59Z`) } }).select("date name").lean().catch(() => []),
        ]);
        const holidayMap = new Map(holidays.map((h) => [new Date(h.date).toISOString().slice(0, 10), h.name]));
        const todayKey = new Date().toLocaleDateString("en-CA");
        const calendar = Array.from({ length: days }, (_, i) => {
            const key = `${year}-${pad(month)}-${pad(i + 1)}`;
            const dow = new Date(`${key}T12:00:00`).getDay();
            return { key, day: i + 1, dow, weekend: dow === 0 || dow === 6, holiday: holidayMap.get(key) || null };
        });
        const data = people.map((p) => {
            const mine = records.filter((r) => String(r.employeeId) === String(p._id));
            const myLeaves = leaves.filter((l) => String(l.employeeId) === String(p._id));
            const byDay = new Map(mine.map((r) => [r.attendanceDate, r]));
            const cells = calendar.map((c) => {
                const r = byDay.get(c.key);
                const lv = myLeaves.find((l) => c.key >= new Date(l.fromDate).toLocaleDateString("en-CA") && c.key <= new Date(l.toDate).toLocaleDateString("en-CA"));
                let s = "upcoming", note = "";
                if (r && (r.checkIn?.time || (r.sessions || []).length)) {
                    const mode = r.attendanceType || r.sessions?.[0]?.mode || "Office";
                    s = r.status === "Half Day" ? "half" : mode === "Home" ? "wfh" : mode === "Client" || mode === "Field" ? "field" : "present";
                    note = `${r.status === "Late" ? "Late · " : ""}${r.workingHours ? `${Math.round(r.workingHours * 10) / 10}h` : "checked in"}`;
                } else if (lv && lv.status === "Approved") { s = "leave"; note = lv.leaveType; }
                else if (c.holiday) { s = "holiday"; note = c.holiday; }
                else if (c.weekend) { s = "weekend"; }
                else if (lv && lv.status === "Rejected" && c.key <= todayKey) { s = "rejected"; note = `${lv.leaveType} rejected`; }
                else if (c.key < todayKey) { s = "absent"; note = lv?.status === "Pending" ? `${lv.leaveType} pending` : "No check-in"; }
                else if (lv && lv.status === "Pending") { s = "upcoming"; note = `${lv.leaveType} pending`; }
                return { s, note };
            });
            const count = (k) => cells.filter((c) => c.s === k).length;
            return { employee: p, cells, summary: { present: count("present") + count("half"), wfh: count("wfh"), field: count("field"), leave: count("leave"), absent: count("absent") + count("rejected") } };
        });
        return res.status(200).json({ success: true, year, month, today: todayKey, calendar, data, scope: { firm: scope.firm || scope.people, teamSize: scope.team.size } });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// ==============================
// Attendance over a date range — one calculation shared by Team Attendance (range view) and the export.
// ==============================
const pad2 = (n) => String(n).padStart(2, "0");
const TZ_ = "Asia/Kolkata";
const MODE_NAME = { Office: "Office", Home: "Work from home", Client: "Client site", Field: "Field visit" };
const DOW_ = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const rangeFromQuery = (q) => {
    const now = new Date();
    let from = q.from, to = q.to;
    if (q.month && /^\d{4}-\d{2}$/.test(q.month)) { const [y, m] = q.month.split("-").map(Number); from = `${y}-${pad2(m)}-01`; to = `${y}-${pad2(m)}-${pad2(new Date(y, m, 0).getDate())}`; }
    if (!from || !to) { const t = now.toLocaleDateString("en-CA", { timeZone: TZ_ }); from = from || t; to = to || t; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) throw Object.assign(new Error("Pick a valid date range."), { status: 400 });
    const days = Math.round((new Date(`${to}T12:00:00`) - new Date(`${from}T12:00:00`)) / 864e5) + 1;
    if (days > 366) throw Object.assign(new Error("Pick up to one year at a time."), { status: 400 });
    return { from, to, days };
};
const peopleInView = async (req, extra = {}) => {
    const ids = visibleIds(await scopeOf(req), "people");
    const filter = { status: { $in: ["Active", "Resigned", "Terminated"] }, ...extra };
    if (ids) filter._id = { $in: ids };
    return employeeModel.find(filter).select("employeeId firstName lastName designation department branch manager status joiningDate profileImage").populate("manager", "firstName lastName").sort({ firstName: 1, lastName: 1 }).lean();
};
// per person: one cell per day (status code + details) and a summary
const attendanceMatrix = async (people, from, to, days) => {
    const pids = people.map((p) => p._id);
    const { default: holidayModel } = await import("../models/holidayModel.js");
    const [records, leaves, holidays] = await Promise.all([
        attendanceModel.find({ employeeId: { $in: pids }, attendanceDate: { $gte: from, $lte: to } }).lean(),
        leaveModel.find({ employeeId: { $in: pids }, status: "Approved", fromDate: { $lte: new Date(`${to}T23:59:59`) }, toDate: { $gte: new Date(`${from}T00:00:00`) } }).select("employeeId leaveType fromDate toDate").lean(),
        holidayModel.find({ date: { $gte: new Date(`${from}T00:00:00Z`), $lte: new Date(`${to}T23:59:59Z`) } }).select("date name").lean().catch(() => []),
    ]);
    const holidayMap = new Map(holidays.map((h) => [new Date(h.date).toISOString().slice(0, 10), h.name]));
    const recMap = new Map(records.map((r) => [`${r.employeeId}|${r.attendanceDate}`, r]));
    const t = (d) => (d ? new Date(d).toLocaleTimeString("en-IN", { timeZone: TZ_, hour: "2-digit", minute: "2-digit", hour12: false }) : "");
    const todayKey = new Date().toLocaleDateString("en-CA", { timeZone: TZ_ });
    const dates = Array.from({ length: days }, (_, i) => { const d = new Date(`${from}T12:00:00`); d.setDate(d.getDate() + i); return d.toLocaleDateString("en-CA"); });
    const where = (p) => (p && Number.isFinite(p.latitude) ? { latitude: p.latitude, longitude: p.longitude, address: p.address || "" } : null);
    return { dates, todayKey, holidayMap, rows: people.map((p) => {
        const s = { present: 0, late: 0, half: 0, wfh: 0, field: 0, leave: 0, holiday: 0, weekend: 0, absent: 0, hours: 0, lateMin: 0, workDays: 0, inMinutes: 0 };
        const joined = p.joiningDate ? new Date(p.joiningDate).toLocaleDateString("en-CA") : null;
        const cells = dates.map((key) => {
            const dow = new Date(`${key}T12:00:00`).getDay();
            const r = recMap.get(`${p._id}|${key}`);
            const lv = leaves.find((l) => String(l.employeeId) === String(p._id) && key >= new Date(l.fromDate).toLocaleDateString("en-CA", { timeZone: TZ_ }) && key <= new Date(l.toDate).toLocaleDateString("en-CA", { timeZone: TZ_ }));
            const c = { date: key, dow: DOW_[dow] };
            if (r && (r.checkIn?.time || (r.sessions || []).length)) {
                const ss = (r.sessions || []).length ? r.sessions : [{ mode: r.attendanceType, checkIn: r.checkIn, checkOut: r.checkOut }];
                const lastOut = [...ss].reverse().find((x) => x.checkOut?.time)?.checkOut;
                const open = !!ss[ss.length - 1] && !ss[ss.length - 1].checkOut?.time;
                Object.assign(c, {
                    code: r.status === "Half Day" ? "half" : r.attendanceType === "Home" ? "wfh" : ["Client", "Field"].includes(r.attendanceType) ? "field" : r.status === "Late" ? "late" : "present",
                    status: r.status === "Half Day" ? "Half day" : r.status === "Late" ? "Late" : "Present",
                    mode: MODE_NAME[r.attendanceType] || r.attendanceType || "", first: t(ss[0]?.checkIn?.time), last: open ? "" : t(lastOut?.time), inNow: open && key === todayKey,
                    sessions: ss.length, hours: Math.round((Number(r.workingHours) || 0) * 100) / 100, late: r.lateByMinutes || 0,
                    inPlace: where(ss[0]?.checkIn), outPlace: open ? null : where(lastOut), remarks: ss[0]?.checkIn?.remarks || "",
                    note: r.autoCheckedOut ? "Auto check-out" : open ? (key === todayKey ? "Still checked in" : "No check-out") : "",
                });
                s.workDays++; s.hours += Number(r.workingHours) || 0;
                if (c.code === "half") s.half++; else s.present++;
                if (c.late) { s.late++; s.lateMin += c.late; }
                if (r.attendanceType === "Home") s.wfh++;
                if (["Client", "Field"].includes(r.attendanceType)) s.field++;
                const fi = ss[0]?.checkIn?.time; if (fi) { const [h, m] = t(fi).split(":").map(Number); s.inMinutes += h * 60 + m; }
            } else if (lv) { Object.assign(c, { code: "leave", status: `Leave — ${lv.leaveType}`, leaveType: lv.leaveType }); s.leave++; }
            else if (holidayMap.has(key)) { Object.assign(c, { code: "holiday", status: `Holiday — ${holidayMap.get(key)}` }); s.holiday++; }
            else if (dow === 0 || dow === 6) { Object.assign(c, { code: "weekend", status: "Weekend" }); s.weekend++; }
            else if (joined && key < joined) Object.assign(c, { code: "na", status: "Not joined yet" });
            else if (key > todayKey) Object.assign(c, { code: "upcoming", status: "Upcoming" });
            else { Object.assign(c, { code: "absent", status: "Absent", note: "No check-in" }); s.absent++; }
            return c;
        });
        const working = dates.filter((k) => { const d = new Date(`${k}T12:00:00`).getDay(); return d !== 0 && d !== 6 && !holidayMap.has(k) && k <= todayKey && (!joined || k >= joined); }).length;
        const avgIn = s.workDays ? Math.round(s.inMinutes / s.workDays) : null;
        return { employee: p, cells, summary: { ...s, working: Math.max(working, s.workDays + s.absent + s.leave), hours: Math.round(s.hours * 100) / 100, avgHours: s.workDays ? Math.round((s.hours / s.workDays) * 100) / 100 : 0, avgIn: avgIn === null ? "" : `${pad2(Math.floor(avgIn / 60))}:${pad2(avgIn % 60)}`, rate: (s.workDays + s.absent) ? Math.min(100, Math.round(((s.present + s.half * 0.5) / (s.workDays + s.absent)) * 1000) / 10) : 0 } };
    }) };
};

// GET /attendance/team-range?from&to&department&branch — Team Attendance over a range
export const teamAttendanceRange = async (req, res) => {
    try {
        const { from, to, days } = rangeFromQuery(req.query);
        const extra = { status: "Active" };
        if (req.query.department) extra.department = req.query.department;
        if (req.query.branch) extra.branch = req.query.branch;
        const people = await peopleInView(req, extra);
        const m = await attendanceMatrix(people, from, to, days);
        return res.status(200).json({ success: true, from, to, days, today: m.todayKey, dates: m.dates, data: m.rows });
    } catch (err) {
        return res.status(err.status || 500).json({ success: false, message: err.message });
    }
};

// ==============================
// Export attendance — every employee you can see, for a month or any date range.
// GET /reports/attendance/export?from=YYYY-MM-DD&to=YYYY-MM-DD | ?month=YYYY-MM [&department=][&format=xlsx|csv]
// Sheet 1 "Summary": one row per person. Sheet 2 "Daily detail": one row per person per day.
// ==============================
export const exportAttendance = async (req, res) => {
    try {
        const q = { ...req.query };
        if (!q.month && !q.from && !q.to) { const n = new Date(); q.month = `${n.getFullYear()}-${pad2(n.getMonth() + 1)}`; }
        const { from, to, days } = rangeFromQuery(q);
        const people = await peopleInView(req, req.query.department ? { department: req.query.department } : {});
        const m = await attendanceMatrix(people, from, to, days);
        const mgr = (p) => (p.manager ? `${p.manager.firstName} ${p.manager.lastName}` : "");
        const detail = [], summary = [];
        for (const r of m.rows) {
            const p = r.employee, s = r.summary;
            for (const c of r.cells) detail.push([p.employeeId, `${p.firstName} ${p.lastName}`.trim(), p.designation, p.department, mgr(p), c.date, c.dow, c.status, c.mode || "", c.first || "", c.last || "", c.sessions ?? "", c.hours ?? "", c.late ?? "", c.inPlace?.address || "", c.outPlace?.address || "", c.note || ""]);
            summary.push([p.employeeId, `${p.firstName} ${p.lastName}`.trim(), p.designation, p.department, mgr(p), p.status, s.working, s.present, s.half, s.late, s.wfh, s.field, s.leave, s.absent, s.holiday, s.hours, s.avgHours, s.avgIn, s.lateMin, s.rate]);
        }
        const detailCols = [{ header: "Employee ID", width: 12 }, { header: "Name", width: 24 }, { header: "Designation", width: 20 }, { header: "Department", width: 20 }, { header: "Reports to", width: 22 }, { header: "Date", width: 12 }, { header: "Day", width: 6 }, { header: "Status", width: 24 }, { header: "Mode", width: 16 }, { header: "First in", width: 9 }, { header: "Last out", width: 9 }, { header: "Sessions", width: 9, type: "number" }, { header: "Hours worked", width: 12, type: "number" }, { header: "Late by (min)", width: 12, type: "number" }, { header: "Check-in place", width: 40 }, { header: "Check-out place", width: 40 }, { header: "Note", width: 18 }];
        const summaryCols = [{ header: "Employee ID", width: 12 }, { header: "Name", width: 24 }, { header: "Designation", width: 20 }, { header: "Department", width: 20 }, { header: "Reports to", width: 22 }, { header: "Employment", width: 12 }, { header: "Working days", width: 13, type: "number" }, { header: "Present", width: 9, type: "number" }, { header: "Half days", width: 10, type: "number" }, { header: "Late", width: 8, type: "number" }, { header: "WFH", width: 8, type: "number" }, { header: "Field / client", width: 13, type: "number" }, { header: "Leave", width: 8, type: "number" }, { header: "Absent", width: 9, type: "number" }, { header: "Holidays", width: 10, type: "number" }, { header: "Total hours", width: 12, type: "number" }, { header: "Avg hours / day", width: 15, type: "number" }, { header: "Avg first in", width: 12 }, { header: "Total late (min)", width: 15, type: "number" }, { header: "Attendance %", width: 13, type: "number" }];
        const { buildXlsx, buildCsv } = await import("../utils/xlsx.js");
        const name = `attendance_${from}_to_${to}${req.query.department ? `_${req.query.department.replace(/[^\w]+/g, "-")}` : ""}`;
        logAudit(req, "report.export", `Exported attendance ${from} to ${to} (${people.length} people)`, { type: "Report" });
        if (req.query.format === "csv") {
            res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"` });
            return res.send(buildCsv({ columns: detailCols, rows: detail }));
        }
        const buf = buildXlsx([{ name: "Summary", columns: summaryCols, rows: summary }, { name: "Daily detail", columns: detailCols, rows: detail }]);
        res.set({ "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${name}.xlsx"`, "Content-Length": buf.length });
        return res.send(buf);
    } catch (err) {
        return res.status(err.status || 500).json({ success: false, message: err.message });
    }
};
