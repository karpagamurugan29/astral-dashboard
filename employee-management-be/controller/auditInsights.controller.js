import AuditEngagementModel from "../models/auditEngagementModel.js";
import AuditTimeLogModel from "../models/auditTimeLogModel.js";
import { PERSON, MANAGERS, CLOSED, minutesOf } from "../utils/auditShared.js";
import employeeModel from "../models/employeeModel.js";
import { notify } from "../utils/notify.js";
import { localDayStart } from "../utils/autoCheckout.js";
import attendanceModel from "../models/attendanceModel.js";
import leaveModel from "../models/leaveModel.js";
import regularizationModel from "../models/regularizationModel.js";
import expenseModel from "../models/expenseModel.js";
import { scopeOf, workFilter } from "../utils/hierarchy.js";
import { visibleAuditFilter } from "../utils/auditAccess.js";
// People a senior keeps an eye on: everyone (HR / firm-wide seniors) or their whole team below them.
const teamQuery = async (req) => { const s = await scopeOf(req); return s.people ? { status: "Active", _id: { $ne: req.user.id } } : { status: "Active", _id: { $in: [...s.team] } }; };


// Things waiting on a senior: approvals, audits slipping, people not checked in yet.
// Admin/HR look at everyone; Managers / Team Leads at their direct reports.
const attentionFor = async (req, audits, totalByAudit, today) => {
    const team = await employeeModel.find(await teamQuery(req)).select("_id firstName lastName employeeId").lean();
    const ids = team.map((e) => e._id);
    const dateUtc = new Date().toISOString().split("T")[0];
    const [leaves, corrections, expenses, checkedIn, onLeave] = await Promise.all([
        leaveModel.countDocuments({ status: "Pending", employeeId: { $in: ids } }),
        regularizationModel.countDocuments({ status: "Pending", employeeId: { $in: ids } }),
        expenseModel.countDocuments({ status: "Pending", employeeId: { $in: ids } }),
        attendanceModel.find({ attendanceDate: dateUtc, employeeId: { $in: ids } }).distinct("employeeId"),
        leaveModel.find({ status: "Approved", employeeId: { $in: ids }, fromDate: { $lte: new Date() }, toDate: { $gte: new Date(today) } }).distinct("employeeId"),
    ]);
    const present = new Set([...checkedIn, ...onLeave].map(String));
    const missing = team.filter((e) => !present.has(String(e._id)));
    const open = audits.filter((a) => !CLOSED.includes(a.status));
    return {
        teamSize: team.length,
        pendingLeaves: leaves,
        pendingCorrections: corrections,
        pendingExpenses: expenses,
        overdueAudits: open.filter((a) => a.endDate && new Date(a.endDate).getTime() < today).length,
        overBudgetAudits: open.filter((a) => a.estimatedHours && (totalByAudit.get(String(a._id)) || 0) > a.estimatedHours * 60).length,
        notCheckedIn: { count: missing.length, people: missing.slice(0, 8).map((e) => ({ _id: e._id, firstName: e.firstName, lastName: e.lastName })) },
    };
};

const DAY = 864e5;
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const ymd = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };

// Minutes of a session that fall inside [from, to) — a session crossing midnight or the range edge is split.
const overlap = (log, from, to, now) => {
    const s = Math.max(new Date(log.startTime).getTime(), from);
    const e = Math.min(log.endTime ? new Date(log.endTime).getTime() : now, to);
    return e > s ? (e - s) / 60000 : 0;
};

// Everything the dashboard's audit widgets show, in one call. Admin/HR see the whole firm;
// everyone else sees the audit projects they manage or work on.
export const getAuditInsights = async (req, res) => {
    try {
        const now = Date.now();
        const today = startOfDay(now).getTime();
        const from14 = today - 13 * DAY;
        const from30 = today - 29 * DAY;
        const weekStart = (() => { const d = new Date(today); const dow = (d.getDay() + 6) % 7; return today - dow * DAY; })(); // Monday

        const viewer = await scopeOf(req);
        // same engagement visibility as the audit screens (HR sees audit data only for work they are on)
        const scope = { isDeleted: false, ...(await visibleAuditFilter(req)) };

        const audits = await AuditEngagementModel.find(scope)
            .select("auditCode clientName clientId engagementName auditType financialYear status endDate estimatedHours auditManager teamMembers")
            .lean();
        const ids = audits.map((a) => a._id);
        const byId = new Map(audits.map((a) => [String(a._id), a]));

        const logs = await AuditTimeLogModel.find({
            auditId: { $in: ids },
            $or: [{ endTime: null }, { endTime: { $gte: new Date(from30) } }],
        }).populate("employeeId", PERSON).lean();

        // 1. Daily team hours, last 14 days (each day present, zero when nobody logged time).
        const daily = Array.from({ length: 14 }, (_, i) => {
            const d0 = from14 + i * DAY;
            const minutes = logs.reduce((s, l) => s + overlap(l, d0, d0 + DAY, now), 0);
            return { date: ymd(d0), minutes: Math.round(minutes) };
        });

        // 2. Hours by client, last 30 days — top 6, the rest folded into "Other clients".
        const clientMin = new Map();
        logs.forEach((l) => {
            const a = byId.get(String(l.auditId));
            const key = a?.clientName || "Unknown client";
            clientMin.set(key, (clientMin.get(key) || 0) + overlap(l, from30, now + 1, now));
        });
        const clientsSorted = [...clientMin.entries()].filter(([, m]) => m >= 1).sort((a, b) => b[1] - a[1]);
        const byClient = clientsSorted.slice(0, 6).map(([client, m]) => ({ client, minutes: Math.round(m) }));
        const rest = clientsSorted.slice(6).reduce((s, [, m]) => s + m, 0);
        if (rest >= 1) byClient.push({ client: "Other clients", minutes: Math.round(rest) });

        // 3. Hours per person this week (Mon → now).
        const personMin = new Map();
        logs.forEach((l) => {
            const m = overlap(l, weekStart, now + 1, now);
            if (m <= 0 || !l.employeeId) return;
            const k = String(l.employeeId._id);
            const row = personMin.get(k) || { employee: l.employeeId, minutes: 0 };
            row.minutes += m;
            personMin.set(k, row);
        });
        const byPerson = [...personMin.values()].filter((r) => r.minutes >= 1).sort((a, b) => b.minutes - a.minutes).slice(0, 10)
            .map((r) => ({ employee: r.employee, minutes: Math.round(r.minutes) }));

        // 4. Open audit projects by status.
        const statusCounts = {};
        audits.filter((a) => !CLOSED.includes(a.status)).forEach((a) => { statusCounts[a.status] = (statusCounts[a.status] || 0) + 1; });

        // 5. Deadlines: open projects overdue or due in the next 21 days, with hours used vs estimate.
        const totalByAudit = new Map();
        const allLogs = await AuditTimeLogModel.find({ auditId: { $in: ids } }).select("auditId employeeId startTime endTime durationMinutes").lean();
        allLogs.forEach((l) => totalByAudit.set(String(l.auditId), (totalByAudit.get(String(l.auditId)) || 0) + minutesOf(l, now)));
        const deadlines = audits
            .filter((a) => !CLOSED.includes(a.status) && a.endDate && new Date(a.endDate).getTime() <= today + 21 * DAY)
            .sort((a, b) => new Date(a.endDate) - new Date(b.endDate))
            .slice(0, 6)
            .map((a) => ({
                _id: a._id, auditCode: a.auditCode, clientName: a.clientName, engagementName: a.engagementName, auditType: a.auditType,
                financialYear: a.financialYear, status: a.status, endDate: a.endDate, estimatedHours: a.estimatedHours || 0,
                minutes: Math.round(totalByAudit.get(String(a._id)) || 0),
                daysLeft: Math.round((startOfDay(a.endDate).getTime() - today) / DAY),
            }));

        // 6. Who is working right now.
        const activeNow = logs.filter((l) => !l.endTime && l.employeeId).map((l) => {
            const a = byId.get(String(l.auditId));
            return { employee: l.employeeId, auditId: l.auditId, clientName: a?.clientName, engagementName: a?.engagementName, auditType: a?.auditType, startTime: l.startTime, address: l.startLocation?.address || "" };
        }).sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

        // 7. The signed-in person's own numbers.
        const mine = logs.filter((l) => String(l.employeeId?._id) === String(req.user.id));
        const me = {
            todayMinutes: Math.round(mine.reduce((s, l) => s + overlap(l, today, today + DAY, now), 0)),
            weekMinutes: Math.round(mine.reduce((s, l) => s + overlap(l, weekStart, now + 1, now), 0)),
            openAudits: audits.filter((a) => !CLOSED.includes(a.status) && [a.auditManager, ...(a.teamMembers || [])].some((p) => String(p) === String(req.user.id))).length,
        };

        const attention = viewer.people || viewer.leads ? await attentionFor(req, audits, totalByAudit, today) : null;

        // 9. "My audits": every open project the caller manages or works on, with their own hours.
        const myId = String(req.user.id);
        const myAudits = audits
            .filter((a) => !CLOSED.includes(a.status) && [a.auditManager, ...(a.teamMembers || [])].some((p) => String(p) === myId))
            .map((a) => {
                const mine = allLogs.filter((l) => String(l.auditId) === String(a._id) && String(l.employeeId) === myId);
                const sum = (from) => Math.round(mine.reduce((t, l) => t + overlap(l, from, now + 1, now), 0));
                const last = mine.reduce((acc, l) => (!acc || new Date(l.startTime) > new Date(acc.startTime) ? l : acc), null);
                return {
                    _id: a._id, auditCode: a.auditCode, clientName: a.clientName, engagementName: a.engagementName, auditType: a.auditType,
                    financialYear: a.financialYear, status: a.status, endDate: a.endDate, estimatedHours: a.estimatedHours || 0,
                    daysLeft: a.endDate ? Math.round((startOfDay(a.endDate).getTime() - today) / DAY) : null,
                    role: String(a.auditManager) === myId ? "Manager" : "Team member",
                    teamSize: new Set([String(a.auditManager), ...(a.teamMembers || []).map(String)]).size,
                    teamMinutes: Math.round(totalByAudit.get(String(a._id)) || 0),
                    myMinutes: Math.round(mine.reduce((t, l) => t + minutesOf(l, now), 0)),
                    myWeekMinutes: sum(weekStart),
                    myTodayMinutes: sum(today),
                    lastSession: last ? { start: last.startTime, end: last.endTime } : null,
                    runningByMe: mine.some((l) => !l.endTime),
                };
            })
            .sort((x, y) => (x.daysLeft ?? 9999) - (y.daysLeft ?? 9999));

        // 8. Today's audit sessions with start and end (end null = still running), for the timeline.
        //    Employees see their own; Managers / Team Leads everyone on their audits; Admin/HR everyone.
        const dayStart = localDayStart().getTime();
        const todaySessions = logs
            .filter((l) => l.employeeId && new Date(l.startTime).getTime() < now && (!l.endTime || new Date(l.endTime).getTime() >= dayStart))
            .filter((l) => viewer.firm || viewer.leads || String(l.employeeId._id) === String(req.user.id))
            .map((l) => {
                const a = byId.get(String(l.auditId));
                const start = Math.max(new Date(l.startTime).getTime(), dayStart);
                const end = l.endTime ? new Date(l.endTime).getTime() : null;
                return {
                    employee: l.employeeId,
                    auditId: l.auditId,
                    clientName: a?.clientName || "Audit",
                    engagementName: a?.engagementName || "",
                    auditType: a?.auditType,
                    financialYear: a?.financialYear,
                    start: new Date(start),
                    end: end ? new Date(end) : null,
                    minutes: Math.round(((end || now) - start) / 60000),
                    note: l.note || "",
                };
            })
            .sort((x, y) => x.start - y.start);

        return res.status(200).json({
            success: true,
            data: { scope: viewer.firm ? "firm" : viewer.leads ? "team" : "mine", daily, byClient, byPerson, statusCounts, deadlines, activeNow, me, attention, todaySessions, myAudits, dayStart: new Date(dayStart), weekStart: ymd(weekStart) },
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// "Who's in today" for the dashboard: everyone in scope who checked in today (company time),
// latest activity first — when, how (office / home / client), where, and whether they're in now.
// Admin/HR see everyone; Managers / Team Leads their direct reports.
export const getTodayCheckins = async (req, res) => {
    try {
        const { localDayStart } = await import("../utils/autoCheckout.js");
        const { sessionsOf, openSession } = await import("../utils/attendanceSessions.js");
        const since = localDayStart();

        const team = await employeeModel.find(await teamQuery(req)).select("employeeId firstName lastName designation department profileImage phoneNumber").lean();
        const ids = team.map((e) => e._id);

        const records = await attendanceModel
            .find({ employeeId: { $in: ids }, "checkIn.time": { $gte: new Date(since.getTime() - 864e5) } })
            .populate("employeeId", "employeeId firstName lastName designation department profileImage")
            .lean();

        const place = (p) => (p && Number.isFinite(p.latitude) ? { latitude: p.latitude, longitude: p.longitude, accuracy: p.accuracy ?? null, address: p.address || "" } : null);
        const rows = [];
        records.forEach((r) => {
            const sessions = sessionsOf(r).filter((s) => s.checkIn?.time && new Date(s.checkIn.time) >= since);
            if (!sessions.length || !r.employeeId) return;
            const first = sessions[0], last = sessions[sessions.length - 1];
            const open = openSession(r);
            const lastActivity = open ? open.checkIn.time : (last.checkOut?.time || last.checkIn.time);
            rows.push({
                employee: r.employeeId,
                inNow: !!open,
                mode: (open || last).mode || r.attendanceType,
                firstIn: first.checkIn.time,
                lastIn: last.checkIn.time,
                lastOut: open ? null : last.checkOut?.time || null,
                place: place((open || last).checkIn),
                outPlace: open ? null : place(last.checkOut),
                remarks: (open || last).checkIn?.remarks || "",
                sessions: sessions.length,
                status: r.status,
                lateByMinutes: r.lateByMinutes || 0,
                autoCheckedOut: !!r.autoCheckedOut && !open,
                lastActivity,
            });
        });
        rows.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));

        // Everyone in scope with no check-in today; approved leave is shown as such, not as missing.
        const seen = new Set(rows.map((r) => String(r.employee._id)));
        const leaves = await leaveModel
            .find({ employeeId: { $in: ids }, status: "Approved", fromDate: { $lte: new Date(since.getTime() + 864e5 - 1) }, toDate: { $gte: since } })
            .select("employeeId leaveType")
            .lean();
        const onLeave = new Map(leaves.map((l) => [String(l.employeeId), l.leaveType]));
        const notIn = team
            .filter((e) => !seen.has(String(e._id)))
            .map((e) => ({ employee: e, onLeave: onLeave.has(String(e._id)), leaveType: onLeave.get(String(e._id)) || "" }))
            .sort((a, b) => a.onLeave - b.onLeave || `${a.employee.firstName} ${a.employee.lastName}`.localeCompare(`${b.employee.firstName} ${b.employee.lastName}`));

        return res.status(200).json({
            success: true,
            data: { rows, notIn, inNow: rows.filter((r) => r.inNow).length, checkedOut: rows.filter((r) => !r.inNow).length, missing: notIn.filter((n) => !n.onLeave).length, onLeave: notIn.filter((n) => n.onLeave).length, teamSize: ids.length },
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// Nudge people who haven't checked in today (a notification each). Only people in the sender's
// scope who still have no check-in today are reminded, whatever ids are sent.
export const remindCheckin = async (req, res) => {
    try {
        const { localDayStart } = await import("../utils/autoCheckout.js");
        const { sessionsOf } = await import("../utils/attendanceSessions.js");
        const since = localDayStart();
        const asked = (Array.isArray(req.body?.employeeIds) ? req.body.employeeIds : []).map(String);
        if (!asked.length) return res.status(400).json({ success: false, message: "Pick at least one person to remind." });

        const scope = await teamQuery(req);
        const team = await employeeModel.find({ ...scope, _id: { $in: asked } }).select("_id").lean();
        const ids = team.map((e) => e._id);
        const records = await attendanceModel.find({ employeeId: { $in: ids }, "checkIn.time": { $gte: new Date(since.getTime() - 864e5) } }).lean();
        const checkedIn = new Set(records.filter((r) => sessionsOf(r).some((s) => s.checkIn?.time && new Date(s.checkIn.time) >= since)).map((r) => String(r.employeeId)));
        const sender = await employeeModel.findById(req.user.id).select("firstName lastName").lean();
        const from = sender ? `${sender.firstName} ${sender.lastName}`.trim() : "Your manager";

        const targets = ids.filter((id) => !checkedIn.has(String(id)));
        targets.forEach((id) => notify(id, "Reminder: check in for today", `${from} noticed you haven't checked in yet today. Check in from the dashboard when you start work.`, "Attendance", "/dashboard"));
        return res.status(200).json({ success: true, data: { reminded: targets.length }, message: targets.length ? `Reminder sent to ${targets.length} ${targets.length === 1 ? "person" : "people"}.` : "Everyone picked has already checked in." });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};
