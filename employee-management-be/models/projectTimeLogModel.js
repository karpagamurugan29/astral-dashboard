import mongoose from "mongoose";

const place = { latitude: Number, longitude: Number, accuracy: Number, address: String };

// Time worked on a project (optionally on one task), with where the timer was started and stopped.
const ProjectTimeLogSchema = new mongoose.Schema(
    {
        projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Projects", required: true, index: true },
        taskId: { type: mongoose.Schema.Types.ObjectId, ref: "Task", default: null },
        employeeId: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true, index: true },
        startTime: { type: Date, required: true },
        endTime: { type: Date, default: null },
        durationMinutes: { type: Number, default: 0 },
        startLocation: place,
        stopLocation: place,
        note: { type: String, default: "", maxlength: 500 },
    },
    { timestamps: true }
);

ProjectTimeLogSchema.index({ employeeId: 1, endTime: 1 });

export default mongoose.model("ProjectTimeLog", ProjectTimeLogSchema);
