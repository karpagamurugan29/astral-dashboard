import mongoose from "mongoose";

// A versioned audit workflow template. Versions of one template share a `family`; exactly one
// version per family is Active at a time. Engagements copy the tasks at creation and remember
// { id, family, version }, so editing a template never changes running engagements silently.
const taskTemplate = new mongoose.Schema({
    key: { type: String, required: true },
    label: { type: String, required: true, maxlength: 140 },
    stage: { type: String, required: true },
    description: { type: String, default: "", maxlength: 4000 },
    instructions: { type: String, default: "", maxlength: 4000 },
    deliverables: [{ type: String, maxlength: 200 }],
    checklist: [{ type: String, maxlength: 200 }],
    responsibleRole: { type: String, default: "" },
    reviewerRole: { type: String, default: "" },
    estimatedHours: { type: Number, default: 0 },
    offsetDays: { type: Number, default: 0 }, // target = engagement start + offset
    priority: { type: String, enum: ["Low", "Medium", "High", "Critical"], default: "Medium" },
    dependsOn: [{ type: String }],
    mandatory: { type: Boolean, default: true },
    optional: { type: Boolean, default: false },
    condition: { type: String, default: "" }, // when an optional step applies, in words
    requiresReview: { type: Boolean, default: false },
    requiresEvidence: { type: Boolean, default: false },
}, { _id: false });

const workflowTemplateSchema = new mongoose.Schema(
    {
        family: { type: String, required: true, index: true },
        name: { type: String, required: true, trim: true, maxlength: 120 },
        description: { type: String, default: "", maxlength: 1000 },
        auditType: { type: String, default: "" }, // "" = any type
        scope: {
            clientId: { type: mongoose.Schema.Types.ObjectId, ref: "AuditClients", default: null },
            projectId: { type: mongoose.Schema.Types.ObjectId, ref: "AuditProjects", default: null },
        },
        version: { type: Number, default: 1 },
        status: { type: String, enum: ["Draft", "Active", "Inactive"], default: "Draft", index: true },
        stages: { type: [String], default: ["Planning", "Fieldwork", "Review", "Reporting", "Billing"] },
        tasks: [taskTemplate],
        escalation: {
            remindBeforeDays: { type: Number, default: 1 },
            escalateAfterDays: { type: Number, default: 2 }, // overdue this long → tell the manager
            escalateTo: { type: String, enum: ["manager", "partner"], default: "manager" },
        },
        changeNote: { type: String, default: "" },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
        activatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
        activatedAt: Date,
    },
    { timestamps: true }
);

export default mongoose.model("WorkflowTemplates", workflowTemplateSchema);
