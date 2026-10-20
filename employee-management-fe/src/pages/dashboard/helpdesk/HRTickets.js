import React, { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import ticketActions from '../../../redux/ticket/Actions'
import { PeopleShell, Avatar, EmptyState, ErrorBanner, fullName, fmtDate } from '../../../components/people/PeopleUI'
import { PriorityTag } from '../../../components/projects/ProjectUI'
import {
    HELPDESK_ROOT, TICKET_CATEGORIES, TICKET_STATUS, TicketStatus, CategoryBadge, ticketAge, ownerOf,
} from '../../../components/helpdesk/HelpdeskUI'
import '../../../components/attendance/attendance.css'

const PRIO_RANK = { High: 0, Medium: 1, Low: 2 }
const DAY = 864e5

// The next sensible moves for each status, as one-click buttons.
const NEXT = {
    Open: [{ to: 'In Progress', label: 'Start', icon: 'mdi-play-outline' }, { to: 'Resolved', label: 'Resolve', icon: 'mdi-check' }],
    'In Progress': [{ to: 'Resolved', label: 'Resolve', icon: 'mdi-check' }],
    Resolved: [{ to: 'Closed', label: 'Close', icon: 'mdi-lock-outline', ghost: true }, { to: 'Open', label: 'Reopen', icon: 'mdi-restore', ghost: true }],
    Closed: [{ to: 'Open', label: 'Reopen', icon: 'mdi-restore', ghost: true }],
}

export const HRTickets = () => {
    const dispatch = useDispatch()
    const { list, listLoading, error } = useSelector((state) => state.ticketReducer || {})
    const { isAuthenticated: user, permissions } = useSelector((state) => state.authReducer || {})
    // Same rule as the sidebar's HR Helpdesk → HR Tickets entry.
    const canManage = ['Admin', 'HR', 'Manager', 'Team Lead'].includes(user?.role) &&
        (user?.role === 'Admin' || permissions?.includes('helpdesk'))
    const [statusFilter, setStatusFilter] = useState('active')
    const [categoryFilter, setCategoryFilter] = useState('')
    const [search, setSearch] = useState('')

    useEffect(() => {
        if (canManage) dispatch({ type: ticketActions.GET_TICKETS })
    }, [dispatch, canManage])

    const onMove = (t, status) => dispatch({ type: ticketActions.UPDATE_TICKET_STATUS, id: t._id, payload: { status } })

    const others = useMemo(() => (list || []).filter((t) => ownerOf(t) !== user?._id), [list, user])
    const isActive = (t) => ['Open', 'In Progress'].includes(t.status)

    const rows = useMemo(() => {
        const q = search.trim().toLowerCase()
        return others
            .filter((t) => (statusFilter === 'active' ? isActive(t) : !statusFilter || t.status === statusFilter))
            .filter((t) => !categoryFilter || t.category === categoryFilter)
            .filter((t) => !q || `${t.subject} ${t.description} ${fullName(t.employeeId)}`.toLowerCase().includes(q))
            // Most urgent first: active before done, then priority, then oldest.
            .sort((a, b) => (isActive(b) - isActive(a)) || (PRIO_RANK[a.priority] - PRIO_RANK[b.priority]) || (new Date(a.createdAt) - new Date(b.createdAt)))
    }, [others, statusFilter, categoryFilter, search])

    const open = others.filter((t) => t.status === 'Open').length
    const progress = others.filter((t) => t.status === 'In Progress').length
    const urgent = others.filter((t) => isActive(t) && t.priority === 'High').length
    const resolvedWeek = others.filter((t) => t.resolvedAt && Date.now() - new Date(t.resolvedAt).getTime() < 7 * DAY).length

    if (!canManage) {
        return (
            <PeopleShell title="HR tickets" root={HELPDESK_ROOT} crumbs={[{ label: 'HR tickets' }]} backTo="/helpdesk">
                <div className="pp-card"><EmptyState icon="mdi-lock-outline" title="You don't have access" text="Only HR, managers and admins can work the ticket queue."
                    action={<Link to="/helpdesk" className="pp-btn">Go to my tickets</Link>} /></div>
            </PeopleShell>
        )
    }

    return (
        <PeopleShell title="HR tickets" root={HELPDESK_ROOT} crumbs={[{ label: 'HR tickets' }]} backTo="/helpdesk">
            <ErrorBanner error={error} />

            <div className="at-tiles">
                <button type="button" className={`at-tile ${statusFilter === 'Open' ? 'active' : ''}`} style={{ '--c': TICKET_STATUS.Open.color }} onClick={() => setStatusFilter(statusFilter === 'Open' ? 'active' : 'Open')}>
                    <span className="at-tile-icon"><i className="mdi mdi-email-open-outline"></i></span><div><b>{open}</b><span>New / open</span></div>
                </button>
                <button type="button" className={`at-tile ${statusFilter === 'In Progress' ? 'active' : ''}`} style={{ '--c': TICKET_STATUS['In Progress'].color }} onClick={() => setStatusFilter(statusFilter === 'In Progress' ? 'active' : 'In Progress')}>
                    <span className="at-tile-icon"><i className="mdi mdi-progress-wrench"></i></span><div><b>{progress}</b><span>In progress</span></div>
                </button>
                <div className="at-tile" style={{ '--c': urgent ? '#e11d48' : '#64748b' }}>
                    <span className="at-tile-icon"><i className="mdi mdi-fire"></i></span><div><b>{urgent}</b><span>High priority waiting</span></div>
                </div>
                <div className="at-tile" style={{ '--c': '#059669' }}>
                    <span className="at-tile-icon"><i className="mdi mdi-check-all"></i></span><div><b>{resolvedWeek}</b><span>Resolved this week</span></div>
                </div>
            </div>

            <div className="hd-toolbar">
                <div className="pp-search">
                    <i className="mdi mdi-magnify"></i>
                    <input type="search" className="pp-input" placeholder="Search subject or person…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search tickets" />
                </div>
                <div className="pp-seg" role="tablist" aria-label="Status">
                    {[['active', 'Active'], ['Resolved', 'Resolved'], ['Closed', 'Closed'], ['', 'All']].map(([k, label]) => (
                        <button key={label} type="button" className={statusFilter === k ? 'active' : ''} onClick={() => setStatusFilter(k)}>{label}</button>
                    ))}
                </div>
                <div className="at-spacer"></div>
                <select className="pp-select" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} aria-label="Topic">
                    <option value="">All topics</option>
                    {TICKET_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.value}</option>)}
                </select>
            </div>

            <section className="pp-card">
                {listLoading && !others.length ? (
                    <div className="pp-card-body">{[0, 1, 2].map((i) => <div key={i} className="pp-skel" style={{ height: 56, marginBottom: 12 }}></div>)}</div>
                ) : !rows.length ? (
                    <EmptyState icon="mdi-check-all" title={statusFilter === 'active' ? 'Queue is clear' : 'Nothing here'} text={statusFilter === 'active' ? 'No open tickets right now — nice work.' : 'No tickets match these filters.'} />
                ) : rows.map((t) => {
                    const active = isActive(t)
                    const ageDays = (Date.now() - new Date(t.createdAt).getTime()) / DAY
                    return (
                        <div key={t._id} className={`hd-row ${t.priority === 'High' && active ? 'high' : ''}`}>
                            <CategoryBadge category={t.category} />
                            <div className="hd-main">
                                <div className="hd-subject">{t.subject}</div>
                                <div className="hd-desc">{t.description}</div>
                                <div className="hd-meta">
                                    <span className="d-inline-flex align-items-center gap-1"><Avatar person={t.employeeId} size={20} />{fullName(t.employeeId)}</span>
                                    <span>{t.category}</span>
                                    <PriorityTag priority={t.priority} />
                                    <span className={`hd-age ${active && ageDays >= 3 ? 'old' : ''}`}><i className="mdi mdi-clock-outline"></i>{active ? `waiting ${ticketAge(t.createdAt)}` : fmtDate(t.createdAt)}</span>
                                </div>
                            </div>
                            <div className="hd-side">
                                <TicketStatus status={t.status} />
                                <div className="hd-actions">
                                    {(NEXT[t.status] || []).map((n) => (
                                        <button key={n.to} type="button" className={`hd-btn ${n.ghost ? 'ghost' : ''}`} style={{ '--c': TICKET_STATUS[n.to].color }} onClick={() => onMove(t, n.to)}>
                                            <i className={`mdi ${n.icon}`}></i>{n.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )
                })}
            </section>
        </PeopleShell>
    )
}
