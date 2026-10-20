import notificationModel from "../models/notificationModel.js";
import employeeModel from "../models/employeeModel.js";

// Fire-and-forget notification. Never blocks or fails the request that triggered it.
export const notify = (employeeId, title, message, type = "General", link = "") => {
    if (!employeeId) return;
    notificationModel.create({ employeeId, title, message, type, link }).catch(() => {});
};

// Notify everyone who can act as an approver (Admin/HR/Manager), e.g. when a
// leave or regularization request comes in and needs someone to review it.
export const notifyApprovers = async (title, message, type = "General", link = "") => {
    try {
        const approvers = await employeeModel.find({ role: { $in: ["Admin", "HR", "Manager", "Team Lead"] }, status: "Active" }).select("_id");
        approvers.forEach((a) => notify(a._id, title, message, type, link));
    } catch {
        // best-effort — never block the calling request
    }
};
