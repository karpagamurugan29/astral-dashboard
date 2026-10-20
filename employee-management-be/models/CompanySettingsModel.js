import mongoose from "mongoose";

const CompanySettingsSchema = new mongoose.Schema(
    {
        companyName: {
            type: String,
            required: true,
        },

        officeLocations: [
            {
                name: {
                    type: String,
                    required: true,
                },

                address: {
                    type: String,
                    required: true,
                },

                latitude: {
                    type: Number,
                    required: true,
                },

                longitude: {
                    type: Number,
                    required: true,
                },

                allowedRadius: {
                    type: Number,
                    default: 100, // meters
                },

                isHeadOffice: {
                    type: Boolean,
                    default: false,
                },
            },
        ],

        workingHours: {
            requiredHours: {
                type: Number,
                default: 9,
            },

            checkInTime: {
                type: String,
                default: "09:30",
            },

            checkOutTime: {
                type: String,
                default: "18:30",
            },

            gracePeriodMinutes: {
                type: Number,
                default: 15,
            },
        },
        attendanceSettings: {
            allowWFH: {
                type: Boolean,
                default: true,
            },

            allowFieldVisit: {
                type: Boolean,
                default: true,
            },

            captureLocation: {
                type: Boolean,
                default: true,
            },

            capturePhoto: {
                type: Boolean,
                default: false,
            },

            allowMultipleCheckIn: {
                type: Boolean,
                default: false,
            },
        },
    },
    {
        timestamps: true,
    }
);

export default mongoose.model(
    "CompanySettings",
    CompanySettingsSchema
);