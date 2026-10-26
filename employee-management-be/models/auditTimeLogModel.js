import mongoose from "mongoose";

// One work session on an audit: created when the employee presses Start, closed
// (endTime + durationMinutes) when they press Stop. endTime === null means the
// timer is still running. An employee can have at most one running session.
const auditTimeLogSchema = new mongoose.Schema(
    {
        auditId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AuditEngagements",
            required: true,
            index: true,
        },

        employeeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
            required: true,
            index: true,
        },

        // timer (start/stop) or manual entry
        entryType: { type: String, enum: ["timer", "manual"], default: "timer" },
        workDate: { type: String, default: "" }, // YYYY-MM-DD (company time)
        breakMinutes: { type: Number, default: 0 },
        // timesheet: Draft → Submitted → Approved / Rejected
        status: { type: String, enum: ["Draft", "Submitted", "Approved", "Rejected"], default: "Draft", index: true },
        submittedAt: { type: Date, default: null },
        approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", default: null },
        approvedAt: { type: Date, default: null },
        reviewComment: { type: String, default: "" },
        // corrections to approved time are recorded, never silent
        adjustments: [{
            by: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" }, at: { type: Date, default: Date.now },
            fromMinutes: Number, toMinutes: Number, reason: String,
            status: { type: String, enum: ["Requested", "Applied", "Declined"], default: "Applied" },
            decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" }, decidedAt: Date,
        }],
        // the workflow step this session was spent on (label kept in case the step is later renamed or removed)
        milestoneKey: { type: String, default: "", index: true },
        milestoneLabel: { type: String, default: "" },

        startTime: {
            type: Date,
            required: true,
        },

        endTime: {
            type: Date,
            default: null,
        },

        durationMinutes: {
            type: Number,
            default: 0,
        },

        // Where the employee was when they pressed Start / Stop.
        startLocation: {
            latitude: Number,
            longitude: Number,
            accuracy: Number,
            address: String,
        },

        stopLocation: {
            latitude: Number,
            longitude: Number,
            accuracy: Number,
            address: String,
        },

        note: {
            type: String,
            default: "",
            trim: true,
        },

        // forgotten-timer protection: sessions the system stopped, or that ran very long, wait for
        // a manager's review and are left out of bills until then
        autoStopped: { type: Boolean, default: false },
        needsReview: { type: Boolean, default: false },
        reviewReason: { type: String, default: "" },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", default: null },
        reviewedAt: { type: Date, default: null },
        originalMinutes: { type: Number, default: null },
        billable: { type: Boolean, default: true },
        billedInvoice: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice", default: null },
    },
    {
        timestamps: true,
    }
);

export default mongoose.model("AuditTimeLogs", auditTimeLogSchema);
