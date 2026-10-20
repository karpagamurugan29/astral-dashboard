import { all, put, takeEvery } from "redux-saga/effects";
import { Get } from "../../components/common/ApiCall";
import { API_URL } from "../../utils/Constants";
import actions from "./Actions";

const rootSaga = function* () {
  yield all([
    yield takeEvery(actions.GET_DASHBOARD_SUMMARY, fetchSummary),
    yield takeEvery(actions.GET_ATTENDANCE_TREND, fetchTrend),
    yield takeEvery(actions.GET_TASK_STATUS, fetchTaskStatus),
    yield takeEvery(actions.GET_LEAVE_BREAKDOWN, fetchLeaveBreakdown),
    yield takeEvery(actions.GET_PROJECT_PROGRESS, fetchProjectProgress),
    yield takeEvery(actions.GET_AUDIT_INSIGHTS, fetchAuditInsights),
  ]);
};

const fetchSummary = function* () {
  try {
    const result = yield Get(`${API_URL}/dashboard/summary`);
    if (result?.success) yield put({ type: actions.SET_DASHBOARD_SUMMARY, payload: result?.data });
  } catch (err) {
    yield put({ type: actions.SET_DASHBOARD_ERROR, payload: err.message });
  }
};

const fetchTrend = function* () {
  try {
    const result = yield Get(`${API_URL}/dashboard/attendance-trend?days=7`);
    if (result?.success) yield put({ type: actions.SET_ATTENDANCE_TREND, payload: result?.data });
  } catch (err) {
    yield put({ type: actions.SET_DASHBOARD_ERROR, payload: err.message });
  }
};

const fetchTaskStatus = function* () {
  try {
    const result = yield Get(`${API_URL}/dashboard/task-status`);
    if (result?.success) yield put({ type: actions.SET_TASK_STATUS, payload: result?.data });
  } catch (err) {
    yield put({ type: actions.SET_DASHBOARD_ERROR, payload: err.message });
  }
};

const fetchLeaveBreakdown = function* () {
  try {
    const result = yield Get(`${API_URL}/dashboard/leave-breakdown`);
    if (result?.success) yield put({ type: actions.SET_LEAVE_BREAKDOWN, payload: result?.data });
  } catch (err) {
    yield put({ type: actions.SET_DASHBOARD_ERROR, payload: err.message });
  }
};

const fetchAuditInsights = function* () {
  try {
    const result = yield Get(`${API_URL}/dashboard/audit-insights`);
    if (result?.success) yield put({ type: actions.SET_AUDIT_INSIGHTS, payload: result?.data });
  } catch (err) {
    yield put({ type: actions.SET_DASHBOARD_ERROR, payload: err.message });
  }
};

const fetchProjectProgress = function* () {
  try {
    const result = yield Get(`${API_URL}/dashboard/project-progress`);
    if (result?.success) yield put({ type: actions.SET_PROJECT_PROGRESS, payload: result?.data });
  } catch (err) {
    yield put({ type: actions.SET_DASHBOARD_ERROR, payload: err.message });
  }
};

export default rootSaga;
