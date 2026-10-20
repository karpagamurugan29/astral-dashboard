import actions from "./Actions";

const initialState = { events: [], loading: false, error: "" };

const locationLogReducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.SET_LOCATION_LOG:
      return { ...state, events: action.payload || [], error: "" };
    case actions.SET_LOCATION_LOG_LOADING:
      return { ...state, loading: action.payload };
    case actions.SET_LOCATION_LOG_ERROR:
      return { ...state, error: action.payload };
    default:
      return state;
  }
};

export default locationLogReducer;
