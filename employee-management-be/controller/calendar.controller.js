import holidayModel from "../models/holidayModel.js";
import shiftModel from "../models/shiftModel.js";
import employeeModel from "../models/employeeModel.js";

// Holidays
export const getHolidays = async (req, res) => {
    try {
        const holidays = await holidayModel.find({}).sort({ date: 1 });
        return res.status(200).json({ success: true, data: holidays });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const createHoliday = async (req, res) => {
    try {
        const { name, date, type } = req.body;
        const holiday = await holidayModel.create({ name, date, type });
        return res.status(201).json({ success: true, message: "Holiday added successfully.", data: holiday });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const updateHoliday = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, date, type } = req.body;

        const holiday = await holidayModel.findByIdAndUpdate(id, { name, date, type }, { new: true, runValidators: true });

        if (!holiday) {
            return res.status(404).json({ success: false, message: "Holiday not found." });
        }

        return res.status(200).json({ success: true, message: "Holiday updated successfully.", data: holiday });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const deleteHoliday = async (req, res) => {
    try {
        const { id } = req.params;
        const holiday = await holidayModel.findByIdAndDelete(id);

        if (!holiday) {
            return res.status(404).json({ success: false, message: "Holiday not found." });
        }

        return res.status(200).json({ success: true, message: "Holiday removed successfully." });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// Shifts
export const getShifts = async (req, res) => {
    try {
        const shifts = await shiftModel.find({}).sort({ startTime: 1 });
        return res.status(200).json({ success: true, data: shifts });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const createShift = async (req, res) => {
    try {
        const { name, startTime, endTime, graceMinutes } = req.body;
        const shift = await shiftModel.create({ name, startTime, endTime, graceMinutes });
        return res.status(201).json({ success: true, message: "Shift created successfully.", data: shift });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const updateShift = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, startTime, endTime, graceMinutes } = req.body;

        const shift = await shiftModel.findByIdAndUpdate(
            id,
            { name, startTime, endTime, graceMinutes },
            { new: true, runValidators: true }
        );

        if (!shift) {
            return res.status(404).json({ success: false, message: "Shift not found." });
        }

        return res.status(200).json({ success: true, message: "Shift updated successfully.", data: shift });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const assignShift = async (req, res) => {
    try {
        const { id } = req.params; // employee id
        const { shiftId } = req.body;

        const employee = await employeeModel.findByIdAndUpdate(
            id,
            { shift: shiftId },
            { new: true }
        ).select("-password");

        if (!employee) {
            return res.status(404).json({ success: false, message: "Employee not found." });
        }

        return res.status(200).json({ success: true, message: "Shift assigned successfully.", data: employee });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
