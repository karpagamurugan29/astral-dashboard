import actions from "./Actions";

const initialState = { license: null, error: "" };

const licenseReducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.SET_LICENSE_STATUS:
      return { ...state, license: action.payload };
    case actions.SET_LICENSE_ERROR:
      return { ...state, error: action.payload };
    default:
      return state;
  }
};

export default licenseReducer;
