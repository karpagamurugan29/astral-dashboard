import actions from "./Actions";

const initialState = { list: [], listLoading: false, error: "" };

const branchReducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.SET_BRANCHES_LOADING:
      return { ...state, listLoading: action.payload };
    case actions.SET_BRANCHES:
      return { ...state, list: action.payload || [], listLoading: false };
    case actions.SET_BRANCH_ERROR:
      return { ...state, error: action.payload, listLoading: false };
    default:
      return state;
  }
};

export default branchReducer;
