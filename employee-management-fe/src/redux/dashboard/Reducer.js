import actions from "./Actions";

const initialState = { summary: null, attendanceTrend: [], taskStatus: [], leaveBreakdown: [], projectProgress: [], auditInsights: null, todayCheckins: null, error: "" };

const dashboardReducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.SET_DASHBOARD_SUMMARY:
      return { ...state, summary: action.payload };
    case actions.SET_ATTENDANCE_TREND:
      return { ...state, attendanceTrend: action.payload || [] };
    case actions.SET_TASK_STATUS:
      return { ...state, taskStatus: action.payload || [] };
    case actions.SET_LEAVE_BREAKDOWN:
      return { ...state, leaveBreakdown: action.payload || [] };
    case actions.SET_PROJECT_PROGRESS:
      return { ...state, projectProgress: action.payload || [] };
    case actions.SET_TODAY_CHECKINS:
      return { ...state, todayCheckins: action.payload || null };
    case actions.SET_AUDIT_INSIGHTS:
      return { ...state, auditInsights: action.payload || null };
    case actions.SET_DASHBOARD_ERROR:
      return { ...state, error: action.payload };
    default:
      return state;
  }
};

export default dashboardReducer;
