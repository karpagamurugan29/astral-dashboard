import ticketModel from "../models/ticketModel.js";
import { notify } from "../utils/notify.js";
import { scopeOf, visibleIds } from "../utils/hierarchy.js";

export const getTickets = async (req, res) => {
    try {
        // HR and firm-wide seniors handle every ticket; leads see their team's; everyone else their own.
        const ids = visibleIds(await scopeOf(req), "people");
        const isManager = !ids;

        const filter = isManager ? {} : { employeeId: { $in: ids } };

        const tickets = await ticketModel
            .find(filter)
            .populate("employeeId", "employeeId firstName lastName department")
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            data: tickets,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

export const createTicket = async (req, res) => {
    try {
        const { subject, category, description, priority } = req.body;

        const ticket = await ticketModel.create({
            employeeId: req.user.id,
            subject,
            category,
            description,
            priority,
        });

        return res.status(201).json({
            success: true,
            message: "Ticket raised successfully.",
            data: ticket,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

export const updateTicketStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const ticket = await ticketModel.findById(id);

        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: "Ticket not found.",
            });
        }

        ticket.status = status;
        if (status === "Resolved" || status === "Closed") {
            ticket.resolvedAt = new Date();
        }

        await ticket.save();

        notify(ticket.employeeId, `Ticket ${status}`, `Your ticket "${ticket.subject}" is now ${status}.`, "Ticket", "/helpdesk");

        return res.status(200).json({
            success: true,
            message: "Ticket updated successfully.",
            data: ticket,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

export const addTicketComment = async (req, res) => {
    try {
        const { id } = req.params;
        const { message } = req.body;

        const ticket = await ticketModel.findById(id);

        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: "Ticket not found.",
            });
        }

        ticket.comments.push({ employeeId: req.user.id, message });
        await ticket.save();

        return res.status(200).json({
            success: true,
            message: "Comment added successfully.",
            data: ticket,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};
