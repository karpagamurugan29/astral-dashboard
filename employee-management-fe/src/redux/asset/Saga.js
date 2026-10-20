import { all, put, takeEvery } from "redux-saga/effects";
import { Get, Post, Put, Delete } from "../../components/common/ApiCall";
import { API_URL } from "../../utils/Constants";
import actions from "./Actions";

const rootSaga = function* () {
  yield all([
    yield takeEvery(actions.GET_ASSETS, fetchAssets),
    yield takeEvery(actions.ADD_ASSET, addAsset),
    yield takeEvery(actions.ASSIGN_ASSET, assignAsset),
    yield takeEvery(actions.RETURN_ASSET, returnAsset),
    yield takeEvery(actions.DELETE_ASSET, deleteAsset),
  ]);
};

const fetchAssets = function* () {
  yield put({ type: actions.SET_ASSETS_LOADING, payload: true });
  try {
    const result = yield Get(`${API_URL}/assets`);
    if (result?.success) {
      yield put({ type: actions.SET_ASSETS, payload: result?.data });
    } else {
      yield put({ type: actions.SET_ASSET_ERROR, payload: result?.message || "Unable to load assets" });
    }
  } catch (err) {
    yield put({ type: actions.SET_ASSET_ERROR, payload: err.message || "Unable to load assets" });
  } finally {
    yield put({ type: actions.SET_ASSETS_LOADING, payload: false });
  }
};

const addAsset = function* (action) {
  const { payload } = action;
  try {
    const result = yield Post(`${API_URL}/assets`, payload);
    if (result?.success) {
      yield fetchAssets();
    } else {
      yield put({ type: actions.SET_ASSET_ERROR, payload: result?.message || "Unable to add asset" });
    }
  } catch (err) {
    yield put({ type: actions.SET_ASSET_ERROR, payload: err.message || "Unable to add asset" });
  }
};

const assignAsset = function* (action) {
  const { id, payload } = action;
  try {
    const result = yield Put(`${API_URL}/assets/${id}/assign`, payload);
    if (result?.success) {
      yield fetchAssets();
    } else {
      yield put({ type: actions.SET_ASSET_ERROR, payload: result?.message || "Unable to assign asset" });
    }
  } catch (err) {
    yield put({ type: actions.SET_ASSET_ERROR, payload: err.message || "Unable to assign asset" });
  }
};

const returnAsset = function* (action) {
  const { id } = action;
  try {
    const result = yield Put(`${API_URL}/assets/${id}/return`);
    if (result?.success) {
      yield fetchAssets();
    } else {
      yield put({ type: actions.SET_ASSET_ERROR, payload: result?.message || "Unable to mark asset returned" });
    }
  } catch (err) {
    yield put({ type: actions.SET_ASSET_ERROR, payload: err.message || "Unable to mark asset returned" });
  }
};

const deleteAsset = function* (action) {
  const { id } = action;
  try {
    const result = yield Delete(`${API_URL}/assets/${id}`);
    if (result?.success) {
      yield fetchAssets();
    } else {
      yield put({ type: actions.SET_ASSET_ERROR, payload: result?.message || "Unable to delete asset" });
    }
  } catch (err) {
    yield put({ type: actions.SET_ASSET_ERROR, payload: err.message || "Unable to delete asset" });
  }
};

export default rootSaga;
