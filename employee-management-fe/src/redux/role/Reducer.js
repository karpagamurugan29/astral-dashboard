import actions from "./Actions";

const initialState = { list: [], allPermissions: [], myPermissions: null, error: "" };

const roleReducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.SET_ROLES:
      return { ...state, list: action.payload?.data || [], allPermissions: action.payload?.allPermissions || [] };
    case actions.SET_MY_PERMISSIONS:
      return { ...state, myPermissions: action.payload || [] };
    case actions.SET_ROLE_ERROR:
      return { ...state, error: action.payload };
    default:
      return state;
  }
};

export default roleReducer;
