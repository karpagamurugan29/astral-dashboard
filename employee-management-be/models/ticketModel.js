import mongoose from "mongoose";

/* HR helpdesk ticket. Statuses, priorities and the transition rules live in utils/helpdesk.js;
   categories (and their SLA targets) are configured in Company settings → helpdesk. */

export const TICKET_STATUSES = ["Open", "Assigned", "In Progress", "Pending Employee", "Pending HR", "Escalated", "Resolved", "Closed", "Reopened", "Rejected"];
export const TICKET_PRIORITIES = ["Low", "Medium", "High", "Critical"];
const PRIORITY_RANK = { Critical: 0, High: 1, Medium: 2, Low: 3 };
const ref = { type: mongoose.Schema.Types.ObjectId, ref: "Employee" };

const AttachmentSchema = new mongoose.Schema({
    fileId: { type: mongoose.Schema.Types.ObjectId, required: true },
    name: { type: String, trim: true },
    size: Number,
    type: String,
    uploadedBy: ref,
    uploadedAt: { type: Date, default: Date.now },
    internal: { type: Boolean, default: false }, // attached to an internal note — staff only
    commentId: { type: mongoose.Schema.Types.ObjectId, default: null },
});

const CommentSchema = new mongoose.Schema({
    employeeId: ref,
    message: { type: String, trim: true },
    // internal notes are for HR / the assignee only and never reach the employee
    internal: { type: Boolean, default: false },
    // comment | info-request | resolution | rejection | reopen | escalation | withdrawal
    kind: { type: String, default: "comment" },
    attachments: [{ type: mongoose.Schema.Types.ObjectId }],
    createdAt: { type: Date, default: Date.now },
});

const HistorySchema = new mongoose.Schema({
    at: { type: Date, default: Date.now },
    by: { ...ref, default: null }, // null = the system (SLA job, auto-close)
    action: { type: String, required: true }, // created | assigned | status | priority | category | comment | note | attachment | feedback | sla
    from: { type: String, default: "" },
    to: { type: String, default: "" },
    note: { type: String, default: "" },
    internal: { type: Boolean, default: false },
}, { _id: false });

const TicketSchema = new mongoose.Schema(
    {
        ticketNo: { type: String, index: true, sparse: true, unique: true },
        employeeId: { ...ref, required: true, index: true },
        subject: { type: String, required: true, trim: true, maxlength: 150 },
        category: { type: String, default: "Other HR Queries", trim: true, index: true },
        description: { type: String, required: true, trim: true, maxlength: 5000 },
        priority: { type: String, enum: TICKET_PRIORITIES, default: "Medium" },
        priorityRank: { type: Number, default: 2 },
        status: { type: String, enum: TICKET_STATUSES, default: "Open", index: true },
        assignedTo: { ...ref, default: null, index: true },
        assignedBy: { ...ref, default: null },
        assignedAt: { type: Date, default: null },

        comments: [CommentSchema],
        attachments: [AttachmentSchema],
        history: [HistorySchema],

        // SLA — calendar hours from creation; the clock pauses while waiting on the employee
        responseDueAt: { type: Date, default: null },
        dueAt: { type: Date, default: null, index: true },
        pausedAt: { type: Date, default: null },
        pausedMs: { type: Number, default: 0 },
        firstResponseAt: { type: Date, default: null },
        reminderSentAt: { type: Date, default: null },
        breachedAt: { type: Date, default: null },
        escalationLevel: { type: Number, default: 0 },
        escalatedAt: { type: Date, default: null },

        resolution: { type: String, default: "", trim: true },
        rejectionReason: { type: String, default: "", trim: true },
        resolvedAt: { type: Date, default: null },
        resolvedBy: { ...ref, default: null },
        closedAt: { type: Date, default: null },
        closedBy: { ...ref, default: null },
        reopenCount: { type: Number, default: 0 },
        lastActivityAt: { type: Date, default: Date.now, index: true },

        feedback: {
            rating: { type: Number, min: 1, max: 5 },
            comment: { type: String, trim: true, default: "" },
            at: Date,
        },
    },
    { timestamps: true }
);

TicketSchema.pre("save", function () {
    this.priorityRank = PRIORITY_RANK[this.priority] ?? 2;
});

export default mongoose.model("Ticket", TicketSchema);
