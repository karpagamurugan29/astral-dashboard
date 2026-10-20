import employeeModel from "../models/employeeModel.js";
import LeaveBalance from "../models/LeaveBalanceModel.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { DEFAULT_ONBOARDING_TASKS } from "../utils/checklists.js";


export const register = async (req, res) => {
    try {
        const { employeeId, userName, firstName, lastName, gender, dateOfBirth, email, phoneNumber, designation, department, joiningDate, employmentType, salary, manager, password, address, emergencyContact, profileImage } = req.body;

        const existingUser = await employeeModel.findOne({
            $or: [{ email }, { employeeId }, { phoneNumber }]
        });

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: "Employee already exists"
            });
        }

        const encryptPass = await bcrypt.hash(password, 10);

        // Public self-registration can only ever create an Employee — Admin/HR/Manager/Team Lead
        // accounts must be provisioned by an authenticated Admin/HR via POST /employees, otherwise
        // anyone with network access could hand themselves full Admin privileges through this route.
        const employee = await employeeModel.create({ employeeId, userName, firstName, lastName, gender, dateOfBirth, email, phoneNumber, role: "Employee", designation, department, joiningDate, employmentType, salary, manager, password: encryptPass, address, emergencyContact, profileImage, onboarding: { status: "In Progress", tasks: DEFAULT_ONBOARDING_TASKS } });

        await LeaveBalance.create({ employeeId: employee._id });

        const response = employee.toObject();
        delete response.password;

        return res.status(201).json({
            success: true,
            message: "Employee Registered Successfully",
            data: response
        });

    } catch (err) {

        return res.status(500).json({
            success: false,
            message: err.message
        });

    }
};

// Login User
export const login = async (req, res) => {
    try {
        const { email, password, remember } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required",
            });
        }

        const user = await employeeModel.findOne({ email });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        if (user.status !== "Active") {
            return res.status(403).json({
                success: false,
                message: "This account is no longer active. Contact your HR administrator.",
            });
        }

        const matchPass = await bcrypt.compare(
            password,
            user.password
        );

        if (!matchPass) {
            return res.status(400).json({
                success: false,
                message: "Invalid password",
            });
        }

        const token = jwt.sign(
            {
                id: user._id,
                email: user.email,
                role: user.role,
            },
            process.env.JWT_SECRET,
            {
                // "Keep me signed in" → 30 days; otherwise the configured default (one day).
                expiresIn: remember ? "30d" : (process.env.JWT_EXPIRES_IN || "1d"),
            }
        );
        const maxAge = (remember ? 30 : 1) * 24 * 60 * 60 * 1000;

        // Store JWT in Cookie
        res.cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production", // true on Vercel (HTTPS), false for local http dev
            sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
            maxAge,
        });

        const response = user.toObject();
        delete response.password;

        // The token is also returned for the Authorization header: the frontend and API live on
        // different domains, and mobile browsers (Safari above all) block that cross-site cookie,
        // which signed people out right after logging in on a phone.
        return res.status(200).json({
            success: true,
            message: "Login Successfully",
            user: response,
            token,
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
};

// Forgot Password
export const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        const user = await employeeModel.findOne({ email });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "Email not registered",
            });
        }
        // Generate OTP
        const OTP = Math.floor(
            10000 + Math.random() * 90000
        );
        user.otp = OTP;
        user.otpExpiresAt =
            new Date(Date.now() + 5 * 60 * 1000);

        await user.save();

        return res.status(200).json({
            success: true,
            message: "OTP sent successfully",
            // Remove this in production
            otp: OTP,
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
};

// Reset Password
export const resetPassword = async (req, res) => {
    try {
        const {
            email,
            otp,
            newPassword
        } = req.body;

        if (!email || !otp || !newPassword) {
            return res.status(400).json({
                success: false,
                message: "Email, OTP and new password are required",
            });
        }

        const user = await employeeModel.findOne({
            email
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User email is invalid",
            });
        }
        // Convert OTP into number
        if (Number(otp) !== user.otp) {
            return res.status(400).json({
                success: false,
                message: "Invalid OTP",
            });
        }

        if (new Date() > user.otpExpiresAt) {
            return res.status(400).json({
                success: false,
                message: "OTP Expired",
            });
        }
        const encryptPass = await bcrypt.hash(newPassword, 10);

        user.password = encryptPass;
        user.otp = null;
        user.otpExpiresAt = null;

        await user.save();

        return res.status(200).json({
            success: true,
            message: "Password reset successfully",
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
};

export const session = async (req, res) => {
    try {
        const user = await employeeModel
            .findById(req.user.id)
            .select("-password");

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        return res.status(200).json({
            success: true,
            user,
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
};

// Change Password (while signed in)
export const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: "Current and new password are required",
            });
        }

        const user = await employeeModel.findById(req.user.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        const matchPass = await bcrypt.compare(currentPassword, user.password);

        if (!matchPass) {
            return res.status(400).json({
                success: false,
                message: "Current password is incorrect",
            });
        }

        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();

        return res.status(200).json({
            success: true,
            message: "Password changed successfully",
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
};

// Update own profile
export const updateProfile = async (req, res) => {
    try {
        const { firstName, lastName, phoneNumber, address, emergencyContact, profileImage } = req.body;

        const user = await employeeModel.findByIdAndUpdate(
            req.user.id,
            { firstName, lastName, phoneNumber, address, emergencyContact, profileImage },
            { new: true, runValidators: true }
        ).select("-password");

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Profile updated successfully",
            user,
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
};

// Logout User
export const logout = async (req, res) => {
    try {
        res.clearCookie("token", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        });
        return res.status(200).json({
            success: true,
            message: "Logout successfully",
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
};