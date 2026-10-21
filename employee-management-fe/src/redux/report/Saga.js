import { all, put, takeEvery, takeLatest } from "redux-saga/effects";
import { Get } from "../../components/common/ApiCall";
import { API_URL } from "../../utils/Constants";
import actions from "./Actions";

const rootSaga = function* () {
  yield all([
    yield takeEvery(actions.GET_ATTENDANCE_REPORT, fetchAttendance),
    yield takeEvery(actions.GET_LEAVE_REPORT, fetchLeave),
    yield takeEvery(actions.GET_HEADCOUNT_REPORT, fetchHeadcount),
    yield takeEvery(actions.GET_PAYROLL_REPORT, fetchPayroll),
    yield takeEvery(actions.GET_EXPENSE_REPORT, fetchExpense),
    yield takeEvery(actions.GET_PROJECT_REPORT, fetchProjectReport),
    yield takeEvery(actions.GET_TASK_REPORT, fetchTaskReport),
    yield takeLatest(actions.GET_CHECKIN_REPORT, fetchWorkbench("checkins", actions.SET_CHECKIN_REPORT)),
    yield takeLatest(actions.GET_AUDIT_HOURS_REPORT, fetchWorkbench("audit-hours", actions.SET_AUDIT_HOURS_REPORT)),
    yield takeLatest(actions.GET_AUDIT_PROJECTS_REPORT, fetchWorkbench("audit-projects", actions.SET_AUDIT_PROJECTS_REPORT)),
    yield takeLatest(actions.GET_UTILISATION_REPORT, fetchWorkbench("utilisation", actions.SET_UTILISATION_REPORT)),
    yield takeLatest(actions.GET_PROFITABILITY_REPORT, fetchWorkbench("profitability", actions.SET_PROFITABILITY_REPORT)),
    yield takeLatest(actions.GET_PUNCTUALITY_REPORT, fetchWorkbench("punctuality", actions.SET_PUNCTUALITY_REPORT)),
    yield takeLatest(actions.GET_COMPLIANCE_REPORT, fetchWorkbench("compliance", actions.SET_COMPLIANCE_REPORT)),
  ]);
};

const fetchAttendance = function* (action) {
  try {
    const q = action.month && action.year ? `?month=${action.month}&year=${action.year}` : "";
    const result = yield Get(`${API_URL}/reports/attendance${q}`);
    if (result?.success) yield put({ type: actions.SET_ATTENDANCE_REPORT, payload: result?.data });
  } catch (err) {
    yield put({ type: actions.SET_REPORT_ERROR, payload: err.message });
  }
};

const fetchLeave = function* () {
  try {
    const result = yield Get(`${API_URL}/reports/leave`);
    if (result?.success) yield put({ type: actions.SET_LEAVE_REPORT, payload: result?.data });
  } catch (err) {
    yield put({ type: actions.SET_REPORT_ERROR, payload: err.message });
  }
};

const fetchHeadcount = function* () {
  try {
    const result = yield Get(`${API_URL}/reports/headcount`);
    if (result?.success) yield put({ type: actions.SET_HEADCOUNT_REPORT, payload: result?.data });
  } catch (err) {
    yield put({ type: actions.SET_REPORT_ERROR, payload: err.message });
  }
};

const fetchPayroll = function* () {
  try {
    const result = yield Get(`${API_URL}/reports/payroll`);
    if (result?.success) yield put({ type: actions.SET_PAYROLL_REPORT, payload: result?.data });
  } catch (err) {
    yield put({ type: actions.SET_REPORT_ERROR, payload: err.message });
  }
};

const fetchExpense = function* () {
  try {
    const result = yield Get(`${API_URL}/reports/expenses`);
    if (result?.success) yield put({ type: actions.SET_EXPENSE_REPORT, payload: result?.data });
  } catch (err) {
    yield put({ type: actions.SET_REPORT_ERROR, payload: err.message });
  }
};

const fetchProjectReport = function* (action) {
  try {
    const params = new URLSearchParams(action.filters || {});
    const result = yield Get(`${API_URL}/reports/projects?${params.toString()}`);
    if (result?.success) yield put({ type: actions.SET_PROJECT_REPORT, payload: result?.data });
  } catch (err) {
    yield put({ type: actions.SET_REPORT_ERROR, payload: err.message });
  }
};

const fetchTaskReport = function* (action) {
  try {
    const params = new URLSearchParams(action.filters || {});
    const result = yield Get(`${API_URL}/reports/tasks?${params.toString()}`);
    if (result?.success) yield put({ type: actions.SET_TASK_REPORT, payload: result?.data });
  } catch (err) {
    yield put({ type: actions.SET_REPORT_ERROR, payload: err.message });
  }
};

// Workbench reports take filters (from, to, employeeId, clientId, department, status).
function fetchWorkbench(path, setType) {
  return function* (action) {
    yield put({ type: actions.SET_REPORT_LOADING, payload: path });
    try {
      const params = new URLSearchParams(Object.entries(action.filters || {}).filter(([, v]) => v));
      const result = yield Get(`${API_URL}/reports/${path}?${params.toString()}`);
      if (result?.success) {
        yield put({ type: setType, payload: result?.data });
        yield put({ type: actions.SET_REPORT_ERROR, payload: "" });
      } else yield put({ type: actions.SET_REPORT_ERROR, payload: result?.message || "Unable to load the report" });
    } catch (err) {
      yield put({ type: actions.SET_REPORT_ERROR, payload: err.message });
    }
    yield put({ type: actions.SET_REPORT_LOADING, payload: "" });
  };
}

export default rootSaga;
