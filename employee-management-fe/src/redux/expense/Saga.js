import { all, put, takeEvery } from "redux-saga/effects";
import { Get, Post, Put, Delete, TOKEN_KEY } from "../../components/common/ApiCall";
import { API_URL } from "../../utils/Constants";
import actions from "./Actions";

const rootSaga = function* () {
  yield all([
    yield takeEvery(actions.GET_EXPENSES, fetchExpenses),
    yield takeEvery(actions.ADD_EXPENSE, addExpense),
    yield takeEvery(actions.UPDATE_EXPENSE_STATUS, updateExpenseStatus),
    yield takeEvery(actions.DELETE_EXPENSE, deleteExpense),
  ]);
};

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
const addExpense = function* (action) {
  const { payload, receiptFile } = action;
  try {
    let result;
    if (receiptFile) {
      const formData = new FormData();
      Object.entries(payload).forEach(([key, value]) => formData.append(key, value));
      formData.append("receipt", receiptFile);
      let token = null;
      try { token = localStorage.getItem(TOKEN_KEY); } catch { /* private mode */ }
      // the login token too: phones block the API cookie
      const response = yield fetch(`${API_URL}/expenses`, { method: "POST", body: formData, credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
      result = yield response.json();
    } else {
      result = yield Post(`${API_URL}/expenses`, payload);
    }
    if (result?.success) {
      yield fetchExpenses();
    } else {
      yield put({ type: actions.SET_EXPENSE_ERROR, payload: result?.message || "Unable to submit expense" });
    }
  } catch (err) {
    yield put({ type: actions.SET_EXPENSE_ERROR, payload: err.message || "Unable to submit expense" });
  }
};

const updateExpenseStatus = function* (action) {
  const { id, payload } = action;
  try {
    const result = yield Put(`${API_URL}/expenses/${id}/status`, payload);
    if (result?.success) {
      yield fetchExpenses();
    } else {
      yield put({ type: actions.SET_EXPENSE_ERROR, payload: result?.message || "Unable to update expense" });
    }
  } catch (err) {
    yield put({ type: actions.SET_EXPENSE_ERROR, payload: err.message || "Unable to update expense" });
  }
};

const deleteExpense = function* (action) {
  const { id } = action;
  try {
    const result = yield Delete(`${API_URL}/expenses/${id}`);
    if (result?.success) {
      yield fetchExpenses();
    } else {
      yield put({ type: actions.SET_EXPENSE_ERROR, payload: result?.message || "Unable to delete expense" });
    }
  } catch (err) {
    yield put({ type: actions.SET_EXPENSE_ERROR, payload: err.message || "Unable to delete expense" });
  }
};

export default rootSaga;
