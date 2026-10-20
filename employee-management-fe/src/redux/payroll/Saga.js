import { all, put, takeEvery } from "redux-saga/effects";
import { Get, Post, Put } from "../../components/common/ApiCall";
import { API_URL } from "../../utils/Constants";
import actions from "./Actions";

const rootSaga = function* () {
  yield all([
    yield takeEvery(actions.GET_SALARY_STRUCTURE, fetchStructure),
    yield takeEvery(actions.SAVE_SALARY_STRUCTURE, saveStructure),
    yield takeEvery(actions.GENERATE_PAYROLL, generatePayroll),
    yield takeEvery(actions.GET_PAYROLL_RUNS, fetchRuns),
    yield takeEvery(actions.GET_PAYROLL_RUN_DETAIL, fetchRunDetail),
    yield takeEvery(actions.APPROVE_PAYROLL_RUN, approveRun),
    yield takeEvery(actions.MARK_PAYROLL_PAID, markPaid),
    yield takeEvery(actions.GET_MY_PAYSLIPS, fetchMyPayslips),
    yield takeEvery(actions.GET_PAYSLIP_BY_ID, fetchPayslipById),
    yield takeEvery(actions.REQUEST_LOAN, requestLoan),
    yield takeEvery(actions.GET_MY_LOANS, fetchMyLoans),
    yield takeEvery(actions.GET_ALL_LOANS, fetchAllLoans),
    yield takeEvery(actions.DECIDE_LOAN, decideLoan),
    yield takeEvery(actions.DISBURSE_LOAN, disburseLoan),
  ]);
};

const fetchStructure = function* (action) {
  try {
    const result = yield Get(`${API_URL}/salary-structures/${action.employeeId}`);
    if (result?.success) yield put({ type: actions.SET_SALARY_STRUCTURE, payload: result?.data });
  } catch (err) {
    yield put({ type: actions.SET_PAYROLL_ERROR, payload: err.message });
  }
};

const saveStructure = function* (action) {
  try {
    const result = yield Post(`${API_URL}/salary-structures`, action.payload);
    if (result?.success) yield put({ type: actions.SET_SALARY_STRUCTURE, payload: result?.data });
    else yield put({ type: actions.SET_PAYROLL_ERROR, payload: result?.message || "Unable to save salary structure" });
  } catch (err) {
    yield put({ type: actions.SET_PAYROLL_ERROR, payload: err.message });
  }
};

const fetchRuns = function* () {
  try {
    const result = yield Get(`${API_URL}/payroll`);
    if (result?.success) yield put({ type: actions.SET_PAYROLL_RUNS, payload: result?.data });
  } catch (err) {
    yield put({ type: actions.SET_PAYROLL_ERROR, payload: err.message });
  }
};

const generatePayroll = function* (action) {
  try {
    const result = yield Post(`${API_URL}/payroll/generate`, action.payload);
    if (result?.success) yield fetchRuns();
    else yield put({ type: actions.SET_PAYROLL_ERROR, payload: result?.message || "Unable to generate payroll" });
  } catch (err) {
    yield put({ type: actions.SET_PAYROLL_ERROR, payload: err.message });
  }
};

const fetchRunDetail = function* (action) {
  try {
    const result = yield Get(`${API_URL}/payroll/${action.id}`);
    if (result?.success) yield put({ type: actions.SET_PAYROLL_RUN_DETAIL, payload: result?.data });
  } catch (err) {
    yield put({ type: actions.SET_PAYROLL_ERROR, payload: err.message });
  }
};

const approveRun = function* (action) {
  try {
    const result = yield Put(`${API_URL}/payroll/${action.id}/approve`);
    if (result?.success) yield fetchRuns();
    else yield put({ type: actions.SET_PAYROLL_ERROR, payload: result?.message || "Unable to approve run" });
  } catch (err) {
    yield put({ type: actions.SET_PAYROLL_ERROR, payload: err.message });
  }
};

const markPaid = function* (action) {
  try {
    const result = yield Put(`${API_URL}/payroll/${action.id}/mark-paid`);
    if (result?.success) yield fetchRuns();
    else yield put({ type: actions.SET_PAYROLL_ERROR, payload: result?.message || "Unable to mark as paid" });
  } catch (err) {
    yield put({ type: actions.SET_PAYROLL_ERROR, payload: err.message });
  }
};

const fetchMyPayslips = function* () {
  try {
    const result = yield Get(`${API_URL}/payslips`);
    if (result?.success) yield put({ type: actions.SET_MY_PAYSLIPS, payload: result?.data });
  } catch (err) {
    yield put({ type: actions.SET_PAYROLL_ERROR, payload: err.message });
  }
};

const fetchPayslipById = function* (action) {
  try {
    const result = yield Get(`${API_URL}/payslips/${action.id}`);
    if (result?.success) yield put({ type: actions.SET_PAYSLIP_DETAIL, payload: result?.data });
  } catch (err) {
    yield put({ type: actions.SET_PAYROLL_ERROR, payload: err.message });
  }
};

const requestLoan = function* (action) {
  try {
    const result = yield Post(`${API_URL}/loans-advances`, action.payload);
    if (result?.success) yield fetchMyLoans();
    else yield put({ type: actions.SET_PAYROLL_ERROR, payload: result?.message || "Unable to submit request" });
  } catch (err) {
    yield put({ type: actions.SET_PAYROLL_ERROR, payload: err.message });
  }
};

const fetchMyLoans = function* () {
  try {
    const result = yield Get(`${API_URL}/loans-advances/my`);
    if (result?.success) yield put({ type: actions.SET_MY_LOANS, payload: result?.data });
  } catch (err) {
    yield put({ type: actions.SET_PAYROLL_ERROR, payload: err.message });
  }
};

const fetchAllLoans = function* () {
  try {
    const result = yield Get(`${API_URL}/loans-advances`);
    if (result?.success) yield put({ type: actions.SET_ALL_LOANS, payload: result?.data });
  } catch (err) {
    yield put({ type: actions.SET_PAYROLL_ERROR, payload: err.message });
  }
};

const decideLoan = function* (action) {
  try {
    const result = yield Put(`${API_URL}/loans-advances/${action.id}/decide`, { status: action.status });
    if (result?.success) yield fetchAllLoans();
    else yield put({ type: actions.SET_PAYROLL_ERROR, payload: result?.message || "Unable to update request" });
  } catch (err) {
    yield put({ type: actions.SET_PAYROLL_ERROR, payload: err.message });
  }
};

const disburseLoan = function* (action) {
  try {
    const result = yield Put(`${API_URL}/loans-advances/${action.id}/disburse`);
    if (result?.success) yield fetchAllLoans();
  } catch (err) {
    yield put({ type: actions.SET_PAYROLL_ERROR, payload: err.message });
  }
};

export default rootSaga;
