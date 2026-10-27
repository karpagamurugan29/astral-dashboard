import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import expenseModel from "../models/expenseModel.js";
import { logAudit } from "../utils/audit.js";
import { notify } from "../utils/notify.js";
import { scopeOf, visibleIds, canSee } from "../utils/hierarchy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEGACY_DIR = process.env.VERCEL ? "/tmp/uploads" : path.join(__dirname, "..", "uploads");
const RECEIPT_TYPES = /^(image\/(png|jpe?g|gif|webp|heic|heif)|application\/pdf)$/;
const receipts = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "expenseReceipts" });
const safeName = (s) => String(s || "receipt").replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, "_").slice(0, 100);

const PERSON = "employeeId firstName lastName department designation profileImage";
const CATEGORIES = ["Travel", "Food", "Accommodation", "Transportation", "Office Supplies", "Software", "Client Entertainment", "Other"];
const PAYMENT_METHODS = ["", "Cash", "Personal Card", "Corporate Card", "UPI", "Bank Transfer", "Other"];
// The only moves a reviewer can make (anything else is refused).
const NEXT = { Pending: ["Approved", "Rejected", "Changes Requested"], Approved: ["Processing", "Reimbursed"], Processing: ["Reimbursed"] };
const EDITABLE = ["Draft", "Changes Requested", "Rejected"]; // the owner may edit (and resubmit) these
const httpError = (status, message) => Object.assign(new Error(message), { status });
const fail = (res, error) => res.status(error.status || 500).json({ success: false, message: error.message });
const truthy = (v) => v === true || v === "true" || v === "1";

// Claim fields from a JSON or multipart body. `partial` allows leaving fields out (edits).
const pickFields = (b = {}, partial = false) => {
    const out = {};
    if (b.title !== undefined) out.title = String(b.title).trim().slice(0, 120);
    if (b.category !== undefined || !partial) {
        if (!CATEGORIES.includes(b.category)) throw httpError(400, "Choose a category.");
        out.category = b.category;
    }
    if (b.amount !== undefined || !partial) {
        const amount = Number(b.amount);
        if (!Number.isFinite(amount) || amount <= 0) throw httpError(400, "Enter an amount above zero.");
        out.amount = Math.round(amount * 100) / 100;
    }
    if (b.expenseDate !== undefined || !partial) {
        const d = new Date(b.expenseDate);
        if (!b.expenseDate || Number.isNaN(d.getTime())) throw httpError(400, "Pick the date of the expense.");
        if (d.getTime() > Date.now() + 864e5) throw httpError(400, "The expense date can't be in the future.");
        out.expenseDate = d;
    }
    if (b.description !== undefined) out.description = String(b.description).trim().slice(0, 1000);
    if (b.notes !== undefined) out.notes = String(b.notes).trim().slice(0, 1000);
    if (b.paymentMethod !== undefined) {
        if (!PAYMENT_METHODS.includes(b.paymentMethod)) throw httpError(400, "Choose a payment method.");
        out.paymentMethod = b.paymentMethod;
    }
    if (b.currency !== undefined) out.currency = (String(b.currency).trim().toUpperCase() || "INR").slice(0, 3);
    return out;
};

const storeReceipt = async (expense, file, userId) => {
    if (!RECEIPT_TYPES.test(file.mimetype)) throw httpError(400, "Attach the bill as a photo or PDF.");
    const name = safeName(file.originalname);
    const fileId = await new Promise((resolve, reject) => {
        const up = receipts().openUploadStream(`${expense._id}/${name}`, { contentType: file.mimetype, metadata: { employeeId: userId } });
        up.on("error", reject); up.on("finish", () => resolve(up.id)); up.end(file.buffer);
    });
    const old = expense.receiptFileId;
    expense.receiptFileId = fileId;
    expense.receiptUrl = `/expenses/${expense._id}/receipt/${name}`; // file name kept so the app can tell image from PDF
    return old; // the replaced bill, removed once the claim is saved
};

const label = (e) => `${e.category} expense claim${e.title ? ` “${e.title}”` : ""}`;

export const getExpenses = async (req, res) => {
    try {
        // Accounts and firm-wide seniors see every claim; leads see their team's; everyone else their own.
        // Drafts stay private to the person writing them.
        const ids = visibleIds(await scopeOf(req), "finance");
        const filter = { ...(ids ? { employeeId: { $in: ids } } : {}), $or: [{ status: { $ne: "Draft" } }, { employeeId: req.user.id }] };

        const expenses = await expenseModel
            .find(filter)
            .populate("employeeId", PERSON)
            .populate("approvedBy rejectedBy reimbursedBy history.by", "firstName lastName employeeId designation")
            .sort({ createdAt: -1 });

        return res.status(200).json({ success: true, data: expenses });
    } catch (error) {
        return fail(res, error);
    }
};

// POST /expenses — submit a claim, or save it as a draft ({ draft: true }).
export const createExpense = async (req, res) => {
    try {
        const draft = truthy(req.body?.draft);
        const fields = pickFields(req.body || {});
        if (req.file && !RECEIPT_TYPES.test(req.file.mimetype)) throw httpError(400, "Attach the bill as a photo or PDF.");

        const now = new Date();
        const expense = await expenseModel.create({
            ...fields,
            employeeId: req.user.id,
            status: draft ? "Draft" : "Pending",
            submittedAt: draft ? null : now,
            history: [{ action: draft ? "Saved as draft" : "Submitted", to: draft ? "Draft" : "Pending", by: req.user.id, at: now }],
        });

        // Bills go to private storage (survives serverless restarts; only owner and approvers can open).
        if (req.file) {
            await storeReceipt(expense, req.file, req.user.id);
            await expense.save();
        }

        return res.status(201).json({
            success: true,
            message: draft ? "Draft saved." : "Expense claim submitted successfully.",
            data: expense,
        });
    } catch (error) {
        return fail(res, error);
    }
};

// PUT /expenses/:id — the owner edits a draft, or a claim sent back / rejected; { submit: true } sends it for approval.
export const updateExpense = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) throw httpError(404, "Expense not found.");
        const expense = await expenseModel.findById(req.params.id);
        if (!expense) throw httpError(404, "Expense not found.");
        if (String(expense.employeeId) !== String(req.user.id)) throw httpError(403, "Only the person who made this claim can edit it.");
        if (!EDITABLE.includes(expense.status)) throw httpError(409, `A ${expense.status.toLowerCase()} claim can't be edited.`);

        Object.assign(expense, pickFields(req.body || {}, true));
        const replaced = req.file ? await storeReceipt(expense, req.file, req.user.id) : null;

        const now = new Date();
        if (truthy(req.body?.submit)) {
            const from = expense.status;
            expense.status = "Pending";
            expense.submittedAt = now;
            expense.rejectionReason = "";
            expense.history.push({ action: from === "Draft" ? "Submitted" : "Resubmitted", from, to: "Pending", by: req.user.id, at: now });
        } else {
            expense.history.push({ action: "Edited", from: expense.status, to: expense.status, by: req.user.id, at: now });
        }
        await expense.save();
        if (replaced) receipts().delete(replaced).catch(() => {});

        return res.status(200).json({ success: true, message: truthy(req.body?.submit) ? "Expense claim submitted." : "Changes saved.", data: expense });
    } catch (error) {
        return fail(res, error);
    }
};

export const updateExpenseStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body || {};
        const reason = String(req.body?.rejectionReason || req.body?.comment || "").trim().slice(0, 1000);

        const expense = await expenseModel.findById(id);
        if (!expense) throw httpError(404, "Expense not found.");

        const scope = await scopeOf(req);
        if (String(expense.employeeId) === String(req.user.id) || !(scope.finance || scope.team.has(String(expense.employeeId)))) {
            return res.status(403).json({ success: false, message: "Only this person's managers or Accounts can decide this claim." });
        }
        if (!(NEXT[expense.status] || []).includes(status)) {
            throw httpError(409, `This claim is ${expense.status.toLowerCase()} — it can't be marked ${String(status || "").toLowerCase() || "that"}.`);
        }
        if (["Rejected", "Changes Requested"].includes(status) && reason.length < 3) {
            throw httpError(400, status === "Rejected" ? "Say why the claim is rejected." : "Say what needs to change.");
        }

        const now = new Date();
        const from = expense.status;
        expense.status = status;
        if (status === "Approved") { expense.approvedBy = req.user.id; expense.approvedAt = now; expense.reviewComment = reason; }
        if (status === "Rejected") { expense.rejectedBy = req.user.id; expense.rejectedAt = now; expense.rejectionReason = reason; }
        if (status === "Changes Requested") { expense.reviewComment = reason; }
        if (status === "Reimbursed") { expense.reimbursedBy = req.user.id; expense.reimbursedAt = now; }
        expense.history.push({ action: status === "Processing" ? "Reimbursement processing" : status, from, to: status, by: req.user.id, at: now, comment: reason });

        await expense.save();

        logAudit(req, "expense.status_change", `Marked a ${expense.category} expense claim as ${status}`, { type: "Expense", id: expense._id });
        const say = { Approved: "was approved", Rejected: `was rejected${reason ? `: ${reason}` : ""}`, "Changes Requested": `needs changes: ${reason}`, Processing: "is being reimbursed", Reimbursed: "was reimbursed" }[status];
        notify(expense.employeeId, `Expense ${status}`, `Your ${label(expense)} ${say}.`, "Expense", "/expenses");

        return res.status(200).json({
            success: true,
            message: `Expense ${status.toLowerCase()} successfully.`,
            data: expense,
        });
    } catch (error) {
        return fail(res, error);
    }
};

export const deleteExpense = async (req, res) => {
    try {
        const { id } = req.params;

        const expense = await expenseModel.findOneAndDelete({
            _id: id,
            employeeId: req.user.id,
            status: { $in: ["Pending", "Draft"] },
        });

        if (!expense) {
            return res.status(404).json({
                success: false,
                message: "Only your own drafts and pending expense claims can be deleted.",
            });
        }
        if (expense.receiptFileId) receipts().delete(expense.receiptFileId).catch(() => {});

        return res.status(200).json({
            success: true,
            message: "Expense claim deleted successfully.",
        });
    } catch (error) {
        return fail(res, error);
    }
};

// GET /expenses/:id/receipt[/name] — the claimant, or anyone who reviews expenses.
export const getReceipt = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ success: false, message: "Receipt not found." });
        const expense = await expenseModel.findById(req.params.id).lean();
        if (!expense) return res.status(404).json({ success: false, message: "Receipt not found." });
        if (!canSee(await scopeOf(req), expense.employeeId, "finance")) return res.status(403).json({ success: false, message: "You can't open this receipt." });
        res.set({ "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" });
        if (expense.receiptFileId) {
            const file = await mongoose.connection.db.collection("expenseReceipts.files").findOne({ _id: expense.receiptFileId });
            if (!file) return res.status(404).json({ success: false, message: "Receipt file is missing." });
            res.set({ "Content-Type": file.contentType || "application/octet-stream", "Content-Disposition": `inline; filename="${safeName(file.filename.split("/").pop())}"` });
            return receipts().openDownloadStream(expense.receiptFileId).pipe(res);
        }
        // older receipts saved on disk
        const p = path.join(LEGACY_DIR, path.basename(expense.receiptUrl || ""));
        if (!expense.receiptUrl || !fs.existsSync(p)) return res.status(404).json({ success: false, message: "Receipt file is missing." });
        return fs.createReadStream(p).pipe(res);
    } catch (error) {
        if (!res.headersSent) return res.status(500).json({ success: false, message: error.message });
    }
};
