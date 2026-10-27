import React from 'react'
import { ExpenseModule } from '../../../components/expense/ExpenseModule'
// kept so shared styles these sheets provide stay in the bundle exactly as before
import '../../../components/attendance/attendance.css'
import '../../../components/payroll/payroll.css'
import './ExpenseList.css'

// /expenses — the Expense Management module (all claims you can see, every lifecycle tab).
export const ExpenseList = () => <ExpenseModule defaultTab="all" />
