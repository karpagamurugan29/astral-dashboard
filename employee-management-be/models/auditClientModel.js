import mongoose from "mongoose";

// A client of the audit firm. One client has many audit engagements
// (auditEngagementModel.clientId), each with its own team and time logs.
const auditClientSchema = new mongoose.Schema(
    {
        clientCode: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },

        name: {
            type: String,
            required: true,
            trim: true,
        },

        entityType: {
            type: String,
            enum: ["Company", "LLP", "Partnership", "Proprietorship", "Trust", "Society", "Individual", "Government", "Other"],
            default: "Company",
        },

        industry: { type: String, default: "", trim: true },
        pan: { type: String, default: "", trim: true, uppercase: true },
        gstin: { type: String, default: "", trim: true, uppercase: true },

        contactPerson: { type: String, default: "", trim: true },
        email: { type: String, default: "", trim: true, lowercase: true },
        phone: { type: String, default: "", trim: true },
        address: { type: String, default: "", trim: true },
        city: { type: String, default: "", trim: true },
        state: { type: String, default: "", trim: true }, // for GST place of supply

        notes: { type: String, default: "" },

        status: {
            type: String,
            enum: ["Active", "Inactive"],
            default: "Active",
        },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
        },

        isDeleted: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
    }
);

export default mongoose.model("AuditClients", auditClientSchema);
