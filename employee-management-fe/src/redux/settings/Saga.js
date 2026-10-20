import { all, put, takeEvery } from "redux-saga/effects";
import { Get, Put } from "../../components/common/ApiCall";
import { API_URL } from "../../utils/Constants";
import actions from "./Actions";

const rootSaga = function* () {
  yield all([
    yield takeEvery(actions.GET_COMPANY_SETTINGS, fetchCompany),
    yield takeEvery(actions.UPDATE_COMPANY_SETTINGS, updateCompany),
    yield takeEvery(actions.GET_LEAVE_SETTINGS, fetchLeavePolicy),
    yield takeEvery(actions.UPDATE_LEAVE_SETTINGS, updateLeavePolicy),
  ]);
};

const fetchCompany = function* () {
  try {
    const result = yield Get(`${API_URL}/settings`);
    if (result?.success) yield put({ type: actions.SET_COMPANY_SETTINGS, payload: result?.data });
  } catch (err) {
    yield put({ type: actions.SET_SETTINGS_ERROR, payload: err.message });
  }
};

const updateCompany = function* (action) {
  try {
    const result = yield Put(`${API_URL}/settings`, action.payload);
    if (result?.success) yield put({ type: actions.SET_COMPANY_SETTINGS, payload: result?.data });
    else yield put({ type: actions.SET_SETTINGS_ERROR, payload: result?.message || "Unable to save settings" });
  } catch (err) {
    yield put({ type: actions.SET_SETTINGS_ERROR, payload: err.message });
  }
};

const fetchLeavePolicy = function* () {
  try {
    const result = yield Get(`${API_URL}/settings/leave-policy`);
    if (result?.success) yield put({ type: actions.SET_LEAVE_SETTINGS, payload: result?.data });
  } catch (err) {
    yield put({ type: actions.SET_SETTINGS_ERROR, payload: err.message });
  }
};

const updateLeavePolicy = function* (action) {
  try {
    const result = yield Put(`${API_URL}/settings/leave-policy`, action.payload);
    if (result?.success) yield put({ type: actions.SET_LEAVE_SETTINGS, payload: result?.data });
    else yield put({ type: actions.SET_SETTINGS_ERROR, payload: result?.message || "Unable to save leave policy" });
  } catch (err) {
    yield put({ type: actions.SET_SETTINGS_ERROR, payload: err.message });
  }
};

export default rootSaga;
