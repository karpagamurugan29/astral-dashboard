import { all, put, takeEvery } from "redux-saga/effects";
import { Get, Post, Put, Delete } from "../../components/common/ApiCall";
import { API_URL } from "../../utils/Constants";
import actions from "./Actions";
import { postDocument } from "../document/Saga";

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
    yield takeEvery(actions.SEND_ONBOARDING_WELCOME, sendOnboardingWelcome),
    yield takeEvery(actions.CLOSE_ONBOARDING, closeOnboarding),
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
  const { payload, navigate, documents = [] } = action;
  yield put({ type: actions.SET_EMPLOYEE_LOADING, payload: true });
  try {
    const result = yield Post(`${API_URL}/employees`, payload);
    if (result?.success) {
      // Documents picked on the form need the new record's id, so they go up right after it.
      const newId = result?.data?._id;
      if (newId && documents.length) {
        const failed = [];
        for (const doc of documents) {
          const r = yield postDocument(doc, newId);
          if (!r?.success) failed.push(`${doc.title}: ${r?.message || "upload failed"}`);
        }
        if (failed.length) window.alert(`Employee added, but ${failed.length} document(s) didn't upload:\n\n${failed.join("\n")}\n\nYou can add them from the profile's Documents tab.`);
        navigate(`/employees/${newId}`);
        return;
      }
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

// onDone(ok, message) lets the page show the result inline.
const sendOnboardingWelcome = function* ({ id, onDone }) {
  try {
    const result = yield Post(`${API_URL}/employees/${id}/onboarding/welcome`, {});
    if (result?.success) yield fetchOnboardingList();
    onDone?.(!!result?.success, result?.message || "Couldn't send the welcome");
  } catch (err) {
    onDone?.(false, err.message);
  }
};

const closeOnboarding = function* ({ ids, onDone }) {
  try {
    const result = yield Post(`${API_URL}/onboarding/close`, { ids });
    if (result?.success) yield fetchOnboardingList();
    onDone?.(!!result?.success, result?.message || "Couldn't update onboarding");
  } catch (err) {
    onDone?.(false, err.message);
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
