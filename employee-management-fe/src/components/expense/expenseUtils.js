import { useSelector } from 'react-redux'
import { useAccess } from '../../hooks/useAccess'
import { ownerId } from './ExpenseUI'

/* -------------------------------------------------------------------------- */
/*  Expense module helpers: formatting, filtering, periods, roles, exports.   */
/* -------------------------------------------------------------------------- */

export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD']
export const PAYMENT_METHODS = ['Cash', 'Personal Card', 'Corporate Card', 'UPI', 'Bank Transfer', 'Other']
export const DAY = 864e5

export const fmtMoney = (n, currency = 'INR', decimals = 0) => {
    try {
        return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en', { style: 'currency', currency: currency || 'INR', maximumFractionDigits: decimals, minimumFractionDigits: decimals }).format(Number(n) || 0)
    } catch {
        return `${currency} ${Math.round(Number(n) || 0).toLocaleString('en-IN')}`
    }
}
// ₹12.4L / ₹3.2Cr / ₹48.5K — for summary cards and charts
export const fmtShort = (n) => {
    const v = Number(n) || 0
    const a = Math.abs(v)
    if (a >= 1e7) return `₹${(v / 1e7).toFixed(a >= 1e8 ? 0 : 1)}Cr`
    if (a >= 1e5) return `₹${(v / 1e5).toFixed(a >= 1e6 ? 0 : 1)}L`
    if (a >= 1e3) return `₹${(v / 1e3).toFixed(a >= 1e4 ? 0 : 1)}K`
    return `₹${Math.round(v)}`
}
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—')
export const isoDay = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` }
export const personName = (p) => (p && typeof p === 'object' ? [p.firstName, p.lastName].filter(Boolean).join(' ') : '') || '—'
export const sumAmount = (rows) => rows.reduce((t, e) => t + (Number(e.amount) || 0), 0)

// What a claim is called in lists: its title, else its category and description.
export const expenseTitle = (e) => e.title || (e.description ? e.description.replace(/^\[Demo\]\s*/, '').slice(0, 60) : `${e.category} expense`)
export const expenseRef = (e) => `EXP-${String(e._id || '').slice(-6).toUpperCase()}`
export const submittedOn = (e) => e.submittedAt || (e.status !== 'Draft' ? e.createdAt : null)
export const daysSince = (d) => (d ? Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / DAY)) : 0)

// Dates of each step; older claims (before the history log) fall back to what they do have.
const stepAt = (e, to) => (e.history || []).filter((h) => h.to === to).slice(-1)[0]
export const approvedOn = (e) => e.approvedAt || stepAt(e, 'Approved')?.at || (['Approved', 'Processing', 'Reimbursed'].includes(e.status) ? e.updatedAt : null)
export const rejectedOn = (e) => e.rejectedAt || stepAt(e, 'Rejected')?.at || (e.status === 'Rejected' ? e.updatedAt : null)
export const reimbursedOn = (e) => e.reimbursedAt || stepAt(e, 'Reimbursed')?.at || (e.status === 'Reimbursed' ? e.updatedAt : null)
export const rejectedBy = (e) => e.rejectedBy || (e.status === 'Rejected' ? e.approvedBy : null)

/* ---------------- roles: which actions this person may see ---------------- */
// Reviewers: same rule as the existing Approvals screen and sidebar entry. Finance (reimbursement,
// reports, exports): Admin or anyone whose reporting scope covers finance (Accounts).
export const useExpenseRole = () => {
    const { isAuthenticated: user, team } = useSelector((s) => s.authReducer || {})
    const { can } = useAccess()
    const reviewer = can(['Admin', 'HR', 'Manager', 'Team Lead'], 'expenses') || !!team?.finance
    const finance = user?.role === 'Admin' || !!team?.finance
    const me = user?._id
    return {
        me, user, reviewer, finance,
        mine: (e) => String(ownerId(e)) === String(me),
        canDecide: (e) => reviewer && String(ownerId(e)) !== String(me) && e.status === 'Pending',
        canPay: (e) => finance && String(ownerId(e)) !== String(me) && ['Approved', 'Processing'].includes(e.status),
        canEdit: (e) => String(ownerId(e)) === String(me) && ['Draft', 'Changes Requested', 'Rejected'].includes(e.status),
        canDelete: (e) => String(ownerId(e)) === String(me) && ['Draft', 'Pending'].includes(e.status),
    }
}

/* ---------------- filters ---------------- */
export const EMPTY_FILTERS = { q: '', from: '', to: '', employee: '', department: '', category: '', status: '', payment: '', min: '', max: '', reimbursement: '' }
export const FILTER_LABELS = { from: 'From', to: 'To', employee: 'Employee', department: 'Department', category: 'Category', status: 'Status', payment: 'Payment', min: 'Min', max: 'Max', reimbursement: 'Reimbursement' }

export const applyFilters = (rows, f) => {
    const q = f.q.trim().toLowerCase()
    const from = f.from ? new Date(`${f.from}T00:00:00`).getTime() : null
    const to = f.to ? new Date(`${f.to}T23:59:59`).getTime() : null
    const min = f.min !== '' ? Number(f.min) : null
    const max = f.max !== '' ? Number(f.max) : null
    return rows.filter((e) => {
        if (q) {
            const hay = `${expenseTitle(e)} ${e.description || ''} ${e.category} ${personName(e.employeeId)} ${e.employeeId?.employeeId || ''} ${expenseRef(e)} ${e.paymentMethod || ''}`.toLowerCase()
            if (!hay.includes(q)) return false
        }
        const t = new Date(e.expenseDate).getTime()
        if (from !== null && t < from) return false
        if (to !== null && t > to) return false
        if (f.employee && String(ownerId(e)) !== f.employee) return false
        if (f.department && (e.employeeId?.department || '') !== f.department) return false
        if (f.category && e.category !== f.category) return false
        if (f.status && e.status !== f.status) return false
        if (f.payment && (e.paymentMethod || '') !== f.payment) return false
        if (min !== null && Number(e.amount) < min) return false
        if (max !== null && Number(e.amount) > max) return false
        if (f.reimbursement && e.status !== f.reimbursement) return false
        return true
    })
}

export const SORTS = {
    newest: ['Newest first', (a, b) => new Date(b.expenseDate) - new Date(a.expenseDate) || new Date(b.createdAt) - new Date(a.createdAt)],
    oldest: ['Oldest first', (a, b) => new Date(a.expenseDate) - new Date(b.expenseDate)],
    amountDesc: ['Amount: high to low', (a, b) => Number(b.amount) - Number(a.amount)],
    amountAsc: ['Amount: low to high', (a, b) => Number(a.amount) - Number(b.amount)],
    submitted: ['Recently submitted', (a, b) => new Date(submittedOn(b) || 0) - new Date(submittedOn(a) || 0)],
    waiting: ['Waiting longest', (a, b) => new Date(submittedOn(a) || a.createdAt) - new Date(submittedOn(b) || b.createdAt)],
    employee: ['Employee A–Z', (a, b) => personName(a.employeeId).localeCompare(personName(b.employeeId))],
}

/* ---------------- periods (reports, trends) ---------------- */
export const monthStart = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1)
export const inRange = (d, from, to) => { const t = new Date(d).getTime(); return t >= from.getTime() && t <= to.getTime() }
// The same-length window just before [from, to], for "vs previous period".
export const previousWindow = (from, to) => { const len = to.getTime() - from.getTime(); return [new Date(from.getTime() - len - 1), new Date(from.getTime() - 1)] }
export const pctChange = (now, before) => (before ? ((now - before) / before) * 100 : now ? 100 : 0)
export const thisMonth = (d) => { const s = monthStart(); return new Date(d) >= s }
export const lastMonth = (d) => { const s = monthStart(); const p = new Date(s.getFullYear(), s.getMonth() - 1, 1); const x = new Date(d); return x >= p && x < s }

/* ---------------- timeline ---------------- */
// Ordered steps for the drawer: from the history log when there is one, otherwise rebuilt.
export const timelineOf = (e) => {
    const h = e.history || []
    if (h.length) return h.map((x) => ({ label: x.action, status: x.to, by: x.by, at: x.at, comment: x.comment }))
    const steps = [{ label: 'Submitted', status: 'Pending', by: e.employeeId, at: e.createdAt }]
    if (['Approved', 'Processing', 'Reimbursed'].includes(e.status)) steps.push({ label: 'Approved', status: 'Approved', by: e.approvedBy, at: approvedOn(e) })
    if (e.status === 'Reimbursed') steps.push({ label: 'Reimbursed', status: 'Reimbursed', by: null, at: reimbursedOn(e) })
    if (e.status === 'Rejected') steps.push({ label: 'Rejected', status: 'Rejected', by: rejectedBy(e), at: rejectedOn(e), comment: e.rejectionReason })
    return steps
}
// What's still ahead of a claim, shown greyed in the timeline.
export const nextSteps = (e) => ({
    Draft: ['Submit', 'Manager review', 'Finance processing', 'Reimbursed'],
    Pending: ['Manager review', 'Finance processing', 'Reimbursed'],
    'Changes Requested': ['Resubmit', 'Manager review', 'Reimbursed'],
    Approved: ['Finance processing', 'Reimbursed'],
    Processing: ['Reimbursed'],
}[e.status] || [])

/* ---------------- exports ---------------- */
export const EXPORT_COLUMNS = [
    ['Reference', expenseRef], ['Title', expenseTitle], ['Employee', (e) => personName(e.employeeId)], ['Employee ID', (e) => e.employeeId?.employeeId || ''],
    ['Department', (e) => e.employeeId?.department || ''], ['Category', (e) => e.category], ['Amount', (e) => Number(e.amount) || 0], ['Currency', (e) => e.currency || 'INR'],
    ['Expense date', (e) => isoDay(e.expenseDate)], ['Payment method', (e) => e.paymentMethod || ''], ['Status', (e) => e.status],
    ['Submitted', (e) => (submittedOn(e) ? isoDay(submittedOn(e)) : '')], ['Approved by', (e) => (e.approvedBy ? personName(e.approvedBy) : '')],
    ['Approved on', (e) => (approvedOn(e) ? isoDay(approvedOn(e)) : '')], ['Reimbursed on', (e) => (reimbursedOn(e) ? isoDay(reimbursedOn(e)) : '')],
    ['Rejection reason', (e) => e.rejectionReason || ''], ['Description', (e) => e.description || ''],
]
const download = (content, name, type) => {
    const url = URL.createObjectURL(new Blob([content], { type }))
    const a = document.createElement('a')
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
}
const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
export const exportCsv = (rows, name = 'expenses') => {
    const lines = [EXPORT_COLUMNS.map(([h]) => h), ...rows.map((e) => EXPORT_COLUMNS.map(([, f]) => f(e)))]
    download('﻿' + lines.map((r) => r.map(csvCell).join(',')).join('\r\n'), `${name}.csv`, 'text/csv;charset=utf-8')
}
// Excel opens SpreadsheetML natively, with real number cells — no extra library needed.
const xml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
export const exportExcel = (rows, name = 'expenses', title = 'Expenses') => {
    const cell = (v) => (typeof v === 'number' ? `<Cell><Data ss:Type="Number">${v}</Data></Cell>` : `<Cell><Data ss:Type="String">${xml(v)}</Data></Cell>`)
    const head = `<Row ss:StyleID="h">${EXPORT_COLUMNS.map(([h]) => cell(h)).join('')}</Row>`
    const body = rows.map((e) => `<Row>${EXPORT_COLUMNS.map(([, f]) => cell(f(e))).join('')}</Row>`).join('')
    const doc = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="h"><Font ss:Bold="1"/></Style></Styles><Worksheet ss:Name="${xml(title).slice(0, 30)}"><Table>${head}${body}</Table></Worksheet></Workbook>`
    download(doc, `${name}.xls`, 'application/vnd.ms-excel')
}
