import actions from "./Actions";

const initialState = {
  structure: null,
  runs: [],
  runDetail: null,
  myPayslips: [],
  payslipDetail: null,
  myLoans: [],
  allLoans: [],
  error: "",
};

const payrollReducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.SET_SALARY_STRUCTURE:
      return { ...state, structure: action.payload };
    case actions.SET_PAYROLL_RUNS:
      return { ...state, runs: action.payload || [] };
    case actions.SET_PAYROLL_RUN_DETAIL:
      return { ...state, runDetail: action.payload };
    case actions.SET_MY_PAYSLIPS:
      return { ...state, myPayslips: action.payload || [] };
    case actions.SET_PAYSLIP_DETAIL:
      return { ...state, payslipDetail: action.payload };
    case actions.SET_MY_LOANS:
      return { ...state, myLoans: action.payload || [] };
    case actions.SET_ALL_LOANS:
      return { ...state, allLoans: action.payload || [] };
    case actions.SET_PAYROLL_ERROR:
      return { ...state, error: action.payload };
    default:
      return state;
  }
};

export default payrollReducer;
