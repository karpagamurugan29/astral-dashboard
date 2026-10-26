import mongoose from "mongoose";

const ref = { type: mongoose.Schema.Types.ObjectId, ref: "Employee", default: null };
export const TASK_STATUSES = ["Not Started", "Assigned", "Ready", "In Progress", "Blocked", "Submitted", "Under Review", "Changes Requested", "Approved", "Completed", "Cancelled"];

const taskSchema = new mongoose.Schema({
    key: { type: String, trim: true },
    label: { type: String, trim: true },
    stage: { type: String, trim: true },
    status: { type: String, enum: TASK_STATUSES, default: "Not Started" },
    done: { type: Boolean, default: false },
    doneAt: { type: Date, default: null },
    doneBy: ref,
    note: { type: String, default: "", maxlength: 500 },
    description: { type: String, default: "", maxlength: 4000 },
    instructions: { type: String, default: "", maxlength: 4000 },
    deliverables: [{ type: String, trim: true, maxlength: 200 }],
    checklist: [{ text: { type: String, trim: true, maxlength: 200 }, done: { type: Boolean, default: false }, doneBy: ref, doneAt: Date }],
    priority: { type: String, enum: ["Low", "Medium", "High", "Critical"], default: "Medium" },
    dependsOn: [{ type: String }], // task keys
    mandatory: { type: Boolean, default: true },
    optional: { type: Boolean, default: false },
    requiresReview: { type: Boolean, default: false },
    requiresEvidence: { type: Boolean, default: false },
    responsibleRole: { type: String, default: "" }, // designation
    reviewerRole: { type: String, default: "" },
    assignee: ref,
    reviewer: ref,
    location: { type: String, default: "", maxlength: 200 }, // fieldwork site
    estimatedHours: { type: Number, default: 0 },
    plannedStart: { type: Date, default: null },
    dueDate: { type: Date, default: null },
    blockedReason: { type: String, default: "" },
    startedAt: { type: Date, default: null },
    submittedAt: { type: Date, default: null },
    firstSubmittedAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null },
    approvedBy: ref,
    reviewCycles: { type: Number, default: 0 }, // times changes were requested
    lastReminderAt: { type: Date, default: null },
    overrideNote: { type: String, default: "" }, // dependency override reason
    attachments: [{
        // `type` must be wrapped: a bare `type: String` here would make the whole element a string
        fileId: mongoose.Schema.Types.ObjectId, name: String, size: Number, type: { type: String },
        uploadedBy: ref, uploadedAt: { type: Date, default: Date.now }, version: { type: Number, default: 1 },
    }],
    comments: [{
        by: ref, at: { type: Date, default: Date.now }, text: { type: String, maxlength: 3000 },
        kind: { type: String, enum: ["comment", "review", "clarification", "blocker", "reply"], default: "comment" },
        resolved: { type: Boolean, default: false },
    }],
    history: [{
        at: { type: Date, default: Date.now }, by: ref, action: String,
        from: { type: String, default: "" }, to: { type: String, default: "" }, note: { type: String, default: "" },
    }],
});

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
        // optional grouping: Company (client) → Audit project → engagement
        projectId: { type: mongoose.Schema.Types.ObjectId, ref: "AuditProjects", default: null, index: true },
        // the workflow template (and version) this engagement was generated from
        workflowTemplate: {
            id: { type: mongoose.Schema.Types.ObjectId, ref: "WorkflowTemplates", default: null },
            name: { type: String, default: "" },
            version: { type: Number, default: 0 },
            family: { type: String, default: "" },
        },
        workflowHistory: [{ at: { type: Date, default: Date.now }, by: ref, action: String, note: String }],
        completionOverride: { by: ref, at: Date, reason: String },

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

        // the engagement's tasks, stage by stage (kept under the old name "milestones" so existing
        // data and links keep working). `done` mirrors status Approved / Completed.
        milestones: [taskSchema],
        stages: { type: [String], default: undefined }, // stage order from the workflow template
        workflowUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", default: null },
        workflowUpdatedAt: { type: Date, default: null },

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
