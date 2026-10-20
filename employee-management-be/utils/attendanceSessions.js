// Helpers for the per-day check-in/check-out sessions on an attendance record.

// The record's sessions; a record from before sessions existed counts as one.
export const sessionsOf = (att) => {
    if (att?.sessions?.length) return att.sessions;
    if (att?.checkIn?.time) return [{ mode: att.attendanceType, checkIn: att.checkIn, checkOut: att.checkOut || { time: null } }];
    return [];
};

export const openSession = (att) => {
    const list = sessionsOf(att);
    const last = list[list.length - 1];
    return last && last.checkIn?.time && !last.checkOut?.time ? last : null;
};

const hoursBetween = (a, b) => Math.max(0, (new Date(b) - new Date(a)) / 36e5);

// Hours of closed sessions only, or including an open one up to `now`.
export const workedHoursOf = (att, now = null) =>
    sessionsOf(att).reduce((sum, s) => {
        if (!s.checkIn?.time) return sum;
        if (s.checkOut?.time) return sum + hoursBetween(s.checkIn.time, s.checkOut.time);
        return now ? sum + hoursBetween(s.checkIn.time, now) : sum;
    }, 0);

// Legacy records keep their data in checkIn/checkOut only — copy it into sessions before editing.
export const ensureSessions = (att) => {
    if (!att.sessions?.length && att.checkIn?.time) {
        att.sessions = [{ mode: att.attendanceType, checkIn: att.checkIn, checkOut: att.checkOut?.time ? att.checkOut : { time: null } }];
    }
    return att;
};

// Present / Late / Half Day from the day's total hours.
export const statusFor = (att, halfDayHours) =>
    att.workingHours < halfDayHours ? "Half Day" : att.lateByMinutes > 0 ? "Late" : "Present";
