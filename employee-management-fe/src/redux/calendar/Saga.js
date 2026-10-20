import { all, put, takeEvery } from "redux-saga/effects";
import { Get, Post, Delete } from "../../components/common/ApiCall";
import { API_URL } from "../../utils/Constants";
import actions from "./Actions";

const rootSaga = function* () {
  yield all([
    yield takeEvery(actions.GET_HOLIDAYS, fetchHolidays),
    yield takeEvery(actions.ADD_HOLIDAY, addHoliday),
    yield takeEvery(actions.DELETE_HOLIDAY, deleteHoliday),
    yield takeEvery(actions.GET_SHIFTS, fetchShifts),
    yield takeEvery(actions.ADD_SHIFT, addShift),
  ]);
};

const fetchHolidays = function* () {
  try {
    const result = yield Get(`${API_URL}/holidays`);
    if (result?.success) yield put({ type: actions.SET_HOLIDAYS, payload: result?.data });
  } catch (err) {
    yield put({ type: actions.SET_CALENDAR_ERROR, payload: err.message });
  }
};

const addHoliday = function* (action) {
  try {
    const result = yield Post(`${API_URL}/holidays`, action.payload);
    if (result?.success) yield fetchHolidays();
    else yield put({ type: actions.SET_CALENDAR_ERROR, payload: result?.message || "Unable to add holiday" });
  } catch (err) {
    yield put({ type: actions.SET_CALENDAR_ERROR, payload: err.message });
  }
};

const deleteHoliday = function* (action) {
  try {
    const result = yield Delete(`${API_URL}/holidays/${action.id}`);
    if (result?.success) yield fetchHolidays();
  } catch (err) {
    yield put({ type: actions.SET_CALENDAR_ERROR, payload: err.message });
  }
};

const fetchShifts = function* () {
  try {
    const result = yield Get(`${API_URL}/shifts`);
    if (result?.success) yield put({ type: actions.SET_SHIFTS, payload: result?.data });
  } catch (err) {
    yield put({ type: actions.SET_CALENDAR_ERROR, payload: err.message });
  }
};

const addShift = function* (action) {
  try {
    const result = yield Post(`${API_URL}/shifts`, action.payload);
    if (result?.success) yield fetchShifts();
    else yield put({ type: actions.SET_CALENDAR_ERROR, payload: result?.message || "Unable to add shift" });
  } catch (err) {
    yield put({ type: actions.SET_CALENDAR_ERROR, payload: err.message });
  }
};

export default rootSaga;
