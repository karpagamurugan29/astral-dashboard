import auditLogModel from "../models/auditLogModel.js";

export const getAuditLogs = async (req, res) => {
    try {
        const logs = await auditLogModel
            .find({})
            .populate("performedBy", "firstName lastName employeeId")
            .sort({ createdAt: -1 })
            .limit(200);

        return res.status(200).json({
            success: true,
            data: logs,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
