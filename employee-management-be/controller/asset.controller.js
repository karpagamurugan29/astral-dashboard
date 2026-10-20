import assetModel from "../models/assetModel.js";
import { logAudit } from "../utils/audit.js";
import { notify } from "../utils/notify.js";

export const getAssets = async (req, res) => {
    try {
        const assets = await assetModel
            .find({})
            .populate("assignedTo", "employeeId firstName lastName department")
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            data: assets,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

export const createAsset = async (req, res) => {
    try {
        const { assetName, assetType, serialNumber, notes } = req.body;

        const asset = await assetModel.create({ assetName, assetType, serialNumber, notes });

        return res.status(201).json({
            success: true,
            message: "Asset added successfully.",
            data: asset,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

export const updateAsset = async (req, res) => {
    try {
        const { id } = req.params;
        const { assetName, assetType, serialNumber, notes } = req.body;

        const asset = await assetModel.findByIdAndUpdate(
            id,
            { assetName, assetType, serialNumber, notes },
            { new: true, runValidators: true }
        );

        if (!asset) {
            return res.status(404).json({
                success: false,
                message: "Asset not found.",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Asset updated successfully.",
            data: asset,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

export const assignAsset = async (req, res) => {
    try {
        const { id } = req.params;
        const { employeeId } = req.body;

        const asset = await assetModel.findById(id);

        if (!asset) {
            return res.status(404).json({
                success: false,
                message: "Asset not found.",
            });
        }

        if (asset.status === "Assigned") {
            return res.status(400).json({
                success: false,
                message: "Asset is already assigned. Return it first.",
            });
        }

        asset.assignedTo = employeeId;
        asset.assignedDate = new Date();
        asset.returnedDate = null;
        asset.status = "Assigned";

        await asset.save();

        logAudit(req, "asset.assign", `Assigned ${asset.assetName} to an employee`, { type: "Asset", id: asset._id });
        notify(asset.assignedTo, "Asset assigned to you", `${asset.assetName} (${asset.assetType}) has been assigned to you.`, "Asset", "/assets");

        return res.status(200).json({
            success: true,
            message: "Asset assigned successfully.",
            data: asset,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

export const returnAsset = async (req, res) => {
    try {
        const { id } = req.params;

        const asset = await assetModel.findById(id);

        if (!asset) {
            return res.status(404).json({
                success: false,
                message: "Asset not found.",
            });
        }

        asset.returnedDate = new Date();
        asset.status = "Returned";

        await asset.save();

        return res.status(200).json({
            success: true,
            message: "Asset marked as returned.",
            data: asset,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

export const deleteAsset = async (req, res) => {
    try {
        const { id } = req.params;

        const asset = await assetModel.findByIdAndDelete(id);

        if (!asset) {
            return res.status(404).json({
                success: false,
                message: "Asset not found.",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Asset removed successfully.",
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};
