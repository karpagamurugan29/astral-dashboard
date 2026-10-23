import mongoose from "mongoose";

const projectSchema = new mongoose.Schema(
    {
        projectCode: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },

        projectName: {
            type: String,
            required: true,
            trim: true,
        },

        description: {
            type: String,
            default: "",
        },

        clientName: {
            type: String,
            default: "",
        },

        projectManager: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
            required: true,
        },

        teamMembers: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Employee",
            },
        ],

        technology: [
            {
                type: String,
            },
        ],

        startDate: {
            type: Date,
            required: true,
        },

        endDate: {
            type: Date,
            required: true,
        },

        estimatedHours: {
            type: Number,
            default: 0,
        },

        budget: {
            type: Number,
            default: 0,
        },

        priority: {
            type: String,
            enum: ["Low", "Medium", "High", "Critical"],
            default: "Medium",
        },

        status: {
            type: String,
            enum: [
                "Planning",
                "Active",
                "On Hold",
                "Completed",
                "Cancelled",
            ],
            default: "Planning",
        },

        progress: {
            type: Number,
            default: 0,
            min: 0,
            max: 100,
        },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
        },
        // where the work happens
        workMode: {
            type: String,
            enum: ["Office", "Client site", "Remote", "Hybrid"],
            default: "Office",
        },
        location: {
            siteName: { type: String, default: "" },
            address: { type: String, default: "" },
        },

        isDeleted: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
    }
);

export default mongoose.model("Projects", projectSchema);