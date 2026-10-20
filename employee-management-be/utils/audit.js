import auditLogModel from "../models/auditLogModel.js";

// Fire-and-forget audit trail entry. Never blocks or fails the request that triggered it.
export const logAudit = (req, action, description, target) => {
    auditLogModel
        .create({
            action,
            description,
            performedBy: req?.user?.id || null,
            targetType: target?.type || "",
            targetId: target?.id || null,
        })
        .catch(() => {});
};
