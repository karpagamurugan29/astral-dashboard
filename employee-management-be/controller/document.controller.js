import documentModel from "../models/documentModel.js";

export const uploadDocument = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "No file uploaded." });
        }

        const { title, category, employeeId } = req.body;
        const isManager = ["Admin", "HR"].includes(req.user.role);

        const doc = await documentModel.create({
            title: title || req.file.originalname,
            category,
            // Only Admin/HR can upload on behalf of another employee (or company-wide, employeeId omitted).
            employeeId: isManager ? (employeeId || null) : req.user.id,
            fileName: req.file.originalname,
            fileUrl: `/uploads/${req.file.filename}`,
            mimeType: req.file.mimetype,
            size: req.file.size,
            uploadedBy: req.user.id,
        });

        return res.status(201).json({
            success: true,
            message: "Document uploaded successfully.",
            data: doc,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getDocuments = async (req, res) => {
    try {
        const isManager = ["Admin", "HR"].includes(req.user.role);

        // Managers see everything; everyone else sees their own files plus company-wide (no owner) ones.
        const filter = isManager ? {} : { $or: [{ employeeId: req.user.id }, { employeeId: null }] };

        const docs = await documentModel
            .find(filter)
            .populate("employeeId", "firstName lastName")
            .populate("uploadedBy", "firstName lastName")
            .sort({ createdAt: -1 });

        return res.status(200).json({ success: true, data: docs });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const deleteDocument = async (req, res) => {
    try {
        const { id } = req.params;
        const isManager = ["Admin", "HR"].includes(req.user.role);

        const filter = isManager ? { _id: id } : { _id: id, employeeId: req.user.id };

        const doc = await documentModel.findOneAndDelete(filter);

        if (!doc) {
            return res.status(404).json({ success: false, message: "Document not found." });
        }

        return res.status(200).json({ success: true, message: "Document deleted successfully." });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
