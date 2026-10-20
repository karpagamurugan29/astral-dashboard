import employeeModel from "../models/employeeModel.js";
import LeaveBalance from "../models/LeaveBalanceModel.js";
import leaveModel from "../models/leaveModel.js";
import attendanceModel from "../models/attendanceModel.js";
import auditLogModel from "../models/auditLogModel.js";
import bcrypt from "bcrypt";
import { logAudit } from "../utils/audit.js";
import { DEFAULT_ONBOARDING_TASKS } from "../utils/checklists.js";


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

        // Encrypt password
        reqData.password = await bcrypt.hash(reqData.password, 10);
        reqData.onboarding = { status: "In Progress", tasks: DEFAULT_ONBOARDING_TASKS };

        const newEmployee = new employeeModel(reqData);

        await newEmployee.save();

        await LeaveBalance.create({ employeeId: newEmployee._id });

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

        const canSeeSalary = ["Admin", "HR"].includes(req.user.role) || req.user.id === id;
        const hiddenFields = canSeeSalary ? "-password" : "-password -salary -otp -otpExpiresAt";

        const findEmp = await employeeModel.findById(id).select(hiddenFields)
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

        const findEmp = await employeeModel.find({}).select(hiddenFields)

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
