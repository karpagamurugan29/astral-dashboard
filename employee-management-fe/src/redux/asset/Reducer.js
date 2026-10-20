import actions from "./Actions";

const initialState = {
  list: [],
  listLoading: false,
  error: "",
};

const assetReducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.SET_ASSETS_LOADING:
      return { ...state, listLoading: action.payload };
    case actions.SET_ASSETS:
      return { ...state, list: action.payload || [], listLoading: false };
    case actions.SET_ASSET_ERROR:
      return { ...state, error: action.payload, listLoading: false };
    default:
      return state;
  }
};

export default assetReducer;
