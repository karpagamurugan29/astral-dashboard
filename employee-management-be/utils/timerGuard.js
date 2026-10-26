import AuditTimeLogModel from "../models/auditTimeLogModel.js";
import AuditEngagementModel from "../models/auditEngagementModel.js";
import { cutoffFor, COMPANY_TZ, TIMER_STOP_HOUR } from "./autoCheckout.js";
import { notify } from "./notify.js";

/* Forgotten audit timers must never inflate a bill.
   - A timer stops by itself at the earlier of: MAX hours after it started, or the timer stop hour
     (7 PM by default, AUDIT_TIMER_STOP_HOUR). Such sessions are marked autoStopped + needsReview.
   - Checking out of attendance stops any running timer at the same moment.
   - Any session longer than REVIEW_OVER hours (even stopped by hand) is flagged for review.
   - Flagged sessions are left out of bills until a manager approves or corrects them.
   This runs lazily wherever timers are read, so it works even if the nightly job doesn't. */
export const MAX_SESSION_HOURS = () => Number(process.env.AUDIT_TIMER_MAX_HOURS) || 10;
export const REVIEW_OVER_HOURS = () => Number(process.env.AUDIT_TIMER_REVIEW_HOURS) || 9;

const tell = async (log, why) => {
    const audit = await AuditEngagementModel.findById(log.auditId).select("auditCode clientName auditManager").lean();
    const h = `${Math.floor(log.durationMinutes / 60)}h ${log.durationMinutes % 60}m`;
    notify(log.employeeId, "Audit timer stopped automatically", `Your timer on ${audit?.clientName || "an audit"} (${audit?.auditCode || ""}) ${why} — ${h} recorded. Your manager will confirm the time before it's billed.`, "Audit", `/audits/${log.auditId}`);
    if (audit?.auditManager && String(audit.auditManager) !== String(log.employeeId)) notify(audit.auditManager, "Timer needs your review", `A session on ${audit.auditCode} ${why} (${h}). Check it in the time log before billing.`, "Audit", `/audits/${log.auditId}`);
};

// Close running timers that should already have stopped. `filter` narrows it (employeeId / auditId).
export const closeStaleTimers = async (filter = {}) => {
    const now = Date.now();
    const maxMs = MAX_SESSION_HOURS() * 36e5;
    const running = await AuditTimeLogModel.find({ endTime: null, ...filter });
    let closed = 0;
    for (const log of running) {
        const start = new Date(log.startTime).getTime();
        const cutoff = cutoffFor(log.startTime, COMPANY_TZ(), TIMER_STOP_HOUR()).getTime();
        const stopAt = Math.min(start + maxMs, cutoff);
        if (stopAt > now) continue;
        const byCap = start + maxMs <= cutoff;
        log.endTime = new Date(stopAt);
        log.durationMinutes = Math.max(0, Math.round((stopAt - start) / 60000));
        log.originalMinutes = log.durationMinutes;
        log.autoStopped = true;
        log.needsReview = true;
        const h = TIMER_STOP_HOUR();
        log.reviewReason = byCap ? `ran ${MAX_SESSION_HOURS()} hours without being stopped` : `was still running at ${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;
        log.note = [log.note, "(stopped automatically)"].filter(Boolean).join(" ");
        await log.save();
        await tell(log, log.reviewReason);
        closed++;
    }
    return closed;
};

// Checking out of attendance stops the person's running timers at that moment.
export const stopTimersAtCheckout = async (employeeId, at = new Date()) => {
    const running = await AuditTimeLogModel.find({ employeeId, endTime: null });
    for (const log of running) {
        log.endTime = at;
        log.durationMinutes = Math.max(0, Math.round((at - log.startTime) / 60000));
        log.autoStopped = true;
        log.note = [log.note, "(stopped at check-out)"].filter(Boolean).join(" ");
        if (log.durationMinutes > REVIEW_OVER_HOURS() * 60) { log.needsReview = true; log.reviewReason = `ran over ${REVIEW_OVER_HOURS()} hours`; log.originalMinutes = log.durationMinutes; }
        await log.save();
    }
    return running.length;
};

// A long session stopped by hand still gets a second look.
export const flagIfLong = (log) => {
    if (log.durationMinutes > REVIEW_OVER_HOURS() * 60) {
        log.needsReview = true;
        log.reviewReason = `ran over ${REVIEW_OVER_HOURS()} hours`;
        log.originalMinutes = log.durationMinutes;
    }
    return log;
};
