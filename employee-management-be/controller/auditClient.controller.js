import AuditClientModel from "../models/auditClientModel.js";
import AuditEngagementModel from "../models/auditEngagementModel.js";
import AuditTimeLogModel from "../models/auditTimeLogModel.js";
import { logAudit } from "../utils/audit.js";
import { PERSON, MANAGERS, CLOSED, summarise, nextClientCode, linkLegacyAudits } from "../utils/auditShared.js";
import { scopeOf, workFilter } from "../utils/hierarchy.js";

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Engagements the caller may see: all for Admin/HR, otherwise only the ones they're on.
// HR and firm-wide seniors: every engagement; everyone else: ones they or their team work on.
const visibleEngagementFilter = async (req, extra = {}) =>
    MANAGERS.includes(req.user.role)
        ? { isDeleted: false, ...extra }
        : { isDeleted: false, ...extra, ...(await workFilter(req, "auditManager", "teamMembers")) };
const seesAllClients = async (req) => MANAGERS.includes(req.user.role) || (await scopeOf(req)).firm;

const peopleOn = (a) => [a.auditManager, ...(a.teamMembers || [])].filter(Boolean).map((p) => String(p._id || p));

export const getClients = async (req, res) => {
    try {
        await linkLegacyAudits();

        const engagements = await AuditEngagementModel.find(await visibleEngagementFilter(req))
            .select("clientId status endDate auditManager teamMembers")
            .lean();
        const logs = await AuditTimeLogModel.find({ auditId: { $in: engagements.map((e) => e._id) } })
            .select("auditId employeeId startTime endTime durationMinutes")
            .lean();

        const engagementClient = new Map(engagements.map((e) => [String(e._id), String(e.clientId)]));
        const stats = {};
        const statFor = (cid) => (stats[cid] ||= { engagements: 0, open: 0, people: new Set(), logs: [], nextDeadline: null });
        engagements.forEach((e) => {
            const s = statFor(String(e.clientId));
            s.engagements += 1;
            peopleOn(e).forEach((p) => s.people.add(p));
            if (!CLOSED.includes(e.status)) {
                s.open += 1;
                if (e.endDate && (!s.nextDeadline || e.endDate < s.nextDeadline)) s.nextDeadline = e.endDate;
            }
        });
        logs.forEach((l) => statFor(engagementClient.get(String(l.auditId))).logs.push(l));

        // Admin/HR see every client (including ones with no engagements yet); others only clients they work for.
        const clientFilter = (await seesAllClients(req))
            ? { isDeleted: false }
            : { isDeleted: false, _id: { $in: [...new Set(engagements.map((e) => e.clientId))] } };
        const clients = await AuditClientModel.find(clientFilter).sort({ name: 1 }).lean();

        const data = clients.map((c) => {
            const s = stats[String(c._id)] || { engagements: 0, open: 0, people: new Set(), logs: [], nextDeadline: null };
            const t = summarise(s.logs);
            return {
                ...c,
                stats: {
                    engagements: s.engagements,
                    open: s.open,
                    people: s.people.size,
                    totalMinutes: t.totalMinutes,
                    activeNow: new Set(s.logs.filter((l) => !l.endTime).map((l) => String(l.employeeId))).size,
                    nextDeadline: s.nextDeadline,
                    lastActivity: t.sessions ? t.lastActivity : null,
                },
            };
        });

        return res.status(200).json({ success: true, data });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

export const getClientById = async (req, res) => {
    try {
        const { id } = req.params;

        const client = await AuditClientModel.findOne({ _id: id, isDeleted: false }).lean();
        if (!client) {
            return res.status(404).json({ success: false, message: "Client not found" });
        }

        const engagements = await AuditEngagementModel.find(await visibleEngagementFilter(req, { clientId: id }))
            .populate("auditManager", PERSON)
            .populate("teamMembers", PERSON)
            .sort({ startDate: -1 })
            .lean();

        if (!(await seesAllClients(req)) && !engagements.length) {
            return res.status(403).json({ success: false, message: "You are not assigned to any audit for this client" });
        }

        const logs = await AuditTimeLogModel.find({ auditId: { $in: engagements.map((e) => e._id) } })
            .populate("employeeId", PERSON)
            .lean();

        const byAudit = {};
        logs.forEach((l) => { (byAudit[l.auditId] ||= []).push(l); });

        const engagementData = engagements.map((e) => {
            const mine = byAudit[e._id] || [];
            const s = summarise(mine);
            return {
                ...e,
                timeSummary: {
                    totalMinutes: s.totalMinutes,
                    daysWorked: s.daysWorked,
                    sessions: s.sessions,
                    activeNow: [...new Set(mine.filter((l) => !l.endTime).map((l) => String(l.employeeId?._id || l.employeeId)))],
                },
            };
        });

        // Everyone who works for this client, across all its engagements.
        const people = new Map();
        const touch = (p) => {
            const key = String(p?._id || p);
            if (!people.has(key)) people.set(key, { employee: p, logs: [], engagements: new Set() });
            return people.get(key);
        };
        engagements.forEach((e) => [e.auditManager, ...(e.teamMembers || [])].filter(Boolean).forEach((p) => touch(p).engagements.add(String(e._id))));
        logs.forEach((l) => {
            const row = touch(l.employeeId);
            row.logs.push(l);
            row.engagements.add(String(l.auditId));
        });
        const byEmployee = [...people.values()].map(({ employee, logs: mine, engagements: set }) => ({
            employee,
            engagements: set.size,
            ...summarise(mine),
        }));

        return res.status(200).json({
            success: true,
            data: { ...client, engagements: engagementData, byEmployee, timeSummary: summarise(logs) },
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const createClient = async (req, res) => {
    try {
        const { clientCode, ...rest } = req.body;
        const name = String(rest.name || "").trim();
        if (!name) {
            return res.status(400).json({ success: false, message: "Client name is required" });
        }

        const duplicate = await AuditClientModel.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, "i"), isDeleted: false });
        if (duplicate) {
            return res.status(409).json({ success: false, message: `A client named "${duplicate.name}" already exists (${duplicate.clientCode})` });
        }

        const code = String(clientCode || "").trim() || (await nextClientCode());
        if (await AuditClientModel.exists({ clientCode: code })) {
            return res.status(409).json({ success: false, message: `Client code ${code} is already used` });
        }

        const client = await AuditClientModel.create({ ...rest, name, clientCode: code, createdBy: req.user.id });

        logAudit(req, "auditClient.create", `Added audit client ${client.name}`, { type: "AuditClient", id: client._id });

        return res.status(201).json({ success: true, message: "Client added", data: client });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

export const updateClient = async (req, res) => {
    try {
        const { id } = req.params;
        const update = { ...req.body };
        delete update.clientCode;

        if (update.name !== undefined) {
            update.name = String(update.name).trim();
            if (!update.name) return res.status(400).json({ success: false, message: "Client name is required" });
            const duplicate = await AuditClientModel.findOne({ _id: { $ne: id }, name: new RegExp(`^${escapeRegex(update.name)}$`, "i"), isDeleted: false });
            if (duplicate) return res.status(409).json({ success: false, message: `A client named "${duplicate.name}" already exists` });
        }

        const client = await AuditClientModel.findOneAndUpdate({ _id: id, isDeleted: false }, update, { new: true, runValidators: true });
        if (!client) {
            return res.status(404).json({ success: false, message: "Client not found" });
        }

        // Keep the name copied onto its engagements in step.
        if (update.name) await AuditEngagementModel.updateMany({ clientId: id }, { clientName: client.name });

        logAudit(req, "auditClient.update", `Updated audit client ${client.name}`, { type: "AuditClient", id: client._id });

        return res.status(200).json({ success: true, message: "Client updated", data: client });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const deleteClient = async (req, res) => {
    try {
        const { id } = req.params;

        const open = await AuditEngagementModel.countDocuments({ clientId: id, isDeleted: false, status: { $nin: CLOSED } });
        if (open) {
            return res.status(400).json({
                success: false,
                message: `This client still has ${open} open audit${open === 1 ? "" : "s"}. Complete, cancel or archive them first.`,
            });
        }

        const client = await AuditClientModel.findOneAndUpdate({ _id: id, isDeleted: false }, { isDeleted: true }, { new: true });
        if (!client) {
            return res.status(404).json({ success: false, message: "Client not found" });
        }

        logAudit(req, "auditClient.delete", `Archived audit client ${client.name}`, { type: "AuditClient", id: client._id });

        return res.status(200).json({ success: true, message: "Client archived" });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
