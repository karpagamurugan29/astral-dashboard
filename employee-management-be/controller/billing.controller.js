import mongoose from "mongoose";
import InvoiceModel from "../models/invoiceModel.js";
import AuditEngagementModel from "../models/auditEngagementModel.js";
import AuditClientModel from "../models/auditClientModel.js";
import AuditTimeLogModel from "../models/auditTimeLogModel.js";
import CompanySettings from "../models/CompanySettingsModel.js";
import employeeModel from "../models/employeeModel.js";
import { canSeeMoney, canBill, fyOf, rupeesInWords } from "../utils/money.js";
import { scopeOf } from "../utils/hierarchy.js";
import { logAudit } from "../utils/audit.js";
import { notify } from "../utils/notify.js";
import { closeStaleTimers } from "../utils/timerGuard.js";

/* --------------------------------------------------------------------------
   Audit billing: the firm's billing details, tax invoices raised against audit
   engagements (GST: CGST + SGST within the state, IGST outside it), payments
   and TDS, and the economics of each engagement (fee, billed, received, hours,
   cost of time, margin). Money is for the top level only (utils/money.js).
   -------------------------------------------------------------------------- */

const httpError = (status, message) => Object.assign(new Error(message), { status });
const fail = (res, err) => res.status(err.status || 500).json({ success: false, message: err.message });
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const idStr = (v) => (v?._id ?? v)?.toString?.() ?? null;
const DAY_HOURS = () => Number(process.env.STANDARD_DAY_HOURS) || 8;
const hourlyCost = (salary) => (Number(salary) || 0) / (22 * DAY_HOURS());
const minutesOf = (l, now = Date.now()) => (l.endTime ? l.durationMinutes || Math.round((new Date(l.endTime) - new Date(l.startTime)) / 60000) : Math.round((now - new Date(l.startTime)) / 60000));
const LIVE = ["Issued", "Partly paid", "Paid"];

const settingsDoc = async () => (await CompanySettings.findOne()) || (await CompanySettings.create({ companyName: "Astral Consulting Limited" }));
const billingOf = async () => { const s = await settingsDoc(); return s.billing?.toObject ? s.billing.toObject() : s.billing || {}; };
const mustSeeMoney = async (req) => { if (!(await canSeeMoney(req))) throw httpError(403, "Fees and billing are visible to the firm's leadership and Accounts only."); };
const mustBill = async (req) => { if (!(await canBill(req))) throw httpError(403, "Only the firm's leadership and Accounts can raise or change invoices."); };

const settled = (inv) => r2((inv.payments || []).reduce((s, p) => s + (p.amount || 0) + (p.tds || 0), 0));
const balanceOf = (inv) => (inv.status === "Cancelled" || inv.status === "Draft" ? 0 : r2(inv.total - settled(inv)));

// work out every amount from the lines (never trust totals from the browser)
const compute = (inv) => {
    inv.lines = (inv.lines || []).filter((l) => String(l.description || "").trim()).map((l) => {
        const qty = Number(l.qty) || 0, rate = Number(l.rate) || 0;
        return { ...l, qty, rate, amount: r2(l.kind === "Fee" && !qty ? rate : qty * rate) };
    });
    inv.subtotal = r2(inv.lines.reduce((s, l) => s + l.amount, 0));
    inv.taxableValue = r2(inv.lines.filter((l) => l.taxable !== false).reduce((s, l) => s + l.amount, 0));
    const tax = r2((inv.taxableValue * (Number(inv.gstRate) || 0)) / 100);
    if (inv.interState) { inv.igst = tax; inv.cgst = 0; inv.sgst = 0; } else { inv.igst = 0; inv.cgst = r2(tax / 2); inv.sgst = r2(tax - r2(tax / 2)); }
    const raw = inv.subtotal + inv.cgst + inv.sgst + inv.igst;
    inv.total = Math.round(raw);
    inv.roundOff = r2(inv.total - raw);
    return inv;
};

const view = (inv) => {
    const o = inv.toObject ? inv.toObject() : inv;
    const paid = settled(o);
    const balance = balanceOf(o);
    const overdueDays = balance > 0 && o.dueDate && new Date(o.dueDate) < new Date() ? Math.floor((Date.now() - new Date(o.dueDate)) / 864e5) : 0;
    return { ...o, paid, balance, overdueDays, amountInWords: rupeesInWords(o.total) };
};

/* ---------------- billing settings ---------------- */
export const getBillingSettings = async (req, res) => {
    try { await mustSeeMoney(req); return res.status(200).json({ success: true, data: await billingOf(), canBill: await canBill(req) }); } catch (err) { return fail(res, err); }
};
export const updateBillingSettings = async (req, res) => {
    try {
        await mustBill(req);
        const s = await settingsDoc();
        const b = req.body || {};
        const keep = ["legalName", "address", "state", "stateCode", "gstin", "pan", "email", "phone", "sacCode", "invoicePrefix", "terms"];
        keep.forEach((k) => { if (b[k] !== undefined) s.billing[k] = String(b[k]).trim(); });
        if (b.gstRate !== undefined) s.billing.gstRate = Math.max(0, Math.min(28, Number(b.gstRate) || 0));
        if (b.paymentTermsDays !== undefined) s.billing.paymentTermsDays = Math.max(0, Math.min(180, Number(b.paymentTermsDays) || 0));
        if (b.bank) ["name", "accountName", "accountNo", "ifsc", "branch"].forEach((k) => { if (b.bank[k] !== undefined) s.billing.bank[k] = String(b.bank[k]).trim(); });
        s.markModified("billing");
        await s.save();
        logAudit(req, "settings.update", "Updated billing details", { type: "CompanySettings", id: s._id });
        return res.status(200).json({ success: true, message: "Billing details saved.", data: s.billing });
    } catch (err) { return fail(res, err); }
};

/* ---------------- engagement economics ---------------- */
// fee, billed, received, outstanding, hours vs estimate, cost of time, margin — for one or many audits
const economicsFor = async (audits) => {
    const ids = audits.map((a) => a._id);
    const [invoices, logs] = await Promise.all([
        InvoiceModel.find({ auditId: { $in: ids }, status: { $ne: "Cancelled" } }).lean(),
        AuditTimeLogModel.find({ auditId: { $in: ids } }).select("auditId employeeId startTime endTime durationMinutes").lean(),
    ]);
    const people = await employeeModel.find({ _id: { $in: [...new Set(logs.map((l) => idStr(l.employeeId)))] } }).select("salary").lean();
    const rate = new Map(people.map((p) => [idStr(p._id), hourlyCost(p.salary)]));
    const now = Date.now();
    return new Map(audits.map((a) => {
        const inv = invoices.filter((i) => idStr(i.auditId) === idStr(a._id));
        const live = inv.filter((i) => LIVE.includes(i.status));
        const l = logs.filter((x) => idStr(x.auditId) === idStr(a._id));
        const minutes = l.reduce((s, x) => s + minutesOf(x, now), 0);
        const cost = l.reduce((s, x) => s + (minutesOf(x, now) / 60) * (rate.get(idStr(x.employeeId)) || 0), 0);
        const billedTaxable = live.reduce((s, i) => s + (i.taxableValue || 0), 0);
        const billed = live.reduce((s, i) => s + (i.total || 0), 0);
        const received = live.reduce((s, i) => s + settled(i), 0);
        const hours = minutes / 60;
        const fee = Number(a.fee) || 0;
        return [idStr(a._id), {
            fee, billedTaxable: r2(billedTaxable), billed: r2(billed), received: r2(received), outstanding: r2(billed - received),
            unbilled: r2(Math.max(0, fee - billedTaxable)), drafts: inv.filter((i) => i.status === "Draft").length,
            hours: r2(hours), estimatedHours: a.estimatedHours || 0, cost: Math.round(cost),
            margin: fee ? Math.round(fee - cost) : null, marginPct: fee ? Math.round(((fee - cost) / fee) * 100) : null,
            effectiveRate: hours ? Math.round(fee / hours) : null, invoices: inv.length,
        }];
    }));
};

export const auditEconomics = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) throw httpError(404, "Audit not found.");
        await mustSeeMoney(req);
        const audit = await AuditEngagementModel.findOne({ _id: req.params.id, isDeleted: false }).lean();
        if (!audit) throw httpError(404, "Audit not found.");
        const econ = (await economicsFor([audit])).get(idStr(audit._id));
        const invoices = await InvoiceModel.find({ auditId: audit._id }).sort({ createdAt: -1 }).lean();
        return res.status(200).json({ success: true, data: { ...econ, invoiceList: invoices.map(view) }, canBill: await canBill(req) });
    } catch (err) { return fail(res, err); }
};

/* ---------------- invoices ---------------- */
export const listInvoices = async (req, res) => {
    try {
        await mustSeeMoney(req);
        const { status, clientId, auditId, fy, q } = req.query;
        const filter = {};
        const useRange = !fy;
        const { from, to } = useRange ? rangeOf(req.query) : { from: null, to: null };
        if (useRange) filter.invoiceDate = { $gte: from, $lte: to };
        if (status) filter.status = status;
        if (clientId && mongoose.isValidObjectId(clientId)) filter.clientId = clientId;
        if (auditId && mongoose.isValidObjectId(auditId)) filter.auditId = auditId;
        if (fy) filter.$or = [{ fy }, { fy: "", invoiceDate: { $gte: new Date(`${fy.slice(0, 4)}-04-01`), $lt: new Date(`${Number(fy.slice(0, 4)) + 1}-04-01`) } }];
        let invoices = (await InvoiceModel.find(filter).populate("auditId", "auditCode engagementName auditType financialYear status").sort({ invoiceDate: -1, createdAt: -1 }).limit(1000).lean()).map(view);
        if (q) { const t = String(q).toLowerCase(); invoices = invoices.filter((i) => `${i.invoiceNo || ""} ${i.billTo?.name || ""} ${i.auditId?.auditCode || ""} ${i.auditId?.engagementName || ""}`.toLowerCase().includes(t)); }

        // the year's picture, from every invoice in the selected financial year
        const live = invoices.filter((i) => LIVE.includes(i.status));
        const aging = { "0–30": 0, "31–60": 0, "61–90": 0, "90+": 0 };
        live.filter((i) => i.balance > 0).forEach((i) => {
            const d = i.overdueDays;
            aging[d <= 30 ? "0–30" : d <= 60 ? "31–60" : d <= 90 ? "61–90" : "90+"] += i.balance;
        });
        const byClient = new Map();
        live.forEach((i) => { const k = i.billTo?.name || "—"; const x = byClient.get(k) || { name: k, billed: 0, balance: 0 }; x.billed += i.total; x.balance += i.balance; byClient.set(k, x); });
        // fee still to bill on open engagements
        // stale timers are closed first, so the billable time below reads finished sessions
        const [scope] = await Promise.all([scopeOf(req), closeStaleTimers()]);
        const open = await AuditEngagementModel.find({ isDeleted: false, status: { $ne: "Cancelled" }, $or: [{ fee: { $gt: 0 } }, { "charges.0": { $exists: true } }] }).select("fee estimatedHours auditCode clientName engagementName status charges auditType financialYear clientId").lean();
        const pFrom = from || new Date(new Date().getFullYear(), new Date().getMonth(), 1), pTo = to || new Date();
        // each engagement's billable work is read independently — side by side, in the same order
        const [econ, bills] = await Promise.all([economicsFor(open), Promise.all(open.map((a) => billableFor(a, pFrom, pTo)))]);
        const unbilled = [];
        for (const [i, a] of open.entries()) {
            const b = bills[i];
            if (b.amount > 0 || b.warnings.length) unbilled.push({ _id: a._id, auditCode: a.auditCode, clientName: a.clientName, engagementName: a.engagementName, status: a.status, fee: a.fee, ...econ.get(idStr(a._id)), unbilled: Math.round(b.amount), lines: b.lines.map((l) => ({ description: l.description, amount: Math.round((l.qty || 1) * (l.rate || 0)) })), warnings: b.warnings, charges: (a.charges || []).length });
        }
        unbilled.sort((a, b) => b.unbilled - a.unbilled);
        return res.status(200).json({
            success: true,
            data: invoices,
            stats: {
                billed: r2(live.reduce((s, i) => s + i.total, 0)),
                received: r2(live.reduce((s, i) => s + i.paid, 0)),
                outstanding: r2(live.reduce((s, i) => s + i.balance, 0)),
                overdue: r2(live.filter((i) => i.overdueDays > 0).reduce((s, i) => s + i.balance, 0)),
                gst: r2(live.reduce((s, i) => s + i.cgst + i.sgst + i.igst, 0)),
                drafts: invoices.filter((i) => i.status === "Draft").length,
                aging,
                topClients: [...byClient.values()].sort((a, b) => b.billed - a.billed).slice(0, 6),
                unbilledTotal: r2(unbilled.reduce((s, a) => s + a.unbilled, 0)),
            },
            unbilled: unbilled.slice(0, 20),
            canBill: await canBill(req),
            fy: fy || fyOf(), range: useRange ? { from, to } : null,
            viewer: { firm: scope.firm, finance: scope.finance },
        });
    } catch (err) { return fail(res, err); }
};

export const getInvoice = async (req, res) => {
    try {
        await mustSeeMoney(req);
        if (!mongoose.isValidObjectId(req.params.id)) throw httpError(404, "Invoice not found.");
        const inv = await InvoiceModel.findById(req.params.id).populate("auditId", "auditCode engagementName auditType financialYear status fee").populate("payments.recordedBy", "firstName lastName").populate("issuedBy createdBy", "firstName lastName").lean();
        if (!inv) throw httpError(404, "Invoice not found.");
        return res.status(200).json({ success: true, data: view(inv), firm: await billingOf(), canBill: await canBill(req) });
    } catch (err) { return fail(res, err); }
};

// POST /invoices { auditId, lines?, invoiceDate?, notes? } — a draft, pre-filled from the audit
export const createInvoice = async (req, res) => {
    try {
        await mustBill(req);
        const b = req.body || {};
        if (!mongoose.isValidObjectId(b.auditId)) throw httpError(400, "Pick the audit you're billing.");
        const audit = await AuditEngagementModel.findOne({ _id: b.auditId, isDeleted: false }).lean();
        if (!audit) throw httpError(404, "Audit not found.");
        const client = audit.clientId ? await AuditClientModel.findById(audit.clientId).lean() : null;
        const firm = await billingOf();
        const econ = (await economicsFor([audit])).get(idStr(audit._id));
        const remaining = econ.unbilled || 0;
        const clientState = (client?.state || "").trim();
        const interState = b.interState !== undefined ? !!b.interState : !!(clientState && firm.state && clientState.toLowerCase() !== firm.state.toLowerCase());
        const invoiceDate = b.invoiceDate ? new Date(b.invoiceDate) : new Date();
        const lines = Array.isArray(b.lines) && b.lines.length ? b.lines : [{
            description: `Professional fees — ${audit.auditType} audit${audit.financialYear ? ` for FY ${audit.financialYear}` : ""}${audit.engagementName ? ` (${audit.engagementName})` : ""}`,
            sac: firm.sacCode || "998221", kind: "Fee", qty: 1, rate: remaining || audit.fee || 0, taxable: true,
        }];
        const inv = compute({
            auditId: audit._id, clientId: client?._id || audit.clientId || null,
            billTo: { name: client?.name || audit.clientName, address: client?.address || "", city: client?.city || "", state: clientState, gstin: client?.gstin || "", pan: client?.pan || "", contactPerson: client?.contactPerson || "", email: client?.email || "" },
            invoiceDate, dueDate: new Date(invoiceDate.getTime() + (firm.paymentTermsDays ?? 15) * 864e5),
            lines: lines.map((l) => ({ ...l, sac: l.sac || firm.sacCode || "998221" })), gstRate: firm.gstRate ?? 18, interState, notes: String(b.notes || "").slice(0, 1000),
            status: "Draft", createdBy: req.user.id,
        });
        const doc = await InvoiceModel.create(inv);
        logAudit(req, "invoice.create", `Drafted an invoice for ${audit.auditCode} (${audit.clientName})`, { type: "Invoice", id: doc._id });
        return res.status(201).json({ success: true, message: "Draft invoice created — check it and issue when ready.", data: view(doc) });
    } catch (err) { return fail(res, err); }
};

// PUT /invoices/:id — change a draft (lines, dates, bill-to, notes, IGST)
export const updateInvoice = async (req, res) => {
    try {
        await mustBill(req);
        const inv = await InvoiceModel.findById(req.params.id);
        if (!inv) throw httpError(404, "Invoice not found.");
        if (inv.status !== "Draft") throw httpError(409, "Issued invoices can't be edited — cancel it and raise a new one.");
        const b = req.body || {};
        if (Array.isArray(b.lines)) inv.lines = b.lines.slice(0, 30).map((l) => ({
            description: String(l.description || "").slice(0, 300), sac: String(l.sac || "998221"), kind: ["Fee", "Hours", "Expense", "Other", "Retainer", "Visit", "Milestone"].includes(l.kind) ? l.kind : "Other",
            qty: Number(l.qty) || 0, rate: Number(l.rate) || 0, taxable: l.taxable !== false,
            chargeId: mongoose.isValidObjectId(l.chargeId) ? l.chargeId : null, chargeType: String(l.chargeType || ""),
            months: Array.isArray(l.months) ? l.months.map(String) : [], visitDays: Array.isArray(l.visitDays) ? l.visitDays.map(String) : [],
            timeLogIds: Array.isArray(l.timeLogIds) ? l.timeLogIds.filter((x) => mongoose.isValidObjectId(x)) : [],
        }));
        if (b.invoiceDate) inv.invoiceDate = new Date(b.invoiceDate);
        if (b.dueDate) inv.dueDate = new Date(b.dueDate);
        if (b.interState !== undefined) inv.interState = !!b.interState;
        if (b.gstRate !== undefined) inv.gstRate = Math.max(0, Math.min(28, Number(b.gstRate) || 0));
        if (b.notes !== undefined) inv.notes = String(b.notes).slice(0, 1000);
        if (b.billTo) ["name", "address", "city", "state", "stateCode", "gstin", "pan", "contactPerson", "email"].forEach((k) => { if (b.billTo[k] !== undefined) inv.billTo[k] = String(b.billTo[k]).trim(); });
        const c = compute(inv.toObject());
        Object.assign(inv, { lines: c.lines, subtotal: c.subtotal, taxableValue: c.taxableValue, cgst: c.cgst, sgst: c.sgst, igst: c.igst, roundOff: c.roundOff, total: c.total });
        await inv.save();
        return res.status(200).json({ success: true, message: "Draft saved.", data: view(inv) });
    } catch (err) { return fail(res, err); }
};

// POST /invoices/:id/issue — give it the next number in the year's series and lock it
export const issueInvoice = async (req, res) => {
    try {
        await mustBill(req);
        const inv = await InvoiceModel.findById(req.params.id);
        if (!inv) throw httpError(404, "Invoice not found.");
        if (inv.status !== "Draft") throw httpError(409, "This invoice is already issued.");
        if (!inv.total || !inv.lines.length) throw httpError(400, "Add at least one line with an amount before issuing.");
        const firm = await billingOf();
        const logIds = inv.lines.flatMap((l) => l.timeLogIds || []);
        if (logIds.length) {
            const taken = await AuditTimeLogModel.countDocuments({ _id: { $in: logIds }, billedInvoice: { $ne: null } });
            if (taken) throw httpError(409, `${taken} of these time sessions were billed on another invoice — prepare the bill again.`);
        }
        const fy = fyOf(inv.invoiceDate);
        const last = await InvoiceModel.findOne({ fy, seq: { $ne: null } }).sort({ seq: -1 }).select("seq").lean();
        inv.seq = (last?.seq || 0) + 1;
        inv.fy = fy;
        inv.invoiceNo = `${firm.invoicePrefix || "INV"}/${fy}/${String(inv.seq).padStart(4, "0")}`;
        inv.status = "Issued"; inv.issuedAt = new Date(); inv.issuedBy = req.user.id;
        await inv.save();
        if (logIds.length) await AuditTimeLogModel.updateMany({ _id: { $in: logIds } }, { $set: { billedInvoice: inv._id } });
        // the audit moves along: tick "Invoice raised" on its checklist
        if (inv.auditId) await AuditEngagementModel.updateOne({ _id: inv.auditId, "milestones.key": "invoice" }, { $set: { "milestones.$.done": true, "milestones.$.status": "Completed", "milestones.$.doneAt": new Date(), "milestones.$.doneBy": req.user.id } });
        const audit = inv.auditId ? await AuditEngagementModel.findById(inv.auditId).select("auditManager auditCode").lean() : null;
        if (audit?.auditManager && idStr(audit.auditManager) !== idStr(req.user.id)) notify(audit.auditManager, "Invoice issued", `${inv.invoiceNo} for ${inv.billTo.name} (${audit.auditCode}).`, "Audit", `/audits/${inv.auditId}`);
        logAudit(req, "invoice.issue", `Issued invoice ${inv.invoiceNo} to ${inv.billTo.name} for ₹${inv.total}`, { type: "Invoice", id: inv._id });
        return res.status(200).json({ success: true, message: `Invoice ${inv.invoiceNo} issued.`, data: view(inv) });
    } catch (err) { return fail(res, err); }
};

// POST /invoices/:id/payments { amount, tds?, date?, mode?, reference? }
export const recordPayment = async (req, res) => {
    try {
        await mustBill(req);
        const inv = await InvoiceModel.findById(req.params.id);
        if (!inv) throw httpError(404, "Invoice not found.");
        if (!["Issued", "Partly paid"].includes(inv.status)) throw httpError(409, inv.status === "Draft" ? "Issue the invoice before recording a payment." : `This invoice is ${inv.status.toLowerCase()}.`);
        const amount = r2(req.body?.amount), tds = r2(req.body?.tds);
        if (amount < 0 || tds < 0 || amount + tds <= 0) throw httpError(400, "Enter the amount received (and any TDS deducted).");
        const due = r2(inv.total - settled(inv));
        if (amount + tds > due + 1) throw httpError(400, `That's more than the balance of ₹${due.toLocaleString("en-IN")}.`);
        inv.payments.push({ amount, tds, date: req.body?.date ? new Date(req.body.date) : new Date(), mode: req.body?.mode || "Bank transfer", reference: String(req.body?.reference || "").slice(0, 120), recordedBy: req.user.id });
        inv.status = settled(inv) >= inv.total - 1 ? "Paid" : "Partly paid";
        await inv.save();
        if (inv.status === "Paid" && inv.auditId) {
            await AuditEngagementModel.updateOne({ _id: inv.auditId, "milestones.key": "payment" }, { $set: { "milestones.$.done": true, "milestones.$.status": "Completed", "milestones.$.doneAt": new Date(), "milestones.$.doneBy": req.user.id } });
        }
        logAudit(req, "invoice.payment", `Recorded ₹${amount}${tds ? ` + TDS ₹${tds}` : ""} against ${inv.invoiceNo}`, { type: "Invoice", id: inv._id });
        return res.status(200).json({ success: true, message: inv.status === "Paid" ? `${inv.invoiceNo} is fully paid.` : `Payment recorded — ₹${r2(inv.total - settled(inv)).toLocaleString("en-IN")} still due.`, data: view(inv) });
    } catch (err) { return fail(res, err); }
};

// POST /invoices/:id/cancel { reason } — drafts are deleted, issued ones keep their number as cancelled
export const cancelInvoice = async (req, res) => {
    try {
        await mustBill(req);
        const inv = await InvoiceModel.findById(req.params.id);
        if (!inv) throw httpError(404, "Invoice not found.");
        if (inv.status === "Draft") { await inv.deleteOne(); return res.status(200).json({ success: true, message: "Draft discarded.", data: { deleted: true } }); }
        if (inv.status === "Cancelled") throw httpError(409, "Already cancelled.");
        if ((inv.payments || []).length) throw httpError(409, "Payments are recorded against this invoice — it can't be cancelled.");
        const reason = String(req.body?.reason || "").trim();
        if (reason.length < 3) throw httpError(400, "Say why the invoice is being cancelled.");
        inv.status = "Cancelled"; inv.cancelledAt = new Date(); inv.cancelReason = reason;
        await inv.save();
        await AuditTimeLogModel.updateMany({ billedInvoice: inv._id }, { $set: { billedInvoice: null } });
        logAudit(req, "invoice.cancel", `Cancelled invoice ${inv.invoiceNo}: ${reason}`, { type: "Invoice", id: inv._id });
        return res.status(200).json({ success: true, message: `${inv.invoiceNo} cancelled.`, data: view(inv) });
    } catch (err) { return fail(res, err); }
};

/* ---------------- engagement checklist ---------------- */
export const MILESTONES = [
    ["letter", "Engagement letter signed", "Planning"], ["team", "Team and budget assigned", "Planning"], ["risk", "Risk assessment and materiality", "Planning"], ["plan", "Audit plan approved", "Planning"],
    ["opening", "Opening meeting with the client", "Fieldwork"], ["walkthrough", "Walkthroughs and controls testing", "Fieldwork"], ["vouching", "Substantive testing and vouching", "Fieldwork"], ["confirm", "Third-party confirmations", "Fieldwork"],
    ["mgr-review", "Manager review of working papers", "Review"], ["points", "Review points cleared", "Review"], ["partner", "Partner review and sign-off", "Review"],
    ["draft", "Draft report shared with the client", "Reporting"], ["mrl", "Management representation letter received", "Reporting"], ["final", "Final report signed and issued", "Reporting"],
    ["invoice", "Invoice raised", "Billing"], ["payment", "Payment received", "Billing"], ["archive", "Working papers archived", "Billing"],
];
export const defaultMilestones = () => MILESTONES.map(([key, label, stage]) => ({ key, label, stage, done: false }));

/* ---------------- charges declared on an engagement ---------------- */
const CHARGE_TYPES = ["Fixed fee", "Hourly", "Monthly retainer", "Per visit", "Milestone", "Expenses"];
export const contractValue = (charges = []) => Math.round(charges.filter((c) => c.active !== false && c.type !== "Expenses").reduce((t, c) => t + (Number(c.rate) || 0) * (Number(c.quantity) || (c.type === "Fixed fee" ? 1 : 0)), 0));

// PUT /audits/:id/charges { charges: [...], syncFee? } — leadership / Accounts
export const setCharges = async (req, res) => {
    try {
        await mustBill(req);
        if (!mongoose.isValidObjectId(req.params.id)) throw httpError(404, "Audit not found.");
        const audit = await AuditEngagementModel.findOne({ _id: req.params.id, isDeleted: false });
        if (!audit) throw httpError(404, "Audit not found.");
        const list = (Array.isArray(req.body?.charges) ? req.body.charges : []).slice(0, 20).map((c) => ({
            ...(mongoose.isValidObjectId(c._id) ? { _id: c._id } : {}),
            label: String(c.label || c.type || "Charge").trim().slice(0, 200), type: CHARGE_TYPES.includes(c.type) ? c.type : "Fixed fee",
            rate: Math.max(0, Number(c.rate) || 0), quantity: Math.max(0, Number(c.quantity) || 0), notes: String(c.notes || "").slice(0, 300), active: c.active !== false,
        }));
        audit.charges = list;
        if (req.body?.syncFee !== false) audit.fee = contractValue(list);
        await audit.save();
        logAudit(req, "audit.update", `Updated the charges on ${audit.auditCode}`, { type: "AuditEngagement", id: audit._id });
        return res.status(200).json({ success: true, message: `Charges saved — contract value ₹${audit.fee.toLocaleString("en-IN")}.`, data: { charges: audit.charges, fee: audit.fee } });
    } catch (err) { return fail(res, err); }
};

/* ---------------- what's billable in a period ---------------- */
const monthKeys = (from, to) => { const out = []; for (let d = new Date(from.getFullYear(), from.getMonth(), 1); d <= to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); return out; };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthName = (k) => `${MONTHS[Number(k.slice(5)) - 1]} ${k.slice(0, 4)}`;

// lines for one engagement and period, from its charges (or the remaining fee if it has none)
export const billableFor = async (audit, from, to) => {
    const firm = await billingOf();
    const sac = firm.sacCode || "998221";
    const prior = await InvoiceModel.find({ auditId: audit._id, status: { $ne: "Cancelled" } }).select("lines taxableValue status").lean();
    const priorLines = prior.flatMap((i) => i.lines || []);
    const billedFor = (cid) => priorLines.filter((l) => String(l.chargeId) === String(cid));
    const lines = [], warnings = [];
    const charges = (audit.charges || []).filter((c) => c.active !== false);
    const range = `${from.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${to.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`;

    if (!charges.length) {
        const billed = prior.reduce((t, i) => t + (i.taxableValue || 0), 0);
        const left = Math.max(0, (audit.fee || 0) - billed);
        if (left) lines.push({ description: `Professional fees — ${audit.auditType} audit${audit.financialYear ? ` for FY ${audit.financialYear}` : ""}`, sac, kind: "Fee", qty: 1, rate: left, taxable: true });
        return { lines, warnings, amount: left };
    }
    const logs = await AuditTimeLogModel.find({ auditId: audit._id, startTime: { $gte: from, $lte: to }, endTime: { $ne: null } }).lean();
    // only approved timesheet time is billed (older entries without a status count as approved)
    const awaiting = logs.filter((l) => l.status && l.status !== "Approved" && !l.needsReview);
    if (awaiting.length) warnings.push(`${awaiting.length} time entr${awaiting.length === 1 ? "y" : "ies"} (${Math.round(awaiting.reduce((t, l) => t + (l.durationMinutes || 0), 0) / 6) / 10}h) are still on unapproved timesheets and aren't billed yet.`);
    const pendingReview = logs.filter((l) => l.needsReview);
    if (pendingReview.length) warnings.push(`${pendingReview.length} time session${pendingReview.length === 1 ? "" : "s"} (${Math.round(pendingReview.reduce((t, l) => t + (l.durationMinutes || 0), 0) / 6) / 10}h) need a manager's review and aren't billed yet.`);
    for (const c of charges) {
        if (c.type === "Fixed fee" || c.type === "Milestone") {
            const total = (c.rate || 0) * (c.quantity || 1);
            const done = billedFor(c._id).reduce((t, l) => t + (l.amount || 0), 0);
            const left = Math.max(0, total - done);
            if (left > 0) lines.push({ description: c.label || c.type, sac, kind: c.type === "Milestone" ? "Milestone" : "Fee", qty: 1, rate: left, taxable: true, chargeId: c._id, chargeType: c.type });
        } else if (c.type === "Monthly retainer") {
            const done = new Set(billedFor(c._id).flatMap((l) => l.months || []));
            const months = monthKeys(from, to).filter((k) => !done.has(k));
            if (months.length) lines.push({ description: `${c.label || "Monthly retainer"} — ${months.map(monthName).join(", ")}`, sac, kind: "Retainer", qty: months.length, rate: c.rate || 0, taxable: true, chargeId: c._id, chargeType: c.type, months });
        } else if (c.type === "Hourly") {
            // agreed hours are a cap: bill the oldest sessions up to what's left, never beyond
            const ok = logs.filter((l) => !l.needsReview && (!l.status || l.status === "Approved") && l.billable !== false && !l.billedInvoice).sort((x, y) => new Date(x.startTime) - new Date(y.startTime));
            const cap = Number(c.quantity) > 0 ? Math.max(0, Number(c.quantity) - billedFor(c._id).reduce((t, l) => t + (l.qty || 0), 0)) : Infinity;
            const take = []; let mins = 0;
            for (const l of ok) { if ((mins + (l.durationMinutes || 0)) / 60 > cap + 0.01) break; take.push(l); mins += l.durationMinutes || 0; }
            const left = ok.length - take.length;
            if (left) warnings.push(`${Math.round(ok.slice(take.length).reduce((t, l) => t + (l.durationMinutes || 0), 0) / 6) / 10}h of time is over the ${c.quantity} agreed hours for “${c.label || "hourly work"}” and isn't billed — raise the estimate on the audit to bill it.`);
            const hours = Math.round((mins / 60) * 4) / 4;
            if (hours > 0) lines.push({ description: `${c.label || "Professional time"} — ${hours}h, ${range}`, sac, kind: "Hours", qty: hours, rate: c.rate || 0, taxable: true, chargeId: c._id, chargeType: c.type, timeLogIds: take.map((l) => l._id) });
        } else if (c.type === "Per visit") {
            const done = new Set(billedFor(c._id).flatMap((l) => l.visitDays || []));
            const days = [...new Set(logs.filter((l) => l.billable !== false).map((l) => new Date(l.startTime).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })))].filter((d) => !done.has(d)).sort();
            if (days.length) lines.push({ description: `${c.label || "Site visits"} — ${days.length} visit${days.length === 1 ? "" : "s"}, ${range}`, sac, kind: "Visit", qty: days.length, rate: c.rate || 0, taxable: true, chargeId: c._id, chargeType: c.type, visitDays: days });
        } else if (c.type === "Expenses" && (c.rate || 0) > 0) {
            lines.push({ description: c.label || "Out-of-pocket expenses", sac, kind: "Expense", qty: 1, rate: c.rate, taxable: true, chargeId: c._id, chargeType: c.type });
        }
    }
    return { lines, warnings, amount: lines.reduce((t, l) => t + (l.qty || 1) * (l.rate || 0), 0) };
};

const rangeOf = (q) => {
    const now = new Date();
    const from = q.from ? new Date(`${q.from}T00:00:00`) : new Date(now.getFullYear(), now.getMonth(), 1);
    const to = q.to ? new Date(`${q.to}T23:59:59.999`) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    if (isNaN(from) || isNaN(to) || from > to) throw httpError(400, "Pick a valid date range.");
    return { from, to };
};

// POST /invoices/prepare { auditId, from, to } — a draft with everything billable in the period
export const prepareInvoice = async (req, res) => {
    try {
        await mustBill(req);
        const b = req.body || {};
        if (!mongoose.isValidObjectId(b.auditId)) throw httpError(400, "Pick the audit you're billing.");
        const audit = await AuditEngagementModel.findOne({ _id: b.auditId, isDeleted: false }).lean();
        if (!audit) throw httpError(404, "Audit not found.");
        await closeStaleTimers({ auditId: audit._id });
        const { from, to } = rangeOf(b);
        const { lines, warnings } = await billableFor(audit, from, to);
        if (!lines.length) throw httpError(400, `Nothing to bill for ${audit.auditCode} in this period.${warnings.length ? ` ${warnings.join(" ")}` : ""}`);
        const client = audit.clientId ? await AuditClientModel.findById(audit.clientId).lean() : null;
        const firm = await billingOf();
        const clientState = (client?.state || "").trim();
        const interState = !!(clientState && firm.state && clientState.toLowerCase() !== firm.state.toLowerCase());
        const invoiceDate = new Date();
        const inv = compute({
            auditId: audit._id, clientId: client?._id || audit.clientId || null,
            billTo: { name: client?.name || audit.clientName, address: client?.address || "", city: client?.city || "", state: clientState, gstin: client?.gstin || "", pan: client?.pan || "", contactPerson: client?.contactPerson || "", email: client?.email || "" },
            invoiceDate, dueDate: new Date(invoiceDate.getTime() + (firm.paymentTermsDays ?? 15) * 864e5), period: { from, to },
            lines, gstRate: firm.gstRate ?? 18, interState, notes: `For the period ${from.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} to ${to.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}.`,
            status: "Draft", createdBy: req.user.id,
        });
        const doc = await InvoiceModel.create(inv);
        logAudit(req, "invoice.create", `Prepared a bill for ${audit.auditCode} (${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)})`, { type: "Invoice", id: doc._id });
        return res.status(201).json({ success: true, message: `Draft bill ready for ${audit.auditCode} — check it and issue.`, data: view(doc), warnings });
    } catch (err) { return fail(res, err); }
};

/* ---------------- reviewing timer sessions ---------------- */
// PUT /audits/timelogs/:id/review { action: "approve" | "adjust" | "nonbillable", endTime?, note? }
export const reviewTimeLog = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) throw httpError(404, "Session not found.");
        const log = await AuditTimeLogModel.findById(req.params.id);
        if (!log) throw httpError(404, "Session not found.");
        if (log.billedInvoice) throw httpError(409, "This session is already on an issued invoice.");
        if (!log.endTime) throw httpError(400, "The timer is still running.");
        const audit = await AuditEngagementModel.findById(log.auditId).select("auditManager auditCode teamMembers projectId").lean();
        const scope = await scopeOf(req);
        const { auditAccess } = await import("../utils/auditAccess.js");
        const acc = await auditAccess(req, audit);
        // the engagement's manager, audit leadership, or the person's own seniors — not HR / Accounts
        const can = acc.manage || scope.team.has(String(log.employeeId));
        if (!can) throw httpError(403, "Only the audit manager or the person's seniors can review this time.");
        if (String(log.employeeId) === scope.me && !scope.firm) throw httpError(403, "Someone above you needs to confirm your own time.");
        const action = req.body?.action;
        const reason = String(req.body?.note || req.body?.reason || "").trim();
        if (action === "adjust") {
            const end = new Date(req.body?.endTime);
            if (isNaN(end) || end <= log.startTime) throw httpError(400, "The end time must be after the start.");
            if (end - log.startTime > 16 * 36e5) throw httpError(400, "A session can't be longer than 16 hours.");
            // approved time is never changed silently
            if (log.status === "Approved" && !reason) throw httpError(400, "This time is already approved — give a reason for the correction.");
            if (log.originalMinutes == null) log.originalMinutes = log.durationMinutes;
            const toMinutes = Math.round((end - log.startTime) / 60000);
            log.adjustments.push({ by: req.user.id, fromMinutes: log.durationMinutes, toMinutes, reason: reason || "Corrected on review", status: "Applied", decidedBy: req.user.id, decidedAt: new Date() });
            log.endTime = end;
            log.durationMinutes = toMinutes;
            log.billable = true;
        } else if (action === "nonbillable") {
            log.billable = false;
        } else if (action === "approve") {
            log.billable = true;
        } else throw httpError(400, "Pick approve, adjust or non-billable.");
        if (action !== "nonbillable" || log.status !== "Approved") { log.status = "Approved"; log.approvedBy = req.user.id; log.approvedAt = new Date(); }
        log.needsReview = false; log.reviewedBy = req.user.id; log.reviewedAt = new Date();
        if (req.body?.note) log.note = [log.note, `Review: ${String(req.body.note).slice(0, 200)}`].filter(Boolean).join(" · ");
        await log.save();
        if (String(log.employeeId) !== scope.me) notify(log.employeeId, "Your timer session was reviewed", `${audit?.auditCode || "Audit"}: ${action === "adjust" ? `corrected to ${Math.floor(log.durationMinutes / 60)}h ${log.durationMinutes % 60}m` : action === "nonbillable" ? "marked non-billable" : "approved as recorded"}.`, "Audit", `/audits/${log.auditId}`);
        return res.status(200).json({ success: true, message: action === "adjust" ? "Session corrected." : action === "nonbillable" ? "Marked non-billable — it won't be charged." : "Session approved for billing.", data: log });
    } catch (err) { return fail(res, err); }
};
