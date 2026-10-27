import express from "express";
import { register, login, logout, forgotPassword, resetPassword, session, changePassword, updateProfile, } from "../controller/auth.controller.js";
import { AddEmployee, ModifyEmployee, GetEmployeeById, GetAllEmployees, DeleteEmployee, UpdateEmployeeRole, GetEmployeeHistory, birthdayLineUp } from "../controller/employee.controller.js";
import authMiddleWare from "../middleware/auth.middleware.js";
import authorize from "../middleware/permission.middleware.js";
import { attendanceHistory, checkIn, checkOut, todayAttendance, teamAttendance, requestRegularization, getMyRegularizations, getPendingRegularizations, decideRegularization, subordinateAttendance, exportAttendance, teamAttendanceRange } from "../controller/attentance.controller.js";
import { applyLeave, approveLeave, cancelLeave, getAllLeaves, leaveBalance, leaveDetails, leaveHistory, pendingLeaves, rejectLeave, teamLeaveCalendar } from "../controller/leave.controller.js";
import { getOnboardingList, updateOnboardingTask, sendWelcome, closeOnboarding, initiateOffboarding, getOffboardingList, updateOffboardingTask, completeOffboarding } from "../controller/lifecycle.controller.js";
import { createProject, updateProject, deleteProject, getProjectById, getAllProjects, addProjectMember, removeProjectMember } from "../controller/project.controller.js";
import { getClients, getClientById, createClient, updateClient, deleteClient } from "../controller/auditClient.controller.js";
import { getAuditInsights, getTodayCheckins, remindCheckin } from "../controller/auditInsights.controller.js";
import { saveWorkflow, getWorkflowTemplate, setLogStep, switchTimerStep, migrateWorkflow } from "../controller/auditWorkflow.controller.js";
import { taskAction, assignTask, tickChecklist, commentTask, resolveComment, uploadWorkpaper, downloadWorkpaper, tickTask } from "../controller/auditTask.controller.js";
import { myTimesheet, addEntry, updateEntry, deleteEntry, submitWeek, approvals as timesheetApprovals, decide as decideTimesheet, pendingAdjustments, requestAdjustment, decideAdjustment } from "../controller/timesheet.controller.js";
import { listTemplates, createTemplate, getTemplate, updateTemplate, newVersion, duplicateTemplate, activateTemplate, deactivateTemplate } from "../controller/workflowTemplate.controller.js";
import { listProjects as listAuditProjects, createProject as createAuditProject, getProject as getAuditProject, updateProject as updateAuditProject, deleteProject as deleteAuditProject } from "../controller/auditProject.controller.js";
import { myWork, allocation, dashboard as auditDashboard } from "../controller/auditWork.controller.js";

import { cronAutoCheckout, cronAuditTimers, runAutoCheckoutNow } from "../controller/cron.controller.js";
import { checkinLogReport, auditHoursReport, auditProjectsReport } from "../controller/workbenchReport.controller.js";
import { getLocationLog } from "../controller/locationLog.controller.js";
import { createAudit, updateAudit, deleteAudit, getAuditById, getAllAudits, addAuditMember, removeAuditMember, startAuditTimer, stopAuditTimer, getMyActiveAuditTimer } from "../controller/auditEngagement.controller.js";
import { getDepartments, createDepartment, updateDepartment, deleteDepartment } from "../controller/department.controller.js";
import { getDesignations, createDesignation, updateDesignation, deleteDesignation } from "../controller/designation.controller.js";
import { getExpenses, createExpense, updateExpense, updateExpenseStatus, deleteExpense, getReceipt } from "../controller/expense.controller.js";
import { getAssets, myAssets, createAsset, updateAsset, assignAsset, returnAsset, deleteAsset } from "../controller/asset.controller.js";
import { getTickets, getTicketMeta, getTicket, createTicket, updateTicketStatus, assignTicket, triageTicket, addTicketComment, ticketFeedback, downloadTicketFile, getHelpdeskSettings, saveHelpdeskSettings } from "../controller/ticket.controller.js";
import { getAnnouncements, createAnnouncement, deleteAnnouncement } from "../controller/announcement.controller.js";
import { getBranches, createBranch, updateBranch, deleteBranch } from "../controller/branch.controller.js";
import { getHolidays, createHoliday, updateHoliday, deleteHoliday, getShifts, createShift, updateShift, assignShift } from "../controller/calendar.controller.js";
import { getRoles, updateRolePermissions, getMyPermissions } from "../controller/role.controller.js";
import { getAccessOverview, updateDepartmentAccess, updateDesignationAccess, updateEmployeeAccess } from "../controller/access.controller.js";
import { getAuditLogs } from "../controller/auditLog.controller.js";
import { getCompanySettings, updateCompanySettings, getLeaveSettings, updateLeaveSettings } from "../controller/settings.controller.js";
import { getNotifications, markNotificationRead, markAllNotificationsRead } from "../controller/notification.controller.js";
import { uploadDocument, getDocuments, deleteDocument, downloadDocument } from "../controller/document.controller.js";
import { utilisationReport, profitabilityReport, punctualityReport, complianceReport, businessPulse, executiveOverview } from "../controller/businessReport.controller.js";
import { chatContacts, listConversations, createConversation, getConversation, getMessages, sendMessage, editMessage, deleteMessage, reactToMessage, starMessage, markRead, setTyping, updateConversation, chatUpdates, chatUnread, chatFile, searchMessages, deleteGroup, adminListGroups, adminUpdateGroup } from "../controller/chat.controller.js";
import { listProjects, projectWorkspace, createProjectV2, updateProjectV2, startProjectTimer, stopProjectTimer, createProjectTask, updateProjectTask, moveTask, commentOnTask, deleteProjectTask, myTasks, getTask, watchTask, bulkMoveTasks, closeTask, bulkCloseTasks, reopenTask } from "../controller/projectWorkspace.controller.js";
import { orgTree, setManager } from "../controller/org.controller.js";
import { uploadMyPhoto, removeMyPhoto, uploadEmployeePhoto, servePhoto } from "../controller/photo.controller.js";
import { listFiles, getFile, downloadFile, uploadFiles, uploadVersion, shareFile, unshareFile, updateFile, starFile, deleteFile, restoreFile, createFolder, updateFolder, deleteFolder, restoreFolder, shareFolder, shareTargets } from "../controller/files.controller.js";
import { getBillingSettings, updateBillingSettings, auditEconomics, listInvoices, getInvoice, createInvoice, updateInvoice, issueInvoice, recordPayment, cancelInvoice, setCharges, prepareInvoice, reviewTimeLog } from "../controller/billing.controller.js";
import multer from "multer";
// documents go to MongoDB (GridFS), so keep them in memory rather than on disk
const docUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
import upload from "../middleware/upload.middleware.js";
import { getSalaryStructure, saveSalaryStructure, generatePayroll, getPayrollRuns, getPayrollRunDetail, approvePayrollRun, markPayrollPaid, getMyPayslips, getPayslipById } from "../controller/payroll.controller.js";
import { requestLoan, getMyLoans, getAllLoans, decideLoan, markLoanDisbursed } from "../controller/loanAdvance.controller.js";
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
router.post("/auth/profile/photo", authMiddleWare, docUpload.single("photo"), uploadMyPhoto);
router.delete("/auth/profile/photo", authMiddleWare, removeMyPhoto);
router.get("/photos/:id", servePhoto); // public: <img> tags can't send the token
router.post("/auth/change-password", authMiddleWare, changePassword);

router.post("/logout", authMiddleWare, logout);

// Employees
router.get("/employees", authMiddleWare, GetAllEmployees);
router.get("/employees/birthdays", authMiddleWare, birthdayLineUp);
router.post("/employees/:id/photo", authMiddleWare, adminHR("employees"), docUpload.single("photo"), uploadEmployeePhoto);
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
router.post("/employees/:id/onboarding/welcome", authMiddleWare, adminHR("employees"), sendWelcome);
router.post("/onboarding/close", authMiddleWare, adminHR("employees"), closeOnboarding);
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
router.get("/attendance/subordinates", authMiddleWare, adminHRManager("attendance"), subordinateAttendance);
router.get("/attendance/team-range", authMiddleWare, adminHRManager("attendance"), teamAttendanceRange);
router.get("/location-log", authMiddleWare, adminHRManager("attendance"), getLocationLog);
// 8 PM auto check-out: Vercel Cron → /cron/auto-checkout (secret); Admin can also run it now.
router.get("/cron/auto-checkout", cronAutoCheckout);
// 7 PM: forgotten audit timers (also stopped by the local scheduler and lazily on every read)
router.get("/cron/audit-timers", cronAuditTimers);
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
router.get("/projects", authMiddleWare, listProjects);
router.get("/projects/:id", authMiddleWare, getProjectById);
router.get("/projects/:id/workspace", authMiddleWare, projectWorkspace);
router.post("/projects/:id/timer/start", authMiddleWare, startProjectTimer);
router.post("/projects/:id/timer/stop", authMiddleWare, stopProjectTimer);
router.post("/projects/:id/tasks", authMiddleWare, createProjectTask);
router.post("/projects", authMiddleWare, createProjectV2); // permission checked in the controller
router.put("/projects/:id", authMiddleWare, updateProjectV2); // managers or the project lead
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
router.get("/audits/:id/economics", authMiddleWare, auditEconomics);
// tasks: the old one-click tick maps onto the task lifecycle
router.put("/audits/:id/milestones/:key", authMiddleWare, tickTask);
const workpaperUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 10 } });
router.post("/audits/:id/tasks/:key/action", authMiddleWare, taskAction);
router.put("/audits/:id/tasks/:key/assign", authMiddleWare, assignTask);
router.put("/audits/:id/tasks/:key/checklist/:index", authMiddleWare, tickChecklist);
router.post("/audits/:id/tasks/:key/comments", authMiddleWare, commentTask);
router.put("/audits/:id/tasks/:key/comments/:cid/resolve", authMiddleWare, resolveComment);
router.post("/audits/:id/tasks/:key/files", authMiddleWare, workpaperUpload.array("files", 10), uploadWorkpaper);
router.get("/audits/:id/tasks/:key/files/:fileId", authMiddleWare, downloadWorkpaper);
router.get("/audits/:id/workflow/migrate", authMiddleWare, migrateWorkflow);
router.post("/audits/:id/workflow/migrate", authMiddleWare, migrateWorkflow);

// timesheets (audit time): my week, manual entries, submit, approvals, corrections
router.get("/timesheets/me", authMiddleWare, myTimesheet);
router.post("/timesheets/entries", authMiddleWare, addEntry);
router.put("/timesheets/entries/:id", authMiddleWare, updateEntry);
router.delete("/timesheets/entries/:id", authMiddleWare, deleteEntry);
router.post("/timesheets/submit", authMiddleWare, submitWeek);
router.get("/timesheets/approvals", authMiddleWare, timesheetApprovals);
router.post("/timesheets/decide", authMiddleWare, decideTimesheet);
router.get("/timesheets/adjustments", authMiddleWare, pendingAdjustments);
router.post("/timesheets/entries/:id/adjustments", authMiddleWare, requestAdjustment);
router.post("/timesheets/entries/:id/adjustments/:aid", authMiddleWare, decideAdjustment);

// workflow template library
router.get("/workflow-templates", authMiddleWare, listTemplates);
router.post("/workflow-templates", authMiddleWare, createTemplate);
router.get("/workflow-templates/:id", authMiddleWare, getTemplate);
router.put("/workflow-templates/:id", authMiddleWare, updateTemplate);
router.post("/workflow-templates/:id/version", authMiddleWare, newVersion);
router.post("/workflow-templates/:id/duplicate", authMiddleWare, duplicateTemplate);
router.post("/workflow-templates/:id/activate", authMiddleWare, activateTemplate);
router.post("/workflow-templates/:id/deactivate", authMiddleWare, deactivateTemplate);

// audit projects (Company → Project → Engagement)
router.get("/audit-projects", authMiddleWare, listAuditProjects);
router.post("/audit-projects", authMiddleWare, createAuditProject);
router.get("/audit-projects/:id", authMiddleWare, getAuditProject);
router.put("/audit-projects/:id", authMiddleWare, updateAuditProject);
router.delete("/audit-projects/:id", authMiddleWare, deleteAuditProject);

// My Work, work allocation, management dashboard
router.get("/audit-work/me", authMiddleWare, myWork);
router.get("/audit-work/allocation", authMiddleWare, allocation);
router.get("/audit-work/dashboard", authMiddleWare, auditDashboard);
router.put("/audits/:id/charges", authMiddleWare, setCharges);
router.put("/audits/timelogs/:id/review", authMiddleWare, reviewTimeLog);
// workflow: seniors configure steps; time is logged against a step
router.get("/audits/workflow-template", authMiddleWare, getWorkflowTemplate);
router.put("/audits/:id/workflow", authMiddleWare, saveWorkflow);
router.put("/audits/timelogs/:id/step", authMiddleWare, setLogStep);
router.post("/audits/:id/timer/switch", authMiddleWare, switchTimerStep);

// Files: keep, organise and share (one to one, or to a chat group)
const fileUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 10 } });
router.get("/files", authMiddleWare, listFiles);
router.get("/files/share-targets", authMiddleWare, shareTargets);
router.post("/files", authMiddleWare, fileUpload.array("files", 10), uploadFiles);
router.post("/files/folders", authMiddleWare, createFolder);
router.put("/files/folders/:id", authMiddleWare, updateFolder);
router.delete("/files/folders/:id", authMiddleWare, deleteFolder);
router.post("/files/folders/:id/restore", authMiddleWare, restoreFolder);
router.post("/files/folders/:id/share", authMiddleWare, shareFolder);
router.get("/files/:id", authMiddleWare, getFile);
router.get("/files/:id/download", authMiddleWare, downloadFile);
router.post("/files/:id/version", authMiddleWare, fileUpload.single("file"), uploadVersion);
router.post("/files/:id/share", authMiddleWare, shareFile);
router.post("/files/:id/unshare", authMiddleWare, unshareFile);
router.post("/files/:id/star", authMiddleWare, starFile);
router.post("/files/:id/restore", authMiddleWare, restoreFile);
router.put("/files/:id", authMiddleWare, updateFile);
router.delete("/files/:id", authMiddleWare, deleteFile);

// Billing (fees and invoices: firm leadership and Accounts — checked in the controller)
router.get("/billing/settings", authMiddleWare, getBillingSettings);
router.put("/billing/settings", authMiddleWare, updateBillingSettings);
router.get("/invoices", authMiddleWare, listInvoices);
router.post("/invoices", authMiddleWare, createInvoice);
router.post("/invoices/prepare", authMiddleWare, prepareInvoice);
router.get("/invoices/:id", authMiddleWare, getInvoice);
router.put("/invoices/:id", authMiddleWare, updateInvoice);
router.post("/invoices/:id/issue", authMiddleWare, issueInvoice);
router.post("/invoices/:id/payments", authMiddleWare, recordPayment);
router.post("/invoices/:id/cancel", authMiddleWare, cancelInvoice);
router.get("/audits/:id", authMiddleWare, getAuditById);
router.post("/audits", authMiddleWare, adminHRManager("projects"), createAudit);
router.put("/audits/:id", authMiddleWare, adminHRManager("projects"), updateAudit);
router.delete("/audits/:id", authMiddleWare, adminHRManager("projects"), deleteAudit);
router.post("/audits/:id/members", authMiddleWare, adminHRManager("projects"), addAuditMember);
router.delete("/audits/:id/members/:userId", authMiddleWare, adminHRManager("projects"), removeAuditMember);
router.post("/audits/:id/timer/start", authMiddleWare, startAuditTimer);
router.post("/audits/:id/timer/stop", authMiddleWare, stopAuditTimer);

// Tasks
router.get("/tasks/mine", authMiddleWare, myTasks);

// Organisation: reporting tree for everyone; HR / leadership change reporting lines
router.get("/org/tree", authMiddleWare, orgTree);
router.put("/org/:id/manager", authMiddleWare, setManager);
router.get("/tasks", authMiddleWare, getTasks);
router.get("/tasks/:id", authMiddleWare, getTask); // tracker view: notes, history, watchers
router.post("/tasks", authMiddleWare, adminHRManager("tasks"), createTask);
router.put("/tasks/bulk", authMiddleWare, bulkMoveTasks);
router.put("/tasks/bulk-close", authMiddleWare, bulkCloseTasks);
router.post("/tasks/:id/close", authMiddleWare, closeTask);
router.post("/tasks/:id/reopen", authMiddleWare, reopenTask);
router.post("/tasks/:id/watch", authMiddleWare, watchTask);
router.put("/tasks/:id", authMiddleWare, updateProjectTask); // assignee, creator, project lead or manager
router.put("/tasks/:id/move", authMiddleWare, moveTask);
router.put("/tasks/:id/status", authMiddleWare, updateTaskStatus);
router.post("/tasks/:id/comments", authMiddleWare, commentOnTask);
router.delete("/tasks/:id", authMiddleWare, deleteProjectTask);


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
router.post("/expenses", authMiddleWare, docUpload.single("receipt"), createExpense);
router.get("/expenses/:id/receipt", authMiddleWare, getReceipt);
router.get("/expenses/:id/receipt/:name", authMiddleWare, getReceipt);
router.put("/expenses/:id/status", authMiddleWare, adminHRManager("expenses"), updateExpenseStatus);
router.put("/expenses/:id", authMiddleWare, docUpload.single("receipt"), updateExpense); // owner: edit a draft / sent-back claim, resubmit
router.delete("/expenses/:id", authMiddleWare, deleteExpense);

// Assets
router.get("/assets/mine", authMiddleWare, myAssets);
router.get("/assets", authMiddleWare, adminHR("assets"), getAssets);
router.post("/assets", authMiddleWare, adminHR("assets"), createAsset);
router.put("/assets/:id", authMiddleWare, adminHR("assets"), updateAsset);
router.put("/assets/:id/assign", authMiddleWare, adminHR("assets"), assignAsset);
router.put("/assets/:id/return", authMiddleWare, adminHR("assets"), returnAsset);
router.delete("/assets/:id", authMiddleWare, adminHR("assets"), deleteAsset);

// Helpdesk Tickets
// Who may do what is decided per ticket in utils/helpdesk.js (owner / HR desk / assignee / team lead).
const ticketUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 10 } });
router.get("/tickets", authMiddleWare, getTickets);
router.get("/tickets/meta", authMiddleWare, getTicketMeta);
router.post("/tickets", authMiddleWare, ticketUpload.array("files", 10), createTicket);
router.get("/tickets/:id", authMiddleWare, getTicket);
router.put("/tickets/:id", authMiddleWare, triageTicket);
router.put("/tickets/:id/status", authMiddleWare, updateTicketStatus);
router.put("/tickets/:id/assign", authMiddleWare, assignTicket);
router.post("/tickets/:id/comments", authMiddleWare, ticketUpload.array("files", 10), addTicketComment);
router.post("/tickets/:id/feedback", authMiddleWare, ticketFeedback);
router.get("/tickets/:id/files/:fileId", authMiddleWare, downloadTicketFile);
router.get("/helpdesk/settings", authMiddleWare, getHelpdeskSettings);
router.put("/helpdesk/settings", authMiddleWare, saveHelpdeskSettings);

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
router.post("/documents/upload", authMiddleWare, docUpload.single("file"), uploadDocument);
router.get("/documents", authMiddleWare, getDocuments);
router.get("/documents/:id/file", authMiddleWare, downloadDocument);
router.delete("/documents/:id", authMiddleWare, deleteDocument);

// Reports — all admin/HR visibility, real numbers pulled from the same
// collections the rest of the app writes to (no hardcoded stats anywhere here)
router.get("/reports/attendance/export", authMiddleWare, adminHRManager("attendance"), exportAttendance);
router.get("/reports/attendance", authMiddleWare, adminHRManager("reports"), attendanceReport);
router.get("/reports/leave", authMiddleWare, adminHRManager("reports"), leaveReport);
router.get("/reports/payroll", authMiddleWare, adminHR("reports"), payrollReport);
router.get("/reports/headcount", authMiddleWare, adminHRManager("reports"), headcountReport);
router.get("/reports/expenses", authMiddleWare, adminHRManager("reports"), expenseReport);
router.get("/reports/projects", authMiddleWare, adminHRManager("reports"), projectReport);
router.get("/reports/tasks", authMiddleWare, adminHRManager("reports"), taskReport);
router.get("/reports/checkins", authMiddleWare, adminHRManager("reports"), checkinLogReport);
router.get("/reports/utilisation", authMiddleWare, adminHRManager("reports"), utilisationReport);
router.get("/reports/profitability", authMiddleWare, adminHRManager("reports"), profitabilityReport);
router.get("/reports/punctuality", authMiddleWare, adminHRManager("reports"), punctualityReport);
router.get("/reports/compliance", authMiddleWare, adminHRManager("reports"), complianceReport);
router.get("/dashboard/business-pulse", authMiddleWare, businessPulse);
router.get("/reports/overview", authMiddleWare, adminHRManager("reports"), executiveOverview);

// Team chat — any active employee; participants-only access is enforced in the controller
router.get("/chat/contacts", authMiddleWare, chatContacts);
router.get("/chat/conversations", authMiddleWare, listConversations);
router.post("/chat/conversations", authMiddleWare, createConversation);
router.get("/chat/conversations/:id", authMiddleWare, getConversation);
router.put("/chat/conversations/:id", authMiddleWare, updateConversation);
router.delete("/chat/conversations/:id", authMiddleWare, deleteGroup);
router.get("/chat/admin/groups", authMiddleWare, adminListGroups);
router.put("/chat/admin/groups/:id", authMiddleWare, adminUpdateGroup);
router.get("/chat/conversations/:id/messages", authMiddleWare, getMessages);
router.post("/chat/conversations/:id/messages", authMiddleWare, docUpload.single("file"), sendMessage);
router.post("/chat/conversations/:id/read", authMiddleWare, markRead);
router.post("/chat/conversations/:id/typing", authMiddleWare, setTyping);
router.put("/chat/messages/:id", authMiddleWare, editMessage);
router.delete("/chat/messages/:id", authMiddleWare, deleteMessage);
router.post("/chat/messages/:id/react", authMiddleWare, reactToMessage);
router.post("/chat/messages/:id/star", authMiddleWare, starMessage);
router.get("/chat/updates", authMiddleWare, chatUpdates);
router.get("/chat/unread", authMiddleWare, chatUnread);
router.get("/chat/search", authMiddleWare, searchMessages);
router.get("/chat/files/:messageId", authMiddleWare, chatFile);
router.get("/reports/audit-hours", authMiddleWare, adminHRManager("reports"), auditHoursReport);
router.get("/reports/audit-projects", authMiddleWare, adminHRManager("reports"), auditProjectsReport);

// Settings
router.get("/settings", authMiddleWare, getCompanySettings);
router.put("/settings", authMiddleWare, adminOnly("settings"), updateCompanySettings);
router.get("/settings/leave-policy", authMiddleWare, getLeaveSettings);
router.put("/settings/leave-policy", authMiddleWare, adminOnly("settings"), updateLeaveSettings);


export default router;
