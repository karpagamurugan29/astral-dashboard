import actions from "./Actions";

const initialState = { holidays: [], shifts: [], error: "" };

const calendarReducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.SET_HOLIDAYS:
      return { ...state, holidays: action.payload || [] };
    case actions.SET_SHIFTS:
      return { ...state, shifts: action.payload || [] };
    case actions.SET_CALENDAR_ERROR:
      return { ...state, error: action.payload };
    default:
      return state;
  }
};

export default calendarReducer;
