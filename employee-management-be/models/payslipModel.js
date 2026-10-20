import mongoose from "mongoose";

const PayslipSchema = new mongoose.Schema(
    {
        payrollRunId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "PayrollRun",
            required: true,
        },
        employeeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
            required: true,
        },
        period: {
            type: String,
            required: true,
        },
        basic: Number,
        hra: Number,
        conveyance: Number,
        medicalAllowance: Number,
        specialAllowance: Number,
        grossPay: Number,
        providentFund: Number,
        professionalTax: Number,
        incomeTax: Number,
        otherDeductions: Number,
        totalDeductions: Number,
        netPay: Number,
    },
    {
        timestamps: true,
    }
);

PayslipSchema.index({ employeeId: 1, period: 1 }, { unique: true });

export default mongoose.model("Payslip", PayslipSchema);
