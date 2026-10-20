import actions from "./Actions";

const initialState = { list: [], uploading: false, error: "" };

const documentReducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.SET_DOCUMENTS:
      return { ...state, list: action.payload || [] };
    case actions.SET_DOCUMENT_ERROR:
      return { ...state, error: action.payload, uploading: false };
    default:
      return state;
  }
};

export default documentReducer;
