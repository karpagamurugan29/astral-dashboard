import actions from "./Actions";

// list: everything this person may see (Documents screen); byEmployee: one person's files
// (profile / edit employee); meta: what the server says this person may do.
const initialState = { list: [], meta: {}, byEmployee: { id: null, list: [], loading: false }, uploading: false, error: "" };

const documentReducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.SET_DOCUMENTS:
      return { ...state, list: action.payload || [], meta: action.meta || state.meta, error: "" };
    case actions.GET_EMPLOYEE_DOCUMENTS:
      return { ...state, byEmployee: { id: action.employeeId, list: state.byEmployee.id === action.employeeId ? state.byEmployee.list : [], loading: true } };
    case actions.SET_EMPLOYEE_DOCUMENTS:
      return { ...state, byEmployee: { id: action.employeeId, list: action.payload || [], loading: false, error: action.error || "" }, meta: action.meta || state.meta };
    case actions.SET_DOCUMENT_UPLOADING:
      return { ...state, uploading: action.payload };
    case actions.SET_DOCUMENT_ERROR:
      return { ...state, error: action.payload, uploading: false };
    default:
      return state;
  }
};

export default documentReducer;
