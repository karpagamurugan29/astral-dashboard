import mongoose from "mongoose";

const RegularizationSchema = new mongoose.Schema(
    {
        employeeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
            required: true,
            index: true,
        },
        attendanceDate: {
            type: String, // YYYY-MM-DD
            required: true,
        },
        requestedCheckIn: {
            type: String, // HH:mm
        },
        requestedCheckOut: {
            type: String, // HH:mm
        },
        reason: {
            type: String,
            required: true,
            trim: true,
        },
        status: {
            type: String,
            enum: ["Pending", "Approved", "Rejected"],
            default: "Pending",
        },
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

export default mongoose.model("Regularization", RegularizationSchema);
