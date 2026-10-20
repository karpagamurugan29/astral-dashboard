import actions from "./Actions";

const initialState = { list: [], detail: null, error: "" };

const taskReducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.SET_TASKS:
      return { ...state, list: action.payload || [] };
    case actions.SET_TASK_DETAIL:
      return { ...state, detail: action.payload };
    case actions.CLEAR_TASK_DETAIL:
      return { ...state, detail: null };
    case actions.SET_TASK_ERROR:
      return { ...state, error: action.payload };
    default:
      return state;
  }
};

export default taskReducer;
