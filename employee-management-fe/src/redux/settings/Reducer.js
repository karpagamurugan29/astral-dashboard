import actions from "./Actions";

const initialState = { company: null, leavePolicy: null, error: "", saved: false };

const settingsReducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.SET_COMPANY_SETTINGS:
      return { ...state, company: action.payload };
    case actions.SET_LEAVE_SETTINGS:
      return { ...state, leavePolicy: action.payload };
    case actions.SET_SETTINGS_ERROR:
      return { ...state, error: action.payload };
    default:
      return state;
  }
};

export default settingsReducer;
