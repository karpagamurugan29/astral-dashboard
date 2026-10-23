import mongoose from "mongoose";

// Files people keep and share with each other (one to one, or one to many through a chat group).
// The bytes live in GridFS ("sharedFiles"); this record holds who can see them and what happened.
const shareSchema = {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    permission: { type: String, enum: ["view", "edit"], default: "view" },
    sharedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    at: { type: Date, default: Date.now },
};
const groupShareSchema = {
    group: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation" },
    permission: { type: String, enum: ["view", "edit"], default: "view" },
    sharedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    at: { type: Date, default: Date.now },
};

const FolderSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 80 },
        owner: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true, index: true },
        parent: { type: mongoose.Schema.Types.ObjectId, ref: "FileFolder", default: null },
        color: { type: String, default: "#1e40af" },
        shares: [shareSchema],
        groups: [groupShareSchema],
        trashedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

const SharedFileSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 200 },
        size: { type: Number, default: 0 },
        mime: { type: String, default: "application/octet-stream" },
        gridId: { type: mongoose.Schema.Types.ObjectId, required: true },
        owner: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true, index: true },
        folder: { type: mongoose.Schema.Types.ObjectId, ref: "FileFolder", default: null, index: true },
        description: { type: String, default: "", maxlength: 500 },
        tags: [{ type: String, trim: true, maxlength: 24 }],
        shares: [shareSchema],
        groups: [groupShareSchema],
        starredBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "Employee" }],
        // earlier copies kept when a new version is uploaded
        versions: [{ gridId: mongoose.Schema.Types.ObjectId, size: Number, mime: String, name: String, by: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" }, at: { type: Date, default: Date.now } }],
        // who did what (newest last, capped)
        activity: [{ by: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" }, action: String, detail: { type: String, default: "" }, at: { type: Date, default: Date.now } }],
        downloads: { type: Number, default: 0 },
        lastOpenedAt: { type: Date, default: null },
        trashedAt: { type: Date, default: null, index: true },
    },
    { timestamps: true }
);
SharedFileSchema.index({ "shares.employee": 1 });
SharedFileSchema.index({ "groups.group": 1 });

export const FileFolder = mongoose.model("FileFolder", FolderSchema);
export default mongoose.model("SharedFile", SharedFileSchema);
