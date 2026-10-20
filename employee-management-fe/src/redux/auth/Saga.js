import { all, put, takeEvery } from "redux-saga/effects";
import { Get, Post, Put } from "../../components/common/ApiCall";
import { API_URL } from "../../utils/Constants";
import actions from "./Actions";

const rootSaga = function* () {
  yield all([
    yield takeEvery(actions.LOG_IN, homePageLogin),
    yield takeEvery(actions.LOGOUT_DASH, logoutDash),
    yield takeEvery(actions.CHECK_SESSION, checkSession),
    yield takeEvery(actions.FORGOT_PASSWORD, forgotPassword),
    yield takeEvery(actions.RESET_PASSWORD, resetPassword),
    yield takeEvery(actions.CHANGE_PASSWORD, changePassword),
    yield takeEvery(actions.UPDATE_PROFILE, updateProfile),
  ]);
};


const homePageLogin = function* (data) {
  const { payload, navigate } = data;

  try {
    const result = yield Post(`${API_URL}/login`, payload)
    if (result?.success) {
      navigate("/dashboard")
      yield put({ type: actions.SET_AUTH, payload: result?.user })
      localStorage.setItem('session', true)
      yield fetchMyPermissions()
    } else {
      yield put({ type: actions.SET_AUTH_ERROR, payload: result?.message || "Invalid email or password" })
    }
  } catch (err) {
    yield put({ type: actions.SET_AUTH_ERROR, payload: err.message || "Unable to log in" })
  }
};


const logoutDash = function* (data) {
  const { navigate } = data;

  try {
    yield Post(`${API_URL}/logout`)
  } catch (err) {
    // Ignore — the user is logged out locally either way (e.g. expired token, network error).
    // Re-throwing here would kill the root saga and break every later API call.
  } finally {
    localStorage.removeItem('session')
    // Wipe every reducer so the next user never sees the previous user's data.
    yield put({ type: actions.RESET_STORE })
    navigate("/", { replace: true })
  }
};

const checkSession = function* (action) {
  const { navigate } = action;

  try {
    const result = yield Get(`${API_URL}/session`);

    if (result?.success) {
      yield put({ type: actions.SET_AUTH, payload: result.user, });
      localStorage.setItem("session", "true");
      yield fetchMyPermissions()
    } else {
      localStorage.removeItem("session");
      yield put({
        type: actions.SET_AUTH,
        payload: {},
      });

      navigate("/");
    }
  } catch (err) {
    localStorage.removeItem("session");
    yield put({
      type: actions.SET_AUTH,
      payload: {},
    });

    navigate("/");
  }
};

// The set of screens/actions this role is currently allowed — fetched once per
// login/session-restore and kept in redux for the rest of the session, so every page can
// check `permissions.includes('module')` instead of re-deriving access from a hardcoded
// role list, and Sidebar can hide a menu item the moment an Admin revokes that module.
const fetchMyPermissions = function* () {
  try {
    const result = yield Get(`${API_URL}/roles/my-permissions`);
    if (result?.success) {
      yield put({ type: actions.SET_PERMISSIONS, payload: result.data });
    }
  } catch (err) {
    // Non-fatal — pages fall back to their role-based checks if this fails.
  }
};

const forgotPassword = function* (action) {
  const { payload, onDone } = action;
  try {
    const result = yield Post(`${API_URL}/forgot-password`, payload);
    if (result?.success) {
      yield put({ type: actions.SET_AUTH_MESSAGE, payload: result?.message || "OTP sent to your email." });
      if (onDone) onDone(result);
    } else {
      yield put({ type: actions.SET_AUTH_ERROR, payload: result?.message || "Unable to send OTP" });
    }
  } catch (err) {
    yield put({ type: actions.SET_AUTH_ERROR, payload: err.message || "Unable to send OTP" });
  }
};

const resetPassword = function* (action) {
  const { payload, navigate } = action;
  try {
    const result = yield Post(`${API_URL}/reset-password`, payload);
    if (result?.success) {
      yield put({ type: actions.SET_AUTH_MESSAGE, payload: "Password reset successfully. Please log in." });
      navigate("/");
    } else {
      yield put({ type: actions.SET_AUTH_ERROR, payload: result?.message || "Unable to reset password" });
    }
  } catch (err) {
    yield put({ type: actions.SET_AUTH_ERROR, payload: err.message || "Unable to reset password" });
  }
};

const changePassword = function* (action) {
  const { payload, onDone } = action;
  try {
    const result = yield Post(`${API_URL}/auth/change-password`, payload);
    if (result?.success) {
      yield put({ type: actions.SET_AUTH_MESSAGE, payload: "Password changed successfully." });
      if (onDone) onDone();
    } else {
      yield put({ type: actions.SET_AUTH_ERROR, payload: result?.message || "Unable to change password" });
    }
  } catch (err) {
    yield put({ type: actions.SET_AUTH_ERROR, payload: err.message || "Unable to change password" });
  }
};

const updateProfile = function* (action) {
  const { payload } = action;
  try {
    const result = yield Put(`${API_URL}/auth/profile`, payload);
    if (result?.success) {
      yield put({ type: actions.SET_AUTH, payload: result?.user });
      yield put({ type: actions.SET_AUTH_MESSAGE, payload: "Profile updated successfully." });
    } else {
      yield put({ type: actions.SET_AUTH_ERROR, payload: result?.message || "Unable to update profile" });
    }
  } catch (err) {
    yield put({ type: actions.SET_AUTH_ERROR, payload: err.message || "Unable to update profile" });
  }
};

export default rootSaga;
