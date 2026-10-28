import roleSettingModel from "../models/roleSettingModel.js";
import employeeModel from "../models/employeeModel.js";
import { logAudit } from "../utils/audit.js";
import { invalidatePermissionCache } from "../middleware/permission.middleware.js";
import { getAccess } from "../utils/access.js";
import { scopeOf } from "../utils/hierarchy.js";

// Screens a person can open (menu + page). Granted through the same layers as modules
// (role, designation, department, person) and stored in the same permission arrays.
// Dashboard, Notifications, My Profile and Change Password are always available.
export const ALL_SCREENS = [
    "screen:announcements", "screen:attendance", "screen:holidays", "screen:shifts", "screen:leave",
    "screen:helpdesk", "screen:directory", "screen:org", "screen:documents", "screen:audits",
    "screen:projects", "screen:payslips", "screen:loans", "screen:expenses", "screen:assets",
];

// Manage / approve permissions — these are what the API's authorize(module, ...) checks.
export const ALL_PERMISSION_MODULES = [
    "employees", "departments", "designations", "branches", "attendance", "leave",
    "projects", "tasks", "payroll", "expenses", "assets", "helpdesk",
    "announcements", "reports", "settings", "roles", "audit-logs",
];

const defaultPermissions = {
    Admin: [...ALL_PERMISSION_MODULES, ...ALL_SCREENS],
    HR: ["employees", "departments", "designations", "branches", "attendance", "leave", "projects", "tasks", "expenses", "assets", "helpdesk", "announcements", "reports", "payroll", "audit-logs"],
    Manager: ["attendance", "leave", "projects", "tasks", "expenses", "helpdesk", "reports"],
    "Team Lead": ["attendance", "leave", "projects", "tasks", "expenses", "helpdesk", "reports"],
    // Employees only use self-service screens (granted per department / designation); no manage modules.
    Employee: [],
};

// Make sure every role has a settings row. Checked once per server process with a single query
// (it used to be one lookup per role on every request); a failed check is retried next time.
let roleSettingsReady = null;
const ensureRoleSettings = () => {
    if (!roleSettingsReady) {
        roleSettingsReady = (async () => {
            const roles = Object.keys(defaultPermissions);
            const have = new Set((await roleSettingModel.find({ role: { $in: roles } }).select("role").lean()).map((r) => r.role));
            await Promise.all(roles.filter((r) => !have.has(r)).map((role) => roleSettingModel.create({ role, permissions: defaultPermissions[role] })));
        })().catch((err) => { roleSettingsReady = null; throw err; });
    }
    return roleSettingsReady;
};

export const getRoles = async (req, res) => {
    try {
        await ensureRoleSettings();

        const settings = await roleSettingModel.find({});
        const counts = await employeeModel.aggregate([
            { $group: { _id: "$role", count: { $sum: 1 } } },
        ]);
        const countMap = counts.reduce((acc, c) => ({ ...acc, [c._id]: c.count }), {});

        const roles = settings.map((s) => ({
            _id: s._id,
            role: s.role,
            description: s.description,
            permissions: s.permissions,
            employeeCount: countMap[s.role] || 0,
        }));

        return res.status(200).json({
            success: true,
            data: roles,
            allPermissions: ALL_PERMISSION_MODULES,
            allScreens: ALL_SCREENS,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// Any authenticated user can call this — it only ever returns their own effective access
// (role + department + personal grants, minus personal blocks), never the admin view.
// `granted` lists modules opened beyond their role, so the sidebar can show those screens too.
export const getMyPermissions = async (req, res) => {
    try {
        await ensureRoleSettings();

        const [access, scope] = await Promise.all([getAccess(req.user, [...ALL_PERMISSION_MODULES, ...ALL_SCREENS]), scopeOf(req)]);
        return res.status(200).json({
            success: true,
            data: access.effective,
            granted: access.granted,
            // reporting-tree reach, so the menu shows team screens to anyone who leads a team
            team: { leads: scope.leads, firm: scope.firm, people: scope.people, finance: scope.finance, size: scope.team.size },
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const updateRolePermissions = async (req, res) => {
    try {
        const { role } = req.params;
        const { permissions } = req.body;

        const updated = await roleSettingModel.findOneAndUpdate(
            { role },
            { permissions },
            { new: true, upsert: true, runValidators: true }
        );

        logAudit(req, "role.permissions_update", `Updated permissions for role ${role}`, { type: "RoleSetting", id: updated._id });
        invalidatePermissionCache();

        return res.status(200).json({
            success: true,
            message: "Permissions updated successfully.",
            data: updated,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
