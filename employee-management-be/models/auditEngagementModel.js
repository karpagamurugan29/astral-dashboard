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
            enum: ["Planning", "Fieldwork", "Review", "Reporting", "On Hold", "Completed", "Cancelled"],
            default: "Planning",
        },

        // what the client is charged for this work — several charge types can apply to one engagement
        charges: [
            {
                label: { type: String, trim: true, maxlength: 200 },
                type: { type: String, enum: ["Fixed fee", "Hourly", "Monthly retainer", "Per visit", "Milestone", "Expenses"], default: "Fixed fee" },
                rate: { type: Number, default: 0 },       // amount, per hour, per month or per visit
                quantity: { type: Number, default: 1 },   // estimate: hours, months, visits (1 for a fixed fee)
                notes: { type: String, default: "", maxlength: 300 },
                active: { type: Boolean, default: true },
            },
        ],

        // the engagement checklist, stage by stage (Planning → Fieldwork → Review → Reporting → Billing)
        milestones: [
            {
                key: { type: String, trim: true },
                label: { type: String, trim: true },
                stage: { type: String, trim: true },
                done: { type: Boolean, default: false },
                doneAt: { type: Date, default: null },
                doneBy: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", default: null },
                note: { type: String, default: "", maxlength: 500 },
            },
        ],

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
