import mongoose from "mongoose";

const TicketSchema = new mongoose.Schema(
    {
        employeeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
            required: true,
            index: true,
        },
        subject: {
            type: String,
            required: true,
            trim: true,
        },
        category: {
            type: String,
            enum: ["Payroll", "Leave", "IT Support", "HR Policy", "Attendance", "Other"],
            default: "Other",
        },
        description: {
            type: String,
            required: true,
            trim: true,
        },
        priority: {
            type: String,
            enum: ["Low", "Medium", "High"],
            default: "Medium",
        },
        status: {
            type: String,
            enum: ["Open", "In Progress", "Resolved", "Closed"],
            default: "Open",
        },
        assignedTo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
            default: null,
        },
        comments: [
            {
                employeeId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "Employee",
                },
                message: String,
                createdAt: {
                    type: Date,
                    default: Date.now,
                },
            },
        ],
        resolvedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

export default mongoose.model("Ticket", TicketSchema);
