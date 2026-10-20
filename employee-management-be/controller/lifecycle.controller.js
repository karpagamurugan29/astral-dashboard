import employeeModel from "../models/employeeModel.js";
import { logAudit } from "../utils/audit.js";
import { DEFAULT_OFFBOARDING_TASKS } from "../utils/checklists.js";

// ==============================
// Onboarding
// ==============================
export const getOnboardingList = async (req, res) => {
    try {
        const employees = await employeeModel
            .find({ "onboarding.status": "In Progress" })
            .select("employeeId firstName lastName department designation joiningDate profileImage onboarding");

        return res.status(200).json({ success: true, data: employees });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const updateOnboardingTask = async (req, res) => {
    try {
        const { id, taskIndex } = req.params;
        const { completed } = req.body;

        const employee = await employeeModel.findById(id);

        if (!employee) {
            return res.status(404).json({ success: false, message: "Employee not found." });
        }

        const task = employee.onboarding.tasks[taskIndex];
        if (!task) {
            return res.status(404).json({ success: false, message: "Onboarding task not found." });
        }

        task.completed = completed;
        task.completedAt = completed ? new Date() : null;

        if (employee.onboarding.tasks.every((t) => t.completed)) {
            employee.onboarding.status = "Completed";
        } else {
            employee.onboarding.status = "In Progress";
        }

        await employee.save();

        return res.status(200).json({ success: true, message: "Onboarding updated.", data: employee.onboarding });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ==============================
// Offboarding
// ==============================
export const initiateOffboarding = async (req, res) => {
    try {
        const { id } = req.params;
        const { exitDate, reason } = req.body;

        const employee = await employeeModel.findByIdAndUpdate(
            id,
            {
                offboarding: {
                    status: "In Progress",
                    exitDate,
                    reason,
                    tasks: DEFAULT_OFFBOARDING_TASKS,
                },
            },
            { new: true }
        ).select("-password");

        if (!employee) {
            return res.status(404).json({ success: false, message: "Employee not found." });
        }

        logAudit(req, "employee.offboard_start", `Started offboarding for ${employee.firstName} ${employee.lastName}`, { type: "Employee", id: employee._id });

        return res.status(200).json({ success: true, message: "Offboarding started.", data: employee });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getOffboardingList = async (req, res) => {
    try {
        const employees = await employeeModel
            .find({ "offboarding.status": "In Progress" })
            .select("employeeId firstName lastName department designation profileImage offboarding");

        return res.status(200).json({ success: true, data: employees });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const updateOffboardingTask = async (req, res) => {
    try {
        const { id, taskIndex } = req.params;
        const { completed } = req.body;

        const employee = await employeeModel.findById(id);

        if (!employee) {
            return res.status(404).json({ success: false, message: "Employee not found." });
        }

        const task = employee.offboarding.tasks[taskIndex];
        if (!task) {
            return res.status(404).json({ success: false, message: "Offboarding task not found." });
        }

        task.completed = completed;
        task.completedAt = completed ? new Date() : null;

        await employee.save();

        return res.status(200).json({ success: true, message: "Offboarding updated.", data: employee.offboarding });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const completeOffboarding = async (req, res) => {
    try {
        const { id } = req.params;

        const employee = await employeeModel.findByIdAndUpdate(
            id,
            { status: "Resigned", "offboarding.status": "Completed" },
            { new: true }
        ).select("-password");

        if (!employee) {
            return res.status(404).json({ success: false, message: "Employee not found." });
        }

        logAudit(req, "employee.offboard_complete", `Completed offboarding for ${employee.firstName} ${employee.lastName}`, { type: "Employee", id: employee._id });

        return res.status(200).json({ success: true, message: "Offboarding completed.", data: employee });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
