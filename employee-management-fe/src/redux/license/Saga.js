import { all, put, takeEvery } from "redux-saga/effects";
import { Get, Post } from "../../components/common/ApiCall";
import { API_URL } from "../../utils/Constants";
import actions from "./Actions";

const rootSaga = function* () {
  yield all([
    yield takeEvery(actions.GET_LICENSE_STATUS, fetchStatus),
    yield takeEvery(actions.ACTIVATE_LICENSE, activate),
  ]);
};

const fetchStatus = function* () {
  try {
    const result = yield Get(`${API_URL}/license/status`);
    if (result?.success) yield put({ type: actions.SET_LICENSE_STATUS, payload: result?.data });
  } catch (err) {
    yield put({ type: actions.SET_LICENSE_ERROR, payload: err.message });
  }
};

const activate = function* (action) {
  try {
    const result = yield Post(`${API_URL}/license/activate`, action.payload);
    if (result?.success) yield put({ type: actions.SET_LICENSE_STATUS, payload: result?.data });
    else yield put({ type: actions.SET_LICENSE_ERROR, payload: result?.message || "Unable to activate license" });
  } catch (err) {
    yield put({ type: actions.SET_LICENSE_ERROR, payload: err.message });
  }
};

export default rootSaga;
