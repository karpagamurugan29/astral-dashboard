import actions from "./Actions";

const initialState = {
  isAuthenticated: "",
  checkSession: localStorage.getItem('session') || false,
  permissions: [],
  message: "",
  error: "",
};

const authReducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.SET_AUTH:
      return {
        ...state,
        isAuthenticated: action.payload,
        // A fresh user (login/session-restore) clears any stale permission set from a
        // previous account on this browser until the real one comes back from the API.
        permissions: action.payload?.role ? state.permissions : [],
      };
    case actions.SET_PERMISSIONS:
      return {
        ...state,
        permissions: action.payload || []
      };
    case actions.CHECK_SESSION:
      return {
        ...state,
        checkSession: action.payload
      };
    case actions.SET_AUTH_MESSAGE:
      return { ...state, message: action.payload, error: "" };
    case actions.SET_AUTH_ERROR:
      return { ...state, error: action.payload, message: "" };
    case actions.CLEAR_AUTH_MESSAGES:
      return { ...state, error: "", message: "" };

    default:
      return state;
  }
};

export default authReducer;
