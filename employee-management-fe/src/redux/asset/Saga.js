import { all, put, takeEvery } from "redux-saga/effects";
import { Get, Post, Put, Delete } from "../../components/common/ApiCall";
import { API_URL } from "../../utils/Constants";
import actions from "./Actions";

const rootSaga = function* () {
  yield all([
    yield takeEvery(actions.GET_ASSETS, fetchAssets),
    yield takeEvery(actions.GET_MY_ASSETS, fetchMyAssets),
    yield takeEvery(actions.ADD_ASSET, write("POST", () => "/assets", "Unable to add asset")),
    yield takeEvery(actions.UPDATE_ASSET, write("PUT", (a) => `/assets/${a.id}`, "Unable to update asset")),
    yield takeEvery(actions.ASSIGN_ASSET, write("PUT", (a) => `/assets/${a.id}/assign`, "Unable to assign asset")),
    yield takeEvery(actions.RETURN_ASSET, write("PUT", (a) => `/assets/${a.id}/return`, "Unable to mark asset returned")),
    yield takeEvery(actions.DELETE_ASSET, write("DELETE", (a) => `/assets/${a.id}`, "Unable to remove asset")),
  ]);
};

const fetchAssets = function* () {
  yield put({ type: actions.SET_ASSETS_LOADING, payload: true });
  try {
    const result = yield Get(`${API_URL}/assets`);
    if (result?.success) yield put({ type: actions.SET_ASSETS, payload: result?.data });
    else yield put({ type: actions.SET_ASSET_ERROR, payload: result?.message || "Unable to load assets" });
  } catch (err) {
    yield put({ type: actions.SET_ASSET_ERROR, payload: err.message || "Unable to load assets" });
  } finally {
    yield put({ type: actions.SET_ASSETS_LOADING, payload: false });
  }
};

const fetchMyAssets = function* () {
  try {
    const result = yield Get(`${API_URL}/assets/mine`);
    if (result?.success) yield put({ type: actions.SET_MY_ASSETS, payload: result?.data });
    else yield put({ type: actions.SET_ASSET_ERROR, payload: result?.message || "Unable to load your assets" });
  } catch (err) {
    yield put({ type: actions.SET_ASSET_ERROR, payload: err.message || "Unable to load your assets" });
  }
};

// Every change refreshes the register; onDone(ok, message) lets the screen show the result.
const write = (method, path, fallback) => function* (action) {
  const { payload, onDone } = action;
  try {
    const url = `${API_URL}${path(action)}`;
    const result = yield method === "POST" ? Post(url, payload) : method === "PUT" ? Put(url, payload) : Delete(url);
    if (result?.success) yield fetchAssets();
    onDone?.(!!result?.success, result?.message || (result?.success ? "Done" : fallback));
  } catch (err) {
    onDone?.(false, err.message || fallback);
  }
};

export default rootSaga;
