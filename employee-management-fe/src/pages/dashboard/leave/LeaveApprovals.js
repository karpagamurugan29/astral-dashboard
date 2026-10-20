import React, { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import leaveActions from '../../../redux/leave/Actions'
import { PeopleShell, Avatar, EmptyState, ErrorBanner, fullName } from '../../../components/people/PeopleUI'
import { LEAVE_ROOT, leaveMeta, LeaveTypeTag, dateRange, daysLabel, startOfDay, DateTile } from '../../../components/leave/LeaveUI'
import '../../../components/attendance/attendance.css'
import './LeaveApprovals.css'

const DAY = 24 * 60 * 60 * 1000
const overlaps = (a, b) => startOfDay(a.fromDate) <= startOfDay(b.toDate) && startOfDay(b.fromDate) <= startOfDay(a.toDate)
const waitingLabel = (d) => {
    if (!d) return ''
    const days = Math.floor((Date.now() - new Date(d).getTime()) / DAY)
    return days <= 0 ? 'Requested today' : days === 1 ? 'Waiting 1 day' : `Waiting ${days} days`
}

export const LeaveApprovals = () => {
    const dispatch = useDispatch()
    const { pending, teamCalendar, error } = useSelector((state) => state.leaveReducer || {})
    const { isAuthenticated: user, permissions } = useSelector((state) => state.authReducer || {})
    // Same rule as the sidebar's Leave → Approvals entry.
    const canApprove = ['Admin', 'HR', 'Manager', 'Team Lead'].includes(user?.role) &&
        (user?.role === 'Admin' || permissions?.includes('leave'))
    const [rejecting, setRejecting] = useState(null)
    const [rejectReason, setRejectReason] = useState('')
    const [typeFilter, setTypeFilter] = useState('')

    useEffect(() => {
        if (!canApprove) return
        const d = new Date()
        dispatch({ type: leaveActions.GET_PENDING_LEAVES })
        dispatch({ type: leaveActions.GET_TEAM_LEAVE_CALENDAR, month: d.getMonth() + 1, year: d.getFullYear() })
    }, [dispatch, canApprove])

    const onApprove = (id) => dispatch({ type: leaveActions.APPROVE_LEAVE, id })

    const onReject = (id) => {
        dispatch({ type: leaveActions.REJECT_LEAVE, id, payload: { rejectionReason: rejectReason.trim() } })
        setRejecting(null)
        setRejectReason('')
    }

    // Oldest first — whoever has waited longest gets an answer first.
    const all = useMemo(
        () => [...(pending || [])].sort((a, b) => new Date(a.appliedOn || a.createdAt || a.fromDate) - new Date(b.appliedOn || b.createdAt || b.fromDate)),
        [pending]
    )
    const types = useMemo(() => [...new Set(all.map((l) => l.leaveType))], [all])
    const rows = typeFilter ? all.filter((l) => l.leaveType === typeFilter) : all

    const stats = useMemo(() => {
        const oldest = all[0]
        return {
            count: all.length,
            days: all.reduce((s, l) => s + (Number(l.totalDays) || 0), 0),
            people: new Set(all.map((l) => l.employeeId?._id)).size,
            oldest: oldest ? Math.max(0, Math.floor((Date.now() - new Date(oldest.appliedOn || oldest.createdAt || Date.now()).getTime()) / DAY)) : 0,
        }
    }, [all])

    // Who else is already off (approved) or also asking (pending) on the same dates.
    const othersOff = (lv) => {
        const pool = [...(teamCalendar || []), ...all].filter((o) => o._id !== lv._id && o.employeeId?._id !== lv.employeeId?._id && o.status !== 'Rejected' && overlaps(o, lv))
        const seen = new Map()
        pool.forEach((o) => seen.set(o.employeeId?._id, o.employeeId))
        return [...seen.values()]
    }

    return (
        <PeopleShell title="Leave approvals" root={LEAVE_ROOT} crumbs={[{ label: 'Approvals' }]} backTo="/leave"
            actions={<Link to="/leave/team-calendar" className="pp-btn"><i className="mdi mdi-calendar-account-outline"></i> Team calendar</Link>}>
            <ErrorBanner error={error} />

            {!canApprove ? (
                <div className="pp-card"><EmptyState icon="mdi-lock-outline" title="You don't have access" text="Only managers, team leads, HR and admins can approve leave." /></div>
            ) : (
                <>
                    <div className="at-tiles">
                        <div className="at-tile" style={{ '--c': '#d97706' }}>
                            <span className="at-tile-icon"><i className="mdi mdi-inbox-arrow-down-outline"></i></span>
                            <div><b>{stats.count}</b><span>Waiting for you</span></div>
                        </div>
                        <div className="at-tile" style={{ '--c': '#0284c7' }}>
                            <span className="at-tile-icon"><i className="mdi mdi-calendar-range"></i></span>
                            <div><b>{stats.days}</b><span>Days requested</span></div>
                        </div>
                        <div className="at-tile" style={{ '--c': '#7c3aed' }}>
                            <span className="at-tile-icon"><i className="mdi mdi-account-group-outline"></i></span>
                            <div><b>{stats.people}</b><span>People asking</span></div>
                        </div>
                        <div className="at-tile" style={{ '--c': stats.oldest >= 3 ? '#e11d48' : '#059669' }}>
                            <span className="at-tile-icon"><i className="mdi mdi-timer-sand"></i></span>
                            <div><b>{stats.count ? `${stats.oldest}d` : '—'}</b><span>Oldest request</span></div>
                        </div>
                    </div>

                    {types.length > 1 && (
                        <div className="at-toolbar">
                            <div className="la-filters">
                                <button type="button" className={`la-filter ${!typeFilter ? 'active' : ''}`} style={{ '--c': '#0b0f19' }} onClick={() => setTypeFilter('')}>All <b>{all.length}</b></button>
                                {types.map((t) => {
                                    const m = leaveMeta(t)
                                    return (
                                        <button key={t} type="button" className={`la-filter ${typeFilter === t ? 'active' : ''}`} style={{ '--c': m.color }} onClick={() => setTypeFilter(typeFilter === t ? '' : t)}>
                                            <i className={`mdi ${m.icon}`}></i>{m.short} <b>{all.filter((l) => l.leaveType === t).length}</b>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {!rows.length ? (
                        <div className="pp-card"><EmptyState icon="mdi-check-all" title="All caught up" text="No leave requests are waiting for your approval." /></div>
                    ) : (
                        <div className="la-grid">
                            {rows.map((lv) => {
                                const m = leaveMeta(lv.leaveType)
                                const others = othersOff(lv)
                                const isRejecting = rejecting === lv._id
                                return (
                                    <article key={lv._id} className="pp-card la-card" style={{ '--c': m.color }}>
                                        <div className="la-head">
                                            <Avatar person={lv.employeeId} size={44} />
                                            <div className="la-who">
                                                <Link to={`/employees/${lv.employeeId?._id}`}>{fullName(lv.employeeId)}</Link>
                                                <small>{[lv.employeeId?.designation, lv.employeeId?.department].filter(Boolean).join(' · ') || '—'}</small>
                                            </div>
                                            <span className="la-wait">{waitingLabel(lv.appliedOn || lv.createdAt)}</span>
                                        </div>

                                        <div className="la-when">
                                            <DateTile date={lv.fromDate} color={m.color} />
                                            {!lv.halfDay && new Date(lv.fromDate).toDateString() !== new Date(lv.toDate).toDateString() && (
                                                <><i className="mdi mdi-arrow-right la-arrow"></i><DateTile date={lv.toDate} color={m.color} /></>
                                            )}
                                            <div className="la-when-text">
                                                <LeaveTypeTag type={lv.leaveType} />
                                                <span>{dateRange(lv.fromDate, lv.toDate)}{lv.halfDay ? ` · ${lv.session}` : ''}</span>
                                            </div>
                                            <span className="lv-days"><b>{lv.totalDays}</b><small>{Number(lv.totalDays) === 1 ? 'day' : 'days'}</small></span>
                                        </div>

                                        {lv.reason && <div className="la-reason"><i className="mdi mdi-format-quote-open"></i>{lv.reason}</div>}

                                        {others.length > 0 && (
                                            <div className="la-overlap">
                                                <i className="mdi mdi-account-multiple-outline"></i>
                                                <span>Also off then: <b>{others.slice(0, 3).map(fullName).join(', ')}</b>{others.length > 3 ? ` +${others.length - 3} more` : ''}</span>
                                            </div>
                                        )}

                                        {isRejecting ? (
                                            <div className="la-reject">
                                                <textarea autoFocus rows={2} className="pp-input" placeholder={`Let ${lv.employeeId?.firstName || 'them'} know why (optional)`} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}></textarea>
                                                <div className="la-actions">
                                                    <button type="button" className="pp-btn" onClick={() => { setRejecting(null); setRejectReason('') }}>Back</button>
                                                    <button type="button" className="la-btn reject solid" onClick={() => onReject(lv._id)}><i className="mdi mdi-close"></i> Confirm reject</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="la-actions">
                                                <button type="button" className="la-btn reject" onClick={() => { setRejecting(lv._id); setRejectReason('') }}><i className="mdi mdi-close"></i> Reject</button>
                                                <button type="button" className="la-btn approve" onClick={() => onApprove(lv._id)}><i className="mdi mdi-check"></i> Approve {daysLabel(lv.totalDays)}</button>
                                            </div>
                                        )}
                                    </article>
                                )
                            })}
                        </div>
                    )}
                </>
            )}
        </PeopleShell>
    )
}
