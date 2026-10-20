import expenseModel from "../models/expenseModel.js";
import { logAudit } from "../utils/audit.js";
import { notify } from "../utils/notify.js";

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

        const expense = await expenseModel.create({
            employeeId: req.user.id,
            category,
            amount,
            expenseDate,
            description,
            receiptUrl: req.file ? `/uploads/${req.file.filename}` : "",
        });

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
