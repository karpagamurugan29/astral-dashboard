import { all, put, takeEvery } from "redux-saga/effects";
import { Get, Put } from "../../components/common/ApiCall";
import { API_URL } from "../../utils/Constants";
import actions from "./Actions";

const rootSaga = function* () {
  yield all([
    yield takeEvery(actions.GET_NOTIFICATIONS, fetchNotifications),
    yield takeEvery(actions.MARK_NOTIFICATION_READ, markRead),
    yield takeEvery(actions.MARK_ALL_NOTIFICATIONS_READ, markAllRead),
  ]);
};

const fetchNotifications = function* () {
  try {
    const result = yield Get(`${API_URL}/notifications`);
    if (result?.success) yield put({ type: actions.SET_NOTIFICATIONS, payload: result });
  } catch (err) {
    yield put({ type: actions.SET_NOTIFICATION_ERROR, payload: err.message });
  }
};

const markRead = function* (action) {
  try {
    yield Put(`${API_URL}/notifications/${action.id}/read`);
    yield fetchNotifications();
  } catch (err) {
    yield put({ type: actions.SET_NOTIFICATION_ERROR, payload: err.message });
  }
};

const markAllRead = function* () {
  try {
    yield Put(`${API_URL}/notifications/read-all`);
    yield fetchNotifications();
  } catch (err) {
    yield put({ type: actions.SET_NOTIFICATION_ERROR, payload: err.message });
  }
};

export default rootSaga;
