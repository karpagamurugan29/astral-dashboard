import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
    {
        userId: {
            type: String,
        },

        userName: {
            type: String,
            required: true,
        },

        phoneNumber: {
            type: String,
            required: true,
        },

        email: {
            type: String,
            required: true,
            unique: true,
        },

        password: {
            type: String,
            required: true,
            minlength: 8,
            unique: true,
        },

        otp: {
            type: Number,
            default: null,
        },
        otpExpiresAt: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true,
    }
);

export default mongoose.model("User", UserSchema);