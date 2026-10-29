import { lazy, Suspense, useEffect } from 'react';
import './App.css';
import { Login } from './pages/dashboard/Login';
import feather from "feather-icons";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Toaster } from './components/common/Toaster';
import { Provider } from 'react-redux';
import { store } from "./redux/Store"
import { ScreenGuard } from './components/common/ScreenGuard';

// Each screen is its own download, fetched the first time someone opens it, so sign-in and the
// first page load only what they need (all styles still ship up front — see allStyles.js). If a
// deploy replaced the files while the app was open, the old chunk is gone: reload once.
const retry = (load) => load().catch((err) => {
  if (!sessionStorage.getItem('chunk-reload')) { sessionStorage.setItem('chunk-reload', '1'); window.location.reload(); }
  throw err;
});
const loaders = {};
const page = (name, load) => { loaders[name] = load; return lazy(() => retry(load).then((m) => { sessionStorage.removeItem('chunk-reload'); return { default: m[name] }; })); };
const ForgotPassword = page('ForgotPassword', () => import('./pages/dashboard/ForgotPassword'));
const ResetPassword = page('ResetPassword', () => import('./pages/dashboard/ResetPassword'));
const ChangePassword = page('ChangePassword', () => import('./pages/dashboard/ChangePassword'));
const MyProfile = page('MyProfile', () => import('./pages/dashboard/MyProfile'));
const Organisation = page('Organisation', () => import('./pages/dashboard/Organisation'));
const NotificationCenter = page('NotificationCenter', () => import('./pages/dashboard/NotificationCenter'));
const DashContent = page('DashContent', () => import('./pages/dashboard/dash/DashContent'));
const EmployeeGrid = page('EmployeeGrid', () => import('./pages/dashboard/employees/EmployeeGrid'));
const AddEditEmployee = page('AddEditEmployee', () => import('./pages/dashboard/employees/AddEditEmployee'));
const AttendanceToday = page('AttendanceToday', () => import('./pages/dashboard/attendance/AttendanceToday'));
const AttendanceHistory = page('AttendanceHistory', () => import('./pages/dashboard/attendance/AttendanceHistory'));
const ApplyLeave = page('ApplyLeave', () => import('./pages/dashboard/leave/ApplyLeave'));
const LeaveHistory = page('LeaveHistory', () => import('./pages/dashboard/leave/LeaveHistory'));
const LeaveApprovals = page('LeaveApprovals', () => import('./pages/dashboard/leave/LeaveApprovals'));
const DepartmentList = page('DepartmentList', () => import('./pages/dashboard/organization/DepartmentList'));
const DesignationList = page('DesignationList', () => import('./pages/dashboard/organization/DesignationList'));
const BranchList = page('BranchList', () => import('./pages/dashboard/organization/BranchList'));
const ExpenseList = page('ExpenseList', () => import('./pages/dashboard/expense/ExpenseList'));
const ExpenseApprovals = page('ExpenseApprovals', () => import('./pages/dashboard/expense/ExpenseApprovals'));
const AssetList = page('AssetList', () => import('./pages/dashboard/asset/AssetList'));
const MyAssets = page('MyAssets', () => import('./pages/dashboard/asset/AssetList'));
const TicketList = page('TicketList', () => import('./pages/dashboard/helpdesk/TicketList'));
const HRTickets = page('HRTickets', () => import('./pages/dashboard/helpdesk/HRTickets'));
const TicketDetail = page('TicketDetail', () => import('./pages/dashboard/helpdesk/TicketDetail'));
const HelpdeskSettings = page('HelpdeskSettings', () => import('./pages/dashboard/helpdesk/HelpdeskSettings'));
const AnnouncementFeed = page('AnnouncementFeed', () => import('./pages/dashboard/announcements/AnnouncementFeed'));
const ShiftList = page('ShiftList', () => import('./pages/dashboard/calendar/ShiftList'));
const HolidayList = page('HolidayList', () => import('./pages/dashboard/calendar/HolidayList'));
const RolesList = page('RolesList', () => import('./pages/dashboard/roles/RolesList'));
const AccessControl = page('AccessControl', () => import('./pages/dashboard/access/AccessControl'));
const AuditLogViewer = page('AuditLogViewer', () => import('./pages/dashboard/audit/AuditLogViewer'));
const CompanySettings = page('CompanySettings', () => import('./pages/dashboard/settings/CompanySettings'));
const Chat = page('Chat', () => import('./pages/dashboard/chat/Chat'));
const DocumentCenter = page('DocumentCenter', () => import('./pages/dashboard/documents/DocumentCenter'));
const SalaryStructure = page('SalaryStructure', () => import('./pages/dashboard/payroll/SalaryStructure'));
const PayrollProcess = page('PayrollProcess', () => import('./pages/dashboard/payroll/PayrollProcess'));
const Payslips = page('Payslips', () => import('./pages/dashboard/payroll/Payslips'));
const LoansAdvances = page('LoansAdvances', () => import('./pages/dashboard/payroll/LoansAdvances'));
const ProjectsList = page('ProjectsList', () => import('./pages/dashboard/projects/ProjectsList'));
const ProjectDetail = page('ProjectDetail', () => import('./pages/dashboard/projects/ProjectDetail'));
const TasksBoard = page('TasksBoard', () => import('./pages/dashboard/projects/TasksBoard'));
const TodoPage = page('TodoPage', () => import('./pages/dashboard/projects/TodoPage'));
const CalendarPage = page('CalendarPage', () => import('./pages/dashboard/calendar/CalendarPage'));
const AuditsList = page('AuditsList', () => import('./pages/dashboard/audits/AuditsList'));
const AuditDetail = page('AuditDetail', () => import('./pages/dashboard/audits/AuditDetail'));
const MyWork = page('MyWork', () => import('./pages/dashboard/audits/MyWork'));
const Timesheets = page('Timesheets', () => import('./pages/dashboard/audits/Timesheets'));
const WorkAllocation = page('WorkAllocation', () => import('./pages/dashboard/audits/WorkAllocation'));
const AuditDashboard = page('AuditDashboard', () => import('./pages/dashboard/audits/AuditDashboard'));
const AuditProjects = page('AuditProjects', () => import('./pages/dashboard/audits/AuditProjects'));
const AuditProjectDetail = page('AuditProjectDetail', () => import('./pages/dashboard/audits/AuditProjects'));
const WorkflowTemplates = page('WorkflowTemplates', () => import('./pages/dashboard/audits/WorkflowTemplates'));
const WorkflowTemplateEditor = page('WorkflowTemplateEditor', () => import('./pages/dashboard/audits/WorkflowTemplates'));
const ClientsList = page('ClientsList', () => import('./pages/dashboard/audits/ClientsList'));
const ClientDetail = page('ClientDetail', () => import('./pages/dashboard/audits/ClientDetail'));
const Billing = page('Billing', () => import('./pages/dashboard/audits/Billing'));
const Files = page('Files', () => import('./pages/dashboard/files/Files'));
const SubordinateAttendance = page('SubordinateAttendance', () => import('./pages/dashboard/attendance/SubordinateAttendance'));
const InvoicePrint = page('InvoicePrint', () => import('./pages/dashboard/audits/InvoicePrint'));
const LocationLog = page('LocationLog', () => import('./pages/dashboard/locationLog/LocationLog'));
const ReportBuilder = page('ReportBuilder', () => import('./pages/dashboard/reports/ReportBuilder'));
const EmployeeProfile = page('EmployeeProfile', () => import('./pages/dashboard/employees/EmployeeProfile'));
const EmployeeOnboarding = page('EmployeeOnboarding', () => import('./pages/dashboard/employees/EmployeeOnboarding'));
const EmployeeOffboarding = page('EmployeeOffboarding', () => import('./pages/dashboard/employees/EmployeeOffboarding'));
const TeamAttendance = page('TeamAttendance', () => import('./pages/dashboard/attendance/TeamAttendance'));
const AttendanceRegularization = page('AttendanceRegularization', () => import('./pages/dashboard/attendance/AttendanceRegularization'));
const TeamLeaveCalendar = page('TeamLeaveCalendar', () => import('./pages/dashboard/leave/TeamLeaveCalendar'));

// Screens most people open next, fetched quietly once the first page has settled.
const PREFETCH = ['DashContent', 'MyWork', 'Timesheets', 'AttendanceToday', 'ApplyLeave', 'ExpenseList', 'AuditsList', 'AuditDetail', 'NotificationCenter'];
const prefetch = () => PREFETCH.forEach((n) => loaders[n]?.().catch(() => {}));
const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1500));

const PageLoading = () => <div className="page-loading" role="progressbar" aria-label="Loading page"><span></span></div>;

function FeatherIcons() {
  const location = useLocation();

  useEffect(() => {
    const timer = setTimeout(() => {
      feather.replace();
    }, 0);

    return () => clearTimeout(timer);
  }, [location.pathname]);

  return null;
}

function App() {
  useEffect(() => { const t = setTimeout(() => idle(prefetch), 2500); return () => clearTimeout(t); }, []);

  return (
    <Provider store={store}>
      <div>
        <BrowserRouter>
          <FeatherIcons />
          <Toaster />
          <Suspense fallback={<PageLoading />}>
          <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/dashboard" element={<DashContent />} />
            <Route path="/profile" element={<MyProfile />} />
            <Route path="/organisation" element={<Organisation />} />
            <Route path="/files" element={<Files />} />
            <Route path="/attendance/subordinates" element={<SubordinateAttendance />} />
            <Route path="/change-password" element={<ChangePassword />} />
            <Route path="/notifications" element={<NotificationCenter />} />

            <Route path="/employees" element={<ScreenGuard screen="screen:directory"><EmployeeGrid /></ScreenGuard>} />
            <Route path="/employees/create" element={<AddEditEmployee />} />
            <Route path="/employees/edit/:id" element={<AddEditEmployee />} />
            <Route path="/employees/onboarding" element={<EmployeeOnboarding />} />
            <Route path="/employees/offboarding" element={<EmployeeOffboarding />} />
            <Route path="/employees/:id" element={<ScreenGuard screen="screen:directory"><EmployeeProfile /></ScreenGuard>} />
            <Route path="/departments" element={<ScreenGuard screen="screen:org"><DepartmentList /></ScreenGuard>} />
            <Route path="/designations" element={<ScreenGuard screen="screen:org"><DesignationList /></ScreenGuard>} />
            <Route path="/documents" element={<ScreenGuard screen="screen:documents"><DocumentCenter /></ScreenGuard>} />

            <Route path="/attendance/today" element={<ScreenGuard screen="screen:attendance"><AttendanceToday /></ScreenGuard>} />
            <Route path="/attendance/history" element={<ScreenGuard screen="screen:attendance"><AttendanceHistory /></ScreenGuard>} />
            <Route path="/attendance/team" element={<TeamAttendance />} />
            <Route path="/attendance/regularization" element={<ScreenGuard screen="screen:attendance"><AttendanceRegularization /></ScreenGuard>} />
            <Route path="/location-log" element={<LocationLog />} />
            <Route path="/attendance/shifts" element={<ScreenGuard screen="screen:shifts"><ShiftList /></ScreenGuard>} />
            <Route path="/attendance/holidays" element={<ScreenGuard screen="screen:holidays"><HolidayList /></ScreenGuard>} />
            <Route path="/leave" element={<ScreenGuard screen="screen:leave"><LeaveHistory /></ScreenGuard>} />
            <Route path="/leave/apply" element={<ScreenGuard screen="screen:leave"><ApplyLeave /></ScreenGuard>} />
            <Route path="/leave/balance" element={<ScreenGuard screen="screen:leave"><LeaveHistory /></ScreenGuard>} />
            <Route path="/leave/approvals" element={<LeaveApprovals />} />
            <Route path="/leave/team-calendar" element={<ScreenGuard screen="screen:leave"><TeamLeaveCalendar /></ScreenGuard>} />

            <Route path="/payroll/salary-structure" element={<SalaryStructure />} />
            <Route path="/payroll/process" element={<PayrollProcess />} />
            <Route path="/payroll/payslips" element={<ScreenGuard screen="screen:payslips"><Payslips /></ScreenGuard>} />
            <Route path="/payroll/loans" element={<ScreenGuard screen="screen:loans"><LoansAdvances /></ScreenGuard>} />

            <Route path="/expenses" element={<ScreenGuard screen="screen:expenses"><ExpenseList /></ScreenGuard>} />
            <Route path="/expenses/approvals" element={<ExpenseApprovals />} />
            <Route path="/assets" element={<AssetList />} />
            <Route path="/assets/assignments" element={<AssetList />} />
            <Route path="/assets/mine" element={<MyAssets />} />
            <Route path="/helpdesk" element={<ScreenGuard screen="screen:helpdesk"><TicketList /></ScreenGuard>} />
            <Route path="/helpdesk/all" element={<HRTickets />} />
            <Route path="/helpdesk/t/:id" element={<TicketDetail />} />
            <Route path="/helpdesk/settings" element={<HelpdeskSettings />} />
            <Route path="/messages" element={<Chat />} />
            <Route path="/announcements" element={<ScreenGuard screen="screen:announcements"><AnnouncementFeed /></ScreenGuard>} />

            <Route path="/projects" element={<ScreenGuard screen="screen:projects"><ProjectsList /></ScreenGuard>} />
            <Route path="/projects/:id" element={<ScreenGuard screen="screen:projects"><ProjectDetail /></ScreenGuard>} />
            {/* To-do is everyone's personal list; project tasks live under Projects */}
            <Route path="/tasks" element={<TodoPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/projects/my-tasks" element={<ScreenGuard screen="screen:projects"><TasksBoard /></ScreenGuard>} />
            <Route path="/audits" element={<ScreenGuard screen="screen:audits"><AuditsList /></ScreenGuard>} />
            <Route path="/audits/clients" element={<ScreenGuard screen="screen:audits"><ClientsList /></ScreenGuard>} />
            <Route path="/audits/clients/:id" element={<ScreenGuard screen="screen:audits"><ClientDetail /></ScreenGuard>} />
            <Route path="/audits/billing" element={<Billing />} />
            <Route path="/audits/invoices/:id/print" element={<InvoicePrint />} />
            <Route path="/my-work" element={<ScreenGuard screen="screen:audits"><MyWork /></ScreenGuard>} />
            <Route path="/timesheets" element={<ScreenGuard screen="screen:audits"><Timesheets /></ScreenGuard>} />
            <Route path="/audits/dashboard" element={<AuditDashboard />} />
            <Route path="/audits/allocation" element={<WorkAllocation />} />
            <Route path="/audits/projects" element={<ScreenGuard screen="screen:audits"><AuditProjects /></ScreenGuard>} />
            <Route path="/audits/projects/:id" element={<ScreenGuard screen="screen:audits"><AuditProjectDetail /></ScreenGuard>} />
            <Route path="/audits/workflows" element={<WorkflowTemplates />} />
            <Route path="/audits/workflows/:id" element={<WorkflowTemplateEditor />} />
            <Route path="/audits/:id" element={<ScreenGuard screen="screen:audits"><AuditDetail /></ScreenGuard>} />

            <Route path="/reports/employees" element={<ReportBuilder />} />
            <Route path="/reports/overview" element={<ReportBuilder />} />
            <Route path="/reports/attendance" element={<ReportBuilder />} />
            <Route path="/reports/leave" element={<ReportBuilder />} />
            <Route path="/reports/payroll" element={<ReportBuilder />} />

            <Route path="/roles" element={<RolesList />} />
            <Route path="/settings/access" element={<AccessControl />} />
            <Route path="/settings/company" element={<CompanySettings />} />
            <Route path="/settings/branches" element={<BranchList />} />
            <Route path="/settings/holidays" element={<HolidayList />} />
            <Route path="/settings/audit" element={<AuditLogViewer />} />
          </Routes>
          </Suspense>
        </BrowserRouter>
      </div>
    </Provider>

  );
}

export default App;
