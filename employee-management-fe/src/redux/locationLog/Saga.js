import { all, put, takeLatest } from "redux-saga/effects";
import { Get } from "../../components/common/ApiCall";
import { API_URL } from "../../utils/Constants";
import actions from "./Actions";

const rootSaga = function* () {
  yield all([
    yield takeLatest(actions.GET_LOCATION_LOG, fetchLocationLog),
  ]);
};

const fetchLocationLog = function* (action) {
  const { from, to, employeeId } = action;
  const query = new URLSearchParams({ from, to, ...(employeeId ? { employeeId } : {}) }).toString();
  yield put({ type: actions.SET_LOCATION_LOG_LOADING, payload: true });
  try {
    const result = yield Get(`${API_URL}/location-log?${query}`);
    if (result?.success) yield put({ type: actions.SET_LOCATION_LOG, payload: result?.data?.events });
    else yield put({ type: actions.SET_LOCATION_LOG_ERROR, payload: result?.message || "Unable to load the location log" });
  } catch (err) {
    yield put({ type: actions.SET_LOCATION_LOG_ERROR, payload: err.message });
  }
  yield put({ type: actions.SET_LOCATION_LOG_LOADING, payload: false });
};

export default rootSaga;
