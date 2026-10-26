import React, { useEffect, useState } from 'react'
import { chatApi as api } from '../chat/chatApi'
import './helpdesk.css'

/* Shared bits for My tickets, HR tickets, the ticket page and helpdesk settings.
   Which moves a person may make comes from the server (ticket.me.moves) — never decided here. */

export const HELPDESK_ROOT = { label: 'HR Helpdesk', to: '/helpdesk' }
export { api }

export const TICKET_STATUS = {
    Open: { color: '#d97706', icon: 'mdi-email-open-outline', hint: 'Waiting for HR' },
    Assigned: { color: '#7c3aed', icon: 'mdi-account-arrow-right-outline', hint: 'With the person handling it' },
    'In Progress': { color: '#0284c7', icon: 'mdi-progress-wrench', hint: 'Being worked on' },
    'Pending Employee': { color: '#db2777', icon: 'mdi-account-question-outline', hint: 'HR needs your reply' },
    'Pending HR': { color: '#0891b2', icon: 'mdi-reply-outline', hint: 'Employee replied — back with HR' },
    Escalated: { color: '#dc2626', icon: 'mdi-arrow-up-bold-circle-outline', hint: 'Under senior review' },
    Resolved: { color: '#059669', icon: 'mdi-check-circle-outline', hint: 'Fixed — confirm or reopen' },
    Closed: { color: '#64748b', icon: 'mdi-lock-outline', hint: 'Finished' },
    Reopened: { color: '#ea580c', icon: 'mdi-restore', hint: 'Not fixed — back in the queue' },
    Rejected: { color: '#475569', icon: 'mdi-close-octagon-outline', hint: 'Out of scope' },
}
export const ACTIVE = ['Open', 'Assigned', 'In Progress', 'Pending Employee', 'Pending HR', 'Escalated', 'Reopened']
export const PRIORITY = {
    Low: { color: '#64748b', icon: 'mdi-chevron-down' },
    Medium: { color: '#0284c7', icon: 'mdi-equal' },
    High: { color: '#ea580c', icon: 'mdi-chevron-up' },
    Critical: { color: '#dc2626', icon: 'mdi-chevron-double-up' },
}
const FALLBACK_CAT = { icon: 'mdi-help-circle-outline', color: '#64748b' }
export const catMeta = (meta, name) => meta?.categories?.find((c) => c.name === name) || { ...FALLBACK_CAT, name }

export const StatusPill = ({ status, small }) => {
    const m = TICKET_STATUS[status] || { color: '#64748b', icon: 'mdi-circle-outline' }
    return <span className={`hd-status ${small ? 'sm' : ''}`} style={{ '--c': m.color }} title={m.hint}><i className={`mdi ${m.icon}`}></i>{status}</span>
}
export const PriorityPill = ({ priority }) => {
    const m = PRIORITY[priority] || PRIORITY.Medium
    return <span className="hd-prio" style={{ '--c': m.color }}><i className={`mdi ${m.icon}`}></i>{priority}</span>
}
export const CategoryIcon = ({ meta, name, size = 32 }) => {
    const c = catMeta(meta, name)
    return <span className="hd-caticon" style={{ '--c': c.color, width: size, height: size, fontSize: Math.round(size * 0.52) }} title={name}><i className={`mdi ${c.icon}`}></i></span>
}

export const fmtMins = (m) => {
    if (m === null || m === undefined) return '—'
    if (m < 60) return `${m}m`
    const h = m / 60
    if (h < 24) return `${Math.round(h * 10) / 10}h`
    return `${Math.round((h / 24) * 10) / 10}d`
}
export const ago = (d) => {
    if (!d) return ''
    const mins = Math.round((Date.now() - new Date(d).getTime()) / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    if (mins < 1440) return `${Math.round(mins / 60)}h ago`
    if (mins < 10080) return `${Math.round(mins / 1440)}d ago`
    return new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}
export const fmtWhen = (d) => (d ? new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')
const until = (d) => {
    const mins = Math.round((new Date(d).getTime() - Date.now()) / 60000)
    const a = Math.abs(mins)
    const t = a < 60 ? `${a}m` : a < 1440 ? `${Math.round(a / 60)}h` : `${Math.round(a / 1440)}d`
    return mins >= 0 ? `due in ${t}` : `${t} overdue`
}

const SLA = {
    overdue: ['#dc2626', 'mdi-alarm-light-outline'], 'due-soon': ['#d97706', 'mdi-timer-sand'], 'on-track': ['#059669', 'mdi-timer-outline'],
    paused: ['#64748b', 'mdi-pause-circle-outline'], met: ['#059669', 'mdi-check-decagram-outline'], breached: ['#b91c1c', 'mdi-alert-decagram-outline'],
}
export const SlaBadge = ({ sla, compact }) => {
    if (!sla || sla.state === 'none' || !SLA[sla.state]) return <span className="hd-muted">—</span>
    const [c, ic] = SLA[sla.state]
    const text = { overdue: until(sla.dueAt), 'due-soon': until(sla.dueAt), 'on-track': until(sla.dueAt), paused: 'paused', met: 'SLA met', breached: 'SLA missed' }[sla.state]
    return <span className={`hd-sla ${sla.state}`} style={{ '--c': c }} title={sla.dueAt ? `Resolution due ${fmtWhen(sla.dueAt)}` : ''}><i className={`mdi ${ic}`}></i>{compact && sla.state === 'on-track' ? text.replace('due in ', '') : text}</span>
}

// categories, priorities, upload rules, agents and what I may do — fetched once per page
let metaCache = null
export const useTicketMeta = () => {
    const [meta, setMeta] = useState(metaCache?.value || null)
    useEffect(() => {
        if (metaCache && metaCache.at > Date.now() - 60000) return
        api('GET', '/tickets/meta').then((j) => { metaCache = { at: Date.now(), value: j.data }; setMeta(j.data) }).catch(() => {})
    }, [])
    return meta
}
export const invalidateTicketMeta = () => { metaCache = null }

// client-side copy of the server's attachment check, for an instant message
export const checkFiles = (files, rules) => {
    if (!rules) return null
    if (files.length > rules.maxFiles) return `Attach up to ${rules.maxFiles} files.`
    for (const f of files) {
        const ext = (f.name.split('.').pop() || '').toLowerCase()
        if (!rules.types.includes(ext)) return `${f.name}: allowed types are ${rules.types.join(', ')}.`
        if (f.size > rules.maxSizeMB * 1048576) return `${f.name} is larger than ${rules.maxSizeMB} MB.`
    }
    return null
}
export const fileSize = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)

export const Pager = ({ page, pages, total, limit, onPage }) => (pages > 1 || total > 0) ? (
    <div className="hd-pager">
        <span>{total ? `${(page - 1) * limit + 1}–${Math.min(total, page * limit)} of ${total}` : '0'}</span>
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><i className="mdi mdi-chevron-left"></i></button>
        <b>{page} / {pages}</b>
        <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><i className="mdi mdi-chevron-right"></i></button>
    </div>
) : null

// Sortable header cell
export const Th = ({ k, label, title, sort, setSort, className = '' }) => (
    <th title={title} className={`${className} sortable ${sort.key === k ? 'on' : ''}`} onClick={() => setSort({ key: k, dir: sort.key === k && sort.dir === 'desc' ? 'asc' : 'desc' })} aria-sort={sort.key === k ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
        {label}<i className={`mdi ${sort.key === k ? (sort.dir === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down') : 'mdi-swap-vertical'}`}></i>
    </th>
)
