import React from 'react'
import { ExpenseModule } from '../../../components/expense/ExpenseModule'
import '../../../components/attendance/attendance.css'
import '../../../components/payroll/payroll.css'

// /expenses/approvals — the same module, opened on the Pending tab for reviewers.
export const ExpenseApprovals = () => <ExpenseModule defaultTab="pending" />
