import employeeModel from "../models/employeeModel.js";
import { logAudit } from "../utils/audit.js";
import { DEFAULT_OFFBOARDING_TASKS } from "../utils/checklists.js";
import documentModel from "../models/documentModel.js";
import assetModel from "../models/assetModel.js";
import attendanceModel from "../models/attendanceModel.js";
import { notify } from "../utils/notify.js";
import { sendMail, mailLayout, escapeHtml } from "../utils/mailer.js";

// ==============================
// Onboarding
// ==============================
// Each checklist step, what it means, and how the system can tell it's done on its own.
// Matched by title so existing checklists keep working.
const STEPS = [
    { key: "welcome", match: /welcome/i, hint: "Send a welcome message with their login email and first-day details." },
    { key: "documents", match: /id proof|documents/i, hint: "Ticks itself when an ID / address / PAN proof is uploaded to their record." },
    { key: "access", match: /system access|login/i, hint: "Ticks itself the first time they sign in." },
    { key: "asset", match: /workstation|asset/i, hint: "Ticks itself when a laptop or other asset is assigned to them." },
    { key: "orientation", match: /orientation/i, hint: "Tick once the HR induction / orientation has happened." },
    { key: "policy", match: /policy/i, hint: "Tick once they have read and signed the company policies." },
];
const stepOf = (title = "") => STEPS.find((s) => s.match.test(title)) || { key: "other", hint: "" };
const ID_PROOFS = ["ID Proof", "Address Proof", "PAN / Tax"];

// Auto-tick steps whose real-world signal exists, then return the enriched list.
export const getOnboardingList = async (req, res) => {
    try {
        const employees = await employeeModel
            .find({ "onboarding.status": "In Progress", status: "Active" })
            .select("employeeId firstName lastName department designation joiningDate profileImage email phoneNumber manager lastLoginAt onboarding createdAt")
            .populate("manager", "firstName lastName");
        const ids = employees.map((e) => e._id);

        const [docs, assets, attendance] = await Promise.all([
            documentModel.find({ employeeId: { $in: ids }, category: { $in: ID_PROOFS } }).select("employeeId").lean(),
            assetModel.find({ assignedTo: { $in: ids } }).select("assignedTo name").lean(),
            attendanceModel.find({ employeeId: { $in: ids } }).select("employeeId").lean(),
        ]);
        const has = (rows, field) => new Set(rows.map((r) => String(r[field])));
        const withDocs = has(docs, "employeeId"), withAssets = has(assets, "assignedTo"), worked = has(attendance, "employeeId");

        const data = [];
        for (const emp of employees) {
            const id = String(emp._id);
            const signal = { documents: withDocs.has(id), asset: withAssets.has(id), access: !!emp.lastLoginAt || worked.has(id) };
            let changed = false;
            emp.onboarding.tasks.forEach((t) => {
                const key = stepOf(t.title).key;
                if (!t.completed && signal[key]) { t.completed = true; t.completedAt = new Date(); t.auto = true; changed = true; }
            });
            if (changed && emp.onboarding.tasks.every((t) => t.completed)) { emp.onboarding.status = "Completed"; emp.onboarding.completedAt = new Date(); }
            if (changed) await emp.save();
            if (emp.onboarding.status !== "In Progress") continue;
            const o = emp.toObject();
            o.onboarding.tasks = o.onboarding.tasks.map((t) => ({ ...t, ...{ key: stepOf(t.title).key, hint: stepOf(t.title).hint } }));
            // people who were already working here before they were added are worth flagging
            o.existingStaff = !!(o.joiningDate && o.createdAt && new Date(o.createdAt) - new Date(o.joiningDate) > 60 * 864e5);
            data.push(o);
        }

        return res.status(200).json({ success: true, data });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const finishIfDone = (employee) => {
    if (employee.onboarding.tasks.every((t) => t.completed)) {
        employee.onboarding.status = "Completed";
        employee.onboarding.completedAt = new Date();
    } else {
        employee.onboarding.status = "In Progress";
        employee.onboarding.completedAt = null;
    }
};

export const updateOnboardingTask = async (req, res) => {
    try {
        const { id, taskIndex } = req.params;
        const { completed } = req.body;

        const employee = await employeeModel.findById(id);

        if (!employee) {
            return res.status(404).json({ success: false, message: "Employee not found." });
        }

        const task = employee.onboarding.tasks[taskIndex];
        if (!task) {
            return res.status(404).json({ success: false, message: "Onboarding task not found." });
        }

        task.completed = completed;
        task.completedAt = completed ? new Date() : null;
        task.auto = false;
        finishIfDone(employee);

        await employee.save();

        return res.status(200).json({ success: true, message: "Onboarding updated.", data: employee.onboarding });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// POST /employees/:id/onboarding/welcome — in-app welcome (and email when mail is set up), then
// ticks the "welcome" step.
export const sendWelcome = async (req, res) => {
    try {
        const employee = await employeeModel.findById(req.params.id).populate("manager", "firstName lastName");
        if (!employee) return res.status(404).json({ success: false, message: "Employee not found." });
        const app = process.env.FRONTEND_URL || "";
        const managerLine = employee.manager ? `${employee.manager.firstName} ${employee.manager.lastName}`.trim() : "";
        const first = employee.joiningDate ? new Date(employee.joiningDate).toDateString() : "";

        notify(employee._id, "Welcome to Astral Consulting!", `We're glad to have you${first ? ` from ${first}` : ""}. Sign in with ${employee.email}, check in from the dashboard each day${managerLine ? `, and reach out to ${managerLine} (your manager) for anything you need` : ""}.`, "General", "/dashboard");
        const mail = await sendMail({
            to: employee.email,
            subject: "Welcome to Astral Consulting Limited",
            html: mailLayout(`Welcome, ${employee.firstName}!`, `<p>We're glad to have you on the team${first ? ` — your first day is <b>${escapeHtml(first)}</b>` : ""}.</p>
<p>Sign in${app ? ` at <a href="${escapeHtml(app)}">${escapeHtml(app)}</a>` : ""} with <b>${escapeHtml(employee.email)}</b> and the password HR shared with you. Each working day, check in from the dashboard.</p>
${managerLine ? `<p>Your reporting manager is <b>${escapeHtml(managerLine)}</b>.</p>` : ""}<p>— HR, Astral Consulting Limited</p>`),
        });

        const task = employee.onboarding.tasks.find((t) => stepOf(t.title).key === "welcome");
        if (task && !task.completed) { task.completed = true; task.completedAt = new Date(); task.auto = false; }
        finishIfDone(employee);
        await employee.save();
        logAudit(req, "onboarding.welcome", `Welcome sent to ${employee.firstName} ${employee.lastName} (${employee.employeeId})`, { type: "Employee", id: employee._id });

        return res.status(200).json({ success: true, message: mail.sent ? `Welcome email and notification sent to ${employee.firstName}.` : `Welcome notification sent to ${employee.firstName} (email isn't set up yet, so no email went out).`, data: employee.onboarding });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// POST /onboarding/close { ids } — take people off the onboarding list without the checklist
// (e.g. existing staff added to the system after they joined).
export const closeOnboarding = async (req, res) => {
    try {
        const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
        if (!ids.length) return res.status(400).json({ success: false, message: "Pick at least one person." });
        const r = await employeeModel.updateMany({ _id: { $in: ids }, "onboarding.status": "In Progress" }, { $set: { "onboarding.status": "Completed", "onboarding.skipped": true, "onboarding.completedAt": new Date() } });
        logAudit(req, "onboarding.close", `Closed onboarding for ${r.modifiedCount} employee(s) without the checklist`, { type: "Employee" });
        return res.status(200).json({ success: true, message: `${r.modifiedCount} ${r.modifiedCount === 1 ? "person" : "people"} marked as already onboarded.`, data: { closed: r.modifiedCount } });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ==============================
// Offboarding
// ==============================
export const initiateOffboarding = async (req, res) => {
    try {
        const { id } = req.params;
        const { exitDate, reason } = req.body;

        const employee = await employeeModel.findByIdAndUpdate(
            id,
            {
                offboarding: {
                    status: "In Progress",
                    exitDate,
                    reason,
                    tasks: DEFAULT_OFFBOARDING_TASKS,
                },
            },
            { new: true }
        ).select("-password");

        if (!employee) {
            return res.status(404).json({ success: false, message: "Employee not found." });
        }

        logAudit(req, "employee.offboard_start", `Started offboarding for ${employee.firstName} ${employee.lastName}`, { type: "Employee", id: employee._id });

        return res.status(200).json({ success: true, message: "Offboarding started.", data: employee });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getOffboardingList = async (req, res) => {
    try {
        const employees = await employeeModel
            .find({ "offboarding.status": "In Progress" })
            .select("employeeId firstName lastName department designation profileImage offboarding");

        return res.status(200).json({ success: true, data: employees });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const updateOffboardingTask = async (req, res) => {
    try {
        const { id, taskIndex } = req.params;
        const { completed } = req.body;

        const employee = await employeeModel.findById(id);

        if (!employee) {
            return res.status(404).json({ success: false, message: "Employee not found." });
        }

        const task = employee.offboarding.tasks[taskIndex];
        if (!task) {
            return res.status(404).json({ success: false, message: "Offboarding task not found." });
        }

        task.completed = completed;
        task.completedAt = completed ? new Date() : null;

        await employee.save();

        return res.status(200).json({ success: true, message: "Offboarding updated.", data: employee.offboarding });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const completeOffboarding = async (req, res) => {
    try {
        const { id } = req.params;

        const employee = await employeeModel.findByIdAndUpdate(
            id,
            { status: "Resigned", "offboarding.status": "Completed" },
            { new: true }
        ).select("-password");

        if (!employee) {
            return res.status(404).json({ success: false, message: "Employee not found." });
        }

        logAudit(req, "employee.offboard_complete", `Completed offboarding for ${employee.firstName} ${employee.lastName}`, { type: "Employee", id: employee._id });

        return res.status(200).json({ success: true, message: "Offboarding completed.", data: employee });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
