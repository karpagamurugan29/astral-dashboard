import mongoose from "mongoose";

const SalaryStructureSchema = new mongoose.Schema(
    {
        employeeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
            required: true,
            unique: true,
        },
        basic: { type: Number, required: true, min: 0 },
        hra: { type: Number, default: 0, min: 0 },
        conveyance: { type: Number, default: 0, min: 0 },
        medicalAllowance: { type: Number, default: 0, min: 0 },
        specialAllowance: { type: Number, default: 0, min: 0 },
        providentFund: { type: Number, default: 0, min: 0 },
        professionalTax: { type: Number, default: 0, min: 0 },
        incomeTax: { type: Number, default: 0, min: 0 },
        otherDeductions: { type: Number, default: 0, min: 0 },
    },
    {
        timestamps: true,
    }
);

export default mongoose.model("SalaryStructure", SalaryStructureSchema);
