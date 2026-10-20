import attendanceModel from "../models/attendanceModel.js";
import AuditTimeLogModel from "../models/auditTimeLogModel.js";
import employeeModel from "../models/employeeModel.js";
import { sessionsOf } from "../utils/attendanceSessions.js";

const PERSON = "employeeId firstName lastName designation department profileImage";
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 62;

const point = (loc) =>
    loc && Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude)
        ? { latitude: loc.latitude, longitude: loc.longitude, accuracy: loc.accuracy ?? null, address: loc.address || "" }
        : null;

// Every located action (check-in/out, audit timer start/stop) in a date range, newest first.
// Admin/HR see everyone; Managers/Team Leads see their direct reports and themselves.
export const getLocationLog = async (req, res) => {
    try {
        const today = new Date().toISOString().split("T")[0];
        const from = YMD.test(req.query.from || "") ? req.query.from : today;
        const to = YMD.test(req.query.to || "") ? req.query.to : from;
        if (to < from) {
            return res.status(400).json({ success: false, message: "'To' date must be on or after 'From' date" });
        }

        const start = new Date(`${from}T00:00:00`);
        const end = new Date(`${to}T23:59:59.999`);
        if ((end - start) / 864e5 > MAX_DAYS) {
            return res.status(400).json({ success: false, message: `Pick a range of ${MAX_DAYS} days or less` });
        }

        // Who the caller may see.
        let scope = null;
        if (["Manager", "Team Lead"].includes(req.user.role)) {
            const reports = await employeeModel.find({ manager: req.user.id }).select("_id").lean();
            scope = [req.user.id, ...reports.map((r) => String(r._id))];
        }
        let employeeFilter = scope;
        if (req.query.employeeId) {
            if (scope && !scope.includes(String(req.query.employeeId))) {
                return res.status(403).json({ success: false, message: "You can only view your own team's locations" });
            }
            employeeFilter = [req.query.employeeId];
        }
        const byEmployee = employeeFilter ? { employeeId: { $in: employeeFilter } } : {};

        // attendanceDate is a UTC YYYY-MM-DD; widen by a day each side and trim by actual time below.
        const pad = (d, n) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 864e5).toISOString().split("T")[0];

        const [attendance, timeLogs] = await Promise.all([
            attendanceModel
                .find({ ...byEmployee, attendanceDate: { $gte: pad(from, -1), $lte: pad(to, 1) } })
                .populate("employeeId", PERSON)
                .lean(),
            AuditTimeLogModel
                .find({ ...byEmployee, $or: [{ startTime: { $gte: start, $lte: end } }, { endTime: { $gte: start, $lte: end } }] })
                .populate("employeeId", PERSON)
                .populate("auditId", "auditCode clientName engagementName auditType")
                .lean(),
        ]);

        const events = [];
        const inRange = (t) => t && new Date(t) >= start && new Date(t) <= end;

        attendance.forEach((a) => {
            const sessions = sessionsOf(a);
            sessions.forEach((x, i) => {
                const n = sessions.length > 1 ? i + 1 : null;
                if (inRange(x.checkIn?.time)) {
                    events.push({ _id: `${a._id}-in-${i}`, type: "check-in", time: x.checkIn.time, employee: a.employeeId, location: point(x.checkIn), device: x.checkIn.device || "", mode: x.mode || a.attendanceType, status: i === 0 ? a.status : undefined, session: n });
                }
                if (inRange(x.checkOut?.time)) {
                    events.push({ _id: `${a._id}-out-${i}`, type: "check-out", time: x.checkOut.time, employee: a.employeeId, location: point(x.checkOut), device: x.checkOut.device || "", mode: x.mode || a.attendanceType, hours: Number((Math.max(0, new Date(x.checkOut.time) - new Date(x.checkIn.time)) / 36e5).toFixed(2)), session: n });
                }
            });
        });

        timeLogs.forEach((l) => {
            const audit = l.auditId ? { _id: l.auditId._id, auditCode: l.auditId.auditCode, clientName: l.auditId.clientName, engagementName: l.auditId.engagementName || `${l.auditId.auditType} audit` } : null;
            if (inRange(l.startTime)) {
                events.push({ _id: `${l._id}-start`, type: "audit-start", time: l.startTime, employee: l.employeeId, location: point(l.startLocation), audit, running: !l.endTime });
            }
            if (inRange(l.endTime)) {
                events.push({ _id: `${l._id}-stop`, type: "audit-stop", time: l.endTime, employee: l.employeeId, location: point(l.stopLocation), audit, minutes: l.durationMinutes, note: l.note || "" });
            }
        });

        events.sort((a, b) => new Date(b.time) - new Date(a.time));

        return res.status(200).json({ success: true, data: { from, to, events } });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};
