import React from 'react'
import './leave.css'

/* -------------------------------------------------------------------------- */
/*  Shared bits for every Leave screen: per-type colour/icon + balance key,   */
/*  status pills and date-range formatting.                                   */
/* -------------------------------------------------------------------------- */

export const LEAVE_ROOT = { label: 'Leave', to: '/leave' }

// balanceKey matches the backend's leaveTypeMap / LeaveBalance fields.
export const LEAVE_TYPES = [
    { value: 'Casual Leave', short: 'Casual', icon: 'mdi-beach', color: '#0284c7', balanceKey: 'casual' },
    { value: 'Sick Leave', short: 'Sick', icon: 'mdi-medical-bag', color: '#e11d48', balanceKey: 'sick' },
    { value: 'Earned Leave', short: 'Earned', icon: 'mdi-star-circle-outline', color: '#059669', balanceKey: 'earned' },
    { value: 'Work From Home', short: 'WFH', icon: 'mdi-home-outline', color: '#7c3aed', balanceKey: 'workFromHome' },
    { value: 'Optional Holiday', short: 'Optional', icon: 'mdi-calendar-star', color: '#d97706', balanceKey: 'optionalHoliday' },
    { value: 'Compensatory Leave', short: 'Comp-off', icon: 'mdi-swap-horizontal-circle-outline', color: '#0d9488', balanceKey: 'compensatory' },
    { value: 'Loss Of Pay', short: 'LOP', icon: 'mdi-cash-remove', color: '#475569', balanceKey: 'lossOfPay' },
    { value: 'Maternity Leave', short: 'Maternity', icon: 'mdi-baby-carriage', color: '#db2777' },
    { value: 'Paternity Leave', short: 'Paternity', icon: 'mdi-human-male-child', color: '#2563eb' },
    { value: 'Marriage Leave', short: 'Marriage', icon: 'mdi-ring', color: '#c026d3' },
    { value: 'Bereavement Leave', short: 'Bereavement', icon: 'mdi-flower-outline', color: '#64748b' },
    { value: 'Sabbatical Leave', short: 'Sabbatical', icon: 'mdi-airplane', color: '#0891b2' },
    { value: 'Business Travel', short: 'Travel', icon: 'mdi-briefcase-outline', color: '#1d4ed8' },
    { value: 'On Duty', short: 'On duty', icon: 'mdi-badge-account-outline', color: '#16a34a' },
]
export const leaveMeta = (type) => LEAVE_TYPES.find((t) => t.value === type) || { value: type, short: type, icon: 'mdi-calendar-outline', color: '#475569' }

// Balance cards on "My leave" — the types that carry an allowance.
export const BALANCE_TYPES = LEAVE_TYPES.filter((t) => ['casual', 'sick', 'earned', 'workFromHome', 'optionalHoliday', 'compensatory'].includes(t.balanceKey))

// Compensatory stores `earned` rather than `total`.
export const allowanceOf = (balance, key) => {
    const b = balance?.[key]
    if (!b) return null
    const total = b.total ?? b.earned ?? 0
    return { total, used: b.used ?? 0, left: b.balance ?? Math.max(0, total - (b.used ?? 0)) }
}

export const LeaveTypeTag = ({ type }) => {
    const m = leaveMeta(type)
    return <span className="pp-tag" style={{ '--tag': m.color }}><i className={`mdi ${m.icon}`}></i>{m.short || type}</span>
}

const STATUS = {
    Pending: { color: '#d97706', icon: 'mdi-timer-sand' },
    Approved: { color: '#059669', icon: 'mdi-check-circle-outline' },
    Rejected: { color: '#e11d48', icon: 'mdi-close-circle-outline' },
    Cancelled: { color: '#64748b', icon: 'mdi-cancel' },
}
export const leaveStatusMeta = (s) => STATUS[s] || { color: '#64748b', icon: 'mdi-circle-outline' }

export const LeaveStatus = ({ status }) => {
    const m = leaveStatusMeta(status)
    return <span className="lv-status" style={{ '--c': m.color }}><i className={`mdi ${m.icon}`}></i>{status}</span>
}

const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString()

export const dateRange = (from, to) => {
    if (!from) return '—'
    const f = new Date(from)
    const opts = { day: 'numeric', month: 'short' }
    if (!to || sameDay(from, to)) return f.toLocaleDateString(undefined, { ...opts, year: 'numeric' })
    const t = new Date(to)
    const sameYear = f.getFullYear() === t.getFullYear()
    return `${f.toLocaleDateString(undefined, sameYear ? opts : { ...opts, year: 'numeric' })} – ${t.toLocaleDateString(undefined, { ...opts, year: 'numeric' })}`
}

export const daysLabel = (n) => {
    const v = Number(n) || 0
    return `${v} day${v === 1 ? '' : 's'}`
}

export const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime() }

// Calendar tile used in lists: month on top, day number below.
export const DateTile = ({ date, color = '#0b0f19' }) => {
    const d = new Date(date)
    return (
        <span className="lv-tile" style={{ '--c': color }}>
            <small>{d.toLocaleDateString(undefined, { month: 'short' })}</small>
            <b>{d.getDate()}</b>
        </span>
    )
}
