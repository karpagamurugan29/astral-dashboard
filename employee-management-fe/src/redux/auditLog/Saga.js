import { all, put, takeEvery } from "redux-saga/effects";
import { Get } from "../../components/common/ApiCall";
import { API_URL } from "../../utils/Constants";
import actions from "./Actions";

const rootSaga = function* () {
  yield all([yield takeEvery(actions.GET_AUDIT_LOGS, fetchLogs)]);
};

const fetchLogs = function* () {
  try {
    const result = yield Get(`${API_URL}/audit-logs`);
    if (result?.success) yield put({ type: actions.SET_AUDIT_LOGS, payload: result?.data });
    else yield put({ type: actions.SET_AUDIT_LOG_ERROR, payload: result?.message || "Unable to load audit logs" });
  } catch (err) {
    yield put({ type: actions.SET_AUDIT_LOG_ERROR, payload: err.message });
  }
};

export default rootSaga;
