import mongoose from "mongoose";

const AuditLogSchema = new mongoose.Schema(
    {
        action: {
            type: String,
            required: true,
        },
        description: {
            type: String,
            required: true,
        },
        performedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
            default: null,
        },
        targetType: {
            type: String,
            default: "",
        },
        targetId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

export default mongoose.model("AuditLog", AuditLogSchema);
