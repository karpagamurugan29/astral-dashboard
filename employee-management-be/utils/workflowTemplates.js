import WorkflowTemplate from "../models/workflowTemplateModel.js";
import CompanySettings from "../models/CompanySettingsModel.js";
import employeeModel from "../models/employeeModel.js";

/* Workflow templates: the firm standard (seeded once), per-type / per-company / per-project templates,
   picking the right one for a new engagement, and turning a template into engagement tasks. */

export const DEFAULT_STAGES = ["Planning", "Fieldwork", "Review", "Reporting", "Billing"];

// key, label, stage, responsible, reviewer, hours, offsetDays, dependsOn, review, evidence
const FIRM_STANDARD = [
    ["letter", "Engagement letter signed", "Planning", "Manager", "", 2, 0, [], false, true],
    ["team", "Team and budget assigned", "Planning", "Manager", "", 1, 1, ["letter"], false, false],
    ["risk", "Risk assessment and materiality", "Planning", "Senior Consultant", "Manager", 6, 4, ["team"], true, true],
    ["plan", "Audit plan approved", "Planning", "Manager", "Senior Manager", 4, 6, ["risk"], true, true],
    ["opening", "Opening meeting with the client", "Fieldwork", "Senior Consultant", "", 2, 8, ["plan"], false, false],
    ["walkthrough", "Walkthroughs and controls testing", "Fieldwork", "Consultant", "Senior Consultant", 16, 14, ["opening"], true, true],
    ["vouching", "Substantive testing and vouching", "Fieldwork", "Junior Consultant", "Senior Consultant", 24, 20, ["opening"], true, true],
    ["confirm", "Third-party confirmations", "Fieldwork", "Associate", "Consultant", 6, 20, ["opening"], true, true],
    ["mgr-review", "Manager review of working papers", "Review", "Manager", "", 8, 24, ["walkthrough", "vouching", "confirm"], false, false],
    ["points", "Review points cleared", "Review", "Senior Consultant", "Manager", 6, 27, ["mgr-review"], true, false],
    ["partner", "Partner review and sign-off", "Review", "Company Partner", "", 3, 30, ["points"], false, false],
    ["draft", "Draft report shared with the client", "Reporting", "Manager", "Director", 4, 32, ["partner"], true, true],
    ["mrl", "Management representation letter received", "Reporting", "Senior Consultant", "", 1, 34, ["draft"], false, true],
    ["final", "Final report signed and issued", "Reporting", "Director", "", 2, 36, ["draft", "mrl"], false, true],
    ["invoice", "Invoice raised", "Billing", "Accounts", "", 0, 36, [], false, false],
    ["payment", "Payment received", "Billing", "Accounts", "", 0, 50, ["invoice"], false, false],
    ["archive", "Working papers archived", "Billing", "Associate", "Manager", 2, 40, ["final"], true, false],
];
export const firmStandardTasks = () => FIRM_STANDARD.map(([key, label, stage, responsibleRole, reviewerRole, estimatedHours, offsetDays, dependsOn, requiresReview, requiresEvidence]) =>
    ({ key, label, stage, responsibleRole, reviewerRole, estimatedHours, offsetDays, dependsOn, requiresReview, requiresEvidence, mandatory: true, optional: false, priority: "Medium", deliverables: [], checklist: [], description: "", instructions: "", condition: "" }));

let seeded = false;
// Seed the firm standard and turn any per-type standards saved in settings into templates.
export const ensureTemplates = async () => {
    if (seeded) return;
    seeded = true;
    try {
        if (!(await WorkflowTemplate.exists({ family: "firm-standard" }))) {
            await WorkflowTemplate.create({ family: "firm-standard", name: "Firm standard audit", description: "The firm's default five-stage audit workflow.", auditType: "", version: 1, status: "Active", tasks: firmStandardTasks(), changeNote: "Seeded from the built-in checklist", activatedAt: new Date() });
        }
        const saved = (await CompanySettings.findOne().select("auditWorkflows").lean())?.auditWorkflows || {};
        for (const [type, steps] of Object.entries(saved)) {
            const family = `type-${type.toLowerCase()}`;
            if (!Array.isArray(steps) || !steps.length || (await WorkflowTemplate.exists({ family }))) continue;
            const std = new Map(firmStandardTasks().map((t) => [t.key, t]));
            await WorkflowTemplate.create({ family, name: `${type} audit`, auditType: type, version: 1, status: "Active", activatedAt: new Date(), changeNote: "Imported from the saved standard workflow", tasks: steps.map((s) => ({ ...(std.get(s.key) || {}), key: s.key, label: s.label, stage: s.stage, estimatedHours: s.estimatedHours || std.get(s.key)?.estimatedHours || 0, dependsOn: (std.get(s.key)?.dependsOn || []).filter((d) => steps.some((x) => x.key === d)) })) });
        }
    } catch (err) {
        seeded = false;
        console.error("Workflow template seed failed:", err.message);
    }
};

// Most specific active template: project → company → audit type → firm standard
export const pickTemplate = async ({ auditType, clientId, projectId }) => {
    await ensureTemplates();
    const active = await WorkflowTemplate.find({ status: "Active" }).lean();
    const score = (t) => {
        if (t.scope?.projectId) return projectId && String(t.scope.projectId) === String(projectId) ? 40 : -1;
        if (t.scope?.clientId) return clientId && String(t.scope.clientId) === String(clientId) ? (t.auditType && t.auditType !== auditType ? -1 : 30) : -1;
        if (t.auditType) return t.auditType === auditType ? 20 : -1;
        return 10;
    };
    return active.map((t) => [t, score(t)]).filter(([, s]) => s >= 0).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
};

// Template → engagement tasks. People are matched to a step's responsible designation when exactly
// one person on the team has it (the manager covers "Manager" steps); reviewers likewise.
export const instantiate = async (template, { startDate, auditManager, teamMembers = [] } = {}) => {
    const ids = [auditManager, ...teamMembers].filter(Boolean).map(String);
    const people = ids.length ? await employeeModel.find({ _id: { $in: ids } }).select("designation").lean() : [];
    const byRole = (role) => {
        if (!role) return null;
        if (/^manager$/i.test(role) && auditManager) return auditManager;
        const hits = people.filter((p) => (p.designation || "").toLowerCase() === role.toLowerCase());
        return hits.length === 1 ? hits[0]._id : null;
    };
    const start = startDate ? new Date(startDate) : null;
    return (template.tasks || []).map((t) => {
        const assignee = byRole(t.responsibleRole);
        return {
            key: t.key, label: t.label, stage: t.stage, description: t.description || "", instructions: t.instructions || "",
            deliverables: t.deliverables || [], checklist: (t.checklist || []).map((text) => ({ text, done: false })),
            responsibleRole: t.responsibleRole || "", reviewerRole: t.reviewerRole || "",
            estimatedHours: t.estimatedHours || 0, priority: t.priority || "Medium", dependsOn: t.dependsOn || [],
            mandatory: t.mandatory !== false, optional: !!t.optional, requiresReview: !!t.requiresReview, requiresEvidence: !!t.requiresEvidence,
            dueDate: start ? new Date(start.getTime() + (t.offsetDays || 0) * 864e5) : null,
            assignee, reviewer: t.requiresReview ? byRole(t.reviewerRole) : null,
            status: assignee ? "Assigned" : "Not Started", done: false,
            history: [{ at: new Date(), action: "created", to: assignee ? "Assigned" : "Not Started", note: `From template “${template.name}” v${template.version}` }],
        };
    });
};

// What applying a newer template version to a running engagement would do (nothing is deleted)
export const migrationPlan = (engagementTasks, template) => {
    const current = new Map(engagementTasks.map((t) => [t.key, t]));
    const next = new Map((template.tasks || []).map((t) => [t.key, t]));
    const add = [], update = [], keep = [], retire = [];
    for (const t of template.tasks || []) {
        const cur = current.get(t.key);
        if (!cur) add.push(t);
        else if (["Not Started", "Assigned", "Ready"].includes(cur.status) && (cur.label !== t.label || cur.stage !== t.stage || (cur.estimatedHours || 0) !== (t.estimatedHours || 0) || JSON.stringify(cur.dependsOn || []) !== JSON.stringify(t.dependsOn || []) || !!cur.requiresReview !== !!t.requiresReview)) update.push(t);
        else keep.push(cur);
    }
    for (const cur of engagementTasks) if (!next.has(cur.key)) (["Not Started", "Assigned", "Ready"].includes(cur.status) && !(cur.attachments || []).length ? retire : keep).push(cur);
    return { add, update, keep, retire };
};
