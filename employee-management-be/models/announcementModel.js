import mongoose from "mongoose";

const AnnouncementSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true,
        },
        content: {
            type: String,
            required: true,
            trim: true,
        },
        postedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
            required: true,
        },
        audience: {
            type: String,
            enum: ["Everyone", "Managers", "Department"],
            default: "Everyone",
        },
        pinned: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
    }
);

export default mongoose.model("Announcement", AnnouncementSchema);
