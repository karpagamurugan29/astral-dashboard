import { all, call, put, takeEvery } from "redux-saga/effects";
import { Get, Post, Put } from "../../components/common/ApiCall";
import { API_URL } from "../../utils/Constants";
import actions from "./Actions";
import { getCurrentLocation } from "../../utils/geo";

const rootSaga = function* () {
  yield all([
    yield takeEvery(actions.GET_TODAY_ATTENDANCE, fetchToday),
    yield takeEvery(actions.CHECK_IN, checkIn),
    yield takeEvery(actions.CHECK_OUT, checkOut),
    yield takeEvery(actions.GET_ATTENDANCE_HISTORY, fetchHistory),
    yield takeEvery(actions.GET_TEAM_ATTENDANCE, fetchTeam),
    yield takeEvery(actions.REQUEST_REGULARIZATION, requestRegularization),
    yield takeEvery(actions.GET_MY_REGULARIZATIONS, fetchMyRegularizations),
    yield takeEvery(actions.GET_PENDING_REGULARIZATIONS, fetchPendingRegularizations),
    yield takeEvery(actions.DECIDE_REGULARIZATION, decideRegularization),
  ]);
};

const fetchToday = function* () {
  yield put({ type: actions.SET_ATTENDANCE_LOADING, payload: true });
  try {
    const result = yield Get(`${API_URL}/attendance/today`);
    // A 404 here just means "not checked in yet today" — not an error state.
    yield put({ type: actions.SET_TODAY_ATTENDANCE, payload: result?.success ? result?.data : null });
  } catch (err) {
    yield put({ type: actions.SET_ATTENDANCE_ERROR, payload: err.message || "Unable to load today's attendance" });
  } finally {
    yield put({ type: actions.SET_ATTENDANCE_LOADING, payload: false });
  }
};

const checkIn = function* (action) {
  const { payload } = action;
  // "locating" is truthy, so buttons stay disabled while the browser finds the position.
  yield put({ type: actions.SET_ATTENDANCE_SAVING, payload: "locating" });
  try {
    const location = yield call(getCurrentLocation);
    yield put({ type: actions.SET_ATTENDANCE_SAVING, payload: true });
    const result = yield Post(`${API_URL}/attendance/check-in`, { ...payload, ...location });
    if (result?.success) {
      yield fetchToday();
    } else {
      yield put({ type: actions.SET_ATTENDANCE_ERROR, payload: result?.message || "Unable to check in" });
    }
  } catch (err) {
    yield put({ type: actions.SET_ATTENDANCE_ERROR, payload: err.message || "Unable to check in" });
  } finally {
    yield put({ type: actions.SET_ATTENDANCE_SAVING, payload: false });
  }
};

const checkOut = function* (action) {
  const { payload } = action;
  yield put({ type: actions.SET_ATTENDANCE_SAVING, payload: "locating" });
  try {
    const location = yield call(getCurrentLocation);
    yield put({ type: actions.SET_ATTENDANCE_SAVING, payload: true });
    const result = yield Post(`${API_URL}/attendance/check-out`, { ...payload, ...location });
    if (result?.success) {
      yield fetchToday();
    } else {
      yield put({ type: actions.SET_ATTENDANCE_ERROR, payload: result?.message || "Unable to check out" });
    }
  } catch (err) {
    yield put({ type: actions.SET_ATTENDANCE_ERROR, payload: err.message || "Unable to check out" });
  } finally {
    yield put({ type: actions.SET_ATTENDANCE_SAVING, payload: false });
  }
};

const fetchHistory = function* (action) {
  const { month, year } = action;
  const query = month && year ? `?month=${month}&year=${year}` : "";
  try {
    const result = yield Get(`${API_URL}/attendance/history${query}`);
    if (result?.success) {
      yield put({ type: actions.SET_ATTENDANCE_HISTORY, payload: result?.data });
    } else {
      yield put({ type: actions.SET_ATTENDANCE_ERROR, payload: result?.message || "Unable to load history" });
    }
  } catch (err) {
    yield put({ type: actions.SET_ATTENDANCE_ERROR, payload: err.message || "Unable to load history" });
  }
};

const fetchTeam = function* (action) {
  const { date, department, branch } = action;
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (department) params.set('department', department);
  if (branch) params.set('branch', branch);
  try {
    const result = yield Get(`${API_URL}/attendance/team?${params.toString()}`);
    if (result?.success) yield put({ type: actions.SET_TEAM_ATTENDANCE, payload: result?.data });
  } catch (err) {
    yield put({ type: actions.SET_ATTENDANCE_ERROR, payload: err.message });
  }
};

const requestRegularization = function* (action) {
  try {
    const result = yield Post(`${API_URL}/attendance/regularize`, action.payload);
    if (result?.success) {
      yield fetchMyRegularizations();
    } else {
      yield put({ type: actions.SET_ATTENDANCE_ERROR, payload: result?.message || "Unable to submit request" });
    }
  } catch (err) {
    yield put({ type: actions.SET_ATTENDANCE_ERROR, payload: err.message });
  }
};

const fetchMyRegularizations = function* () {
  try {
    const result = yield Get(`${API_URL}/attendance/regularize/my`);
    if (result?.success) yield put({ type: actions.SET_MY_REGULARIZATIONS, payload: result?.data });
  } catch (err) {
    yield put({ type: actions.SET_ATTENDANCE_ERROR, payload: err.message });
  }
};

const fetchPendingRegularizations = function* () {
  try {
    const result = yield Get(`${API_URL}/attendance/regularize/pending`);
    if (result?.success) yield put({ type: actions.SET_PENDING_REGULARIZATIONS, payload: result?.data });
  } catch (err) {
    yield put({ type: actions.SET_ATTENDANCE_ERROR, payload: err.message });
  }
};

const decideRegularization = function* (action) {
  try {
    const result = yield Put(`${API_URL}/attendance/regularize/${action.id}/decide`, { status: action.status });
    if (result?.success) {
      yield fetchPendingRegularizations();
    } else {
      yield put({ type: actions.SET_ATTENDANCE_ERROR, payload: result?.message || "Unable to update request" });
    }
  } catch (err) {
    yield put({ type: actions.SET_ATTENDANCE_ERROR, payload: err.message });
  }
};

export default rootSaga;
