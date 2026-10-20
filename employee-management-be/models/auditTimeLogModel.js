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
    },
    {
        timestamps: true,
    }
);

export default mongoose.model("AuditTimeLogs", auditTimeLogSchema);
