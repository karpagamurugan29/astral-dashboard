import mongoose from "mongoose";

const DocumentSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true,
        },
        category: {
            type: String,
            enum: ["ID Proof", "Contract", "Certificate", "Policy", "Payslip", "Other"],
            default: "Other",
        },
        // Company-wide documents (policies) have no owner; personal documents belong to one employee.
        employeeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
            default: null,
        },
        fileName: {
            type: String,
            required: true,
        },
        fileUrl: {
            type: String,
            required: true,
        },
        mimeType: {
            type: String,
            default: "",
        },
        size: {
            type: Number,
            default: 0,
        },
        uploadedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
            required: true,
        },
    },
    {
        timestamps: true,
    }
);

export default mongoose.model("Document", DocumentSchema);
