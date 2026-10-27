import { all, put, takeEvery } from "redux-saga/effects";
import { Get, Post, Put, Delete, TOKEN_KEY } from "../../components/common/ApiCall";
import { API_URL } from "../../utils/Constants";
import actions from "./Actions";

const rootSaga = function* () {
  yield all([
    yield takeEvery(actions.GET_EXPENSES, fetchExpenses),
    yield takeEvery(actions.ADD_EXPENSE, addExpense),
    yield takeEvery(actions.UPDATE_EXPENSE, updateExpense),
    yield takeEvery(actions.UPDATE_EXPENSE_STATUS, updateExpenseStatus),
    yield takeEvery(actions.BULK_EXPENSE_STATUS, bulkExpenseStatus),
    yield takeEvery(actions.DELETE_EXPENSE, deleteExpense),
  ]);
};

// Every write accepts an optional onDone(ok, message) so screens can show a toast or close a drawer.
const done = (action, ok, message) => { if (typeof action.onDone === "function") action.onDone(ok, message); };

const fetchExpenses = function* () {
  yield put({ type: actions.SET_EXPENSES_LOADING, payload: true });
  try {
    const result = yield Get(`${API_URL}/expenses`);
    if (result?.success) {
      yield put({ type: actions.SET_EXPENSES, payload: result?.data });
    } else {
      yield put({ type: actions.SET_EXPENSE_ERROR, payload: result?.message || "Unable to load expenses" });
    }
  } catch (err) {
    yield put({ type: actions.SET_EXPENSE_ERROR, payload: err.message || "Unable to load expenses" });
  } finally {
    yield put({ type: actions.SET_EXPENSES_LOADING, payload: false });
  }
};

// Uses raw fetch (not the shared Post helper) when a receipt file is attached, since that
// needs a multipart FormData body — the shared helper always JSON.stringifies its payload
// (same reasoning as redux/document/Saga.js's upload).
const sendWithReceipt = function* (method, url, payload, receiptFile) {
  const formData = new FormData();
  Object.entries(payload).forEach(([key, value]) => { if (value !== undefined && value !== null) formData.append(key, value); });
  formData.append("receipt", receiptFile);
  let token = null;
  try { token = localStorage.getItem(TOKEN_KEY); } catch { /* private mode */ }
  // the login token too: phones block the API cookie
  const response = yield fetch(url, { method, body: formData, credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return yield response.json();
};

const addExpense = function* (action) {
  const { payload, receiptFile } = action;
  try {
    const result = receiptFile
      ? yield sendWithReceipt("POST", `${API_URL}/expenses`, payload, receiptFile)
      : yield Post(`${API_URL}/expenses`, payload);
    if (result?.success) {
      yield fetchExpenses();
      done(action, true, result.message);
    } else {
      yield put({ type: actions.SET_EXPENSE_ERROR, payload: result?.message || "Unable to submit expense" });
      done(action, false, result?.message || "Unable to submit expense");
    }
  } catch (err) {
    yield put({ type: actions.SET_EXPENSE_ERROR, payload: err.message || "Unable to submit expense" });
    done(action, false, err.message || "Unable to submit expense");
  }
};

// The owner edits a draft or a claim that was sent back; payload.submit sends it for approval.
const updateExpense = function* (action) {
  const { id, payload, receiptFile } = action;
  try {
    const result = receiptFile
      ? yield sendWithReceipt("PUT", `${API_URL}/expenses/${id}`, payload, receiptFile)
      : yield Put(`${API_URL}/expenses/${id}`, payload);
    if (result?.success) {
      yield fetchExpenses();
      done(action, true, result.message);
    } else {
      done(action, false, result?.message || "Unable to save the claim");
    }
  } catch (err) {
    done(action, false, err.message || "Unable to save the claim");
  }
};

const updateExpenseStatus = function* (action) {
  const { id, payload } = action;
  try {
    const result = yield Put(`${API_URL}/expenses/${id}/status`, payload);
    if (result?.success) {
      yield fetchExpenses();
      done(action, true, result.message);
    } else {
      yield put({ type: actions.SET_EXPENSE_ERROR, payload: result?.message || "Unable to update expense" });
      done(action, false, result?.message || "Unable to update expense");
    }
  } catch (err) {
    yield put({ type: actions.SET_EXPENSE_ERROR, payload: err.message || "Unable to update expense" });
    done(action, false, err.message || "Unable to update expense");
  }
};

// Same status change for several claims, one request each, then a single refresh.
const bulkExpenseStatus = function* (action) {
  const { ids = [], payload } = action;
  let ok = 0;
  const failed = [];
  for (const id of ids) {
    try {
      const result = yield Put(`${API_URL}/expenses/${id}/status`, payload);
      if (result?.success) ok++; else failed.push(result?.message || "Failed");
    } catch (err) {
      failed.push(err.message || "Failed");
    }
  }
  yield fetchExpenses();
  done(action, failed.length === 0, failed.length ? `${ok} updated · ${failed.length} not changed (${failed[0]})` : `${ok} claim${ok === 1 ? "" : "s"} updated`);
};

const deleteExpense = function* (action) {
  const { id } = action;
  try {
    const result = yield Delete(`${API_URL}/expenses/${id}`);
    if (result?.success) {
      yield fetchExpenses();
      done(action, true, result.message);
    } else {
      yield put({ type: actions.SET_EXPENSE_ERROR, payload: result?.message || "Unable to delete expense" });
      done(action, false, result?.message || "Unable to delete expense");
    }
  } catch (err) {
    yield put({ type: actions.SET_EXPENSE_ERROR, payload: err.message || "Unable to delete expense" });
    done(action, false, err.message || "Unable to delete expense");
  }
};

export default rootSaga;
