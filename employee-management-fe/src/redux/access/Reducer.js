import actions from "./Actions";

const initialState = { data: null, saving: false, error: "", notice: "" };

const accessReducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.SET_ACCESS:
      return { ...state, data: action.payload };
    case actions.SET_ACCESS_SAVING:
      return { ...state, saving: action.payload };
    case actions.SET_ACCESS_ERROR:
      return { ...state, error: action.payload, notice: action.payload ? "" : state.notice };
    case actions.SET_ACCESS_NOTICE:
      return { ...state, notice: action.payload };
    default:
      return state;
  }
};

export default accessReducer;
