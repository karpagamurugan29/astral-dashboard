import branchModel from "../models/branchModel.js";

export const getBranches = async (req, res) => {
    try {
        const branches = await branchModel.find({}).sort({ name: 1 });
        return res.status(200).json({ success: true, data: branches });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const createBranch = async (req, res) => {
    try {
        const { name, address, city, country } = req.body;

        const existing = await branchModel.findOne({ name });
        if (existing) {
            return res.status(409).json({ success: false, message: "Branch already exists." });
        }

        const branch = await branchModel.create({ name, address, city, country });
        return res.status(201).json({ success: true, message: "Branch created successfully.", data: branch });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const updateBranch = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, address, city, country, status } = req.body;

        const branch = await branchModel.findByIdAndUpdate(
            id,
            { name, address, city, country, status },
            { new: true, runValidators: true }
        );

        if (!branch) {
            return res.status(404).json({ success: false, message: "Branch not found." });
        }

        return res.status(200).json({ success: true, message: "Branch updated successfully.", data: branch });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const deleteBranch = async (req, res) => {
    try {
        const { id } = req.params;
        const branch = await branchModel.findByIdAndDelete(id);

        if (!branch) {
            return res.status(404).json({ success: false, message: "Branch not found." });
        }

        return res.status(200).json({ success: true, message: "Branch deleted successfully." });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
