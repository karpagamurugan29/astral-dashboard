import { all, put, takeEvery } from "redux-saga/effects";
import { Get, Post, Put, Delete } from "../../components/common/ApiCall";
import { API_URL } from "../../utils/Constants";
import actions from "./Actions";

const rootSaga = function* () {
  yield all([
    yield takeEvery(actions.GET_PROJECTS, fetchProjects),
    yield takeEvery(actions.ADD_PROJECT, addProject),
    yield takeEvery(actions.DELETE_PROJECT, deleteProject),
    yield takeEvery(actions.GET_PROJECT_BY_ID, fetchProjectById),
    yield takeEvery(actions.UPDATE_PROJECT, updateProject),
    yield takeEvery(actions.ADD_PROJECT_MEMBER, addMember),
    yield takeEvery(actions.REMOVE_PROJECT_MEMBER, removeMember),
  ]);
};

const fetchProjects = function* () {
  try {
    const result = yield Get(`${API_URL}/projects`);
    if (result?.success) yield put({ type: actions.SET_PROJECTS, payload: result?.data });
    else yield put({ type: actions.SET_PROJECT_ERROR, payload: result?.message || "Unable to load projects" });
  } catch (err) {
    yield put({ type: actions.SET_PROJECT_ERROR, payload: err.message });
  }
};

const addProject = function* (action) {
  try {
    const result = yield Post(`${API_URL}/projects`, action.payload);
    if (result?.success) yield fetchProjects();
    else yield put({ type: actions.SET_PROJECT_ERROR, payload: result?.message || "Unable to create project" });
  } catch (err) {
    yield put({ type: actions.SET_PROJECT_ERROR, payload: err.message });
  }
};

const deleteProject = function* (action) {
  try {
    const result = yield Delete(`${API_URL}/projects/${action.id}`);
    if (result?.success) yield fetchProjects();
  } catch (err) {
    yield put({ type: actions.SET_PROJECT_ERROR, payload: err.message });
  }
};

const fetchProjectById = function* (action) {
  try {
    const result = yield Get(`${API_URL}/projects/${action.id}`);
    if (result?.success) yield put({ type: actions.SET_PROJECT_DETAIL, payload: result?.data });
    else yield put({ type: actions.SET_PROJECT_ERROR, payload: result?.message || "Project not found" });
  } catch (err) {
    yield put({ type: actions.SET_PROJECT_ERROR, payload: err.message });
  }
};

const updateProject = function* (action) {
  const { id, payload } = action;
  try {
    const result = yield Put(`${API_URL}/projects/${id}`, payload);
    if (result?.success) yield fetchProjectById({ id });
    else yield put({ type: actions.SET_PROJECT_ERROR, payload: result?.message || "Unable to update project" });
  } catch (err) {
    yield put({ type: actions.SET_PROJECT_ERROR, payload: err.message });
  }
};

const addMember = function* (action) {
  const { id, employeeId } = action;
  try {
    const result = yield Post(`${API_URL}/projects/${id}/members`, { employeeId });
    if (result?.success) yield fetchProjectById({ id });
    else yield put({ type: actions.SET_PROJECT_ERROR, payload: result?.message || "Unable to add member" });
  } catch (err) {
    yield put({ type: actions.SET_PROJECT_ERROR, payload: err.message });
  }
};

const removeMember = function* (action) {
  const { id, employeeId } = action;
  try {
    const result = yield Delete(`${API_URL}/projects/${id}/members/${employeeId}`);
    if (result?.success) yield fetchProjectById({ id });
  } catch (err) {
    yield put({ type: actions.SET_PROJECT_ERROR, payload: err.message });
  }
};

export default rootSaga;
