import { useEffect } from 'react';
import './App.css';
import { Login } from './pages/dashboard/Login';
import { ForgotPassword } from './pages/dashboard/ForgotPassword';
import { ResetPassword } from './pages/dashboard/ResetPassword';
import { ChangePassword } from './pages/dashboard/ChangePassword';
import { MyProfile } from './pages/dashboard/MyProfile';
import { NotificationCenter } from './pages/dashboard/NotificationCenter';
import feather from "feather-icons";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { DashContent } from './pages/dashboard/dash/DashContent';
import { Provider } from 'react-redux';
import { store } from "./redux/Store"
import { EmployeeGrid } from './pages/dashboard/employees/EmployeeGrid';
import { AddEditEmployee } from './pages/dashboard/employees/AddEditEmployee';
import { AttendanceToday } from './pages/dashboard/attendance/AttendanceToday';
import { AttendanceHistory } from './pages/dashboard/attendance/AttendanceHistory';
import { ApplyLeave } from './pages/dashboard/leave/ApplyLeave';
import { LeaveHistory } from './pages/dashboard/leave/LeaveHistory';
import { LeaveApprovals } from './pages/dashboard/leave/LeaveApprovals';
import { DepartmentList } from './pages/dashboard/organization/DepartmentList';
import { DesignationList } from './pages/dashboard/organization/DesignationList';
import { BranchList } from './pages/dashboard/organization/BranchList';
import { ExpenseList } from './pages/dashboard/expense/ExpenseList';
import { ExpenseApprovals } from './pages/dashboard/expense/ExpenseApprovals';
import { AssetList } from './pages/dashboard/asset/AssetList';
import { TicketList } from './pages/dashboard/helpdesk/TicketList';
import { HRTickets } from './pages/dashboard/helpdesk/HRTickets';
import { AnnouncementFeed } from './pages/dashboard/announcements/AnnouncementFeed';
import { ShiftList } from './pages/dashboard/calendar/ShiftList';
import { HolidayList } from './pages/dashboard/calendar/HolidayList';
import { RolesList } from './pages/dashboard/roles/RolesList';
import { AccessControl } from './pages/dashboard/access/AccessControl';
import { ScreenGuard } from './components/common/ScreenGuard';
import { AuditLogViewer } from './pages/dashboard/audit/AuditLogViewer';
import { CompanySettings } from './pages/dashboard/settings/CompanySettings';
import { Chat } from './pages/dashboard/chat/Chat';
import { DocumentCenter } from './pages/dashboard/documents/DocumentCenter';
import { SalaryStructure } from './pages/dashboard/payroll/SalaryStructure';
import { PayrollProcess } from './pages/dashboard/payroll/PayrollProcess';
import { Payslips } from './pages/dashboard/payroll/Payslips';
import { LoansAdvances } from './pages/dashboard/payroll/LoansAdvances';
import { ProjectsList } from './pages/dashboard/projects/ProjectsList';
import { ProjectDetail } from './pages/dashboard/projects/ProjectDetail';
import { TasksBoard } from './pages/dashboard/projects/TasksBoard';
import { AuditsList } from './pages/dashboard/audits/AuditsList';
import { AuditDetail } from './pages/dashboard/audits/AuditDetail';
import { ClientsList } from './pages/dashboard/audits/ClientsList';
import { ClientDetail } from './pages/dashboard/audits/ClientDetail';
import { LocationLog } from './pages/dashboard/locationLog/LocationLog';
import { ReportBuilder } from './pages/dashboard/reports/ReportBuilder';
import { EmployeeProfile } from './pages/dashboard/employees/EmployeeProfile';
import { EmployeeOnboarding } from './pages/dashboard/employees/EmployeeOnboarding';
import { EmployeeOffboarding } from './pages/dashboard/employees/EmployeeOffboarding';
import { TeamAttendance } from './pages/dashboard/attendance/TeamAttendance';
import { AttendanceRegularization } from './pages/dashboard/attendance/AttendanceRegularization';
import { TeamLeaveCalendar } from './pages/dashboard/leave/TeamLeaveCalendar';

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
  const hasSession = localStorage.getItem('session')

  console.log(hasSession)

  return (
    <Provider store={store}>
      <div>
        <BrowserRouter>
          <FeatherIcons />
          <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/dashboard" element={<DashContent />} />
            <Route path="/profile" element={<MyProfile />} />
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
            <Route path="/assets/assignments" element={<ScreenGuard screen="screen:assets"><AssetList /></ScreenGuard>} />
            <Route path="/helpdesk" element={<ScreenGuard screen="screen:helpdesk"><TicketList /></ScreenGuard>} />
            <Route path="/helpdesk/all" element={<HRTickets />} />
            <Route path="/messages" element={<Chat />} />
            <Route path="/announcements" element={<ScreenGuard screen="screen:announcements"><AnnouncementFeed /></ScreenGuard>} />

            <Route path="/projects" element={<ScreenGuard screen="screen:projects"><ProjectsList /></ScreenGuard>} />
            <Route path="/projects/:id" element={<ScreenGuard screen="screen:projects"><ProjectDetail /></ScreenGuard>} />
            <Route path="/tasks" element={<ScreenGuard screen="screen:projects"><TasksBoard /></ScreenGuard>} />
            <Route path="/audits" element={<ScreenGuard screen="screen:audits"><AuditsList /></ScreenGuard>} />
            <Route path="/audits/clients" element={<ScreenGuard screen="screen:audits"><ClientsList /></ScreenGuard>} />
            <Route path="/audits/clients/:id" element={<ScreenGuard screen="screen:audits"><ClientDetail /></ScreenGuard>} />
            <Route path="/audits/:id" element={<ScreenGuard screen="screen:audits"><AuditDetail /></ScreenGuard>} />

            <Route path="/reports/employees" element={<ReportBuilder />} />
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
        </BrowserRouter>
      </div>
    </Provider>

  );
}

export default App;
