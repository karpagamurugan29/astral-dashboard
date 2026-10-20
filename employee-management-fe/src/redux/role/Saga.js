import { all, put, takeEvery } from "redux-saga/effects";
import { Get, Put } from "../../components/common/ApiCall";
import { API_URL } from "../../utils/Constants";
import actions from "./Actions";

const rootSaga = function* () {
  yield all([
    yield takeEvery(actions.GET_ROLES, fetchRoles),
    yield takeEvery(actions.UPDATE_ROLE_PERMISSIONS, updatePermissions),
    yield takeEvery(actions.GET_MY_PERMISSIONS, fetchMyPermissions),
  ]);
};

const fetchMyPermissions = function* () {
  try {
    const result = yield Get(`${API_URL}/roles/my-permissions`);
    if (result?.success) {
      yield put({ type: actions.SET_MY_PERMISSIONS, payload: result?.data });
    }
  } catch (err) {
    yield put({ type: actions.SET_ROLE_ERROR, payload: err.message });
  }
};

const fetchRoles = function* () {
  try {
    const result = yield Get(`${API_URL}/roles`);
    if (result?.success) {
      yield put({ type: actions.SET_ROLES, payload: result });
    } else {
      yield put({ type: actions.SET_ROLE_ERROR, payload: result?.message || "Unable to load roles" });
    }
  } catch (err) {
    yield put({ type: actions.SET_ROLE_ERROR, payload: err.message });
  }
};

const updatePermissions = function* (action) {
  const { role, permissions } = action;
  try {
    const result = yield Put(`${API_URL}/roles/${role}/permissions`, { permissions });
    if (result?.success) {
      yield fetchRoles();
    } else {
      yield put({ type: actions.SET_ROLE_ERROR, payload: result?.message || "Unable to save permissions" });
    }
  } catch (err) {
    yield put({ type: actions.SET_ROLE_ERROR, payload: err.message });
  }
};

export default rootSaga;
