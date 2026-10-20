import mongoose from "mongoose";

const LoanAdvanceSchema = new mongoose.Schema(
    {
        employeeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
            required: true,
            index: true,
        },
        amount: {
            type: Number,
            required: true,
            min: 0,
        },
        reason: {
            type: String,
            required: true,
            trim: true,
        },
        monthlyDeduction: {
            type: Number,
            required: true,
            min: 0,
        },
        status: {
            type: String,
            enum: ["Pending", "Approved", "Rejected", "Disbursed", "Closed"],
            default: "Pending",
        },
        remainingBalance: {
            type: Number,
            default: 0,
        },
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

export default mongoose.model("LoanAdvance", LoanAdvanceSchema);
