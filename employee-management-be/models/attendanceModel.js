import mongoose from "mongoose";

// One punch (check-in or check-out) with where it happened.
const punch = {
    time: { type: Date, default: null },
    latitude: Number,
    longitude: Number,
    accuracy: Number,
    address: String,
    ipAddress: String,
    device: String,
    remarks: String,
};

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

            accuracy: Number, // metres, as reported by the browser

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

            accuracy: Number,

            address: String,

            ipAddress: String,

            device: String,

            remarks: String,
        },

        // Every check-in → check-out pair of the day; someone can check in and out several
        // times (office → client site → office). checkIn above mirrors the first session's
        // check-in and checkOut the last session's check-out (null while a session is open),
        // so reports that read the day's first-in / last-out keep working. Records from before
        // sessions existed have an empty array and count as one session.
        sessions: [
            {
                mode: { type: String, enum: ["Office", "Home", "Field"] },
                checkIn: punch,
                checkOut: punch,
            },
        ],

        // Total of all closed sessions, in hours.
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