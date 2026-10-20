import { all, put, takeEvery } from "redux-saga/effects";
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

export default rootSaga;
