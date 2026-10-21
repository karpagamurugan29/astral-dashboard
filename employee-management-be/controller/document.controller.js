import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import documentModel, { DOCUMENT_CATEGORIES } from "../models/documentModel.js";
import employeeModel from "../models/employeeModel.js";
import { viewerOf, reportsUnder, isInLine } from "../utils/documentAccess.js";
import { logAudit } from "../utils/audit.js";
import { notify } from "../utils/notify.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEGACY_DIR = process.env.VERCEL ? "/tmp/uploads" : path.join(__dirname, "..", "uploads");

// Employee documents are stored privately in MongoDB (GridFS bucket "employeeDocs"), filed by
// employee ID, so they are never reachable by URL and survive serverless redeploys.
const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "employeeDocs" });

const ALLOWED = /^(application\/pdf|image\/(png|jpe?g|webp|heic|heif)|application\/(msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet))|application\/vnd\.ms-excel)$/;
const safeName = (s) => String(s || "file").replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, "_").slice(0, 120);

const saveToBucket = (file, code) =>
    new Promise((resolve, reject) => {
        const stream = bucket().openUploadStream(`${code || "COMPANY"}/${Date.now()}-${safeName(file.originalname)}`, {
            contentType: file.mimetype,
            metadata: { employeeCode: code || "" },
        });
        stream.on("error", reject);
        stream.on("finish", () => resolve(stream.id));
        stream.end(file.buffer);
    });

const shape = (d) => {
    const o = d.toObject ? d.toObject() : d;
    return { ...o, fileUrl: `/documents/${o._id}/file` };
};

// POST /documents/upload — multipart: file, title, category, employeeId (owner's _id), documentNumber, expiryDate, notes.
// Admin / HR (and HR Head) file documents for anyone, or company-wide when employeeId is "company";
// everyone else uploads to their own record only.
export const uploadDocument = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded." });
        if (!ALLOWED.test(req.file.mimetype)) return res.status(400).json({ success: false, message: "Upload a PDF, image, Word or Excel file." });

        const viewer = await viewerOf(req);
        const { title, category, employeeId, documentNumber, expiryDate, notes } = req.body;
        let ownerId = req.user.id;
        if (viewer.admin) ownerId = employeeId === "company" ? null : employeeId || req.user.id;
        else if (employeeId && employeeId !== String(req.user.id)) return res.status(403).json({ success: false, message: "You can only add documents to your own record." });

        const owner = ownerId ? await employeeModel.findById(ownerId).select("employeeId firstName lastName").lean() : null;
        if (ownerId && !owner) return res.status(404).json({ success: false, message: "Employee not found." });
        if (!ownerId && category !== "Policy" && category !== "Other") return res.status(400).json({ success: false, message: "Company-wide documents must be a Policy or Other." });

        const fileId = await saveToBucket(req.file, owner?.employeeId);
        const doc = await documentModel.create({
            title: (title || req.file.originalname).slice(0, 160),
            category: DOCUMENT_CATEGORIES.includes(category) ? category : "Other",
            employeeId: ownerId,
            employeeCode: owner?.employeeId || "",
            documentNumber: documentNumber || "",
            expiryDate: expiryDate || null,
            notes: notes || "",
            storage: "gridfs",
            fileId,
            fileName: req.file.originalname,
            mimeType: req.file.mimetype,
            size: req.file.size,
            uploadedBy: req.user.id,
        });
        logAudit(req, "Document uploaded", `${doc.title} (${doc.category})${owner ? ` for ${owner.employeeId}` : " — company-wide"}`, { type: "Document", id: doc._id });
        if (ownerId && String(ownerId) !== String(req.user.id)) notify(ownerId, "Document added to your record", `${doc.title} (${doc.category}) was added to your documents.`, "General", "/documents");

        return res.status(201).json({ success: true, message: "Document uploaded successfully.", data: shape(doc) });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// GET /documents?employeeId=… — the employee's own files, those of everyone in their reporting
// line below them, and company-wide files. Admin / HR / Directors / Partners / HR Head see all.
export const getDocuments = async (req, res) => {
    try {
        const viewer = await viewerOf(req);
        const { employeeId } = req.query;
        let filter;
        if (employeeId) {
            if (!(await isInLine(viewer, employeeId))) return res.status(403).json({ success: false, message: "You can only see your own documents and those of people who report to you." });
            filter = { employeeId };
        } else if (viewer.all) {
            filter = {};
        } else {
            const below = [...(await reportsUnder(viewer.id))];
            filter = { $or: [{ employeeId: { $in: [viewer.id, ...below] } }, { employeeId: null }] };
        }

        const docs = await documentModel
            .find(filter)
            .populate("employeeId", "employeeId firstName lastName designation department profileImage")
            .populate("uploadedBy", "firstName lastName")
            .sort({ createdAt: -1 })
            .lean();

        return res.status(200).json({ success: true, data: docs.map(shape), meta: { canUploadForOthers: viewer.admin, seesAll: viewer.all, categories: DOCUMENT_CATEGORIES } });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// GET /documents/:id/file[?download=1] — streams the file after the same access check.
export const downloadDocument = async (req, res) => {
    try {
        const doc = await documentModel.findById(req.params.id).lean();
        if (!doc) return res.status(404).json({ success: false, message: "Document not found." });
        const viewer = await viewerOf(req);
        if (!(await isInLine(viewer, doc.employeeId))) return res.status(403).json({ success: false, message: "You don't have access to this document." });

        const disposition = `${req.query.download ? "attachment" : "inline"}; filename="${safeName(doc.fileName)}"`;
        res.set({ "Content-Type": doc.mimeType || "application/octet-stream", "Content-Disposition": disposition, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });

        if (doc.storage === "gridfs" && doc.fileId) {
            const stream = bucket().openDownloadStream(doc.fileId);
            stream.on("error", () => { if (!res.headersSent) res.status(404).json({ success: false, message: "File is missing." }); else res.end(); });
            return stream.pipe(res);
        }
        const p = path.join(LEGACY_DIR, path.basename(doc.fileUrl || ""));
        if (!doc.fileUrl || !fs.existsSync(p)) return res.status(404).json({ success: false, message: "File is missing." });
        return fs.createReadStream(p).pipe(res);
    } catch (error) {
        if (!res.headersSent) return res.status(500).json({ success: false, message: error.message });
    }
};

// DELETE /documents/:id — Admin / HR any document; others only files they uploaded to their own record.
export const deleteDocument = async (req, res) => {
    try {
        const viewer = await viewerOf(req);
        const doc = await documentModel.findById(req.params.id);
        if (!doc) return res.status(404).json({ success: false, message: "Document not found." });
        const own = String(doc.employeeId) === viewer.id && String(doc.uploadedBy) === viewer.id;
        if (!viewer.admin && !own) return res.status(403).json({ success: false, message: "Only HR can remove this document." });

        await doc.deleteOne();
        if (doc.storage === "gridfs" && doc.fileId) await bucket().delete(doc.fileId).catch(() => {});
        logAudit(req, "Document deleted", `${doc.title} (${doc.category})${doc.employeeCode ? ` for ${doc.employeeCode}` : ""}`, { type: "Document", id: doc._id });
        return res.status(200).json({ success: true, message: "Document deleted successfully." });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
