import mongoose from "mongoose";
import SharedFile, { FileFolder } from "../models/sharedFileModel.js";
import conversationModel from "../models/conversationModel.js";
import employeeModel from "../models/employeeModel.js";
import { allowedContactIds } from "../utils/chatAccess.js";
import { notify } from "../utils/notify.js";

/* --------------------------------------------------------------------------
   Files: keep your work files, organise them in folders and share them with
   people (one to one) or with a chat group (one to many). You can share with
   the same people you can message — your team and the officials above you.
   Viewers can open and download; editors can also upload a new version.
   Deleting moves a file to Trash (restorable for 30 days).
   -------------------------------------------------------------------------- */

const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "sharedFiles" });
const PERSON = "firstName lastName designation profileImage employeeId";
const idStr = (v) => (v?._id ?? v)?.toString?.() ?? null;
const httpError = (status, message) => Object.assign(new Error(message), { status });
const fail = (res, err) => res.status(err.status || 500).json({ success: false, message: err.message });
const QUOTA = 2 * 1024 * 1024 * 1024; // 2 GB each
const BLOCKED = /\.(exe|bat|cmd|com|scr|msi|vbs|js|jar|ps1|sh)$/i;
const safeName = (s) => String(s || "file").replace(/[\\/:*?"<>|]+/g, "_").trim().slice(0, 200) || "file";

const myGroups = async (me) => (await conversationModel.find({ type: "group", participants: me }).select("_id").lean()).map((g) => idStr(g._id));

// what the signed-in user can do with a file (or folder): "owner" | "edit" | "view" | null
const accessOf = (doc, me, groups, folderAccess = null) => {
    if (idStr(doc.owner) === me) return "owner";
    const direct = (doc.shares || []).find((s) => idStr(s.employee) === me);
    const viaGroup = (doc.groups || []).filter((g) => groups.includes(idStr(g.group)));
    const perms = [direct?.permission, ...viaGroup.map((g) => g.permission), folderAccess === "owner" ? null : folderAccess].filter(Boolean);
    if (perms.includes("edit")) return "edit";
    if (perms.length) return "view";
    return null;
};
const folderAccessOf = async (folderId, me, groups) => {
    if (!folderId) return null;
    const f = await FileFolder.findById(folderId).lean();
    return f && !f.trashedAt ? accessOf(f, me, groups) : null;
};
const loadFile = async (req, id, need = "view") => {
    if (!mongoose.isValidObjectId(id)) throw httpError(404, "File not found.");
    const me = idStr(req.user.id);
    const f = await SharedFile.findById(id);
    if (!f) throw httpError(404, "File not found.");
    const groups = await myGroups(me);
    const access = accessOf(f, me, groups, await folderAccessOf(f.folder, me, groups));
    const rank = { view: 1, edit: 2, owner: 3 };
    if (!access) throw httpError(403, "This file hasn't been shared with you.");
    if (rank[access] < rank[need]) throw httpError(403, need === "owner" ? "Only the owner can do that." : "You can view this file but not change it.");
    if (f.trashedAt && need !== "owner") throw httpError(404, "This file was moved to Trash by its owner.");
    return { f, me, access };
};
const log = (f, by, action, detail = "") => { f.activity.push({ by, action, detail }); if (f.activity.length > 60) f.activity = f.activity.slice(-60); };
const shape = (f, me, groups, folderAccess) => {
    const o = f.toObject ? f.toObject() : f;
    return {
        _id: o._id, name: o.name, size: o.size, mime: o.mime, folder: o.folder, description: o.description, tags: o.tags,
        owner: o.owner, shares: o.shares, groups: o.groups, versions: (o.versions || []).length, downloads: o.downloads,
        starred: (o.starredBy || []).some((s) => idStr(s) === me), access: accessOf(o, me, groups, folderAccess), trashedAt: o.trashedAt,
        createdAt: o.createdAt, updatedAt: o.updatedAt, lastOpenedAt: o.lastOpenedAt,
    };
};
const storeBuffer = (file, owner) => new Promise((resolve, reject) => {
    const s = bucket().openUploadStream(safeName(file.originalname), { contentType: file.mimetype, metadata: { owner } });
    s.on("error", reject).on("finish", () => resolve(s.id));
    s.end(file.buffer);
});
const usedBytes = async (me) => {
    const [r] = await SharedFile.aggregate([{ $match: { owner: new mongoose.Types.ObjectId(me) } }, { $group: { _id: null, bytes: { $sum: "$size" } } }]);
    return r?.bytes || 0;
};

/* ---------------- browse ---------------- */
// GET /files?view=mine|shared|recent|starred|trash&folder=<id>&q=
export const listFiles = async (req, res) => {
    try {
        const me = idStr(req.user.id);
        const groups = await myGroups(me);
        const view = req.query.view || "mine";
        const q = String(req.query.q || "").trim();
        const folderId = mongoose.isValidObjectId(req.query.folder) ? req.query.folder : null;
        const sharedToMe = { $or: [{ "shares.employee": me }, { "groups.group": { $in: groups } }] };
        let fileFilter, folderFilter = null, crumbs = [], folder = null, folderAccess = null;

        if (folderId) {
            folder = await FileFolder.findById(folderId).populate("owner", PERSON).lean();
            if (!folder || folder.trashedAt) throw httpError(404, "Folder not found.");
            folderAccess = accessOf(folder, me, groups);
            if (!folderAccess) throw httpError(403, "This folder hasn't been shared with you.");
            fileFilter = { folder: folderId, trashedAt: null };
            folderFilter = { parent: folderId, trashedAt: null };
            // breadcrumbs back to the top
            for (let cur = folder; cur && crumbs.length < 10; cur = cur.parent ? await FileFolder.findById(cur.parent).lean() : null) crumbs.unshift({ _id: cur._id, name: cur.name });
        } else if (view === "shared") {
            fileFilter = { ...sharedToMe, owner: { $ne: me }, trashedAt: null };
            folderFilter = { ...sharedToMe, owner: { $ne: me }, trashedAt: null };
        } else if (view === "recent") {
            fileFilter = { $and: [{ $or: [{ owner: me }, sharedToMe] }], trashedAt: null };
        } else if (view === "starred") {
            fileFilter = { starredBy: me, trashedAt: null };
        } else if (view === "trash") {
            fileFilter = { owner: me, trashedAt: { $ne: null } };
            folderFilter = { owner: me, trashedAt: { $ne: null } };
        } else {
            fileFilter = { owner: me, folder: null, trashedAt: null };
            folderFilter = { owner: me, parent: null, trashedAt: null };
        }
        if (q) {
            const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
            fileFilter = { $and: [{ $or: [{ owner: me }, sharedToMe] }, { $or: [{ name: rx }, { tags: rx }, { description: rx }] }], trashedAt: view === "trash" ? { $ne: null } : null };
            folderFilter = { owner: me, name: rx, trashedAt: null };
        }
        const [files, folders, used] = await Promise.all([
            SharedFile.find(fileFilter).populate("owner", PERSON).populate("shares.employee", PERSON).populate("groups.group", "name participants").sort(view === "recent" ? { updatedAt: -1 } : { name: 1 }).limit(view === "recent" ? 40 : 500).lean(),
            folderFilter ? FileFolder.find(folderFilter).populate("owner", PERSON).sort({ name: 1 }).lean() : [],
            usedBytes(me),
        ]);
        const counts = await Promise.all(folders.map((x) => SharedFile.countDocuments({ folder: x._id, trashedAt: null })));
        return res.status(200).json({
            success: true,
            data: {
                files: files.map((f) => shape(f, me, groups, folderAccess)),
                folders: folders.map((x, i) => ({ ...x, files: counts[i], access: accessOf(x, me, groups) })),
                folder: folder ? { ...folder, access: folderAccess } : null, crumbs,
                storage: { used, quota: QUOTA },
            },
        });
    } catch (err) { return fail(res, err); }
};

// GET /files/:id — full details: access list, versions, activity
export const getFile = async (req, res) => {
    try {
        const { f, me, access } = await loadFile(req, req.params.id);
        await f.populate([{ path: "owner", select: PERSON }, { path: "shares.employee", select: PERSON }, { path: "groups.group", select: "name participants" }, { path: "activity.by", select: "firstName lastName profileImage" }, { path: "versions.by", select: "firstName lastName" }]);
        const groups = await myGroups(me);
        const o = f.toObject();
        return res.status(200).json({ success: true, data: { ...shape(o, me, groups), access, activity: [...(o.activity || [])].reverse().slice(0, 30), versionList: [...(o.versions || [])].reverse() } });
    } catch (err) { return fail(res, err); }
};

// GET /files/:id/download?inline=1[&version=<gridId>]
export const downloadFile = async (req, res) => {
    try {
        const { f, me } = await loadFile(req, req.params.id);
        let gridId = f.gridId, name = f.name, mime = f.mime;
        if (req.query.version) {
            const v = (f.versions || []).find((x) => idStr(x.gridId) === String(req.query.version));
            if (!v) throw httpError(404, "That version isn't available.");
            gridId = v.gridId; name = v.name || f.name; mime = v.mime || f.mime;
        }
        if (!req.query.inline) { f.downloads += 1; log(f, me, "downloaded"); }
        f.lastOpenedAt = new Date();
        await f.save();
        res.set({
            "Content-Type": mime || "application/octet-stream",
            "Content-Disposition": `${req.query.inline ? "inline" : "attachment"}; filename="${safeName(name).replace(/"/g, "")}"`,
            "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff",
        });
        bucket().openDownloadStream(gridId).on("error", () => res.status(404).end()).pipe(res);
    } catch (err) { return fail(res, err); }
};

/* ---------------- upload ---------------- */
// POST /files (multipart "files", up to 10) { folder?, shareWith?: JSON [ids], groups?: JSON [ids], permission? }
export const uploadFiles = async (req, res) => {
    try {
        const me = idStr(req.user.id);
        const files = req.files || [];
        if (!files.length) throw httpError(400, "Choose at least one file.");
        const bad = files.find((x) => BLOCKED.test(x.originalname));
        if (bad) throw httpError(400, `“${bad.originalname}” is a program file and can't be uploaded.`);
        const used = await usedBytes(me);
        const adding = files.reduce((s, x) => s + x.size, 0);
        if (used + adding > QUOTA) throw httpError(400, "That would go over your 2 GB of storage — delete some files from Trash first.");
        let folder = null;
        if (req.body.folder && mongoose.isValidObjectId(req.body.folder)) {
            const groups = await myGroups(me);
            const fa = await folderAccessOf(req.body.folder, me, groups);
            if (!["owner", "edit"].includes(fa)) throw httpError(403, "You can't add files to this folder.");
            folder = req.body.folder;
        }
        const out = [];
        for (const file of files) {
            const gridId = await storeBuffer(file, me);
            const doc = await SharedFile.create({ name: safeName(file.originalname), size: file.size, mime: file.mimetype, gridId, owner: me, folder, activity: [{ by: me, action: "uploaded" }] });
            out.push(doc);
        }
        // share straight away if asked
        const shareWith = JSON.parse(req.body.shareWith || "[]"), groupIds = JSON.parse(req.body.groups || "[]");
        if (shareWith.length || groupIds.length) for (const doc of out) await shareDoc(doc, me, shareWith, groupIds, req.body.permission, String(req.body.message || ""));
        return res.status(201).json({ success: true, message: `${out.length} file${out.length === 1 ? "" : "s"} uploaded.`, data: out.map((d) => d._id) });
    } catch (err) { return fail(res, err); }
};

// POST /files/:id/version (multipart "file") — replace with a new version, keeping the old one
export const uploadVersion = async (req, res) => {
    try {
        const { f, me } = await loadFile(req, req.params.id, "edit");
        if (!req.file) throw httpError(400, "Choose the new version.");
        const gridId = await storeBuffer(req.file, me);
        f.versions.push({ gridId: f.gridId, size: f.size, mime: f.mime, name: f.name, by: f.owner, at: f.updatedAt });
        f.gridId = gridId; f.size = req.file.size; f.mime = req.file.mimetype;
        log(f, me, "new version", req.file.originalname);
        await f.save();
        [f.owner, ...(f.shares || []).map((s) => s.employee)].map(idStr).filter((id) => id !== me).forEach((id) => notify(id, "File updated", `A new version of “${f.name}” was uploaded.`, "Document", "/files"));
        return res.status(200).json({ success: true, message: `New version of “${f.name}” uploaded.` });
    } catch (err) { return fail(res, err); }
};

/* ---------------- sharing ---------------- */
const shareDoc = async (doc, me, people = [], groupIds = [], permission = "view", message = "") => {
    const allowed = await allowedContactIds(me);
    const perm = permission === "edit" ? "edit" : "view";
    const okPeople = people.map(String).filter((id) => allowed.has(id) && id !== idStr(doc.owner));
    const refused = people.map(String).filter((id) => !allowed.has(id) && id !== idStr(doc.owner));
    const mine = await myGroups(me);
    const okGroups = groupIds.map(String).filter((g) => mine.includes(g));
    okPeople.forEach((id) => {
        const ex = doc.shares.find((s) => idStr(s.employee) === id);
        if (ex) ex.permission = perm; else doc.shares.push({ employee: id, permission: perm, sharedBy: me });
    });
    okGroups.forEach((g) => {
        const ex = doc.groups.find((x) => idStr(x.group) === g);
        if (ex) ex.permission = perm; else doc.groups.push({ group: g, permission: perm, sharedBy: me });
    });
    const me_ = await employeeModel.findById(me).select("firstName lastName").lean();
    const what = doc.size !== undefined && doc.gridId ? `the file “${doc.name}”` : `the folder “${doc.name}”`;
    const text = `${me_?.firstName || "Someone"} shared ${what} with you${message ? `: ${message.slice(0, 100)}` : "."}`;
    okPeople.forEach((id) => notify(id, "Shared with you", text, "Document", "/files?view=shared"));
    if (okGroups.length) {
        const groupsFull = await conversationModel.find({ _id: { $in: okGroups } }).select("participants name").lean();
        new Set(groupsFull.flatMap((g) => g.participants.map(idStr))).forEach((id) => { if (id !== me && !okPeople.includes(id)) notify(id, "Shared with your group", text, "Document", "/files?view=shared"); });
    }
    if (doc.activity) log(doc, me, "shared", [...okPeople.length ? [`${okPeople.length} people`] : [], ...okGroups.length ? [`${okGroups.length} group${okGroups.length === 1 ? "" : "s"}`] : []].join(", "));
    await doc.save();
    return { people: okPeople.length, groups: okGroups.length, refused: refused.length };
};

// POST /files/:id/share { people: [ids], groups: [ids], permission, message }
export const shareFile = async (req, res) => {
    try {
        const { f, me, access } = await loadFile(req, req.params.id, "view");
        if (access !== "owner" && access !== "edit") throw httpError(403, "Only the owner or an editor can share this file.");
        const r = await shareDoc(f, me, req.body?.people || [], req.body?.groups || [], req.body?.permission, String(req.body?.message || ""));
        if (!r.people && !r.groups) throw httpError(400, r.refused ? "You can only share with your team and the officials above you." : "Pick people or a group to share with.");
        return res.status(200).json({ success: true, message: `Shared with ${[r.people && `${r.people} ${r.people === 1 ? "person" : "people"}`, r.groups && `${r.groups} group${r.groups === 1 ? "" : "s"}`].filter(Boolean).join(" and ")}.${r.refused ? ` ${r.refused} skipped (outside your team).` : ""}` });
    } catch (err) { return fail(res, err); }
};
// POST /files/:id/unshare { employee? , group? } — owner removes access (or you remove yourself)
export const unshareFile = async (req, res) => {
    try {
        const { f, me, access } = await loadFile(req, req.params.id, "view");
        const { employee, group } = req.body || {};
        const self = employee && String(employee) === me;
        if (access !== "owner" && !self) throw httpError(403, "Only the owner can remove access.");
        if (employee) f.shares = f.shares.filter((s) => idStr(s.employee) !== String(employee));
        if (group) f.groups = f.groups.filter((g) => idStr(g.group) !== String(group));
        log(f, me, self ? "left" : "removed access");
        await f.save();
        return res.status(200).json({ success: true, message: self ? "Removed from your shared files." : "Access removed." });
    } catch (err) { return fail(res, err); }
};

/* ---------------- organise ---------------- */
// PUT /files/:id { name?, description?, tags?, folder? }
export const updateFile = async (req, res) => {
    try {
        const { f, me, access } = await loadFile(req, req.params.id, "edit");
        const b = req.body || {};
        if (b.name !== undefined) { const n = safeName(b.name); if (n !== f.name) { log(f, me, "renamed", n); f.name = n; } }
        if (b.description !== undefined) f.description = String(b.description).slice(0, 500);
        if (Array.isArray(b.tags)) f.tags = b.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 8);
        if (b.folder !== undefined) {
            if (access !== "owner") throw httpError(403, "Only the owner can move this file.");
            if (b.folder && !(await FileFolder.exists({ _id: b.folder, owner: me, trashedAt: null }))) throw httpError(400, "Pick one of your folders.");
            f.folder = b.folder || null; log(f, me, "moved");
        }
        await f.save();
        return res.status(200).json({ success: true, message: "Saved." });
    } catch (err) { return fail(res, err); }
};
export const starFile = async (req, res) => {
    try {
        const { f, me } = await loadFile(req, req.params.id);
        const on = !f.starredBy.some((s) => idStr(s) === me);
        f.starredBy = on ? [...f.starredBy, me] : f.starredBy.filter((s) => idStr(s) !== me);
        await f.save();
        return res.status(200).json({ success: true, message: on ? "Starred." : "Removed from starred.", data: { starred: on } });
    } catch (err) { return fail(res, err); }
};
// DELETE /files/:id — to Trash; DELETE /files/:id?permanent=1 — gone for good (from Trash)
export const deleteFile = async (req, res) => {
    try {
        const { f, me } = await loadFile(req, req.params.id, "owner");
        if (req.query.permanent) {
            await Promise.all([f.gridId, ...(f.versions || []).map((v) => v.gridId)].map((g) => bucket().delete(g).catch(() => {})));
            await f.deleteOne();
            return res.status(200).json({ success: true, message: `“${f.name}” deleted for good.` });
        }
        f.trashedAt = new Date(); log(f, me, "moved to trash");
        await f.save();
        return res.status(200).json({ success: true, message: `“${f.name}” moved to Trash.` });
    } catch (err) { return fail(res, err); }
};
export const restoreFile = async (req, res) => {
    try {
        const { f, me } = await loadFile(req, req.params.id, "owner");
        f.trashedAt = null;
        if (f.folder && !(await FileFolder.exists({ _id: f.folder, trashedAt: null }))) f.folder = null;
        log(f, me, "restored"); await f.save();
        return res.status(200).json({ success: true, message: `“${f.name}” restored.` });
    } catch (err) { return fail(res, err); }
};

/* ---------------- folders ---------------- */
export const createFolder = async (req, res) => {
    try {
        const me = idStr(req.user.id);
        const name = String(req.body?.name || "").trim().slice(0, 80);
        if (!name) throw httpError(400, "Name the folder.");
        const parent = mongoose.isValidObjectId(req.body?.parent) ? req.body.parent : null;
        if (parent && !(await FileFolder.exists({ _id: parent, owner: me }))) throw httpError(400, "You can only add folders inside your own folders.");
        const f = await FileFolder.create({ name, owner: me, parent, color: req.body?.color || "#1e40af" });
        return res.status(201).json({ success: true, message: `Folder “${name}” created.`, data: f });
    } catch (err) { return fail(res, err); }
};
const loadFolder = async (req, id) => {
    if (!mongoose.isValidObjectId(id)) throw httpError(404, "Folder not found.");
    const f = await FileFolder.findById(id);
    if (!f) throw httpError(404, "Folder not found.");
    if (idStr(f.owner) !== idStr(req.user.id)) throw httpError(403, "Only the owner can change this folder.");
    return f;
};
export const updateFolder = async (req, res) => {
    try {
        const f = await loadFolder(req, req.params.id);
        if (req.body?.name) f.name = String(req.body.name).trim().slice(0, 80);
        if (req.body?.color) f.color = String(req.body.color).slice(0, 20);
        await f.save();
        return res.status(200).json({ success: true, message: "Folder saved." });
    } catch (err) { return fail(res, err); }
};
// DELETE /files/folders/:id — folder and everything in it go to Trash
export const deleteFolder = async (req, res) => {
    try {
        const f = await loadFolder(req, req.params.id);
        if (req.query.permanent) {
            const files = await SharedFile.find({ folder: f._id });
            for (const x of files) { await Promise.all([x.gridId, ...(x.versions || []).map((v) => v.gridId)].map((g) => bucket().delete(g).catch(() => {}))); await x.deleteOne(); }
            await f.deleteOne();
            return res.status(200).json({ success: true, message: `Folder “${f.name}” deleted for good.` });
        }
        f.trashedAt = new Date(); await f.save();
        await SharedFile.updateMany({ folder: f._id, trashedAt: null }, { $set: { trashedAt: new Date() } });
        return res.status(200).json({ success: true, message: `Folder “${f.name}” moved to Trash.` });
    } catch (err) { return fail(res, err); }
};
export const restoreFolder = async (req, res) => {
    try {
        const f = await loadFolder(req, req.params.id);
        f.trashedAt = null; await f.save();
        await SharedFile.updateMany({ folder: f._id }, { $set: { trashedAt: null } });
        return res.status(200).json({ success: true, message: `Folder “${f.name}” restored.` });
    } catch (err) { return fail(res, err); }
};
export const shareFolder = async (req, res) => {
    try {
        const f = await loadFolder(req, req.params.id);
        const r = await shareDoc(f, idStr(req.user.id), req.body?.people || [], req.body?.groups || [], req.body?.permission, String(req.body?.message || ""));
        if (!r.people && !r.groups) throw httpError(400, r.refused ? "You can only share with your team and the officials above you." : "Pick people or a group to share with.");
        return res.status(200).json({ success: true, message: `Folder shared — everything in it is now visible to them.` });
    } catch (err) { return fail(res, err); }
};

// GET /files/share-targets — people you may share with, and your groups
export const shareTargets = async (req, res) => {
    try {
        const me = idStr(req.user.id);
        const allowed = await allowedContactIds(me);
        const [people, groups] = await Promise.all([
            employeeModel.find({ _id: { $in: [...allowed] } }).select(PERSON).sort({ firstName: 1 }).lean(),
            conversationModel.find({ type: "group", participants: me }).select("name participants").lean(),
        ]);
        return res.status(200).json({ success: true, data: { people, groups: groups.map((g) => ({ _id: g._id, name: g.name, members: g.participants.length })) } });
    } catch (err) { return fail(res, err); }
};
