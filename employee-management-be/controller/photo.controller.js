import mongoose from "mongoose";
import employeeModel from "../models/employeeModel.js";
import { logAudit } from "../utils/audit.js";

// Profile photos live in GridFS ("profilePhotos"). The employee's profileImage holds
// "/photos/<fileId>" — a new id on every upload, so browsers can cache each photo forever.
// Photos are served without a login (an <img> can't send the Bearer token); the ids are random.
const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "profilePhotos" });
const IMAGE = /^image\/(png|jpe?g|webp)$/;
const MAX = 3 * 1024 * 1024;

const removeOld = async (profileImage) => {
    const m = /^\/photos\/([a-f0-9]{24})$/.exec(profileImage || "");
    if (m) await bucket().delete(new mongoose.Types.ObjectId(m[1])).catch(() => {});
};

const save = async (employee, file) => {
    if (!file) throw Object.assign(new Error("Choose a photo to upload."), { status: 400 });
    if (!IMAGE.test(file.mimetype)) throw Object.assign(new Error("Use a JPG, PNG or WebP image."), { status: 400 });
    if (file.size > MAX) throw Object.assign(new Error("The photo must be under 3 MB."), { status: 400 });
    const id = await new Promise((resolve, reject) => {
        const s = bucket().openUploadStream(`${employee.employeeId || employee._id}-${Date.now()}`, { contentType: file.mimetype, metadata: { employeeId: employee._id } });
        s.on("error", reject).on("finish", () => resolve(s.id));
        s.end(file.buffer);
    });
    await removeOld(employee.profileImage);
    employee.profileImage = `/photos/${id}`;
    await employee.save({ validateBeforeSave: false });
    return employee.profileImage;
};
const fail = (res, err) => res.status(err.status || 500).json({ success: false, message: err.message });

// POST /auth/profile/photo (multipart "photo") — your own photo
export const uploadMyPhoto = async (req, res) => {
    try {
        const me = await employeeModel.findById(req.user.id);
        if (!me) return res.status(404).json({ success: false, message: "Profile not found." });
        const profileImage = await save(me, req.file);
        return res.status(200).json({ success: true, message: "Your photo is updated.", data: { profileImage } });
    } catch (err) { return fail(res, err); }
};

// DELETE /auth/profile/photo — remove your own photo
export const removeMyPhoto = async (req, res) => {
    try {
        const me = await employeeModel.findById(req.user.id);
        await removeOld(me?.profileImage);
        if (me) { me.profileImage = ""; await me.save({ validateBeforeSave: false }); }
        return res.status(200).json({ success: true, message: "Your photo is removed.", data: { profileImage: "" } });
    } catch (err) { return fail(res, err); }
};

// POST /employees/:id/photo (multipart "photo") — HR / Admin set someone's photo
export const uploadEmployeePhoto = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ success: false, message: "Employee not found." });
        const emp = await employeeModel.findById(req.params.id);
        if (!emp) return res.status(404).json({ success: false, message: "Employee not found." });
        const profileImage = await save(emp, req.file);
        logAudit(req, "employee.update", `Updated the photo of ${emp.firstName} ${emp.lastName}`, { type: "Employee", id: emp._id });
        return res.status(200).json({ success: true, message: `${emp.firstName}'s photo is updated.`, data: { profileImage } });
    } catch (err) { return fail(res, err); }
};

// GET /photos/:id — the image itself (public, cached for a year: the id changes on every upload)
export const servePhoto = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).end();
        const _id = new mongoose.Types.ObjectId(req.params.id);
        const file = await mongoose.connection.db.collection("profilePhotos.files").findOne({ _id });
        if (!file) return res.status(404).end();
        res.set({ "Content-Type": file.contentType || "image/jpeg", "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "cross-origin" });
        bucket().openDownloadStream(_id).on("error", () => res.status(404).end()).pipe(res);
    } catch { return res.status(404).end(); }
};
