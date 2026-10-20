import actions from "./Actions";

const initialState = { list: [], loading: false, error: "" };

const auditLogReducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.SET_AUDIT_LOGS:
      return { ...state, list: action.payload || [], loading: false };
    case actions.SET_AUDIT_LOG_ERROR:
      return { ...state, error: action.payload, loading: false };
    default:
      return state;
  }
};

export default auditLogReducer;
