import mongoose from "mongoose";

const LeaveSchema = new mongoose.Schema(
    {
        employeeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
            required: true,
            index: true,
        },

        leaveType: {
            type: String,
            enum: [
                "Casual Leave",
                "Sick Leave",
                "Earned Leave",
                "Compensatory Leave",
                "Loss Of Pay",
                "Work From Home",
                "Maternity Leave",
                "Paternity Leave",
                "Marriage Leave",
                "Bereavement Leave",
                "Optional Holiday",
                "Sabbatical Leave",
                "Business Travel",
                "On Duty"
            ],
            required: true,
        },

        fromDate: {
            type: Date,
            required: true,
        },

        toDate: {
            type: Date,
            required: true,
        },

        totalDays: {
            type: Number,
            required: true,
        },

        halfDay: {
            type: Boolean,
            default: false,
        },

        session: {
            type: String,
            enum: [
                "First Half",
                "Second Half",
                "Full Day"
            ],
            default: "Full Day",
        },

        reason: {
            type: String,
            required: true,
            trim: true,
        },

        attachment: {
            type: String,
            default: "",
        },

        status: {
            type: String,
            enum: [
                "Pending",
                "Approved",
                "Rejected",
                "Cancelled"
            ],
            default: "Pending",
        },

        appliedOn: {
            type: Date,
            default: Date.now,
        },

        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
            default: null,
        },

        approvedAt: {
            type: Date,
            default: null,
        },

        rejectedAt: {
            type: Date,
            default: null,
        },

        cancelledAt: {
            type: Date,
            default: null,
        },

        managerRemarks: {
            type: String,
            default: "",
        },

        rejectionReason: {
            type: String,
            default: "",
        },

        cancellationReason: {
            type: String,
            default: "",
        },

        isCompOffEarned: {
            type: Boolean,
            default: false,
        },

        compOffAttendanceDate: {
            type: Date,
            default: null,
        }
    },
    {
        timestamps: true,
    }
);

export default mongoose.model("Leave", LeaveSchema);