import { runAutoCheckout } from "../utils/autoCheckout.js";
import { logAudit } from "../utils/audit.js";

// Called by Vercel Cron (see vercel.json), which sends "Authorization: Bearer <CRON_SECRET>".
export const cronAutoCheckout = async (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (!secret) return res.status(503).json({ success: false, message: "CRON_SECRET is not set" });
    if (req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ success: false, message: "Unauthorized" });
    try {
        const result = await runAutoCheckout();
        return res.status(200).json({ success: true, data: result });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// Admin "run it now" — the same job, for testing or a missed run.
export const runAutoCheckoutNow = async (req, res) => {
    try {
        const result = await runAutoCheckout();
        logAudit(req, "attendance.auto_checkout", `Ran auto check-out: ${result.checkedOut} checked out, ${result.timersStopped} timers stopped`, { type: "Attendance" });
        return res.status(200).json({ success: true, data: result });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};
