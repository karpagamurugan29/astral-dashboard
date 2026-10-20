import { all, call, put, takeEvery, select } from "redux-saga/effects";
import { Get, Post, Put, Delete } from "../../components/common/ApiCall";
import { API_URL } from "../../utils/Constants";
import actions from "./Actions";
import { getCurrentLocation } from "../../utils/geo";

const rootSaga = function* () {
  yield all([
    yield takeEvery(actions.GET_AUDITS, fetchAudits),
    yield takeEvery(actions.ADD_AUDIT, addAudit),
    yield takeEvery(actions.DELETE_AUDIT, deleteAudit),
    yield takeEvery(actions.GET_AUDIT_BY_ID, fetchAuditById),
    yield takeEvery(actions.UPDATE_AUDIT, updateAudit),
    yield takeEvery(actions.ADD_AUDIT_MEMBER, addMember),
    yield takeEvery(actions.REMOVE_AUDIT_MEMBER, removeMember),
    yield takeEvery(actions.GET_ACTIVE_AUDIT_TIMER, fetchActiveTimer),
    yield takeEvery(actions.START_AUDIT_TIMER, startTimer),
    yield takeEvery(actions.STOP_AUDIT_TIMER, stopTimer),
    yield takeEvery(actions.GET_AUDIT_CLIENTS, fetchClients),
    yield takeEvery(actions.GET_AUDIT_CLIENT_BY_ID, fetchClientById),
    yield takeEvery(actions.ADD_AUDIT_CLIENT, addClient),
    yield takeEvery(actions.UPDATE_AUDIT_CLIENT, updateClient),
    yield takeEvery(actions.DELETE_AUDIT_CLIENT, deleteClient),
  ]);
};

const fetchAudits = function* () {
  try {
    const result = yield Get(`${API_URL}/audits`);
    if (result?.success) yield put({ type: actions.SET_AUDITS, payload: result?.data });
    else yield put({ type: actions.SET_AUDIT_ERROR, payload: result?.message || "Unable to load audits" });
  } catch (err) {
    yield put({ type: actions.SET_AUDIT_ERROR, payload: err.message });
  }
};

const addAudit = function* (action) {
  try {
    const result = yield Post(`${API_URL}/audits`, action.payload);
    if (result?.success) {
      yield put({ type: actions.SET_AUDIT_ERROR, payload: "" });
      yield fetchAudits();
      // Created from a client's page → refresh that page too.
      const client = yield select((state) => state.auditReducer?.clientDetail);
      if (client?._id) yield fetchClientById({ id: client._id });
    } else yield put({ type: actions.SET_AUDIT_ERROR, payload: result?.message || "Unable to create audit" });
  } catch (err) {
    yield put({ type: actions.SET_AUDIT_ERROR, payload: err.message });
  }
};

const deleteAudit = function* (action) {
  try {
    const result = yield Delete(`${API_URL}/audits/${action.id}`);
    if (result?.success) {
      yield fetchAudits();
      const client = yield select((state) => state.auditReducer?.clientDetail);
      if (client?._id) yield fetchClientById({ id: client._id });
    }
    else yield put({ type: actions.SET_AUDIT_ERROR, payload: result?.message || "Unable to archive audit" });
  } catch (err) {
    yield put({ type: actions.SET_AUDIT_ERROR, payload: err.message });
  }
};

const fetchAuditById = function* (action) {
  try {
    const result = yield Get(`${API_URL}/audits/${action.id}`);
    if (result?.success) yield put({ type: actions.SET_AUDIT_DETAIL, payload: result?.data });
    else yield put({ type: actions.SET_AUDIT_ERROR, payload: result?.message || "Audit not found" });
  } catch (err) {
    yield put({ type: actions.SET_AUDIT_ERROR, payload: err.message });
  }
};

const updateAudit = function* (action) {
  const { id, payload } = action;
  try {
    const result = yield Put(`${API_URL}/audits/${id}`, payload);
    if (result?.success) yield fetchAuditById({ id });
    else yield put({ type: actions.SET_AUDIT_ERROR, payload: result?.message || "Unable to update audit" });
  } catch (err) {
    yield put({ type: actions.SET_AUDIT_ERROR, payload: err.message });
  }
};

const addMember = function* (action) {
  const { id, employeeId } = action;
  try {
    const result = yield Post(`${API_URL}/audits/${id}/members`, { employeeId });
    if (result?.success) yield fetchAuditById({ id });
    else yield put({ type: actions.SET_AUDIT_ERROR, payload: result?.message || "Unable to add member" });
  } catch (err) {
    yield put({ type: actions.SET_AUDIT_ERROR, payload: err.message });
  }
};

const removeMember = function* (action) {
  const { id, employeeId } = action;
  try {
    const result = yield Delete(`${API_URL}/audits/${id}/members/${employeeId}`);
    if (result?.success) yield fetchAuditById({ id });
    else yield put({ type: actions.SET_AUDIT_ERROR, payload: result?.message || "Unable to remove member" });
  } catch (err) {
    yield put({ type: actions.SET_AUDIT_ERROR, payload: err.message });
  }
};

const fetchActiveTimer = function* () {
  try {
    const result = yield Get(`${API_URL}/audits/timer/active`);
    if (result?.success) yield put({ type: actions.SET_ACTIVE_AUDIT_TIMER, payload: result?.data });
  } catch (err) {
    yield put({ type: actions.SET_AUDIT_ERROR, payload: err.message });
  }
};

// After a start/stop, refresh whatever is on screen: the timer, the open audit, and the list.
const refreshAfterTimer = function* (id) {
  yield fetchActiveTimer();
  const detail = yield select((state) => state.auditReducer?.detail);
  if (detail?._id === id) yield fetchAuditById({ id });
  yield fetchAudits();
};

const startTimer = function* (action) {
  yield put({ type: actions.SET_AUDIT_TIMER_BUSY, payload: "locating" });
  try {
    const location = yield call(getCurrentLocation);
    yield put({ type: actions.SET_AUDIT_TIMER_BUSY, payload: true });
    const result = yield Post(`${API_URL}/audits/${action.id}/timer/start`, location);
    if (result?.success) yield put({ type: actions.SET_AUDIT_ERROR, payload: "" });
    else yield put({ type: actions.SET_AUDIT_ERROR, payload: result?.message || "Unable to start timer" });
    yield refreshAfterTimer(action.id);
  } catch (err) {
    yield put({ type: actions.SET_AUDIT_ERROR, payload: err.message });
  }
  yield put({ type: actions.SET_AUDIT_TIMER_BUSY, payload: false });
};

const stopTimer = function* (action) {
  yield put({ type: actions.SET_AUDIT_TIMER_BUSY, payload: "locating" });
  try {
    const location = yield call(getCurrentLocation);
    yield put({ type: actions.SET_AUDIT_TIMER_BUSY, payload: true });
    const result = yield Post(`${API_URL}/audits/${action.id}/timer/stop`, { ...location, note: action.note || "" });
    if (result?.success) yield put({ type: actions.SET_AUDIT_ERROR, payload: "" });
    else yield put({ type: actions.SET_AUDIT_ERROR, payload: result?.message || "Unable to stop timer" });
    yield refreshAfterTimer(action.id);
  } catch (err) {
    yield put({ type: actions.SET_AUDIT_ERROR, payload: err.message });
  }
  yield put({ type: actions.SET_AUDIT_TIMER_BUSY, payload: false });
};

/* --------------------------------- clients -------------------------------- */

const fetchClients = function* () {
  try {
    const result = yield Get(`${API_URL}/audit-clients`);
    if (result?.success) yield put({ type: actions.SET_AUDIT_CLIENTS, payload: result?.data });
    else yield put({ type: actions.SET_AUDIT_ERROR, payload: result?.message || "Unable to load clients" });
  } catch (err) {
    yield put({ type: actions.SET_AUDIT_ERROR, payload: err.message });
  }
};

const fetchClientById = function* (action) {
  try {
    const result = yield Get(`${API_URL}/audit-clients/${action.id}`);
    if (result?.success) yield put({ type: actions.SET_AUDIT_CLIENT_DETAIL, payload: result?.data });
    else yield put({ type: actions.SET_AUDIT_ERROR, payload: result?.message || "Client not found" });
  } catch (err) {
    yield put({ type: actions.SET_AUDIT_ERROR, payload: err.message });
  }
};

const addClient = function* (action) {
  try {
    const result = yield Post(`${API_URL}/audit-clients`, action.payload);
    if (result?.success) {
      yield put({ type: actions.SET_AUDIT_ERROR, payload: "" });
      yield put({ type: actions.SET_AUDIT_CLIENT_SAVED, payload: result?.data });
      yield fetchClients();
    } else yield put({ type: actions.SET_AUDIT_ERROR, payload: result?.message || "Unable to add client" });
  } catch (err) {
    yield put({ type: actions.SET_AUDIT_ERROR, payload: err.message });
  }
};

const updateClient = function* (action) {
  const { id, payload } = action;
  try {
    const result = yield Put(`${API_URL}/audit-clients/${id}`, payload);
    if (result?.success) {
      yield put({ type: actions.SET_AUDIT_ERROR, payload: "" });
      yield put({ type: actions.SET_AUDIT_CLIENT_SAVED, payload: result?.data });
      yield fetchClientById({ id });
    } else yield put({ type: actions.SET_AUDIT_ERROR, payload: result?.message || "Unable to update client" });
  } catch (err) {
    yield put({ type: actions.SET_AUDIT_ERROR, payload: err.message });
  }
};

const deleteClient = function* (action) {
  try {
    const result = yield Delete(`${API_URL}/audit-clients/${action.id}`);
    if (result?.success) {
      yield put({ type: actions.SET_AUDIT_ERROR, payload: "" });
      yield fetchClients();
      action.onDone?.();
    } else yield put({ type: actions.SET_AUDIT_ERROR, payload: result?.message || "Unable to archive client" });
  } catch (err) {
    yield put({ type: actions.SET_AUDIT_ERROR, payload: err.message });
  }
};

export default rootSaga;
