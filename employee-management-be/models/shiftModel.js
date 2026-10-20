import mongoose from "mongoose";

const ShiftSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        startTime: {
            type: String,
            required: true,
        },
        endTime: {
            type: String,
            required: true,
        },
        graceMinutes: {
            type: Number,
            default: 10,
        },
    },
    {
        timestamps: true,
    }
);

export default mongoose.model("Shift", ShiftSchema);
