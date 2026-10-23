import taskModel from "../models/taskModel.js";
import ProjectModel from "../models/ProjectModel.js";
import employeeModel from "../models/employeeModel.js";
import { notify } from "../utils/notify.js";
import { logAudit } from "../utils/audit.js";
import { scopeOf } from "../utils/hierarchy.js";

export const getTasks = async (req, res) => {
    try {
        const scope = await scopeOf(req);
        const isOrgWide = scope.firm;

        let filter = { assignedTo: req.user.id };

        // A Manager/Team Lead sees their own tasks, plus enough to actually "monitor" their
        // people: their direct reports' tasks and any task in a project they manage/belong to.
        if (scope.leads) {
            const [reports, scopedProjects] = await Promise.all([
                [...scope.team].map((id) => ({ _id: id })),
                ProjectModel.find({ $or: [{ projectManager: req.user.id }, { teamMembers: req.user.id }] }).select("_id"),
            ]);

            filter = {
                $or: [
                    { assignedTo: req.user.id },
                    { assignedTo: { $in: reports.map((r) => r._id) } },
                    { projectId: { $in: scopedProjects.map((p) => p._id) } },
                ],
            };
        }

        if (isOrgWide) filter = {};

        const tasks = await taskModel
            .find(filter)
            .populate("assignedTo", "firstName lastName")
            .populate("projectId", "projectName projectCode")
            .sort({ createdAt: -1 });

        return res.status(200).json({ success: true, data: tasks });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getTaskById = async (req, res) => {
    try {
        const { id } = req.params;

        const task = await taskModel
            .findById(id)
            .populate("assignedTo", "firstName lastName profileImage")
            .populate("createdBy", "firstName lastName")
            .populate("projectId", "projectName projectCode")
            .populate("comments.employeeId", "firstName lastName profileImage");

        if (!task) {
            return res.status(404).json({ success: false, message: "Task not found." });
        }

        return res.status(200).json({ success: true, data: task });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const createTask = async (req, res) => {
    try {
        const { title, description, projectId, assignedTo, priority, startDate, dueDate, estimatedHours } = req.body;

        const task = await taskModel.create({
            title, description, projectId, assignedTo, priority, startDate, dueDate, estimatedHours,
            createdBy: req.user.id,
        });

        if (assignedTo) {
            notify(assignedTo, "New task assigned", `You've been assigned: ${title}`, "General", "/tasks");
        }

        return res.status(201).json({ success: true, message: "Task created successfully.", data: task });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const updateTask = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, projectId, assignedTo, priority, startDate, dueDate, estimatedHours, actualHours } = req.body;

        const task = await taskModel.findByIdAndUpdate(
            id,
            { title, description, projectId, assignedTo, priority, startDate, dueDate, estimatedHours, actualHours },
            { new: true, runValidators: true }
        );

        if (!task) {
            return res.status(404).json({ success: false, message: "Task not found." });
        }

        return res.status(200).json({ success: true, message: "Task updated successfully.", data: task });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const updateTaskStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const task = await taskModel.findByIdAndUpdate(id, { status }, { new: true });

        if (!task) {
            return res.status(404).json({ success: false, message: "Task not found." });
        }

        logAudit(req, "task.status_change", `Moved task "${task.title}" to ${status}`, { type: "Task", id: task._id });

        return res.status(200).json({ success: true, message: "Task status updated.", data: task });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const addTaskComment = async (req, res) => {
    try {
        const { id } = req.params;
        const { message } = req.body;

        const task = await taskModel.findByIdAndUpdate(
            id,
            { $push: { comments: { employeeId: req.user.id, message } } },
            { new: true }
        ).populate("comments.employeeId", "firstName lastName profileImage");

        if (!task) {
            return res.status(404).json({ success: false, message: "Task not found." });
        }

        if (task.assignedTo && String(task.assignedTo) !== req.user.id) {
            notify(task.assignedTo, "New comment on your task", `New comment on "${task.title}"`, "General", "/tasks");
        }

        return res.status(200).json({ success: true, message: "Comment added.", data: task });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const deleteTask = async (req, res) => {
    try {
        const { id } = req.params;
        const task = await taskModel.findByIdAndDelete(id);

        if (!task) {
            return res.status(404).json({ success: false, message: "Task not found." });
        }

        return res.status(200).json({ success: true, message: "Task deleted successfully." });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
