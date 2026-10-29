import mongoose from "mongoose";

// Each person's notification choices. Missing record = the defaults below.
const NotificationPrefSchema = new mongoose.Schema(
    {
        employeeId: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true, unique: true },
        inApp: { type: Boolean, default: true },
        email: { type: Boolean, default: false },
        timezone: { type: String, default: "Asia/Kolkata" },
        defaultReminder: { type: Number, default: 15 }, // minutes before
        quietStart: { type: String, default: "" }, // "22:00" — empty = no quiet hours
        quietEnd: { type: String, default: "" }, // "07:00"
        dailySummary: { type: Boolean, default: true },
        snoozeDefault: { type: Number, default: 10 },
        // categories the person has switched off
        muted: [{ type: String, enum: ["Reminder", "Task", "Project", "Calendar"] }],
    },
    { timestamps: true }
);

export default mongoose.model("NotificationPref", NotificationPrefSchema);
