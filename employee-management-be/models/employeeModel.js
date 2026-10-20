import mongoose from "mongoose";

const EmployeeSchema = new mongoose.Schema(
    {
        employeeId: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },

        userName: {
            type: String,
            required: true,
            trim: true,
        },

        firstName: {
            type: String,
            required: true,
            trim: true,
        },

        lastName: {
            type: String,
            required: true,
            trim: true,
        },

        gender: {
            type: String,
            enum: ["Male", "Female", "Other"],
            required: true,
        },

        dateOfBirth: {
            type: Date,
            required: true,
        },

        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },

        phoneNumber: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        role: {
            type: String,
            enum: ["Admin", "HR", "Manager", "Team Lead", "Employee"],
            default: "Employee",
        },
        designation: {
            type: String,
            required: true,
            trim: true,
        },

        department: {
            type: String,
            required: true,
            trim: true,
        },

        joiningDate: {
            type: Date,
            required: true,
        },

        employmentType: {
            type: String,
            enum: ["Permanent", "Contract", "Intern", "Part-Time"],
            required: true,
        },

        salary: {
            type: Number,
            required: true,
            min: 0,
        },

        manager: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
            default: null,
        },

        shift: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Shift",
            default: null,
        },

        branch: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Branch",
            default: null,
        },

        password: {
            type: String,
            required: true,
            minlength: 8,
        },

        address: {
            street: {
                type: String,
                trim: true,
            },
            city: {
                type: String,
                trim: true,
            },
            state: {
                type: String,
                trim: true,
            },
            country: {
                type: String,
                trim: true,
            },
            pincode: {
                type: String,
                trim: true,
            },
        },

        emergencyContact: {
            name: {
                type: String,
                trim: true,
            },
            relation: {
                type: String,
                trim: true,
            },
            phone: {
                type: String,
                trim: true,
            },
        },

        profileImage: {
            type: String,
            default: "",
        },

        status: {
            type: String,
            enum: ["Active", "Inactive", "Resigned", "Terminated"],
            default: "Active",
        },

        otp: {
            type: Number,
            default: null,
        },

        otpExpiresAt: {
            type: Date,
            default: null,
        },

        onboarding: {
            status: {
                type: String,
                enum: ["In Progress", "Completed"],
                default: "In Progress",
            },
            tasks: [
                {
                    title: String,
                    completed: { type: Boolean, default: false },
                    completedAt: { type: Date, default: null },
                },
            ],
        },

        offboarding: {
            status: {
                type: String,
                enum: ["Not Started", "In Progress", "Completed"],
                default: "Not Started",
            },
            exitDate: { type: Date, default: null },
            reason: { type: String, default: "" },
            tasks: [
                {
                    title: String,
                    completed: { type: Boolean, default: false },
                    completedAt: { type: Date, default: null },
                },
            ],
        },
    },
    {
        timestamps: true,
    }
);

export default mongoose.model("Employee", EmployeeSchema);