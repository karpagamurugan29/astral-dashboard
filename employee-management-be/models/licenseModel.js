import mongoose from "mongoose";

const LicenseSchema = new mongoose.Schema(
    {
        licenseKey: {
            type: String,
            required: true,
        },
        tier: {
            type: String,
            enum: ["Core", "Standard", "Premium"],
            default: "Core",
        },
        seats: {
            type: Number,
            default: 10,
        },
        status: {
            type: String,
            enum: ["Active", "Expired"],
            default: "Active",
        },
        activatedAt: {
            type: Date,
            default: Date.now,
        },
        expiresAt: {
            type: Date,
            required: true,
        },
    },
    {
        timestamps: true,
    }
);

export default mongoose.model("License", LicenseSchema);
