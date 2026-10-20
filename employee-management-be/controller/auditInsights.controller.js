import AuditEngagementModel from "../models/auditEngagementModel.js";
import AuditTimeLogModel from "../models/auditTimeLogModel.js";
import { PERSON, MANAGERS, CLOSED, minutesOf } from "../utils/auditShared.js";
import employeeModel from "../models/employeeModel.js";
import attendanceModel from "../models/attendanceModel.js";
import leaveModel from "../models/leaveModel.js";
import regularizationModel from "../models/regularizationModel.js";
import expenseModel from "../models/expenseModel.js";

const SENIOR = ["Admin", "HR", "Manager", "Team Lead"];

// Things waiting on a senior: approvals, audits slipping, people not checked in yet.
// Admin/HR look at everyone; Managers / Team Leads at their direct reports.
const attentionFor = async (req, audits, totalByAudit, today) => {
    const team = MANAGERS.includes(req.user.role)
        ? await employeeModel.find({ status: "Active" }).select("_id firstName lastName employeeId").lean()
        : await employeeModel.find({ status: "Active", manager: req.user.id }).select("_id firstName lastName employeeId").lean();
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

        const scope = MANAGERS.includes(req.user.role)
            ? { isDeleted: false }
            : { isDeleted: false, $or: [{ teamMembers: req.user.id }, { auditManager: req.user.id }] };

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
        const allLogs = await AuditTimeLogModel.find({ auditId: { $in: ids } }).select("auditId startTime endTime durationMinutes").lean();
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

        const attention = SENIOR.includes(req.user.role) ? await attentionFor(req, audits, totalByAudit, today) : null;

        return res.status(200).json({
            success: true,
            data: { scope: MANAGERS.includes(req.user.role) ? "firm" : "mine", daily, byClient, byPerson, statusCounts, deadlines, activeNow, me, attention, weekStart: ymd(weekStart) },
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};
