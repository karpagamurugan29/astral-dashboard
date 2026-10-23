import actions from "./Actions";

const initialState = {
  isAuthenticated: "",
  checkSession: localStorage.getItem('session') || false,
  permissions: [],
  // Modules opened beyond the user's role (by their department or for them personally).
  granted: [],
  // Reporting-tree reach: { leads, firm, people, finance, size } — who this person looks after.
  team: null,
  // False until the first permission list arrives, so screen guards don't flash "No access".
  permissionsLoaded: false,
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
        granted: action.payload?.role ? state.granted : [],
      };
    case actions.SET_PERMISSIONS:
      return {
        ...state,
        permissions: action.payload || [],
        permissionsLoaded: true
      };
    case actions.SET_TEAM_SCOPE:
      return { ...state, team: action.payload || null };
    case actions.SET_GRANTED_PERMISSIONS:
      return {
        ...state,
        granted: action.payload || []
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
