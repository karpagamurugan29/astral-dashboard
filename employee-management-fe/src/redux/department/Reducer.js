import actions from "./Actions";

const initialState = {
  list: [],
  listLoading: false,
  error: "",
};

const departmentReducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.SET_DEPARTMENTS_LOADING:
      return { ...state, listLoading: action.payload };

    case actions.SET_DEPARTMENTS:
      return { ...state, list: action.payload || [], listLoading: false };

    case actions.SET_DEPARTMENT_ERROR:
      return { ...state, error: action.payload, listLoading: false };

    default:
      return state;
  }
};

export default departmentReducer;
