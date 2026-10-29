import mongoose from "mongoose";

// One reminder for one person about one occurrence of an event. The unique key (event, person,
// occurrence, offset) means re-planning an event never creates a second copy, and the claim on
// `lockedUntil` means two servers never deliver the same reminder twice.
const ObjectId = mongoose.Schema.Types.ObjectId;

const ReminderSchema = new mongoose.Schema(
    {
        eventId: { type: ObjectId, ref: "CalendarEvent", required: true },
        userId: { type: ObjectId, ref: "Employee", required: true },
        occurrence: { type: Date, required: true }, // start of the occurrence it's about
        offset: { type: Number, default: 0 }, // minutes before the start
        dueAt: { type: Date, required: true }, // when to deliver (moves when snoozed)
        status: { type: String, enum: ["Pending", "Sent", "Acknowledged", "Completed", "Dismissed", "Cancelled", "Missed"], default: "Pending" },
        snoozeCount: { type: Number, default: 0 },
        sentAt: { type: Date, default: null },
        acknowledgedAt: { type: Date, default: null },
        lockedUntil: { type: Date, default: null },
        attempts: { type: Number, default: 0 },
        delivery: {
            inApp: { type: String, default: "" }, // sent | skipped
            email: { type: String, default: "" }, // sent | skipped | off | failed: reason
            emailAttempts: { type: Number, default: 0 },
            emailRetryAt: { type: Date, default: null },
        },
        lastError: { type: String, default: "" },
    },
    { timestamps: true }
);

ReminderSchema.index({ eventId: 1, userId: 1, occurrence: 1, offset: 1 }, { unique: true });
ReminderSchema.index({ status: 1, dueAt: 1 });
ReminderSchema.index({ userId: 1, status: 1, dueAt: 1 });

export default mongoose.model("Reminder", ReminderSchema);
