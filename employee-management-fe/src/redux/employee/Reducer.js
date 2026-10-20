import actions from "./Actions";

const initialState = {
  list: [],
  listLoading: false,
  current: null,
  loading: false,
  saving: false,
  error: "",
  history: null,
  onboardingList: [],
  offboardingList: [],
};

const employeeReducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.SET_EMPLOYEES_LOADING:
      return { ...state, listLoading: action.payload };

    case actions.SET_EMPLOYEES:
      return { ...state, list: action.payload || [], listLoading: false };

    case actions.SET_EMPLOYEE_LOADING:
      return { ...state, loading: action.payload };

    case actions.SET_EMPLOYEE:
      return { ...state, current: action.payload, loading: false };

    case actions.CLEAR_EMPLOYEE:
      return { ...state, current: null, error: "" };

    case actions.SET_EMPLOYEE_ERROR:
      return { ...state, error: action.payload, listLoading: false, loading: false };

    case actions.SET_EMPLOYEE_HISTORY:
      return { ...state, history: action.payload };

    case actions.SET_ONBOARDING_LIST:
      return { ...state, onboardingList: action.payload || [] };

    case actions.SET_OFFBOARDING_LIST:
      return { ...state, offboardingList: action.payload || [] };

    default:
      return state;
  }
};

export default employeeReducer;
