import actions from "./Actions";

const initialState = {
  list: [],
  listLoading: false,
  error: "",
};

const designationReducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.SET_DESIGNATIONS_LOADING:
      return { ...state, listLoading: action.payload };

    case actions.SET_DESIGNATIONS:
      return { ...state, list: action.payload || [], listLoading: false };

    case actions.SET_DESIGNATION_ERROR:
      return { ...state, error: action.payload, listLoading: false };

    default:
      return state;
  }
};

export default designationReducer;
