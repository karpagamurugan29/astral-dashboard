// Demo data for trying out the dashboard, audits, attendance and the Location Log.
//
//   node scripts/demoData.js seed    → add clients, audit projects, time logs, attendance, requests
//   node scripts/demoData.js clean   → remove everything this script added
//
// Everything it adds is tagged so `clean` can find it: client / audit codes start with "DEMO-",
// demo check-ins carry device "demo-seed", and leave / correction / expense / announcement text
// starts with "[Demo]". Existing records are never overwritten (a day someone already has
// attendance for is skipped). Reporting managers are filled in only where none is set, and are
// left in place by `clean` because they're real configuration the app needs.
import dotenv from "dotenv";
import mongoose from "mongoose";
import Employee from "../models/employeeModel.js";
import Attendance from "../models/attendanceModel.js";
import AuditClient from "../models/auditClientModel.js";
import AuditEngagement from "../models/auditEngagementModel.js";
import AuditTimeLog from "../models/auditTimeLogModel.js";
import Leave from "../models/leaveModel.js";
import Regularization from "../models/regularizationModel.js";
import Expense from "../models/expenseModel.js";
import Announcement from "../models/announcementModel.js";
import Holiday from "../models/holidayModel.js";
import Shift from "../models/shiftModel.js";
import Branch from "../models/branchModel.js";
import Asset from "../models/assetModel.js";
import Ticket from "../models/ticketModel.js";
import SalaryStructure from "../models/salaryStructureModel.js";
import PayrollRun from "../models/payrollRunModel.js";
import Payslip from "../models/payslipModel.js";
import LoanAdvance from "../models/loanAdvanceModel.js";
import Project from "../models/ProjectModel.js";
import Task from "../models/taskModel.js";
import Notification from "../models/notificationModel.js";

dotenv.config();

const TAG = "[Demo]";
const DEVICE = "demo-seed";
const TZ_OFFSET_MIN = 330; // India (UTC+5:30)
const DAY = 864e5;

// Deterministic randomness so a re-seed looks the same.
let seed = 42;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const between = (a, b) => a + rnd() * (b - a);

// A moment at hh:mm India time on the local day `dayOffset` days from today.
const istDayStartUtc = (dayOffset = 0) => {
    const nowIst = new Date(Date.now() + TZ_OFFSET_MIN * 6e4);
    const midnightIstAsUtc = Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate());
    return midnightIstAsUtc - TZ_OFFSET_MIN * 6e4 + dayOffset * DAY;
};
const at = (dayOffset, hours) => new Date(istDayStartUtc(dayOffset) + hours * 36e5);
const isWeekend = (dayOffset) => { const d = new Date(istDayStartUtc(dayOffset) + 12 * 36e5); const w = new Date(d.getTime() + TZ_OFFSET_MIN * 6e4).getUTCDay(); return w === 0 || w === 6; };
const utcDate = (d) => d.toISOString().split("T")[0];

const OFFICE = { latitude: 11.0285, longitude: 76.9905, address: "Astral Consulting, Avinashi Road, Peelamedu, Coimbatore, Tamil Nadu 641004" };
const HOME = { latitude: 11.0090, longitude: 76.9500, address: "R S Puram, Coimbatore, Tamil Nadu 641002" };
const jitter = (p, m = 0.0012) => ({ latitude: +(p.latitude + between(-m, m)).toFixed(6), longitude: +(p.longitude + between(-m, m)).toFixed(6), accuracy: Math.round(between(8, 35)), address: p.address });

const CLIENTS = [
    { clientCode: "DEMO-001", name: "Sunrise Textiles Pvt Ltd", entityType: "Company", industry: "Textiles", city: "Coimbatore", contactPerson: "R. Senthil", phone: "+91 98430 11223", gstin: "33AABCS1234F1Z5", pan: "AABCS1234F", place: { latitude: 10.9625, longitude: 76.9640, address: "SIDCO Industrial Estate, Kurichi, Coimbatore, Tamil Nadu 641021" } },
    { clientCode: "DEMO-002", name: "Kaveri Agro Foods LLP", entityType: "LLP", industry: "Food processing", city: "Coimbatore", contactPerson: "Meena Ravi", phone: "+91 94433 55670", place: { latitude: 11.0790, longitude: 76.9420, address: "Mettupalayam Road, Thudiyalur, Coimbatore, Tamil Nadu 641034" } },
    { clientCode: "DEMO-003", name: "Meenakshi Motors Ltd", entityType: "Company", industry: "Automobile dealership", city: "Coimbatore", contactPerson: "K. Arvind", phone: "+91 90030 44511", place: { latitude: 10.9990, longitude: 77.0270, address: "Trichy Road, Singanallur, Coimbatore, Tamil Nadu 641005" } },
    { clientCode: "DEMO-004", name: "Coromandel Pharma Pvt Ltd", entityType: "Company", industry: "Pharmaceuticals", city: "Coimbatore", contactPerson: "Dr. S. Lakshmi", phone: "+91 97890 22334", place: { latitude: 11.0790, longitude: 77.0010, address: "Saravanampatti, Coimbatore, Tamil Nadu 641035" } },
    { clientCode: "DEMO-005", name: "Bharat Logistics Co", entityType: "Partnership", industry: "Logistics", city: "Coimbatore", contactPerson: "P. Ganesh", phone: "+91 98422 77881", place: { latitude: 11.0360, longitude: 76.9680, address: "Ganapathy, Coimbatore, Tamil Nadu 641006" } },
];

// [code, client, name, type, FY, manager email, team emails, status, start offset, end offset, estimated hours]
const AUDITS = [
    ["DEMO-SA-2601", "DEMO-001", "Statutory audit · FY 2025-26", "Statutory", "2025-26", "manager@astral.test", ["associate@astral.test", "junior.consultant@astral.test", "consultant@astral.test"], "Fieldwork", -20, 9, 160],
    ["DEMO-GST-2602", "DEMO-001", "GST audit · FY 2025-26", "GST", "2025-26", "manager@hoook.com", ["sneha.reddy@example.com", "divya.nair@example.com"], "Fieldwork", -12, 16, 60],
    ["DEMO-IA-2603", "DEMO-002", "Internal audit · Q2", "Internal", "2026-27", "manager@astral.test", ["senior.consultant@astral.test", "staff@hoook.com", "mohan.krishna@example.com"], "Review", -25, 4, 90],
    ["DEMO-SA-2604", "DEMO-003", "Statutory audit · FY 2025-26", "Statutory", "2025-26", "manager@hoook.com", ["john.doe4@example.com", "rahul.verma@example.com", "karthi@gmail.com"], "Fieldwork", -30, -3, 140],
    ["DEMO-TAX-2605", "DEMO-003", "Tax audit · FY 2025-26", "Tax", "2025-26", "anjali.patel@example.com", ["vikram.singh@example.com", "teamlead@hoook.com"], "Planning", 2, 30, 50],
    ["DEMO-STK-2606", "DEMO-004", "Stock audit · September", "Stock", "2026-27", "senior.manager@astral.test", ["consultant@astral.test", "mohan.krishna@example.com"], "Fieldwork", -8, 12, 40],
    ["DEMO-CON-2607", "DEMO-005", "Concurrent audit · October", "Concurrent", "2026-27", "manager@hoook.com", ["divya.nair@example.com", "karthi@gmail.com"], "Fieldwork", -15, 25, 70],
    ["DEMO-SA-2508", "DEMO-005", "Statutory audit · FY 2024-25", "Statutory", "2024-25", "manager@astral.test", ["associate@astral.test", "rahul.verma@example.com"], "Completed", -90, -40, 120],
];

// Reporting lines (filled only where empty).
const REPORTS_TO = {
    "manager@astral.test": ["associate@astral.test", "junior.consultant@astral.test", "consultant@astral.test", "senior.consultant@astral.test", "staff@hoook.com", "mohan.krishna@example.com"],
    "manager@hoook.com": ["sneha.reddy@example.com", "divya.nair@example.com", "john.doe4@example.com", "rahul.verma@example.com", "karthi@gmail.com", "vikram.singh@example.com", "teamlead@hoook.com"],
    "senior.manager@astral.test": ["manager@astral.test"],
    "anjali.patel@example.com": ["manager@hoook.com"],
    "director@astral.test": ["senior.manager@astral.test", "anjali.patel@example.com", "hr.head@astral.test", "hr@hoook.com", "accounts.head@astral.test", "priya.sharma@example.com"],
};

const NOTES = ["Vouching of purchase invoices", "Bank reconciliation review", "Fixed asset register verification", "Stock count observation", "GSTR-1 vs books reconciliation", "Payroll sample testing", "Revenue cut-off testing", "Debtors confirmation follow-up", "TDS compliance check", "Management discussion on findings"];

const seedAll = async () => {
    const emps = await Employee.find({}).select("_id email firstName lastName manager status").lean();
    const byEmail = new Map(emps.map((e) => [e.email, e]));
    const E = (email) => byEmail.get(email);

    // 1. Reporting managers
    let managersSet = 0;
    for (const [mgr, reports] of Object.entries(REPORTS_TO)) {
        const m = E(mgr); if (!m) continue;
        for (const r of reports) {
            const e = E(r);
            if (e && !e.manager) { await Employee.updateOne({ _id: e._id }, { manager: m._id }); managersSet++; }
        }
    }

    // 2. Clients
    const clientIds = {};
    for (const c of CLIENTS) {
        const { place, ...data } = c;
        const doc = await AuditClient.findOneAndUpdate({ clientCode: c.clientCode }, { ...data, notes: `${TAG} Sample client for trying out the app.`, isDeleted: false }, { upsert: true, returnDocument: "after" });
        clientIds[c.clientCode] = doc;
    }

    // 3. Audit projects
    const audits = [];
    for (const [code, client, name, type, fy, mgr, team, status, s, e, est] of AUDITS) {
        const c = clientIds[client];
        const doc = await AuditEngagement.findOneAndUpdate({ auditCode: code }, {
            auditCode: code, clientId: c._id, clientName: c.name, engagementName: name, auditType: type, financialYear: fy,
            description: `${TAG} Sample engagement.`, auditManager: E(mgr)?._id, teamMembers: team.map((t) => E(t)?._id).filter(Boolean),
            startDate: at(s, 0), endDate: at(e, 0), estimatedHours: est, fee: est * 2500, priority: e < 7 ? "High" : "Medium", status, isDeleted: false,
        }, { upsert: true, returnDocument: "after" });
        audits.push({ doc, place: CLIENTS.find((x) => x.clientCode === client).place, team, status });
    }

    // 4. Time logs: last 13 working days + today, for open projects.
    await AuditTimeLog.deleteMany({ auditId: { $in: audits.map((a) => a.doc._id) } });
    const nowMs = Date.now();
    const nowIstH = (nowMs - istDayStartUtc(0)) / 36e5;
    const worked = new Map(); // `${email}|${dayOffset}` → client place (for attendance)
    const logs = [];
    const running = new Set();
    for (let d = -13; d <= 0; d++) {
        if (isWeekend(d)) continue;
        for (const a of audits.filter((x) => ["Fieldwork", "Review"].includes(x.status))) {
            for (const email of a.team) {
                const emp = E(email); if (!emp) continue;
                if (rnd() < 0.35) continue; // not on this project that day
                const key = `${email}|${d}`;
                if (worked.has(key)) continue; // one project per person per day
                worked.set(key, a.place);
                let s1 = between(10, 10.8);
                // today: start the morning session shortly before now, so some timers are live
                if (d === 0 && nowIstH > 9.6 && nowIstH < 13) s1 = Math.min(s1, nowIstH - between(0.3, 0.6));
                const e1 = s1 + between(1.8, 3.2);
                const s2 = between(14, 14.8), e2 = s2 + between(1.5, 3.2);
                for (const [s, e] of [[s1, e1], [s2, e2]]) {
                    if (d === 0 && s > nowIstH - 0.25) continue; // not started yet today
                    const isRunning = d === 0 && e > nowIstH && nowIstH < 19.5 && running.size < 4 && !running.has(email);
                    if (d === 0 && e > nowIstH && !isRunning) continue;
                    if (isRunning) running.add(email);
                    const start = at(d, s), end = isRunning ? null : at(d, e);
                    logs.push({
                        auditId: a.doc._id, employeeId: emp._id, startTime: start, endTime: end,
                        durationMinutes: end ? Math.round((end - start) / 6e4) : 0,
                        startLocation: jitter(a.place), stopLocation: end ? jitter(a.place) : undefined,
                        note: end ? `${TAG} ${pick(NOTES)}` : "",
                    });
                }
            }
        }
    }
    await AuditTimeLog.insertMany(logs);

    // 5. Attendance for active staff with a designation, last 13 working days + today.
    const people = emps.filter((e) => e.status === "Active" && byEmail.has(e.email));
    let attAdded = 0;
    const onLeaveToday = E("mohan.krishna@example.com");
    for (let d = -13; d <= 0; d++) {
        if (isWeekend(d)) continue;
        for (const p of people) {
            if (d === 0 && onLeaveToday && String(p._id) === String(onLeaveToday._id)) continue;
            if (rnd() < (d === 0 ? 0.2 : 0.07)) continue; // a few absences
            const clientPlace = worked.get(`${p.email}|${d}`);
            const inH = between(9.05, 10.25);
            if (d === 0 && inH > nowIstH) continue;
            const checkInTime = at(d, inH);
            const attendanceDate = utcDate(checkInTime);
            if (await Attendance.exists({ employeeId: p._id, attendanceDate })) continue; // never overwrite real records
            const home = !clientPlace && rnd() < 0.12;
            const mode = clientPlace ? "Client" : home ? "Home" : "Office";
            const place = clientPlace || (home ? HOME : OFFICE);
            const outH = between(17.6, 19.1);
            const stillIn = d === 0 && (outH > nowIstH || rnd() < 0.6) && nowIstH < 20;
            const checkOutTime = stillIn ? null : at(d, Math.min(outH, d === 0 ? nowIstH - 0.1 : outH));
            const lateBy = Math.max(0, Math.round((inH - 9.75) * 60));
            const hoursWorked = checkOutTime ? +((checkOutTime - checkInTime) / 36e5).toFixed(2) : 0;
            const punchIn = { time: checkInTime, ...jitter(place), device: DEVICE, remarks: clientPlace && rnd() < 0.4 ? "At client site for fieldwork" : "" };
            const punchOut = checkOutTime ? { time: checkOutTime, ...jitter(place), device: DEVICE } : { time: null };
            await Attendance.create({
                employeeId: p._id, attendanceDate, attendanceType: mode,
                checkIn: punchIn, checkOut: punchOut,
                sessions: [{ mode, checkIn: punchIn, checkOut: punchOut }],
                workingHours: hoursWorked, lateByMinutes: lateBy,
                status: checkOutTime && hoursWorked < 4.5 ? "Half Day" : lateBy > 0 ? "Late" : "Present",
            });
            attAdded++;
        }
    }

    // 6. Requests waiting for a decision, someone on leave, announcements.
    const mk = async (Model, filter, doc) => (await Model.exists(filter)) || Model.create(doc);
    const lv = (email, type, from, to, days, status, reason) => E(email) && mk(Leave, { employeeId: E(email)._id, reason: `${TAG} ${reason}` }, { employeeId: E(email)._id, leaveType: type, fromDate: at(from, 0), toDate: at(to, 0), totalDays: days, reason: `${TAG} ${reason}`, status });
    await lv("consultant@astral.test", "Casual Leave", 3, 3, 1, "Pending", "Family function");
    await lv("divya.nair@example.com", "Earned Leave", 6, 8, 3, "Pending", "Travel to hometown");
    await lv("rahul.verma@example.com", "Sick Leave", 1, 1, 1, "Pending", "Doctor appointment");
    await lv("mohan.krishna@example.com", "Casual Leave", 0, 0, 1, "Approved", "Personal work");
    for (const [email, reason] of [["junior.consultant@astral.test", "Forgot to check out after client visit"], ["karthi@gmail.com", "Checked in late due to network issue at client site"]]) {
        if (E(email)) await mk(Regularization, { employeeId: E(email)._id, reason: `${TAG} ${reason}` }, { employeeId: E(email)._id, attendanceDate: utcDate(at(-1, 12)), requestedCheckIn: "09:30", requestedCheckOut: "18:30", reason: `${TAG} ${reason}`, status: "Pending" });
    }
    for (const [email, cat, amt, desc] of [["associate@astral.test", "Travel", 640, "Cab to Sunrise Textiles, Kurichi"], ["sneha.reddy@example.com", "Food", 380, "Team lunch during GST fieldwork"], ["vikram.singh@example.com", "Travel", 1250, "Two-wheeler fuel for client visits (week)"]]) {
        if (E(email)) await mk(Expense, { employeeId: E(email)._id, description: `${TAG} ${desc}` }, { employeeId: E(email)._id, category: cat, amount: amt, expenseDate: at(-2, 12), description: `${TAG} ${desc}`, status: "Pending" });
    }
    const poster = E("hr.head@astral.test") || E("admin@hoook.com");
    if (poster) {
        await mk(Announcement, { title: `${TAG} Year-end audit season kick-off` }, { title: `${TAG} Year-end audit season kick-off`, content: "Fieldwork for statutory audits starts this month. Please start your timer on the right audit project every day and add a short note when you stop.", postedBy: poster._id });
        await mk(Announcement, { title: `${TAG} Location must be on for check-in` }, { title: `${TAG} Location must be on for check-in`, content: "Check-in and check-out now record your location. Allow location for the Astral app in your phone's browser before you reach the client site.", postedBy: poster._id });
    }

    const more = await seedMore(E, (await Employee.find({}).select("_id email designation status").lean()));
    return { managersSet, clients: CLIENTS.length, audits: AUDITS.length, timeLogs: logs.length, runningTimers: running.size, attendance: attAdded, ...more };
};

const cleanAll = async () => {
    const audits = await AuditEngagement.find({ auditCode: /^DEMO-/ }).select("_id").lean();
    const r = {
        timeLogs: (await AuditTimeLog.deleteMany({ auditId: { $in: audits.map((a) => a._id) } })).deletedCount,
        audits: (await AuditEngagement.deleteMany({ auditCode: /^DEMO-/ })).deletedCount,
        clients: (await AuditClient.deleteMany({ clientCode: /^DEMO-/ })).deletedCount,
        attendance: (await Attendance.deleteMany({ "checkIn.device": DEVICE })).deletedCount,
        leaves: (await Leave.deleteMany({ reason: /^\[Demo\]/ })).deletedCount,
        corrections: (await Regularization.deleteMany({ reason: /^\[Demo\]/ })).deletedCount,
        expenses: (await Expense.deleteMany({ description: /^\[Demo\]/ })).deletedCount,
        announcements: (await Announcement.deleteMany({ title: /^\[Demo\]/ })).deletedCount,
        tasks: (await Task.deleteMany({ description: /^\[Demo\]/ })).deletedCount,
        ...(await cleanMore()),
    };
    return r;
};


/* ---------------- every other section: registry-tracked so `clean` removes exactly these ---------------- */
// Records below are written once (skipped when something with the same key already exists)
// and their ids are kept in the "demoseeds" collection; `clean` deletes exactly those ids.
const registry = () => mongoose.connection.db.collection("demoseeds");
const track = async (Model, doc) => { await registry().insertOne({ collection: Model.collection.name, id: doc._id }); return doc; };
const createOnce = async (Model, existsFilter, doc) => {
    const found = await Model.findOne(existsFilter).lean();
    if (found) return null;
    return track(Model, await Model.create(doc));
};

const MONTHLY = { "Associate": 22000, "Junior Consultant": 30000, "Consultant": 42000, "Senior Consultant": 60000, "Manager": 85000, "Senior Manager": 110000, "Accounts Head": 95000, "HR Head": 90000, "Company Partner": 250000, "Director": 220000 };
const structureFor = (gross) => {
    const basic = Math.round(gross * 0.5), hra = Math.round(gross * 0.2), conveyance = 1600, medicalAllowance = 1250;
    const specialAllowance = Math.max(0, gross - basic - hra - conveyance - medicalAllowance);
    const providentFund = Math.min(1800, Math.round(basic * 0.12)), professionalTax = 200;
    const incomeTax = gross > 100000 ? Math.round(gross * 0.12) : gross > 50000 ? Math.round(gross * 0.06) : 0;
    return { basic, hra, conveyance, medicalAllowance, specialAllowance, providentFund, professionalTax, incomeTax, otherDeductions: 0 };
};

const seedMore = async (E, emps) => {
    const n = {};
    const bump = (k, d) => { if (d) n[k] = (n[k] || 0) + 1; };
    const admin = E("director@astral.test") || E("admin@hoook.com");
    const hr = E("hr.head@astral.test") || admin;

    // Organisation
    for (const b of [{ name: "Coimbatore HQ", address: "Avinashi Road, Peelamedu", city: "Coimbatore", country: "India" }, { name: "Chennai Office", address: "G N Chetty Road, T. Nagar", city: "Chennai", country: "India" }])
        bump("branches", await createOnce(Branch, { name: b.name }, { ...b, status: "Active" }));
    for (const sh of [{ name: "General Shift", startTime: "09:30", endTime: "18:30", graceMinutes: 15 }, { name: "Field Audit Shift", startTime: "09:00", endTime: "18:00", graceMinutes: 30 }])
        bump("shifts", await createOnce(Shift, { name: sh.name }, sh));
    for (const h of [["Gandhi Jayanti", "2026-10-02", "National"], ["Deepavali", "2026-11-08", "Regional"], ["Christmas", "2026-12-25", "National"], ["New Year's Day", "2027-01-01", "Optional"], ["Pongal", "2027-01-15", "Regional"], ["Republic Day", "2027-01-26", "National"]])
        bump("holidays", await createOnce(Holiday, { name: h[0], date: new Date(`${h[1]}T00:00:00Z`) }, { name: h[0], date: new Date(`${h[1]}T00:00:00Z`), type: h[2] }));

    // Assets: a laptop each for the audit team, plus spares
    const laptopFor = ["associate@astral.test", "junior.consultant@astral.test", "consultant@astral.test", "senior.consultant@astral.test", "manager@astral.test", "sneha.reddy@example.com", "divya.nair@example.com", "rahul.verma@example.com"];
    for (const [i, email] of laptopFor.entries()) {
        const e = E(email); if (!e) continue;
        bump("assets", await createOnce(Asset, { serialNumber: `DEMO-LAP-${String(i + 1).padStart(3, "0")}` }, { assetName: i % 2 ? "Lenovo ThinkPad E14" : "Dell Latitude 5440", assetType: "Laptop", serialNumber: `DEMO-LAP-${String(i + 1).padStart(3, "0")}`, assignedTo: e._id, assignedDate: at(-60 + i, 10), status: "Assigned", notes: "Issued for client fieldwork" }));
    }
    for (const [i, a] of [["Dell 24\" Monitor", "Monitor"], ["Jio data SIM", "SIM Card"], ["Logitech MX Keys", "Accessory"]].entries())
        bump("assets", await createOnce(Asset, { serialNumber: `DEMO-SPR-${i + 1}` }, { assetName: a[0], assetType: a[1], serialNumber: `DEMO-SPR-${i + 1}`, status: "Available" }));

    // HR helpdesk
    const tickets = [
        ["associate@astral.test", "Payslip for September not visible", "Payroll and Salary", "High", "Open", "I can see August but not September in My Payslips."],
        ["consultant@astral.test", "Laptop battery drains fast at client site", "IT and System Access", "Medium", "In Progress", "Battery lasts about 2 hours; affects fieldwork at Sunrise Textiles."],
        ["divya.nair@example.com", "Clarification on comp-off for Saturday audit", "Leave and Holidays", "Low", "Resolved", "Worked on Saturday for the GST audit; how do I claim comp-off?"],
        ["rahul.verma@example.com", "Wrong check-in time on 14 Oct", "Attendance and Timesheets", "Medium", "Closed", "Check-in shows 10:40 but I arrived at 9:35."],
    ];
    for (const [email, subject, category, priority, status, description] of tickets) {
        const e = E(email); if (!e) continue;
        bump("tickets", await createOnce(Ticket, { employeeId: e._id, subject }, { employeeId: e._id, subject, category, priority, status, description, assignedTo: hr?._id, resolvedAt: ["Resolved", "Closed"].includes(status) ? at(-2, 15) : undefined }));
    }

    // Payroll: salary structures (only where none exists), then three monthly runs
    const staff = emps.filter((e) => e.status === "Active" && MONTHLY[e.designation]);
    for (const e of staff) bump("salaryStructures", await createOnce(SalaryStructure, { employeeId: e._id }, { employeeId: e._id, ...structureFor(MONTHLY[e.designation]) }));
    const structures = await SalaryStructure.find({ employeeId: { $in: staff.map((e) => e._id) } }).lean();
    for (const [period, status] of [["2026-07", "Paid"], ["2026-08", "Paid"], ["2026-09", "Approved"]]) {
        if (await PayrollRun.exists({ period })) continue;
        let tg = 0, td = 0, tn = 0;
        const run = await track(PayrollRun, await PayrollRun.create({ period, status, generatedBy: admin?._id, approvedBy: admin?._id, approvedAt: new Date(`${period}-28T10:00:00Z`), paidAt: status === "Paid" ? new Date(`${period}-30T10:00:00Z`) : null, employeeCount: structures.length }));
        for (const s of structures) {
            const gross = s.basic + s.hra + s.conveyance + s.medicalAllowance + s.specialAllowance;
            const ded = s.providentFund + s.professionalTax + s.incomeTax + s.otherDeductions;
            tg += gross; td += ded; tn += gross - ded;
            await track(Payslip, await Payslip.create({ payrollRunId: run._id, employeeId: s.employeeId, period, basic: s.basic, hra: s.hra, conveyance: s.conveyance, medicalAllowance: s.medicalAllowance, specialAllowance: s.specialAllowance, providentFund: s.providentFund, professionalTax: s.professionalTax, incomeTax: s.incomeTax, otherDeductions: s.otherDeductions, grossPay: gross, totalDeductions: ded, netPay: gross - ded }));
        }
        await PayrollRun.updateOne({ _id: run._id }, { totalGross: tg, totalDeductions: td, totalNet: tn });
        bump("payrollRuns", run);
    }

    // Loans / advances
    for (const [email, amount, monthly, status, reason, remaining] of [["junior.consultant@astral.test", 20000, 4000, "Disbursed", "Two-wheeler down payment for client travel", 12000], ["sneha.reddy@example.com", 15000, 5000, "Pending", "Medical expenses for a family member", 15000], ["mohan.krishna@example.com", 8000, 4000, "Closed", "Festival advance", 0]]) {
        const e = E(email); if (!e) continue;
        bump("loans", await createOnce(LoanAdvance, { employeeId: e._id, reason }, { employeeId: e._id, amount, monthlyDeduction: monthly, status, reason, remainingBalance: remaining, approvedBy: status !== "Pending" ? hr?._id : undefined }));
    }

    // Internal projects and tasks (the generic Projects menu)
    const p1 = await createOnce(Project, { projectCode: "DEMO-P1" }, { projectCode: "DEMO-P1", projectName: "Audit methodology manual 2026", description: "Update the firm's audit programme templates for FY 2026-27.", clientName: "Internal", projectManager: E("senior.manager@astral.test")?._id, teamMembers: ["senior.consultant@astral.test", "consultant@astral.test"].map((x) => E(x)?._id).filter(Boolean), startDate: at(-30, 0), endDate: at(20, 0), estimatedHours: 120, priority: "High", status: "Active", progress: 45, createdBy: admin?._id });
    const p2 = await createOnce(Project, { projectCode: "DEMO-P2" }, { projectCode: "DEMO-P2", projectName: "Article trainee onboarding programme", description: "Induction plan and training calendar for the new article batch.", clientName: "Internal", projectManager: E("hr.head@astral.test")?._id || admin?._id, teamMembers: ["associate@astral.test", "junior.consultant@astral.test"].map((x) => E(x)?._id).filter(Boolean), startDate: at(-10, 0), endDate: at(35, 0), estimatedHours: 60, priority: "Medium", status: "Active", progress: 20, createdBy: admin?._id });
    bump("projects", p1); bump("projects", p2);
    const proj1 = p1 || (await Project.findOne({ projectCode: "DEMO-P1" }).lean());
    const proj2 = p2 || (await Project.findOne({ projectCode: "DEMO-P2" }).lean());
    const tasks = [
        [proj1, "Revise statutory audit checklist", "senior.consultant@astral.test", "High", "In Progress", -5, 4],
        [proj1, "Draft GST audit work-paper templates", "consultant@astral.test", "Medium", "To Do", 0, 10],
        [proj1, "Partner review of materiality guidance", "senior.manager@astral.test", "High", "In Review", -12, 2],
        [proj1, "Sampling worksheet (Excel) update", "consultant@astral.test", "Low", "Done", -20, -6],
        [proj2, "Prepare induction deck", "associate@astral.test", "Medium", "In Progress", -4, 5],
        [proj2, "Schedule Tally / ERP training", "junior.consultant@astral.test", "Medium", "Blocked", -3, -1],
    ];
    for (const [proj, title, email, priority, status, s0, due] of tasks) {
        if (!proj) continue;
        bump("tasks", await createOnce(Task, { projectId: proj._id, title }, { projectId: proj._id, title, description: `${TAG} Sample task.`, assignedTo: E(email)?._id, priority, status, startDate: at(s0, 0), dueDate: at(due, 0), estimatedHours: 8, createdBy: admin?._id }));
    }

    // Decided requests (history), so approvals, reports and charts have more than pending items
    for (const [email, type, from, to, days, status, reason] of [["associate@astral.test", "Sick Leave", -18, -18, 1, "Approved", "Fever"], ["senior.consultant@astral.test", "Earned Leave", -30, -27, 4, "Approved", "Family trip"], ["john.doe4@example.com", "Casual Leave", -9, -9, 1, "Rejected", "Personal work — overlapped with year-end fieldwork"], ["anjali.patel@example.com", "Casual Leave", -6, -6, 1, "Approved", "Bank work"]]) {
        const e = E(email); if (!e) continue;
        bump("leaves", await createOnce(Leave, { employeeId: e._id, reason: `${TAG} ${reason}` }, { employeeId: e._id, leaveType: type, fromDate: at(from, 0), toDate: at(to, 0), totalDays: days, reason: `${TAG} ${reason}`, status }));
    }
    for (const [email, cat, amt, desc, status, d] of [["consultant@astral.test", "Travel", 820, "Cab to Coromandel Pharma for stock count", "Reimbursed", -15], ["senior.consultant@astral.test", "Accommodation", 3200, "Hotel stay for Kaveri Agro plant visit", "Approved", -8], ["manager@astral.test", "Client Entertainment", 1850, "Lunch with Sunrise Textiles CFO", "Approved", -11], ["divya.nair@example.com", "Food", 420, "Working dinner during GST filing week", "Reimbursed", -20], ["karthi@gmail.com", "Office Supplies", 650, "Audit files and stationery", "Rejected", -5]]) {
        const e = E(email); if (!e) continue;
        bump("expenses", await createOnce(Expense, { employeeId: e._id, description: `${TAG} ${desc}` }, { employeeId: e._id, category: cat, amount: amt, expenseDate: at(d, 12), description: `${TAG} ${desc}`, status }));
    }

    // A few notifications so the bell and Notification Center aren't empty
    for (const [email, title, message, link] of [["associate@astral.test", "Assigned to an audit", "You have been assigned to Sunrise Textiles Pvt Ltd (DEMO-SA-2601).", "/audits"], ["associate@astral.test", "Leave approved", "Your sick leave was approved.", "/leave"], ["consultant@astral.test", "Expense reimbursed", "₹820 for cab to Coromandel Pharma has been reimbursed.", "/expenses"], ["manager@astral.test", "Leave request", "Consultant Demo applied for 1 day of casual leave.", "/leave/approvals"]]) {
        const e = E(email); if (!e) continue;
        bump("notifications", await createOnce(Notification, { employeeId: e._id, title, message }, { employeeId: e._id, title, message, type: "General", link }));
    }
    return n;
};

const cleanMore = async () => {
    const entries = await registry().find({}).toArray();
    const byColl = {};
    entries.forEach((e) => { (byColl[e.collection] ||= []).push(e.id); });
    const out = {};
    for (const [coll, ids] of Object.entries(byColl)) out[coll] = (await mongoose.connection.db.collection(coll).deleteMany({ _id: { $in: ids } })).deletedCount;
    await registry().deleteMany({});
    return out;
};

const cmd = process.argv[2];
if (!["seed", "clean"].includes(cmd)) {
    console.log("Usage: node scripts/demoData.js seed | clean");
    process.exit(1);
}
await mongoose.connect(process.env.MONGODB_URI);
try {
    const result = cmd === "seed" ? await seedAll() : await cleanAll();
    console.log(cmd === "seed" ? "Demo data added:" : "Demo data removed:", result);
} finally {
    await mongoose.disconnect();
}
