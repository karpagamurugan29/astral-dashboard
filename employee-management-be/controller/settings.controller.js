import CompanySettings from "../models/CompanySettingsModel.js";
import LeaveSettings from "../models/LeaveSettingsModel.js";
import { logAudit } from "../utils/audit.js";

export const getCompanySettings = async (req, res) => {
    try {
        let settings = await CompanySettings.findOne({});
        if (!settings) {
            settings = await CompanySettings.create({ companyName: "My Company" });
        }
        return res.status(200).json({ success: true, data: settings });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const updateCompanySettings = async (req, res) => {
    try {
        const { companyName, workingHours, attendanceSettings } = req.body;

        const settings = await CompanySettings.findOneAndUpdate(
            {},
            { companyName, workingHours, attendanceSettings },
            { new: true, upsert: true, runValidators: true }
        );

        logAudit(req, "settings.company_update", "Updated company settings", { type: "CompanySettings", id: settings._id });

        return res.status(200).json({ success: true, message: "Settings updated successfully.", data: settings });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getLeaveSettings = async (req, res) => {
    try {
        let settings = await LeaveSettings.findOne({});
        if (!settings) {
            settings = await LeaveSettings.create({});
        }
        return res.status(200).json({ success: true, data: settings });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const updateLeaveSettings = async (req, res) => {
    try {
        const settings = await LeaveSettings.findOneAndUpdate(
            {},
            req.body,
            { new: true, upsert: true, runValidators: true }
        );

        logAudit(req, "settings.leave_policy_update", "Updated leave policy settings", { type: "LeaveSettings", id: settings._id });

        return res.status(200).json({ success: true, message: "Leave policy updated successfully.", data: settings });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
