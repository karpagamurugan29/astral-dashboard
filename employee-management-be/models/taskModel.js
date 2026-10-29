import mongoose from "mongoose";

const TaskSchema = new mongoose.Schema(
    {
        projectId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Projects",
            default: null,
        },
        // a personal to-do: only its owner (createdBy) sees it, and it has no review step
        personal: { type: Boolean, default: false },
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
        // small to-do items inside the task
        checklist: [
            {
                text: { type: String, trim: true, maxlength: 200 },
                done: { type: Boolean, default: false },
            },
        ],
        labels: [{ type: String, trim: true, maxlength: 24 }],
        // position within its board column (lower first)
        order: { type: Number, default: 0 },
        completedAt: { type: Date, default: null },
        // deadline alerts already sent for the current due date (cleared when the date changes)
        dueSoonNotifiedAt: { type: Date, default: null },
        overdueNotifiedAt: { type: Date, default: null },
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
        // closing: once a Done task is checked it's closed with a note and leaves the boards
        closedAt: { type: Date, default: null },
        closedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", default: null },
        closeNote: { type: String, default: "", maxlength: 1000 },
        // tracker number shown as #T-0001 (assigned on create, backfilled for older tasks)
        taskNo: { type: Number, index: true, sparse: true },
        type: { type: String, enum: ["Task", "Issue", "Query", "Review point"], default: "Task" },
        // people following the task (notified of changes), like "Monitor" in a bug tracker
        watchers: [{ type: mongoose.Schema.Types.ObjectId, ref: "Employee" }],
        // every change, newest last
        history: [
            {
                at: { type: Date, default: Date.now },
                by: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
                action: { type: String, trim: true },   // created | status | assigned | priority | due | title | type | note | checklist | watch
                from: { type: String, default: "" },
                to: { type: String, default: "" },
                note: { type: String, default: "" },
            },
        ],
    },
    {
        timestamps: true,
    }
);

export default mongoose.model("Task", TaskSchema);
