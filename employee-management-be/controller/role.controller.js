import roleSettingModel from "../models/roleSettingModel.js";
import employeeModel from "../models/employeeModel.js";
import { logAudit } from "../utils/audit.js";
import { invalidatePermissionCache } from "../middleware/permission.middleware.js";

export const ALL_PERMISSION_MODULES = [
    "employees", "departments", "designations", "branches", "attendance", "leave",
    "projects", "tasks", "payroll", "expenses", "assets", "helpdesk",
    "announcements", "reports", "settings", "roles", "audit-logs",
];

const defaultPermissions = {
    Admin: ALL_PERMISSION_MODULES,
    HR: ["employees", "departments", "designations", "branches", "attendance", "leave", "projects", "tasks", "expenses", "assets", "helpdesk", "announcements", "reports", "payroll", "audit-logs"],
    Manager: ["attendance", "leave", "projects", "tasks", "expenses", "helpdesk", "reports"],
    "Team Lead": ["attendance", "leave", "projects", "tasks", "expenses", "helpdesk", "reports"],
    Employee: ["attendance", "leave", "expenses", "helpdesk", "announcements"],
};

const ensureRoleSettings = async () => {
    const roles = Object.keys(defaultPermissions);
    for (const role of roles) {
        const exists = await roleSettingModel.findOne({ role });
        if (!exists) {
            await roleSettingModel.create({ role, permissions: defaultPermissions[role] });
        }
    }
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
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// Any authenticated user can call this — it only ever returns their own
// role's permission list, never the full admin roles/employee-count view.
export const getMyPermissions = async (req, res) => {
    try {
        await ensureRoleSettings();

        const setting = await roleSettingModel.findOne({ role: req.user.role });

        return res.status(200).json({
            success: true,
            data: setting?.permissions || defaultPermissions[req.user.role] || [],
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
        invalidatePermissionCache(role);

        return res.status(200).json({
            success: true,
            message: "Permissions updated successfully.",
            data: updated,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
