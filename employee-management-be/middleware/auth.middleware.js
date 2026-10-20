import jwt from "jsonwebtoken";
import employeeModel from "../models/employeeModel.js";

const authMiddleWare = async (req, res, next) => {
    try {
        const token = req.cookies.token;

        if (!token) {
            return res.status(401).json({
                success: false,
                message: "Token is required",
            });
        }

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        // A JWT stays valid for up to 24h even after someone is offboarded —
        // check current status on every request so access is actually revoked,
        // not just delayed until the token expires on its own.
        const employee = await employeeModel.findById(decoded.id).select("status");

        if (!employee || employee.status !== "Active") {
            res.clearCookie("token");
            return res.status(401).json({
                success: false,
                message: "This account is no longer active.",
            });
        }

        req.user = decoded;

        next();
    } catch (err) {
        return res.status(401).json({
            success: false,
            message: "Invalid or expired token",
        });
    }
};

export default authMiddleWare;
