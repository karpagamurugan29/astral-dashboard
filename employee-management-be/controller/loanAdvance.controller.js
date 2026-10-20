import loanAdvanceModel from "../models/loanAdvanceModel.js";
import { logAudit } from "../utils/audit.js";
import { notify } from "../utils/notify.js";

export const requestLoan = async (req, res) => {
    try {
        const { amount, reason, monthlyDeduction } = req.body;

        const loan = await loanAdvanceModel.create({
            employeeId: req.user.id,
            amount,
            reason,
            monthlyDeduction,
            remainingBalance: amount,
        });

        logAudit(req, "payroll.loan_request", `Requested an advance of ${amount}`, { type: "LoanAdvance", id: loan._id });

        return res.status(201).json({ success: true, message: "Request submitted.", data: loan });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getMyLoans = async (req, res) => {
    try {
        const loans = await loanAdvanceModel.find({ employeeId: req.user.id }).sort({ createdAt: -1 });
        return res.status(200).json({ success: true, data: loans });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getAllLoans = async (req, res) => {
    try {
        const loans = await loanAdvanceModel
            .find({})
            .populate("employeeId", "employeeId firstName lastName department")
            .sort({ createdAt: -1 });
        return res.status(200).json({ success: true, data: loans });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const decideLoan = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // "Approved" | "Rejected"

        const loan = await loanAdvanceModel.findById(id);
        if (!loan) {
            return res.status(404).json({ success: false, message: "Request not found." });
        }

        loan.status = status;
        loan.approvedBy = req.user.id;
        await loan.save();

        notify(loan.employeeId, `Advance request ${status}`, `Your request for ${loan.amount} was ${status.toLowerCase()}.`, "General", "/payroll/loans");
        logAudit(req, "payroll.loan_decision", `${status} a salary advance request`, { type: "LoanAdvance", id: loan._id });

        return res.status(200).json({ success: true, message: `Request ${status.toLowerCase()}.`, data: loan });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const markLoanDisbursed = async (req, res) => {
    try {
        const { id } = req.params;

        const loan = await loanAdvanceModel.findByIdAndUpdate(id, { status: "Disbursed" }, { new: true });
        if (!loan) {
            return res.status(404).json({ success: false, message: "Request not found." });
        }

        return res.status(200).json({ success: true, message: "Marked as disbursed.", data: loan });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
