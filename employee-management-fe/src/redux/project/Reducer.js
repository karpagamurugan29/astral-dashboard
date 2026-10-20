import actions from "./Actions";

const initialState = { list: [], detail: null, error: "" };

const projectReducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.SET_PROJECTS:
      return { ...state, list: action.payload || [] };
    case actions.SET_PROJECT_DETAIL:
      return { ...state, detail: action.payload };
    case actions.CLEAR_PROJECT_DETAIL:
      return { ...state, detail: null };
    case actions.SET_PROJECT_ERROR:
      return { ...state, error: action.payload };
    default:
      return state;
  }
};

export default projectReducer;
