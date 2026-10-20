import { all, put, takeEvery } from "redux-saga/effects";
import { Get, Post, Put } from "../../components/common/ApiCall";
import { API_URL } from "../../utils/Constants";
import actions from "./Actions";

const rootSaga = function* () {
  yield all([
    yield takeEvery(actions.GET_LEAVE_BALANCE, fetchBalance),
    yield takeEvery(actions.GET_LEAVE_HISTORY, fetchHistory),
    yield takeEvery(actions.GET_PENDING_LEAVES, fetchPending),
    yield takeEvery(actions.APPLY_LEAVE, applyLeave),
    yield takeEvery(actions.CANCEL_LEAVE, cancelLeave),
    yield takeEvery(actions.APPROVE_LEAVE, approveLeave),
    yield takeEvery(actions.REJECT_LEAVE, rejectLeave),
    yield takeEvery(actions.GET_TEAM_LEAVE_CALENDAR, fetchTeamCalendar),
  ]);
};

const fetchTeamCalendar = function* (action) {
  const { month, year } = action;
  const query = month && year ? `?month=${month}&year=${year}` : "";
  try {
    const result = yield Get(`${API_URL}/leave/team-calendar${query}`);
    if (result?.success) yield put({ type: actions.SET_TEAM_LEAVE_CALENDAR, payload: result?.data });
  } catch (err) {
    yield put({ type: actions.SET_LEAVE_ERROR, payload: err.message });
  }
};

const fetchBalance = function* () {
  try {
    const result = yield Get(`${API_URL}/leave/balance`);
    if (result?.success) {
      yield put({ type: actions.SET_LEAVE_BALANCE, payload: result?.data });
    }
  } catch (err) {
    yield put({ type: actions.SET_LEAVE_ERROR, payload: err.message || "Unable to load leave balance" });
  }
};

const fetchHistory = function* () {
  yield put({ type: actions.SET_LEAVE_LOADING, payload: true });
  try {
    const result = yield Get(`${API_URL}/leave/history`);
    if (result?.success) {
      yield put({ type: actions.SET_LEAVE_HISTORY, payload: result?.data });
    } else {
      yield put({ type: actions.SET_LEAVE_ERROR, payload: result?.message || "Unable to load leave history" });
    }
  } catch (err) {
    yield put({ type: actions.SET_LEAVE_ERROR, payload: err.message || "Unable to load leave history" });
  }
};

const fetchPending = function* () {
  yield put({ type: actions.SET_LEAVE_LOADING, payload: true });
  try {
    const result = yield Get(`${API_URL}/leave/pending`);
    if (result?.success) {
      yield put({ type: actions.SET_PENDING_LEAVES, payload: result?.data });
    } else {
      yield put({ type: actions.SET_LEAVE_ERROR, payload: result?.message || "Unable to load pending leaves" });
    }
  } catch (err) {
    yield put({ type: actions.SET_LEAVE_ERROR, payload: err.message || "Unable to load pending leaves" });
  }
};

const applyLeave = function* (action) {
  const { payload, onDone } = action;
  yield put({ type: actions.SET_LEAVE_SAVING, payload: true });
  try {
    const result = yield Post(`${API_URL}/leave/apply`, payload);
    if (result?.success) {
      yield fetchHistory();
      yield fetchBalance();
      if (onDone) onDone();
    } else {
      yield put({ type: actions.SET_LEAVE_ERROR, payload: result?.message || "Unable to apply leave" });
    }
  } catch (err) {
    yield put({ type: actions.SET_LEAVE_ERROR, payload: err.message || "Unable to apply leave" });
  } finally {
    yield put({ type: actions.SET_LEAVE_SAVING, payload: false });
  }
};

const cancelLeave = function* (action) {
  const { id } = action;
  try {
    const result = yield Put(`${API_URL}/leave/cancel/${id}`);
    if (result?.success) {
      yield fetchHistory();
    } else {
      yield put({ type: actions.SET_LEAVE_ERROR, payload: result?.message || "Unable to cancel leave" });
    }
  } catch (err) {
    yield put({ type: actions.SET_LEAVE_ERROR, payload: err.message || "Unable to cancel leave" });
  }
};

const approveLeave = function* (action) {
  const { id } = action;
  try {
    const result = yield Put(`${API_URL}/leave/approve/${id}`);
    if (result?.success) {
      yield fetchPending();
    } else {
      yield put({ type: actions.SET_LEAVE_ERROR, payload: result?.message || "Unable to approve leave" });
    }
  } catch (err) {
    yield put({ type: actions.SET_LEAVE_ERROR, payload: err.message || "Unable to approve leave" });
  }
};

const rejectLeave = function* (action) {
  const { id, payload } = action;
  try {
    const result = yield Put(`${API_URL}/leave/reject/${id}`, payload);
    if (result?.success) {
      yield fetchPending();
    } else {
      yield put({ type: actions.SET_LEAVE_ERROR, payload: result?.message || "Unable to reject leave" });
    }
  } catch (err) {
    yield put({ type: actions.SET_LEAVE_ERROR, payload: err.message || "Unable to reject leave" });
  }
};

export default rootSaga;
