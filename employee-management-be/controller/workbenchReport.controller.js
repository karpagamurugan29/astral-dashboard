import attendanceModel from "../models/attendanceModel.js";
import employeeModel from "../models/employeeModel.js";
import AuditEngagementModel from "../models/auditEngagementModel.js";
import AuditTimeLogModel from "../models/auditTimeLogModel.js";
import { sessionsOf } from "../utils/attendanceSessions.js";
import { localDayStart } from "../utils/autoCheckout.js";
import { minutesOf } from "../utils/auditShared.js";
import { scopeOf, visibleIds, workFilter } from "../utils/hierarchy.js";

// Business reports for the Reports workbench: check-in log, audit hours, audit projects.
// Admin/HR see everyone; Managers / Team Leads their direct reports (and the audits they run).

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const PERSON = "employeeId firstName lastName department designation";
const MAX_DAYS = 93;

// from/to (YYYY-MM-DD, company time) → [start, end) instants; default = this month so far.
export const range = (q) => {
    const today = localDayStart();
    const first = new Date(today); first.setDate(1);
    const parse = (s) => localDayStart(new Date(`${s}T12:00:00+05:30`));
    const start = YMD.test(q.from || "") ? parse(q.from) : localDayStart(new Date(today.getFullYear(), today.getMonth(), 1, 12));
    const endDay = YMD.test(q.to || "") ? parse(q.to) : today;
    const end = new Date(endDay.getTime() + 864e5);
    if (end <= start) throw Object.assign(new Error("'To' must be on or after 'From'"), { status: 400 });
    if ((end - start) / 864e5 > MAX_DAYS) throw Object.assign(new Error(`Pick a range of ${MAX_DAYS} days or less`), { status: 400 });
    return { start, end };
};

export const teamScope = async (req) => {
    const filter = { status: { $in: ["Active", "Resigned", "Terminated"] } };
    // the caller plus their whole team (any depth); null = everyone (HR / firm-wide seniors)
    return visibleIds(await scopeOf(req), "people");
};

const place = (p) => (p && Number.isFinite(p.latitude) ? { latitude: p.latitude, longitude: p.longitude, accuracy: p.accuracy ?? null, address: p.address || "" } : null);
const fail = (res, err) => res.status(err.status || 500).json({ success: false, message: err.message });

/* ---------------- Check-in log: one row per check-in → check-out session ---------------- */
export const checkinLogReport = async (req, res) => {
    try {
        const { start, end } = range(req.query);
        const scope = await teamScope(req);
        const empFilter = {};
        if (scope) empFilter._id = { $in: scope };
        if (req.query.department) empFilter.department = req.query.department;
        if (req.query.employeeId) empFilter._id = scope && !scope.includes(String(req.query.employeeId)) ? { $in: [] } : req.query.employeeId;
        const people = await employeeModel.find(empFilter).select(PERSON).lean();
        const ids = people.map((p) => p._id);

        const recs = await attendanceModel
            .find({ employeeId: { $in: ids }, "checkIn.time": { $gte: new Date(start.getTime() - 864e5), $lt: end } })
            .populate("employeeId", PERSON).lean();

        const rows = [];
        recs.forEach((r) => {
            sessionsOf(r).forEach((s, i, all) => {
                if (!s.checkIn?.time) return;
                const tIn = new Date(s.checkIn.time);
                if (tIn < start || tIn >= end) return;
                const tOut = s.checkOut?.time ? new Date(s.checkOut.time) : null;
                const auto = !!r.autoCheckedOut && i === all.length - 1 && !!tOut;
                rows.push({
                    _id: `${r._id}-${i}`,
                    employee: r.employeeId,
                    date: tIn,
                    session: all.length > 1 ? i + 1 : null,
                    mode: s.mode || r.attendanceType,
                    checkIn: tIn,
                    checkInPlace: place(s.checkIn),
                    checkOut: tOut,
                    checkOutPlace: auto ? null : place(s.checkOut),
                    hours: tOut ? +((tOut - tIn) / 36e5).toFixed(2) : null,
                    status: i === 0 ? r.status : "",
                    lateByMinutes: i === 0 ? r.lateByMinutes || 0 : 0,
                    remarks: s.checkIn?.remarks || "",
                    auto,
                    open: !tOut,
                });
            });
        });
        rows.sort((a, b) => b.checkIn - a.checkIn);

        const people_ = new Set(rows.map((r) => String(r.employee?._id)));
        const summary = {
            sessions: rows.length,
            people: people_.size,
            hours: +rows.reduce((t, r) => t + (r.hours || 0), 0).toFixed(1),
            late: rows.filter((r) => r.lateByMinutes > 0).length,
            withoutLocation: rows.filter((r) => !r.checkInPlace).length,
            open: rows.filter((r) => r.open).length,
            auto: rows.filter((r) => r.auto).length,
            byMode: rows.reduce((m, r) => ((m[r.mode || "—"] = (m[r.mode || "—"] || 0) + 1), m), {}),
        };
        return res.status(200).json({ success: true, data: { from: start, to: new Date(end - 1), summary, rows } });
    } catch (err) { return fail(res, err); }
};

/* ---------------- Audit hours: totals by client / project / person, plus every session ---------------- */
export const auditHoursReport = async (req, res) => {
    try {
        const { start, end } = range(req.query);
        const now = Date.now();
        const auditFilter = { isDeleted: false };
        Object.assign(auditFilter, await workFilter(req, "auditManager", "teamMembers"));
        if (req.query.clientId) auditFilter.clientId = req.query.clientId;
        const audits = await AuditEngagementModel.find(auditFilter).select("auditCode clientName clientId engagementName auditType financialYear status estimatedHours").lean();
        const byId = new Map(audits.map((a) => [String(a._id), a]));

        const logFilter = { auditId: { $in: audits.map((a) => a._id) }, startTime: { $lt: end }, $or: [{ endTime: null }, { endTime: { $gte: start } }] };
        if (req.query.employeeId) logFilter.employeeId = req.query.employeeId;
        const people = visibleIds(await scopeOf(req), "work");
        if (people) logFilter.employeeId = req.query.employeeId && people.includes(String(req.query.employeeId)) ? req.query.employeeId : { $in: people };
        const logs = await AuditTimeLogModel.find(logFilter).populate("employeeId", PERSON).lean();

        const clip = (l) => {
            const s = Math.max(new Date(l.startTime).getTime(), start.getTime());
            const e = Math.min(l.endTime ? new Date(l.endTime).getTime() : now, end.getTime());
            return Math.max(0, Math.round((e - s) / 6e4));
        };
        const sessions = logs.map((l) => {
            const a = byId.get(String(l.auditId)) || {};
            return {
                _id: l._id, employee: l.employeeId, auditId: l.auditId, auditCode: a.auditCode, clientName: a.clientName, engagementName: a.engagementName,
                auditType: a.auditType, financialYear: a.financialYear, start: l.startTime, end: l.endTime, minutes: clip(l), note: l.note || "",
                startPlace: place(l.startLocation), stopPlace: place(l.stopLocation), running: !l.endTime,
            };
        }).filter((s) => s.minutes > 0 || s.running).sort((x, y) => new Date(y.start) - new Date(x.start));

        const group = (keyFn, labelFn) => {
            const m = new Map();
            sessions.forEach((s) => {
                const k = keyFn(s); if (!k) return;
                const row = m.get(k) || { key: k, ...labelFn(s), minutes: 0, sessions: 0, days: new Set(), people: new Set() };
                row.minutes += s.minutes; row.sessions += 1;
                row.days.add(new Date(s.start).toDateString()); row.people.add(String(s.employee?._id));
                m.set(k, row);
            });
            return [...m.values()].map((r) => ({ ...r, days: r.days.size, people: r.people.size })).sort((a, b) => b.minutes - a.minutes);
        };
        const byClient = group((s) => s.clientName, (s) => ({ clientName: s.clientName }));
        const byProject = group((s) => String(s.auditId), (s) => {
            const a = byId.get(String(s.auditId)) || {};
            return { auditId: s.auditId, auditCode: s.auditCode, clientName: s.clientName, engagementName: s.engagementName, auditType: s.auditType, financialYear: s.financialYear, status: a.status, estimatedHours: a.estimatedHours || 0 };
        });
        const byPerson = group((s) => String(s.employee?._id), (s) => ({ employee: s.employee }));

        const totalMinutes = sessions.reduce((t, s) => t + s.minutes, 0);
        return res.status(200).json({
            success: true,
            data: {
                from: start, to: new Date(end - 1),
                summary: { totalMinutes, sessions: sessions.length, people: byPerson.length, clients: byClient.length, projects: byProject.length, running: sessions.filter((s) => s.running).length },
                byClient, byProject, byPerson, sessions,
            },
        });
    } catch (err) { return fail(res, err); }
};

/* ---------------- Audit projects: status, deadline and hours against estimate ---------------- */
export const auditProjectsReport = async (req, res) => {
    try {
        const now = Date.now();
        const today = localDayStart().getTime();
        const filter = { isDeleted: false };
        if (!["Admin", "HR"].includes(req.user.role)) Object.assign(filter, await workFilter(req, "auditManager", "teamMembers"));
        if (req.query.status) filter.status = req.query.status;
        if (req.query.clientId) filter.clientId = req.query.clientId;
        const audits = await AuditEngagementModel.find(filter).populate("auditManager", PERSON).lean();
        const logs = await AuditTimeLogModel.find({ auditId: { $in: audits.map((a) => a._id) } }).select("auditId employeeId startTime endTime durationMinutes").lean();
        const byAudit = new Map();
        logs.forEach((l) => { const k = String(l.auditId); const row = byAudit.get(k) || { minutes: 0, people: new Set(), last: null }; row.minutes += minutesOf(l, now); row.people.add(String(l.employeeId)); const t = l.endTime || l.startTime; if (!row.last || t > row.last) row.last = t; byAudit.set(k, row); });

        const rows = audits.map((a) => {
            const t = byAudit.get(String(a._id)) || { minutes: 0, people: new Set(), last: null };
            const est = (a.estimatedHours || 0) * 60;
            return {
                _id: a._id, auditCode: a.auditCode, clientName: a.clientName, engagementName: a.engagementName, auditType: a.auditType, financialYear: a.financialYear,
                status: a.status, priority: a.priority, manager: a.auditManager, teamSize: (a.teamMembers || []).length + 1, peopleLogged: t.people.size,
                startDate: a.startDate, endDate: a.endDate, daysLeft: a.endDate ? Math.round((new Date(a.endDate).setHours(0, 0, 0, 0) - today) / 864e5) : null,
                estimatedHours: a.estimatedHours || 0, loggedMinutes: Math.round(t.minutes), usedPct: est ? Math.round((t.minutes / est) * 100) : null,
                lastActivity: t.last, fee: a.fee || 0,
            };
        }).sort((x, y) => (x.daysLeft ?? 9999) - (y.daysLeft ?? 9999));

        const open = rows.filter((r) => !["Completed", "Cancelled"].includes(r.status));
        return res.status(200).json({
            success: true,
            data: {
                summary: {
                    projects: rows.length, open: open.length,
                    overdue: open.filter((r) => r.daysLeft !== null && r.daysLeft < 0).length,
                    overBudget: open.filter((r) => r.usedPct !== null && r.usedPct > 100).length,
                    loggedMinutes: rows.reduce((t, r) => t + r.loggedMinutes, 0),
                    estimatedHours: rows.reduce((t, r) => t + r.estimatedHours, 0),
                    byStatus: rows.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {}),
                },
                rows,
            },
        });
    } catch (err) { return fail(res, err); }
};
