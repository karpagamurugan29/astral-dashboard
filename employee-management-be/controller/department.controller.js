import departmentModel from "../models/departmentModel.js";

export const getDepartments = async (req, res) => {
    try {
        const departments = await departmentModel.find({}).sort({ name: 1 });
        return res.status(200).json({
            success: true,
            data: departments,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

export const createDepartment = async (req, res) => {
    try {
        const { name, code, description } = req.body;

        const existing = await departmentModel.findOne({ name });
        if (existing) {
            return res.status(409).json({
                success: false,
                message: "Department already exists.",
            });
        }

        const department = await departmentModel.create({ name, code, description });

        return res.status(201).json({
            success: true,
            message: "Department created successfully.",
            data: department,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

export const updateDepartment = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, code, description, status } = req.body;

        const department = await departmentModel.findByIdAndUpdate(
            id,
            { name, code, description, status },
            { new: true, runValidators: true }
        );

        if (!department) {
            return res.status(404).json({
                success: false,
                message: "Department not found.",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Department updated successfully.",
            data: department,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

export const deleteDepartment = async (req, res) => {
    try {
        const { id } = req.params;

        const department = await departmentModel.findByIdAndDelete(id);

        if (!department) {
            return res.status(404).json({
                success: false,
                message: "Department not found.",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Department deleted successfully.",
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};
