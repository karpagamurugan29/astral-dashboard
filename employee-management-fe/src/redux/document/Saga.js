import { all, put, select, takeEvery } from "redux-saga/effects";
import { Get, Delete, TOKEN_KEY } from "../../components/common/ApiCall";
import { API_URL } from "../../utils/Constants";
import actions from "./Actions";

const rootSaga = function* () {
  yield all([
    yield takeEvery(actions.GET_DOCUMENTS, fetchDocuments),
    yield takeEvery(actions.GET_EMPLOYEE_DOCUMENTS, fetchEmployeeDocuments),
    yield takeEvery(actions.UPLOAD_DOCUMENT, uploadDocument),
    yield takeEvery(actions.DELETE_DOCUMENT, deleteDocument),
  ]);
};

const fetchDocuments = function* () {
  try {
    const result = yield Get(`${API_URL}/documents`);
    if (result?.success) yield put({ type: actions.SET_DOCUMENTS, payload: result?.data, meta: result?.meta });
    else yield put({ type: actions.SET_DOCUMENT_ERROR, payload: result?.message || "Unable to load documents" });
  } catch (err) {
    yield put({ type: actions.SET_DOCUMENT_ERROR, payload: err.message });
  }
};

const fetchEmployeeDocuments = function* ({ employeeId }) {
  try {
    const result = yield Get(`${API_URL}/documents?employeeId=${employeeId}`);
    yield put({ type: actions.SET_EMPLOYEE_DOCUMENTS, employeeId, payload: result?.success ? result.data : [], meta: result?.meta, error: result?.success ? "" : result?.message || "Unable to load documents" });
  } catch (err) {
    yield put({ type: actions.SET_EMPLOYEE_DOCUMENTS, employeeId, payload: [], error: err.message });
  }
};

// Refresh whichever lists are on screen.
const refresh = function* () {
  yield fetchDocuments();
  const { byEmployee } = yield select((s) => s.documentReducer || {});
  if (byEmployee?.id) yield fetchEmployeeDocuments({ employeeId: byEmployee.id });
};

// Multipart upload. Raw fetch (the shared helpers JSON-encode the body), with the login token
// so it also works on phones, where the cookie is blocked.
export const postDocument = async (doc, employeeId) => {
  const fd = new FormData();
  if (employeeId) fd.append("employeeId", employeeId);
  ["title", "category", "documentNumber", "expiryDate", "notes"].forEach((k) => doc[k] && fd.append(k, doc[k]));
  fd.append("file", doc.file);
  let token = null;
  try { token = localStorage.getItem(TOKEN_KEY); } catch { /* private mode */ }
  const response = await fetch(`${API_URL}/documents/upload`, { method: "POST", body: fd, credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return response.json().catch(() => ({ success: false, message: `Upload failed (${response.status})` }));
};

// payload: { doc: {file, title, category, documentNumber, expiryDate, notes}, employeeId }; onDone(ok, message)
const uploadDocument = function* ({ payload, onDone }) {
  yield put({ type: actions.SET_DOCUMENT_UPLOADING, payload: true });
  try {
    const result = yield postDocument(payload.doc, payload.employeeId);
    if (result?.success) yield refresh();
    else yield put({ type: actions.SET_DOCUMENT_ERROR, payload: result?.message || "Unable to upload document" });
    onDone?.(!!result?.success, result?.message);
  } catch (err) {
    yield put({ type: actions.SET_DOCUMENT_ERROR, payload: err.message || "Unable to upload document" });
    onDone?.(false, err.message);
  } finally {
    yield put({ type: actions.SET_DOCUMENT_UPLOADING, payload: false });
  }
};

const deleteDocument = function* (action) {
  try {
    const result = yield Delete(`${API_URL}/documents/${action.id}`);
    if (result?.success) yield refresh();
    else yield put({ type: actions.SET_DOCUMENT_ERROR, payload: result?.message || "Unable to delete document" });
  } catch (err) {
    yield put({ type: actions.SET_DOCUMENT_ERROR, payload: err.message });
  }
};

export default rootSaga;
