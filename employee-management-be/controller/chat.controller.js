import mongoose from "mongoose";
import conversationModel from "../models/conversationModel.js";
import messageModel from "../models/messageModel.js";
import employeeModel from "../models/employeeModel.js";
import { allowedContactIds } from "../utils/chatAccess.js";

// Team chat: direct and group conversations, replies, reactions, edit / delete, files, read
// receipts, typing and presence. The app polls /chat/updates (works on serverless hosts where
// websockets aren't available). Only participants can read a conversation or its files.

const PERSON = "employeeId firstName lastName designation department profileImage lastSeenAt";
const EDIT_WINDOW_MS = 60 * 60 * 1000;          // edit your message within an hour
const DELETE_ALL_WINDOW_MS = 24 * 60 * 60 * 1000; // delete for everyone within a day
const MAX_FILE = 10 * 1024 * 1024;
const fail = (res, err, status = 500) => res.status(err.status || status).json({ success: false, message: err.message });
const httpError = (status, message) => Object.assign(new Error(message), { status });
const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "chatFiles" });
const idStr = (x) => String(x?._id || x || "");
const safeName = (s) => String(s || "file").replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, "_").slice(0, 120);
const ALLOWED = /^(image\/(png|jpe?g|gif|webp|heic|heif)|application\/pdf|application\/(msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation))|application\/vnd\.ms-(excel|powerpoint)|text\/(plain|csv)|application\/zip)$/;

const memberOf = (conv, me) => {
    let m = conv.members.find((x) => idStr(x.user) === me);
    if (!m) { conv.members.push({ user: me }); m = conv.members[conv.members.length - 1]; }
    return m;
};

const loadConv = async (id, me) => {
    if (!mongoose.isValidObjectId(id)) throw httpError(404, "Conversation not found.");
    const conv = await conversationModel.findOne({ _id: id, participants: me });
    if (!conv) throw httpError(404, "Conversation not found.");
    return conv;
};

const previewOf = (m) => (m.deletedAt ? "This message was deleted" : m.type === "image" ? `📷 ${m.text || "Photo"}` : m.type === "file" ? `📎 ${m.file?.name || "File"}` : m.text);

// sent → delivered (every other member's app has fetched since) → read (every other member has read since)
const statusFor = (createdAt, senderId, members) => {
    const others = members.filter((m) => idStr(m.user) !== idStr(senderId));
    if (!others.length) return "read";
    const t = new Date(createdAt).getTime();
    if (others.every((m) => m.lastReadAt && new Date(m.lastReadAt).getTime() >= t)) return "read";
    if (others.every((m) => (m.lastFetchAt && new Date(m.lastFetchAt).getTime() >= t) || (m.lastReadAt && new Date(m.lastReadAt).getTime() >= t))) return "delivered";
    return "sent";
};

// Mark read; bump the conversation's updatedAt only when this read newly covers the last
// message (so the sender's list picks up the blue ticks without a write on every poll).
const readNow = async (conv, mine, now = new Date()) => {
    const bump = !!(conv.lastMessage?.at && (!mine.lastReadAt || new Date(mine.lastReadAt) < new Date(conv.lastMessage.at)) && idStr(conv.lastMessage.sender) !== idStr(mine.user));
    mine.lastReadAt = now; mine.lastFetchAt = now;
    await conv.save({ timestamps: bump });
};

const readsOf = (conv) => conv.members.map((m) => ({ user: idStr(m.user), lastReadAt: m.lastReadAt, lastFetchAt: m.lastFetchAt }));

const shapeMessage = (m, me) => {
    const o = m.toObject ? m.toObject() : m;
    const deleted = !!o.deletedAt;
    const grouped = new Map();
    (o.reactions || []).forEach((r) => { const g = grouped.get(r.emoji) || { emoji: r.emoji, count: 0, mine: false, users: [] }; g.count++; g.users.push(idStr(r.user)); if (idStr(r.user) === me) g.mine = true; grouped.set(r.emoji, g); });
    const reply = o.replyTo && typeof o.replyTo === "object" ? {
        _id: o.replyTo._id, sender: o.replyTo.sender, type: o.replyTo.type,
        text: o.replyTo.deletedAt ? "This message was deleted" : o.replyTo.type === "image" ? o.replyTo.text || "📷 Photo" : o.replyTo.type === "file" ? `📎 ${o.replyTo.file?.name || "File"}` : o.replyTo.text,
    } : null;
    return {
        _id: o._id, conversationId: o.conversationId, sender: o.sender, type: o.type, mine: idStr(o.sender) === me,
        text: deleted ? "" : o.text, deleted, forwarded: !!o.forwarded,
        file: !deleted && o.file?.fileId ? { name: o.file.name, mime: o.file.mime, size: o.file.size, url: `/chat/files/${o._id}` } : null,
        replyTo: reply, reactions: deleted ? [] : [...grouped.values()],
        starred: (o.starredBy || []).some((u) => idStr(u) === me),
        editedAt: o.editedAt, createdAt: o.createdAt, updatedAt: o.updatedAt,
    };
};

const MSG_POPULATE = [{ path: "sender", select: "firstName lastName profileImage" }, { path: "replyTo", select: "sender type text file deletedAt", populate: { path: "sender", select: "firstName lastName" } }];

const unreadIn = async (conv, me) => {
    const m = conv.members.find((x) => idStr(x.user) === me) || {};
    const since = [m.lastReadAt, m.clearedAt].filter(Boolean).map((d) => new Date(d).getTime());
    const filter = { conversationId: conv._id, sender: { $ne: me }, type: { $ne: "system" }, deletedFor: { $ne: me }, deletedAt: null };
    if (since.length) filter.createdAt = { $gt: new Date(Math.max(...since)) };
    return messageModel.countDocuments(filter);
};

const shapeConversation = async (conv, me) => {
    const c = conv.toObject ? conv.toObject() : conv;
    const mine = c.members.find((x) => idStr(x.user) === me) || {};
    const others = (c.participants || []).filter((p) => idStr(p) !== me);
    const now = Date.now();
    const typing = c.members.filter((m) => idStr(m.user) !== me && m.typingUntil && new Date(m.typingUntil).getTime() > now).map((m) => idStr(m.user));
    const cleared = mine.clearedAt && c.lastMessage?.at && new Date(c.lastMessage.at) <= new Date(mine.clearedAt);
    return {
        _id: c._id, type: c.type, name: c.name, description: c.description,
        participants: c.participants, others, isAdmin: (c.admins || []).some((a) => idStr(a) === me), admins: (c.admins || []).map(idStr),
        lastMessage: c.lastMessage?.at && !cleared ? { ...c.lastMessage, mine: idStr(c.lastMessage.sender) === me, status: idStr(c.lastMessage.sender) === me ? statusFor(c.lastMessage.at, me, c.members) : null } : null,
        unread: await unreadIn(conv, me),
        pinned: !!mine.pinned, muted: !!mine.muted, archived: !!mine.archived,
        typing, createdAt: c.createdAt, updatedAt: c.updatedAt,
    };
};

const touchPresence = async (me) => {
    const cut = new Date(Date.now() - 20000);
    await employeeModel.updateOne({ _id: me, $or: [{ lastSeenAt: null }, { lastSeenAt: { $lt: cut } }] }, { $set: { lastSeenAt: new Date() } });
};

const systemMessage = async (conv, text) => {
    const msg = await messageModel.create({ conversationId: conv._id, type: "system", text });
    conv.lastMessage = { text, type: "system", sender: null, at: msg.createdAt, messageId: msg._id };
    return msg;
};
const nameOf = (p) => `${p?.firstName || ""} ${p?.lastName || ""}`.trim() || "Someone";

/* ---------------- people you can message ---------------- */
export const chatContacts = async (req, res) => {
    try {
        const allowed = await allowedContactIds(req.user.id);
        const people = await employeeModel.find({ _id: { $in: [...allowed] } }).select(PERSON).sort({ firstName: 1, lastName: 1 }).lean();
        return res.status(200).json({ success: true, data: people });
    } catch (err) { return fail(res, err); }
};

/* ---------------- conversation list ---------------- */
export const listConversations = async (req, res) => {
    try {
        const me = idStr(req.user.id);
        await touchPresence(me);
        const convs = await conversationModel.find({ participants: me }).populate("participants", PERSON).sort({ updatedAt: -1 }).limit(300);
        const visible = convs.filter((c) => c.type === "group" || c.lastMessage?.at || idStr(c.createdBy) === me);
        const data = await Promise.all(visible.map((c) => shapeConversation(c, me)));
        return res.status(200).json({ success: true, data, serverTime: new Date() });
    } catch (err) { return fail(res, err); }
};

/* ---------------- start a chat: { participantId } → direct, { name, participantIds } → group ---------------- */
export const createConversation = async (req, res) => {
    try {
        const me = idStr(req.user.id);
        const { participantId, participantIds, name, description } = req.body || {};
        if (participantId) {
            if (participantId === me) throw httpError(400, "Pick someone other than yourself.");
            const other = await employeeModel.findOne({ _id: participantId, status: "Active" }).select("_id");
            if (!other) throw httpError(404, "That person isn't available.");
            if (!(await allowedContactIds(me)).has(idStr(participantId))) throw httpError(403, "You can message your team and the officials above you.");
            const key = [me, idStr(participantId)].sort().join(":");
            let conv = await conversationModel.findOne({ directKey: key });
            if (!conv) {
                try {
                    conv = await conversationModel.create({ type: "direct", participants: [me, participantId], createdBy: me, directKey: key, members: [{ user: me }, { user: participantId }] });
                } catch (e) {
                    conv = await conversationModel.findOne({ directKey: key }); // created at the same moment by the other person
                }
            }
            await conv.populate("participants", PERSON);
            return res.status(200).json({ success: true, data: await shapeConversation(conv, me) });
        }
        const ids = [...new Set((Array.isArray(participantIds) ? participantIds : []).map(String).filter((x) => x !== me))];
        if (!String(name || "").trim()) throw httpError(400, "Give the group a name.");
        if (!ids.length) throw httpError(400, "Add at least one person to the group.");
        const allowedForGroup = await allowedContactIds(me);
        if (ids.some((x) => !allowedForGroup.has(x))) throw httpError(403, "You can only add your team and the officials above you to a group.");
        const people = await employeeModel.find({ _id: { $in: ids }, status: "Active" }).select("_id firstName lastName");
        const meDoc = await employeeModel.findById(me).select("firstName lastName");
        const all = [me, ...people.map((p) => idStr(p._id))];
        const conv = new conversationModel({ type: "group", name: String(name).trim().slice(0, 80), description: String(description || "").slice(0, 300), participants: all, admins: [me], createdBy: me, members: all.map((u) => ({ user: u })) });
        await systemMessage(conv, `${nameOf(meDoc)} created the group “${conv.name}”`);
        memberOf(conv, me).lastReadAt = new Date();
        await conv.save();
        await conv.populate("participants", PERSON);
        return res.status(201).json({ success: true, data: await shapeConversation(conv, me) });
    } catch (err) { return fail(res, err); }
};

/* ---------------- one conversation: details, shared files, starred ---------------- */
export const getConversation = async (req, res) => {
    try {
        const me = idStr(req.user.id);
        const conv = await loadConv(req.params.id, me);
        await conv.populate("participants", PERSON);
        const media = await messageModel.find({ conversationId: conv._id, type: { $in: ["image", "file"] }, deletedAt: null, deletedFor: { $ne: me } }).sort({ createdAt: -1 }).limit(60).populate(MSG_POPULATE);
        const starred = await messageModel.find({ conversationId: conv._id, starredBy: me, deletedAt: null }).sort({ createdAt: -1 }).limit(50).populate(MSG_POPULATE);
        return res.status(200).json({ success: true, data: { ...(await shapeConversation(conv, me)), media: media.map((m) => shapeMessage(m, me)), starred: starred.map((m) => shapeMessage(m, me)) } });
    } catch (err) { return fail(res, err); }
};

/* ---------------- message history (newest page first, ?before=ISO for older) ---------------- */
export const getMessages = async (req, res) => {
    try {
        const me = idStr(req.user.id);
        const conv = await loadConv(req.params.id, me);
        const mine = memberOf(conv, me);
        const limit = Math.min(Number(req.query.limit) || 40, 100);
        const filter = { conversationId: conv._id, deletedFor: { $ne: me } };
        const created = {};
        if (mine.clearedAt) created.$gt = mine.clearedAt;
        if (req.query.before) created.$lt = new Date(req.query.before);
        if (Object.keys(created).length) filter.createdAt = created;
        const page = await messageModel.find(filter).sort({ createdAt: -1 }).limit(limit + 1).populate(MSG_POPULATE);
        const hasMore = page.length > limit;
        const msgs = page.slice(0, limit).reverse();

        if (!req.query.before) await readNow(conv, mine);
        return res.status(200).json({ success: true, data: { messages: msgs.map((m) => shapeMessage(m, me)), hasMore, reads: readsOf(conv) }, serverTime: new Date() });
    } catch (err) { return fail(res, err); }
};

/* ---------------- send: { text, replyTo, forwardOf } or multipart with "file" ---------------- */
export const sendMessage = async (req, res) => {
    try {
        const me = idStr(req.user.id);
        const conv = await loadConv(req.params.id, me);
        if (conv.type === "direct") {
            const other = conv.participants.map(idStr).find((x) => x !== me);
            if (other && !(await allowedContactIds(me)).has(other)) throw httpError(403, "You can no longer message this person — they're outside your team.");
        }
        const text = String(req.body?.text || "").slice(0, 4000);
        let type = "text", file;
        let forwarded = false;

        if (req.body?.forwardOf) {
            const src = await messageModel.findById(req.body.forwardOf);
            if (!src || src.deletedAt || !(await conversationModel.exists({ _id: src.conversationId, participants: me }))) throw httpError(404, "Message to forward not found.");
            type = src.type === "system" ? "text" : src.type; forwarded = true;
            file = src.file?.fileId ? { ...src.file.toObject() } : undefined;
            const created = await messageModel.create({ conversationId: conv._id, sender: me, type, text: src.text, file, forwarded });
            return finishSend(req, res, conv, me, created);
        }

        if (req.file) {
            if (req.file.size > MAX_FILE) throw httpError(400, "Files can be up to 10 MB.");
            if (!ALLOWED.test(req.file.mimetype)) throw httpError(400, "That file type can't be sent. Try a photo, PDF, Office document, text or zip file.");
            const fileId = await new Promise((resolve, reject) => {
                const up = bucket().openUploadStream(`${conv._id}/${Date.now()}-${safeName(req.file.originalname)}`, { contentType: req.file.mimetype, metadata: { conversationId: conv._id, sender: me } });
                up.on("error", reject); up.on("finish", () => resolve(up.id)); up.end(req.file.buffer);
            });
            type = /^image\//.test(req.file.mimetype) ? "image" : "file";
            file = { fileId, name: req.file.originalname, mime: req.file.mimetype, size: req.file.size };
        } else if (!text.trim()) throw httpError(400, "Type a message first.");

        let replyTo = null;
        if (req.body?.replyTo && mongoose.isValidObjectId(req.body.replyTo)) {
            replyTo = (await messageModel.exists({ _id: req.body.replyTo, conversationId: conv._id })) ? req.body.replyTo : null;
        }
        const created = await messageModel.create({ conversationId: conv._id, sender: me, type, text: text.trim(), file, replyTo });
        return finishSend(req, res, conv, me, created);
    } catch (err) { return fail(res, err); }
};

const finishSend = async (req, res, conv, me, created) => {
    conv.lastMessage = { text: previewOf(created), type: created.type, sender: me, at: created.createdAt, messageId: created._id };
    const mine = memberOf(conv, me);
    mine.lastReadAt = created.createdAt; mine.typingUntil = null;
    conv.members.forEach((m) => { m.archived = false; });
    await conv.save();
    await created.populate(MSG_POPULATE);
    return res.status(201).json({ success: true, data: { message: shapeMessage(created, me), reads: readsOf(conv) } });
};

/* ---------------- edit / delete / react / star ---------------- */
const loadMessage = async (id, me) => {
    if (!mongoose.isValidObjectId(id)) throw httpError(404, "Message not found.");
    const msg = await messageModel.findById(id);
    if (!msg || !(await conversationModel.exists({ _id: msg.conversationId, participants: me }))) throw httpError(404, "Message not found.");
    return msg;
};

const refreshPreview = async (conversationId, msg) => {
    const conv = await conversationModel.findById(conversationId);
    if (conv && idStr(conv.lastMessage?.messageId) === idStr(msg._id)) {
        conv.lastMessage.text = previewOf(msg);
        conv.markModified("lastMessage");
        await conv.save();
    } else if (conv) {
        await conversationModel.updateOne({ _id: conv._id }, { $set: { updatedAt: new Date() } });
    }
};

export const editMessage = async (req, res) => {
    try {
        const me = idStr(req.user.id);
        const msg = await loadMessage(req.params.id, me);
        if (idStr(msg.sender) !== me) throw httpError(403, "You can only edit your own messages.");
        if (msg.deletedAt || msg.type !== "text") throw httpError(400, "This message can't be edited.");
        if (Date.now() - new Date(msg.createdAt).getTime() > EDIT_WINDOW_MS) throw httpError(400, "Messages can be edited for an hour after sending.");
        const text = String(req.body?.text || "").trim().slice(0, 4000);
        if (!text) throw httpError(400, "A message can't be empty.");
        msg.text = text; msg.editedAt = new Date();
        await msg.save();
        await refreshPreview(msg.conversationId, msg);
        await msg.populate(MSG_POPULATE);
        return res.status(200).json({ success: true, data: shapeMessage(msg, me) });
    } catch (err) { return fail(res, err); }
};

// ?scope=everyone (your message, within a day) or ?scope=me (hide it just for you)
export const deleteMessage = async (req, res) => {
    try {
        const me = idStr(req.user.id);
        const msg = await loadMessage(req.params.id, me);
        if (req.query.scope === "everyone") {
            if (idStr(msg.sender) !== me) throw httpError(403, "You can only delete your own messages for everyone.");
            if (Date.now() - new Date(msg.createdAt).getTime() > DELETE_ALL_WINDOW_MS) throw httpError(400, "Messages can be deleted for everyone within a day of sending.");
            const fileId = msg.file?.fileId;
            msg.deletedAt = new Date(); msg.text = ""; msg.reactions = [];
            if (fileId) {
                const others = await messageModel.countDocuments({ _id: { $ne: msg._id }, "file.fileId": fileId, deletedAt: null }); // forwarded copies keep the file
                if (!others) await bucket().delete(fileId).catch(() => {});
                msg.file = undefined;
            }
            await msg.save();
            await refreshPreview(msg.conversationId, msg);
        } else {
            await messageModel.updateOne({ _id: msg._id }, { $addToSet: { deletedFor: me } });
        }
        return res.status(200).json({ success: true, message: "Message deleted." });
    } catch (err) { return fail(res, err); }
};

export const reactToMessage = async (req, res) => {
    try {
        const me = idStr(req.user.id);
        const msg = await loadMessage(req.params.id, me);
        if (msg.deletedAt || msg.type === "system") throw httpError(400, "Can't react to this message.");
        const emoji = String(req.body?.emoji || "").slice(0, 8);
        const had = msg.reactions.find((r) => idStr(r.user) === me);
        msg.reactions = msg.reactions.filter((r) => idStr(r.user) !== me);
        if (emoji && (!had || had.emoji !== emoji)) msg.reactions.push({ user: me, emoji });
        await msg.save();
        await conversationModel.updateOne({ _id: msg.conversationId }, { $set: { updatedAt: new Date() } });
        await msg.populate(MSG_POPULATE);
        return res.status(200).json({ success: true, data: shapeMessage(msg, me) });
    } catch (err) { return fail(res, err); }
};

export const starMessage = async (req, res) => {
    try {
        const me = idStr(req.user.id);
        const msg = await loadMessage(req.params.id, me);
        const starred = msg.starredBy.some((u) => idStr(u) === me);
        await messageModel.updateOne({ _id: msg._id }, starred ? { $pull: { starredBy: me } } : { $addToSet: { starredBy: me } });
        return res.status(200).json({ success: true, data: { starred: !starred } });
    } catch (err) { return fail(res, err); }
};

/* ---------------- read / typing ---------------- */
export const markRead = async (req, res) => {
    try {
        const me = idStr(req.user.id);
        const conv = await loadConv(req.params.id, me);
        await readNow(conv, memberOf(conv, me));
        return res.status(200).json({ success: true });
    } catch (err) { return fail(res, err); }
};

export const setTyping = async (req, res) => {
    try {
        const me = idStr(req.user.id);
        const until = req.body?.typing === false ? null : new Date(Date.now() + 8000);
        const r = await conversationModel.updateOne({ _id: req.params.id, participants: me }, { $set: { "members.$[m].typingUntil": until } }, { arrayFilters: [{ "m.user": new mongoose.Types.ObjectId(me) }], timestamps: false });
        if (!r.matchedCount) throw httpError(404, "Conversation not found.");
        return res.status(200).json({ success: true });
    } catch (err) { return fail(res, err); }
};

/* ---------------- settings & group management ---------------- */
// body: { pinned, muted, archived, clear, name, description, addIds, removeId, makeAdmin, leave }
export const updateConversation = async (req, res) => {
    try {
        const me = idStr(req.user.id);
        const conv = await loadConv(req.params.id, me);
        const b = req.body || {};
        const mine = memberOf(conv, me);
        let touched = false;
        if (typeof b.pinned === "boolean") mine.pinned = b.pinned;
        if (typeof b.muted === "boolean") mine.muted = b.muted;
        if (typeof b.archived === "boolean") mine.archived = b.archived;
        if (b.clear) mine.clearedAt = new Date();

        const meDoc = await employeeModel.findById(me).select("firstName lastName");
        const isAdmin = conv.admins.some((a) => idStr(a) === me);
        if (conv.type === "group") {
            if (b.name !== undefined || b.description !== undefined) {
                if (!isAdmin) throw httpError(403, "Only group admins can change the group details.");
                if (b.name !== undefined && String(b.name).trim() && String(b.name).trim() !== conv.name) { conv.name = String(b.name).trim().slice(0, 80); await systemMessage(conv, `${nameOf(meDoc)} renamed the group to “${conv.name}”`); touched = true; }
                if (b.description !== undefined) conv.description = String(b.description).slice(0, 300);
            }
            if (Array.isArray(b.addIds) && b.addIds.length) {
                if (!isAdmin) throw httpError(403, "Only group admins can add people.");
                const allowedToAdd = await allowedContactIds(me);
                if (b.addIds.some((x) => !allowedToAdd.has(String(x)))) throw httpError(403, "You can only add your team and the officials above you.");
                const add = await employeeModel.find({ _id: { $in: b.addIds }, status: "Active" }).select("_id firstName lastName");
                const fresh = add.filter((p) => !conv.participants.some((x) => idStr(x) === idStr(p._id)));
                fresh.forEach((p) => { conv.participants.push(p._id); memberOf(conv, idStr(p._id)); });
                if (fresh.length) { await systemMessage(conv, `${nameOf(meDoc)} added ${fresh.map(nameOf).join(", ")}`); touched = true; }
            }
            if (b.removeId) {
                if (!isAdmin) throw httpError(403, "Only group admins can remove people.");
                const who = await employeeModel.findById(b.removeId).select("firstName lastName");
                conv.participants = conv.participants.filter((x) => idStr(x) !== idStr(b.removeId));
                conv.admins = conv.admins.filter((x) => idStr(x) !== idStr(b.removeId));
                conv.members = conv.members.filter((x) => idStr(x.user) !== idStr(b.removeId));
                await systemMessage(conv, `${nameOf(meDoc)} removed ${nameOf(who)}`); touched = true;
            }
            if (b.removeAdmin) {
                if (!isAdmin) throw httpError(403, "Only group admins can do that.");
                if (conv.admins.length > 1) conv.admins = conv.admins.filter((x) => idStr(x) !== idStr(b.removeAdmin));
            }
            if (b.makeAdmin) {
                if (!isAdmin) throw httpError(403, "Only group admins can do that.");
                if (conv.participants.some((x) => idStr(x) === idStr(b.makeAdmin)) && !conv.admins.some((x) => idStr(x) === idStr(b.makeAdmin))) conv.admins.push(b.makeAdmin);
            }
            if (b.leave) {
                conv.participants = conv.participants.filter((x) => idStr(x) !== me);
                conv.admins = conv.admins.filter((x) => idStr(x) !== me);
                conv.members = conv.members.filter((x) => idStr(x.user) !== me);
                if (!conv.admins.length && conv.participants.length) conv.admins = [conv.participants[0]]; // someone keeps admin rights
                await systemMessage(conv, `${nameOf(meDoc)} left`); touched = true;
                await conv.save();
                return res.status(200).json({ success: true, data: { left: true } });
            }
        }
        await conv.save({ timestamps: touched });
        await conv.populate("participants", PERSON);
        return res.status(200).json({ success: true, data: await shapeConversation(conv, me) });
    } catch (err) { return fail(res, err); }
};

/* ---------------- polling: what changed since ?since=ISO (and the open chat's messages) ---------------- */
let lastDelivered = new Map(); // me → time we last marked their chats delivered (throttle)
export const chatUpdates = async (req, res) => {
    try {
        const me = idStr(req.user.id);
        const meId = new mongoose.Types.ObjectId(me);
        const now = new Date();
        const since = req.query.since ? new Date(req.query.since) : new Date(now.getTime() - 60000);

        // everything fetched counts as "delivered" (throttled to one write per 10s per person)
        const deliver = (!lastDelivered.has(me) || now - lastDelivered.get(me) > 10000)
            ? (lastDelivered.set(me, now), lastDelivered.size > 5000 && (lastDelivered = new Map()),
                conversationModel.updateMany({ participants: me }, { $set: { "members.$[m].lastFetchAt": now } }, { arrayFilters: [{ "m.user": meId }], timestamps: false }))
            : null;

        // the open chat: new / edited / deleted messages, read state, who's typing
        const openPart = (async () => {
            if (!req.query.open || !mongoose.isValidObjectId(req.query.open)) return null;
            const conv = await conversationModel.findOne({ _id: req.query.open, participants: me });
            if (!conv) return null;
            const mine = memberOf(conv, me);
            const [msgs, hidden] = await Promise.all([
                messageModel.find({ conversationId: conv._id, updatedAt: { $gt: since }, deletedFor: { $ne: me }, ...(mine.clearedAt ? { createdAt: { $gt: mine.clearedAt } } : {}) }).sort({ createdAt: 1 }).limit(200).populate(MSG_POPULATE),
                messageModel.find({ conversationId: conv._id, updatedAt: { $gt: since }, deletedFor: me }).select("_id").lean(),
                req.query.visible === "1" ? readNow(conv, mine, now) : null,
            ]);
            const t = Date.now();
            return {
                _id: conv._id, messages: msgs.map((m) => shapeMessage(m, me)), hidden: hidden.map((h) => h._id), reads: readsOf(conv),
                typing: conv.members.filter((m) => idStr(m.user) !== me && m.typingUntil && new Date(m.typingUntil).getTime() > t).map((m) => idStr(m.user)),
            };
        })();

        // chats that changed, and presence / typing across all my chats
        const listPart = (async () => {
            const changed = await conversationModel.find({ participants: me, updatedAt: { $gt: since } }).populate("participants", PERSON).limit(100);
            return Promise.all(changed.map((c) => shapeConversation(c, me)));
        })();
        const allPart = (async () => {
            const all = await conversationModel.find({ participants: me }).select("participants members.typingUntil members.user").lean();
            const ids = [...new Set(all.flatMap((c) => c.participants.map(idStr)))].filter((x) => x !== me);
            const presence = await employeeModel.find({ _id: { $in: ids } }).select("lastSeenAt").lean();
            const t = Date.now();
            return {
                presence: Object.fromEntries(presence.map((p) => [idStr(p._id), p.lastSeenAt])),
                typing: Object.fromEntries(all.map((c) => [idStr(c._id), (c.members || []).filter((m) => idStr(m.user) !== me && m.typingUntil && new Date(m.typingUntil).getTime() > t).map((m) => idStr(m.user))]).filter(([, v]) => v.length)),
            };
        })();

        const [, , open, conversations, all, unreadTotal] = await Promise.all([touchPresence(me), deliver, openPart, listPart, allPart, req.query.counts === "0" ? null : unreadTotalOf(me)]);
        return res.status(200).json({ success: true, serverTime: now, data: { conversations, open, typing: all.typing, presence: all.presence, unreadTotal } });
    } catch (err) { return fail(res, err); }
};

const unreadTotalOf = async (me) => {
    const convs = await conversationModel.find({ participants: me }).select("members");
    const counts = await Promise.all(convs.filter((c) => !(c.members.find((m) => idStr(m.user) === me) || {}).muted).map((c) => unreadIn(c, me)));
    return counts.reduce((t, n) => t + n, 0);
};

// light call for the header badge on every page
export const chatUnread = async (req, res) => {
    try {
        const me = idStr(req.user.id);
        await touchPresence(me);
        return res.status(200).json({ success: true, data: { total: await unreadTotalOf(me) } });
    } catch (err) { return fail(res, err); }
};

/* ---------------- files ---------------- */
export const chatFile = async (req, res) => {
    try {
        const me = idStr(req.user.id);
        const msg = await loadMessage(req.params.messageId, me);
        if (!msg.file?.fileId || msg.deletedAt) throw httpError(404, "File not found.");
        res.set({ "Content-Type": msg.file.mime || "application/octet-stream", "Content-Disposition": `${req.query.download ? "attachment" : "inline"}; filename="${safeName(msg.file.name)}"`, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" });
        const stream = bucket().openDownloadStream(msg.file.fileId);
        stream.on("error", () => { if (!res.headersSent) res.status(404).json({ success: false, message: "File is missing." }); else res.end(); });
        return stream.pipe(res);
    } catch (err) { if (!res.headersSent) return fail(res, err); }
};

/* ---------------- search across my chats ---------------- */
export const searchMessages = async (req, res) => {
    try {
        const me = idStr(req.user.id);
        const q = String(req.query.q || "").trim();
        if (q.length < 2) return res.status(200).json({ success: true, data: [] });
        const convs = await conversationModel.find({ participants: me }).select("_id members").lean();
        const or = convs.map((c) => {
            const cleared = (c.members || []).find((m) => idStr(m.user) === me)?.clearedAt;
            return cleared ? { conversationId: c._id, createdAt: { $gt: cleared } } : { conversationId: c._id };
        });
        if (!or.length) return res.status(200).json({ success: true, data: [] });
        const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        const hits = await messageModel.find({ $or: or, deletedAt: null, deletedFor: { $ne: me }, type: { $ne: "system" }, $and: [{ $or: [{ text: rx }, { "file.name": rx }] }] }).sort({ createdAt: -1 }).limit(40).populate(MSG_POPULATE);
        return res.status(200).json({ success: true, data: hits.map((m) => shapeMessage(m, me)) });
    } catch (err) { return fail(res, err); }
};

/* ---------------- group administration ---------------- */
// Firm admins (Admin / HR) can see and manage every group, even ones they're not in.
const FIRM_ADMIN_ROLES = ["Admin", "HR"];
const isFirmAdmin = (req) => FIRM_ADMIN_ROLES.includes(req.user.role);

const removeConversation = async (conv) => {
    const files = await messageModel.find({ conversationId: conv._id, "file.fileId": { $ne: null } }).select("file.fileId").lean();
    for (const f of files) {
        const shared = await messageModel.countDocuments({ conversationId: { $ne: conv._id }, "file.fileId": f.file.fileId }); // forwarded elsewhere
        if (!shared) await bucket().delete(f.file.fileId).catch(() => {});
    }
    await messageModel.deleteMany({ conversationId: conv._id });
    await conversationModel.deleteOne({ _id: conv._id });
};

// DELETE /chat/conversations/:id — a group, by its admins or a firm admin; removes it for everyone.
export const deleteGroup = async (req, res) => {
    try {
        const me = idStr(req.user.id);
        if (!mongoose.isValidObjectId(req.params.id)) throw httpError(404, "Group not found.");
        const conv = await conversationModel.findById(req.params.id);
        if (!conv || conv.type !== "group") throw httpError(404, "Group not found.");
        const groupAdmin = conv.admins.some((a) => idStr(a) === me);
        if (!groupAdmin && !isFirmAdmin(req)) throw httpError(403, "Only the group's admins or HR / Admin can delete a group.");
        await removeConversation(conv);
        return res.status(200).json({ success: true, message: `Group “${conv.name}” deleted.` });
    } catch (err) { return fail(res, err); }
};

const shapeGroupForAdmin = async (conv) => {
    const c = conv.toObject ? conv.toObject() : conv;
    return {
        _id: c._id, name: c.name, description: c.description, createdAt: c.createdAt, createdBy: c.createdBy,
        participants: c.participants, admins: (c.admins || []).map(idStr), lastActivity: c.lastMessage?.at || c.updatedAt,
        messages: await messageModel.countDocuments({ conversationId: c._id, type: { $ne: "system" } }),
    };
};

// GET /chat/admin/groups — every group in the firm
export const adminListGroups = async (req, res) => {
    try {
        if (!isFirmAdmin(req)) throw httpError(403, "Only HR / Admin can manage all groups.");
        const groups = await conversationModel.find({ type: "group" }).populate("participants", PERSON).populate("createdBy", "firstName lastName").sort({ updatedAt: -1 });
        return res.status(200).json({ success: true, data: await Promise.all(groups.map(shapeGroupForAdmin)) });
    } catch (err) { return fail(res, err); }
};

// PUT /chat/admin/groups/:id { name, description, addIds, removeId, makeAdmin, removeAdmin }
export const adminUpdateGroup = async (req, res) => {
    try {
        if (!isFirmAdmin(req)) throw httpError(403, "Only HR / Admin can manage all groups.");
        if (!mongoose.isValidObjectId(req.params.id)) throw httpError(404, "Group not found.");
        const conv = await conversationModel.findById(req.params.id);
        if (!conv || conv.type !== "group") throw httpError(404, "Group not found.");
        const b = req.body || {};
        const meDoc = await employeeModel.findById(req.user.id).select("firstName lastName");
        const by = `${nameOf(meDoc)} (admin)`;
        if (b.name !== undefined && String(b.name).trim() && String(b.name).trim() !== conv.name) { conv.name = String(b.name).trim().slice(0, 80); await systemMessage(conv, `${by} renamed the group to “${conv.name}”`); }
        if (b.description !== undefined) conv.description = String(b.description).slice(0, 300);
        if (Array.isArray(b.addIds) && b.addIds.length) {
            const add = await employeeModel.find({ _id: { $in: b.addIds }, status: "Active" }).select("_id firstName lastName");
            const fresh = add.filter((p) => !conv.participants.some((x) => idStr(x) === idStr(p._id)));
            fresh.forEach((p) => { conv.participants.push(p._id); memberOf(conv, idStr(p._id)); });
            if (fresh.length) await systemMessage(conv, `${by} added ${fresh.map(nameOf).join(", ")}`);
        }
        if (b.removeId) {
            const who = await employeeModel.findById(b.removeId).select("firstName lastName");
            conv.participants = conv.participants.filter((x) => idStr(x) !== idStr(b.removeId));
            conv.admins = conv.admins.filter((x) => idStr(x) !== idStr(b.removeId));
            conv.members = conv.members.filter((x) => idStr(x.user) !== idStr(b.removeId));
            if (!conv.admins.length && conv.participants.length) conv.admins = [conv.participants[0]];
            await systemMessage(conv, `${by} removed ${nameOf(who)}`);
        }
        if (b.makeAdmin && conv.participants.some((x) => idStr(x) === idStr(b.makeAdmin)) && !conv.admins.some((x) => idStr(x) === idStr(b.makeAdmin))) conv.admins.push(b.makeAdmin);
        if (b.removeAdmin && conv.admins.length > 1) conv.admins = conv.admins.filter((x) => idStr(x) !== idStr(b.removeAdmin));
        await conv.save();
        await conv.populate("participants", PERSON);
        await conv.populate("createdBy", "firstName lastName");
        return res.status(200).json({ success: true, data: await shapeGroupForAdmin(conv) });
    } catch (err) { return fail(res, err); }
};
