import { all, put, takeEvery } from "redux-saga/effects";
import { Get, Post, Put, Delete } from "../../components/common/ApiCall";
import { API_URL } from "../../utils/Constants";
import actions from "./Actions";

const rootSaga = function* () {
  yield all([
    yield takeEvery(actions.GET_BRANCHES, fetchBranches),
    yield takeEvery(actions.ADD_BRANCH, addBranch),
    yield takeEvery(actions.UPDATE_BRANCH, updateBranch),
    yield takeEvery(actions.DELETE_BRANCH, deleteBranch),
  ]);
};

const fetchBranches = function* () {
  yield put({ type: actions.SET_BRANCHES_LOADING, payload: true });
  try {
    const result = yield Get(`${API_URL}/branches`);
    if (result?.success) yield put({ type: actions.SET_BRANCHES, payload: result?.data });
    else yield put({ type: actions.SET_BRANCH_ERROR, payload: result?.message || "Unable to load branches" });
  } catch (err) {
    yield put({ type: actions.SET_BRANCH_ERROR, payload: err.message });
  } finally {
    yield put({ type: actions.SET_BRANCHES_LOADING, payload: false });
  }
};

const addBranch = function* (action) {
  try {
    const result = yield Post(`${API_URL}/branches`, action.payload);
    if (result?.success) yield fetchBranches();
    else yield put({ type: actions.SET_BRANCH_ERROR, payload: result?.message || "Unable to add branch" });
  } catch (err) {
    yield put({ type: actions.SET_BRANCH_ERROR, payload: err.message });
  }
};

const updateBranch = function* (action) {
  try {
    const result = yield Put(`${API_URL}/branches/${action.id}`, action.payload);
    if (result?.success) yield fetchBranches();
    else yield put({ type: actions.SET_BRANCH_ERROR, payload: result?.message || "Unable to update branch" });
  } catch (err) {
    yield put({ type: actions.SET_BRANCH_ERROR, payload: err.message });
  }
};

const deleteBranch = function* (action) {
  try {
    const result = yield Delete(`${API_URL}/branches/${action.id}`);
    if (result?.success) yield fetchBranches();
    else yield put({ type: actions.SET_BRANCH_ERROR, payload: result?.message || "Unable to delete branch" });
  } catch (err) {
    yield put({ type: actions.SET_BRANCH_ERROR, payload: err.message });
  }
};

export default rootSaga;
