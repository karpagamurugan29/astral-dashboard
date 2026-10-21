import mongoose from "mongoose";

// A chat: "direct" between two people, or a named "group". Per-person state (last read,
// pinned, muted, cleared, typing) lives on the conversation so the list loads in one query.
const ConversationSchema = new mongoose.Schema(
    {
        type: { type: String, enum: ["direct", "group"], required: true },
        name: { type: String, trim: true, default: "" },
        description: { type: String, trim: true, default: "" },
        participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "Employee", index: true }],
        admins: [{ type: mongoose.Schema.Types.ObjectId, ref: "Employee" }],
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
        // sorted pair "idA:idB" so a direct chat between two people is unique
        directKey: { type: String, default: undefined, index: { unique: true, sparse: true } },
        lastMessage: {
            text: { type: String, default: "" },
            type: { type: String, default: "text" },
            sender: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", default: null },
            at: { type: Date, default: null },
            messageId: { type: mongoose.Schema.Types.ObjectId, default: null },
        },
        members: [
            {
                _id: false,
                user: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
                lastReadAt: { type: Date, default: null },
                lastFetchAt: { type: Date, default: null },
                clearedAt: { type: Date, default: null },
                pinned: { type: Boolean, default: false },
                muted: { type: Boolean, default: false },
                archived: { type: Boolean, default: false },
                typingUntil: { type: Date, default: null },
            },
        ],
    },
    { timestamps: true }
);

ConversationSchema.index({ participants: 1, updatedAt: -1 });

export default mongoose.model("Conversation", ConversationSchema);
