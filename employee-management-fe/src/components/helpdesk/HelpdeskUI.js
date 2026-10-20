import React from 'react'
import '../projects/projects.css'
import './helpdesk.css'

/* Shared bits for My tickets and HR tickets. */

export const HELPDESK_ROOT = { label: 'HR Helpdesk', to: '/helpdesk' }

export const TICKET_CATEGORIES = [
    { value: 'Payroll', icon: 'mdi-cash-multiple', color: '#059669', hint: 'Salary, payslips, deductions' },
    { value: 'Leave', icon: 'mdi-beach', color: '#0284c7', hint: 'Balances, approvals, policy' },
    { value: 'IT Support', icon: 'mdi-laptop', color: '#7c3aed', hint: 'Laptop, access, accounts' },
    { value: 'HR Policy', icon: 'mdi-book-open-variant', color: '#d97706', hint: 'Rules, benefits, documents' },
    { value: 'Attendance', icon: 'mdi-clock-outline', color: '#0d9488', hint: 'Punches, shifts, corrections' },
    { value: 'Other', icon: 'mdi-help-circle-outline', color: '#64748b', hint: 'Anything else' },
]
export const ticketCategoryMeta = (c) => TICKET_CATEGORIES.find((x) => x.value === c) || TICKET_CATEGORIES[TICKET_CATEGORIES.length - 1]

export const TICKET_STATUS = {
    Open: { color: '#d97706', icon: 'mdi-email-open-outline' },
    'In Progress': { color: '#0284c7', icon: 'mdi-progress-wrench' },
    Resolved: { color: '#059669', icon: 'mdi-check-circle-outline' },
    Closed: { color: '#64748b', icon: 'mdi-lock-outline' },
}
export const TICKET_FLOW = ['Open', 'In Progress', 'Resolved']

export const TicketStatus = ({ status }) => {
    const m = TICKET_STATUS[status] || { color: '#64748b', icon: 'mdi-circle-outline' }
    return <span className="pj-pill" style={{ '--c': m.color }}><i className={`mdi ${m.icon}`}></i>{status}</span>
}

export const CategoryBadge = ({ category, size = 40 }) => {
    const m = ticketCategoryMeta(category)
    return <span className="hd-cat" style={{ '--c': m.color, width: size, height: size, fontSize: Math.round(size * 0.5) }} title={m.value}><i className={`mdi ${m.icon}`}></i></span>
}

export const ticketAge = (d) => {
    if (!d) return ''
    const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
    if (mins < 60) return `${Math.max(1, mins)}m`
    const h = Math.floor(mins / 60)
    if (h < 24) return `${h}h`
    return `${Math.floor(h / 24)}d`
}

// Open → In progress → Resolved tracker; Closed shows as fully done.
export const TicketTracker = ({ status }) => {
    const idx = status === 'Closed' ? TICKET_FLOW.length - 1 : TICKET_FLOW.indexOf(status)
    return (
        <span className="hd-track" aria-label={`Status: ${status}`}>
            {TICKET_FLOW.map((s, i) => (
                <React.Fragment key={s}>
                    {i > 0 && <span className={`hd-link ${i <= idx ? 'done' : ''}`}></span>}
                    <span className={`hd-dot ${i <= idx ? 'done' : ''}`} style={{ '--c': TICKET_STATUS[s].color }} title={s}></span>
                </React.Fragment>
            ))}
        </span>
    )
}

export const ownerOf = (t) => t.employeeId?._id || t.employeeId
