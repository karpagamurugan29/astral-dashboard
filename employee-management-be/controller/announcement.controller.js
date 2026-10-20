import announcementModel from "../models/announcementModel.js";

export const getAnnouncements = async (req, res) => {
    try {
        const announcements = await announcementModel
            .find({})
            .populate("postedBy", "firstName lastName designation")
            .sort({ pinned: -1, createdAt: -1 });

        return res.status(200).json({
            success: true,
            data: announcements,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

export const createAnnouncement = async (req, res) => {
    try {
        const { title, content, audience, pinned } = req.body;

        const announcement = await announcementModel.create({
            title,
            content,
            audience,
            pinned,
            postedBy: req.user.id,
        });

        return res.status(201).json({
            success: true,
            message: "Announcement posted successfully.",
            data: announcement,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

export const deleteAnnouncement = async (req, res) => {
    try {
        const { id } = req.params;

        const announcement = await announcementModel.findByIdAndDelete(id);

        if (!announcement) {
            return res.status(404).json({
                success: false,
                message: "Announcement not found.",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Announcement removed successfully.",
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};
