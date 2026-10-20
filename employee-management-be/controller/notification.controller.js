import notificationModel from "../models/notificationModel.js";

export const getNotifications = async (req, res) => {
    try {
        const notifications = await notificationModel
            .find({ employeeId: req.user.id })
            .sort({ createdAt: -1 })
            .limit(50);

        const unreadCount = await notificationModel.countDocuments({ employeeId: req.user.id, isRead: false });

        return res.status(200).json({ success: true, data: notifications, unreadCount });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const markNotificationRead = async (req, res) => {
    try {
        const { id } = req.params;

        await notificationModel.updateOne({ _id: id, employeeId: req.user.id }, { isRead: true });

        return res.status(200).json({ success: true, message: "Marked as read." });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const markAllNotificationsRead = async (req, res) => {
    try {
        await notificationModel.updateMany({ employeeId: req.user.id, isRead: false }, { isRead: true });

        return res.status(200).json({ success: true, message: "All notifications marked as read." });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
