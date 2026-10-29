import CalendarEventModel from "../models/calendarEventModel.js";
import ReminderModel from "../models/reminderModel.js";
import notificationModel from "../models/notificationModel.js";
import NotificationPrefModel from "../models/notificationPrefModel.js";
import employeeModel from "../models/employeeModel.js";
import taskModel from "../models/taskModel.js";
import { occurrences, wallOf, validTimeZone } from "./recurrence.js";
import { sendMail, isMailConfigured, escapeHtml, mailLayout } from "./mailer.js";

// Reminder engine. Reminders are planned ahead (60 days) as one record per person, occurrence
// and offset; a worker delivers the ones that are due. Every step is safe to repeat:
//   • planning upserts on a unique key, so re-planning never duplicates;
//   • delivery claims a reminder atomically (lockedUntil), so two servers never send it twice;
//   • a reminder for a cancelled, removed or completed occurrence is closed, not sent.
// The worker runs every minute where the server stays up, from /api/cron/reminders on Vercel,
// and for one person whenever their app asks for due reminders.

const DAY = 864e5;
const HORIZON = 60 * DAY;
const LATE_LIMIT = DAY; // later than this and it's recorded as missed instead of sent
const LOCK_MS = 2 * 60000;
const idStr = (x) => String(x?._id || x || "");

export const PREF_DEFAULTS = { inApp: true, email: false, timezone: "Asia/Kolkata", defaultReminder: 15, quietStart: "", quietEnd: "", dailySummary: true, snoozeDefault: 10, muted: [] };
export const prefsOf = async (userId) => ({ ...PREF_DEFAULTS, ...((await NotificationPrefModel.findOne({ employeeId: userId }).lean()) || {}) });

const toMin = (hhmm) => { const [h, m] = String(hhmm).split(":").map(Number); return (h || 0) * 60 + (m || 0); };
// Quiet hours are read on the person's own clock; a window like 22:00–07:00 crosses midnight.
export const inQuietHours = (prefs, at = new Date()) => {
    if (!prefs.quietStart || !prefs.quietEnd) return false;
    const w = wallOf(at, validTimeZone(prefs.timezone) ? prefs.timezone : "Asia/Kolkata");
    const now = w.h * 60 + w.mi, a = toMin(prefs.quietStart), b = toMin(prefs.quietEnd);
    return a === b ? false : a < b ? now >= a && now < b : now >= a || now < b;
};

export const recipientsOf = (ev) => [...new Set([ev.createdBy, ev.assignee, ...(ev.participants || [])].map(idStr).filter(Boolean))];
const hasTime = (list, t) => (list || []).some((d) => new Date(d).getTime() === t.getTime());

// Plan (or re-plan) an event's reminders for the next 60 days, and drop pending ones that no
// longer apply (time changed, person removed, reminder removed, occurrence skipped).
export const syncEventReminders = async (ev) => {
    const now = new Date();
    if (!ev || ev.status === "Cancelled") {
        if (ev) await ReminderModel.updateMany({ eventId: ev._id, status: "Pending" }, { $set: { status: "Cancelled", lockedUntil: null } });
        return;
    }
    const offsets = [...new Set((ev.reminders || []).map(Number).filter((n) => n >= 0))];
    const people = recipientsOf(ev);
    const maxOff = Math.max(0, ...offsets) * 60000;
    const wanted = new Map();
    for (const occ of occurrences(ev, now, new Date(now.getTime() + HORIZON + maxOff))) {
        if (hasTime(ev.completed, occ)) continue;
        for (const off of offsets) {
            const dueAt = new Date(occ.getTime() - off * 60000);
            if (dueAt < new Date(now.getTime() - 60000)) continue; // already passed when planned
            for (const u of people) wanted.set(`${u}|${occ.getTime()}|${off}`, { userId: u, occurrence: occ, offset: off, dueAt });
        }
    }
    const pending = await ReminderModel.find({ eventId: ev._id, status: "Pending" }).select("userId occurrence offset").lean();
    const stale = pending.filter((r) => !wanted.has(`${idStr(r.userId)}|${new Date(r.occurrence).getTime()}|${r.offset}`)).map((r) => r._id);
    if (stale.length) await ReminderModel.deleteMany({ _id: { $in: stale } });
    const ops = [...wanted.values()].map((w) => ({
        updateOne: {
            filter: { eventId: ev._id, userId: w.userId, occurrence: w.occurrence, offset: w.offset },
            update: { $setOnInsert: { dueAt: w.dueAt, status: "Pending" } },
            upsert: true,
        },
    }));
    for (let i = 0; i < ops.length; i += 500) await ReminderModel.bulkWrite(ops.slice(i, i + 500), { ordered: false });
};

const offsetLabel = (m) => (m === 0 ? "now" : m < 60 ? `in ${m} min` : m < 1440 ? `in ${Math.round(m / 60)} hour${m >= 120 ? "s" : ""}` : `in ${Math.round(m / 1440)} day${m >= 2880 ? "s" : ""}`);
const whenText = (date, tz, allDay) => new Intl.DateTimeFormat("en-IN", { timeZone: tz, weekday: "short", day: "numeric", month: "short", ...(allDay ? {} : { hour: "numeric", minute: "2-digit" }) }).format(date);
export const eventLink = (evId, occ) => `/calendar?event=${idStr(evId)}${occ ? `&at=${new Date(occ).getTime()}` : ""}`;

const finish = (id, set) => ReminderModel.updateOne({ _id: id }, { $set: { ...set, lockedUntil: null } });

const trySendEmail = async (r, ev, user, prefs) => {
    if (!isMailConfigured()) return { status: "skipped: email isn't set up on the server" };
    if (!user?.email) return { status: "skipped: no email address" };
    const tz = validTimeZone(prefs.timezone) ? prefs.timezone : "Asia/Kolkata";
    const when = whenText(new Date(r.occurrence), tz, ev.allDay);
    const res = await sendMail({
        to: user.email,
        subject: `Reminder: ${ev.title} — ${when}`,
        text: `${ev.title}\n${when}${ev.location ? `\n${ev.location}` : ""}${ev.description ? `\n\n${ev.description}` : ""}`,
        html: mailLayout(`Reminder: ${ev.title}`, `<p style="margin:0 0 8px;font-size:15px"><b>${escapeHtml(when)}</b></p>${ev.location ? `<p style="margin:0 0 8px;color:#475569">${escapeHtml(ev.location)}</p>` : ""}${ev.description ? `<p style="margin:12px 0 0;color:#334155;white-space:pre-line">${escapeHtml(ev.description)}</p>` : ""}`),
    });
    return res.sent ? { status: "sent" } : { status: `failed: ${res.reason || "unknown error"}`, failed: true };
};

// Deliver one claimed reminder.
const deliver = async (r, now) => {
    const ev = await CalendarEventModel.findById(r.eventId).lean();
    const occ = new Date(r.occurrence);
    if (!ev || ev.status === "Cancelled" || hasTime(ev.exdates, occ)) return finish(r._id, { status: "Cancelled" });
    if (hasTime(ev.completed, occ)) return finish(r._id, { status: "Completed" });
    if (!recipientsOf(ev).includes(idStr(r.userId))) return finish(r._id, { status: "Cancelled" });
    if (now - new Date(r.dueAt) > LATE_LIMIT) return finish(r._id, { status: "Missed" });

    const [prefs, user] = await Promise.all([prefsOf(r.userId), employeeModel.findById(r.userId).select("email status").lean()]);
    if (!user || user.status !== "Active") return finish(r._id, { status: "Cancelled" });
    const tz = validTimeZone(prefs.timezone) ? prefs.timezone : "Asia/Kolkata";
    const delivery = { inApp: "off", email: "off", emailAttempts: 0, emailRetryAt: null };

    if (prefs.inApp && !(prefs.muted || []).includes("Reminder")) {
        await notificationModel.create({
            employeeId: r.userId,
            title: r.offset ? `${ev.title} — ${offsetLabel(r.offset)}` : ev.title,
            message: `${ev.eventType} · ${whenText(occ, tz, ev.allDay)}${ev.location ? ` · ${ev.location}` : ""}`,
            type: "Reminder",
            priority: ev.priority,
            link: eventLink(ev._id, occ),
        });
        delivery.inApp = "sent";
    }
    // Email: only when the event asks for it and the person allows it. Quiet hours hold back
    // email for anything below Critical; Critical reminders always go out.
    if (ev.emailReminders && prefs.email) {
        if (inQuietHours(prefs, now) && ev.priority !== "Critical") delivery.email = "skipped: quiet hours";
        else {
            const e = await trySendEmail(r, ev, user, prefs);
            delivery.email = e.status;
            delivery.emailAttempts = 1;
            if (e.failed) delivery.emailRetryAt = new Date(now.getTime() + 5 * 60000);
        }
    }
    return finish(r._id, { status: "Sent", sentAt: now, delivery, lastError: delivery.email.startsWith("failed") ? delivery.email : "" });
};

// Retry failed emails: up to 3 tries, 5 → 20 minutes apart.
const retryEmails = async (now, userFilter) => {
    for (let i = 0; i < 50; i++) {
        const r = await ReminderModel.findOneAndUpdate(
            { ...userFilter, "delivery.emailRetryAt": { $ne: null, $lte: now }, $or: [{ lockedUntil: null }, { lockedUntil: { $lt: now } }] },
            { $set: { lockedUntil: new Date(now.getTime() + LOCK_MS) } }, { new: true }
        ).lean();
        if (!r) break;
        const ev = await CalendarEventModel.findById(r.eventId).lean();
        const [prefs, user] = await Promise.all([prefsOf(r.userId), employeeModel.findById(r.userId).select("email").lean()]);
        const e = ev && ev.status !== "Cancelled" ? await trySendEmail(r, ev, user, prefs) : { status: "skipped: event cancelled" };
        const tries = (r.delivery?.emailAttempts || 1) + 1;
        const retryAt = e.failed && tries < 3 ? new Date(now.getTime() + 5 * 60000 * Math.pow(4, tries - 1)) : null;
        await finish(r._id, { "delivery.email": e.status, "delivery.emailAttempts": tries, "delivery.emailRetryAt": retryAt, lastError: e.failed ? e.status : "" });
    }
};

// Deliver everything due (or only one person's, when their app asks).
export const processDueReminders = async ({ userId } = {}) => {
    const now = new Date();
    const userFilter = userId ? { userId } : {};
    let sent = 0;
    for (let i = 0; i < 300; i++) {
        const r = await ReminderModel.findOneAndUpdate(
            { ...userFilter, status: "Pending", dueAt: { $lte: now }, $or: [{ lockedUntil: null }, { lockedUntil: { $lt: now } }] },
            { $set: { lockedUntil: new Date(now.getTime() + LOCK_MS) }, $inc: { attempts: 1 } },
            { new: true, sort: { dueAt: 1 } }
        ).lean();
        if (!r) break;
        try { await deliver(r, now); sent++; }
        catch (err) {
            console.error("Reminder delivery failed:", err.message);
            // give it back for another try in a minute; stop after 5 attempts
            await ReminderModel.updateOne({ _id: r._id }, { $set: { lockedUntil: new Date(now.getTime() + 60000), lastError: err.message, ...(r.attempts >= 5 ? { status: "Missed" } : {}) } });
        }
    }
    await retryEmails(now, userFilter);
    return { sent };
};

// Task deadline alerts: "due soon" once when a task is due within a day, "overdue" once after
// the day has passed. The atomic update on the *NotifiedAt field keeps it to one alert each,
// even with several servers. Changing the due date clears both (see the task routes).
export const notifyTaskDeadlines = async () => {
    const now = new Date();
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const base = { status: { $ne: "Done" }, closedAt: null, assignedTo: { $ne: null } };
    let soon = 0, late = 0;
    const dueSoon = await taskModel.find({ ...base, dueSoonNotifiedAt: null, dueDate: { $gte: today, $lte: new Date(now.getTime() + DAY) } }).select("title assignedTo projectId personal dueDate").limit(500).lean();
    for (const t of dueSoon) {
        const claimed = await taskModel.updateOne({ _id: t._id, dueSoonNotifiedAt: null }, { $set: { dueSoonNotifiedAt: now } });
        if (!claimed.modifiedCount) continue;
        const isToday = new Date(t.dueDate) < new Date(today.getTime() + DAY);
        await notificationModel.create({ employeeId: t.assignedTo, title: `${t.personal ? "To-do" : "Task"} due ${isToday ? "today" : "tomorrow"}`, message: `“${t.title}”`, type: t.personal ? "Reminder" : "Task", priority: "High", link: t.personal ? "/tasks" : t.projectId ? `/projects/${t.projectId}` : "/projects/my-tasks" });
        soon++;
    }
    const overdue = await taskModel.find({ ...base, overdueNotifiedAt: null, dueDate: { $lt: today } }).select("title assignedTo projectId personal").limit(500).lean();
    for (const t of overdue) {
        const claimed = await taskModel.updateOne({ _id: t._id, overdueNotifiedAt: null }, { $set: { overdueNotifiedAt: now } });
        if (!claimed.modifiedCount) continue;
        await notificationModel.create({ employeeId: t.assignedTo, title: `${t.personal ? "To-do" : "Task"} overdue`, message: `“${t.title}” is past its due date.`, type: t.personal ? "Reminder" : "Task", priority: "High", link: t.personal ? "/tasks" : t.projectId ? `/projects/${t.projectId}` : "/projects/my-tasks" });
        late++;
    }
    return { soon, late };
};

// Keep the 60-day plan rolling for repeating events.
export const extendRecurringReminders = async () => {
    const list = await CalendarEventModel.find({ status: "Scheduled", "recurrence.freq": { $ne: "none" }, $or: [{ "recurrence.until": null }, { "recurrence.until": { $gte: new Date() } }] }).limit(2000).lean();
    for (const ev of list) await syncEventReminders(ev);
    return { events: list.length };
};

let lastDeadlines = 0, lastExtend = 0;
export const runReminderJobs = async ({ force = false } = {}) => {
    const out = { reminders: await processDueReminders() };
    if (force || Date.now() - lastDeadlines > 60 * 60000) { lastDeadlines = Date.now(); out.deadlines = await notifyTaskDeadlines(); }
    if (force || Date.now() - lastExtend > 6 * 3600000) { lastExtend = Date.now(); out.extended = await extendRecurringReminders(); }
    return out;
};

// Where the server stays up, check every minute.
export const startReminderScheduler = (ensureDb) => {
    const tick = async () => { try { await ensureDb(); await runReminderJobs(); } catch (err) { console.error("Reminder job failed:", err.message); } };
    setTimeout(tick, 20000);
    return setInterval(tick, 60000);
};
