import { all, put, takeEvery } from "redux-saga/effects";
import { Get, Post, Put, Delete } from "../../components/common/ApiCall";
import { API_URL } from "../../utils/Constants";
import actions from "./Actions";

const rootSaga = function* () {
  yield all([
    yield takeEvery(actions.GET_DEPARTMENTS, fetchDepartments),
    yield takeEvery(actions.ADD_DEPARTMENT, addDepartment),
    yield takeEvery(actions.UPDATE_DEPARTMENT, updateDepartment),
    yield takeEvery(actions.DELETE_DEPARTMENT, deleteDepartment),
  ]);
};

const fetchDepartments = function* () {
  yield put({ type: actions.SET_DEPARTMENTS_LOADING, payload: true });
  try {
    const result = yield Get(`${API_URL}/departments`);
    if (result?.success) {
      yield put({ type: actions.SET_DEPARTMENTS, payload: result?.data });
    } else {
      yield put({ type: actions.SET_DEPARTMENT_ERROR, payload: result?.message || "Unable to load departments" });
    }
  } catch (err) {
    yield put({ type: actions.SET_DEPARTMENT_ERROR, payload: err.message || "Unable to load departments" });
  } finally {
    yield put({ type: actions.SET_DEPARTMENTS_LOADING, payload: false });
  }
};

const addDepartment = function* (action) {
  const { payload } = action;
  try {
    const result = yield Post(`${API_URL}/departments`, payload);
    if (result?.success) {
      yield fetchDepartments();
    } else {
      yield put({ type: actions.SET_DEPARTMENT_ERROR, payload: result?.message || "Unable to add department" });
    }
  } catch (err) {
    yield put({ type: actions.SET_DEPARTMENT_ERROR, payload: err.message || "Unable to add department" });
  }
};

const updateDepartment = function* (action) {
  const { id, payload } = action;
  try {
    const result = yield Put(`${API_URL}/departments/${id}`, payload);
    if (result?.success) {
      yield fetchDepartments();
    } else {
      yield put({ type: actions.SET_DEPARTMENT_ERROR, payload: result?.message || "Unable to update department" });
    }
  } catch (err) {
    yield put({ type: actions.SET_DEPARTMENT_ERROR, payload: err.message || "Unable to update department" });
  }
};

const deleteDepartment = function* (action) {
  const { id } = action;
  try {
    const result = yield Delete(`${API_URL}/departments/${id}`);
    if (result?.success) {
      yield fetchDepartments();
    } else {
      yield put({ type: actions.SET_DEPARTMENT_ERROR, payload: result?.message || "Unable to delete department" });
    }
  } catch (err) {
    yield put({ type: actions.SET_DEPARTMENT_ERROR, payload: err.message || "Unable to delete department" });
  }
};

export default rootSaga;
