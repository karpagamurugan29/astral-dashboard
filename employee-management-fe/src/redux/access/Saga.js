import { all, put, takeEvery, takeLatest } from "redux-saga/effects";
import { Get, Put } from "../../components/common/ApiCall";
import { API_URL } from "../../utils/Constants";
import actions from "./Actions";
import roleActions from "../role/Actions";

const rootSaga = function* () {
  yield all([
    yield takeLatest(actions.GET_ACCESS, fetchAccess),
    yield takeEvery(actions.SAVE_ROLE_ACCESS, saveRoles),
    yield takeEvery(actions.SAVE_DEPARTMENT_ACCESS, saveDepartment),
    yield takeEvery(actions.SAVE_DESIGNATION_ACCESS, saveDesignation),
    yield takeEvery(actions.SAVE_EMPLOYEE_ACCESS, saveEmployee),
  ]);
};

const fetchAccess = function* () {
  try {
    const result = yield Get(`${API_URL}/access`);
    if (result?.success) yield put({ type: actions.SET_ACCESS, payload: result.data });
    else yield put({ type: actions.SET_ACCESS_ERROR, payload: result?.message || "Unable to load access settings" });
  } catch (err) {
    yield put({ type: actions.SET_ACCESS_ERROR, payload: err.message });
  }
};

const save = function* (url, body, notice) {
  yield put({ type: actions.SET_ACCESS_SAVING, payload: true });
  try {
    const result = yield Put(url, body);
    if (result?.success) {
      yield put({ type: actions.SET_ACCESS_ERROR, payload: "" });
      yield put({ type: actions.SET_ACCESS_NOTICE, payload: notice });
      yield fetchAccess();
      // The signed-in admin's own sidebar may change too.
      yield put({ type: roleActions.GET_MY_PERMISSIONS });
    } else {
      yield put({ type: actions.SET_ACCESS_ERROR, payload: result?.message || "Unable to save" });
    }
  } catch (err) {
    yield put({ type: actions.SET_ACCESS_ERROR, payload: err.message });
  }
  yield put({ type: actions.SET_ACCESS_SAVING, payload: false });
};

// Several roles at once: { roles: { Manager: [...], Employee: [...] } }
const saveRoles = function* (action) {
  yield put({ type: actions.SET_ACCESS_SAVING, payload: true });
  try {
    for (const [role, permissions] of Object.entries(action.roles)) {
      const result = yield Put(`${API_URL}/roles/${encodeURIComponent(role)}/permissions`, { permissions });
      if (!result?.success) throw new Error(result?.message || `Unable to save ${role}`);
    }
    yield put({ type: actions.SET_ACCESS_ERROR, payload: "" });
    yield put({ type: actions.SET_ACCESS_NOTICE, payload: "Role permissions saved" });
    yield fetchAccess();
    yield put({ type: roleActions.GET_MY_PERMISSIONS });
  } catch (err) {
    yield put({ type: actions.SET_ACCESS_ERROR, payload: err.message });
  }
  yield put({ type: actions.SET_ACCESS_SAVING, payload: false });
};

const saveDepartment = function* (action) {
  yield save(`${API_URL}/access/department/${encodeURIComponent(action.name)}`, { allow: action.allow }, `Saved access for ${action.name}`);
};

const saveDesignation = function* (action) {
  yield save(`${API_URL}/access/designation/${encodeURIComponent(action.name)}`, { allow: action.allow }, `Saved access for ${action.name}`);
};

const saveEmployee = function* (action) {
  yield save(`${API_URL}/access/employee/${action.id}`, { allow: action.allow, deny: action.deny }, `Saved access for ${action.label}`);
};

export default rootSaga;
