import salaryStructureModel from "../models/salaryStructureModel.js";
import payrollRunModel from "../models/payrollRunModel.js";
import payslipModel from "../models/payslipModel.js";
import { logAudit } from "../utils/audit.js";
import { notify } from "../utils/notify.js";

// ==============================
// Salary Structure
// ==============================
export const getSalaryStructure = async (req, res) => {
    try {
        const { employeeId } = req.params;

        const canView = ["Admin", "HR"].includes(req.user.role) || req.user.id === employeeId;
        if (!canView) {
            return res.status(403).json({ success: false, message: "You cannot view another employee's salary." });
        }

        const structure = await salaryStructureModel.findOne({ employeeId });

        return res.status(200).json({ success: true, data: structure });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const saveSalaryStructure = async (req, res) => {
    try {
        const { employeeId, ...rest } = req.body;

        const structure = await salaryStructureModel.findOneAndUpdate(
            { employeeId },
            { employeeId, ...rest },
            { new: true, upsert: true, runValidators: true }
        );

        logAudit(req, "payroll.salary_structure_saved", `Saved salary structure for an employee`, { type: "SalaryStructure", id: structure._id });

        return res.status(200).json({ success: true, message: "Salary structure saved successfully.", data: structure });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const computePayslip = (structure) => {
    const grossPay =
        structure.basic + structure.hra + structure.conveyance +
        structure.medicalAllowance + structure.specialAllowance;

    const totalDeductions =
        structure.providentFund + structure.professionalTax +
        structure.incomeTax + structure.otherDeductions;

    return { grossPay, totalDeductions, netPay: grossPay - totalDeductions };
};

// ==============================
// Payroll Runs
// ==============================
export const generatePayroll = async (req, res) => {
    try {
        const { period } = req.body; // "YYYY-MM"

        if (!period) {
            return res.status(400).json({ success: false, message: "Period is required." });
        }

        const existing = await payrollRunModel.findOne({ period });
        if (existing) {
            return res.status(409).json({ success: false, message: `Payroll for ${period} has already been generated.` });
        }

        const structures = await salaryStructureModel.find({});

        if (structures.length === 0) {
            return res.status(400).json({ success: false, message: "No salary structures configured yet." });
        }

        const run = await payrollRunModel.create({
            period,
            generatedBy: req.user.id,
            employeeCount: structures.length,
        });

        let totalGross = 0, totalDeductions = 0, totalNet = 0;

        const payslips = structures.map((s) => {
            const { grossPay, totalDeductions: ded, netPay } = computePayslip(s);
            totalGross += grossPay;
            totalDeductions += ded;
            totalNet += netPay;

            return {
                payrollRunId: run._id,
                employeeId: s.employeeId,
                period,
                basic: s.basic,
                hra: s.hra,
                conveyance: s.conveyance,
                medicalAllowance: s.medicalAllowance,
                specialAllowance: s.specialAllowance,
                grossPay,
                providentFund: s.providentFund,
                professionalTax: s.professionalTax,
                incomeTax: s.incomeTax,
                otherDeductions: s.otherDeductions,
                totalDeductions: ded,
                netPay,
            };
        });

        await payslipModel.insertMany(payslips);

        run.totalGross = totalGross;
        run.totalDeductions = totalDeductions;
        run.totalNet = totalNet;
        await run.save();

        logAudit(req, "payroll.generate", `Generated payroll run for ${period} (${structures.length} employees)`, { type: "PayrollRun", id: run._id });

        return res.status(201).json({ success: true, message: "Payroll generated successfully.", data: run });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getPayrollRuns = async (req, res) => {
    try {
        const runs = await payrollRunModel.find({}).sort({ period: -1 });
        return res.status(200).json({ success: true, data: runs });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getPayrollRunDetail = async (req, res) => {
    try {
        const { id } = req.params;
        const run = await payrollRunModel.findById(id);

        if (!run) {
            return res.status(404).json({ success: false, message: "Payroll run not found." });
        }

        const payslips = await payslipModel
            .find({ payrollRunId: id })
            .populate("employeeId", "employeeId firstName lastName department");

        return res.status(200).json({ success: true, data: { run, payslips } });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const approvePayrollRun = async (req, res) => {
    try {
        const { id } = req.params;
        const run = await payrollRunModel.findById(id);

        if (!run) {
            return res.status(404).json({ success: false, message: "Payroll run not found." });
        }

        run.status = "Approved";
        run.approvedBy = req.user.id;
        run.approvedAt = new Date();
        await run.save();

        const payslips = await payslipModel.find({ payrollRunId: id });
        payslips.forEach((p) => notify(p.employeeId, "Payslip ready", `Your payslip for ${run.period} is ready.`, "General", "/payroll/payslips"));

        logAudit(req, "payroll.approve", `Approved payroll run for ${run.period}`, { type: "PayrollRun", id: run._id });

        return res.status(200).json({ success: true, message: "Payroll run approved.", data: run });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const markPayrollPaid = async (req, res) => {
    try {
        const { id } = req.params;
        const run = await payrollRunModel.findByIdAndUpdate(
            id,
            { status: "Paid", paidAt: new Date() },
            { new: true }
        );

        if (!run) {
            return res.status(404).json({ success: false, message: "Payroll run not found." });
        }

        logAudit(req, "payroll.mark_paid", `Marked payroll run for ${run.period} as paid`, { type: "PayrollRun", id: run._id });

        return res.status(200).json({ success: true, message: "Payroll run marked as paid.", data: run });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ==============================
// Payslips
// ==============================
export const getMyPayslips = async (req, res) => {
    try {
        const payslips = await payslipModel.find({ employeeId: req.user.id }).sort({ period: -1 });
        return res.status(200).json({ success: true, data: payslips });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getPayslipById = async (req, res) => {
    try {
        const { id } = req.params;
        const isManager = ["Admin", "HR"].includes(req.user.role);

        const filter = isManager ? { _id: id } : { _id: id, employeeId: req.user.id };

        const payslip = await payslipModel.findOne(filter).populate("employeeId", "employeeId firstName lastName department designation");

        if (!payslip) {
            return res.status(404).json({ success: false, message: "Payslip not found." });
        }

        return res.status(200).json({ success: true, data: payslip });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
