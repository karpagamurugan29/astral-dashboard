import mongoose from "mongoose";

// An audit engagement — the audit firm's equivalent of a project: one client
// assignment, run by an audit manager, worked on by several team members who
// each log their time against it (see auditTimeLogModel).
const auditEngagementSchema = new mongoose.Schema(
    {
        auditCode: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },

        clientId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AuditClients",
            default: null,
            index: true,
        },

        // Copy of the client's name, kept in sync by the client controller, so timers,
        // notifications and the location log can show it without another lookup.
        clientName: {
            type: String,
            required: true,
            trim: true,
        },

        engagementName: {
            type: String,
            default: "",
            trim: true,
        },

        auditType: {
            type: String,
            enum: ["Statutory", "Internal", "Tax", "GST", "Stock", "Concurrent", "Forensic", "Other"],
            default: "Statutory",
        },

        financialYear: {
            type: String,
            default: "",
            trim: true,
        },

        description: {
            type: String,
            default: "",
        },

        auditManager: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
            required: true,
        },

        teamMembers: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Employee",
            },
        ],

        startDate: {
            type: Date,
            required: true,
        },

        endDate: {
            type: Date,
            required: true,
        },

        estimatedHours: {
            type: Number,
            default: 0,
        },

        fee: {
            type: Number,
            default: 0,
        },

        priority: {
            type: String,
            enum: ["Low", "Medium", "High", "Critical"],
            default: "Medium",
        },

        status: {
            type: String,
            enum: ["Planning", "Fieldwork", "Review", "On Hold", "Completed", "Cancelled"],
            default: "Planning",
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

export default mongoose.model("AuditEngagements", auditEngagementSchema);
