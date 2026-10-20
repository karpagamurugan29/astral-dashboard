import actions from "./Actions";

const initialState = {
  list: [],
  listLoading: false,
  error: "",
};

const expenseReducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.SET_EXPENSES_LOADING:
      return { ...state, listLoading: action.payload };
    case actions.SET_EXPENSES:
      return { ...state, list: action.payload || [], listLoading: false };
    case actions.SET_EXPENSE_ERROR:
      return { ...state, error: action.payload, listLoading: false };
    default:
      return state;
  }
};

export default expenseReducer;
