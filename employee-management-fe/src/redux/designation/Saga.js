import { all, put, takeEvery } from "redux-saga/effects";
import { Get, Post, Put, Delete } from "../../components/common/ApiCall";
import { API_URL } from "../../utils/Constants";
import actions from "./Actions";

const rootSaga = function* () {
  yield all([
    yield takeEvery(actions.GET_DESIGNATIONS, fetchDesignations),
    yield takeEvery(actions.ADD_DESIGNATION, addDesignation),
    yield takeEvery(actions.UPDATE_DESIGNATION, updateDesignation),
    yield takeEvery(actions.DELETE_DESIGNATION, deleteDesignation),
  ]);
};

const fetchDesignations = function* () {
  yield put({ type: actions.SET_DESIGNATIONS_LOADING, payload: true });
  try {
    const result = yield Get(`${API_URL}/designations`);
    if (result?.success) {
      yield put({ type: actions.SET_DESIGNATIONS, payload: result?.data });
    } else {
      yield put({ type: actions.SET_DESIGNATION_ERROR, payload: result?.message || "Unable to load designations" });
    }
  } catch (err) {
    yield put({ type: actions.SET_DESIGNATION_ERROR, payload: err.message || "Unable to load designations" });
  } finally {
    yield put({ type: actions.SET_DESIGNATIONS_LOADING, payload: false });
  }
};

const addDesignation = function* (action) {
  const { payload } = action;
  try {
    const result = yield Post(`${API_URL}/designations`, payload);
    if (result?.success) {
      yield fetchDesignations();
    } else {
      yield put({ type: actions.SET_DESIGNATION_ERROR, payload: result?.message || "Unable to add designation" });
    }
  } catch (err) {
    yield put({ type: actions.SET_DESIGNATION_ERROR, payload: err.message || "Unable to add designation" });
  }
};

const updateDesignation = function* (action) {
  const { id, payload } = action;
  try {
    const result = yield Put(`${API_URL}/designations/${id}`, payload);
    if (result?.success) {
      yield fetchDesignations();
    } else {
      yield put({ type: actions.SET_DESIGNATION_ERROR, payload: result?.message || "Unable to update designation" });
    }
  } catch (err) {
    yield put({ type: actions.SET_DESIGNATION_ERROR, payload: err.message || "Unable to update designation" });
  }
};

const deleteDesignation = function* (action) {
  const { id } = action;
  try {
    const result = yield Delete(`${API_URL}/designations/${id}`);
    if (result?.success) {
      yield fetchDesignations();
    } else {
      yield put({ type: actions.SET_DESIGNATION_ERROR, payload: result?.message || "Unable to delete designation" });
    }
  } catch (err) {
    yield put({ type: actions.SET_DESIGNATION_ERROR, payload: err.message || "Unable to delete designation" });
  }
};

export default rootSaga;
