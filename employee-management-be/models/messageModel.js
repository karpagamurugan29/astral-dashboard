import mongoose from "mongoose";

const MessageSchema = new mongoose.Schema(
    {
        conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true, index: true },
        sender: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", default: null },
        type: { type: String, enum: ["text", "image", "file", "system"], default: "text" },
        text: { type: String, default: "", maxlength: 4000 },
        // attachments live privately in GridFS ("chatFiles") and are served after a membership check
        file: {
            fileId: { type: mongoose.Schema.Types.ObjectId, default: null },
            name: { type: String, default: "" },
            mime: { type: String, default: "" },
            size: { type: Number, default: 0 },
        },
        replyTo: { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null },
        forwarded: { type: Boolean, default: false },
        reactions: [{ _id: false, user: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" }, emoji: String }],
        editedAt: { type: Date, default: null },
        deletedAt: { type: Date, default: null },       // deleted for everyone
        deletedFor: [{ type: mongoose.Schema.Types.ObjectId, ref: "Employee" }],
        starredBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "Employee" }],
    },
    { timestamps: true }
);

MessageSchema.index({ conversationId: 1, createdAt: -1 });
MessageSchema.index({ text: "text" });

export default mongoose.model("Message", MessageSchema);
