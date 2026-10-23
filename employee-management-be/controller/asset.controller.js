import mongoose from "mongoose";
import assetModel from "../models/assetModel.js";
import employeeModel from "../models/employeeModel.js";
import { logAudit } from "../utils/audit.js";
import { notify } from "../utils/notify.js";

// Asset register. Only Admin / HR (or anyone given the "assets" permission) can see every asset,
// add, assign or take back equipment — enforced by the routes. Everyone else sees only what is
// assigned to them (GET /assets/mine).

const PERSON = "employeeId firstName lastName department designation profileImage";
const fail = (res, err) => res.status(err.status || 500).json({ success: false, message: err.message });
const httpError = (status, message) => Object.assign(new Error(message), { status });
const FREE = ["Available", "Returned"];
const populate = (q) => q.populate("assignedTo", PERSON).populate("history.employee", PERSON).populate("history.assignedBy", "firstName lastName").populate("history.returnedBy", "firstName lastName");

const nextTag = async () => {
    const last = await assetModel.find({ assetTag: /^AST-\d+$/ }).select("assetTag").lean();
    const n = last.reduce((m, a) => Math.max(m, Number(a.assetTag.slice(4)) || 0), 0) + 1;
    return `AST-${String(n).padStart(4, "0")}`;
};

const pick = (b) => {
    const out = {};
    ["assetName", "assetType", "serialNumber", "notes", "brand", "model", "condition"].forEach((k) => { if (b[k] !== undefined) out[k] = typeof b[k] === "string" ? b[k].trim() : b[k]; });
    ["purchaseDate", "warrantyUntil"].forEach((k) => { if (b[k] !== undefined) out[k] = b[k] ? new Date(b[k]) : null; });
    if (out.serialNumber === "") out.serialNumber = undefined; // keep the unique index sparse
    return out;
};

// GET /assets — the whole register (managers)
export const getAssets = async (req, res) => {
    try {
        const assets = await populate(assetModel.find({}).sort({ createdAt: -1 }));
        // older records: give them a tag once so every asset has one
        const untagged = assets.filter((a) => !a.assetTag);
        for (const a of untagged) { a.assetTag = await nextTag(); await a.save(); }
        return res.status(200).json({ success: true, data: assets });
    } catch (error) { return fail(res, error); }
};

// GET /assets/mine — what I have now, and what I had before
export const myAssets = async (req, res) => {
    try {
        const me = new mongoose.Types.ObjectId(req.user.id);
        const [current, past] = await Promise.all([
            populate(assetModel.find({ assignedTo: me, status: "Assigned" }).sort({ assignedDate: -1 })),
            populate(assetModel.find({ "history.employee": me, assignedTo: { $ne: me } }).sort({ updatedAt: -1 })),
        ]);
        const mine = (a) => {
            const o = a.toObject();
            const entries = (o.history || []).filter((h) => String(h.employee?._id || h.employee) === String(me));
            return { _id: o._id, assetTag: o.assetTag, assetName: o.assetName, assetType: o.assetType, brand: o.brand, model: o.model, serialNumber: o.serialNumber, condition: o.condition, warrantyUntil: o.warrantyUntil, status: o.status, assignedDate: o.assignedDate, notes: o.notes, myHistory: entries };
        };
        return res.status(200).json({ success: true, data: { current: current.map(mine), past: past.map(mine) } });
    } catch (error) { return fail(res, error); }
};

export const createAsset = async (req, res) => {
    try {
        const data = pick(req.body || {});
        if (!data.assetName || !data.assetType) throw httpError(400, "Asset name and type are required.");
        const asset = await assetModel.create({ ...data, assetTag: await nextTag(), status: "Available" });
        logAudit(req, "asset.create", `Added ${asset.assetTag} ${asset.assetName}`, { type: "Asset", id: asset._id });
        return res.status(201).json({ success: true, message: "Asset added.", data: asset });
    } catch (error) {
        if (error.code === 11000) return fail(res, httpError(400, "Another asset already has that serial number."));
        return fail(res, error);
    }
};

export const updateAsset = async (req, res) => {
    try {
        const asset = await assetModel.findById(req.params.id);
        if (!asset) throw httpError(404, "Asset not found.");
        Object.assign(asset, pick(req.body || {}));
        // Damaged / Retired / back to Available — only for assets nobody holds
        if (req.body?.status && req.body.status !== asset.status) {
            if (asset.status === "Assigned") throw httpError(400, "Take the asset back before changing its status.");
            if (!["Available", "Damaged", "Retired"].includes(req.body.status)) throw httpError(400, "Use Assign to give the asset to someone.");
            asset.status = req.body.status;
        }
        await asset.save();
        await populate(assetModel.findById(asset._id));
        return res.status(200).json({ success: true, message: "Asset updated.", data: await populate(assetModel.findById(asset._id)) });
    } catch (error) {
        if (error.code === 11000) return fail(res, httpError(400, "Another asset already has that serial number."));
        return fail(res, error);
    }
};

// PUT /assets/:id/assign { employeeId, note }
export const assignAsset = async (req, res) => {
    try {
        const { employeeId, note } = req.body || {};
        const asset = await assetModel.findById(req.params.id);
        if (!asset) throw httpError(404, "Asset not found.");
        if (!FREE.includes(asset.status)) throw httpError(400, asset.status === "Assigned" ? "This asset is already with someone. Take it back first." : `A ${asset.status.toLowerCase()} asset can't be assigned.`);
        const person = await employeeModel.findOne({ _id: employeeId, status: "Active" }).select("firstName lastName");
        if (!person) throw httpError(400, "Pick an active employee.");

        const now = new Date();
        asset.assignedTo = person._id;
        asset.assignedDate = now;
        asset.returnedDate = null;
        asset.status = "Assigned";
        asset.history.push({ employee: person._id, assignedAt: now, assignedBy: req.user.id, assignNote: String(note || "").slice(0, 300) });
        if (!asset.assetTag) asset.assetTag = await nextTag();
        await asset.save();

        logAudit(req, "asset.assign", `Assigned ${asset.assetTag} ${asset.assetName} to ${person.firstName} ${person.lastName}`, { type: "Asset", id: asset._id });
        notify(person._id, "Asset assigned to you", `${asset.assetName} (${asset.assetType}${asset.serialNumber ? `, ${asset.serialNumber}` : ""}) is now assigned to you.`, "Asset", "/assets/mine");
        return res.status(200).json({ success: true, message: `Assigned to ${person.firstName} ${person.lastName}.`, data: await populate(assetModel.findById(asset._id)) });
    } catch (error) { return fail(res, error); }
};

// PUT /assets/:id/return { condition, note } — takes it back; damaged items are set aside
export const returnAsset = async (req, res) => {
    try {
        const { condition, note } = req.body || {};
        const asset = await assetModel.findById(req.params.id);
        if (!asset) throw httpError(404, "Asset not found.");
        if (asset.status !== "Assigned" || !asset.assignedTo) throw httpError(400, "This asset isn't assigned to anyone.");
        const holder = asset.assignedTo;
        const now = new Date();
        const cond = ["New", "Good", "Fair", "Damaged"].includes(condition) ? condition : asset.condition || "Good";
        const open = [...asset.history].reverse().find((h) => String(h.employee) === String(holder) && !h.returnedAt);
        if (open) { open.returnedAt = now; open.returnedBy = req.user.id; open.returnCondition = cond; open.returnNote = String(note || "").slice(0, 300); }
        else asset.history.push({ employee: holder, assignedAt: asset.assignedDate, returnedAt: now, returnedBy: req.user.id, returnCondition: cond, returnNote: String(note || "").slice(0, 300) });
        asset.condition = cond;
        asset.status = cond === "Damaged" ? "Damaged" : "Available";
        asset.assignedTo = null;
        asset.returnedDate = now;
        await asset.save();

        logAudit(req, "asset.return", `${asset.assetTag} ${asset.assetName} returned (${cond})`, { type: "Asset", id: asset._id });
        notify(holder, "Asset returned", `${asset.assetName} has been marked as returned. Thank you!`, "Asset", "/assets/mine");
        return res.status(200).json({ success: true, message: cond === "Damaged" ? "Returned and set aside as damaged." : "Returned — it's available again.", data: await populate(assetModel.findById(asset._id)) });
    } catch (error) { return fail(res, error); }
};

export const deleteAsset = async (req, res) => {
    try {
        const asset = await assetModel.findById(req.params.id);
        if (!asset) throw httpError(404, "Asset not found.");
        if (asset.status === "Assigned") throw httpError(400, "Take the asset back before removing it.");
        if (asset.history?.length) throw httpError(400, "This asset has a hand-over history. Mark it Retired instead of deleting it.");
        await asset.deleteOne();
        logAudit(req, "asset.delete", `Removed ${asset.assetTag || ""} ${asset.assetName}`, { type: "Asset", id: asset._id });
        return res.status(200).json({ success: true, message: "Asset removed." });
    } catch (error) { return fail(res, error); }
};
