import { all, put, takeEvery } from "redux-saga/effects";
import { Get, Post, Delete } from "../../components/common/ApiCall";
import { API_URL } from "../../utils/Constants";
import actions from "./Actions";

const rootSaga = function* () {
  yield all([
    yield takeEvery(actions.GET_ANNOUNCEMENTS, fetchAnnouncements),
    yield takeEvery(actions.ADD_ANNOUNCEMENT, addAnnouncement),
    yield takeEvery(actions.DELETE_ANNOUNCEMENT, deleteAnnouncement),
  ]);
};

const fetchAnnouncements = function* () {
  yield put({ type: actions.SET_ANNOUNCEMENTS_LOADING, payload: true });
  try {
    const result = yield Get(`${API_URL}/announcements`);
    if (result?.success) {
      yield put({ type: actions.SET_ANNOUNCEMENTS, payload: result?.data });
    } else {
      yield put({ type: actions.SET_ANNOUNCEMENT_ERROR, payload: result?.message || "Unable to load announcements" });
    }
  } catch (err) {
    yield put({ type: actions.SET_ANNOUNCEMENT_ERROR, payload: err.message || "Unable to load announcements" });
  } finally {
    yield put({ type: actions.SET_ANNOUNCEMENTS_LOADING, payload: false });
  }
};

const addAnnouncement = function* (action) {
  const { payload } = action;
  try {
    const result = yield Post(`${API_URL}/announcements`, payload);
    if (result?.success) {
      yield fetchAnnouncements();
    } else {
      yield put({ type: actions.SET_ANNOUNCEMENT_ERROR, payload: result?.message || "Unable to post announcement" });
    }
  } catch (err) {
    yield put({ type: actions.SET_ANNOUNCEMENT_ERROR, payload: err.message || "Unable to post announcement" });
  }
};

const deleteAnnouncement = function* (action) {
  const { id } = action;
  try {
    const result = yield Delete(`${API_URL}/announcements/${id}`);
    if (result?.success) {
      yield fetchAnnouncements();
    } else {
      yield put({ type: actions.SET_ANNOUNCEMENT_ERROR, payload: result?.message || "Unable to delete announcement" });
    }
  } catch (err) {
    yield put({ type: actions.SET_ANNOUNCEMENT_ERROR, payload: err.message || "Unable to delete announcement" });
  }
};



export default rootSaga;
