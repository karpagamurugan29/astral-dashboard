import actions from "./Actions";

// clientSaved holds the last client created/updated, so a form can close (or pick it) once the save succeeds.
const initialState = { list: [], detail: null, clients: [], clientDetail: null, clientSaved: null, activeTimer: null, timerBusy: false, error: "" };

const auditReducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.SET_AUDITS:
      return { ...state, list: action.payload || [] };
    case actions.SET_AUDIT_DETAIL:
      return { ...state, detail: action.payload };
    case actions.CLEAR_AUDIT_DETAIL:
      return { ...state, detail: null, error: "" };
    case actions.SET_AUDIT_CLIENTS:
      return { ...state, clients: action.payload || [] };
    case actions.SET_AUDIT_CLIENT_DETAIL:
      return { ...state, clientDetail: action.payload };
    case actions.CLEAR_AUDIT_CLIENT_DETAIL:
      return { ...state, clientDetail: null, error: "" };
    case actions.SET_AUDIT_CLIENT_SAVED:
      return { ...state, clientSaved: action.payload };
    case actions.SET_ACTIVE_AUDIT_TIMER:
      return { ...state, activeTimer: action.payload || null };
    case actions.SET_AUDIT_TIMER_BUSY:
      return { ...state, timerBusy: action.payload || false };
    case actions.SET_AUDIT_ERROR:
      return { ...state, error: action.payload };
    default:
      return state;
  }
};

export default auditReducer;
