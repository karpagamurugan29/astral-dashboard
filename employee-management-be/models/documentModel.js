import mongoose from "mongoose";

export const DOCUMENT_CATEGORIES = [
    "ID Proof", "Address Proof", "PAN / Tax", "Bank Details", "Education", "Professional Certificate",
    "Experience / Relieving", "Offer Letter", "Contract", "Certificate", "Policy", "Payslip", "Other",
];

const DocumentSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true,
        },
        category: {
            type: String,
            enum: DOCUMENT_CATEGORIES,
            default: "Other",
        },
        // Company-wide documents (policies) have no owner; personal documents belong to one employee.
        employeeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
            default: null,
        },
        // The owner's employee ID (e.g. AST010) at upload time; files are filed under it.
        employeeCode: {
            type: String,
            default: "",
            index: true,
        },
        documentNumber: {
            type: String,
            default: "",
            trim: true,
        },
        expiryDate: {
            type: Date,
            default: null,
        },
        notes: {
            type: String,
            default: "",
            trim: true,
        },
        // "gridfs": the file lives privately in MongoDB (fileId) and is only served through the
        // access-checked download route. "disk": older uploads kept under /uploads (fileUrl).
        storage: {
            type: String,
            enum: ["gridfs", "disk"],
            default: "disk",
        },
        fileId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
        },
        fileName: {
            type: String,
            required: true,
        },
        fileUrl: {
            type: String,
            default: "",
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
