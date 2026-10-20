import designationModel from "../models/designationModel.js";

export const getDesignations = async (req, res) => {
    try {
        const designations = await designationModel.find({}).sort({ name: 1 });
        return res.status(200).json({
            success: true,
            data: designations,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

export const createDesignation = async (req, res) => {
    try {
        const { name, department, description } = req.body;

        const existing = await designationModel.findOne({ name });
        if (existing) {
            return res.status(409).json({
                success: false,
                message: "Designation already exists.",
            });
        }

        const designation = await designationModel.create({ name, department, description });

        return res.status(201).json({
            success: true,
            message: "Designation created successfully.",
            data: designation,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

export const updateDesignation = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, department, description, status } = req.body;

        const designation = await designationModel.findByIdAndUpdate(
            id,
            { name, department, description, status },
            { new: true, runValidators: true }
        );

        if (!designation) {
            return res.status(404).json({
                success: false,
                message: "Designation not found.",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Designation updated successfully.",
            data: designation,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

export const deleteDesignation = async (req, res) => {
    try {
        const { id } = req.params;

        const designation = await designationModel.findByIdAndDelete(id);

        if (!designation) {
            return res.status(404).json({
                success: false,
                message: "Designation not found.",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Designation deleted successfully.",
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};
