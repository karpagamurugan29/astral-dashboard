import mongoose from "mongoose";

const PayrollRunSchema = new mongoose.Schema(
    {
        period: {
            type: String, // "YYYY-MM"
            required: true,
            unique: true,
        },
        status: {
            type: String,
            enum: ["Draft", "Approved", "Paid"],
            default: "Draft",
        },
        totalGross: { type: Number, default: 0 },
        totalDeductions: { type: Number, default: 0 },
        totalNet: { type: Number, default: 0 },
        employeeCount: { type: Number, default: 0 },
        generatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
        },
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
            default: null,
        },
        approvedAt: { type: Date, default: null },
        paidAt: { type: Date, default: null },
    },
    {
        timestamps: true,
    }
);

export default mongoose.model("PayrollRun", PayrollRunSchema);
