import mongoose from "mongoose";

const HolidaySchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        date: {
            type: Date,
            required: true,
        },
        type: {
            type: String,
            enum: ["National", "Regional", "Optional"],
            default: "National",
        },
    },
    {
        timestamps: true,
    }
);

export default mongoose.model("Holiday", HolidaySchema);
