import mongoose from "mongoose";

// An audit project: one company's (client's) piece of work for a period — e.g. "FY 2026-27 statutory
// and tax" — grouping several engagements with a shared budget, deadline, manager and partner.
// Company → Audit project → Engagement → Tasks → Time.
const auditProjectSchema = new mongoose.Schema(
    {
        projectCode: { type: String, required: true, unique: true, trim: true },
        clientId: { type: mongoose.Schema.Types.ObjectId, ref: "AuditClients", required: true, index: true },
        name: { type: String, required: true, trim: true, maxlength: 160 },
        financialYear: { type: String, default: "", trim: true },
        description: { type: String, default: "", maxlength: 2000 },
        partner: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", default: null },
        manager: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true },
        startDate: { type: Date, default: null },
        endDate: { type: Date, default: null },
        budgetHours: { type: Number, default: 0 },
        budgetFee: { type: Number, default: 0 },
        status: { type: String, enum: ["Planning", "Active", "On Hold", "Completed", "Cancelled"], default: "Active" },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
        isDeleted: { type: Boolean, default: false },
    },
    { timestamps: true }
);

export default mongoose.model("AuditProjects", auditProjectSchema);
