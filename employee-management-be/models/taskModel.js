import mongoose from "mongoose";

const TaskSchema = new mongoose.Schema(
    {
        projectId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Projects",
            default: null,
        },
        title: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            default: "",
        },
        assignedTo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
            default: null,
        },
        priority: {
            type: String,
            enum: ["Low", "Medium", "High"],
            default: "Medium",
        },
        status: {
            type: String,
            enum: ["To Do", "In Progress", "In Review", "Blocked", "Done"],
            default: "To Do",
        },
        startDate: {
            type: Date,
            default: null,
        },
        dueDate: {
            type: Date,
            default: null,
        },
        estimatedHours: {
            type: Number,
            default: null,
        },
        actualHours: {
            type: Number,
            default: null,
        },
        comments: [
            {
                employeeId: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
                message: String,
                createdAt: { type: Date, default: Date.now },
            },
        ],
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
        },
    },
    {
        timestamps: true,
    }
);

export default mongoose.model("Task", TaskSchema);
