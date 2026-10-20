import mongoose from "mongoose";

// Extra access on top of role permissions (roleSettingModel):
//  - scope "department":  every employee in that department (target = department name) gets `allow`.
//  - scope "designation": every employee with that designation (target = designation name) gets `allow`.
//  - scope "employee":   one person (target = employee _id) gets `allow` and loses `deny`.
// Effective access = (role ∪ department ∪ designation ∪ person allow) − person deny. Admin is never restricted.
const AccessRuleSchema = new mongoose.Schema(
    {
        scope: {
            type: String,
            enum: ["department", "designation", "employee"],
            required: true,
        },
        target: {
            type: String,
            required: true,
            trim: true,
        },
        allow: {
            type: [String],
            default: [],
        },
        deny: {
            type: [String],
            default: [],
        },
        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
        },
    },
    {
        timestamps: true,
    }
);

AccessRuleSchema.index({ scope: 1, target: 1 }, { unique: true });

export default mongoose.model("AccessRule", AccessRuleSchema);
