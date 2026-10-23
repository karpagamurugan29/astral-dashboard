import attendanceModel from "../models/attendanceModel.js";
import AuditTimeLogModel from "../models/auditTimeLogModel.js";
import AuditEngagementModel from "../models/auditEngagementModel.js";
import CompanySettings from "../models/CompanySettingsModel.js";
import employeeModel from "../models/employeeModel.js";
import { openSession, workedHoursOf, ensureSessions, statusFor } from "./attendanceSessions.js";
import { notify } from "./notify.js";
import { sendMail, mailLayout, escapeHtml } from "./mailer.js";

// Anyone still checked in at the cut-off (8 PM company time by default) is checked out at the
// cut-off, any audit timer they left running is stopped at the same moment, they get an in-app
// notice, and their reporting manager gets an email (copied to them).
//   AUTO_CHECKOUT_HOUR  — 0-23, default 20
//   COMPANY_TIMEZONE    — IANA name, default Asia/Kolkata

export const CUTOFF_HOUR = () => {
    const h = Number(process.env.AUTO_CHECKOUT_HOUR);
    return Number.isInteger(h) && h >= 0 && h <= 23 ? h : 20;
};
export const COMPANY_TZ = () => process.env.COMPANY_TIMEZONE || "Asia/Kolkata";

// Calendar parts of an instant in a time zone.
const partsIn = (date, tz) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
        .formatToParts(date).filter((x) => x.type !== "literal").map((x) => [x.type, Number(x.value)]));
    return p; // { year, month, day, hour, minute }
};

// The instant that is `hour`:00 on the given local calendar day in `tz`.
const zonedInstant = (y, m, d, hour, tz) => {
    const guess = Date.UTC(y, m - 1, d, hour, 0, 0);
    const p = partsIn(new Date(guess), tz);
    const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    return new Date(guess - (asIfUtc - guess));
};

// Midnight (company time) of the day a moment falls on.
export const localDayStart = (moment = new Date(), tz = COMPANY_TZ()) => {
    const p = partsIn(new Date(moment), tz);
    return zonedInstant(p.year, p.month, p.day, 0, tz);
};

// The first cut-off after a moment: that day's, or the next day's when it started after the cut-off
// (a late check-in at 9 PM is closed at 8 PM the following day, not left open forever).
export const cutoffFor = (moment, tz = COMPANY_TZ(), hour = CUTOFF_HOUR()) => {
    const t = new Date(moment);
    const p = partsIn(t, tz);
    const sameDay = zonedInstant(p.year, p.month, p.day, hour, tz);
    if (t < sameDay) return sameDay;
    const n = partsIn(new Date(zonedInstant(p.year, p.month, p.day, 12, tz).getTime() + 864e5), tz); // noon tomorrow → tomorrow's date
    return zonedInstant(n.year, n.month, n.day, hour, tz);
};

const fmt = (d, tz) => new Date(d).toLocaleString("en-IN", { timeZone: tz, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const fmtTime = (d, tz) => new Date(d).toLocaleTimeString("en-IN", { timeZone: tz, hour: "numeric", minute: "2-digit" });

// Close every session/timer that started before its own day's cut-off and is still open now.
// Safe to run any number of times: only still-open items are touched.
export const runAutoCheckout = async (now = new Date()) => {
    const tz = COMPANY_TZ();
    const hour = CUTOFF_HOUR();
    const since = new Date(now.getTime() - 7 * 864e5); // catch up on a missed run, up to a week back
    const label = `${hour % 12 || 12} ${hour < 12 ? "AM" : "PM"}`;
    const halfDay = (await CompanySettings.findOne().lean())?.workingHours?.halfDayHours || 4.5;

    const people = new Map(); // employeeId → { checkout?, timers: [] }
    const entry = (id) => { const k = String(id); if (!people.has(k)) people.set(k, { timers: [] }); return people.get(k); };

    // 1. Attendance left open.
    const open = await attendanceModel.find({ "checkOut.time": null, "checkIn.time": { $gte: since, $lt: now } });
    for (const att of open) {
        const session = openSession(att);
        if (!session) continue;
        const cutoff = cutoffFor(session.checkIn.time, tz, hour);
        if (cutoff > now) continue; // its cut-off hasn't come yet

        ensureSessions(att);
        const idx = att.sessions.length - 1;
        const punch = { time: cutoff, remarks: `Auto check-out at ${label} — did not check out` };
        att.sessions[idx].checkOut = punch;
        att.checkOut = punch;
        att.autoCheckedOut = true;
        att.workingHours = Number(workedHoursOf(att).toFixed(2));
        att.status = statusFor(att, halfDay);
        await att.save();
        entry(att.employeeId).checkout = { checkIn: session.checkIn.time, checkOut: cutoff, hours: att.workingHours };
    }

    // 2. Audit timers left running.
    const running = await AuditTimeLogModel.find({ endTime: null, startTime: { $gte: since, $lt: now } });
    for (const log of running) {
        const cutoff = cutoffFor(log.startTime, tz, hour);
        if (cutoff > now) continue;
        log.endTime = cutoff;
        log.durationMinutes = Math.max(0, Math.round((cutoff - log.startTime) / 60000));
        log.note = [log.note, `(timer auto-stopped at ${label})`].filter(Boolean).join(" ");
        log.autoStopped = true; log.needsReview = true; log.originalMinutes = log.durationMinutes; log.reviewReason = "was still running at the day's cut-off";
        await log.save();
        const audit = await AuditEngagementModel.findById(log.auditId).select("clientName engagementName auditType auditCode").lean();
        entry(log.employeeId).timers.push({ start: log.startTime, end: cutoff, minutes: log.durationMinutes, audit });
    }

    // 3. Tell them and their reporting manager.
    let emailed = 0;
    for (const [employeeId, info] of people) {
        const emp = await employeeModel.findById(employeeId).select("firstName lastName email employeeId manager").populate("manager", "firstName lastName email").lean();
        if (!emp) continue;
        const name = `${emp.firstName} ${emp.lastName}`.trim();

        const lines = [];
        if (info.checkout) lines.push(`Checked in ${fmt(info.checkout.checkIn, tz)}, not checked out — checked out automatically at ${fmtTime(info.checkout.checkOut, tz)} (${info.checkout.hours}h recorded today).`);
        info.timers.forEach((t) => lines.push(`Audit timer on ${t.audit?.clientName || "an audit"} (${t.audit?.auditCode || ""}) left running from ${fmt(t.start, tz)} — stopped at ${fmtTime(t.end, tz)} (${Math.floor(t.minutes / 60)}h ${t.minutes % 60}m).`));
        if (!lines.length) continue;

        notify(emp._id, `Auto check-out at ${label}`, `${lines.join(" ")} If the time is wrong, request a correction.`, "General", "/attendance/regularization");

        const to = emp.manager?.email;
        const html = mailLayout(`${name} did not check out`, `
<p style="margin:0 0 12px;font-size:14px;line-height:1.5">${escapeHtml(emp.manager ? `Hi ${emp.manager.firstName},` : "Hello,")}</p>
<p style="margin:0 0 12px;font-size:14px;line-height:1.5"><b>${escapeHtml(name)}</b> (${escapeHtml(emp.employeeId || "")}) was still checked in at the ${label} cut-off, so the system closed the day for them:</p>
<ul style="margin:0 0 16px;padding-left:18px;font-size:14px;line-height:1.6">${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>
<p style="margin:0;font-size:13px;color:#64748b;line-height:1.5">If they actually left earlier or worked later, they can request a correction under Attendance → Regularization for you to approve.</p>`);
        const text = `${name} (${emp.employeeId || ""}) was still checked in at the ${label} cut-off:\n- ${lines.join("\n- ")}\nIf the time is wrong, they can request a correction under Attendance → Regularization.`;

        const res = to
            ? await sendMail({ to, cc: emp.email, subject: `Auto check-out: ${name} did not check out`, html, text })
            : await sendMail({ to: emp.email, subject: `Auto check-out at ${label}`, html, text });
        if (res.sent) emailed += 1;
    }

    return { checkedOut: [...people.values()].filter((p) => p.checkout).length, timersStopped: [...people.values()].reduce((s, p) => s + p.timers.length, 0), emailed, people: people.size };
};

// Self-scheduling for a long-running server (local / VM). On Vercel the cron route does this.
export const startAutoCheckoutScheduler = (ensureDb = async () => {}) => {
    let lastRunDay = null;
    const tick = async () => {
        const tz = COMPANY_TZ();
        const p = partsIn(new Date(), tz);
        const day = `${p.year}-${p.month}-${p.day}`;
        if (p.hour >= CUTOFF_HOUR() && lastRunDay !== day) {
            lastRunDay = day;
            try {
                await ensureDb();
                const r = await runAutoCheckout();
                if (r.people) console.log(`Auto check-out: ${r.checkedOut} checked out, ${r.timersStopped} timers stopped, ${r.emailed} emails sent`);
            } catch (err) {
                console.error("Auto check-out failed:", err.message);
                lastRunDay = null; // try again next minute
            }
        }
    };
    setTimeout(tick, 15000); // catch up shortly after start (e.g. server restarted after 8 PM)
    return setInterval(tick, 60000);
};
