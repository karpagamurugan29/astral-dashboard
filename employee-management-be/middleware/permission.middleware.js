import { getAccess, invalidateAccessCache } from "../utils/access.js";
import { scopeOf } from "../utils/hierarchy.js";

const FINANCE_MODULES = ["expenses", "loans", "payroll"];

// Kept for callers that invalidate after a role edit; any permission change clears everything.
export const invalidatePermissionCache = () => invalidateAccessCache();

// authorize(module, ...roles) — module is one of ALL_PERMISSION_MODULES (role.controller.js).
//  - Admin always passes (when listed, which every route does), so an admin can never lock themselves out.
//  - A module blocked for this person personally (Access Control screen) is always refused.
//  - Otherwise allowed if their role is listed for the route AND the role has the module, or if the
//    module was granted to their department or to them personally — a grant is an explicit admin
//    decision, so it opens the route even when their role normally couldn't.
// Pass null/undefined as module for a plain role-name gate.
const authorize = (module, ...roles) => {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({ success: false, message: "Unauthorized" });
            }

            let roleListed = roles.includes(req.user.role);
            // The reporting tree counts too: anyone who leads a team may use team-lead routes, and
            // firm-wide seniors / HR / Accounts staff may use the HR routes for their area.
            if (!roleListed && req.user.role !== "Admin" && (roles.includes("Team Lead") || roles.includes("HR"))) {
                const scope = await scopeOf(req);
                roleListed = (roles.includes("Team Lead") && scope.leads)
                    || (roles.includes("HR") && (scope.people || (scope.finance && FINANCE_MODULES.includes(module))));
            }

            if (req.user.role === "Admin") {
                return roleListed ? next() : res.status(403).json({ success: false, message: "Access denied" });
            }

            if (!module) {
                return roleListed ? next() : res.status(403).json({ success: false, message: "Access denied" });
            }

            const access = await getAccess(req.user);

            if (access.denied.includes(module)) {
                return res.status(403).json({ success: false, message: "Your access to this feature has been turned off. Contact your administrator." });
            }
            if ((roleListed && access.roleAllow.includes(module)) || access.granted.includes(module)) {
                return next();
            }

            return res.status(403).json({
                success: false,
                message: roleListed
                    ? "Your role does not currently have access to this feature. Contact your administrator."
                    : "Access denied",
            });
        } catch (err) {
            return res.status(500).json({ success: false, message: err.message });
        }
    };
};

export default authorize;
