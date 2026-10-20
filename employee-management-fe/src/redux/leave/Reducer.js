import actions from "./Actions";

const initialState = {
  balance: null,
  history: [],
  pending: [],
  teamCalendar: [],
  loading: false,
  saving: false,
  error: "",
};

const leaveReducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.SET_LEAVE_BALANCE:
      return { ...state, balance: action.payload, loading: false };

    case actions.SET_LEAVE_HISTORY:
      return { ...state, history: action.payload || [], loading: false };

    case actions.SET_PENDING_LEAVES:
      return { ...state, pending: action.payload || [], loading: false };

    case actions.SET_TEAM_LEAVE_CALENDAR:
      return { ...state, teamCalendar: action.payload || [] };

    case actions.SET_LEAVE_LOADING:
      return { ...state, loading: action.payload };

    case actions.SET_LEAVE_SAVING:
      return { ...state, saving: action.payload };

    case actions.SET_LEAVE_ERROR:
      return { ...state, error: action.payload, loading: false, saving: false };

    default:
      return state;
  }
};

export default leaveReducer;
