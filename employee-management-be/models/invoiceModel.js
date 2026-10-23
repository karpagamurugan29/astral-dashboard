import mongoose from "mongoose";

// A tax invoice for audit / advisory work. Drafts have no number; issuing gives the next
// number in the financial-year series (e.g. ACL/2026-27/0007) and freezes the amounts.
const InvoiceSchema = new mongoose.Schema(
    {
        invoiceNo: { type: String, default: null, index: true },
        seq: { type: Number, default: null },
        fy: { type: String, default: "" }, // 2026-27
        auditId: { type: mongoose.Schema.Types.ObjectId, ref: "AuditEngagements", default: null, index: true },
        clientId: { type: mongoose.Schema.Types.ObjectId, ref: "AuditClients", default: null, index: true },
        // client details as printed (kept even if the client record changes later)
        billTo: {
            name: { type: String, default: "" },
            address: { type: String, default: "" },
            city: { type: String, default: "" },
            state: { type: String, default: "" },
            stateCode: { type: String, default: "" },
            gstin: { type: String, default: "" },
            pan: { type: String, default: "" },
            contactPerson: { type: String, default: "" },
            email: { type: String, default: "" },
        },
        invoiceDate: { type: Date, default: Date.now },
        dueDate: { type: Date, default: null },
        lines: [
            {
                description: { type: String, trim: true, maxlength: 300 },
                sac: { type: String, default: "998221" },
                kind: { type: String, enum: ["Fee", "Hours", "Expense", "Other", "Retainer", "Visit", "Milestone"], default: "Fee" },
                qty: { type: Number, default: 1 },
                rate: { type: Number, default: 0 },
                amount: { type: Number, default: 0 },
                taxable: { type: Boolean, default: true },
                // where the line came from (prepared from the engagement's charges)
                chargeId: { type: mongoose.Schema.Types.ObjectId, default: null },
                chargeType: { type: String, default: "" },
                months: [{ type: String }],                                   // "2026-10" for retainers
                visitDays: [{ type: String }],                                // "2026-10-14" for per-visit
                timeLogIds: [{ type: mongoose.Schema.Types.ObjectId }],       // hours billed on this line
            },
        ],
        period: { from: { type: Date, default: null }, to: { type: Date, default: null } },
        gstRate: { type: Number, default: 18 },
        interState: { type: Boolean, default: false }, // IGST instead of CGST + SGST
        subtotal: { type: Number, default: 0 },
        taxableValue: { type: Number, default: 0 },
        cgst: { type: Number, default: 0 },
        sgst: { type: Number, default: 0 },
        igst: { type: Number, default: 0 },
        roundOff: { type: Number, default: 0 },
        total: { type: Number, default: 0 },
        status: { type: String, enum: ["Draft", "Issued", "Partly paid", "Paid", "Cancelled"], default: "Draft", index: true },
        payments: [
            {
                date: { type: Date, default: Date.now },
                amount: { type: Number, default: 0 },   // money received
                tds: { type: Number, default: 0 },      // tax deducted at source by the client (counts as settled)
                mode: { type: String, enum: ["Bank transfer", "Cheque", "UPI", "Cash", "Other"], default: "Bank transfer" },
                reference: { type: String, default: "", trim: true },
                recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
                at: { type: Date, default: Date.now },
            },
        ],
        notes: { type: String, default: "", maxlength: 1000 },
        issuedAt: { type: Date, default: null },
        issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", default: null },
        cancelledAt: { type: Date, default: null },
        cancelReason: { type: String, default: "" },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    },
    { timestamps: true }
);

export default mongoose.model("Invoice", InvoiceSchema);
