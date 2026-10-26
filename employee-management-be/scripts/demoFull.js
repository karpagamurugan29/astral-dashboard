// Demo data for the newer screens, on top of scripts/demoData.js and scripts/demoTeams.js.
//
//   node scripts/demoFull.js seed    → attendance for everyone (30 days, incl. today), audits for every
//                                      team with stage progress and time logs, invoices in every state,
//                                      billing details, leave / expenses / corrections / tickets,
//                                      team chat groups, shared files and folders, closed tasks
//   node scripts/demoFull.js clean   → remove what `seed` added
//
// Everything is tagged: audit codes "DEMO-T…", invoice notes and request text start with "[Demo]",
// files carry the description "[Demo]", check-ins the device "demo-full". Real records are never touched
// (a day someone already has attendance for is skipped).
import dotenv from "dotenv";
import mongoose from "mongoose";
import Employee from "../models/employeeModel.js";
import Attendance from "../models/attendanceModel.js";
import AuditClient from "../models/auditClientModel.js";
import AuditEngagement from "../models/auditEngagementModel.js";
import AuditTimeLog from "../models/auditTimeLogModel.js";
import Invoice from "../models/invoiceModel.js";
import CompanySettings from "../models/CompanySettingsModel.js";
import Leave from "../models/leaveModel.js";
import Expense from "../models/expenseModel.js";
import Regularization from "../models/regularizationModel.js";
import Ticket from "../models/ticketModel.js";
import Conversation from "../models/conversationModel.js";
import Task from "../models/taskModel.js";
import SharedFile, { FileFolder } from "../models/sharedFileModel.js";
import { MILESTONES } from "../controller/billing.controller.js";

dotenv.config();
const TAG = "[Demo]";
const DEVICE = "demo-full";
const TZ = 330;
const DAY = 864e5;
let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const between = (a, b) => a + rnd() * (b - a);
const istDayStartUtc = (off = 0) => { const n = new Date(Date.now() + TZ * 6e4); return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()) - TZ * 6e4 + off * DAY; };
const at = (off, h) => new Date(istDayStartUtc(off) + h * 36e5);
const istDate = (d) => new Date(d.getTime() + TZ * 6e4).toISOString().slice(0, 10);
const isWeekend = (off) => { const w = new Date(istDayStartUtc(off) + 12 * 36e5 + TZ * 6e4).getUTCDay(); return w === 0 || w === 6; };
const nowH = () => (Date.now() - istDayStartUtc(0)) / 36e5;
const OFFICE = { latitude: 11.0285, longitude: 76.9905, address: "Astral Consulting, Avinashi Road, Peelamedu, Coimbatore, Tamil Nadu 641004" };
const HOME = { latitude: 11.009, longitude: 76.95, address: "R S Puram, Coimbatore, Tamil Nadu 641002" };
const jitter = (p, m = 0.0012) => ({ latitude: +(p.latitude + between(-m, m)).toFixed(6), longitude: +(p.longitude + between(-m, m)).toFixed(6), accuracy: Math.round(between(8, 35)), address: p.address });

// audits for the teams that had none: [code, client code, name, type, FY, manager, team, status, start, end, est hours, fee]
const AUDITS = [
    ["DEMO-T2601", "DEMO-002", "Internal audit · Procurement cycle", "Internal", "2026-27", "kavya.raman@astral.test", ["suresh.babu@astral.test", "pooja.iyer@astral.test", "vignesh.kumar@astral.test", "swathi.murugan@astral.test"], "Fieldwork", -18, 12, 120, 240000],
    ["DEMO-T2602", "DEMO-004", "Stock audit · Q3 physical verification", "Stock", "2026-27", "kavya.raman@astral.test", ["meera.krishnan@astral.test", "harish.kumar@astral.test", "anitha.selvam@astral.test", "gokul.raj@astral.test"], "Review", -30, 3, 80, 165000],
    ["DEMO-T2603", "DEMO-006", "Statutory audit · FY 2025-26", "Statutory", "2025-26", "deepak.rao@astral.test", ["ramya.shankar@astral.test", "karan.mehta@astral.test", "lavanya.prakash@astral.test", "ajay.nair@astral.test"], "Reporting", -45, -2, 200, 450000],
    ["DEMO-T2604", "DEMO-006", "Tax audit · FY 2025-26", "Tax", "2025-26", "deepak.rao@astral.test", ["prakash.iyer@astral.test", "divakar.subramani@astral.test", "keerthana.venkat@astral.test", "sanjay.thomas@astral.test"], "Planning", 2, 35, 60, 120000],
    ["DEMO-T2605", "DEMO-003", "Concurrent audit · September", "Concurrent", "2026-27", "manager@astral.test", ["arjun.menon@astral.test", "nisha.pillai@astral.test", "rohit.das@astral.test", "fathima.banu@astral.test"], "Completed", -70, -25, 90, 180000],
];
const NEW_CLIENT = { clientCode: "DEMO-006", name: "Deccan Precision Tools Pvt Ltd", entityType: "Company", industry: "Engineering", city: "Bengaluru", state: "Karnataka", contactPerson: "S. Raghavendra", phone: "+91 98450 66221", email: "accounts@deccanprecision.example", gstin: "29AAGCD4521K1ZQ", pan: "AAGCD4521K", address: "Peenya Industrial Area, Phase 2, Bengaluru 560058" };
const NOTES = ["Vouching of purchase invoices", "Stock count at the main warehouse", "Walkthrough with the accounts team", "Reviewed bank reconciliations", "Fixed asset register testing", "Discussed observations with the CFO", "Payroll sample testing", "GST returns reconciliation"];
// how far along the checklist is for each status
const DONE_UPTO = { Planning: 2, Fieldwork: 6, Review: 10, Reporting: 13, Completed: 17, "On Hold": 5 };


// Charges by audit type, and one forgotten timer waiting for review.
const CHARGE_PLANS = {
    Statutory: (fee) => [{ type: "Fixed fee", label: "Statutory audit fee", rate: fee, quantity: 1 }, { type: "Expenses", label: "Out-of-pocket expenses (at actuals)", rate: 0, quantity: 1 }],
    Internal: () => [{ type: "Monthly retainer", label: "Internal audit retainer", rate: 40000, quantity: 6 }, { type: "Expenses", label: "Travel to client sites (at actuals)", rate: 0, quantity: 1 }],
    Stock: () => [{ type: "Per visit", label: "Physical verification visits", rate: 8000, quantity: 6 }, { type: "Fixed fee", label: "Stock audit report", rate: 45000, quantity: 1 }],
    Concurrent: () => [{ type: "Monthly retainer", label: "Concurrent audit — monthly", rate: 30000, quantity: 12 }],
    Tax: (fee) => [{ type: "Milestone", label: "Tax audit report (Form 3CD) filed", rate: Math.round(fee * 0.7), quantity: 1 }, { type: "Milestone", label: "Assessment support", rate: Math.round(fee * 0.3), quantity: 1 }],
    GST: () => [{ type: "Hourly", label: "GST audit — professional time", rate: 2200, quantity: 60 }],
};
const seedCharges = async () => {
    let n = 0;
    for (const a of await AuditEngagement.find({ auditCode: /^DEMO-/, isDeleted: false, "charges.0": { $exists: false } })) {
        const plan = (CHARGE_PLANS[a.auditType] || CHARGE_PLANS.Statutory)(a.fee || (a.estimatedHours || 60) * 2500);
        a.charges = plan.map((c) => ({ ...c, active: true }));
        a.fee = plan.filter((c) => c.type !== "Expenses").reduce((t, c) => t + c.rate * (c.quantity || 1), 0);
        await a.save(); n++;
    }
    // a timer someone forgot to stop: auto-stopped after 10h, waiting for the manager's review
    const gst = await AuditEngagement.findOne({ auditCode: "DEMO-T2601" }).lean();
    const pooja = await Employee.findOne({ email: "pooja.iyer@astral.test" }).lean();
    if (gst && pooja && !(await AuditTimeLog.exists({ auditId: gst._id, employeeId: pooja._id, autoStopped: true, needsReview: true }))) {
        const start = at(-2, 9.5), end = new Date(start.getTime() + 10 * 36e5);
        await AuditTimeLog.create({ auditId: gst._id, employeeId: pooja._id, startTime: start, endTime: end, durationMinutes: 600, originalMinutes: 600, autoStopped: true, needsReview: true, reviewReason: "ran 10 hours without being stopped", note: `${TAG} Vouching purchase invoices (stopped automatically)`, startLocation: { ...jitter(OFFICE) } });
    }
    return n;
};

const seedRun = async () => {
    const emps = await Employee.find({ status: "Active" }).select("_id email firstName lastName designation manager").lean();
    const E = (email) => emps.find((e) => e.email === email);
    const out = {};

    // 1. the firm's billing details
    const s = (await CompanySettings.findOne()) || (await CompanySettings.create({ companyName: "Astral Consulting Limited" }));
    if (!s.billing?.gstin) {
        s.billing = { ...(s.billing?.toObject?.() || {}), legalName: "Astral Consulting Limited", address: "3rd Floor, Lakshmi Towers, Avinashi Road, Peelamedu, Coimbatore 641004", state: "Tamil Nadu", stateCode: "33", gstin: "33AAECA1982L1Z5", pan: "AAECA1982L", email: "accounts@astralconsulting.example", phone: "+91 422 456 7890", sacCode: "998221", gstRate: 18, invoicePrefix: "ACL", paymentTermsDays: 15, bank: { name: "HDFC Bank", accountName: "Astral Consulting Limited", accountNo: "50200012345678", ifsc: "HDFC0001234", branch: "Avinashi Road, Coimbatore" }, terms: "Payment due within 15 days. Please quote the invoice number with your payment. TDS, if deducted u/s 194J, must be deposited and Form 16A shared." };
        s.markModified("billing"); await s.save(); out.billing = "set";
    }

    // 2. clients: states for GST, one out-of-state client (IGST)
    for (const [code, state] of [["DEMO-001", "Tamil Nadu"], ["DEMO-002", "Tamil Nadu"], ["DEMO-003", "Tamil Nadu"], ["DEMO-004", "Tamil Nadu"], ["DEMO-005", "Tamil Nadu"]]) await AuditClient.updateOne({ clientCode: code, $or: [{ state: "" }, { state: { $exists: false } }] }, { $set: { state } });
    const creator = E("director@astral.test") || emps[0];
    if (!(await AuditClient.exists({ clientCode: NEW_CLIENT.clientCode }))) await AuditClient.create({ ...NEW_CLIENT, notes: `${TAG} sample client`, createdBy: creator._id });

    // 3. audits for every team, with checklist progress and time logs
    const auditDocs = [];
    for (const [code, cc, name, type, fy, mgr, team, status, st, en, est, fee] of AUDITS) {
        const c = await AuditClient.findOne({ clientCode: cc }).lean();
        if (!c || !E(mgr)) continue;
        const doc = await AuditEngagement.findOneAndUpdate({ auditCode: code }, {
            auditCode: code, clientId: c._id, clientName: c.name, engagementName: name, auditType: type, financialYear: fy, description: `${TAG} Sample engagement for the team.`,
            auditManager: E(mgr)._id, teamMembers: team.map((t) => E(t)?._id).filter(Boolean), startDate: at(st, 0), endDate: at(en, 0), estimatedHours: est, fee, priority: en < 7 ? "High" : "Medium", status, isDeleted: false, createdBy: creator._id,
        }, { upsert: true, returnDocument: "after" });
        auditDocs.push({ doc, team, status, client: c });
    }
    // checklist progress for every demo audit, by status
    const allDemo = await AuditEngagement.find({ auditCode: /^DEMO-/, isDeleted: false });
    for (const a of allDemo) {
        const upto = DONE_UPTO[a.status] ?? 0;
        a.milestones = MILESTONES.map(([key, label, stage], i) => {
            const billing = ["invoice", "payment"].includes(key);
            const done = billing ? false : i < upto;
            return { key, label, stage, done, doneAt: done ? new Date(Date.now() - (upto - i) * 2 * DAY) : null, doneBy: done ? a.auditManager : null };
        });
        if (!a.fee) a.fee = (a.estimatedHours || 60) * 2500;
        await a.save();
    }
    out.audits = auditDocs.length;

    // time logs for the new team audits (last 3 weeks; a couple running now)
    await AuditTimeLog.deleteMany({ auditId: { $in: auditDocs.map((a) => a.doc._id) } });
    const logs = [];
    const workedAt = new Map();
    let running = 0;
    for (let d = -20; d <= 0; d++) {
        if (isWeekend(d)) continue;
        for (const a of auditDocs.filter((x) => ["Fieldwork", "Review", "Reporting"].includes(x.status) || (x.status === "Completed" && d < -25))) {
            for (const email of a.team) {
                const e = E(email); if (!e || rnd() < 0.3 || workedAt.has(`${email}|${d}`)) continue;
                workedAt.set(`${email}|${d}`, true);
                const place = { latitude: 11.0 + rnd() * 0.08, longitude: 76.95 + rnd() * 0.08, address: `${a.client.name}, ${a.client.city || "Coimbatore"}` };
                const s1 = between(10, 10.8), e1 = s1 + between(2, 3.2), s2 = between(14, 14.6), e2 = s2 + between(1.5, 3);
                for (const [x, y] of [[s1, e1], [s2, e2]]) {
                    if (d === 0 && x > nowH() - 0.2) continue;
                    const live = d === 0 && y > nowH() && running < 3 && nowH() < 19;
                    if (d === 0 && y > nowH() && !live) continue;
                    if (live) running++;
                    const start = at(d, x), end = live ? null : at(d, y);
                    logs.push({ auditId: a.doc._id, employeeId: e._id, startTime: start, endTime: end, durationMinutes: end ? Math.round((end - start) / 6e4) : 0, startLocation: jitter(place), stopLocation: end ? jitter(place) : undefined, note: end ? `${TAG} ${pick(NOTES)}` : "" });
                }
            }
        }
    }
    if (logs.length) await AuditTimeLog.insertMany(logs);
    out.timeLogs = logs.length;

    // 4. attendance for everyone: last 30 days + today (skips days that already have a record)
    let att = 0;
    const leaveToday = new Set(["fathima.banu@astral.test", "lavanya.prakash@astral.test"].map((m) => String(E(m)?._id)));
    for (let d = -30; d <= 0; d++) {
        if (isWeekend(d)) continue;
        for (const p of emps) {
            if (d === 0 && leaveToday.has(String(p._id))) continue;
            if (rnd() < (d === 0 ? 0.18 : 0.06)) continue;
            const inH = between(9.0, 10.3);
            if (d === 0 && inH > nowH()) continue;
            const checkIn = at(d, inH);
            const attendanceDate = istDate(checkIn);
            if (await Attendance.exists({ employeeId: p._id, attendanceDate })) continue;
            const r = rnd();
            const mode = workedAt.has(`${p.email}|${d}`) ? "Client" : r < 0.12 ? "Home" : r < 0.17 ? "Field" : "Office";
            const place = mode === "Home" ? HOME : mode === "Office" ? OFFICE : { latitude: 11.02 + rnd() * 0.05, longitude: 76.96 + rnd() * 0.05, address: "Client site, Coimbatore" };
            const outH = between(17.5, 19.2);
            const stillIn = d === 0 && (outH > nowH() || rnd() < 0.65) && nowH() < 20;
            const checkOut = stillIn ? null : at(d, Math.min(outH, d === 0 ? nowH() - 0.1 : outH));
            const late = Math.max(0, Math.round((inH - 9.75) * 60));
            const hours = checkOut ? +((checkOut - checkIn) / 36e5).toFixed(2) : 0;
            const pin = { time: checkIn, ...jitter(place), device: DEVICE };
            const pout = checkOut ? { time: checkOut, ...jitter(place), device: DEVICE } : { time: null };
            await Attendance.create({ employeeId: p._id, attendanceDate, attendanceType: mode, checkIn: pin, checkOut: pout, sessions: [{ mode, checkIn: pin, checkOut: pout }], workingHours: hours, lateByMinutes: late, status: checkOut && hours < 4.5 ? "Half Day" : late > 0 ? "Late" : "Present" });
            att++;
        }
    }
    out.attendance = att;

    // 5. invoices in every state
    const firm = (await CompanySettings.findOne()).billing;
    const fyOf = (dt) => { const y = dt.getMonth() >= 3 ? dt.getFullYear() : dt.getFullYear() - 1; return `${y}-${String((y + 1) % 100).padStart(2, "0")}`; };
    const mkInvoice = async (code, { pct, daysAgo, status, paidPct = 0, tds = false, extra = null }) => {
        const a = await AuditEngagement.findOne({ auditCode: code }).lean();
        if (!a || (await Invoice.exists({ auditId: a._id, notes: new RegExp(`^\\${TAG} ${status}`) }))) return 0;
        const c = await AuditClient.findById(a.clientId).lean();
        const inter = !!(c?.state && c.state !== firm.state);
        const lines = [{ description: `Professional fees — ${a.auditType} audit${a.financialYear ? ` for FY ${a.financialYear}` : ""} (${a.engagementName || ""})${pct < 1 ? ` · ${Math.round(pct * 100)}% milestone` : ""}`, sac: "998221", kind: "Fee", qty: 1, rate: Math.round(a.fee * pct), amount: Math.round(a.fee * pct), taxable: true }];
        if (extra) lines.push({ description: "Out-of-pocket expenses — travel and conveyance", sac: "998221", kind: "Expense", qty: 1, rate: extra, amount: extra, taxable: true });
        const taxable = lines.reduce((t, l) => t + l.amount, 0);
        const tax = Math.round(taxable * 0.18 * 100) / 100;
        const total = Math.round(taxable + tax);
        const invoiceDate = new Date(Date.now() - daysAgo * DAY);
        const doc = { auditId: a._id, clientId: a.clientId, billTo: { name: c?.name || a.clientName, address: c?.address || "", city: c?.city || "", state: c?.state || "", gstin: c?.gstin || "", pan: c?.pan || "", contactPerson: c?.contactPerson || "", email: c?.email || "" }, invoiceDate, dueDate: new Date(invoiceDate.getTime() + 15 * DAY), lines, gstRate: 18, interState: inter, subtotal: taxable, taxableValue: taxable, cgst: inter ? 0 : tax / 2, sgst: inter ? 0 : tax / 2, igst: inter ? tax : 0, roundOff: Math.round((total - taxable - tax) * 100) / 100, total, status, notes: `${TAG} ${status} sample invoice`, createdBy: creator._id, payments: [] };
        if (status !== "Draft") {
            const fy = fyOf(invoiceDate);
            const last = await Invoice.findOne({ fy, seq: { $ne: null } }).sort({ seq: -1 }).select("seq").lean();
            doc.seq = (last?.seq || 0) + 1; doc.fy = fy; doc.invoiceNo = `${firm.invoicePrefix || "ACL"}/${fy}/${String(doc.seq).padStart(4, "0")}`; doc.issuedAt = invoiceDate; doc.issuedBy = creator._id;
        }
        if (paidPct) {
            const t = tds ? Math.round(taxable * 0.1) : 0;
            const amt = Math.round(total * paidPct) - t;
            doc.payments.push({ date: new Date(invoiceDate.getTime() + 12 * DAY), amount: amt, tds: t, mode: pick(["Bank transfer", "Cheque", "UPI"]), reference: `UTR${Math.floor(rnd() * 1e10)}`, recordedBy: (E("accounts.head@astral.test") || creator)._id });
        }
        await Invoice.create(doc);
        if (status !== "Draft") await AuditEngagement.updateOne({ _id: a._id, "milestones.key": "invoice" }, { $set: { "milestones.$.done": true, "milestones.$.doneAt": invoiceDate } });
        if (status === "Paid") await AuditEngagement.updateOne({ _id: a._id, "milestones.key": "payment" }, { $set: { "milestones.$.done": true, "milestones.$.doneAt": new Date(invoiceDate.getTime() + 12 * DAY) } });
        return 1;
    };
    let invs = 0;
    invs += await mkInvoice("DEMO-SA-2508", { pct: 1, daysAgo: 48, status: "Paid", paidPct: 1, tds: true });
    invs += await mkInvoice("DEMO-T2605", { pct: 1, daysAgo: 30, status: "Paid", paidPct: 1, tds: true, extra: 4200 });
    invs += await mkInvoice("DEMO-SA-2604", { pct: 0.5, daysAgo: 38, status: "Partly paid", paidPct: 0.6 });
    invs += await mkInvoice("DEMO-T2603", { pct: 0.6, daysAgo: 26, status: "Issued" }); // overdue (IGST, out of state)
    invs += await mkInvoice("DEMO-SA-2601", { pct: 0.4, daysAgo: 6, status: "Issued" });
    invs += await mkInvoice("DEMO-IA-2603", { pct: 0.5, daysAgo: 1, status: "Draft" });
    out.invoices = invs;

    // 6. requests: leave, expenses, corrections, tickets
    const mk = async (Model, filter, doc) => ((await Model.exists(filter)) ? 0 : (await Model.create(doc), 1));
    let req = 0;
    for (const [m, type, from, to, days, status, reason] of [
        ["fathima.banu@astral.test", "Casual Leave", 0, 0, 1, "Approved", "Sister's wedding"], ["lavanya.prakash@astral.test", "Sick Leave", 0, 1, 2, "Approved", "Fever"],
        ["vignesh.kumar@astral.test", "Earned Leave", 4, 6, 3, "Pending", "Trip to Madurai"], ["karan.mehta@astral.test", "Casual Leave", 2, 2, 1, "Pending", "Bank work"],
        ["swathi.murugan@astral.test", "Casual Leave", -9, -9, 1, "Rejected", "Personal — clashed with stock count"], ["harish.kumar@astral.test", "Work From Home", 1, 1, 1, "Pending", "Plumber visit at home"],
        ["nisha.pillai@astral.test", "Earned Leave", -15, -13, 3, "Approved", "Family function in Kerala"],
    ]) if (E(m)) req += await mk(Leave, { employeeId: E(m)._id, reason: `${TAG} ${reason}` }, { employeeId: E(m)._id, leaveType: type, fromDate: at(from, 0), toDate: at(to, 0), totalDays: days, reason: `${TAG} ${reason}`, status });
    for (const [m, cat, amt, desc, status] of [
        ["pooja.iyer@astral.test", "Travel", 920, "Cab to Kaveri Agro, Thudiyalur (3 days)", "Pending"], ["anitha.selvam@astral.test", "Food", 450, "Lunch during stock count", "Pending"],
        ["ramya.shankar@astral.test", "Accommodation", 6800, "Hotel in Bengaluru — Deccan Precision fieldwork (2 nights)", "Pending"], ["ajay.nair@astral.test", "Travel", 2400, "Bus tickets Coimbatore–Bengaluru", "Approved"],
        ["suresh.babu@astral.test", "Client Entertainment", 1800, "Closing meeting lunch with client finance team", "Reimbursed"],
    ]) if (E(m)) req += await mk(Expense, { employeeId: E(m)._id, description: `${TAG} ${desc}` }, { employeeId: E(m)._id, category: cat, amount: amt, expenseDate: at(-3, 12), description: `${TAG} ${desc}`, status });
    for (const [m, reason] of [["gokul.raj@astral.test", "Forgot to check out after the stock count"], ["rohit.das@astral.test", "Phone switched off at client site — checked in late"]])
        if (E(m)) req += await mk(Regularization, { employeeId: E(m)._id, reason: `${TAG} ${reason}` }, { employeeId: E(m)._id, attendanceDate: istDate(at(-2, 12)), requestedCheckIn: "09:30", requestedCheckOut: "18:30", reason: `${TAG} ${reason}`, status: "Pending" });
    for (const [m, subject, cat, pr, st] of [["keerthana.venkat@astral.test", "Payslip shows wrong PF amount", "Payroll and Salary", "High", "Open"], ["sanjay.thomas@astral.test", "Laptop battery drains fast", "IT and System Access", "Medium", "In Progress"], ["divakar.subramani@astral.test", "Leave balance not updated after comp-off", "Leave and Holidays", "Low", "Resolved"]])
        if (E(m)) req += await mk(Ticket, { employeeId: E(m)._id, subject: `${TAG} ${subject}` }, { employeeId: E(m)._id, subject: `${TAG} ${subject}`, category: cat, description: `${TAG} ${subject}. Please check.`, priority: pr, status: st });
    out.requests = req;

    // 7. a chat group per team (one-to-many sharing uses these)
    const groups = [];
    for (const [mgr, name] of [["manager@astral.test", "Statutory Audit · Team A"], ["kavya.raman@astral.test", "Internal Audit · Kavya's team"], ["deepak.rao@astral.test", "Advisory · Deepak's team"]]) {
        const m = E(mgr); if (!m) continue;
        const team = emps.filter((e) => { let cur = e; for (let i = 0; i < 6 && cur; i++) { if (String(cur.manager) === String(m._id)) return true; cur = emps.find((x) => String(x._id) === String(cur.manager)); } return false; });
        const participants = [m._id, ...team.map((t) => t._id)];
        let g = await Conversation.findOne({ type: "group", name });
        if (!g) g = await Conversation.create({ type: "group", name, description: `${TAG} team group`, participants, admins: [m._id], createdBy: m._id, members: participants.map((u) => ({ user: u })) });
        groups.push({ g, m, team });
    }
    out.groups = groups.length;

    // 8. shared files and folders (small sample documents)
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "sharedFiles" });
    const store = (name, mime, text) => new Promise((resolve, reject) => { const st = bucket.openUploadStream(name, { contentType: mime }); st.on("error", reject).on("finish", () => resolve({ id: st.id, size: Buffer.byteLength(text) })); st.end(Buffer.from(text)); });
    const pdf = (title, body) => { const t = `BT /F1 18 Tf 72 740 Td (${title}) Tj ET BT /F1 11 Tf 72 712 Td (${body}) Tj ET`; return `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length ${t.length}>>stream\n${t}\nendstream endobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF`; };
    let files = 0;
    const addFile = async (owner, folder, name, mime, content, shares = [], groupIds = []) => {
        if (await SharedFile.exists({ owner: owner._id, name, description: TAG })) return;
        const { id, size } = await store(name, mime, content);
        await SharedFile.create({ name, size, mime, gridId: id, owner: owner._id, folder, description: TAG, shares: shares.map((s) => ({ employee: s._id, permission: "view", sharedBy: owner._id })), groups: groupIds.map((g) => ({ group: g, permission: "view", sharedBy: owner._id })), activity: [{ by: owner._id, action: "uploaded" }, ...(shares.length || groupIds.length ? [{ by: owner._id, action: "shared" }] : [])] });
        files++;
    };
    for (const { g, m, team } of groups) {
        let folder = await FileFolder.findOne({ owner: m._id, name: "Working papers" });
        if (!folder) folder = await FileFolder.create({ name: "Working papers", owner: m._id, color: "#1e40af", groups: [{ group: g._id, permission: "edit", sharedBy: m._id }] });
        await addFile(m, folder._id, "Audit programme.pdf", "application/pdf", pdf("Audit programme", `${g.name} - scope, risks and procedures`));
        await addFile(m, folder._id, "Sampling plan.csv", "text/csv", "Area,Population,Sample,Method\nPurchases,1240,45,Monetary unit\nSales,980,40,Random\nPayroll,62,15,Random\n");
        await addFile(m, null, "Team review checklist.pdf", "application/pdf", pdf("Review checklist", "Points to clear before partner review"), [], [g._id]);
        const lead = team[0];
        if (lead) await addFile(lead, null, "Fieldwork notes.txt", "text/plain", "Day 1: walkthrough with accounts team.\nDay 2: vouching of purchase invoices.\nOpen points: 3 GRNs missing.\n", [m]);
    }
    const hr = E("hr.head@astral.test");
    if (hr) await addFile(hr, null, "Leave policy 2026.pdf", "application/pdf", pdf("Leave policy 2026", "Casual 12, sick 12, earned 18 days a year"), emps.filter((e) => ["manager@astral.test", "kavya.raman@astral.test", "deepak.rao@astral.test", "senior.manager@astral.test"].includes(e.email)));
    out.files = files;

    // 9b. charges on every demo audit (different kinds of work, different kinds of charge)
    out.charges = await seedCharges();

    // 9. tasks: close a few finished ones with a note, leave the rest Done-ready
    const done = await Task.find({ status: "Done", closedAt: null, projectId: { $ne: null } }).limit(4);
    let closed = 0;
    for (const t of done.slice(0, 2)) {
        t.closedAt = new Date(Date.now() - DAY); t.closedBy = t.createdBy; t.closeNote = `${TAG} Completed and reviewed — signed off by the lead.`;
        t.history.push({ by: t.createdBy, action: "closed", from: "Done", to: "Closed", note: t.closeNote });
        t.comments.push({ employeeId: t.createdBy, message: `Closed: ${t.closeNote}` });
        await t.save(); closed++;
    }
    out.closedTasks = closed;
    return out;
};

const cleanRun = async () => {
    const audits = await AuditEngagement.find({ auditCode: /^DEMO-T/ }).select("_id").lean();
    const ids = audits.map((a) => a._id);
    const files = await SharedFile.find({ description: TAG });
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "sharedFiles" });
    for (const f of files) await bucket.delete(f.gridId).catch(() => {});
    const r = {
        invoices: (await Invoice.deleteMany({ notes: /^\[Demo\]/ })).deletedCount,
        timeLogs: (await AuditTimeLog.deleteMany({ auditId: { $in: ids } })).deletedCount,
        audits: (await AuditEngagement.deleteMany({ _id: { $in: ids } })).deletedCount,
        attendance: (await Attendance.deleteMany({ "checkIn.device": DEVICE })).deletedCount,
        files: (await SharedFile.deleteMany({ description: TAG })).deletedCount,
        folders: (await FileFolder.deleteMany({ name: "Working papers" })).deletedCount,
        groups: (await Conversation.deleteMany({ description: `${TAG} team group` })).deletedCount,
        leave: (await Leave.deleteMany({ reason: /^\[Demo\]/, employeeId: { $in: (await Employee.find({ email: /@astral\.test$/ }).select("_id").lean()).map((e) => e._id) } })).deletedCount,
    };
    await AuditClient.deleteOne({ clientCode: NEW_CLIENT.clientCode });
    await Task.updateMany({ closeNote: /^\[Demo\]/ }, { $set: { closedAt: null, closedBy: null, closeNote: "" } });
    console.log("Removed", r);
};

const cmd = process.argv[2];
if (!["seed", "clean", "charges"].includes(cmd)) { console.log("Usage: node scripts/demoFull.js seed | clean"); process.exit(1); }
await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
try { if (cmd === "seed") console.log("Seeded", await seedRun()); else if (cmd === "charges") console.log("Charges", await seedCharges()); else await cleanRun(); } finally { await mongoose.disconnect(); }
