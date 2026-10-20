import { put } from "redux-saga/effects";
import { store } from "../../redux/Store";
import authActions from "../../redux/auth/Actions";

const sessionHandler = function* (result) {
  return yield result;
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
