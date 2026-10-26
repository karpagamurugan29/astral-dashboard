import employeeModel from "../models/employeeModel.js";
import LeaveBalance from "../models/LeaveBalanceModel.js";
import leaveModel from "../models/leaveModel.js";
import attendanceModel from "../models/attendanceModel.js";
import auditLogModel from "../models/auditLogModel.js";
import bcrypt from "bcrypt";
import { logAudit } from "../utils/audit.js";
import { DEFAULT_ONBOARDING_TASKS } from "../utils/checklists.js";
import { defaultRoleFor, wouldLoop, invalidateHierarchy, scopeOf, circleOf } from "../utils/hierarchy.js";
import { invalidateAccessCache } from "../utils/access.js";
import { COMPANY_TZ } from "../utils/autoCheckout.js";


export const AddEmployee = async (req, res) => {
    try {
        const reqData = req.body;

        const findExist = await employeeModel.findOne({
            email: reqData.email,
        });

        if (findExist) {
            return res.status(409).json({
                success: false,
                message: "Employee already exists.",
            });
        }

        // The access role follows the designation unless HR picked one.
        if (!reqData.role) reqData.role = defaultRoleFor(reqData.designation) || "Employee";
        if (!reqData.manager) reqData.manager = null;

        // Encrypt password
        reqData.password = await bcrypt.hash(reqData.password, 10);
        reqData.onboarding = { status: "In Progress", tasks: DEFAULT_ONBOARDING_TASKS };

        const newEmployee = new employeeModel(reqData);

        await newEmployee.save();

        await LeaveBalance.create({ employeeId: newEmployee._id });
        invalidateHierarchy();

        const response = newEmployee.toObject();
        delete response.password;

        logAudit(req, "employee.create", `Added employee ${response.firstName} ${response.lastName} (${response.employeeId})`, { type: "Employee", id: newEmployee._id });

        return res.status(201).json({
            success: true,
            message: "Employee added successfully.",
            data: response,
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

export const ModifyEmployee = async (req, res) => {
    try {
        const { id } = req.params;
        const { _id, password, email, ...restData } = req.body;
        if ("manager" in restData) {
            if (!restData.manager) restData.manager = null;
            else if (await wouldLoop(id, restData.manager)) {
                return res.status(400).json({ success: false, message: "That would make a loop — the new manager already reports to this person." });
            }
        }

        if (email) {
            const checkIfExist = await employeeModel.findOne({
                email,
                _id: { $ne: id },
            });

            if (checkIfExist) {
                return res.status(409).json({
                    success: false,
                    message: "Email already exists.",
                });
            }
        }

        const updateEmployee = await employeeModel.findByIdAndUpdate(
            id,
            { ...(email && { email }), ...restData },
            {
                new: true,
                runValidators: true,
            }
        ).select("-password");

        if (!updateEmployee) {
            return res.status(404).json({
                success: false,
                message: "Employee not found.",
            });
        }

        invalidateHierarchy();
        invalidateAccessCache();
        logAudit(req, "employee.update", `Updated employee ${updateEmployee.firstName} ${updateEmployee.lastName}`, { type: "Employee", id: updateEmployee._id });

        return res.status(200).json({
            success: true,
            message: "Employee updated successfully.",
            data: updateEmployee,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

export const UpdateEmployeeRole = async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.body;

        const employee = await employeeModel.findByIdAndUpdate(
            id,
            { role },
            { new: true, runValidators: true }
        ).select("-password");

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: "Employee not found.",
            });
        }

        logAudit(req, "employee.role_change", `Changed ${employee.firstName} ${employee.lastName}'s role to ${role}`, { type: "Employee", id: employee._id });

        return res.status(200).json({
            success: true,
            message: "Role updated successfully.",
            data: employee,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

export const GetEmployeeById = async (req, res) => {
    try {
        const { id } = req.params
        const circle = await circleOf(await scopeOf(req));
        if (circle && !circle.has(String(id))) {
            return res.status(403).json({ success: false, message: "This person isn't in your team." });
        }

        const canSeeSalary = ["Admin", "HR"].includes(req.user.role) || req.user.id === id;
        const hiddenFields = canSeeSalary ? "-password" : "-password -salary -otp -otpExpiresAt";

        const findEmp = await employeeModel.findById(id).select(hiddenFields).populate("manager", "employeeId firstName lastName designation profileImage")
        if (!findEmp) {
            return res.status(404).json({
                success: false,
                message: "Employee not found",
            });
        }

        return res.status(200).json({
            success: true,
            data: findEmp,
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
}

// Soft-delete only: a real employee record has attendance, leave, payroll and
// audit history hanging off it, so a hard delete would orphan all of that.
// "Remove" from the roster sets status to Terminated instead — use the
// Offboarding flow for a managed exit with a checklist.
export const DeleteEmployee = async (req, res) => {
    try {
        const { id } = req.params;

        const employee = await employeeModel.findByIdAndUpdate(
            id,
            { status: "Terminated" },
            { new: true }
        ).select("-password");
        invalidateHierarchy();

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: "Employee not found.",
            });
        }

        logAudit(req, "employee.delete", `Removed employee ${employee.firstName} ${employee.lastName} (${employee.employeeId}) — marked Terminated`, { type: "Employee", id });

        return res.status(200).json({
            success: true,
            message: "Employee removed successfully.",
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
}

export const GetAllEmployees = async (req, res) => {
    try {
        const canSeeSalary = ["Admin", "HR"].includes(req.user.role);
        const hiddenFields = canSeeSalary ? "-password" : "-password -salary -otp -otpExpiresAt";

        // Managers and below see their own circle: the officials above them, their team mates and their team.
        const circle = await circleOf(await scopeOf(req));
        const findEmp = await employeeModel.find(circle ? { _id: { $in: [...circle] } } : {}).select(hiddenFields)

        if (!findEmp) {
            return res.status(404).json({
                success: false,
                message: "Employee not found",
            });
        }
        return res.status(200).json({
            success: true,
            data: findEmp,
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
}

export const GetEmployeeHistory = async (req, res) => {
    try {
        const { id } = req.params;

        const [leaves, attendance, auditTrail] = await Promise.all([
            leaveModel.find({ employeeId: id }).sort({ createdAt: -1 }).limit(10),
            attendanceModel.find({ employeeId: id }).sort({ attendanceDate: -1 }).limit(15),
            auditLogModel.find({ targetType: "Employee", targetId: id }).sort({ createdAt: -1 }).limit(15),
        ]);

        return res.status(200).json({
            success: true,
            data: { leaves, attendance, auditTrail },
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
}

/* ---------------- birthday line-up ---------------- */

// GET /employees/birthdays?from=YYYY-MM-DD&to=YYYY-MM-DD (default: today → 3 months on)
// Birthdays are matched on month and day, so a range across New Year works, and a range longer
// than a year lists each occurrence. 29 Feb birthdays fall on 28 Feb in other years.
// Same visibility as the employee directory. Birth years are never sent.
export const birthdayLineUp = async (req, res) => {
    try {
        const tz = COMPANY_TZ();
        const dayKey = (d) => new Date(d).toLocaleDateString("en-CA", { timeZone: tz });
        const today = dayKey(new Date());
        const isKey = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "") && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
        const addMonths = (key, n) => {
            const [y, m, d] = key.split("-").map(Number);
            const last = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate();
            return new Date(Date.UTC(y, m - 1 + n, Math.min(d, last))).toISOString().slice(0, 10);
        };
        const from = isKey(req.query.from) ? req.query.from : today;
        const to = isKey(req.query.to) ? req.query.to : addMonths(from, 3);
        if (to < from) return res.status(400).json({ success: false, message: "The end date must be on or after the start date." });
        const span = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5;
        if (span > 731) return res.status(400).json({ success: false, message: "Pick a range of up to two years." });

        const circle = await circleOf(await scopeOf(req));
        const filter = { status: "Active", dateOfBirth: { $ne: null } };
        if (circle) filter._id = { $in: [...circle] };
        const people = await employeeModel.find(filter).select("employeeId firstName lastName designation department profileImage dateOfBirth").lean();

        const leap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
        const dayDiff = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 864e5);
        const fromYear = Number(from.slice(0, 4)), toYear = Number(to.slice(0, 4));
        const data = [];
        for (const p of people) {
            const [, mm, dd] = dayKey(p.dateOfBirth).split("-");
            for (let y = fromYear; y <= toYear; y++) {
                const day = mm === "02" && dd === "29" && !leap(y) ? "28" : dd;
                const date = `${y}-${mm}-${day}`;
                if (date < from || date > to) continue;
                const days = dayDiff(date, today);
                const { dateOfBirth, ...employee } = p;
                data.push({ employee, date, daysAway: days, when: days === 0 ? "today" : days > 0 ? "upcoming" : "past" });
            }
        }
        data.sort((a, b) => a.date.localeCompare(b.date) || `${a.employee.firstName} ${a.employee.lastName}`.localeCompare(`${b.employee.firstName} ${b.employee.lastName}`));
        return res.status(200).json({ success: true, from, to, today, data });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};
