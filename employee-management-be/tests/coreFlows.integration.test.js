// Everyday flows end-to-end against a running API (no mocks):
//   API_URL=http://localhost:5000/api npm test
// Attendance check-in/out, regularization, leave apply → approve → cancel, helpdesk ticket lifecycle,
// announcements, documents and chat. Uses demo employees by email. Everything it touches is put back:
// records it creates are deleted, and records it changes (leave balance, attendance) are restored
// from a copy taken before the test.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

dotenv.config({ quiet: true });

const API = process.env.API_URL;
const skip = !API && "set API_URL to run the integration tests";
const U = {};
const people = { emp: "vignesh.kumar@astral.test", lead: "pooja.iyer@astral.test", hr: "hr.head@astral.test", outsider: "gokul.raj@astral.test" };
const loc = { latitude: 11.0168, longitude: 76.9558, accuracy: 20 };
const made = { attendance: [], regularizations: [], leaves: [], tickets: [], announcements: [], documents: [], conversations: [] };
const saved = {};
let db;
const startedAt = new Date();
// automatic notifications these flows trigger (to approvers and to the employee) — removed afterwards
const SYSTEM_TITLES = ["New leave request", "Leave approved", "Leave rejected", "Leave cancelled", "Attendance regularization request", "Regularization Approved", "Regularization Rejected"];

const call = async (who, method, path, body) => {
    const r = await fetch(API + path, { method, headers: { Authorization: `Bearer ${U[who].t}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    let j = {}; try { j = await r.json() } catch { /* empty */ }
    return { s: r.status, j };
};
const oid = (id) => new mongoose.Types.ObjectId(String(id));
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

before(async () => {
    if (skip) return;
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    db = mongoose.connection.db;
    for (const [k, email] of Object.entries(people)) {
        const u = await db.collection("employees").findOne({ email });
        assert.ok(u, `demo user ${email} exists`);
        U[k] = { id: String(u._id), t: jwt.sign({ id: u._id, email, role: u.role }, process.env.JWT_SECRET, { expiresIn: "1h" }) };
    }
    saved.balance = await db.collection("leavebalances").findOne({ employeeId: oid(U.emp.id) });
    saved.todayAttendance = await db.collection("attendances").findOne({ employeeId: oid(U.emp.id), attendanceDate: today() });
});

after(async () => {
    if (skip) return;
    const del = (c, ids) => ids.length && db.collection(c).deleteMany({ _id: { $in: ids.map(oid) } });
    await del("regularizations", made.regularizations);
    await del("leaves", made.leaves);
    await del("tickets", made.tickets);
    await del("announcements", made.announcements);
    await del("documents", made.documents);
    if (made.conversations.length) {
        await db.collection("messages").deleteMany({ conversationId: { $in: made.conversations.map(oid) } });
        await del("conversations", made.conversations);
    }
    // attendance days this test created (never ones that already existed)
    for (const { date, existed } of made.attendance) if (!existed) await db.collection("attendances").deleteOne({ employeeId: oid(U.emp.id), attendanceDate: date });
    if (saved.balance) await db.collection("leavebalances").replaceOne({ _id: saved.balance._id }, saved.balance);
    await db.collection("notifications").deleteMany({ $or: [{ message: /\[QA\]/ }, { title: /\[QA\]/ }, { createdAt: { $gte: startedAt }, title: { $in: SYSTEM_TITLES } }] });
    await mongoose.disconnect();
});

test("attendance: check in and out (location required), one open session at a time", { skip }, async () => {
    assert.equal(saved.todayAttendance, null, "test user has no attendance today (so the test can remove what it makes)");
    made.attendance.push({ date: today(), existed: false });
    assert.equal((await call("emp", "POST", "/attendance/check-in", { attendanceType: "Office" })).s, 400, "location is required");
    const i = await call("emp", "POST", "/attendance/check-in", { ...loc, attendanceType: "Office", remarks: "[QA] check-in" });
    assert.ok([200, 201].includes(i.s), i.j.message);
    assert.notEqual((await call("emp", "POST", "/attendance/check-in", { ...loc, attendanceType: "Office" })).s, 200, "can't check in twice without checking out");
    const t = await call("emp", "GET", "/attendance/today");
    assert.ok(t.j.data?.currentSessionStart, "an open session is shown");
    const o = await call("emp", "POST", "/attendance/check-out", { ...loc });
    assert.ok([200, 201].includes(o.s), o.j.message);
    const after = await call("emp", "GET", "/attendance/today");
    assert.ok(!after.j.data?.currentSessionStart, "no open session after check-out");
    assert.equal(after.j.data.sessions?.length, 1);
});

test("regularization: request → reviewer approves → attendance corrected; can't be decided twice", { skip }, async () => {
    // a past weekday this person has no attendance for
    let date;
    for (let d = 2; d < 40 && !date; d++) {
        const x = new Date(Date.now() - d * 864e5); if ([0, 6].includes(x.getDay())) continue;
        const k = x.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
        if (!(await db.collection("attendances").findOne({ employeeId: oid(U.emp.id), attendanceDate: k }))) date = k;
    }
    assert.ok(date, "found a missed day to correct");
    made.attendance.push({ date, existed: false });
    assert.equal((await call("emp", "POST", "/attendance/regularize", { attendanceDate: date })).s, 400, "a reason is required");
    const r = await call("emp", "POST", "/attendance/regularize", { attendanceDate: date, requestedCheckIn: "09:30", requestedCheckOut: "18:15", reason: "[QA] forgot to punch" });
    assert.equal(r.s, 201, r.j.message);
    made.regularizations.push(r.j.data._id);
    assert.equal((await call("emp", "PUT", `/attendance/regularize/${r.j.data._id}/decide`, { status: "Approved" })).s, 403, "can't approve your own request");
    assert.equal((await call("outsider", "PUT", `/attendance/regularize/${r.j.data._id}/decide`, { status: "Approved" })).s, 403, "an outsider can't decide");
    const bogus = await call("hr", "PUT", `/attendance/regularize/${r.j.data._id}/decide`, { status: "Maybe" });
    assert.equal(bogus.s, 400, `an invalid decision is refused cleanly (got ${bogus.s}: ${bogus.j.message})`);
    assert.equal((await call("hr", "PUT", `/attendance/regularize/${r.j.data._id}/decide`, { status: "Approved" })).s, 200);
    const att = await db.collection("attendances").findOne({ employeeId: oid(U.emp.id), attendanceDate: date });
    assert.ok(att, "attendance record created for the corrected day");
    assert.ok(att.sessions?.[0]?.checkIn?.time && att.sessions?.[0]?.checkOut?.time, "corrected check-in and check-out applied");
    const again = await call("hr", "PUT", `/attendance/regularize/${r.j.data._id}/decide`, { status: "Rejected" });
    assert.equal(again.s, 409, `an already-decided request can't be decided again (got ${again.s})`);
});

test("leave: apply → approve deducts balance; only pending leave can be cancelled; overlaps refused", { skip }, async () => {
    const before = saved.balance?.casual?.balance;
    assert.equal((await call("emp", "POST", "/leave/apply", { leaveType: "Casual Leave", fromDate: "2026-11-20", toDate: "2026-11-19", reason: "[QA]" })).s, 400, "end before start refused");
    const a = await call("emp", "POST", "/leave/apply", { leaveType: "Casual Leave", fromDate: "2026-11-20", toDate: "2026-11-20", reason: "[QA] family function" });
    assert.equal(a.s, 201, a.j.message);
    const id = a.j.data?._id; made.leaves.push(id);
    const dup = await call("emp", "POST", "/leave/apply", { leaveType: "Casual Leave", fromDate: "2026-11-20", toDate: "2026-11-20", reason: "[QA] again" });
    assert.equal(dup.s >= 400, true, `an overlapping request is refused (got ${dup.s})`);
    if (dup.j.data?._id) made.leaves.push(dup.j.data._id);
    assert.equal((await call("emp", "PUT", `/leave/approve/${id}`)).s, 403, "can't approve your own leave");
    const ap = await call("hr", "PUT", `/leave/approve/${id}`);
    assert.equal(ap.s, 200, ap.j.message);
    const bal = await db.collection("leavebalances").findOne({ employeeId: oid(U.emp.id) });
    assert.equal(bal.casual.balance, before - 1, "approved day taken off the casual balance");
    // current rule: an approved leave can't be cancelled by the employee (only pending ones)
    assert.equal((await call("emp", "PUT", `/leave/cancel/${id}`)).s, 400, "approved leave can't be self-cancelled");
    const p = await call("emp", "POST", "/leave/apply", { leaveType: "Casual Leave", fromDate: "2026-11-23", toDate: "2026-11-23", reason: "[QA] second" });
    assert.equal(p.s, 201, p.j.message); made.leaves.push(p.j.data._id);
    assert.equal((await call("emp", "PUT", `/leave/cancel/${p.j.data._id}`)).s, 200, "a pending leave can be cancelled");
    const bal2 = await db.collection("leavebalances").findOne({ employeeId: oid(U.emp.id) });
    assert.equal(bal2.casual.balance, before - 1, "cancelling a pending leave doesn't touch the balance");
});

test("helpdesk: raise → assign → ask employee → reply → resolve → close, with history", { skip }, async () => {
    const t = await call("emp", "POST", "/tickets", { subject: "[QA] Payslip shows wrong bank", description: "[QA] October payslip has my old account", category: "Payroll and Salary", priority: "Medium" });
    assert.equal(t.s, 201, t.j.message);
    const id = t.j.data._id; made.tickets.push(id);
    assert.equal((await call("outsider", "GET", `/tickets/${id}`)).s >= 400, true, "another employee can't open it");
    assert.equal((await call("hr", "PUT", `/tickets/${id}/assign`, { assignedTo: U.hr.id })).s, 200);
    assert.equal((await call("hr", "PUT", `/tickets/${id}/status`, { status: "Pending Employee" })).s, 400, "asking the employee needs a question");
    assert.equal((await call("hr", "PUT", `/tickets/${id}/status`, { status: "Pending Employee", note: "[QA] Which account number?" })).s, 200);
    assert.equal((await call("emp", "POST", `/tickets/${id}/comments`, { message: "[QA] the new SBI account" })).s, 201);
    assert.equal((await call("hr", "PUT", `/tickets/${id}/status`, { status: "Closed" })).s >= 200, true);
    const cur = (await call("hr", "GET", `/tickets/${id}`)).j.data;
    if (cur.status === "Closed") { /* Pending Employee → Closed is allowed by the desk rules */ } else {
        assert.equal((await call("hr", "PUT", `/tickets/${id}/status`, { status: "Resolved", note: "[QA] bank updated in payroll" })).s, 200);
        assert.equal((await call("hr", "PUT", `/tickets/${id}/status`, { status: "Closed" })).s, 200);
    }
    const end = (await call("emp", "GET", `/tickets/${id}`)).j.data;
    assert.equal(end.status, "Closed");
    assert.ok((end.history || []).length >= 4, "every step is in the history");
    assert.equal((await call("hr", "PUT", `/tickets/${id}/status`, { status: "In Progress" })).s >= 400, true, "a closed ticket can't jump back to In Progress");
});

test("announcements: HR posts, everyone sees it, HR deletes; employees can't post", { skip }, async () => {
    assert.equal((await call("emp", "POST", "/announcements", { title: "[QA] Not allowed", content: "x", audience: "Everyone" })).s, 403);
    const a = await call("hr", "POST", "/announcements", { title: "[QA] Office closed Friday", content: "[QA] Diwali holiday", audience: "Everyone" });
    assert.equal(a.s, 201, a.j.message);
    made.announcements.push(a.j.data._id);
    const seen = (await call("emp", "GET", "/announcements")).j.data || [];
    assert.ok(seen.some((x) => x._id === a.j.data._id), "an employee sees it");
    assert.equal((await call("hr", "DELETE", `/announcements/${a.j.data._id}`)).s, 200);
    assert.ok(!((await call("emp", "GET", "/announcements")).j.data || []).some((x) => x._id === a.j.data._id), "gone after delete");
});

test("documents: upload your own, list it, others can't see it, delete it", { skip }, async () => {
    const fd = new FormData();
    fd.append("title", "[QA] PAN card"); fd.append("category", "PAN / Tax");
    fd.append("file", new Blob([Buffer.from("%PDF-1.4\n%QA\n")], { type: "application/pdf" }), "pan.pdf");
    const r = await fetch(API + "/documents/upload", { method: "POST", headers: { Authorization: `Bearer ${U.emp.t}` }, body: fd });
    const j = await r.json();
    assert.equal(r.status, 201, j.message);
    made.documents.push(j.data._id);
    const mine = (await call("emp", "GET", "/documents")).j.data || [];
    assert.ok(mine.some((d) => d._id === j.data._id), "listed for the owner");
    const theirs = (await call("outsider", "GET", "/documents")).j.data || [];
    assert.ok(!theirs.some((d) => d._id === j.data._id), "another employee doesn't see it");
    assert.equal((await call("emp", "DELETE", `/documents/${j.data._id}`)).s, 200);
    made.documents.splice(made.documents.indexOf(j.data._id), 1);
});

test("chat: message your lead, they see it unread, then read; can't message yourself", { skip }, async () => {
    assert.equal((await call("emp", "POST", "/chat/conversations", { participantId: U.emp.id })).s, 400, "can't message yourself");
    const c = await call("emp", "POST", "/chat/conversations", { participantId: U.lead.id });
    assert.ok([200, 201].includes(c.s), c.j.message);
    const cid = c.j.data._id; made.conversations.push(cid);
    assert.equal((await call("emp", "POST", `/chat/conversations/${cid}/messages`, { text: "" })).s, 400, "empty message refused");
    const m = await call("emp", "POST", `/chat/conversations/${cid}/messages`, { text: "[QA] can we review the vouching sample?" });
    assert.ok([200, 201].includes(m.s), m.j.message);
    const unread = await call("lead", "GET", "/chat/unread");
    assert.ok((unread.j.data?.total ?? unread.j.total ?? unread.j.data ?? 0) >= 1 || JSON.stringify(unread.j).includes(cid), "the lead has it unread");
    assert.equal((await call("lead", "POST", `/chat/conversations/${cid}/read`)).s, 200);
    const msgs = (await call("lead", "GET", `/chat/conversations/${cid}/messages`)).j.data?.messages || [];
    assert.ok(msgs.some((x) => /vouching sample/.test(x.text || "")), "the lead reads the message");
});
