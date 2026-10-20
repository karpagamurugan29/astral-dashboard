import { all, put, takeEvery } from "redux-saga/effects";
import { Get, Post, Put } from "../../components/common/ApiCall";
import { API_URL } from "../../utils/Constants";
import actions from "./Actions";

const rootSaga = function* () {
  yield all([
    yield takeEvery(actions.GET_TICKETS, fetchTickets),
    yield takeEvery(actions.ADD_TICKET, addTicket),
    yield takeEvery(actions.UPDATE_TICKET_STATUS, updateTicketStatus),
  ]);
};

const fetchTickets = function* () {
  yield put({ type: actions.SET_TICKETS_LOADING, payload: true });
  try {
    const result = yield Get(`${API_URL}/tickets`);
    if (result?.success) {
      yield put({ type: actions.SET_TICKETS, payload: result?.data });
    } else {
      yield put({ type: actions.SET_TICKET_ERROR, payload: result?.message || "Unable to load tickets" });
    }
  } catch (err) {
    yield put({ type: actions.SET_TICKET_ERROR, payload: err.message || "Unable to load tickets" });
  } finally {
    yield put({ type: actions.SET_TICKETS_LOADING, payload: false });
  }
};

const addTicket = function* (action) {
  const { payload } = action;
  try {
    const result = yield Post(`${API_URL}/tickets`, payload);
    if (result?.success) {
      yield fetchTickets();
    } else {
      yield put({ type: actions.SET_TICKET_ERROR, payload: result?.message || "Unable to raise ticket" });
    }
  } catch (err) {
    yield put({ type: actions.SET_TICKET_ERROR, payload: err.message || "Unable to raise ticket" });
  }
};

const updateTicketStatus = function* (action) {
  const { id, payload } = action;
  try {
    const result = yield Put(`${API_URL}/tickets/${id}/status`, payload);
    if (result?.success) {
      yield fetchTickets();
    } else {
      yield put({ type: actions.SET_TICKET_ERROR, payload: result?.message || "Unable to update ticket" });
    }
  } catch (err) {
    yield put({ type: actions.SET_TICKET_ERROR, payload: err.message || "Unable to update ticket" });
  }
};

export default rootSaga;
