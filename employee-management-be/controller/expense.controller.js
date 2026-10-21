import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import expenseModel from "../models/expenseModel.js";
import { logAudit } from "../utils/audit.js";
import { notify } from "../utils/notify.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEGACY_DIR = process.env.VERCEL ? "/tmp/uploads" : path.join(__dirname, "..", "uploads");
const RECEIPT_TYPES = /^(image\/(png|jpe?g|gif|webp|heic|heif)|application\/pdf)$/;
const receipts = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "expenseReceipts" });
const safeName = (s) => String(s || "receipt").replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, "_").slice(0, 100);

export const getExpenses = async (req, res) => {
    try {
        const isManager = ["Admin", "HR", "Manager", "Team Lead"].includes(req.user.role);

        const filter = isManager ? {} : { employeeId: req.user.id };

        const expenses = await expenseModel
            .find(filter)
            .populate("employeeId", "employeeId firstName lastName department")
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            data: expenses,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

export const createExpense = async (req, res) => {
    try {
        const { category, amount, expenseDate, description } = req.body;

        if (req.file && !RECEIPT_TYPES.test(req.file.mimetype)) {
            return res.status(400).json({ success: false, message: "Attach the bill as a photo or PDF." });
        }

        const expense = await expenseModel.create({
            employeeId: req.user.id,
            category,
            amount,
            expenseDate,
            description,
        });

        // Bills go to private storage (survives serverless restarts; only owner and approvers can open).
        if (req.file) {
            const name = safeName(req.file.originalname);
            const fileId = await new Promise((resolve, reject) => {
                const up = receipts().openUploadStream(`${expense._id}/${name}`, { contentType: req.file.mimetype, metadata: { employeeId: req.user.id } });
                up.on("error", reject); up.on("finish", () => resolve(up.id)); up.end(req.file.buffer);
            });
            expense.receiptFileId = fileId;
            expense.receiptUrl = `/expenses/${expense._id}/receipt/${name}`; // file name kept so the app can tell image from PDF
            await expense.save();
        }

        return res.status(201).json({
            success: true,
            message: "Expense claim submitted successfully.",
            data: expense,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

export const updateExpenseStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, rejectionReason } = req.body;

        const expense = await expenseModel.findById(id);

        if (!expense) {
            return res.status(404).json({
                success: false,
                message: "Expense not found.",
            });
        }

        expense.status = status;
        expense.approvedBy = req.user.id;
        if (status === "Rejected") {
            expense.rejectionReason = rejectionReason || "";
        }

        await expense.save();

        logAudit(req, "expense.status_change", `Marked a ${expense.category} expense claim as ${status}`, { type: "Expense", id: expense._id });
        notify(expense.employeeId, `Expense ${status}`, `Your ${expense.category} expense claim was ${status.toLowerCase()}.`, "Expense", "/expenses");

        return res.status(200).json({
            success: true,
            message: `Expense ${status.toLowerCase()} successfully.`,
            data: expense,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

export const deleteExpense = async (req, res) => {
    try {
        const { id } = req.params;

        const expense = await expenseModel.findOneAndDelete({
            _id: id,
            employeeId: req.user.id,
            status: "Pending",
        });

        if (!expense) {
            return res.status(404).json({
                success: false,
                message: "Only your own pending expense claims can be deleted.",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Expense claim deleted successfully.",
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

// GET /expenses/:id/receipt[/name] — the claimant, or anyone who reviews expenses.
export const getReceipt = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ success: false, message: "Receipt not found." });
        const expense = await expenseModel.findById(req.params.id).lean();
        if (!expense) return res.status(404).json({ success: false, message: "Receipt not found." });
        const reviewer = ["Admin", "HR", "Manager", "Team Lead"].includes(req.user.role);
        if (!reviewer && String(expense.employeeId) !== String(req.user.id)) return res.status(403).json({ success: false, message: "You can't open this receipt." });
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
