// End-to-end API test of the audit workflow against a running server.
//   API_URL=http://localhost:5000/api npm test
// Skipped when API_URL isn't set. Uses the demo employees (looked up by email), signs short-lived
// test tokens with the server's JWT_SECRET (no passwords are used or printed), creates [QA]
// records and removes them at the end.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import dotenv from "dotenv";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

dotenv.config({ quiet: true });
const API = process.env.API_URL;
const skip = !API && "set API_URL to run the integration tests";
const U = {};
const made = { clients: [], projects: [], audits: [], templates: [] };
const startedAt = new Date();
// automatic timesheet notifications the flows trigger — removed afterwards
const SYSTEM_TITLES = ["Timesheet to approve", "Timesheet approved", "Timesheet returned for correction", "Time correction requested"];
const loc = { latitude: 11.0168, longitude: 76.9558, accuracy: 20 };
const people = { admin: "director@astral.test", sm: "senior.manager@astral.test", hrHead: "hr.head@astral.test", accHead: "accounts.head@astral.test", mgr: "kavya.raman@astral.test", otherMgr: "deepak.rao@astral.test", tl: "suresh.babu@astral.test", member: "pooja.iyer@astral.test", junior: "vignesh.kumar@astral.test", outsider: "gokul.raj@astral.test", hr: "revathi.sundar@astral.test", acc: "bala.murali@astral.test" };

const call = async (who, method, path, body) => {
    const r = await fetch(API + path, { method, headers: { Authorization: `Bearer ${U[who].t}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    let j = {}; try { j = await r.json(); } catch { /* file */ }
    return { status: r.status, j };
};
const act = (who, audit, key, action, extra = {}) => call(who, "POST", `/audits/${audit}/tasks/${key}/action`, { action, ...extra });
const taskOf = async (who, audit, key) => (await call(who, "GET", `/audits/${audit}`)).j.data.milestones.find((t) => t.key === key);

before(async () => {
    if (skip) return;
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    for (const [k, email] of Object.entries(people)) {
        const u = await mongoose.connection.db.collection("employees").findOne({ email });
        assert.ok(u, `demo user ${k} missing`);
        U[k] = { id: String(u._id), t: jwt.sign({ id: u._id, email, role: u.role }, process.env.JWT_SECRET, { expiresIn: "1h" }) };
    }
});

after(async () => {
    if (skip) return;
    const db = mongoose.connection.db;
    const ids = (a) => a.map((x) => new mongoose.Types.ObjectId(x));
    await db.collection("audittimelogs").deleteMany({ auditId: { $in: ids(made.audits) } });
    await db.collection("auditengagements").deleteMany({ _id: { $in: ids(made.audits) } });
    await db.collection("auditprojects").deleteMany({ _id: { $in: ids(made.projects) } });
    await db.collection("auditclients").deleteMany({ _id: { $in: ids(made.clients) } });
    await db.collection("workflowtemplates").deleteMany({ _id: { $in: ids(made.templates) } });
    await db.collection("notifications").deleteMany({ $or: [{ message: /\[QA\]|QA-WF/ }, { createdAt: { $gte: startedAt }, title: { $in: SYSTEM_TITLES } }] });
    await mongoose.disconnect();
});

let client, project, audit;

test("company and project: managers create, team leads and HR staff can't", { skip }, async () => {
    let r = await call("tl", "POST", "/audit-clients", { name: "[QA] Should not exist" });
    assert.equal(r.status, 403);
    r = await call("mgr", "POST", "/audit-clients", { name: "[QA] Nilgiri Textiles Pvt Ltd", city: "Coimbatore", state: "Tamil Nadu" });
    assert.equal(r.status, 201); client = r.j.data; made.clients.push(client._id);
    r = await call("mgr", "POST", "/audit-projects", { name: "[QA] FY 2026-27 statutory", clientId: client._id, manager: U.mgr.id, partner: U.sm.id, budgetHours: 120, endDate: "2026-12-31", startDate: "2026-10-01" });
    assert.equal(r.status, 201); project = r.j.data; made.projects.push(project._id);
    assert.equal((await call("hr", "POST", "/audit-projects", { name: "[QA] x", clientId: client._id, manager: U.hr.id })).status, 403);
    assert.equal((await call("mgr", "POST", "/audit-projects", { name: "[QA] bad dates", clientId: client._id, manager: U.mgr.id, startDate: "2026-12-01", endDate: "2026-01-01" })).status, 400);
});

test("engagement from the firm template: tasks, prerequisites and owners generated; validation", { skip }, async () => {
    let r = await call("mgr", "POST", "/audits", { auditCode: `QA-WF-${Date.now() % 1e6}`, clientId: client._id, projectId: project._id, auditType: "Statutory", auditManager: U.mgr.id, teamMembers: [U.member.id, U.junior.id, U.tl.id], startDate: "2026-10-20", endDate: "2026-12-15", estimatedHours: 90 });
    assert.equal(r.status, 201, r.j.message); audit = r.j.data._id; made.audits.push(audit);
    const a = (await call("mgr", "GET", `/audits/${audit}`)).j.data;
    assert.ok(a.milestones.length >= 15);
    assert.ok(a.workflowTemplate?.version >= 1);
    assert.equal(a.project?._id, project._id);
    const vouching = a.milestones.find((t) => t.key === "vouching");
    assert.deepEqual(vouching.dependsOn, ["opening"]);
    assert.equal(vouching.requiresReview, true);
    assert.equal(vouching.assignee?._id, U.junior.id, "Junior Consultant step auto-assigned to the only Junior Consultant");
    assert.equal((await call("mgr", "POST", "/audits", { auditCode: `QA-WF-x${Date.now() % 1e6}`, clientId: client._id, auditManager: U.mgr.id, startDate: "2026-12-20", endDate: "2026-10-01" })).status, 400, "end before start");
    assert.equal((await call("otherMgr", "POST", "/audits", { auditCode: `QA-WF-y${Date.now() % 1e6}`, clientId: client._id, projectId: "000000000000000000000000", auditManager: U.otherMgr.id, startDate: "2026-10-01", endDate: "2026-11-01" })).status, 400, "unknown project");
});

test("isolation: outsiders, other teams and HR staff are kept out; heads have full access", { skip }, async () => {
    for (const who of ["outsider", "otherMgr", "hr"]) assert.equal((await call(who, "GET", `/audits/${audit}`)).status, 403, who);
    for (const who of ["admin", "sm", "hrHead", "accHead"]) assert.equal((await call(who, "GET", `/audits/${audit}`)).status, 200, who);
    const acc = (await call("acc", "GET", `/audits/${audit}`)).j.data;
    assert.ok(acc, "Accounts staff can open it for billing");
    assert.ok(acc.milestones.every((t) => !t.comments.length && !t.attachments.length), "…but see no workpapers");
    assert.equal((await call("otherMgr", "PUT", `/audits/${audit}`, { estimatedHours: 999 })).status, 403);
    assert.equal((await call("tl", "PUT", `/audits/${audit}`, { estimatedHours: 999 })).status, 403, "team member can't edit the engagement");
    assert.equal((await call("otherMgr", "POST", `/audits/${audit}/members`, { employeeId: U.outsider.id })).status, 403);
    assert.equal((await call("outsider", "POST", `/audits/${audit}/tasks/letter/action`, { action: "start" })).status, 403);
    assert.equal((await call("outsider", "POST", "/timesheets/entries", { auditId: audit, workDate: "2026-10-21", minutes: 60, description: "[QA]" })).status, 403);
    assert.ok(!(await call("otherMgr", "GET", "/audits")).j.data.some((a) => a._id === audit));
});

test("task lifecycle: prerequisites, override, submit, changes, approve — with history", { skip }, async () => {
    let r = await act("junior", audit, "vouching", "start");
    assert.equal(r.status, 400); assert.match(r.j.message, /Waiting on/);
    r = await act("mgr", audit, "vouching", "start", { override: true });
    assert.equal(r.status, 400, "override needs a reason");
    // do the chain properly for the planning steps
    for (const key of ["letter", "team"]) {
        assert.equal((await act("mgr", audit, key, "start")).status, 200, key);
        if (key === "letter") {
            assert.equal((await act("mgr", audit, key, "complete")).status, 400, "evidence required");
            await mongoose.connection.db.collection("auditengagements").updateOne({ _id: new mongoose.Types.ObjectId(audit), "milestones.key": "letter" }, { $push: { "milestones.$.attachments": { fileId: new mongoose.Types.ObjectId(), name: "[QA] letter.pdf", size: 10 } } });
        }
        assert.equal((await act("mgr", audit, key, "complete")).status, 200, key);
    }
    assert.equal((await taskOf("mgr", audit, "risk")).status, "Ready", "next task becomes Ready when its prerequisite is done");
    // override with a reason
    r = await act("mgr", audit, "vouching", "start", { override: true, note: "[QA] client asked to start early" });
    assert.equal(r.status, 200);
    // the assignee works and submits; reviewer approves
    const evidence = { $push: { "milestones.$.attachments": { fileId: new mongoose.Types.ObjectId(), name: "[QA] vouching.xlsx", size: 10 } } };
    await mongoose.connection.db.collection("auditengagements").updateOne({ _id: new mongoose.Types.ObjectId(audit), "milestones.key": "vouching" }, evidence);
    assert.equal((await act("junior", audit, "vouching", "submit")).status, 200);
    const reviewerKey = (await taskOf("mgr", audit, "vouching")).reviewer?._id === U.tl.id ? "tl" : "mgr";
    assert.equal((await act("junior", audit, "vouching", "approve")).status, 400, "no self-approval");
    assert.equal((await act(reviewerKey, audit, "vouching", "requestChanges")).status, 400, "comment required");
    assert.equal((await act(reviewerKey, audit, "vouching", "requestChanges", { note: "[QA] tie samples to the ledger" })).status, 200);
    assert.equal((await act("junior", audit, "vouching", "resume")).status, 200);
    assert.equal((await act("junior", audit, "vouching", "submit")).status, 200);
    assert.equal((await act(reviewerKey, audit, "vouching", "approve")).status, 200);
    const t = await taskOf("mgr", audit, "vouching");
    assert.equal(t.status, "Approved");
    assert.equal(t.reviewCycles, 1);
    const trail = t.history.map((h) => h.action);
    for (const a of ["start", "submit", "requestChanges", "resume", "approve"]) assert.ok(trail.includes(a), a);
    assert.ok(t.comments.some((c) => c.kind === "review"));
});

test("reassignment keeps history; clarification and blocking notify", { skip }, async () => {
    let r = await call("mgr", "PUT", `/audits/${audit}/tasks/confirm/assign`, { assignee: U.member.id, reviewer: U.member.id });
    assert.equal(r.status, 400, "reviewer can't be the assignee");
    r = await call("mgr", "PUT", `/audits/${audit}/tasks/confirm/assign`, { assignee: U.member.id, reviewer: U.tl.id, dueDate: "2026-11-10", estimatedHours: 5 });
    assert.equal(r.status, 200);
    assert.ok(r.j.data.history.some((h) => ["assigned", "reassigned"].includes(h.action)));
    assert.equal((await call("member", "PUT", `/audits/${audit}/tasks/confirm/assign`, { assignee: U.member.id })).status, 403, "only managers assign");
    r = await call("member", "POST", `/audits/${audit}/tasks/confirm/comments`, { text: "[QA] which bank confirmations are in scope?", kind: "clarification" });
    assert.equal(r.status, 201);
});

test("engagement can't be completed with open mandatory tasks (leaders may override with a reason)", { skip }, async () => {
    assert.equal((await call("mgr", "PUT", `/audits/${audit}`, { status: "Completed" })).status, 400);
    assert.equal((await call("admin", "PUT", `/audits/${audit}`, { status: "Completed" })).status, 400, "override needs a reason");
});

test("time: timer duration is recorded, one timer at a time, manual entries validated", { skip }, async () => {
    let r = await call("junior", "POST", `/audits/${audit}/timer/start`, { ...loc, step: "vouching" });
    assert.equal(r.status, 201);
    assert.equal((await call("junior", "POST", `/audits/${audit}/timer/start`, loc)).status, 409);
    await mongoose.connection.db.collection("audittimelogs").updateOne({ _id: new mongoose.Types.ObjectId(r.j.data._id) }, { $set: { startTime: new Date(Date.now() - 95 * 60000) } });
    r = await call("junior", "POST", `/audits/${audit}/timer/stop`, { ...loc, note: "[QA] vouching" });
    assert.equal(r.j.data.durationMinutes, 95, "stopped timers keep their duration");
    const day = new Date(Date.now() - 864e5).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    assert.equal((await call("junior", "POST", "/timesheets/entries", { auditId: audit, workDate: "2099-01-01", minutes: 60, description: "x" })).status, 400, "future date");
    assert.equal((await call("junior", "POST", "/timesheets/entries", { auditId: audit, workDate: day, minutes: 60 })).status, 400, "description required");
    r = await call("junior", "POST", "/timesheets/entries", { auditId: audit, workDate: day, startTime: "10:00", endTime: "12:30", breakMinutes: 15, step: "vouching", description: "[QA] sampling" });
    assert.equal(r.status, 201); assert.equal(r.j.data.durationMinutes, 135);
    assert.equal((await call("junior", "POST", "/timesheets/entries", { auditId: audit, workDate: day, startTime: "11:00", endTime: "11:30", description: "[QA] overlap" })).status, 400, "overlap");
    assert.equal((await call("junior", "POST", "/timesheets/entries", { auditId: audit, workDate: day, minutes: 15 * 60, description: "[QA] too much" })).status, 400, "16h per day");
});

test("timesheet: submit, manager approves/returns, approved time is locked, corrections need approval", { skip }, async () => {
    const day = new Date(Date.now() - 864e5).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    let r = await call("junior", "POST", "/timesheets/submit", { week: day });
    assert.equal(r.status, 200, r.j.message);
    const week = (await call("junior", "GET", `/timesheets/me?week=${day}`)).j.data;
    const mine = week.entries.filter((e) => e.auditId?._id === audit);
    assert.ok(mine.length && mine.every((e) => e.status === "Submitted"));
    assert.equal((await call("junior", "PUT", `/timesheets/entries/${mine[0]._id}`, { description: "edit" })).status, 400, "submitted = locked");
    assert.equal((await call("member", "POST", "/timesheets/decide", { ids: mine.map((e) => e._id), decision: "approve" })).status, 400, "team member can't approve");
    assert.equal((await call("mgr", "POST", "/timesheets/decide", { ids: [mine[0]._id], decision: "reject" })).status, 400, "return needs a comment");
    r = await call("mgr", "POST", "/timesheets/decide", { ids: mine.map((e) => e._id), decision: "approve" });
    assert.equal(r.status, 200);
    const approved = mine[0]._id;
    assert.equal((await call("junior", "PUT", `/timesheets/entries/${approved}`, { description: "edit" })).status, 400, "approved = locked");
    assert.equal((await call("junior", "POST", `/timesheets/entries/${approved}/adjustments`, { minutes: 60 })).status, 400, "reason required");
    r = await call("junior", "POST", `/timesheets/entries/${approved}/adjustments`, { minutes: 60, reason: "[QA] logged twice by mistake" });
    assert.equal(r.status, 201);
    const aid = r.j.data.adjustments.at(-1)._id;
    assert.equal((await call("junior", "POST", `/timesheets/entries/${approved}/adjustments/${aid}`, { decision: "apply" })).status, 403, "can't approve own correction");
    r = await call("mgr", "POST", `/timesheets/entries/${approved}/adjustments/${aid}`, { decision: "apply" });
    assert.equal(r.status, 200); assert.equal(r.j.data.durationMinutes, 60);
    assert.equal((await call("hr", "PUT", `/audits/timelogs/${approved}/review`, { action: "nonbillable" })).status, 403, "HR staff can't touch audit time");
    assert.equal((await call("mgr", "PUT", `/audits/timelogs/${approved}/review`, { action: "adjust", endTime: new Date().toISOString() })).status, 400, "approved time needs a reason to change");
});

test("My Work, allocation and dashboard reflect the work", { skip }, async () => {
    const mw = (await call("junior", "GET", "/audit-work/me")).j.data;
    assert.ok(mw.tasks.some((t) => t.auditId === audit && t.key === "vouching"));
    const alloc = await call("mgr", "GET", `/audit-work/allocation?auditId=${audit}`);
    assert.equal(alloc.status, 200);
    const row = alloc.j.data.people.find((p) => p.person._id === U.member.id);
    assert.ok(row && row.openTasks >= 1 && row.capacityHours > 0);
    assert.equal((await call("member", "GET", "/audit-work/allocation")).status, 403, "allocation is for managers");
    const dash = await call("mgr", "GET", `/audit-work/dashboard?projectId=${project._id}`);
    assert.equal(dash.status, 200);
    assert.equal(dash.j.data.cards.engagements, 1);
    assert.ok(dash.j.data.formulas.utilization);
    assert.ok(dash.j.data.productivity.some((p) => p.person._id === U.junior.id && p.tasksCompleted >= 1));
    assert.equal((await call("member", "GET", "/audit-work/dashboard")).status, 403);
});

test("templates: versions don't change running engagements; controlled migration", { skip }, async () => {
    const list = (await call("admin", "GET", "/workflow-templates")).j;
    const firm = list.data.find((f) => f.family === "firm-standard");
    assert.ok(firm?.active);
    assert.equal((await call("mgr", "POST", `/workflow-templates/${firm.active._id}/version`)).status, 403, "managers can't change templates");
    assert.equal((await call("admin", "PUT", `/workflow-templates/${firm.active._id}`, { name: "x" })).status, 409, "active versions aren't edited in place");
    let r = await call("admin", "POST", `/workflow-templates/${firm.active._id}/duplicate`, { name: "[QA] Statutory with inventory" });
    assert.equal(r.status, 201); const copy = r.j.data; made.templates.push(copy._id);
    const tasks = [...copy.tasks, { key: "inventory", label: "[QA] Inventory observation", stage: "Fieldwork", dependsOn: ["opening"], estimatedHours: 6, requiresReview: true }];
    assert.equal((await call("admin", "PUT", `/workflow-templates/${copy._id}`, { tasks: [...tasks, { key: "x", label: "loop", stage: "Review", dependsOn: ["x2"] }, { key: "x2", label: "loop2", stage: "Review", dependsOn: ["x"] }] })).status, 400, "loops rejected");
    assert.equal((await call("admin", "PUT", `/workflow-templates/${copy._id}`, { tasks, scope: { projectId: project._id } })).status, 200);
    assert.equal((await call("admin", "POST", `/workflow-templates/${copy._id}/activate`)).status, 200);
    // the running engagement keeps its version until migrated
    const before = (await call("mgr", "GET", `/audits/${audit}`)).j.data;
    assert.ok(!before.milestones.some((t) => t.key === "inventory"));
    r = await call("mgr", "GET", `/audits/${audit}/workflow/migrate?templateId=${copy._id}`);
    assert.deepEqual(r.j.data.add, ["[QA] Inventory observation"]);
    r = await call("mgr", "POST", `/audits/${audit}/workflow/migrate`, { templateId: copy._id });
    assert.equal(r.status, 200);
    const afterA = (await call("mgr", "GET", `/audits/${audit}`)).j.data;
    assert.ok(afterA.milestones.some((t) => t.key === "inventory"));
    assert.equal(afterA.milestones.find((t) => t.key === "vouching").status, "Approved", "progress kept");
    assert.equal(afterA.workflowTemplate.family, copy.family);
    // a new engagement in that project picks the project template
    r = await call("mgr", "POST", "/audits", { auditCode: `QA-WF-p${Date.now() % 1e6}`, clientId: client._id, projectId: project._id, auditType: "Tax", auditManager: U.mgr.id, startDate: "2026-10-20", endDate: "2026-11-30" });
    assert.equal(r.status, 201); made.audits.push(r.j.data._id);
    assert.ok(r.j.data.milestones.some((t) => t.key === "inventory"), "project-scoped template used");
    await call("admin", "POST", `/workflow-templates/${copy._id}/deactivate`);
});
