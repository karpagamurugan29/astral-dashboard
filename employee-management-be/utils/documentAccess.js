import employeeModel from "../models/employeeModel.js";

// Who may see an employee's documents: the employee, everyone above them in the reporting line
// (manager, manager's manager, …), Admin / HR, and the firm-wide senior designations below.
export const DOC_ADMIN_ROLES = ["Admin", "HR"];
export const DOC_ALL_DESIGNATIONS = ["Director", "Company Partner", "HR Head"];

export const viewerOf = async (req) => {
    const me = await employeeModel.findById(req.user.id).select("role designation").lean();
    const role = me?.role || req.user.role;
    const all = DOC_ADMIN_ROLES.includes(role) || DOC_ALL_DESIGNATIONS.includes(me?.designation);
    return { id: String(req.user.id), role, designation: me?.designation || "", all, admin: DOC_ADMIN_ROLES.includes(role) || me?.designation === "HR Head" };
};

// Everyone who reports to `managerId`, directly or further down the line.
export const reportsUnder = async (managerId) => {
    const out = new Set();
    let frontier = [String(managerId)];
    for (let depth = 0; depth < 12 && frontier.length; depth++) {
        const next = await employeeModel.find({ manager: { $in: frontier } }).select("_id").lean();
        frontier = next.map((e) => String(e._id)).filter((id) => !out.has(id));
        frontier.forEach((id) => out.add(id));
    }
    out.delete(String(managerId));
    return out;
};

// true when the viewer is the owner or sits above them in the reporting line.
export const isInLine = async (viewer, ownerId) => {
    if (!ownerId) return true; // company-wide
    if (viewer.all || String(ownerId) === viewer.id) return true;
    let cur = String(ownerId);
    for (let depth = 0; depth < 12 && cur; depth++) {
        const e = await employeeModel.findById(cur).select("manager").lean();
        const m = e?.manager ? String(e.manager) : null;
        if (!m) return false;
        if (m === viewer.id) return true;
        cur = m;
    }
    return false;
};
