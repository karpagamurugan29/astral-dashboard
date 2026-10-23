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
        // what goes on the firm's invoices
        billing: {
            legalName: { type: String, default: "Astral Consulting Limited", trim: true },
            address: { type: String, default: "", trim: true },
            state: { type: String, default: "Tamil Nadu", trim: true },
            stateCode: { type: String, default: "33", trim: true },
            gstin: { type: String, default: "", trim: true, uppercase: true },
            pan: { type: String, default: "", trim: true, uppercase: true },
            email: { type: String, default: "", trim: true },
            phone: { type: String, default: "", trim: true },
            sacCode: { type: String, default: "998221", trim: true }, // accounting & auditing services
            gstRate: { type: Number, default: 18 },
            invoicePrefix: { type: String, default: "ACL", trim: true },
            paymentTermsDays: { type: Number, default: 15 },
            bank: {
                name: { type: String, default: "", trim: true },
                accountName: { type: String, default: "", trim: true },
                accountNo: { type: String, default: "", trim: true },
                ifsc: { type: String, default: "", trim: true, uppercase: true },
                branch: { type: String, default: "", trim: true },
            },
            terms: { type: String, default: "Payment due within the credit period. Please quote the invoice number with your payment. TDS, if deducted, must be deposited and the certificate shared.", trim: true },
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