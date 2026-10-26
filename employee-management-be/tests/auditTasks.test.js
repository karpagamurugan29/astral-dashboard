// Unit tests for the audit task lifecycle rules (no database). Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTasks, allowedActions, checkTransition, applyTransition, depsMet, completionBlockers, hasCycle } from "../utils/auditTasks.js";
import { firmStandardTasks, migrationPlan } from "../utils/workflowTemplates.js";

const ME = "a1", BOSS = "m1", REV = "r1";
const member = { me: ME, manage: false, member: true };
const manager = { me: BOSS, manage: true, member: true };
const reviewer = { me: REV, manage: false, member: true };
const mk = (over = {}) => ({ key: "t1", label: "Vouching", stage: "Fieldwork", status: "Not Started", dependsOn: [], checklist: [], attachments: [], history: [], ...over });

test("normalize: assignee + met prerequisites → Ready; unmet → Assigned; old tick → Completed", () => {
    const tasks = [mk({ key: "a", assignee: ME }), mk({ key: "b", assignee: ME, dependsOn: ["a"] }), mk({ key: "c", done: true })];
    normalizeTasks(tasks);
    assert.equal(tasks[0].status, "Ready");
    assert.equal(tasks[1].status, "Assigned");
    assert.equal(tasks[2].status, "Completed");
    assert.equal(tasks[2].done, true);
});

test("prerequisites block starting; only a manager may override, with a reason", () => {
    const tasks = [mk({ key: "a", status: "In Progress" }), mk({ key: "b", assignee: ME, status: "Assigned", dependsOn: ["a"] })];
    assert.equal(depsMet(tasks[1], tasks), false);
    assert.ok(!allowedActions(tasks[1], tasks, member).some((x) => x.action === "start"));
    assert.match(checkTransition(tasks[1], tasks, member, "start").error, /Waiting on: Vouching/);
    const mgr = allowedActions(tasks[1], tasks, manager).find((x) => x.action === "start");
    assert.ok(mgr.override);
    assert.match(checkTransition(tasks[1], tasks, manager, "start", { override: true }).error, /required/);
    assert.equal(checkTransition(tasks[1], tasks, manager, "start", { note: "Client asked", override: true }).to, "In Progress");
});

test("cancelled prerequisites no longer block", () => {
    const tasks = [mk({ key: "a", status: "Cancelled" }), mk({ key: "b", assignee: ME, dependsOn: ["a"] })];
    assert.equal(depsMet(tasks[1], tasks), true);
});

test("review flow: submit → request changes (comment needed) → resubmit → approve; no self-approval", () => {
    const t = mk({ assignee: ME, reviewer: REV, requiresReview: true, status: "In Progress" });
    const tasks = [t];
    assert.ok(!allowedActions(t, tasks, member).some((x) => x.action === "complete"), "reviewed tasks are submitted, not completed");
    assert.equal(checkTransition(t, tasks, member, "submit").to, "Submitted");
    applyTransition(t, "submit", { by: ME });
    assert.ok(!allowedActions(t, tasks, member).some((x) => x.action === "approve"), "assignee can't approve");
    assert.match(checkTransition(t, tasks, reviewer, "requestChanges").error, /required/);
    applyTransition(t, "requestChanges", { by: REV, note: "Tie to ledger" });
    assert.equal(t.status, "Changes Requested");
    assert.equal(t.reviewCycles, 1);
    applyTransition(t, "resume", { by: ME });
    applyTransition(t, "submit", { by: ME });
    assert.equal(checkTransition(t, tasks, reviewer, "approve").to, "Approved");
    applyTransition(t, "approve", { by: REV });
    assert.equal(t.done, true);
    assert.ok(t.firstSubmittedAt <= t.submittedAt);
});

test("a manager who is also the assignee still can't approve their own work", () => {
    const t = mk({ assignee: BOSS, requiresReview: true, status: "Submitted" });
    assert.ok(!allowedActions(t, [t], manager).some((x) => x.action === "approve"));
});

test("evidence and checklist are enforced before submitting", () => {
    const t = mk({ assignee: ME, requiresReview: true, requiresEvidence: true, status: "In Progress", checklist: [{ text: "Sample 25", done: false }] });
    assert.match(checkTransition(t, [t], member, "submit").error, /evidence/);
    t.attachments.push({ name: "wp.xlsx" });
    assert.match(checkTransition(t, [t], member, "submit").error, /checklist/);
    t.checklist[0].done = true;
    assert.equal(checkTransition(t, [t], member, "submit").to, "Submitted");
});

test("block needs a reason; reopen and cancel are manager-only", () => {
    const t = mk({ assignee: ME, status: "In Progress" });
    assert.match(checkTransition(t, [t], member, "block").error, /required/);
    applyTransition(t, "complete", { by: ME });
    assert.ok(!allowedActions(t, [t], member).some((x) => x.action === "reopen"));
    assert.equal(checkTransition(t, [t], manager, "reopen", { note: "Missed a sample" }).to, "In Progress");
});

test("billing steps can't be moved by hand", () => {
    const t = mk({ key: "invoice", stage: "Billing", status: "Ready" });
    assert.deepEqual(allowedActions(t, [t], manager), []);
});

test("completion blockers ignore billing, optional and cancelled tasks", () => {
    const tasks = [mk({ key: "a", status: "Approved" }), mk({ key: "b", status: "In Progress" }), mk({ key: "c", status: "Cancelled" }), mk({ key: "d", optional: true }), mk({ key: "invoice", stage: "Billing" })];
    assert.deepEqual(completionBlockers(tasks).map((t) => t.key), ["b"]);
});

test("dependency loops are detected", () => {
    assert.equal(hasCycle([mk({ key: "a", dependsOn: ["b"] }), mk({ key: "b", dependsOn: ["a"] })]), true);
    assert.equal(hasCycle(firmStandardTasks()), false);
});

test("firm standard: prerequisites point at real tasks", () => {
    const tasks = firmStandardTasks();
    const keys = new Set(tasks.map((t) => t.key));
    tasks.forEach((t) => t.dependsOn.forEach((d) => assert.ok(keys.has(d), `${t.key} → ${d}`)));
});

test("migration never drops started work", () => {
    const current = [mk({ key: "a", status: "In Progress", label: "Old" }), mk({ key: "b", status: "Ready", label: "Old b" }), mk({ key: "gone", status: "Ready" }), mk({ key: "gone2", status: "In Progress" })];
    const plan = migrationPlan(current, { tasks: [{ key: "a", label: "New", stage: "Fieldwork" }, { key: "b", label: "New b", stage: "Fieldwork" }, { key: "c", label: "Added", stage: "Review" }] });
    assert.deepEqual(plan.add.map((t) => t.key), ["c"]);
    assert.deepEqual(plan.update.map((t) => t.key), ["b"]);
    assert.deepEqual(plan.retire.map((t) => t.key), ["gone"]);
    assert.ok(plan.keep.some((t) => t.key === "a") && plan.keep.some((t) => t.key === "gone2"));
});
