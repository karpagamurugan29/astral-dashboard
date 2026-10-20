import mongoose from "mongoose";

const AssetSchema = new mongoose.Schema(
    {
        assetName: {
            type: String,
            required: true,
            trim: true,
        },
        assetType: {
            type: String,
            enum: ["Laptop", "Desktop", "Monitor", "ID Card", "SIM Card", "Phone", "Accessory", "Other"],
            required: true,
        },
        serialNumber: {
            type: String,
            trim: true,
            unique: true,
            sparse: true,
        },
        assignedTo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
            default: null,
        },
        assignedDate: {
            type: Date,
            default: null,
        },
        returnedDate: {
            type: Date,
            default: null,
        },
        status: {
            type: String,
            enum: ["Available", "Assigned", "Returned", "Damaged", "Retired"],
            default: "Available",
        },
        notes: {
            type: String,
            trim: true,
        },
    },
    {
        timestamps: true,
    }
);

export default mongoose.model("Asset", AssetSchema);
