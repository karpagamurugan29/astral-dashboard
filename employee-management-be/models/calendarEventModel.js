import mongoose from "mongoose";

// A calendar event or reminder. Personal events are seen only by their owner; project events by
// the project's team; anyone listed as assignee or participant sees the event too.
// Task deadlines are not copied here — the calendar reads them from the tasks themselves.
const ObjectId = mongoose.Schema.Types.ObjectId;

const CalendarEventSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, trim: true, maxlength: 160 },
        description: { type: String, default: "", maxlength: 4000 },
        // work types, then personal-life types (personal plans are never tied to a project)
        eventType: {
            type: String,
            enum: ["Meeting", "Reminder", "Deadline", "Project event", "Personal", "Personal meeting", "Family", "Health", "Travel", "Birthday", "Fitness", "Bills", "Study", "Other"],
            default: "Meeting",
        },
        priority: { type: String, enum: ["Low", "Medium", "High", "Critical"], default: "Medium" },
        start: { type: Date, required: true },
        end: { type: Date, required: true },
        allDay: { type: Boolean, default: false },
        timezone: { type: String, default: "Asia/Kolkata" },
        location: { type: String, default: "", maxlength: 200 },
        link: { type: String, default: "", maxlength: 500 },

        projectId: { type: ObjectId, ref: "Projects", default: null, index: true },
        taskId: { type: ObjectId, ref: "Task", default: null },
        createdBy: { type: ObjectId, ref: "Employee", required: true, index: true },
        assignee: { type: ObjectId, ref: "Employee", default: null },
        participants: [{ type: ObjectId, ref: "Employee" }],

        // minutes before the start when each person is reminded (0 = at the time)
        reminders: [{ type: Number, min: 0, max: 60 * 24 * 60 }],
        emailReminders: { type: Boolean, default: false },

        recurrence: {
            freq: { type: String, enum: ["none", "daily", "weekly", "monthly", "yearly"], default: "none" },
            interval: { type: Number, default: 1 },
            byWeekday: [{ type: Number, min: 0, max: 6 }],
            until: { type: Date, default: null },
            count: { type: Number, default: null },
        },
        // occurrences removed from a series (original start instants)
        exdates: [{ type: Date }],
        // occurrences marked done (original start instants)
        completed: [{ type: Date }],
        // an occurrence edited on its own: the series it came from and the start it replaces
        seriesId: { type: ObjectId, ref: "CalendarEvent", default: null, index: true },
        originalStart: { type: Date, default: null },

        status: { type: String, enum: ["Scheduled", "Cancelled"], default: "Scheduled", index: true },
        cancelledAt: { type: Date, default: null },
    },
    { timestamps: true }
);

CalendarEventSchema.index({ participants: 1 });
CalendarEventSchema.index({ assignee: 1 });
CalendarEventSchema.index({ start: 1, end: 1 });

export default mongoose.model("CalendarEvent", CalendarEventSchema);
