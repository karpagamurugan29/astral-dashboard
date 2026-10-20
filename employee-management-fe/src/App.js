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
import { AuditLogViewer } from './pages/dashboard/audit/AuditLogViewer';
import { CompanySettings } from './pages/dashboard/settings/CompanySettings';
import { DocumentCenter } from './pages/dashboard/documents/DocumentCenter';
import { SalaryStructure } from './pages/dashboard/payroll/SalaryStructure';
import { PayrollProcess } from './pages/dashboard/payroll/PayrollProcess';
import { Payslips } from './pages/dashboard/payroll/Payslips';
import { LoansAdvances } from './pages/dashboard/payroll/LoansAdvances';
import { ProjectsList } from './pages/dashboard/projects/ProjectsList';
import { ProjectDetail } from './pages/dashboard/projects/ProjectDetail';
import { TasksBoard } from './pages/dashboard/projects/TasksBoard';
import { ReportBuilder } from './pages/dashboard/reports/ReportBuilder';
import { LicenseStatus } from './pages/dashboard/license/LicenseStatus';
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

            <Route path="/employees" element={<EmployeeGrid />} />
            <Route path="/employees/create" element={<AddEditEmployee />} />
            <Route path="/employees/edit/:id" element={<AddEditEmployee />} />
            <Route path="/employees/onboarding" element={<EmployeeOnboarding />} />
            <Route path="/employees/offboarding" element={<EmployeeOffboarding />} />
            <Route path="/employees/:id" element={<EmployeeProfile />} />
            <Route path="/departments" element={<DepartmentList />} />
            <Route path="/designations" element={<DesignationList />} />
            <Route path="/documents" element={<DocumentCenter />} />

            <Route path="/attendance/today" element={<AttendanceToday />} />
            <Route path="/attendance/history" element={<AttendanceHistory />} />
            <Route path="/attendance/team" element={<TeamAttendance />} />
            <Route path="/attendance/regularization" element={<AttendanceRegularization />} />
            <Route path="/attendance/shifts" element={<ShiftList />} />
            <Route path="/attendance/holidays" element={<HolidayList />} />
            <Route path="/leave" element={<LeaveHistory />} />
            <Route path="/leave/apply" element={<ApplyLeave />} />
            <Route path="/leave/balance" element={<LeaveHistory />} />
            <Route path="/leave/approvals" element={<LeaveApprovals />} />
            <Route path="/leave/team-calendar" element={<TeamLeaveCalendar />} />

            <Route path="/payroll/salary-structure" element={<SalaryStructure />} />
            <Route path="/payroll/process" element={<PayrollProcess />} />
            <Route path="/payroll/payslips" element={<Payslips />} />
            <Route path="/payroll/loans" element={<LoansAdvances />} />

            <Route path="/expenses" element={<ExpenseList />} />
            <Route path="/expenses/approvals" element={<ExpenseApprovals />} />
            <Route path="/assets" element={<AssetList />} />
            <Route path="/assets/assignments" element={<AssetList />} />
            <Route path="/helpdesk" element={<TicketList />} />
            <Route path="/helpdesk/all" element={<HRTickets />} />
            <Route path="/announcements" element={<AnnouncementFeed />} />

            <Route path="/projects" element={<ProjectsList />} />
            <Route path="/projects/:id" element={<ProjectDetail />} />
            <Route path="/tasks" element={<TasksBoard />} />

            <Route path="/reports/employees" element={<ReportBuilder />} />
            <Route path="/reports/attendance" element={<ReportBuilder />} />
            <Route path="/reports/leave" element={<ReportBuilder />} />
            <Route path="/reports/payroll" element={<ReportBuilder />} />

            <Route path="/roles" element={<RolesList />} />
            <Route path="/license" element={<LicenseStatus />} />
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
