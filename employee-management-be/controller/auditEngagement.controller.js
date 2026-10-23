import mongoose from "mongoose";
import AuditEngagementModel from "../models/auditEngagementModel.js";
import AuditTimeLogModel from "../models/auditTimeLogModel.js";
import AuditClientModel from "../models/auditClientModel.js";
import { PERSON, MANAGERS, minutesOf, summarise, findOrCreateClientByName, linkLegacyAudits } from "../utils/auditShared.js";
import { logAudit } from "../utils/audit.js";
import { notify } from "../utils/notify.js";
import { parseLocation, fillAddressLater, LOCATION_REQUIRED } from "../utils/location.js";
import { scopeOf, workFilter } from "../utils/hierarchy.js";
import { canSeeMoney } from "../utils/money.js";
import { defaultMilestones } from "./billing.controller.js";
import { closeStaleTimers, flagIfLong } from "../utils/timerGuard.js";

const isOnTeam = (audit, userId) =>
    String(audit.auditManager?._id || audit.auditManager) === String(userId) ||
    (audit.teamMembers || []).some((m) => String(m._id || m) === String(userId));

// HR, firm-wide seniors, people on the audit, and leads of anyone on it.
const canSee = async (req, audit) => {
    if (MANAGERS.includes(req.user.role) || isOnTeam(audit, req.user.id)) return true;
    const scope = await scopeOf(req);
    return scope.firm || scope.finance || [audit.auditManager, ...(audit.teamMembers || [])].some((m) => scope.team.has(String(m?._id || m)));
};

const CLIENT = "name clientCode city contactPerson phone email";

// clientId in the body → the client record, copying its name onto the audit.
// Older callers that only send clientName get a client found or created by that name.
const resolveClient = async (body, userId) => {
    if (body.clientId) {
        const client = await AuditClientModel.findOne({ _id: body.clientId, isDeleted: false });
        if (!client) throw Object.assign(new Error("Client not found"), { status: 400 });
        return client;
    }
    if (body.clientName) return findOrCreateClientByName(body.clientName, userId);
    return null;
};

export const createAudit = async (req, res) => {
    try {
        const reqData = req.body;

        const existing = await AuditEngagementModel.findOne({ auditCode: reqData.auditCode });
        if (existing) {
            return res.status(409).json({ success: false, message: "An audit with this code already exists" });
        }

        const client = await resolveClient(reqData, req.user.id);
        if (!client) {
            return res.status(400).json({ success: false, message: "Choose the client this audit is for" });
        }

        const audit = await AuditEngagementModel.create({ ...reqData, clientId: client._id, clientName: client.name, createdBy: req.user.id, milestones: defaultMilestones() });

        logAudit(req, "audit.create", `Created audit ${audit.auditCode} for ${audit.clientName}`, { type: "AuditEngagement", id: audit._id });
        [...new Set([String(audit.auditManager), ...(audit.teamMembers || []).map(String)])].forEach((id) =>
            notify(id, "Assigned to an audit", `You have been assigned to ${audit.clientName} (${audit.auditCode}).`, "General", `/audits/${audit._id}`)
        );

        return res.status(201).json({ success: true, message: "Audit created successfully", data: audit });
    } catch (err) {
        return res.status(err.status || 500).json({ success: false, message: err.message });
    }
};

export const updateAudit = async (req, res) => {
    try {
        const { id } = req.params;

        const update = { ...req.body };
        delete update.clientName;
        delete update.milestones;
        if (!(await canSeeMoney(req))) delete update.fee;
        if (update.clientId) {
            const client = await resolveClient({ clientId: update.clientId }, req.user.id);
            update.clientName = client.name;
        }

        const audit = await AuditEngagementModel.findOneAndUpdate(
            { _id: id, isDeleted: false },
            update,
            { new: true, runValidators: true }
        );

        if (!audit) {
            return res.status(404).json({ success: false, message: "Audit not found" });
        }

        logAudit(req, "audit.update", `Updated audit ${audit.auditCode}`, { type: "AuditEngagement", id: audit._id });

        return res.status(200).json({ success: true, message: "Audit updated successfully", data: audit });
    } catch (error) {
        return res.status(error.status || 500).json({ success: false, message: error.message });
    }
};

export const deleteAudit = async (req, res) => {
    try {
        const { id } = req.params;

        const audit = await AuditEngagementModel.findByIdAndUpdate(id, { isDeleted: true }, { new: true });
        if (!audit) {
            return res.status(404).json({ success: false, message: "Audit not found" });
        }

        // Close any timers still running on it so nobody is left clocking time on an archived audit.
        const running = await AuditTimeLogModel.find({ auditId: id, endTime: null });
        await Promise.all(running.map((l) => {
            l.endTime = new Date();
            l.durationMinutes = minutesOf(l);
            return l.save();
        }));

        logAudit(req, "audit.delete", `Archived audit ${audit.auditCode}`, { type: "AuditEngagement", id: audit._id });

        return res.status(200).json({ success: true, message: "Audit archived successfully" });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getAllAudits = async (req, res) => {
    try {
        await linkLegacyAudits();

        const viewer = await scopeOf(req);
        const filter = MANAGERS.includes(req.user.role) || viewer.finance
            ? { isDeleted: false }
            : { isDeleted: false, ...(await workFilter(req, "auditManager", "teamMembers")) };
        if (req.query.clientId) filter.clientId = req.query.clientId;

        const audits = await AuditEngagementModel.find(filter)
            .populate("clientId", CLIENT)
            .populate("auditManager", PERSON)
            .populate("teamMembers", PERSON)
            .sort({ createdAt: -1 })
            .lean();

        // Time totals per audit, so the list can show hours logged and who is working right now.
        const logs = await AuditTimeLogModel.find({ auditId: { $in: audits.map((a) => a._id) } }).lean();
        const byAudit = {};
        logs.forEach((l) => { (byAudit[l.auditId] ||= []).push(l); });

        const data = audits.map((a) => {
            const mine = byAudit[a._id] || [];
            const s = summarise(mine);
            return {
                ...a,
                timeSummary: {
                    totalMinutes: s.totalMinutes,
                    daysWorked: s.daysWorked,
                    sessions: s.sessions,
                    activeNow: [...new Set(mine.filter((l) => !l.endTime).map((l) => String(l.employeeId)))],
                },
            };
        });

        // fees are for the top level only
        if (!(await canSeeMoney(req))) data.forEach((d) => { delete d.fee; });
        return res.status(200).json({ success: true, data });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

export const getAuditById = async (req, res) => {
    try {
        const { id } = req.params;

        const audit = await AuditEngagementModel.findOne({ _id: id, isDeleted: false })
            .populate("clientId", CLIENT)
            .populate("auditManager", PERSON)
            .populate("teamMembers", PERSON)
            .lean();

        if (!audit) {
            return res.status(404).json({ success: false, message: "Audit not found" });
        }
        if (!(await canSee(req, audit))) {
            return res.status(403).json({ success: false, message: "You are not assigned to this audit" });
        }

        await closeStaleTimers({ auditId: audit._id });
        const logs = await AuditTimeLogModel.find({ auditId: id })
            .populate("employeeId", PERSON)
            .sort({ startTime: -1 })
            .lean();

        // Per-person breakdown: everyone on the team appears, even with no time logged yet.
        const people = new Map();
        [audit.auditManager, ...(audit.teamMembers || [])].filter(Boolean).forEach((p) => people.set(String(p._id), { employee: p, logs: [] }));
        logs.forEach((l) => {
            const key = String(l.employeeId?._id || l.employeeId);
            if (!people.has(key)) people.set(key, { employee: l.employeeId, logs: [] });
            people.get(key).logs.push(l);
        });

        const byEmployee = [...people.values()].map(({ employee, logs: mine }) => ({ employee, ...summarise(mine) }));
        if (!audit.milestones?.length) {
            audit.milestones = defaultMilestones();
            await AuditEngagementModel.updateOne({ _id: audit._id }, { $set: { milestones: audit.milestones } });
        }
        const money = await canSeeMoney(req);
        if (!money) delete audit.fee;

        return res.status(200).json({
            success: true,
            data: { ...audit, timeSummary: summarise(logs), byEmployee, logs, canSeeMoney: money },
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const addAuditMember = async (req, res) => {
    try {
        const { id } = req.params;
        const { employeeId } = req.body;

        const audit = await AuditEngagementModel.findOneAndUpdate(
            { _id: id, isDeleted: false },
            { $addToSet: { teamMembers: employeeId } },
            { new: true }
        );

        if (!audit) {
            return res.status(404).json({ success: false, message: "Audit not found" });
        }

        notify(employeeId, "Assigned to an audit", `You have been assigned to ${audit.clientName} (${audit.auditCode}).`, "General", `/audits/${audit._id}`);

        return res.status(200).json({ success: true, message: "Member added successfully", data: audit });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const removeAuditMember = async (req, res) => {
    try {
        const { id, userId } = req.params;

        const audit = await AuditEngagementModel.findOneAndUpdate(
            { _id: id, isDeleted: false },
            { $pull: { teamMembers: userId } },
            { new: true }
        );

        if (!audit) {
            return res.status(404).json({ success: false, message: "Audit not found" });
        }

        // Their logged hours stay on the audit; only a running timer is stopped.
        const running = await AuditTimeLogModel.findOne({ auditId: id, employeeId: userId, endTime: null });
        if (running) {
            running.endTime = new Date();
            running.durationMinutes = minutesOf(running);
            await running.save();
        }

        return res.status(200).json({ success: true, message: "Member removed successfully", data: audit });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/* ---------------------------------- timer --------------------------------- */

export const startAuditTimer = async (req, res) => {
    try {
        await closeStaleTimers({ employeeId: req.user.id });
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ success: false, message: "Invalid audit" });
        }

        const location = parseLocation(req.body);
        if (!location) {
            return res.status(400).json({ success: false, message: LOCATION_REQUIRED });
        }

        const audit = await AuditEngagementModel.findOne({ _id: id, isDeleted: false });
        if (!audit) {
            return res.status(404).json({ success: false, message: "Audit not found" });
        }
        if (!isOnTeam(audit, req.user.id)) {
            return res.status(403).json({ success: false, message: "Only people assigned to this audit can log time on it" });
        }
        if (["Completed", "Cancelled"].includes(audit.status)) {
            return res.status(400).json({ success: false, message: `This audit is ${audit.status.toLowerCase()} — time can no longer be logged` });
        }

        // One running timer per person, across all audits.
        const running = await AuditTimeLogModel.findOne({ employeeId: req.user.id, endTime: null }).populate("auditId", "auditCode clientName");
        if (running) {
            const where = String(running.auditId?._id) === String(id) ? "this audit" : `${running.auditId?.clientName || "another audit"} (${running.auditId?.auditCode || ""})`;
            return res.status(409).json({ success: false, message: `Your timer is already running on ${where}. Stop it first.` });
        }

        const log = await AuditTimeLogModel.create({ auditId: id, employeeId: req.user.id, startTime: new Date(), startLocation: location });
        fillAddressLater(location, (addr) => AuditTimeLogModel.updateOne({ _id: log._id }, { "startLocation.address": addr }).catch(() => {}));

        // Starting work moves a planned audit into fieldwork automatically.
        if (audit.status === "Planning") {
            audit.status = "Fieldwork";
            await audit.save();
        }

        return res.status(201).json({ success: true, message: "Timer started", data: log });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const stopAuditTimer = async (req, res) => {
    try {
        const { id } = req.params;
        const { note = "" } = req.body || {};

        const location = parseLocation(req.body);
        if (!location) {
            return res.status(400).json({ success: false, message: LOCATION_REQUIRED });
        }

        const log = await AuditTimeLogModel.findOne({ auditId: id, employeeId: req.user.id, endTime: null });
        if (!log) {
            return res.status(404).json({ success: false, message: "You have no running timer on this audit" });
        }

        log.endTime = new Date();
        log.durationMinutes = minutesOf(log, log.endTime.getTime());
        log.note = note;
        log.stopLocation = location;
        flagIfLong(log);
        await log.save();
        fillAddressLater(location, (addr) => AuditTimeLogModel.updateOne({ _id: log._id }, { "stopLocation.address": addr }).catch(() => {}));

        return res.status(200).json({ success: true, message: "Timer stopped", data: log });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// The caller's running timer (if any), so any page can show "you are clocked in on X".
export const getMyActiveAuditTimer = async (req, res) => {
    try {
        await closeStaleTimers({ employeeId: req.user.id });
        const log = await AuditTimeLogModel.findOne({ employeeId: req.user.id, endTime: null })
            .populate("auditId", "auditCode clientName engagementName auditType financialYear")
            .lean();

        return res.status(200).json({ success: true, data: log || null });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
