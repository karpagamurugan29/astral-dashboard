import mongoose from "mongoose";

const AttendanceSchema = new mongoose.Schema(
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
            index: true,
        },

        attendanceType: {
            type: String,
            enum: ["Office", "Home", "Field"],
            required: true,
        },

        checkIn: {
            time: {
                type: Date,
                default: null,
            },

            latitude: Number,

            longitude: Number,

            address: String,

            ipAddress: String,

            device: String,

            remarks: String,
        },

        checkOut: {
            time: {
                type: Date,
                default: null,
            },

            latitude: Number,

            longitude: Number,

            address: String,

            ipAddress: String,

            device: String,

            remarks: String,
        },

        workingHours: {
            type: Number,
            default: 0,
        },

        lateByMinutes: {
            type: Number,
            default: 0,
        },

        overtimeHours: {
            type: Number,
            default: 0,
        },

        status: {
            type: String,
            enum: [
                "Present",
                "Absent",
                "Half Day",
                "Late",
                "On Leave"
            ],
            default: "Present",
        },

        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
            default: null,
        }
    },
    {
        timestamps: true,
    }
);

AttendanceSchema.index(
    {
        employeeId: 1,
        attendanceDate: 1,
    },
    {
        unique: true,
    }
);

export default mongoose.model("Attendance", AttendanceSchema);