import React from 'react'
import './payroll.css'

/* -------------------------------------------------------------------------- */
/*  Shared bits for every Payroll screen: money formatting, pay components    */
/*  with colours/icons, statuses and the breakdown bar.                       */
/* -------------------------------------------------------------------------- */

export const PAYROLL_ROOT = { label: 'Payroll', to: '/payroll/payslips' }

// Change these two lines to switch currency / digit grouping app-wide.
export const CURRENCY = '₹'
const LOCALE = 'en-IN'

export const money = (n, { decimals = 0 } = {}) =>
    `${CURRENCY}${(Number(n) || 0).toLocaleString(LOCALE, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`

// Compact form for tight spots: ₹1.2L, ₹3.4Cr (Indian units).
export const moneyShort = (n) => {
    const v = Number(n) || 0
    if (Math.abs(v) >= 1e7) return `${CURRENCY}${(v / 1e7).toFixed(1).replace(/\.0$/, '')}Cr`
    if (Math.abs(v) >= 1e5) return `${CURRENCY}${(v / 1e5).toFixed(1).replace(/\.0$/, '')}L`
    if (Math.abs(v) >= 1e3) return `${CURRENCY}${(v / 1e3).toFixed(1).replace(/\.0$/, '')}K`
    return money(v)
}

export const EARNINGS = [
    { key: 'basic', label: 'Basic', icon: 'mdi-cash', color: '#0b0f19', hint: 'Fixed core pay' },
    { key: 'hra', label: 'HRA', icon: 'mdi-home-city-outline', color: '#0284c7', hint: 'House rent allowance' },
    { key: 'conveyance', label: 'Conveyance', icon: 'mdi-car-outline', color: '#0d9488', hint: 'Travel to work' },
    { key: 'medicalAllowance', label: 'Medical', icon: 'mdi-medical-bag', color: '#e11d48', hint: 'Medical allowance' },
    { key: 'specialAllowance', label: 'Special', icon: 'mdi-star-circle-outline', color: '#7c3aed', hint: 'Special allowance' },
]

export const DEDUCTIONS = [
    { key: 'providentFund', label: 'Provident fund', icon: 'mdi-piggy-bank-outline', color: '#d97706', hint: 'PF contribution' },
    { key: 'professionalTax', label: 'Professional tax', icon: 'mdi-bank-outline', color: '#ea580c', hint: 'State professional tax' },
    { key: 'incomeTax', label: 'Income tax', icon: 'mdi-file-percent-outline', color: '#dc2626', hint: 'TDS' },
    { key: 'otherDeductions', label: 'Other', icon: 'mdi-minus-circle-outline', color: '#64748b', hint: 'Any other deduction' },
]

export const sumOf = (obj, parts) => parts.reduce((s, p) => s + (Number(obj?.[p.key]) || 0), 0)

// "2026-10" → "October 2026"
export const periodLabel = (p, opts = { month: 'long', year: 'numeric' }) => {
    if (!p) return '—'
    const [y, m] = String(p).split('-').map(Number)
    if (!y || !m) return String(p)
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, opts)
}

const STATUS = {
    Draft: { color: '#d97706', icon: 'mdi-file-document-edit-outline' },
    Approved: { color: '#0284c7', icon: 'mdi-check-circle-outline' },
    Paid: { color: '#059669', icon: 'mdi-cash-check' },
    Pending: { color: '#d97706', icon: 'mdi-timer-sand' },
    Rejected: { color: '#e11d48', icon: 'mdi-close-circle-outline' },
    Disbursed: { color: '#059669', icon: 'mdi-bank-transfer-out' },
    Closed: { color: '#64748b', icon: 'mdi-lock-check-outline' },
}
export const payStatusMeta = (s) => STATUS[s] || { color: '#64748b', icon: 'mdi-circle-outline' }

export const PayStatus = ({ status }) => {
    const m = payStatusMeta(status)
    return <span className="py-status" style={{ '--c': m.color }}><i className={`mdi ${m.icon}`}></i>{status}</span>
}

// Stacked bar showing how each component contributes.
export const BreakdownBar = ({ data, parts, total }) => {
    const t = total ?? sumOf(data, parts)
    return (
        <div className="py-bar" aria-hidden="true">
            {parts.map((p) => {
                const v = Number(data?.[p.key]) || 0
                return v > 0 && t > 0 ? <span key={p.key} style={{ width: `${(v / t) * 100}%`, background: p.color }} title={`${p.label}: ${money(v)}`}></span> : null
            })}
        </div>
    )
}

export const MonthTile = ({ period, color = '#0b0f19' }) => {
    const [y, m] = String(period || '').split('-').map(Number)
    const d = y && m ? new Date(y, m - 1, 1) : null
    return (
        <span className="py-tile" style={{ '--c': color }}>
            <small>{d ? d.getFullYear() : ''}</small>
            <b>{d ? d.toLocaleDateString(undefined, { month: 'short' }) : '—'}</b>
        </span>
    )
}
