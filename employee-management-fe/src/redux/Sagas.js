import { all } from "redux-saga/effects";
import authSaga from "./auth/Saga";
import employeeSaga from "./employee/Saga";
import attendanceSaga from "./attendance/Saga";
import leaveSaga from "./leave/Saga";
import departmentSaga from "./department/Saga";
import designationSaga from "./designation/Saga";
import expenseSaga from "./expense/Saga";
import assetSaga from "./asset/Saga";
import ticketSaga from "./ticket/Saga";
import announcementSaga from "./announcement/Saga";
import branchSaga from "./branch/Saga";
import calendarSaga from "./calendar/Saga";
import roleSaga from "./role/Saga";
import auditLogSaga from "./auditLog/Saga";
import settingsSaga from "./settings/Saga";
import notificationSaga from "./notification/Saga";
import documentSaga from "./document/Saga";
import payrollSaga from "./payroll/Saga";
import projectSaga from "./project/Saga";
import auditSaga from "./audit/Saga";
import locationLogSaga from "./locationLog/Saga";
import accessSaga from "./access/Saga";
import taskSaga from "./task/Saga";
import reportSaga from "./report/Saga";
import dashboardSaga from "./dashboard/Saga";

export default function* rootSaga() {
  yield all([
    dashboardSaga(),
    authSaga(),
    employeeSaga(),
    attendanceSaga(),
    leaveSaga(),
    departmentSaga(),
    designationSaga(),
    expenseSaga(),
    assetSaga(),
    ticketSaga(),
    announcementSaga(),
    branchSaga(),
    calendarSaga(),
    roleSaga(),
    auditLogSaga(),
    settingsSaga(),
    notificationSaga(),
    documentSaga(),
    payrollSaga(),
    projectSaga(),
    auditSaga(),
    locationLogSaga(),
    accessSaga(),
    taskSaga(),
    reportSaga(),
  ]);
}
