import employeeModel from "../models/employeeModel.js";
import AuditEngagementModel from "../models/auditEngagementModel.js";
import { reportsUnder, DOC_ADMIN_ROLES, DOC_ALL_DESIGNATIONS } from "./documentAccess.js";

// Who can message whom: your team and the officials above you.
//  - everyone up your reporting line, and everyone who reports to you (directly or further down)
//  - teammates: people with the same manager, and people on the same open audit projects
//  - firm-wide seniors (Admin / HR roles, Directors, Company Partners, HR Head) can message
//    anyone, and anyone can message them
const isSenior = (e) => DOC_ADMIN_ROLES.includes(e?.role) || DOC_ALL_DESIGNATIONS.includes(e?.designation);

export const allowedContactIds = async (meId) => {
    const me = await employeeModel.findById(meId).select("role designation manager").lean();
    if (!me) return new Set();
    const active = await employeeModel.find({ status: "Active", _id: { $ne: meId } }).select("_id role designation manager").lean();
    if (isSenior(me)) return new Set(active.map((e) => String(e._id)));

    const ok = new Set();
    // leadership and function heads are reachable by everyone; a Senior Manager only by their own line
    active.filter((e) => isSenior(e) && e.designation !== "Senior Manager").forEach((e) => ok.add(String(e._id)));
    // up the line
    const byId = new Map(active.map((e) => [String(e._id), e]));
    let cur = me.manager ? String(me.manager) : null;
    for (let i = 0; cur && i < 12; i++) { ok.add(cur); cur = byId.get(cur)?.manager ? String(byId.get(cur).manager) : null; }
    // down the line
    (await reportsUnder(meId)).forEach((id) => ok.add(id));
    // same manager
    if (me.manager) active.filter((e) => e.manager && String(e.manager) === String(me.manager)).forEach((e) => ok.add(String(e._id)));
    // same open audit projects
    const audits = await AuditEngagementModel.find({ isDeleted: false, status: { $nin: ["Completed", "Cancelled"] }, $or: [{ teamMembers: meId }, { auditManager: meId }] }).select("teamMembers auditManager").lean();
    audits.forEach((a) => [a.auditManager, ...(a.teamMembers || [])].forEach((id) => id && ok.add(String(id))));

    ok.delete(String(meId));
    // only active people
    return new Set([...ok].filter((id) => byId.has(id)));
};
