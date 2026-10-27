// Expense lifecycle end-to-end against a running API (no mocks):
//   API_URL=http://localhost:5000/api npm test
// Draft → submit → changes requested → resubmit → approve → processing → reimbursed, plus rejection,
// permissions, validation and receipts. Uses demo employees by email and removes every claim and
// receipt file it created.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

dotenv.config({ quiet: true });

const API = process.env.API_URL;
const skip = !API && "set API_URL to run the integration tests";
const U = {};
const made = [];
// emp reports (through their line) to mgr; fin is Accounts; outsider/otherLead are outside emp's line
const people = { emp: "vignesh.kumar@astral.test", mgr: "kavya.raman@astral.test", fin: "accounts.head@astral.test", outsider: "gokul.raj@astral.test", otherLead: "meera.krishnan@astral.test" };

const call = async (who, method, path, body) => {
    const r = await fetch(API + path, { method, headers: { Authorization: `Bearer ${U[who].t}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    let j = {}; try { j = await r.json() } catch { /* empty */ }
    return { s: r.status, j };
};
const upload = async (who, method, path, fields, fileName, type, content) => {
    const fd = new FormData();
    Object.entries(fields).forEach(([k, v]) => fd.append(k, String(v)));
    fd.append("receipt", new Blob([content], { type }), fileName);
    const r = await fetch(API + path, { method, headers: { Authorization: `Bearer ${U[who].t}` }, body: fd });
    return { s: r.status, j: await r.json() };
};
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const get = async (who, id) => (await call(who, "GET", "/expenses")).j.data?.find((e) => e._id === id);
const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");
const base = { title: "[QA] Cab to client", category: "Transportation", amount: 640, expenseDate: day(-2), paymentMethod: "UPI", currency: "INR", description: "[QA] lifecycle test" };
let A, B;

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
    const ids = made.map((id) => new mongoose.Types.ObjectId(id));
    const files = await db.collection("expenses").find({ _id: { $in: ids }, receiptFileId: { $ne: null } }).project({ receiptFileId: 1 }).toArray();
    const bucket = new mongoose.mongo.GridFSBucket(db, { bucketName: "expenseReceipts" });
    for (const f of files) await bucket.delete(f.receiptFileId).catch(() => {});
    const orphan = await db.collection("expenseReceipts.files").find({ filename: { $regex: `^(${made.join("|") || "none"})/` } }).toArray();
    for (const f of orphan) await bucket.delete(f._id).catch(() => {});
    await db.collection("expenses").deleteMany({ _id: { $in: ids } });
    await db.collection("notifications").deleteMany({ message: /\[QA\]/ });
    await mongoose.disconnect();
});

test("validation: category, amount above zero, real past date, payment method", { skip }, async () => {
    assert.equal((await call("emp", "POST", "/expenses", { ...base, amount: 0 })).s, 400, "zero amount");
    assert.equal((await call("emp", "POST", "/expenses", { ...base, category: "Jet" })).s, 400, "unknown category");
    assert.equal((await call("emp", "POST", "/expenses", { ...base, expenseDate: day(5) })).s, 400, "future date");
    assert.equal((await call("emp", "POST", "/expenses", { ...base, paymentMethod: "Barter" })).s, 400, "unknown payment method");
});

test("draft: private to its owner, then submitted for approval", { skip }, async () => {
    const r = await call("emp", "POST", "/expenses", { ...base, draft: true });
    assert.equal(r.s, 201, r.j.message);
    A = r.j.data._id; made.push(A);
    assert.equal(r.j.data.status, "Draft");
    assert.equal(r.j.data.submittedAt, null);
    assert.ok(!(await get("mgr", A)), "manager can't see someone's draft");
    assert.equal((await call("mgr", "PUT", `/expenses/${A}/status`, { status: "Approved" })).s, 409, "a draft can't be approved");
    const s = await call("emp", "PUT", `/expenses/${A}`, { amount: 720, submit: true });
    assert.equal(s.s, 200, s.j.message);
    const e = await get("mgr", A);
    assert.equal(e.status, "Pending"); assert.equal(e.amount, 720); assert.ok(e.submittedAt);
    assert.deepEqual(e.history.map((h) => h.action), ["Saved as draft", "Submitted"]);
    assert.equal(e.paymentMethod, "UPI"); assert.equal(e.title, "[QA] Cab to client");
});

test("reviewers: owner, outsiders and other teams can't decide; reasons are required", { skip }, async () => {
    assert.equal((await call("emp", "PUT", `/expenses/${A}/status`, { status: "Approved" })).s, 403, "can't approve your own claim");
    assert.notEqual((await call("outsider", "PUT", `/expenses/${A}/status`, { status: "Approved" })).s, 200, "an outsider can't decide");
    assert.equal((await call("otherLead", "PUT", `/expenses/${A}/status`, { status: "Approved" })).s, 403, "a lead from another team can't decide");
    assert.equal((await call("mgr", "PUT", `/expenses/${A}/status`, { status: "Changes Requested" })).s, 400, "request changes needs a comment");
    assert.equal((await call("mgr", "PUT", `/expenses/${A}/status`, { status: "Rejected" })).s, 400, "rejection needs a reason");
    assert.equal((await call("mgr", "PUT", `/expenses/${A}/status`, { status: "Reimbursed" })).s, 409, "can't skip straight to reimbursed");
    assert.equal((await call("emp", "PUT", `/expenses/${A}`, { amount: 1 })).s, 409, "a pending claim can't be edited");
});

test("changes requested → owner edits and resubmits (with a receipt)", { skip }, async () => {
    const r = await call("mgr", "PUT", `/expenses/${A}/status`, { status: "Changes Requested", comment: "[QA] attach the cab receipt" });
    assert.equal(r.s, 200, r.j.message);
    let e = await get("emp", A);
    assert.equal(e.status, "Changes Requested"); assert.equal(e.reviewComment, "[QA] attach the cab receipt");
    const up = await upload("emp", "PUT", `/expenses/${A}`, { submit: true, notes: "[QA] receipt added" }, "cab.png", "image/png", PNG);
    assert.equal(up.s, 200, up.j.message);
    e = await get("mgr", A);
    assert.equal(e.status, "Pending"); assert.ok(e.receiptUrl, "receipt attached");
    assert.equal(e.history.slice(-1)[0].action, "Resubmitted");
    const own = await fetch(API + e.receiptUrl, { headers: { Authorization: `Bearer ${U.mgr.t}` } });
    assert.equal(own.status, 200, "the manager can open the receipt");
    const out = await fetch(API + e.receiptUrl, { headers: { Authorization: `Bearer ${U.outsider.t}` } });
    assert.equal(out.status, 403, "an outsider can't open the receipt");
});

test("approve → processing → reimbursed; every step dated and logged; no going back", { skip }, async () => {
    assert.equal((await call("mgr", "PUT", `/expenses/${A}/status`, { status: "Approved" })).s, 200);
    let e = await get("fin", A);
    assert.equal(e.status, "Approved"); assert.ok(e.approvedAt); assert.equal(e.approvedBy._id || e.approvedBy, U.mgr.id);
    assert.equal((await call("mgr", "PUT", `/expenses/${A}/status`, { status: "Rejected", rejectionReason: "[QA] late" })).s, 409, "approved claims can't be rejected");
    assert.equal((await call("fin", "PUT", `/expenses/${A}/status`, { status: "Processing" })).s, 200);
    assert.equal((await call("fin", "PUT", `/expenses/${A}/status`, { status: "Reimbursed" })).s, 200);
    e = await get("emp", A);
    assert.equal(e.status, "Reimbursed"); assert.ok(e.reimbursedAt); assert.equal(e.reimbursedBy._id || e.reimbursedBy, U.fin.id);
    assert.deepEqual(e.history.map((h) => h.to), ["Draft", "Pending", "Changes Requested", "Pending", "Approved", "Processing", "Reimbursed"]);
    assert.equal((await call("fin", "PUT", `/expenses/${A}/status`, { status: "Pending" })).s, 409, "reimbursed is final");
    assert.equal((await call("emp", "DELETE", `/expenses/${A}`)).s, 404, "a reimbursed claim can't be deleted");
});

test("rejection with a reason → owner edits and resubmits; owners delete their own drafts/pending only", { skip }, async () => {
    const r = await call("emp", "POST", "/expenses", { ...base, title: "[QA] Team lunch", category: "Food", amount: 2400 });
    assert.equal(r.s, 201); B = r.j.data._id; made.push(B);
    assert.equal(r.j.data.status, "Pending", "submitted straight away");
    assert.equal((await call("mgr", "PUT", `/expenses/${B}/status`, { status: "Rejected", rejectionReason: "[QA] Not a client meeting" })).s, 200);
    let e = await get("emp", B);
    assert.equal(e.status, "Rejected"); assert.equal(e.rejectionReason, "[QA] Not a client meeting"); assert.ok(e.rejectedAt); assert.equal(e.rejectedBy._id || e.rejectedBy, U.mgr.id);
    assert.equal((await call("mgr", "PUT", `/expenses/${B}`, { amount: 10 })).s, 403, "only the owner can edit");
    assert.equal((await call("emp", "PUT", `/expenses/${B}`, { description: "[QA] client lunch with Kaveri Agro", submit: true })).s, 200);
    e = await get("emp", B);
    assert.equal(e.status, "Pending"); assert.equal(e.rejectionReason, "", "old reason cleared on resubmit (kept in history)");
    assert.ok(e.history.some((h) => h.to === "Rejected" && h.comment === "[QA] Not a client meeting"));
    assert.equal((await call("mgr", "DELETE", `/expenses/${B}`)).s, 404, "someone else can't delete it");
    assert.equal((await call("emp", "DELETE", `/expenses/${B}`)).s, 200, "owner deletes their pending claim");
    made.splice(made.indexOf(B), 1);
});
