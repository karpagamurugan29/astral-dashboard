import notificationModel from "../models/notificationModel.js";
import employeeModel from "../models/employeeModel.js";

// Fire-and-forget notification. Never blocks or fails the request that triggered it.
// Categories a person can switch off in Notification settings.
const MUTABLE = ["Task", "Project", "Calendar", "Reminder"];
export const notify = (employeeId, title, message, type = "General", link = "", priority = "Medium") => {
    if (!employeeId) return;
    (async () => {
        if (MUTABLE.includes(type)) {
            const { default: NotificationPrefModel } = await import("../models/notificationPrefModel.js");
            const pref = await NotificationPrefModel.findOne({ employeeId }).select("muted").lean();
            if (pref?.muted?.includes(type)) return;
        }
        await notificationModel.create({ employeeId, title, message, type, link, priority });
    })().catch(() => {});
};

// Tell the people who can approve a request. With `forEmployeeId`, that's the person's own
// managers (direct manager and the one above) plus HR; without it, every approver in the firm.
export const notifyApprovers = async (title, message, type = "General", link = "", forEmployeeId = null) => {
    try {
        if (forEmployeeId) {
            const { chainAbove } = await import("./hierarchy.js");
            const line = (await chainAbove(forEmployeeId)).slice(0, 2);
            const hr = await employeeModel.find({ role: "HR", status: "Active", _id: { $ne: forEmployeeId } }).select("_id").lean();
            const to = new Set([...line, ...hr.map((h) => String(h._id))]);
            if (to.size) { to.forEach((id) => notify(id, title, message, type, link)); return; }
        }
        const approvers = await employeeModel.find({ role: { $in: ["Admin", "HR", "Manager", "Team Lead"] }, status: "Active" }).select("_id");
        approvers.forEach((a) => notify(a._id, title, message, type, link));
    } catch {
        // best-effort — never block the calling request
    }
};
