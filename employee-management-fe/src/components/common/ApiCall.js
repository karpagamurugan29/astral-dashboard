import { put } from "redux-saga/effects";
import { store } from "../../redux/Store";
import authActions from "../../redux/auth/Actions";

const sessionHandler = function* (result) {
  return yield result;
};

// Login token for the Authorization header. Phones block the API's cross-site cookie, so the
// header is what keeps them signed in; the cookie still works where the browser allows it.
export const TOKEN_KEY = 'authToken';
const authHeader = () => {
  try {
    const t = localStorage.getItem(TOKEN_KEY);
    return t ? { Authorization: `Bearer ${t}` } : {};
  } catch {
    return {};
  }
};

const createRequest = function* (url, data, method, headers, sessionAlert) {
  const { contentType, ...extra } = headers || {};

  const result = yield fetch(`${url}`, {
    method: method,
    body: JSON.stringify(data),
    credentials: "include",
    headers: {
      'Content-type': contentType || 'application/json',
      'Cookie': store?.getState()?.authReducer?.sessionId,
      ...authHeader(),
      ...extra
    }
  });

  if (result?.headers?.get('Set-Cookie')) {
    yield put({ type: authActions.SET_SESSION_ID, payload: result?.headers?.get('Set-Cookie') });
  }
  const contentTypeHeader = result?.headers?.get('Content-Type');
  if (contentTypeHeader?.includes('application/json')) {
    // It's JSON
    const responseJson = yield result?.json();
    // HTTP status rides along so callers can tell "signed out" (401) from a passing server error.
    if (responseJson && typeof responseJson === 'object') Object.defineProperty(responseJson, 'httpStatus', { value: result.status });
    // The login is missing or expired: send the person back to sign in instead of showing raw
    // "Token is required" errors on every widget. The login call itself and the session check
    // handle their own 401s.
    if (result.status === 401 && !/\/(login|logout|session)(\?|$)/.test(url) && localStorage.getItem('session')) {
      localStorage.removeItem('session');
      localStorage.removeItem(TOKEN_KEY);
      window.location.assign('/?expired=1');
    }
    return yield sessionHandler(responseJson, sessionAlert);
  } else {
    return yield sessionHandler(result?.text(), sessionAlert);
  }

};

export const Get = function* (url, data, headers, sessionAlert) {
  return yield createRequest(url, data, 'GET', headers, sessionAlert);
};

export const Post = function* (url, data, headers, sessionAlert) {
  return yield createRequest(url, data, 'POST', headers, sessionAlert);
};

export const Put = function* (url, data, headers, sessionAlert) {
  return yield createRequest(url, data, 'PUT', headers, sessionAlert);
};

export const Delete = function* (url, data, headers, sessionAlert) {
  return yield createRequest(url, data, 'DELETE', headers, sessionAlert);
};
