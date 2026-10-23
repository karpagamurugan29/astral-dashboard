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
        // short label printed on the sticker, e.g. AST-0007 (set automatically)
        assetTag: {
            type: String,
            trim: true,
            unique: true,
            sparse: true,
        },
        brand: { type: String, trim: true, default: "" },
        model: { type: String, trim: true, default: "" },
        condition: { type: String, enum: ["New", "Good", "Fair", "Damaged"], default: "Good" },
        purchaseDate: { type: Date, default: null },
        warrantyUntil: { type: Date, default: null },
        // every hand-over, newest last: who had it, when, who gave / took it back, in what condition
        history: [
            {
                employee: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
                assignedAt: { type: Date },
                assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
                assignNote: { type: String, default: "" },
                returnedAt: { type: Date, default: null },
                returnedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", default: null },
                returnCondition: { type: String, default: "" },
                returnNote: { type: String, default: "" },
            },
        ],
    },
    {
        timestamps: true,
    }
);

export default mongoose.model("Asset", AssetSchema);
