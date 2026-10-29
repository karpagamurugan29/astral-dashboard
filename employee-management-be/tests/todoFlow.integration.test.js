// To-do and task workflow rules against a running API (no mocks):
//   API_URL=http://localhost:5000/api npm test
// Personal to-dos (private, no review step) and the project-task rules every route shares:
// only the lead marks Done, Blocked and sending back need a reason, new tasks start as To Do /
// In Progress with no past due date. Removes everything it creates.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

dotenv.config({ quiet: true });

const API = process.env.API_URL;
const skip = !API && "set API_URL to run the integration tests";
const U = {};
const made = { projects: [], todos: [] };
const people = { admin: "director@astral.test", tl: "suresh.babu@astral.test", member: "vignesh.kumar@astral.test", other: "pooja.iyer@astral.test" };
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const startedAt = new Date();

const call = async (who, method, path, body) => {
    const r = await fetch(API + path, { method, headers: { Authorization: `Bearer ${U[who].t}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    let j = {}; try { j = await r.json() } catch { /* empty */ }
    return { s: r.status, j };
};
let P, T;

before(async () => {
    if (skip) return;
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    for (const [k, email] of Object.entries(people)) {
        const u = await mongoose.connection.db.collection("employees").findOne({ email });
        assert.ok(u, `demo user ${email} exists`);
        U[k] = { id: String(u._id), t: jwt.sign({ id: u._id, email, role: u.role }, process.env.JWT_SECRET, { expiresIn: "1h" }) };
    }
});

after(async () => {
    if (skip) return;
    const db = mongoose.connection.db;
    const pids = made.projects.map((id) => new mongoose.Types.ObjectId(id));
    await db.collection("tasks").deleteMany({ $or: [{ projectId: { $in: pids } }, { _id: { $in: made.todos.map((id) => new mongoose.Types.ObjectId(id)) } }] });
    await db.collection("projects").deleteMany({ _id: { $in: pids } });
    await db.collection("notifications").deleteMany({ createdAt: { $gte: startedAt }, message: /\[QA\]/ });
    await mongoose.disconnect();
});

test("personal to-do: private to its owner, no review step, kept off team views", { skip }, async () => {
    assert.equal((await call("member", "POST", "/todos", { title: "" })).s, 400, "title required");
    assert.equal((await call("member", "POST", "/todos", { title: "[QA] past", dueDate: day(-2) })).s, 400, "no past due date");
    const r = await call("member", "POST", "/todos", { title: "[QA] Call the client", dueDate: day(1), priority: "High", assignedTo: U.other.id });
    assert.equal(r.s, 201, r.j.message);
    const id = r.j.data._id; made.todos.push(id);
    assert.equal(r.j.data.personal, true);
    assert.equal(String(r.j.data.assignedTo?._id || r.j.data.assignedTo), U.member.id, "always the owner's, whatever is sent");

    const todos = await call("member", "GET", "/todos");
    assert.ok(todos.j.data.some((t) => t._id === id), "shows on the owner's To-do list");
    const work = await call("member", "GET", "/tasks/mine");
    assert.ok(!work.j.data.some((t) => t._id === id), "kept separate from project tasks (My tasks)");
    assert.ok(!(await call("tl", "GET", "/todos")).j.data.some((t) => t._id === id), "nobody else's To-do list has it");
    for (const who of ["admin", "tl"]) {
        assert.equal((await call(who, "GET", `/tasks/${id}`)).s, 404, `${who} can't open someone's personal to-do`);
        assert.equal((await call(who, "PUT", `/tasks/${id}`, { title: "x" })).s, 404, `${who} can't edit it`);
        const list = await call(who, "GET", "/tasks");
        assert.ok(!(list.j.data || []).some((t) => t._id === id), `${who}'s task list doesn't include it`);
    }

    const done = await call("member", "PUT", `/tasks/${id}/move`, { status: "Done" });
    assert.equal(done.s, 200, `the owner ticks it done straight away (${done.j.message})`);
    assert.equal((await call("member", "PUT", `/tasks/${id}`, { status: "To Do" })).s, 200, "and can untick it");
    assert.equal((await call("member", "PUT", `/tasks/${id}`, { assignedTo: U.other.id, title: "[QA] Call the client back" })).s, 200);
    const after = await call("member", "GET", `/tasks/${id}`);
    assert.equal(String(after.j.data.assignedTo?._id || after.j.data.assignedTo), U.member.id, "can't be handed to someone else");
    assert.equal((await call("member", "DELETE", `/tasks/${id}`)).s, 200, "the owner can delete it");
    made.todos.splice(made.todos.indexOf(id), 1);
});

test("project task: starts as To Do / In Progress, no past due date", { skip }, async () => {
    const p = await call("admin", "POST", "/projects", { projectName: "[QA] To-do rules", projectManager: U.tl.id, teamMembers: [U.member.id], startDate: day(-1), endDate: day(30) });
    assert.equal(p.s, 201, p.j.message);
    P = p.j.data._id; made.projects.push(P);
    assert.equal((await call("tl", "POST", `/projects/${P}/tasks`, { title: "[QA] late", assignedTo: U.member.id, dueDate: day(-1) })).s, 400, "past due date refused");
    const odd = await call("tl", "POST", `/projects/${P}/tasks`, { title: "[QA] starts done?", assignedTo: U.member.id, status: "Done" });
    assert.equal(odd.s, 201);
    assert.equal(odd.j.data.status, "To Do", "a new task can't start as Done");
    const t = await call("tl", "POST", `/projects/${P}/tasks`, { title: "[QA] Bank reconciliation", assignedTo: U.member.id, dueDate: day(2), status: "In Progress" });
    assert.equal(t.j.data.status, "In Progress");
    T = t.j.data._id;
});

test("review: the assignee sends for review, only the lead marks Done — on every route", { skip }, async () => {
    for (const [method, path, body] of [["PUT", `/tasks/${T}/move`, { status: "Done" }], ["PUT", `/tasks/${T}`, { status: "Done" }], ["PUT", `/tasks/${T}/status`, { status: "Done" }]]) {
        const r = await call("member", method, path, body);
        assert.equal(r.s, 403, `${path} refuses Done from the assignee (got ${r.s})`);
    }
    const bulk = await call("member", "PUT", "/tasks/bulk", { ids: [T], status: "Done" });
    assert.equal(bulk.j.data.done, 0, "bulk Done doesn't slip past review");
    assert.equal(bulk.j.data.needReview, 1);
    assert.equal((await call("member", "PUT", `/tasks/${T}/move`, { status: "In Review" })).s, 200, "assignee sends it for review");
    assert.equal((await call("tl", "PUT", `/tasks/${T}/move`, { status: "In Progress" })).s, 400, "sending back needs a reason");
    assert.equal((await call("tl", "PUT", `/tasks/${T}/move`, { status: "In Progress", note: "[QA] Add the March statement" })).s, 200, "with a reason it goes back");
    const full = await call("member", "GET", `/tasks/${T}`);
    assert.ok(full.j.data.comments.some((c) => c.message === "[QA] Add the March statement"), "the reason is kept as a note");
    await call("member", "PUT", `/tasks/${T}/move`, { status: "In Review" });
    assert.equal((await call("tl", "PUT", `/tasks/${T}/move`, { status: "Done" })).s, 200, "the lead approves it");
});

test("blocked: needs a reason everywhere, and an outsider can't use the old status route", { skip }, async () => {
    const t = await call("tl", "POST", `/projects/${P}/tasks`, { title: "[QA] Confirm balances", assignedTo: U.member.id });
    const id = t.j.data._id;
    assert.equal((await call("member", "PUT", `/tasks/${id}/move`, { status: "Blocked" })).s, 400, "no reason, no block");
    assert.equal((await call("member", "PUT", `/tasks/${id}`, { status: "Blocked" })).s, 400, "same in the task window");
    assert.equal((await call("member", "PUT", `/tasks/${id}`, { status: "Blocked", note: "[QA] Waiting for the bank" })).s, 200, "with a reason it's blocked");
    assert.equal((await call("other", "PUT", `/tasks/${id}/status`, { status: "To Do" })).s, 403, "someone off the project can't change it through the old route");
});
