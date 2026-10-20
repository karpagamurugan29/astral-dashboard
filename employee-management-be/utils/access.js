import roleSettingModel from "../models/roleSettingModel.js";
import accessRuleModel from "../models/accessRuleModel.js";
import employeeModel from "../models/employeeModel.js";

// Short in-memory cache so a burst of requests doesn't hit the DB every time. Every permission
// edit calls invalidateAccessCache(), so changes made through the app apply immediately.
const CACHE_MS = 15000;
const cache = new Map();

export const invalidateAccessCache = () => cache.clear();

const cached = async (key, load) => {
    const hit = cache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value;
    const value = await load();
    cache.set(key, { value, expiresAt: Date.now() + CACHE_MS });
    return value;
};

export const rolePermissions = (role) =>
    cached(`role:${role}`, async () => (await roleSettingModel.findOne({ role }).select("permissions").lean())?.permissions || []);

const rule = (scope, target) =>
    target ? cached(`${scope}:${target}`, () => accessRuleModel.findOne({ scope, target: String(target) }).lean()) : null;

// Combine the three layers. Pure, so the admin screen can show the same result per person.
export const combineAccess = ({ role, roleAllow = [], deptAllow = [], designationAllow = [], personAllow = [], personDeny = [], allModules = [] }) => {
    if (role === "Admin") return { effective: [...allModules], granted: [], denied: [] };
    const granted = [...new Set([...deptAllow, ...designationAllow, ...personAllow])];
    const denied = [...new Set(personDeny)];
    const effective = [...new Set([...roleAllow, ...granted])].filter((m) => !denied.includes(m));
    return { effective, granted: granted.filter((m) => !denied.includes(m)), denied };
};

// Access for a signed-in user ({ id, role }): role permissions, extras granted by their
// department, their designation or to them personally, and modules blocked for them personally.
export const getAccess = async (user, allModules = []) => {
    const profile = await cached(`profile-of:${user.id}`, async () => (await employeeModel.findById(user.id).select("department designation").lean()) || {});
    const [roleAllow, dept, desig, person] = await Promise.all([
        rolePermissions(user.role),
        rule("department", profile.department),
        rule("designation", profile.designation),
        rule("employee", user.id),
    ]);
    return {
        roleAllow,
        ...combineAccess({ role: user.role, roleAllow, deptAllow: dept?.allow, designationAllow: desig?.allow, personAllow: person?.allow, personDeny: person?.deny, allModules }),
    };
};
