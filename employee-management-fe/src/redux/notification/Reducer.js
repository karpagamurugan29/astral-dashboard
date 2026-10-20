import actions from "./Actions";

const initialState = { list: [], unreadCount: 0, error: "" };

const notificationReducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.SET_NOTIFICATIONS:
      return { ...state, list: action.payload?.data || [], unreadCount: action.payload?.unreadCount || 0 };
    case actions.SET_NOTIFICATION_ERROR:
      return { ...state, error: action.payload };
    default:
      return state;
  }
};

export default notificationReducer;
