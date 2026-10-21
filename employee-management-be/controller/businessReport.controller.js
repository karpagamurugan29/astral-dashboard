import attendanceModel from "../models/attendanceModel.js";
import employeeModel from "../models/employeeModel.js";
import leaveModel from "../models/leaveModel.js";
import holidayModel from "../models/holidayModel.js";
import documentModel from "../models/documentModel.js";
import expenseModel from "../models/expenseModel.js";
import AuditEngagementModel from "../models/auditEngagementModel.js";
import AuditTimeLogModel from "../models/auditTimeLogModel.js";
import { COMPANY_TZ, localDayStart } from "../utils/autoCheckout.js";
import { minutesOf } from "../utils/auditShared.js";
import { viewerOf, reportsUnder } from "../utils/documentAccess.js";
import { range, teamScope } from "./workbenchReport.controller.js";

// Business insight reports (utilisation, profitability, punctuality, document compliance) and
// the dashboard's "Business pulse". Admin / HR see everyone; Managers / Team Leads their team.
// Money (fees, cost, margin) is only returned to Admin / HR and the firm's Partners, Directors
// and Accounts Head — everyone else gets hours only.

const PERSON = "employeeId firstName lastName department designation profileImage joiningDate";
const DAY_HOURS = () => Number(process.env.STANDARD_DAY_HOURS) || 8;
// monthly salary → cost of one hour (≈ 22 working days)
const hourlyCost = (salary) => (Number(salary) || 0) / (22 * DAY_HOURS());
const MONEY_DESIGNATIONS = ["Company Partner", "Director", "Accounts Head"];
const fail = (res, err) => res.status(err.status || 500).json({ success: false, message: err.message });
const dayKey = (d) => new Date(d).toLocaleDateString("en-CA", { timeZone: COMPANY_TZ() });
const r1 = (n) => Math.round(n * 10) / 10;

const canSeeMoney = async (req) => {
    if (["Admin", "HR"].includes(req.user.role)) return true;
    const me = await employeeModel.findById(req.user.id).select("designation").lean();
    return MONEY_DESIGNATIONS.includes(me?.designation);
};

// Working days (Mon–Fri, not a holiday) in [start, end), as YYYY-MM-DD in company time.
const workdaysIn = async (start, end) => {
    const holidays = await holidayModel.find({ date: { $gte: new Date(start.getTime() - 864e5), $lt: end } }).select("date").lean().catch(() => []);
    const off = new Set(holidays.map((h) => dayKey(h.date)));
    const today = dayKey(new Date());
    const days = [];
    for (let t = start.getTime() + 12 * 36e5; t < end.getTime(); t += 864e5) {
        const k = dayKey(t);
        if (k > today) break;
        const dow = new Date(`${k}T12:00:00Z`).getUTCDay();
        if (dow !== 0 && dow !== 6 && !off.has(k)) days.push(k);
    }
    return days;
};

const peopleInScope = async (req, extra = {}) => {
    const scope = await teamScope(req);
    const filter = { status: "Active", ...extra };
    if (scope) filter._id = { $in: scope };
    return employeeModel.find(filter).select(`${PERSON} salary`).lean();
};

const leaveDaysByPerson = async (ids, days) => {
    if (!days.length) return new Map();
    const leaves = await leaveModel.find({ employeeId: { $in: ids }, status: "Approved", fromDate: { $lte: new Date(`${days[days.length - 1]}T23:59:59Z`) }, toDate: { $gte: new Date(`${days[0]}T00:00:00Z`) } }).select("employeeId fromDate toDate").lean();
    const map = new Map();
    leaves.forEach((l) => {
        const from = new Date(l.fromDate).toISOString().slice(0, 10), to = new Date(l.toDate).toISOString().slice(0, 10);
        const set = map.get(String(l.employeeId)) || new Set();
        days.forEach((k) => { if (k >= from && k <= to) set.add(k); });
        map.set(String(l.employeeId), set);
    });
    return map;
};

const clipMinutes = (l, start, end, now = Date.now()) => {
    const s = Math.max(new Date(l.startTime).getTime(), start.getTime());
    const e = Math.min(l.endTime ? new Date(l.endTime).getTime() : now, end.getTime());
    return Math.max(0, (e - s) / 6e4);
};

/* =========================== Utilisation =========================== */
// Capacity = working days (since joining, minus approved leave) × standard hours.
// Utilisation = audit hours ÷ capacity. Focus = audit hours ÷ hours actually checked in.
export const computeUtilisation = async (req, { start, end, department, people: given }) => {
    const people = given || (await peopleInScope(req, department ? { department } : {}));
    const ids = people.map((p) => p._id);
    const days = await workdaysIn(start, end);
    const [leaveMap, att, logs] = await Promise.all([
        leaveDaysByPerson(ids, days),
        attendanceModel.find({ employeeId: { $in: ids }, attendanceDate: { $gte: days[0] || "9999", $lte: days[days.length - 1] || "0000" } }).select("employeeId attendanceDate workingHours").lean(),
        AuditTimeLogModel.find({ employeeId: { $in: ids }, startTime: { $lt: end }, $or: [{ endTime: null }, { endTime: { $gte: start } }] }).select("employeeId auditId startTime endTime").lean(),
    ]);
    const attended = new Map(), audit = new Map(), audits = new Map();
    att.forEach((a) => attended.set(String(a.employeeId), (attended.get(String(a.employeeId)) || 0) + (Number(a.workingHours) || 0)));
    logs.forEach((l) => {
        const k = String(l.employeeId);
        audit.set(k, (audit.get(k) || 0) + clipMinutes(l, start, end));
        const s = audits.get(k) || new Set(); s.add(String(l.auditId)); audits.set(k, s);
    });

    const rows = people.map((p) => {
        const k = String(p._id);
        const joined = p.joiningDate ? dayKey(p.joiningDate) : null;
        const mine = days.filter((d) => !joined || d >= joined);
        const leave = [...(leaveMap.get(k) || [])].filter((d) => mine.includes(d)).length;
        const capacity = Math.max(0, mine.length - leave) * DAY_HOURS();
        const auditHours = (audit.get(k) || 0) / 60;
        const attendedHours = attended.get(k) || 0;
        return {
            employee: { _id: p._id, employeeId: p.employeeId, firstName: p.firstName, lastName: p.lastName, department: p.department, designation: p.designation, profileImage: p.profileImage },
            workingDays: mine.length, leaveDays: leave, capacityHours: r1(capacity), attendedHours: r1(attendedHours), auditHours: r1(auditHours),
            utilisation: capacity ? Math.round((auditHours / capacity) * 100) : 0,
            focus: attendedHours ? Math.min(100, Math.round((auditHours / attendedHours) * 100)) : 0,
            audits: (audits.get(k) || new Set()).size,
        };
    }).sort((a, b) => b.utilisation - a.utilisation);

    const sum = (f) => rows.reduce((t, r) => t + r[f], 0);
    const cap = sum("capacityHours"), aud = sum("auditHours");
    const byDept = new Map();
    rows.forEach((r) => { const d = r.employee.department || "—"; const x = byDept.get(d) || { department: d, people: 0, capacityHours: 0, auditHours: 0 }; x.people++; x.capacityHours += r.capacityHours; x.auditHours += r.auditHours; byDept.set(d, x); });
    return {
        from: start, to: new Date(end - 1), dayHours: DAY_HOURS(), workingDays: days.length,
        summary: {
            people: rows.length, capacityHours: r1(cap), auditHours: r1(aud), attendedHours: r1(sum("attendedHours")),
            utilisation: cap ? Math.round((aud / cap) * 100) : 0,
            bench: rows.filter((r) => r.capacityHours > 0 && r.utilisation < 30).length,
            overloaded: rows.filter((r) => r.utilisation > 100).length,
        },
        byDepartment: [...byDept.values()].map((d) => ({ ...d, capacityHours: r1(d.capacityHours), auditHours: r1(d.auditHours), utilisation: d.capacityHours ? Math.round((d.auditHours / d.capacityHours) * 100) : 0 })).sort((a, b) => b.utilisation - a.utilisation),
        rows,
    };
};

export const utilisationReport = async (req, res) => {
    try {
        const { start, end } = range(req.query);
        return res.status(200).json({ success: true, data: await computeUtilisation(req, { start, end, department: req.query.department }) });
    } catch (err) { return fail(res, err); }
};

/* =========================== Client profitability =========================== */
// Per audit project (all time): fee, budget hours vs logged, cost of the time logged
// (each person's hourly cost from salary), margin and effective hourly rate.
export const computeProfitability = async (req, { status, clientId, financialYear } = {}) => {
    const money = await canSeeMoney(req);
    const filter = { isDeleted: false };
    if (!["Admin", "HR"].includes(req.user.role) && !money) filter.$or = [{ auditManager: req.user.id }, { teamMembers: req.user.id }];
    if (status === "open") filter.status = { $nin: ["Completed", "Cancelled"] };
    else if (status) filter.status = status;
    if (clientId) filter.clientId = clientId;
    if (financialYear) filter.financialYear = financialYear;
    const audits = await AuditEngagementModel.find(filter).populate("auditManager", "firstName lastName").lean();
    const logs = await AuditTimeLogModel.find({ auditId: { $in: audits.map((a) => a._id) } }).select("auditId employeeId startTime endTime durationMinutes").lean();
    const people = await employeeModel.find({ _id: { $in: [...new Set(logs.map((l) => String(l.employeeId)))] } }).select("salary").lean();
    const rate = new Map(people.map((p) => [String(p._id), hourlyCost(p.salary)]));
    const now = Date.now();
    const per = new Map();
    logs.forEach((l) => {
        const k = String(l.auditId); const m = minutesOf(l, now);
        const x = per.get(k) || { minutes: 0, cost: 0, people: new Set() };
        x.minutes += m; x.cost += (m / 60) * (rate.get(String(l.employeeId)) || 0); x.people.add(String(l.employeeId));
        per.set(k, x);
    });

    const rows = audits.map((a) => {
        const x = per.get(String(a._id)) || { minutes: 0, cost: 0, people: new Set() };
        const hours = x.minutes / 60, fee = Number(a.fee) || 0, est = Number(a.estimatedHours) || 0;
        const row = {
            _id: a._id, auditCode: a.auditCode, clientId: a.clientId, clientName: a.clientName, engagementName: a.engagementName, auditType: a.auditType, financialYear: a.financialYear,
            status: a.status, manager: a.auditManager, estimatedHours: est, loggedHours: r1(hours), people: x.people.size,
            budgetUsed: est ? Math.round((hours / est) * 100) : null,
        };
        if (money) Object.assign(row, {
            fee, cost: Math.round(x.cost), margin: Math.round(fee - x.cost), marginPct: fee ? Math.round(((fee - x.cost) / fee) * 100) : null,
            effectiveRate: hours ? Math.round(fee / hours) : null, budgetRate: est ? Math.round(fee / est) : null,
            // at the current pace, what the job will cost once the budget hours are used
            projectedCost: est && hours ? Math.round((x.cost / hours) * Math.max(est, hours)) : null,
        });
        return row;
    });

    const byClient = new Map();
    rows.forEach((r) => {
        const x = byClient.get(r.clientName) || { clientName: r.clientName, clientId: r.clientId, projects: 0, loggedHours: 0, estimatedHours: 0, fee: 0, cost: 0 };
        x.projects++; x.loggedHours += r.loggedHours; x.estimatedHours += r.estimatedHours;
        if (money) { x.fee += r.fee; x.cost += r.cost; }
        byClient.set(r.clientName, x);
    });
    const clients = [...byClient.values()].map((c) => ({ ...c, loggedHours: r1(c.loggedHours), ...(money ? { margin: c.fee - c.cost, marginPct: c.fee ? Math.round(((c.fee - c.cost) / c.fee) * 100) : null, effectiveRate: c.loggedHours ? Math.round(c.fee / c.loggedHours) : null } : { fee: undefined, cost: undefined }) }))
        .sort((a, b) => (money ? b.fee - a.fee : b.loggedHours - a.loggedHours));

    const tot = (f) => rows.reduce((t, r) => t + (r[f] || 0), 0);
    return {
        money,
        summary: {
            projects: rows.length, loggedHours: r1(tot("loggedHours")), estimatedHours: tot("estimatedHours"),
            overBudget: rows.filter((r) => r.budgetUsed !== null && r.budgetUsed > 100).length,
            nearBudget: rows.filter((r) => r.budgetUsed !== null && r.budgetUsed >= 80 && r.budgetUsed <= 100).length,
            ...(money ? { fee: tot("fee"), cost: tot("cost"), margin: tot("fee") - tot("cost"), marginPct: tot("fee") ? Math.round(((tot("fee") - tot("cost")) / tot("fee")) * 100) : null, lossMaking: rows.filter((r) => r.fee && r.margin < 0).length } : {}),
        },
        rows: rows.sort((a, b) => (money ? (a.marginPct ?? 999) - (b.marginPct ?? 999) : (b.budgetUsed ?? -1) - (a.budgetUsed ?? -1))),
        clients,
    };
};

export const profitabilityReport = async (req, res) => {
    try {
        return res.status(200).json({ success: true, data: await computeProfitability(req, req.query) });
    } catch (err) { return fail(res, err); }
};

/* =========================== Punctuality & absence =========================== */
export const computePunctuality = async (req, { start, end, department, people: given }) => {
    const people = given || (await peopleInScope(req, department ? { department } : {}));
    const ids = people.map((p) => p._id);
    const days = await workdaysIn(start, end);
    const [leaveMap, att] = await Promise.all([
        leaveDaysByPerson(ids, days),
        attendanceModel.find({ employeeId: { $in: ids }, attendanceDate: { $gte: days[0] || "9999", $lte: days[days.length - 1] || "0000" } }).select("employeeId attendanceDate status lateByMinutes workingHours checkIn").lean(),
    ]);
    const daySet = new Set(days);
    const mins = (d) => { const s = new Date(d).toLocaleTimeString("en-GB", { timeZone: COMPANY_TZ(), hour: "2-digit", minute: "2-digit", hour12: false }); const [h, m] = s.split(":").map(Number); return h * 60 + m; };
    const trend = new Map(days.map((d) => [d, { date: d, present: 0, late: 0 }]));

    const byPerson = new Map(people.map((p) => [String(p._id), []]));
    att.forEach((a) => { byPerson.get(String(a.employeeId))?.push(a); if (daySet.has(a.attendanceDate)) { const t = trend.get(a.attendanceDate); t.present++; if (a.status === "Late" || a.lateByMinutes > 0) t.late++; } });

    const rows = people.map((p) => {
        const k = String(p._id);
        const joined = p.joiningDate ? dayKey(p.joiningDate) : null;
        const mine = days.filter((d) => !joined || d >= joined);
        const leave = leaveMap.get(k) || new Set();
        const recs = (byPerson.get(k) || []).filter((a) => daySet.has(a.attendanceDate));
        const worked = new Set(recs.map((a) => a.attendanceDate));
        const late = recs.filter((a) => a.status === "Late" || a.lateByMinutes > 0);
        const firstIns = recs.filter((a) => a.checkIn?.time).map((a) => mins(a.checkIn.time));
        const avgIn = firstIns.length ? Math.round(firstIns.reduce((t, m) => t + m, 0) / firstIns.length) : null;
        const present = worked.size;
        return {
            employee: { _id: p._id, employeeId: p.employeeId, firstName: p.firstName, lastName: p.lastName, department: p.department, designation: p.designation, profileImage: p.profileImage },
            workingDays: mine.length, present, late: late.length, lateMinutes: late.reduce((t, a) => t + (a.lateByMinutes || 0), 0),
            avgLate: late.length ? Math.round(late.reduce((t, a) => t + (a.lateByMinutes || 0), 0) / late.length) : 0,
            leave: mine.filter((d) => leave.has(d)).length,
            absent: mine.filter((d) => !worked.has(d) && !leave.has(d)).length,
            avgFirstIn: avgIn === null ? null : `${String(Math.floor(avgIn / 60)).padStart(2, "0")}:${String(avgIn % 60).padStart(2, "0")}`,
            avgHours: present ? r1(recs.reduce((t, a) => t + (Number(a.workingHours) || 0), 0) / present) : 0,
            onTime: present ? Math.round(((present - late.length) / present) * 100) : 0,
        };
    }).sort((a, b) => b.late - a.late || b.absent - a.absent);

    const present = rows.reduce((t, r) => t + r.present, 0), late = rows.reduce((t, r) => t + r.late, 0);
    return {
        from: start, to: new Date(end - 1), workingDays: days.length,
        summary: { people: rows.length, onTime: present ? Math.round(((present - late) / present) * 100) : 0, late, absent: rows.reduce((t, r) => t + r.absent, 0), habitualLate: rows.filter((r) => r.late >= 3).length, avgHours: present ? r1(rows.reduce((t, r) => t + r.avgHours * r.present, 0) / present) : 0 },
        trend: [...trend.values()],
        rows,
    };
};

export const punctualityReport = async (req, res) => {
    try {
        const { start, end } = range(req.query);
        return res.status(200).json({ success: true, data: await computePunctuality(req, { start, end, department: req.query.department }) });
    } catch (err) { return fail(res, err); }
};

/* =========================== Document compliance =========================== */
export const REQUIRED_DOCS = ["ID Proof", "Address Proof", "PAN / Tax", "Bank Details"];
export const RECOMMENDED_DOCS = ["Education", "Offer Letter"];

export const computeCompliance = async (req) => {
    const viewer = await viewerOf(req);
    const filter = { status: "Active" };
    if (!viewer.all) filter._id = { $in: [...(await reportsUnder(viewer.id))] };
    const people = await employeeModel.find(filter).select(PERSON).lean();
    const docs = await documentModel.find({ employeeId: { $in: people.map((p) => p._id) } }).select("employeeId category title expiryDate").lean();
    const now = Date.now();
    const byPerson = new Map();
    docs.forEach((d) => { const k = String(d.employeeId); (byPerson.get(k) || byPerson.set(k, []).get(k)).push(d); });

    const expiring = [];
    const rows = people.map((p) => {
        const mine = byPerson.get(String(p._id)) || [];
        const cats = new Set(mine.map((d) => d.category));
        mine.forEach((d) => {
            if (!d.expiryDate) return;
            const days = Math.ceil((new Date(d.expiryDate) - now) / 864e5);
            if (days <= 30) expiring.push({ employee: p, title: d.title, category: d.category, expiryDate: d.expiryDate, days });
        });
        const missing = REQUIRED_DOCS.filter((c) => !cats.has(c));
        return {
            employee: { _id: p._id, employeeId: p.employeeId, firstName: p.firstName, lastName: p.lastName, department: p.department, designation: p.designation, profileImage: p.profileImage },
            has: Object.fromEntries([...REQUIRED_DOCS, ...RECOMMENDED_DOCS].map((c) => [c, cats.has(c)])),
            missing, documents: mine.length,
            complete: Math.round(((REQUIRED_DOCS.length - missing.length) / REQUIRED_DOCS.length) * 100),
        };
    }).sort((a, b) => a.complete - b.complete || String(a.employee.employeeId).localeCompare(String(b.employee.employeeId), undefined, { numeric: true }));

    return {
        required: REQUIRED_DOCS, recommended: RECOMMENDED_DOCS,
        summary: {
            people: rows.length, complete: rows.filter((r) => !r.missing.length).length,
            completePct: rows.length ? Math.round((rows.filter((r) => !r.missing.length).length / rows.length) * 100) : 0,
            missingDocs: rows.reduce((t, r) => t + r.missing.length, 0),
            expired: expiring.filter((e) => e.days < 0).length, expiringSoon: expiring.filter((e) => e.days >= 0).length,
        },
        rows, expiring: expiring.sort((a, b) => a.days - b.days),
    };
};

export const complianceReport = async (req, res) => {
    try {
        return res.status(200).json({ success: true, data: await computeCompliance(req) });
    } catch (err) { return fail(res, err); }
};

/* =========================== Expenses (dashboard) =========================== */
// Mine: this month's claims and where they stand. Team (Admin / HR: everyone; managers: their
// people): what's waiting for approval, this month by category, 6-month trend, top claimants.
const sumBy = (rows) => rows.reduce((t, e) => t + (Number(e.amount) || 0), 0);
export const computeExpenses = async (req, { people, monthStart }) => {
    const me = req.user.id;
    const mine = await expenseModel.find({ employeeId: me }).sort({ expenseDate: -1, createdAt: -1 }).limit(200).lean();
    const thisMonth = mine.filter((e) => new Date(e.expenseDate || e.createdAt) >= monthStart);
    const out = {
        me: {
            monthTotal: sumBy(thisMonth), monthCount: thisMonth.length,
            pending: { count: mine.filter((e) => e.status === "Pending").length, amount: sumBy(mine.filter((e) => e.status === "Pending")) },
            toBePaid: { count: mine.filter((e) => e.status === "Approved").length, amount: sumBy(mine.filter((e) => e.status === "Approved")) },
            reimbursed: sumBy(thisMonth.filter((e) => e.status === "Reimbursed")),
            recent: mine.slice(0, 4).map((e) => ({ _id: e._id, category: e.category, amount: e.amount, status: e.status, date: e.expenseDate || e.createdAt, description: e.description })),
        },
    };
    if (people) {
        const ids = people.map((p) => p._id);
        const sixAgo = new Date(monthStart); sixAgo.setMonth(sixAgo.getMonth() - 5);
        const rows = await expenseModel.find({ employeeId: { $in: ids }, $or: [{ status: "Pending" }, { expenseDate: { $gte: sixAgo } }] }).populate("employeeId", "employeeId firstName lastName designation profileImage").lean();
        const pending = rows.filter((e) => e.status === "Pending");
        const month = rows.filter((e) => new Date(e.expenseDate || e.createdAt) >= monthStart && e.status !== "Rejected");
        const byCat = new Map(); month.forEach((e) => byCat.set(e.category, (byCat.get(e.category) || 0) + (Number(e.amount) || 0)));
        const trend = [];
        for (let i = 5; i >= 0; i--) {
            const s = new Date(monthStart); s.setMonth(s.getMonth() - i);
            const e = new Date(s); e.setMonth(e.getMonth() + 1);
            const list = rows.filter((x) => { const d = new Date(x.expenseDate || x.createdAt); return d >= s && d < e && x.status !== "Rejected"; });
            trend.push({ month: s.toLocaleDateString("en-IN", { month: "short" }), amount: sumBy(list) });
        }
        const byPerson = new Map(); month.forEach((e) => { const k = String(e.employeeId?._id); const x = byPerson.get(k) || { employee: e.employeeId, amount: 0, count: 0 }; x.amount += Number(e.amount) || 0; x.count++; byPerson.set(k, x); });
        out.team = {
            pending: { count: pending.length, amount: sumBy(pending), oldestDays: pending.length ? Math.floor((Date.now() - Math.min(...pending.map((e) => new Date(e.createdAt).getTime()))) / 864e5) : 0 },
            month: { amount: sumBy(month), count: month.length, toBePaid: sumBy(month.filter((e) => e.status === "Approved")) },
            byCategory: [...byCat.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
            trend,
            topClaimants: [...byPerson.values()].sort((a, b) => b.amount - a.amount).slice(0, 3),
        };
    }
    return out;
};

/* =========================== Dashboard: Business pulse =========================== */
// One call for the dashboard row. Seniors get firm / team numbers; everyone gets "me".
export const businessPulse = async (req, res) => {
    try {
        const today = localDayStart();
        const weekStart = new Date(today); weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7)); // Monday
        const end = new Date(today.getTime() + 864e5);
        const monthStart = localDayStart(new Date(today.getFullYear(), today.getMonth(), 1, 12));
        const twoWeeks = new Date(today.getTime() - 13 * 864e5);

        const meDoc = await employeeModel.findById(req.user.id).select(`${PERSON} salary`).lean();
        const meUtil = await computeUtilisation(req, { start: weekStart, end, people: meDoc ? [meDoc] : [] });
        const senior = ["Admin", "HR", "Manager", "Team Lead"].includes(req.user.role);
        const people = senior ? await peopleInScope(req) : null;
        const expenses = await computeExpenses(req, { people: people && people.filter((p) => String(p._id) !== String(req.user.id)), monthStart });
        const data = { me: { utilisation: meUtil.rows[0] || null, weekStart, expenses: expenses.me } };

        if (senior) {
            const [week, month, recent, compliance, profit] = await Promise.all([
                computeUtilisation(req, { start: weekStart, end, people }),
                computePunctuality(req, { start: monthStart, end, people }),
                computePunctuality(req, { start: twoWeeks, end, people }),
                computeCompliance(req),
                computeProfitability(req, { status: "open" }),
            ]);
            const withCapacity = week.rows.filter((r) => r.capacityHours > 0);
            data.team = {
                utilisation: {
                    ...week.summary, weekStart,
                    top: withCapacity.slice(0, 3), bottom: withCapacity.slice(-3).reverse(),
                    byDepartment: week.byDepartment.slice(0, 5),
                },
                punctuality: { ...month.summary, trend: recent.trend, topLate: month.rows.filter((r) => r.late > 0).slice(0, 3) },
                compliance: { ...compliance.summary, missing: compliance.rows.filter((r) => r.missing.length).slice(0, 5), expiring: compliance.expiring.slice(0, 3) },
                profitability: {
                    money: profit.money, ...profit.summary,
                    watch: profit.rows.filter((r) => (r.budgetUsed ?? 0) >= 80 || (profit.money && r.fee && r.margin < 0)).slice(0, 4),
                    topClients: profit.clients.slice(0, 4),
                },
                expenses: expenses.team,
            };
        }
        return res.status(200).json({ success: true, data });
    } catch (err) { return fail(res, err); }
};
