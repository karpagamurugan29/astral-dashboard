import reducers from "./Reducers";
import { combineReducers } from "redux";
import createSagaMiddleware from "redux-saga";
import rootSaga from "./Sagas";
import { configureStore } from "@reduxjs/toolkit";
import authActions from "./auth/Actions";

const sagaMiddleware = createSagaMiddleware();

const appReducers = combineReducers({
  ...reducers,
});

// RESET_STORE (dispatched on logout) returns every reducer to its initial state.
const rootReducers = (state, action) =>
  appReducers(action.type === authActions.RESET_STORE ? undefined : state, action);

export const store = configureStore({
  reducer: rootReducers,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }).concat(sagaMiddleware),
  devTools: process.env.NODE_ENV !== "production",
});

sagaMiddleware.run(rootSaga);