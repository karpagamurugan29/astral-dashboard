import { all, put, takeEvery } from "redux-saga/effects";
import { Get, Delete } from "../../components/common/ApiCall";
import { API_URL } from "../../utils/Constants";
import actions from "./Actions";

const rootSaga = function* () {
  yield all([
    yield takeEvery(actions.GET_DOCUMENTS, fetchDocuments),
    yield takeEvery(actions.UPLOAD_DOCUMENT, uploadDocument),
    yield takeEvery(actions.DELETE_DOCUMENT, deleteDocument),
  ]);
};

const fetchDocuments = function* () {
  try {
    const result = yield Get(`${API_URL}/documents`);
    if (result?.success) yield put({ type: actions.SET_DOCUMENTS, payload: result?.data });
    else yield put({ type: actions.SET_DOCUMENT_ERROR, payload: result?.message || "Unable to load documents" });
  } catch (err) {
    yield put({ type: actions.SET_DOCUMENT_ERROR, payload: err.message });
  }
};

// Uses raw fetch (not the shared Get/Post helpers) because file uploads need a
// multipart FormData body — the shared helper always JSON.stringifies its payload.
const uploadDocument = function* (action) {
  const { formData } = action;
  try {
    const response = yield fetch(`${API_URL}/documents/upload`, {
      method: "POST",
      body: formData,
      credentials: "include",
    });
    const result = yield response.json();
    if (result?.success) {
      yield fetchDocuments();
    } else {
      yield put({ type: actions.SET_DOCUMENT_ERROR, payload: result?.message || "Unable to upload document" });
    }
  } catch (err) {
    yield put({ type: actions.SET_DOCUMENT_ERROR, payload: err.message || "Unable to upload document" });
  }
};

const deleteDocument = function* (action) {
  try {
    const result = yield Delete(`${API_URL}/documents/${action.id}`);
    if (result?.success) yield fetchDocuments();
    else yield put({ type: actions.SET_DOCUMENT_ERROR, payload: result?.message || "Unable to delete document" });
  } catch (err) {
    yield put({ type: actions.SET_DOCUMENT_ERROR, payload: err.message });
  }
};

export default rootSaga;
