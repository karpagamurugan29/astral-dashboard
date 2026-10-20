import mongoose from "mongoose";

const LeaveSettingsSchema = new mongoose.Schema(
    {
        annualLeave: {
            casual: {
                type: Number,
                default: 12
            },

            sick: {
                type: Number,
                default: 10
            },

            earned: {
                type: Number,
                default: 15
            },

            optionalHoliday: {
                type: Number,
                default: 2
            },

            workFromHome: {
                type: Number,
                default: 24
            }
        },

        compOff: {
            enabled: {
                type: Boolean,
                default: true
            },

            minimumWorkingHours: {
                type: Number,
                default: 9
            },

            expiryMonths: {
                type: Number,
                default: 3
            }
        },

        maternity: {
            enabled: {
                type: Boolean,
                default: true
            },

            maxDays: {
                type: Number,
                default: 180
            }
        },

        paternity: {
            enabled: {
                type: Boolean,
                default: true
            },

            maxDays: {
                type: Number,
                default: 15
            }
        },

        marriage: {
            enabled: {
                type: Boolean,
                default: true
            },

            maxDays: {
                type: Number,
                default: 5
            }
        },

        bereavement: {
            enabled: {
                type: Boolean,
                default: true
            },

            maxDays: {
                type: Number,
                default: 5
            }
        },

        approvalFlow: {
            managerApproval: {
                type: Boolean,
                default: true
            },

            hrApproval: {
                type: Boolean,
                default: false
            }
        }
    },
    {
        timestamps: true
    });

export default mongoose.model("LeaveSettings", LeaveSettingsSchema);