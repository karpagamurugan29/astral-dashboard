import { all, put, takeEvery } from "redux-saga/effects";
import { Get, Post, Put, Delete } from "../../components/common/ApiCall";
import { API_URL } from "../../utils/Constants";
import actions from "./Actions";

const rootSaga = function* () {
  yield all([
    yield takeEvery(actions.GET_TASKS, fetchTasks),
    yield takeEvery(actions.ADD_TASK, addTask),
    yield takeEvery(actions.UPDATE_TASK_STATUS, updateStatus),
    yield takeEvery(actions.DELETE_TASK, deleteTask),
    yield takeEvery(actions.GET_TASK_BY_ID, fetchTaskById),
    yield takeEvery(actions.ADD_TASK_COMMENT, addComment),
  ]);
};

const fetchTasks = function* () {
  try {
    const result = yield Get(`${API_URL}/tasks`);
    if (result?.success) yield put({ type: actions.SET_TASKS, payload: result?.data });
    else yield put({ type: actions.SET_TASK_ERROR, payload: result?.message || "Unable to load tasks" });
  } catch (err) {
    yield put({ type: actions.SET_TASK_ERROR, payload: err.message });
  }
};

const addTask = function* (action) {
  try {
    const result = yield Post(`${API_URL}/tasks`, action.payload);
    if (result?.success) yield fetchTasks();
    else yield put({ type: actions.SET_TASK_ERROR, payload: result?.message || "Unable to create task" });
  } catch (err) {
    yield put({ type: actions.SET_TASK_ERROR, payload: err.message });
  }
};

const updateStatus = function* (action) {
  try {
    const result = yield Put(`${API_URL}/tasks/${action.id}/status`, { status: action.status });
    if (result?.success) yield fetchTasks();
  } catch (err) {
    yield put({ type: actions.SET_TASK_ERROR, payload: err.message });
  }
};

const deleteTask = function* (action) {
  try {
    const result = yield Delete(`${API_URL}/tasks/${action.id}`);
    if (result?.success) yield fetchTasks();
  } catch (err) {
    yield put({ type: actions.SET_TASK_ERROR, payload: err.message });
  }
};

const fetchTaskById = function* (action) {
  try {
    const result = yield Get(`${API_URL}/tasks/${action.id}`);
    if (result?.success) yield put({ type: actions.SET_TASK_DETAIL, payload: result?.data });
  } catch (err) {
    yield put({ type: actions.SET_TASK_ERROR, payload: err.message });
  }
};

const addComment = function* (action) {
  try {
    const result = yield Post(`${API_URL}/tasks/${action.id}/comments`, { message: action.message });
    if (result?.success) yield put({ type: actions.SET_TASK_DETAIL, payload: result?.data });
  } catch (err) {
    yield put({ type: actions.SET_TASK_ERROR, payload: err.message });
  }
};

export default rootSaga;
