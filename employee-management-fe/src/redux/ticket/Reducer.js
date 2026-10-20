import actions from "./Actions";

const initialState = {
  list: [],
  listLoading: false,
  error: "",
};

const ticketReducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.SET_TICKETS_LOADING:
      return { ...state, listLoading: action.payload };
    case actions.SET_TICKETS:
      return { ...state, list: action.payload || [], listLoading: false };
    case actions.SET_TICKET_ERROR:
      return { ...state, error: action.payload, listLoading: false };
    default:
      return state;
  }
};

export default ticketReducer;
