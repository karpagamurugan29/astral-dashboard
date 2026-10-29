// Time zones and repeating events, without a date library.
// Events are stored as UTC instants plus the IANA time zone they were planned in. Repeats are
// worked out on the wall clock of that zone, so a 10:00 weekly meeting stays at 10:00 when
// daylight saving starts or ends.

export const validTimeZone = (tz) => {
    if (!tz || typeof tz !== "string") return false;
    try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
};

const fmtCache = new Map();
const formatter = (tz) => {
    if (!fmtCache.has(tz)) fmtCache.set(tz, new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short" }));
    return fmtCache.get(tz);
};
const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// The wall-clock reading of an instant in a zone.
export const wallOf = (date, tz) => {
    const parts = Object.fromEntries(formatter(tz).formatToParts(date).map((p) => [p.type, p.value]));
    return { y: +parts.year, m: +parts.month - 1, d: +parts.day, h: +parts.hour, mi: +parts.minute, s: +parts.second, wd: WD[parts.weekday] };
};
const offsetMin = (date, tz) => { const w = wallOf(date, tz); return (Date.UTC(w.y, w.m, w.d, w.h, w.mi, w.s) - date.getTime()) / 60000; };

// The instant a wall-clock time happens in a zone. In the hour skipped by daylight saving it
// lands just after the gap; in the repeated hour it picks the first one.
export const instantOf = (y, m, d, h, mi, tz) => {
    const guess = Date.UTC(y, m, d, h, mi);
    let t = guess - offsetMin(new Date(guess), tz) * 60000;
    const second = guess - offsetMin(new Date(t), tz) * 60000;
    if (second !== t) t = Math.min(t, second);
    return new Date(t);
};

export const FREQS = ["none", "daily", "weekly", "monthly", "yearly"];
const MAX_OCCURRENCES = 1500;

// Clean a repeat rule from the request: { freq, interval, byWeekday, until, count }.
export const parseRecurrence = (r, start) => {
    if (!r || !r.freq || r.freq === "none") return { freq: "none" };
    if (!FREQS.includes(r.freq)) throw Object.assign(new Error("Pick how often it repeats."), { status: 400 });
    const interval = Math.trunc(Number(r.interval) || 1);
    if (interval < 1 || interval > 99) throw Object.assign(new Error("Repeat every 1 to 99 periods."), { status: 400 });
    const byWeekday = r.freq === "weekly" && Array.isArray(r.byWeekday) ? [...new Set(r.byWeekday.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort() : [];
    let until = null, count = null;
    if (r.until) { until = new Date(r.until); if (isNaN(until)) throw Object.assign(new Error("The repeat end date isn't valid."), { status: 400 }); if (until < start) throw Object.assign(new Error("The repeat can't end before the event starts."), { status: 400 }); }
    if (r.count) { count = Math.trunc(Number(r.count)); if (!(count >= 1 && count <= 500)) throw Object.assign(new Error("Repeat between 1 and 500 times."), { status: 400 }); }
    return { freq: r.freq, interval, byWeekday, until, count };
};

const daysIn = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

// Every start instant of an event between `from` and `to` (inclusive), honouring the rule,
// its end (until / count) and the skipped dates (exdates, as epoch ms of the original starts).
export const occurrences = (ev, from, to) => {
    const start = new Date(ev.start);
    const rule = ev.recurrence || { freq: "none" };
    const ex = new Set((ev.exdates || []).map((d) => new Date(d).getTime()));
    if (!rule.freq || rule.freq === "none") return start >= from && start <= to && !ex.has(start.getTime()) ? [start] : [];
    const tz = validTimeZone(ev.timezone) ? ev.timezone : "UTC";
    const w0 = wallOf(start, tz);
    const until = rule.until ? new Date(rule.until) : null;
    const out = [];
    let n = 0; // occurrences counted from the first, for `count`
    const push = (t) => {
        n++;
        if (rule.count && n > rule.count) return false;
        if (until && t > until) return false;
        if (t > to) return false;
        if (t >= from && !ex.has(t.getTime())) out.push(t);
        return true;
    };
    const step = rule.interval || 1;
    for (let k = 0; k < MAX_OCCURRENCES; k++) {
        if (rule.freq === "daily") {
            const t = instantOf(w0.y, w0.m, w0.d + k * step, w0.h, w0.mi, tz);
            if (!push(t)) break;
        } else if (rule.freq === "weekly") {
            const days = rule.byWeekday?.length ? rule.byWeekday : [w0.wd];
            let stop = false;
            for (const wd of days) {
                const offset = k * 7 * step + (wd - w0.wd);
                if (offset < 0) continue; // before the first occurrence in week 0
                const t = instantOf(w0.y, w0.m, w0.d + offset, w0.h, w0.mi, tz);
                if (!push(t)) { stop = true; break; }
            }
            if (stop) break;
        } else if (rule.freq === "monthly") {
            const mm = w0.m + k * step, y = w0.y + Math.floor(mm / 12), m = ((mm % 12) + 12) % 12;
            if (w0.d > daysIn(y, m)) continue; // e.g. the 31st in a 30-day month is skipped
            if (!push(instantOf(y, m, w0.d, w0.h, w0.mi, tz))) break;
        } else if (rule.freq === "yearly") {
            const y = w0.y + k * step;
            if (w0.d > daysIn(y, w0.m)) continue; // 29 Feb outside leap years
            if (!push(instantOf(y, w0.m, w0.d, w0.h, w0.mi, tz))) break;
        }
    }
    return out;
};
