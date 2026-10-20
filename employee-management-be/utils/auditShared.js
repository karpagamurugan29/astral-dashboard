import AuditClientModel from "../models/auditClientModel.js";
import AuditEngagementModel from "../models/auditEngagementModel.js";

// Shared by the audit engagement and audit client controllers.

export const PERSON = "employeeId firstName lastName designation department";
export const MANAGERS = ["Admin", "HR"];
export const CLOSED = ["Completed", "Cancelled"];

// Minutes for a session; a running one counts up to now.
export const minutesOf = (log, now = Date.now()) =>
    log.endTime ? log.durationMinutes : Math.max(0, Math.round((now - new Date(log.startTime)) / 60000));

const dayKey = (d) => {
    const x = new Date(d);
    return `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}`;
};

// Totals for a set of sessions: hours, distinct calendar days worked, session count.
export const summarise = (logs) => {
    const now = Date.now();
    const days = new Set();
    let minutes = 0;
    logs.forEach((l) => {
        minutes += minutesOf(l, now);
        days.add(dayKey(l.startTime));
    });
    return {
        totalMinutes: minutes,
        daysWorked: days.size,
        sessions: logs.length,
        firstStart: logs.length ? logs.reduce((a, l) => (l.startTime < a ? l.startTime : a), logs[0].startTime) : null,
        lastActivity: logs.length ? logs.reduce((a, l) => { const t = l.endTime || new Date(); return t > a ? t : a; }, new Date(0)) : null,
        running: logs.some((l) => !l.endTime),
    };
};

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Next free "CL-0001" style code.
export const nextClientCode = async () => {
    const last = await AuditClientModel.findOne({ clientCode: /^CL-\d+$/ }).sort({ clientCode: -1 }).select("clientCode").lean();
    let n = last ? Number(last.clientCode.slice(3)) + 1 : 1;
    // Codes are unique even across archived clients, so skip any that are taken.
    while (await AuditClientModel.exists({ clientCode: `CL-${String(n).padStart(4, "0")}` })) n += 1;
    return `CL-${String(n).padStart(4, "0")}`;
};

// The client with this name (case-insensitive), creating it if needed.
export const findOrCreateClientByName = async (name, createdBy) => {
    const clean = String(name || "").trim();
    if (!clean) return null;
    const existing = await AuditClientModel.findOne({ name: new RegExp(`^${escapeRegex(clean)}$`, "i"), isDeleted: false });
    if (existing) return existing;
    return AuditClientModel.create({ clientCode: await nextClientCode(), name: clean, createdBy });
};

// Audits created before clients existed only carry a clientName. Give each one a client record
// (one per distinct name) so they show up under Clients. Cheap once everything is linked.
export const linkLegacyAudits = async () => {
    const orphans = await AuditEngagementModel.find({ clientId: null }).select("clientName createdBy").lean();
    for (const a of orphans) {
        const client = await findOrCreateClientByName(a.clientName || "Unnamed client", a.createdBy);
        await AuditEngagementModel.updateOne({ _id: a._id }, { clientId: client._id, clientName: client.name });
    }
};
