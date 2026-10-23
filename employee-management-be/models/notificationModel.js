import mongoose from "mongoose";

const NotificationSchema = new mongoose.Schema(
    {
        employeeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
            required: true,
            index: true,
        },
        title: {
            type: String,
            required: true,
        },
        message: {
            type: String,
            default: "",
        },
        type: {
            type: String,
            enum: ["Leave", "Expense", "Asset", "Ticket", "General", "Task", "Project", "Attendance", "Audit", "Document"],
            default: "General",
        },
        link: {
            type: String,
            default: "",
        },
        isRead: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
    }
);

export default mongoose.model("Notification", NotificationSchema);
