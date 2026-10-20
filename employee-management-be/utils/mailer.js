import nodemailer from "nodemailer";

// Outgoing email over SMTP (Gmail / Google Workspace, Microsoft 365, or the company mail server).
// Configure in .env (and in Vercel's environment variables):
//   SMTP_HOST, SMTP_PORT (587, or 465 with SMTP_SECURE=true), SMTP_USER, SMTP_PASS, MAIL_FROM
// Without them nothing is sent: callers get { sent: false } and carry on.

let transport = null;

export const isMailConfigured = () => !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

const getTransport = () => {
    if (!transport) {
        transport = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT) || 587,
            secure: process.env.SMTP_SECURE === "true",
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        });
    }
    return transport;
};

const escapeHtml = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export { escapeHtml };

// Never throws: email is a side effect and must not fail the action that triggered it.
export const sendMail = async ({ to, cc, subject, text, html }) => {
    if (!isMailConfigured()) return { sent: false, reason: "SMTP not configured" };
    if (!to) return { sent: false, reason: "No recipient" };
    try {
        await getTransport().sendMail({
            from: process.env.MAIL_FROM || process.env.SMTP_USER,
            to,
            cc: cc || undefined,
            subject,
            text,
            html,
        });
        return { sent: true };
    } catch (err) {
        console.error("Email failed:", err.message);
        return { sent: false, reason: err.message };
    }
};

// A plain, readable email body in the company's style.
export const mailLayout = (title, bodyHtml) => `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f6f9;font-family:Segoe UI,Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e6e8f0">
<tr><td style="padding:20px 24px;border-bottom:3px solid #b91c1c"><b style="font-size:16px;color:#b91c1c">Astral</b> <span style="color:#64748b;font-size:13px">Consulting Limited</span></td></tr>
<tr><td style="padding:24px"><h2 style="margin:0 0 12px;font-size:18px">${escapeHtml(title)}</h2>${bodyHtml}</td></tr>
<tr><td style="padding:14px 24px;border-top:1px solid #eef1f5;font-size:12px;color:#94a3b8">Sent automatically by Astral Workspace.</td></tr>
</table></body></html>`;
