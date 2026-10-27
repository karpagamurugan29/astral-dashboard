// Project workspace end-to-end against a running API (no mocks):
//   API_URL=http://localhost:5000/api npm test
// Skipped when API_URL isn't set. Uses the demo employees (looked up by email), signs short-lived
// tokens with JWT_SECRET, and removes every project, task, time log and notification it created.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

dotenv.config({ quiet: true });

const API = process.env.API_URL;
const skip = !API && "set API_URL to run the integration tests";
const U = {};
const made = { projects: [] };
const loc = { latitude: 11.0168, longitude: 76.9558, accuracy: 20 };
// admin creates; tl leads the project; member works on it; outsider has nothing to do with it
const people = { admin: "director@astral.test", tl: "suresh.babu@astral.test", member: "vignesh.kumar@astral.test", other: "pooja.iyer@astral.test", outsider: "gokul.raj@astral.test" };

const call = async (who, method, path, body) => {
    const r = await fetch(API + path, { method, headers: { Authorization: `Bearer ${U[who].t}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    let j = {}; try { j = await r.json() } catch { /* empty */ }
    return { s: r.status, j };
};
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
let P, T1, T2;

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
    const ids = made.projects.map((id) => new mongoose.Types.ObjectId(id));
    await db.collection("tasks").deleteMany({ projectId: { $in: ids } });
    await db.collection("projecttimelogs").deleteMany({ projectId: { $in: ids } });
    await db.collection("projects").deleteMany({ _id: { $in: ids } });
    await db.collection("notifications").deleteMany({ message: /\[QA\]/ });
    await mongoose.disconnect();
});

test("create: only managers; name, lead, dates and unique code are checked", { skip }, async () => {
    const base = { projectName: "[QA] Project flow", projectManager: U.tl.id, teamMembers: [U.member.id], startDate: day(-1), endDate: day(30) };
    assert.equal((await call("outsider", "POST", "/projects", base)).s, 403, "an employee can't create a project");
    assert.equal((await call("admin", "POST", "/projects", { ...base, projectName: "" })).s, 400, "name required");
    assert.equal((await call("admin", "POST", "/projects", { ...base, endDate: day(-5) })).s, 400, "end before start rejected");
    const r = await call("admin", "POST", "/projects", base);
    assert.equal(r.s, 201, r.j.message);
    P = r.j.data._id; made.projects.push(P);
    const dup = await call("admin", "POST", "/projects", { ...base, projectCode: r.j.data.projectCode });
    assert.equal(dup.s, 409, "duplicate project code rejected");
});

test("visibility: the team sees it (with task counts), outsiders don't", { skip }, async () => {
    const mine = await call("member", "GET", "/projects");
    assert.equal(mine.s, 200);
    const row = mine.j.data.find((p) => p._id === P);
    assert.ok(row, "member sees the project in the list");
    assert.deepEqual(row.taskCounts, { total: 0, done: 0, open: 0, overdue: 0, mine: 0 }, "list carries task counts (the Projects page relies on them)");
    const out = await call("outsider", "GET", "/projects");
    assert.ok(!out.j.data.some((p) => p._id === P), "outsider doesn't see it");
    assert.equal((await call("outsider", "GET", `/projects/${P}/workspace`)).s, 403, "outsider can't open it");
    assert.equal((await call("member", "GET", `/projects/${P}/workspace`)).s, 200, "member opens the workspace");
});

test("tasks: lead assigns, members only take their own, outsiders can't add", { skip }, async () => {
    const t1 = await call("tl", "POST", `/projects/${P}/tasks`, { title: "[QA] Vouching", assignedTo: U.member.id, dueDate: day(3) });
    assert.equal(t1.s, 201, t1.j.message);
    assert.equal(t1.j.data.status, "To Do", "new tasks start in To Do");
    T1 = t1.j.data._id;
    assert.equal((await call("member", "POST", `/projects/${P}/tasks`, { title: "[QA] x", assignedTo: U.tl.id })).s, 403, "member can't assign to someone else");
    assert.equal((await call("tl", "POST", `/projects/${P}/tasks`, { title: "[QA] x", assignedTo: U.other.id })).s, 400, "can't assign to someone off the project");
    assert.equal((await call("outsider", "POST", `/projects/${P}/tasks`, { title: "[QA] x" })).s, 403, "outsider can't add tasks");
    assert.equal((await call("tl", "POST", `/projects/${P}/tasks`, { title: "" })).s, 400, "title required");
    const t2 = await call("tl", "POST", `/projects/${P}/tasks`, { title: "[QA] Lead's own task", assignedTo: U.tl.id });
    assert.equal(t2.s, 201); T2 = t2.j.data._id;
});

test("status flow: To Do → In Progress → In Review → Blocked → In Progress → Done, with history", { skip }, async () => {
    for (const status of ["In Progress", "In Review", "Blocked", "In Progress", "Done"]) {
        const r = await call("member", "PUT", `/tasks/${T1}/move`, { status, note: `[QA] to ${status}` });
        assert.equal(r.s, 200, `${status}: ${r.j.message}`);
    }
    const t = (await call("member", "GET", `/tasks/${T1}`)).j.data;
    assert.equal(t.status, "Done");
    assert.ok(t.completedAt, "Done stamps completedAt");
    const moves = t.history.filter((h) => h.action === "status").map((h) => `${h.from}→${h.to}`);
    assert.deepEqual(moves, ["To Do→In Progress", "In Progress→In Review", "In Review→Blocked", "Blocked→In Progress", "In Progress→Done"], "every move is in the history");
    assert.equal((await call("outsider", "PUT", `/tasks/${T1}/move`, { status: "To Do" })).s, 403, "outsider can't move it");
    assert.equal((await call("member", "PUT", `/tasks/${T2}/move`, { status: "Done" })).s, 403, "member can't move someone else's task");
    const list = (await call("member", "GET", "/projects")).j.data.find((p) => p._id === P);
    assert.equal(list.taskCounts.total, 2); assert.equal(list.taskCounts.done, 1);
    assert.equal(list.progress, 50, "progress follows done tasks");
});

test("close & reopen: only Done tasks close, with a note; closed tasks are locked; reopening needs a reason", { skip }, async () => {
    const note = { note: "[QA] verified and filed" };
    assert.equal((await call("tl", "POST", `/tasks/${T2}/close`, note)).s, 400, "a task that isn't Done can't be closed");
    assert.equal((await call("member", "POST", `/tasks/${T1}/close`, {})).s, 400, "closing needs a note");
    const c = await call("member", "POST", `/tasks/${T1}/close`, note);
    assert.equal(c.s, 200, c.j.message);
    assert.equal((await call("member", "POST", `/tasks/${T1}/close`, note)).s, 409, "already closed");
    assert.equal((await call("member", "PUT", `/tasks/${T1}/move`, { status: "To Do" })).s, 409, "closed task can't be moved");
    assert.equal((await call("member", "POST", `/tasks/${T1}/reopen`, { note: "" })).s, 400, "reopen needs a reason");
    const r = await call("member", "POST", `/tasks/${T1}/reopen`, { note: "[QA] found a gap" });
    assert.equal(r.s, 200, r.j.message);
    const t = (await call("member", "GET", `/tasks/${T1}`)).j.data;
    assert.equal(t.status, "In Progress", "reopened task goes back to In Progress");
    assert.equal(t.completedAt, null);
});

test("bulk move skips what isn't yours; comments; watching; delete rules", { skip }, async () => {
    const b = await call("member", "PUT", "/tasks/bulk", { ids: [T1, T2], status: "In Review" });
    assert.equal(b.s, 200, b.j.message);
    assert.equal(b.j.data.done, 1, "only the member's own task moved");
    assert.equal((await call("member", "PUT", "/tasks/bulk", { ids: [T1], status: "Nope" })).s, 400, "invalid status rejected");
    assert.equal((await call("member", "POST", `/tasks/${T1}/comments`, { message: "  " })).s, 400, "empty comment rejected");
    assert.equal((await call("member", "POST", `/tasks/${T1}/comments`, { message: "[QA] sample checked" })).s, 201);
    assert.equal((await call("tl", "POST", `/tasks/${T1}/watch`)).s, 200, "lead can watch a task");
    assert.equal((await call("member", "DELETE", `/tasks/${T2}`)).s, 403, "member can't delete the lead's task");
    assert.equal((await call("tl", "DELETE", `/tasks/${T2}`)).s, 200, "lead deletes it");
    const mine = await call("member", "GET", "/tasks/mine");
    assert.equal(mine.s, 200);
    assert.ok(mine.j.data.some((t) => t._id === T1), "the task shows in the member's My Tasks");
});

test("timer: members only, location required, one at a time, duration recorded", { skip }, async () => {
    assert.equal((await call("outsider", "POST", `/projects/${P}/timer/start`, loc)).s, 403, "outsider can't log time");
    assert.equal((await call("member", "POST", `/projects/${P}/timer/start`, {})).s, 400, "location required");
    const s = await call("member", "POST", `/projects/${P}/timer/start`, { ...loc, taskId: T1 });
    assert.equal(s.s, 201, s.j.message);
    assert.equal((await call("member", "POST", `/projects/${P}/timer/start`, loc)).s, 409, "only one timer at a time");
    await new Promise((r) => setTimeout(r, 1500));
    const e = await call("member", "POST", `/projects/${P}/timer/stop`, { ...loc, note: "[QA] done" });
    assert.equal(e.s, 200, e.j.message);
    assert.equal((await call("member", "POST", `/projects/${P}/timer/stop`, loc)).s, 404, "nothing left to stop");
    const log = await mongoose.connection.db.collection("projecttimelogs").findOne({ projectId: new mongoose.Types.ObjectId(P) });
    assert.ok(log?.endTime, "session saved with an end time");
    assert.ok(log.startLocation && log.stopLocation, "start and stop locations kept");
});

test("project edits: lead or seniors only; dates validated", { skip }, async () => {
    assert.equal((await call("member", "PUT", `/projects/${P}`, { projectName: "[QA] renamed" })).s, 403, "member can't edit the project");
    assert.equal((await call("tl", "PUT", `/projects/${P}`, { endDate: day(-10) })).s, 400, "end before start rejected");
    const r = await call("tl", "PUT", `/projects/${P}`, { projectName: "[QA] Project flow (edited)" });
    assert.equal(r.s, 200, r.j.message);
    assert.equal(r.j.data.projectName, "[QA] Project flow (edited)");
});
