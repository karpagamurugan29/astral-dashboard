// Demo data for the audit workflow: tag demo audits' time sessions with workflow steps (in date order,
// only stages the audit has reached) and give the first demo team audit step owners, hour budgets
// and due dates. Only fills what is empty, so it is safe to re-run.
//   node scripts/demoWorkflow.js
import dotenv from "dotenv";
import mongoose from "mongoose";
import AuditEngagement from "../models/auditEngagementModel.js";
import AuditTimeLog from "../models/auditTimeLogModel.js";

dotenv.config({ quiet: true });
const STAGES = ["Planning", "Fieldwork", "Review", "Reporting", "Billing"];
const BILLING = ["invoice", "payment"];

await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
const audits = await AuditEngagement.find({ auditCode: /^DEMO/, isDeleted: false });
let tagged = 0, shaped = 0;
for (const a of audits) {
    const reached = Math.max(1, STAGES.indexOf(a.status) + 1 || STAGES.length);
    const steps = (a.milestones || []).filter((m) => !BILLING.includes(m.key) && STAGES.indexOf(m.stage) < reached);
    if (!steps.length) continue;

    // owners, budgets and due dates on the team audit used in demos
    if (a.auditCode === "DEMO-T2601" && !a.milestones.some((m) => m.assignee)) {
        const team = [a.auditManager, ...(a.teamMembers || [])];
        const work = a.milestones.filter((m) => !BILLING.includes(m.key));
        const per = Math.max(2, Math.round(((a.estimatedHours || 100) / work.length) * 2) / 2);
        const start = new Date(a.startDate || Date.now()), end = new Date(a.endDate || Date.now() + 30 * 864e5);
        work.forEach((m, i) => {
            m.assignee = m.stage === "Review" ? a.auditManager : team[(i % (team.length - 1)) + 1] || a.auditManager;
            m.estimatedHours = m.stage === "Fieldwork" ? per * 2 : per;
            m.dueDate = new Date(start.getTime() + ((end - start) * (i + 1)) / work.length);
        });
        a.workflowUpdatedAt = new Date();
        a.workflowUpdatedBy = a.auditManager;
        await a.save();
        shaped++;
    }

    // sessions without a step: spread them over the reached steps in date order
    const logs = await AuditTimeLog.find({ auditId: a._id, $or: [{ milestoneKey: { $exists: false } }, { milestoneKey: "" }, { milestoneKey: null }] }).sort({ startTime: 1 });
    for (const [i, l] of logs.entries()) {
        const s = steps[Math.min(steps.length - 1, Math.floor((i / logs.length) * steps.length))];
        await AuditTimeLog.updateOne({ _id: l._id }, { $set: { milestoneKey: s.key, milestoneLabel: s.label } });
        tagged++;
    }
}
console.log(`Workflow demo: ${tagged} sessions tagged with a step, ${shaped} audit given owners and budgets.`);
await mongoose.disconnect();

// A demo audit project grouping the team audit's company engagements (once).
{
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    const AuditProject = (await import("../models/auditProjectModel.js")).default;
    const team = await AuditEngagement.findOne({ auditCode: "DEMO-T2601" });
    if (team && !(await AuditProject.exists({ projectCode: "PRJ-DEMO-001" }))) {
        const sm = await mongoose.connection.db.collection("employees").findOne({ email: "senior.manager@astral.test" });
        const p = await AuditProject.create({ projectCode: "PRJ-DEMO-001", clientId: team.clientId, name: "[Demo] FY 2026-27 assurance", financialYear: "2026-27", manager: team.auditManager, partner: sm?._id || null, startDate: team.startDate, endDate: team.endDate, budgetHours: 160, budgetFee: 350000, status: "Active" });
        const r = await AuditEngagement.updateMany({ clientId: team.clientId, isDeleted: false, projectId: null }, { $set: { projectId: p._id } });
        console.log(`Demo project ${p.projectCode} created with ${r.modifiedCount} engagement(s).`);
    }
    await mongoose.disconnect();
}
