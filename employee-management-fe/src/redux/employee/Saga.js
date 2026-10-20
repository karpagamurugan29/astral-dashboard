import { all, put, takeEvery } from "redux-saga/effects";
import { Get, Post, Put, Delete } from "../../components/common/ApiCall";
import { API_URL } from "../../utils/Constants";
import actions from "./Actions";

const rootSaga = function* () {
  yield all([
    yield takeEvery(actions.GET_EMPLOYEES, fetchEmployees),
    yield takeEvery(actions.GET_EMPLOYEE_BY_ID, fetchEmployeeById),
    yield takeEvery(actions.ADD_EMPLOYEE, addEmployee),
    yield takeEvery(actions.UPDATE_EMPLOYEE, updateEmployee),
    yield takeEvery(actions.DELETE_EMPLOYEE, deleteEmployee),
    yield takeEvery(actions.GET_EMPLOYEE_HISTORY, fetchEmployeeHistory),
    yield takeEvery(actions.GET_ONBOARDING_LIST, fetchOnboardingList),
    yield takeEvery(actions.UPDATE_ONBOARDING_TASK, updateOnboardingTask),
    yield takeEvery(actions.GET_OFFBOARDING_LIST, fetchOffboardingList),
    yield takeEvery(actions.INITIATE_OFFBOARDING, initiateOffboarding),
    yield takeEvery(actions.UPDATE_OFFBOARDING_TASK, updateOffboardingTask),
    yield takeEvery(actions.COMPLETE_OFFBOARDING, completeOffboarding),
  ]);
};

const fetchEmployees = function* () {
  yield put({ type: actions.SET_EMPLOYEES_LOADING, payload: true });
  try {
    const result = yield Get(`${API_URL}/employees`);
    if (result?.success) {
      yield put({ type: actions.SET_EMPLOYEES, payload: result?.data });
    } else {
      yield put({ type: actions.SET_EMPLOYEE_ERROR, payload: result?.message || "Unable to load employees" });
    }
  } catch (err) {
    yield put({ type: actions.SET_EMPLOYEE_ERROR, payload: err.message || "Unable to load employees" });
  } finally {
    yield put({ type: actions.SET_EMPLOYEES_LOADING, payload: false });
  }
};

const fetchEmployeeById = function* (action) {
  const { id } = action;
  yield put({ type: actions.SET_EMPLOYEE_LOADING, payload: true });
  try {
    const result = yield Get(`${API_URL}/employees/${id}`);
    if (result?.success) {
      yield put({ type: actions.SET_EMPLOYEE, payload: result?.data });
    } else {
      yield put({ type: actions.SET_EMPLOYEE_ERROR, payload: result?.message || "Employee not found" });
    }
  } catch (err) {
    yield put({ type: actions.SET_EMPLOYEE_ERROR, payload: err.message || "Employee not found" });
  } finally {
    yield put({ type: actions.SET_EMPLOYEE_LOADING, payload: false });
  }
};

const addEmployee = function* (action) {
  const { payload, navigate } = action;
  yield put({ type: actions.SET_EMPLOYEE_LOADING, payload: true });
  try {
    const result = yield Post(`${API_URL}/employees`, payload);
    if (result?.success) {
      navigate("/employees");
    } else {
      yield put({ type: actions.SET_EMPLOYEE_ERROR, payload: result?.message || "Unable to add employee" });
    }
  } catch (err) {
    yield put({ type: actions.SET_EMPLOYEE_ERROR, payload: err.message || "Unable to add employee" });
  } finally {
    yield put({ type: actions.SET_EMPLOYEE_LOADING, payload: false });
  }
};

const updateEmployee = function* (action) {
  const { id, payload, navigate } = action;
  yield put({ type: actions.SET_EMPLOYEE_LOADING, payload: true });
  try {
    const result = yield Put(`${API_URL}/employees/${id}`, payload);
    if (result?.success) {
      navigate("/employees");
    } else {
      yield put({ type: actions.SET_EMPLOYEE_ERROR, payload: result?.message || "Unable to update employee" });
    }
  } catch (err) {
    yield put({ type: actions.SET_EMPLOYEE_ERROR, payload: err.message || "Unable to update employee" });
  } finally {
    yield put({ type: actions.SET_EMPLOYEE_LOADING, payload: false });
  }
};

const deleteEmployee = function* (action) {
  const { id } = action;
  try {
    const result = yield Delete(`${API_URL}/employees/${id}`);
    if (result?.success) {
      yield fetchEmployees();
    } else {
      yield put({ type: actions.SET_EMPLOYEE_ERROR, payload: result?.message || "Unable to delete employee" });
    }
  } catch (err) {
    yield put({ type: actions.SET_EMPLOYEE_ERROR, payload: err.message || "Unable to delete employee" });
  }
};

const fetchEmployeeHistory = function* (action) {
  try {
    const result = yield Get(`${API_URL}/employees/${action.id}/history`);
    if (result?.success) yield put({ type: actions.SET_EMPLOYEE_HISTORY, payload: result?.data });
  } catch (err) {
    yield put({ type: actions.SET_EMPLOYEE_ERROR, payload: err.message });
  }
};

const fetchOnboardingList = function* () {
  try {
    const result = yield Get(`${API_URL}/onboarding`);
    if (result?.success) yield put({ type: actions.SET_ONBOARDING_LIST, payload: result?.data });
  } catch (err) {
    yield put({ type: actions.SET_EMPLOYEE_ERROR, payload: err.message });
  }
};

const updateOnboardingTask = function* (action) {
  const { id, taskIndex, completed } = action;
  try {
    const result = yield Put(`${API_URL}/employees/${id}/onboarding/${taskIndex}`, { completed });
    if (result?.success) yield fetchOnboardingList();
  } catch (err) {
    yield put({ type: actions.SET_EMPLOYEE_ERROR, payload: err.message });
  }
};

const fetchOffboardingList = function* () {
  try {
    const result = yield Get(`${API_URL}/offboarding`);
    if (result?.success) yield put({ type: actions.SET_OFFBOARDING_LIST, payload: result?.data });
  } catch (err) {
    yield put({ type: actions.SET_EMPLOYEE_ERROR, payload: err.message });
  }
};

const initiateOffboarding = function* (action) {
  const { id, payload } = action;
  try {
    const result = yield Post(`${API_URL}/employees/${id}/offboard`, payload);
    if (result?.success) {
      yield fetchOffboardingList();
      yield fetchEmployees();
    } else {
      yield put({ type: actions.SET_EMPLOYEE_ERROR, payload: result?.message || "Unable to start offboarding" });
    }
  } catch (err) {
    yield put({ type: actions.SET_EMPLOYEE_ERROR, payload: err.message });
  }
};

const updateOffboardingTask = function* (action) {
  const { id, taskIndex, completed } = action;
  try {
    const result = yield Put(`${API_URL}/employees/${id}/offboarding/${taskIndex}`, { completed });
    if (result?.success) yield fetchOffboardingList();
  } catch (err) {
    yield put({ type: actions.SET_EMPLOYEE_ERROR, payload: err.message });
  }
};

const completeOffboarding = function* (action) {
  const { id } = action;
  try {
    const result = yield Put(`${API_URL}/employees/${id}/offboard/complete`);
    if (result?.success) {
      yield fetchOffboardingList();
      yield fetchEmployees();
    } else {
      yield put({ type: actions.SET_EMPLOYEE_ERROR, payload: result?.message || "Unable to complete offboarding" });
    }
  } catch (err) {
    yield put({ type: actions.SET_EMPLOYEE_ERROR, payload: err.message });
  }
};

export default rootSaga;
