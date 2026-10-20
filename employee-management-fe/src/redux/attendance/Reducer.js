import actions from "./Actions";

const initialState = {
  today: null,
  todayLoading: false,
  history: [],
  historyLoading: false,
  saving: false,
  error: "",
  team: [],
  myRegularizations: [],
  pendingRegularizations: [],
};

const attendanceReducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.SET_TODAY_ATTENDANCE:
      return { ...state, today: action.payload, todayLoading: false };

    case actions.SET_ATTENDANCE_HISTORY:
      return { ...state, history: action.payload || [], historyLoading: false };

    case actions.SET_ATTENDANCE_LOADING:
      return { ...state, todayLoading: action.payload };

    case actions.SET_ATTENDANCE_SAVING:
      return { ...state, saving: action.payload };

    case actions.SET_ATTENDANCE_ERROR:
      return { ...state, error: action.payload, saving: false, todayLoading: false, historyLoading: false };

    case actions.SET_TEAM_ATTENDANCE:
      return { ...state, team: action.payload || [] };

    case actions.SET_MY_REGULARIZATIONS:
      return { ...state, myRegularizations: action.payload || [] };

    case actions.SET_PENDING_REGULARIZATIONS:
      return { ...state, pendingRegularizations: action.payload || [] };

    default:
      return state;
  }
};

export default attendanceReducer;
