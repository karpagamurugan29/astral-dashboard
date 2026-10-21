import actions from "./Actions";

const initialState = { attendance: [], leave: null, headcount: [], payroll: [], expense: null, projects: [], tasks: [], checkins: null, auditHours: null, auditProjects: null, loading: "", error: "" };

const reportReducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.SET_ATTENDANCE_REPORT:
      return { ...state, attendance: action.payload || [] };
    case actions.SET_LEAVE_REPORT:
      return { ...state, leave: action.payload };
    case actions.SET_HEADCOUNT_REPORT:
      return { ...state, headcount: action.payload || [] };
    case actions.SET_PAYROLL_REPORT:
      return { ...state, payroll: action.payload || [] };
    case actions.SET_EXPENSE_REPORT:
      return { ...state, expense: action.payload };
    case actions.SET_PROJECT_REPORT:
      return { ...state, projects: action.payload || [] };
    case actions.SET_TASK_REPORT:
      return { ...state, tasks: action.payload || [] };
    case actions.SET_CHECKIN_REPORT:
      return { ...state, checkins: action.payload };
    case actions.SET_AUDIT_HOURS_REPORT:
      return { ...state, auditHours: action.payload };
    case actions.SET_AUDIT_PROJECTS_REPORT:
      return { ...state, auditProjects: action.payload };
    case actions.SET_REPORT_LOADING:
      return { ...state, loading: action.payload };
    case actions.SET_REPORT_ERROR:
      return { ...state, error: action.payload };
    default:
      return state;
  }
};

export default reportReducer;
