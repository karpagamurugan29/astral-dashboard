import accessRuleModel from "../models/accessRuleModel.js";
import roleSettingModel from "../models/roleSettingModel.js";
import employeeModel from "../models/employeeModel.js";
import departmentModel from "../models/departmentModel.js";
import designationModel from "../models/designationModel.js";
import { ALL_PERMISSION_MODULES, ALL_SCREENS } from "./role.controller.js";

const ALL_KEYS = [...ALL_PERMISSION_MODULES, ...ALL_SCREENS];
import { combineAccess, invalidateAccessCache } from "../utils/access.js";
import { logAudit } from "../utils/audit.js";

const clean = (list) => [...new Set((Array.isArray(list) ? list : []).filter((m) => ALL_KEYS.includes(m)))];

// Everything the Access Control screen needs in one call: role permissions, each department's
// extra modules, and every active employee with their personal allow/block and resulting access.
export const getAccessOverview = async (req, res) => {
    try {
        const [roles, rules, employees, departments, designations] = await Promise.all([
            roleSettingModel.find({}).select("role permissions").lean(),
            accessRuleModel.find({}).lean(),
            employeeModel.find({ status: "Active" }).select("employeeId firstName lastName role department designation profileImage").sort({ firstName: 1 }).lean(),
            departmentModel.find({}).lean().catch(() => []),
            designationModel.find({}).lean().catch(() => []),
        ]);

        const roleMap = Object.fromEntries(roles.map((r) => [r.role, r.permissions || []]));
        const deptRules = Object.fromEntries(rules.filter((r) => r.scope === "department").map((r) => [r.target, r]));
        const desigRules = Object.fromEntries(rules.filter((r) => r.scope === "designation").map((r) => [r.target, r]));
        const personRules = Object.fromEntries(rules.filter((r) => r.scope === "employee").map((r) => [r.target, r]));

        // Departments from the Departments list plus any name used on an employee record.
        const names = new Set([...departments.map((d) => d.name || d.departmentName).filter(Boolean), ...employees.map((e) => e.department).filter(Boolean)]);
        const deptData = [...names].sort((a, b) => a.localeCompare(b)).map((name) => ({
            name,
            employeeCount: employees.filter((e) => e.department === name).length,
            allow: deptRules[name]?.allow || [],
        }));

        const desigNames = new Set([...designations.map((d) => d.name).filter(Boolean), ...employees.map((e) => e.designation).filter(Boolean)]);
        const desigData = [...desigNames].sort((a, b) => a.localeCompare(b)).map((name) => ({
            name,
            employeeCount: employees.filter((e) => e.designation === name).length,
            allow: desigRules[name]?.allow || [],
        }));

        const employeeData = employees.map((e) => {
            const person = personRules[String(e._id)];
            const access = combineAccess({
                role: e.role,
                roleAllow: roleMap[e.role] || [],
                deptAllow: deptRules[e.department]?.allow || [],
                designationAllow: desigRules[e.designation]?.allow || [],
                personAllow: person?.allow || [],
                personDeny: person?.deny || [],
                allModules: ALL_KEYS,
            });
            return { ...e, allow: person?.allow || [], deny: person?.deny || [], effective: access.effective };
        });

        return res.status(200).json({
            success: true,
            data: { modules: ALL_PERMISSION_MODULES, screens: ALL_SCREENS, roles: roleMap, departments: deptData, designations: desigData, employees: employeeData },
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const updateDepartmentAccess = async (req, res) => {
    try {
        const name = String(req.params.name || "").trim();
        if (!name) return res.status(400).json({ success: false, message: "Department is required" });

        const allow = clean(req.body.allow);
        const rule = await accessRuleModel.findOneAndUpdate(
            { scope: "department", target: name },
            { allow, deny: [], updatedBy: req.user.id },
            { new: true, upsert: true }
        );

        invalidateAccessCache();
        logAudit(req, "access.department_update", `Set extra access for department ${name}: ${allow.join(", ") || "none"}`, { type: "AccessRule", id: rule._id });

        return res.status(200).json({ success: true, message: "Department access saved", data: rule });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const updateEmployeeAccess = async (req, res) => {
    try {
        const { id } = req.params;
        const employee = await employeeModel.findById(id).select("firstName lastName role");
        if (!employee) return res.status(404).json({ success: false, message: "Employee not found" });
        if (employee.role === "Admin") {
            return res.status(400).json({ success: false, message: "Admins always have full access; nothing to change." });
        }

        const allow = clean(req.body.allow);
        const deny = clean(req.body.deny).filter((m) => !allow.includes(m));
        const rule = await accessRuleModel.findOneAndUpdate(
            { scope: "employee", target: String(id) },
            { allow, deny, updatedBy: req.user.id },
            { new: true, upsert: true }
        );

        invalidateAccessCache();
        logAudit(req, "access.employee_update", `Set personal access for ${employee.firstName} ${employee.lastName}: allow ${allow.join(", ") || "none"}; block ${deny.join(", ") || "none"}`, { type: "AccessRule", id: rule._id });

        return res.status(200).json({ success: true, message: "Employee access saved", data: rule });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const updateDesignationAccess = async (req, res) => {
    try {
        const name = String(req.params.name || "").trim();
        if (!name) return res.status(400).json({ success: false, message: "Designation is required" });

        const allow = clean(req.body.allow);
        const rule = await accessRuleModel.findOneAndUpdate(
            { scope: "designation", target: name },
            { allow, deny: [], updatedBy: req.user.id },
            { new: true, upsert: true }
        );

        invalidateAccessCache();
        logAudit(req, "access.designation_update", `Set extra access for designation ${name}: ${allow.join(", ") || "none"}`, { type: "AccessRule", id: rule._id });

        return res.status(200).json({ success: true, message: "Designation access saved", data: rule });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
