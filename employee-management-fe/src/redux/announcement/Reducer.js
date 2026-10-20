import actions from "./Actions";

const initialState = {
  list: [],
  listLoading: false,
  error: "",
};

const announcementReducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.SET_ANNOUNCEMENTS_LOADING:
      return { ...state, listLoading: action.payload };
    case actions.SET_ANNOUNCEMENTS:
      return { ...state, list: action.payload || [], listLoading: false };
    case actions.SET_ANNOUNCEMENT_ERROR:
      return { ...state, error: action.payload, listLoading: false };
    default:
      return state;
  }
};

export default announcementReducer;
