import mongoose from "mongoose";

const ExpenseSchema = new mongoose.Schema(
    {
        employeeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
            required: true,
            index: true,
        },
        category: {
            type: String,
            enum: ["Travel", "Food", "Accommodation", "Transportation", "Office Supplies", "Software", "Client Entertainment", "Other"],
            required: true,
        },
        amount: {
            type: Number,
            required: true,
            min: 0,
        },
        expenseDate: {
            type: Date,
            required: true,
        },
        description: {
            type: String,
            trim: true,
        },
        receiptUrl: {
            type: String,
            default: "",
        },
        // the bill, stored privately in MongoDB (GridFS "expenseReceipts")
        receiptFileId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
        },
        // Draft → Pending → Approved → Processing → Reimbursed, or Pending → Rejected / Changes Requested
        // (the owner edits and resubmits). Older claims only ever used Pending/Approved/Rejected/Reimbursed.
        status: {
            type: String,
            enum: ["Draft", "Pending", "Changes Requested", "Approved", "Processing", "Rejected", "Reimbursed"],
            default: "Pending",
        },
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
            default: null,
        },
        rejectionReason: {
            type: String,
            default: "",
        },
        // ---- added with the expense redesign; all optional, so older claims are unchanged ----
        title: { type: String, trim: true, default: "" },
        paymentMethod: { type: String, enum: ["", "Cash", "Personal Card", "Corporate Card", "UPI", "Bank Transfer", "Other"], default: "" },
        currency: { type: String, trim: true, uppercase: true, default: "INR" },
        notes: { type: String, trim: true, default: "" },
        reviewComment: { type: String, default: "" }, // latest reviewer note (changes requested / approval comment)
        submittedAt: { type: Date, default: null },
        approvedAt: { type: Date, default: null },
        rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", default: null },
        rejectedAt: { type: Date, default: null },
        reimbursedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", default: null },
        reimbursedAt: { type: Date, default: null },
        // every step, for the approval timeline and activity feed
        history: [
            {
                action: { type: String },
                from: { type: String, default: "" },
                to: { type: String, default: "" },
                by: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
                at: { type: Date, default: Date.now },
                comment: { type: String, default: "" },
            },
        ],
    },
    {
        timestamps: true,
    }
);

export default mongoose.model("Expense", ExpenseSchema);
