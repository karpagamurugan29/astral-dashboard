import express from "express";
import { register, login, logout, forgotPassword, resetPassword, session, changePassword, updateProfile, } from "../controller/auth.controller.js";
import { AddEmployee, ModifyEmployee, GetEmployeeById, GetAllEmployees, DeleteEmployee, UpdateEmployeeRole, GetEmployeeHistory, } from "../controller/employee.controller.js";
import authMiddleWare from "../middleware/auth.middleware.js";
import authorize from "../middleware/permission.middleware.js";
import { attendanceHistory, checkIn, checkOut, todayAttendance, teamAttendance, requestRegularization, getMyRegularizations, getPendingRegularizations, decideRegularization } from "../controller/attentance.controller.js";
import { applyLeave, approveLeave, cancelLeave, getAllLeaves, leaveBalance, leaveDetails, leaveHistory, pendingLeaves, rejectLeave, teamLeaveCalendar } from "../controller/leave.controller.js";
import { getOnboardingList, updateOnboardingTask, initiateOffboarding, getOffboardingList, updateOffboardingTask, completeOffboarding } from "../controller/lifecycle.controller.js";
import { createProject, updateProject, deleteProject, getProjectById, getAllProjects, addProjectMember, removeProjectMember } from "../controller/project.controller.js";
import { getClients, getClientById, createClient, updateClient, deleteClient } from "../controller/auditClient.controller.js";
import { getAuditInsights, getTodayCheckins, remindCheckin } from "../controller/auditInsights.controller.js";
import { cronAutoCheckout, runAutoCheckoutNow } from "../controller/cron.controller.js";
import { checkinLogReport, auditHoursReport, auditProjectsReport } from "../controller/workbenchReport.controller.js";
import { getLocationLog } from "../controller/locationLog.controller.js";
import { createAudit, updateAudit, deleteAudit, getAuditById, getAllAudits, addAuditMember, removeAuditMember, startAuditTimer, stopAuditTimer, getMyActiveAuditTimer } from "../controller/auditEngagement.controller.js";
import { getDepartments, createDepartment, updateDepartment, deleteDepartment } from "../controller/department.controller.js";
import { getDesignations, createDesignation, updateDesignation, deleteDesignation } from "../controller/designation.controller.js";
import { getExpenses, createExpense, updateExpenseStatus, deleteExpense } from "../controller/expense.controller.js";
import { getAssets, createAsset, updateAsset, assignAsset, returnAsset, deleteAsset } from "../controller/asset.controller.js";
import { getTickets, createTicket, updateTicketStatus, addTicketComment } from "../controller/ticket.controller.js";
import { getAnnouncements, createAnnouncement, deleteAnnouncement } from "../controller/announcement.controller.js";
import { getBranches, createBranch, updateBranch, deleteBranch } from "../controller/branch.controller.js";
import { getHolidays, createHoliday, updateHoliday, deleteHoliday, getShifts, createShift, updateShift, assignShift } from "../controller/calendar.controller.js";
import { getRoles, updateRolePermissions, getMyPermissions } from "../controller/role.controller.js";
import { getAccessOverview, updateDepartmentAccess, updateDesignationAccess, updateEmployeeAccess } from "../controller/access.controller.js";
import { getAuditLogs } from "../controller/auditLog.controller.js";
import { getCompanySettings, updateCompanySettings, getLeaveSettings, updateLeaveSettings } from "../controller/settings.controller.js";
import { getNotifications, markNotificationRead, markAllNotificationsRead } from "../controller/notification.controller.js";
import { uploadDocument, getDocuments, deleteDocument } from "../controller/document.controller.js";
import upload from "../middleware/upload.middleware.js";
import { getSalaryStructure, saveSalaryStructure, generatePayroll, getPayrollRuns, getPayrollRunDetail, approvePayrollRun, markPayrollPaid, getMyPayslips, getPayslipById } from "../controller/payroll.controller.js";
import { requestLoan, getMyLoans, getAllLoans, decideLoan, markLoanDisbursed } from "../controller/loanAdvance.controller.js";
import { activateLicense, getLicenseStatus, renewLicense } from "../controller/license.controller.js";
import { getTasks, getTaskById, createTask, updateTask, updateTaskStatus, addTaskComment, deleteTask } from "../controller/task.controller.js";
import { getDashboardSummary, getAttendanceTrend, getLeaveTrend, getHeadcountByDepartment, getTaskStatusBreakdown, getLeaveBreakdown, getProjectProgress } from "../controller/dashboard.controller.js";
import { attendanceReport, leaveReport, payrollReport, headcountReport, expenseReport, projectReport, taskReport } from "../controller/report.controller.js";


const router = express.Router();

// Shorthand factories — most "manage" endpoints are Admin/HR; approvals also allow Manager/Team
// Lead. Each call site passes the module it belongs to (see ALL_PERMISSION_MODULES in
// role.controller.js) so Roles & Permissions can actually revoke that module per role; pass
// undefined/omit to fall back to a plain role-name gate for routes outside the module catalog.
const adminHR = (module) => authorize(module, "Admin", "HR");
const adminHRManager = (module) => authorize(module, "Admin", "HR", "Manager", "Team Lead");
const adminOnly = (module) => authorize(module, "Admin");


// Authentication
router.post("/login", login);
router.post("/register", register);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

router.get("/session", authMiddleWare, session);
router.get("/auth/profile", authMiddleWare, session);
router.put("/auth/profile", authMiddleWare, updateProfile);
router.post("/auth/change-password", authMiddleWare, changePassword);

router.post("/logout", authMiddleWare, logout);


// License & Activation — Admin only, this gates the whole install
router.post("/license/activate", authMiddleWare, adminOnly(), activateLicense);
router.get("/license/status", authMiddleWare, adminOnly(), getLicenseStatus);
router.put("/license/renew", authMiddleWare, adminOnly(), renewLicense);


// Employees
router.get("/employees", authMiddleWare, GetAllEmployees);
router.get("/employees/:id", authMiddleWare, GetEmployeeById);
router.post("/employees", authMiddleWare, adminHR("employees"), AddEmployee);
router.put("/employees/:id", authMiddleWare, adminHR("employees"), ModifyEmployee);
router.put("/employees/:id/role", authMiddleWare, adminOnly("roles"), UpdateEmployeeRole);
router.put("/employees/:id/shift", authMiddleWare, adminHR("employees"), assignShift);
router.delete("/employees/:id", authMiddleWare, adminOnly("employees"), DeleteEmployee);
router.get("/employees/:id/history", authMiddleWare, GetEmployeeHistory);

// Onboarding / Offboarding — before the generic ":id" verbs above would ever
// collide, since these are distinct sub-resources, not employee CRUD itself.
router.get("/onboarding", authMiddleWare, adminHR("employees"), getOnboardingList);
router.put("/employees/:id/onboarding/:taskIndex", authMiddleWare, adminHR("employees"), updateOnboardingTask);
router.get("/offboarding", authMiddleWare, adminHR("employees"), getOffboardingList);
router.post("/employees/:id/offboard", authMiddleWare, adminHR("employees"), initiateOffboarding);
router.put("/employees/:id/offboarding/:taskIndex", authMiddleWare, adminHR("employees"), updateOffboardingTask);
router.put("/employees/:id/offboard/complete", authMiddleWare, adminHR("employees"), completeOffboarding);


// Roles & Permissions
router.get("/roles/my-permissions", authMiddleWare, getMyPermissions);
router.get("/roles", authMiddleWare, adminOnly("roles"), getRoles);
router.put("/roles/:role/permissions", authMiddleWare, adminOnly("roles"), updateRolePermissions);
router.get("/access", authMiddleWare, adminOnly("roles"), getAccessOverview);
router.put("/access/department/:name", authMiddleWare, adminOnly("roles"), updateDepartmentAccess);
router.put("/access/designation/:name", authMiddleWare, adminOnly("roles"), updateDesignationAccess);
router.put("/access/employee/:id", authMiddleWare, adminOnly("roles"), updateEmployeeAccess);

// Audit Logs
router.get("/audit-logs", authMiddleWare, adminHR("audit-logs"), getAuditLogs);


// Attendance
router.post("/attendance/check-in", authMiddleWare, checkIn);
router.post("/attendance/check-out", authMiddleWare, checkOut);
router.get("/attendance/today", authMiddleWare, todayAttendance);
router.get("/attendance/history", authMiddleWare, attendanceHistory);
router.get("/attendance/team", authMiddleWare, adminHRManager("attendance"), teamAttendance);
router.get("/location-log", authMiddleWare, adminHRManager("attendance"), getLocationLog);
// 8 PM auto check-out: Vercel Cron → /cron/auto-checkout (secret); Admin can also run it now.
router.get("/cron/auto-checkout", cronAutoCheckout);
router.post("/attendance/auto-checkout/run", authMiddleWare, adminOnly("attendance"), runAutoCheckoutNow);

// Attendance regularization — "pending" registered before the ":id" catch-all
router.post("/attendance/regularize", authMiddleWare, requestRegularization);
router.get("/attendance/regularize/my", authMiddleWare, getMyRegularizations);
router.get("/attendance/regularize/pending", authMiddleWare, adminHRManager("attendance"), getPendingRegularizations);
router.put("/attendance/regularize/:id/decide", authMiddleWare, adminHRManager("attendance"), decideRegularization);


// Employee leave
router.post("/leave/apply", authMiddleWare, applyLeave);
router.get("/leave/history", authMiddleWare, leaveHistory);
router.get("/leave/balance", authMiddleWare, leaveBalance);

// Manager / HR — registered before the "/leave/:id" catch-all below, otherwise
// Express would match "pending"/"all" as the :id param instead of these routes.
router.get("/leave/pending", authMiddleWare, adminHRManager("leave"), pendingLeaves);
router.put("/leave/approve/:id", authMiddleWare, adminHRManager("leave"), approveLeave);
router.put("/leave/reject/:id", authMiddleWare, adminHRManager("leave"), rejectLeave);

// Admin
router.get("/leave/all", authMiddleWare, adminHR("leave"), getAllLeaves);
router.get("/leave/team-calendar", authMiddleWare, teamLeaveCalendar);

router.get("/leave/:id", authMiddleWare, leaveDetails);
router.put("/leave/cancel/:id", authMiddleWare, cancelLeave);


// Projects
router.get("/projects", authMiddleWare, getAllProjects);
router.get("/projects/:id", authMiddleWare, getProjectById);
router.post("/projects", authMiddleWare, adminHRManager("projects"), createProject);
router.put("/projects/:id", authMiddleWare, adminHRManager("projects"), updateProject);
router.delete("/projects/:id", authMiddleWare, adminHRManager("projects"), deleteProject);
router.post("/projects/:id/members", authMiddleWare, adminHRManager("projects"), addProjectMember);
router.delete("/projects/:id/members/:userId", authMiddleWare, adminHRManager("projects"), removeProjectMember);

// Audit clients — one client has many audit engagements
router.get("/audit-clients", authMiddleWare, getClients);
router.get("/audit-clients/:id", authMiddleWare, getClientById);
router.post("/audit-clients", authMiddleWare, adminHRManager("projects"), createClient);
router.put("/audit-clients/:id", authMiddleWare, adminHRManager("projects"), updateClient);
router.delete("/audit-clients/:id", authMiddleWare, adminHRManager("projects"), deleteClient);

// Audit engagements — managed under the "projects" permission; any assigned member can run the timer
router.get("/audits", authMiddleWare, getAllAudits);
router.get("/audits/timer/active", authMiddleWare, getMyActiveAuditTimer);
router.get("/audits/:id", authMiddleWare, getAuditById);
router.post("/audits", authMiddleWare, adminHRManager("projects"), createAudit);
router.put("/audits/:id", authMiddleWare, adminHRManager("projects"), updateAudit);
router.delete("/audits/:id", authMiddleWare, adminHRManager("projects"), deleteAudit);
router.post("/audits/:id/members", authMiddleWare, adminHRManager("projects"), addAuditMember);
router.delete("/audits/:id/members/:userId", authMiddleWare, adminHRManager("projects"), removeAuditMember);
router.post("/audits/:id/timer/start", authMiddleWare, startAuditTimer);
router.post("/audits/:id/timer/stop", authMiddleWare, stopAuditTimer);

// Tasks
router.get("/tasks", authMiddleWare, getTasks);
router.get("/tasks/:id", authMiddleWare, getTaskById);
router.post("/tasks", authMiddleWare, adminHRManager("tasks"), createTask);
router.put("/tasks/:id", authMiddleWare, adminHRManager("tasks"), updateTask);
router.put("/tasks/:id/status", authMiddleWare, updateTaskStatus);
router.post("/tasks/:id/comments", authMiddleWare, addTaskComment);
router.delete("/tasks/:id", authMiddleWare, adminHRManager("tasks"), deleteTask);


// Departments
router.get("/departments", authMiddleWare, getDepartments);
router.post("/departments", authMiddleWare, adminOnly("departments"), createDepartment);
router.put("/departments/:id", authMiddleWare, adminOnly("departments"), updateDepartment);
router.delete("/departments/:id", authMiddleWare, adminOnly("departments"), deleteDepartment);

// Designations
router.get("/designations", authMiddleWare, getDesignations);
router.post("/designations", authMiddleWare, adminOnly("designations"), createDesignation);
router.put("/designations/:id", authMiddleWare, adminOnly("designations"), updateDesignation);
router.delete("/designations/:id", authMiddleWare, adminOnly("designations"), deleteDesignation);

// Branches
router.get("/branches", authMiddleWare, getBranches);
router.post("/branches", authMiddleWare, adminOnly("branches"), createBranch);
router.put("/branches/:id", authMiddleWare, adminOnly("branches"), updateBranch);
router.delete("/branches/:id", authMiddleWare, adminOnly("branches"), deleteBranch);

// Work calendar — holidays
router.get("/holidays", authMiddleWare, getHolidays);
router.post("/holidays", authMiddleWare, adminOnly("attendance"), createHoliday);
router.put("/holidays/:id", authMiddleWare, adminOnly("attendance"), updateHoliday);
router.delete("/holidays/:id", authMiddleWare, adminOnly("attendance"), deleteHoliday);

// Work calendar — shifts
router.get("/shifts", authMiddleWare, getShifts);
router.post("/shifts", authMiddleWare, adminOnly("attendance"), createShift);
router.put("/shifts/:id", authMiddleWare, adminOnly("attendance"), updateShift);


// Expenses
router.get("/expenses", authMiddleWare, getExpenses);
router.post("/expenses", authMiddleWare, upload.single("receipt"), createExpense);
router.put("/expenses/:id/status", authMiddleWare, adminHRManager("expenses"), updateExpenseStatus);
router.delete("/expenses/:id", authMiddleWare, deleteExpense);

// Assets
router.get("/assets", authMiddleWare, getAssets);
router.post("/assets", authMiddleWare, adminHR("assets"), createAsset);
router.put("/assets/:id", authMiddleWare, adminHR("assets"), updateAsset);
router.put("/assets/:id/assign", authMiddleWare, adminHR("assets"), assignAsset);
router.put("/assets/:id/return", authMiddleWare, adminHR("assets"), returnAsset);
router.delete("/assets/:id", authMiddleWare, adminHR("assets"), deleteAsset);

// Helpdesk Tickets
router.get("/tickets", authMiddleWare, getTickets);
router.post("/tickets", authMiddleWare, createTicket);
router.put("/tickets/:id/status", authMiddleWare, adminHRManager("helpdesk"), updateTicketStatus);
router.post("/tickets/:id/comments", authMiddleWare, addTicketComment);

// Announcements
router.get("/announcements", authMiddleWare, getAnnouncements);
router.post("/announcements", authMiddleWare, adminHR("announcements"), createAnnouncement);
router.delete("/announcements/:id", authMiddleWare, adminHR("announcements"), deleteAnnouncement);


// Payroll — salary structures (ownership/role checked inside the controller
// for reads, since an employee is allowed to see their own structure)
router.get("/salary-structures/:employeeId", authMiddleWare, getSalaryStructure);
router.post("/salary-structures", authMiddleWare, adminHR("payroll"), saveSalaryStructure);

// Payroll — runs
router.post("/payroll/generate", authMiddleWare, adminOnly("payroll"), generatePayroll);
router.get("/payroll", authMiddleWare, adminHR("payroll"), getPayrollRuns);
router.get("/payroll/:id", authMiddleWare, adminHR("payroll"), getPayrollRunDetail);
router.put("/payroll/:id/approve", authMiddleWare, adminOnly("payroll"), approvePayrollRun);
router.put("/payroll/:id/mark-paid", authMiddleWare, adminOnly("payroll"), markPayrollPaid);

// Payslips — always self-scoped inside the controller
router.get("/payslips", authMiddleWare, getMyPayslips);
router.get("/payslips/:id", authMiddleWare, getPayslipById);

// Loans / Advances
router.post("/loans-advances", authMiddleWare, requestLoan);
router.get("/loans-advances/my", authMiddleWare, getMyLoans);
router.get("/loans-advances", authMiddleWare, adminHR("payroll"), getAllLoans);
router.put("/loans-advances/:id/decide", authMiddleWare, adminHR("payroll"), decideLoan);
router.put("/loans-advances/:id/disburse", authMiddleWare, adminHR("payroll"), markLoanDisbursed);


// Dashboard
router.get("/dashboard/summary", authMiddleWare, getDashboardSummary);
router.get("/dashboard/attendance-trend", authMiddleWare, getAttendanceTrend);
router.get("/dashboard/leave-trend", authMiddleWare, getLeaveTrend);
router.get("/dashboard/headcount", authMiddleWare, getHeadcountByDepartment);
router.get("/dashboard/task-status", authMiddleWare, getTaskStatusBreakdown);
router.get("/dashboard/leave-breakdown", authMiddleWare, getLeaveBreakdown);
router.get("/dashboard/project-progress", authMiddleWare, getProjectProgress);
router.get("/dashboard/audit-insights", authMiddleWare, getAuditInsights);
router.get("/dashboard/today-checkins", authMiddleWare, adminHRManager("attendance"), getTodayCheckins);
router.post("/dashboard/remind-checkin", authMiddleWare, adminHRManager("attendance"), remindCheckin);

// Notifications
router.get("/notifications", authMiddleWare, getNotifications);
router.put("/notifications/:id/read", authMiddleWare, markNotificationRead);
router.put("/notifications/read-all", authMiddleWare, markAllNotificationsRead);

// Documents
router.post("/documents/upload", authMiddleWare, upload.single("file"), uploadDocument);
router.get("/documents", authMiddleWare, getDocuments);
router.delete("/documents/:id", authMiddleWare, deleteDocument);

// Reports — all admin/HR visibility, real numbers pulled from the same
// collections the rest of the app writes to (no hardcoded stats anywhere here)
router.get("/reports/attendance", authMiddleWare, adminHRManager("reports"), attendanceReport);
router.get("/reports/leave", authMiddleWare, adminHRManager("reports"), leaveReport);
router.get("/reports/payroll", authMiddleWare, adminHR("reports"), payrollReport);
router.get("/reports/headcount", authMiddleWare, adminHRManager("reports"), headcountReport);
router.get("/reports/expenses", authMiddleWare, adminHRManager("reports"), expenseReport);
router.get("/reports/projects", authMiddleWare, adminHRManager("reports"), projectReport);
router.get("/reports/tasks", authMiddleWare, adminHRManager("reports"), taskReport);
router.get("/reports/checkins", authMiddleWare, adminHRManager("reports"), checkinLogReport);
router.get("/reports/audit-hours", authMiddleWare, adminHRManager("reports"), auditHoursReport);
router.get("/reports/audit-projects", authMiddleWare, adminHRManager("reports"), auditProjectsReport);

// Settings
router.get("/settings", authMiddleWare, getCompanySettings);
router.put("/settings", authMiddleWare, adminOnly("settings"), updateCompanySettings);
router.get("/settings/leave-policy", authMiddleWare, getLeaveSettings);
router.put("/settings/leave-policy", authMiddleWare, adminOnly("settings"), updateLeaveSettings);


export default router;
