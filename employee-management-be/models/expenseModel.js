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
            enum: ["Travel", "Food", "Accommodation", "Office Supplies", "Client Entertainment", "Other"],
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
        status: {
            type: String,
            enum: ["Pending", "Approved", "Rejected", "Reimbursed"],
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
    },
    {
        timestamps: true,
    }
);

export default mongoose.model("Expense", ExpenseSchema);
