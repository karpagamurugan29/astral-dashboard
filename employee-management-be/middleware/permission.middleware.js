import roleSettingModel from "../models/roleSettingModel.js";

// Short in-memory cache so a burst of requests from one role doesn't hit the DB every time —
// Roles & Permissions edits take effect within this window, not instantly.
const CACHE_MS = 15000;
const cache = new Map();

const getRolePermissions = async (role) => {
    const cached = cache.get(role);
    if (cached && cached.expiresAt > Date.now()) return cached.permissions;

    const setting = await roleSettingModel.findOne({ role }).select("permissions");
    const permissions = setting?.permissions || [];
    cache.set(role, { permissions, expiresAt: Date.now() + CACHE_MS });
    return permissions;
};

// Called after a permission edit is saved so the change is effective immediately
// instead of waiting out the cache window.
export const invalidatePermissionCache = (role) => {
    if (role) cache.delete(role);
    else cache.clear();
};

// authorize(module, ...roles) — module is one of ALL_PERMISSION_MODULES (role.controller.js) and
// gates against that role's configured permission list; pass null/undefined to skip the module
// check and fall back to a plain role-name gate. Admin is always unrestricted, regardless of what
// is (or isn't) configured, so an admin can never lock themselves out of Roles & Permissions itself.
const authorize = (module, ...roles) => {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({ success: false, message: "Unauthorized" });
            }

            if (!roles.includes(req.user.role)) {
                return res.status(403).json({ success: false, message: "Access denied" });
            }

            if (module && req.user.role !== "Admin") {
                const permissions = await getRolePermissions(req.user.role);
                if (!permissions.includes(module)) {
                    return res.status(403).json({
                        success: false,
                        message: `Your role does not currently have access to this feature. Contact your administrator.`,
                    });
                }
            }

            next();
        } catch (err) {
            return res.status(500).json({ success: false, message: err.message });
        }
    };
};

export default authorize;
