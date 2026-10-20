import mongoose from "mongoose";

const RoleSettingSchema = new mongoose.Schema(
    {
        role: {
            type: String,
            enum: ["Admin", "HR", "Manager", "Team Lead", "Employee"],
            required: true,
            unique: true,
        },
        description: {
            type: String,
            default: "",
        },
        permissions: {
            type: [String],
            default: [],
        },
    },
    {
        timestamps: true,
    }
);

export default mongoose.model("RoleSetting", RoleSettingSchema);
