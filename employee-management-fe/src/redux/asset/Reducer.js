import actions from "./Actions";

// list: the whole register (Admin / HR); mine: { current, past } for the signed-in person
const initialState = {
  list: [],
  listLoading: false,
  mine: null,
  error: "",
};

const assetReducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.SET_ASSETS_LOADING:
      return { ...state, listLoading: action.payload };
    case actions.SET_ASSETS:
      return { ...state, list: action.payload || [], listLoading: false, error: "" };
    case actions.SET_MY_ASSETS:
      return { ...state, mine: action.payload || { current: [], past: [] } };
    case actions.SET_ASSET_ERROR:
      return { ...state, error: action.payload, listLoading: false };
    default:
      return state;
  }
};

export default assetReducer;
