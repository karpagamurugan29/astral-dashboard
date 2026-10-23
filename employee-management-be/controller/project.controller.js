import ProjectModel from "../models/ProjectModel.js"
import { logAudit } from "../utils/audit.js";
import { scopeOf, workFilter } from "../utils/hierarchy.js";
// Who may change a project: firm-wide seniors, its lead, and anyone above the lead.
const canRunProject = async (req, id) => {
    const p = await ProjectModel.findOne({ _id: id, isDeleted: false }).select("projectManager").lean();
    if (!p) return null;
    const scope = await scopeOf(req);
    const lead = String(p.projectManager || "");
    return scope.firm || lead === scope.me || scope.team.has(lead);
};
const refuse = (res, ok) => res.status(ok === null ? 404 : 403).json({ success: false, message: ok === null ? "Project not found" : "Only the project lead or their seniors can change this project." });


export const createProject = async (req, res) => {
    try {
        const reqData = req.body

        const existingProject = await ProjectModel.findOne({ projectCode: reqData.projectCode })

        if (existingProject) {
            return res.status(409).json({
                success: false,
                message: 'Project already exists',
            });
        }

        const project = await ProjectModel.create({ ...reqData, createdBy: req.user.id })

        logAudit(req, "project.create", `Created project ${project.projectName}`, { type: "Project", id: project._id });

        return res.status(201).json({
            success: true,
            message: 'Project created successfully',
            data: project
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
}

export const updateProject = async (req, res) => {
    try {
        const { id } = req.params
        const updateData = req.body

        const project = await ProjectModel.findOneAndUpdate(
            { _id: id, isDeleted: false },
            updateData,
            { new: true, runValidators: true }
        )

        if (!project) {
            return res.status(404).json({
                success: false,
                message: `Project not found`,
            })
        }

        logAudit(req, "project.update", `Updated project ${project.projectName}`, { type: "Project", id: project._id });

        return res.status(200).json({
            success: true,
            message: "Project updated successfully",
            data: project,
        })

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        })
    }
}

export const deleteProject = async (req, res) => {
    try {
        const { id } = req.params
        const ok = await canRunProject(req, id)
        if (!ok) return refuse(res, ok)

        const project = await ProjectModel.findByIdAndUpdate(id, { isDeleted: true }, { new: true })

        if (!project) {
            return res.status(404).json({ success: false, message: "Project not found" })
        }

        logAudit(req, "project.delete", `Archived project ${project.projectName}`, { type: "Project", id: project._id });

        return res.status(200).json({ success: true, message: "Project archived successfully" })
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message })
    }
}

export const getProjectById = async (req, res) => {
    try {
        const { id } = req.params

        // only projects the caller or their team works on (firm-wide seniors: any)
        const project = await ProjectModel.findOne({ _id: id, isDeleted: false, ...(await workFilter(req)) })
            .populate("projectManager", "employeeId firstName lastName")
            .populate("teamMembers", "employeeId firstName lastName")

        if (!project) {
            return res.status(404).json({ success: false, message: "Project not found" })
        }

        return res.status(200).json({ success: true, data: project })
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message })
    }
}

export const getAllProjects = async (req, res) => {
    try {
        const isManager = ["Admin", "HR"].includes(req.user.role);

        const filter = isManager
            ? { isDeleted: false }
            : { isDeleted: false, $or: [{ teamMembers: req.user.id }, { projectManager: req.user.id }] };

        const projects = await ProjectModel.find(filter)
            .populate("projectManager", "employeeId firstName lastName")
            .populate("teamMembers", "employeeId firstName lastName")
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            data: projects,
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
};

// Kept for backward compatibility with the original "/project/get" route shape.
export const getProjectsByUser = getAllProjects;

export const addProjectMember = async (req, res) => {
    try {
        const { id } = req.params
        const { employeeId } = req.body
        const ok = await canRunProject(req, id)
        if (!ok) return refuse(res, ok)

        const project = await ProjectModel.findByIdAndUpdate(
            id,
            { $addToSet: { teamMembers: employeeId } },
            { new: true }
        ).populate("teamMembers", "employeeId firstName lastName")

        if (!project) {
            return res.status(404).json({ success: false, message: "Project not found" })
        }

        return res.status(200).json({ success: true, message: "Member added successfully", data: project })
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message })
    }
}

export const removeProjectMember = async (req, res) => {
    try {
        const { id, userId } = req.params
        const ok = await canRunProject(req, id)
        if (!ok) return refuse(res, ok)

        const project = await ProjectModel.findByIdAndUpdate(
            id,
            { $pull: { teamMembers: userId } },
            { new: true }
        ).populate("teamMembers", "employeeId firstName lastName")

        if (!project) {
            return res.status(404).json({ success: false, message: "Project not found" })
        }

        return res.status(200).json({ success: true, message: "Member removed successfully", data: project })
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message })
    }
}
