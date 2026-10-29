// Calendar, reminders and notification settings against a running API (no mocks):
//   API_URL=http://localhost:5000/api npm test
// Removes every event, reminder, notification, task and project it creates.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { occurrences, instantOf, wallOf } from "../utils/recurrence.js";
import { inQuietHours } from "../utils/reminders.js";

dotenv.config({ quiet: true });

const API = process.env.API_URL;
const skip = !API && "set API_URL to run the integration tests";
const U = {};
const made = { events: [], projects: [], tasks: [] };
const people = { admin: "director@astral.test", tl: "suresh.babu@astral.test", member: "vignesh.kumar@astral.test", outsider: "gokul.raj@astral.test" };
const startedAt = new Date();
const inMin = (m) => new Date(Date.now() + m * 60000).toISOString();
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

const call = async (who, method, path, body, headers = {}) => {
    const r = await fetch(API + path, { method, headers: { ...(who ? { Authorization: `Bearer ${U[who].t}` } : {}), "Content-Type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined });
    let j = {}; try { j = await r.json() } catch { /* empty */ }
    return { s: r.status, j };
};
const db = () => mongoose.connection.db;
const oid = (x) => new mongoose.Types.ObjectId(String(x));
const make = async (who, body) => { const r = await call(who, "POST", "/calendar/events", body); if (r.j.data?._id) made.events.push(r.j.data._id); return r; };

before(async () => {
    if (skip) return;
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    for (const [k, email] of Object.entries(people)) {
        const u = await db().collection("employees").findOne({ email });
        assert.ok(u, `demo user ${email} exists`);
        U[k] = { id: String(u._id), t: jwt.sign({ id: u._id, email, role: u.role }, process.env.JWT_SECRET, { expiresIn: "1h" }) };
    }
});

after(async () => {
    if (skip) return;
    const evIds = made.events.map(oid);
    const all = await db().collection("calendarevents").find({ $or: [{ _id: { $in: evIds } }, { seriesId: { $in: evIds } }] }).project({ _id: 1 }).toArray();
    const ids = all.map((e) => e._id);
    await db().collection("reminders").deleteMany({ eventId: { $in: ids } });
    await db().collection("calendarevents").deleteMany({ _id: { $in: ids } });
    await db().collection("tasks").deleteMany({ projectId: { $in: made.projects.map(oid) } });
    await db().collection("projects").deleteMany({ _id: { $in: made.projects.map(oid) } });
    await db().collection("notifications").deleteMany({ createdAt: { $gte: startedAt }, $or: [{ type: { $in: ["Reminder", "Calendar"] } }, { message: /\[QA\]/ }] });
    await db().collection("notificationprefs").deleteMany({ employeeId: oid(U.member.id), updatedAt: { $gte: startedAt } });
    await mongoose.disconnect();
});

test("recurrence keeps wall-clock time across daylight saving, and quiet hours cross midnight", () => {
    const ny = "America/New_York";
    const s = instantOf(2026, 9, 26, 10, 0, ny);
    const occ = occurrences({ start: s, timezone: ny, recurrence: { freq: "weekly", interval: 1 } }, s, new Date(s.getTime() + 15 * 864e5));
    assert.deepEqual(occ.map((d) => wallOf(d, ny).h), [10, 10, 10], "still 10:00 after the clocks change");
    assert.notEqual(occ[0].getUTCHours(), occ[1].getUTCHours(), "the UTC hour moves instead");
    const ist = "Asia/Kolkata";
    assert.equal(inQuietHours({ quietStart: "22:00", quietEnd: "07:00", timezone: ist }, instantOf(2026, 10, 2, 23, 30, ist)), true);
    assert.equal(inQuietHours({ quietStart: "22:00", quietEnd: "07:00", timezone: ist }, instantOf(2026, 10, 2, 6, 59, ist)), true);
    assert.equal(inQuietHours({ quietStart: "22:00", quietEnd: "07:00", timezone: ist }, instantOf(2026, 10, 2, 12, 0, ist)), false);
});

test("events: validation, and personal events stay private", { skip }, async () => {
    assert.equal((await make("member", { title: "", start: inMin(60) })).s, 400, "title required");
    assert.equal((await make("member", { title: "[QA] x", start: inMin(60), end: inMin(30) })).s, 400, "can't end before it starts");
    assert.equal((await make("member", { title: "[QA] x", start: inMin(60), timezone: "Mars/Base" })).s, 400, "bad time zone refused");
    assert.equal((await make("member", { title: "[QA] x", start: inMin(60), recurrence: { freq: "hourly" } })).s, 400, "bad repeat rule refused");
    assert.equal((await make("member", { title: "[QA] x", start: inMin(60), link: "javascript:alert(1)" })).s, 400, "unsafe link refused");
    const r = await make("member", { title: "[QA] Dentist", start: inMin(120), end: inMin(150), timezone: "Asia/Kolkata", reminders: [15, 60] });
    assert.equal(r.s, 201, r.j.message);
    const id = r.j.data._id;
    for (const who of ["admin", "tl", "outsider"]) assert.equal((await call(who, "GET", `/calendar/events/${id}`)).s, 404, `${who} can't open a personal event`);
    const feed = await call("member", "GET", `/calendar?from=${inMin(-60)}&to=${inMin(24 * 60)}`);
    assert.ok(feed.j.data.some((i) => i.kind === "event" && i.id === id), "on the owner's calendar");
    const other = await call("tl", "GET", `/calendar?from=${inMin(-60)}&to=${inMin(24 * 60)}`);
    assert.ok(!other.j.data.some((i) => i.id === id), "not on anyone else's");
    const n = await db().collection("reminders").countDocuments({ eventId: oid(id) });
    assert.equal(n, 2, "one reminder per offset for the owner");
    assert.equal((await call("tl", "PUT", `/calendar/events/${id}`, { title: "hack" })).s, 404, "others can't edit it");
});

test("project events reach the team; outsiders can't add to the project; task deadlines show up", { skip }, async () => {
    const p = await call("admin", "POST", "/projects", { projectName: "[QA] Calendar project", projectManager: U.tl.id, teamMembers: [U.member.id], startDate: day(-1), endDate: day(30) });
    assert.equal(p.s, 201, p.j.message); made.projects.push(p.j.data._id);
    const P = p.j.data._id;
    assert.equal((await make("outsider", { title: "[QA] x", start: inMin(60), projectId: P })).s, 403, "outsider can't add a project event");
    const ev = await make("tl", { title: "[QA] Review meeting", start: inMin(180), end: inMin(240), projectId: P, reminders: [30] });
    assert.equal(ev.s, 201, ev.j.message);
    assert.equal((await call("member", "GET", `/calendar/events/${ev.j.data._id}`)).s, 200, "team member sees the project event");
    assert.equal((await call("member", "PUT", `/calendar/events/${ev.j.data._id}`, { title: "x" })).s, 403, "but only the organiser or lead edits it");
    const t = await call("tl", "POST", `/projects/${P}/tasks`, { title: "[QA] File the return", assignedTo: U.member.id, dueDate: day(2) });
    const feed = await call("member", "GET", `/calendar?from=${new Date().toISOString()}&to=${inMin(5 * 1440)}`);
    const item = feed.j.data.find((i) => i.kind === "task" && i.id === t.j.data._id);
    assert.ok(item, "the task's due date is on the calendar (read from the task)");
    assert.equal(item.status, "To Do");
    const clash = await make("tl", { title: "[QA] Overlap", start: inMin(200), end: inMin(260) });
    assert.ok(clash.j.warnings?.length, "overlapping meetings get a warning, not a block");
});

test("reminders: delivered once even when asked twice at the same moment; snooze; dismiss", { skip }, async () => {
    const r = await make("member", { title: "[QA] Call the auditor", start: inMin(1), end: inMin(31), reminders: [1], priority: "High" });
    assert.equal(r.s, 201, r.j.message);
    const id = r.j.data._id;
    const [a, b] = await Promise.all([call("member", "GET", "/reminders/due"), call("member", "GET", "/reminders/due")]);
    assert.equal(a.s, 200); assert.equal(b.s, 200);
    const notes = await db().collection("notifications").countDocuments({ employeeId: oid(U.member.id), type: "Reminder", link: { $regex: id }, createdAt: { $gte: startedAt } });
    assert.equal(notes, 1, "exactly one notification although two requests raced");
    const due = (await call("member", "GET", "/reminders/due")).j.data.find((x) => String(x.eventId) === id);
    assert.ok(due, "it's in the due list for the popup");
    assert.equal(due.priority, "High");
    assert.equal((await call("tl", "POST", `/reminders/${due._id}/snooze`, { minutes: 10 })).s, 404, "nobody else can snooze my reminder");
    assert.equal((await call("member", "POST", `/reminders/${due._id}/snooze`, { minutes: 0 })).s, 400, "snooze must be in the future");
    const sn = await call("member", "POST", `/reminders/${due._id}/snooze`, { minutes: 10 });
    assert.equal(sn.s, 200, sn.j.message);
    assert.ok(!(await call("member", "GET", "/reminders/due")).j.data.some((x) => x._id === due._id), "snoozed reminders leave the popup");
    assert.equal(await db().collection("reminders").countDocuments({ eventId: oid(id) }), 1, "snoozing reuses the same reminder, no duplicates");
    await db().collection("reminders").updateOne({ _id: oid(due._id) }, { $set: { dueAt: new Date(Date.now() - 1000) } }); // let the snooze run out
    assert.ok((await call("member", "GET", "/reminders/due")).j.data.some((x) => x._id === due._id), "it comes back when the snooze ends");
    assert.equal((await call("member", "POST", `/reminders/${due._id}/ack`, { action: "dismiss" })).s, 200);
    assert.ok(!(await call("member", "GET", "/reminders/due")).j.data.some((x) => x._id === due._id), "dismissed reminders don't come back");
});

test("repeating events: skip one, end the series, cancel all — reminders follow", { skip }, async () => {
    const r = await make("member", { title: "[QA] Stand-up", start: inMin(60), end: inMin(75), timezone: "Asia/Kolkata", reminders: [5], recurrence: { freq: "daily", count: 5 } });
    assert.equal(r.s, 201, r.j.message);
    const id = r.j.data._id;
    const feed = async () => (await call("member", "GET", `/calendar?from=${inMin(0)}&to=${inMin(8 * 1440)}`)).j.data.filter((i) => i.id === id);
    const occ = await feed();
    assert.equal(occ.length, 5, "five daily occurrences");
    assert.equal(await db().collection("reminders").countDocuments({ eventId: oid(id), status: "Pending" }), 5);
    assert.equal((await call("member", "DELETE", `/calendar/events/${id}?scope=one&occurrence=${occ[1].start}`)).s, 200);
    assert.equal((await feed()).length, 4, "one day skipped");
    assert.equal(await db().collection("reminders").countDocuments({ eventId: oid(id), status: "Pending" }), 4, "its reminder is gone");
    const moved = await call("member", "PUT", `/calendar/events/${id}`, { scope: "one", occurrence: occ[2].start, title: "[QA] Stand-up (moved)", start: new Date(new Date(occ[2].start).getTime() + 3600000).toISOString() });
    assert.equal(moved.s, 200, moved.j.message);
    made.events.push(moved.j.data._id);
    assert.equal((await feed()).length, 3, "the moved day leaves the series…");
    assert.equal(moved.j.data.seriesId, id, "…and becomes its own event linked to it");
    assert.equal((await call("member", "DELETE", `/calendar/events/${id}?scope=future&occurrence=${occ[3].start}`)).s, 200);
    assert.equal((await feed()).length, 1, "the series now ends before that day");
    assert.equal((await call("member", "DELETE", `/calendar/events/${id}?scope=all`)).s, 200);
    assert.equal((await feed()).length, 0, "cancelled");
    assert.equal(await db().collection("reminders").countDocuments({ eventId: oid(id), status: "Pending" }), 0, "no pending reminders left");
});

test("settings and the cron endpoint", { skip }, async () => {
    assert.equal((await call("member", "PUT", "/notification-prefs", { quietStart: "25:00" })).s, 400, "bad time refused");
    assert.equal((await call("member", "PUT", "/notification-prefs", { timezone: "Nowhere/City" })).s, 400, "bad zone refused");
    const ok = await call("member", "PUT", "/notification-prefs", { quietStart: "22:00", quietEnd: "07:00", defaultReminder: 30 });
    assert.equal(ok.s, 200, ok.j.message);
    assert.equal((await call("member", "GET", "/notification-prefs")).j.data.defaultReminder, 30);
    await call("member", "PUT", "/notification-prefs", { quietStart: "", quietEnd: "", defaultReminder: 15 });
    const cron = await call(null, "GET", "/cron/reminders");
    assert.ok([401, 503].includes(cron.s), `the cron endpoint needs the secret (got ${cron.s})`);
});
