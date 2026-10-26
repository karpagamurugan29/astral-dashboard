import React, { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import leaveActions from '../../../redux/leave/Actions'
import { PeopleShell, ProgressRing, EmptyState, ErrorBanner } from '../../../components/people/PeopleUI'
import {
    LEAVE_ROOT, BALANCE_TYPES, allowanceOf, leaveMeta, LeaveTypeTag, LeaveStatus, leaveStatusMeta,
    dateRange, daysLabel, startOfDay, DateTile,
} from '../../../components/leave/LeaveUI'
import '../../../components/attendance/attendance.css'
import { confirmAction } from '../../../components/common/ConfirmDialog'

const STATUSES = ['Pending', 'Approved', 'Rejected', 'Cancelled']
const DAY = 24 * 60 * 60 * 1000

export const LeaveHistory = () => {
    const dispatch = useDispatch()
    const { balance, history, loading, error } = useSelector((state) => state.leaveReducer || {})
    const [statusFilter, setStatusFilter] = useState('')
    const [typeFilter, setTypeFilter] = useState('')

    // Personal view only — approving other people's leave lives on /leave/approvals.
    useEffect(() => {
        dispatch({ type: leaveActions.GET_LEAVE_BALANCE })
        dispatch({ type: leaveActions.GET_LEAVE_HISTORY })
    }, [dispatch])

    const onCancel = async (lv) => {
        if (await confirmAction({ title: 'Cancel this leave?', message: `Your ${lv.leaveType.toLowerCase()} for ${dateRange(lv.fromDate, lv.toDate)} will be withdrawn.`, confirmLabel: 'Cancel leave', cancelLabel: 'Keep it', tone: 'warn' })) {
            dispatch({ type: leaveActions.CANCEL_LEAVE, id: lv._id })
        }
    }

    const all = useMemo(() => [...(history || [])].sort((a, b) => new Date(b.fromDate) - new Date(a.fromDate)), [history])
    const today = startOfDay(Date.now())
    const year = new Date().getFullYear()

    const upcoming = useMemo(
        () => all.filter((l) => ['Approved', 'Pending'].includes(l.status) && startOfDay(l.toDate || l.fromDate) >= today)
            .sort((a, b) => new Date(a.fromDate) - new Date(b.fromDate)),
        [all, today]
    )

    const stats = useMemo(() => ({
        pending: all.filter((l) => l.status === 'Pending').length,
        takenThisYear: all.filter((l) => l.status === 'Approved' && new Date(l.fromDate).getFullYear() === year)
            .reduce((s, l) => s + (Number(l.totalDays) || 0), 0),
        rejected: all.filter((l) => l.status === 'Rejected').length,
        next: upcoming.find((l) => l.status === 'Approved'),
    }), [all, upcoming, year])

    const counts = useMemo(() => Object.fromEntries(STATUSES.map((s) => [s, all.filter((l) => l.status === s).length])), [all])
    const typesUsed = useMemo(() => [...new Set(all.map((l) => l.leaveType))], [all])

    const rows = all
        .filter((l) => !statusFilter || l.status === statusFilter)
        .filter((l) => !typeFilter || l.leaveType === typeFilter)

    const nextIn = stats.next ? Math.max(0, Math.round((startOfDay(stats.next.fromDate) - today) / DAY)) : null

    return (
        <PeopleShell
            title="My leave"
            root={LEAVE_ROOT}
            crumbs={[{ label: 'My leave' }]}
            actions={<Link to="/leave/apply" className="pp-btn primary"><i className="mdi mdi-plus"></i> Apply leave</Link>}
        >
            <ErrorBanner error={error} />

            {/* ---------- balances ---------- */}
            <div className="lv-balances">
                {BALANCE_TYPES.map((t) => {
                    const a = allowanceOf(balance, t.balanceKey)
                    if (t.balanceKey === 'compensatory' && !a?.total) return null
                    const pctLeft = a?.total ? (a.left / a.total) * 100 : 0
                    return (
                        <Link key={t.value} to="/leave/apply" state={{ leaveType: t.value }} className="pp-card lv-bal" style={{ '--c': t.color }} title={`Apply for ${t.value}`}>
                            <ProgressRing value={pctLeft} size={58} stroke={6} color={t.color}>{a ? a.left : '–'}</ProgressRing>
                            <div className="lv-bal-text">
                                <span><i className={`mdi ${t.icon}`}></i>{t.value}</span>
                                <small>{a ? `${a.left} of ${a.total} left · ${a.used} used` : 'Loading…'}</small>
                            </div>
                        </Link>
                    )
                })}
            </div>

            {/* ---------- at a glance + upcoming ---------- */}
            <div className="lh-split">
                <div className="at-tiles lh-tiles">
                    <div className="at-tile" style={{ '--c': '#d97706' }}>
                        <span className="at-tile-icon"><i className="mdi mdi-timer-sand"></i></span>
                        <div><b>{stats.pending}</b><span>Awaiting approval</span></div>
                    </div>
                    <div className="at-tile" style={{ '--c': '#059669' }}>
                        <span className="at-tile-icon"><i className="mdi mdi-calendar-check-outline"></i></span>
                        <div><b>{stats.takenThisYear}</b><span>Days taken in {year}</span></div>
                    </div>
                    <div className="at-tile" style={{ '--c': '#0284c7' }}>
                        <span className="at-tile-icon"><i className="mdi mdi-airplane-takeoff"></i></span>
                        <div><b>{nextIn === null ? '—' : nextIn === 0 ? 'Today' : `${nextIn}d`}</b><span>Until next time off</span></div>
                    </div>
                    <div className="at-tile" style={{ '--c': '#e11d48' }}>
                        <span className="at-tile-icon"><i className="mdi mdi-close-circle-outline"></i></span>
                        <div><b>{stats.rejected}</b><span>Rejected</span></div>
                    </div>
                </div>

                <section className="pp-card">
                    <div className="pp-card-head"><h3><i className="mdi mdi-airplane me-2" style={{ color: '#0284c7' }}></i>Upcoming time off</h3><small>{upcoming.length} planned</small></div>
                    {!upcoming.length ? (
                        <div className="pp-card-body"><p className="pp-muted-dash mb-0 text-center py-2">Nothing planned yet — <Link to="/leave/apply" style={{ color: '#0284c7', fontWeight: 600 }}>plan a break</Link>.</p></div>
                    ) : (
                        <ul className="lv-rows">
                            {upcoming.slice(0, 3).map((l) => {
                                const m = leaveMeta(l.leaveType)
                                return (
                                    <li key={l._id} className="lv-row">
                                        <DateTile date={l.fromDate} color={m.color} />
                                        <div className="lv-row-main">
                                            <div className="lv-row-title">{dateRange(l.fromDate, l.toDate)}</div>
                                            <div className="lv-row-sub">{l.leaveType} · {daysLabel(l.totalDays)}</div>
                                        </div>
                                        <LeaveStatus status={l.status} />
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                </section>
            </div>

            {/* ---------- history ---------- */}
            <section className="pp-card">
                <div className="pp-card-head lh-hist-head">
                    <h3>Leave history</h3>
                    <div className="lh-filters">
                        <div className="pp-seg" role="tablist" aria-label="Status">
                            <button type="button" role="tab" aria-selected={!statusFilter} className={!statusFilter ? 'active' : ''} onClick={() => setStatusFilter('')}>All <b>{all.length}</b></button>
                            {STATUSES.map((s) => (
                                <button key={s} type="button" role="tab" aria-selected={statusFilter === s} className={statusFilter === s ? 'active' : ''} onClick={() => setStatusFilter(s)}>
                                    <i className={`mdi ${leaveStatusMeta(s).icon}`} style={{ color: leaveStatusMeta(s).color }}></i>{s} <b>{counts[s]}</b>
                                </button>
                            ))}
                        </div>
                        {typesUsed.length > 1 && (
                            <select className="pp-select" style={{ width: 'auto' }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Leave type">
                                <option value="">All types</option>
                                {typesUsed.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                        )}
                    </div>
                </div>

                {loading && !all.length ? (
                    <div className="pp-card-body">{[0, 1, 2].map((i) => <div key={i} className="pp-skel" style={{ height: 52, marginBottom: 12 }}></div>)}</div>
                ) : !rows.length ? (
                    <EmptyState icon="mdi-beach" title={all.length ? 'Nothing matches' : 'No leave requests yet'}
                        text={all.length ? 'Try a different status or type.' : 'When you apply for leave it will show up here with its status.'}
                        action={!all.length && <Link to="/leave/apply" className="pp-btn primary"><i className="mdi mdi-plus"></i> Apply leave</Link>} />
                ) : (
                    <ul className="lv-rows">
                        {rows.map((l) => {
                            const m = leaveMeta(l.leaveType)
                            return (
                                <li key={l._id} className="lv-row">
                                    <DateTile date={l.fromDate} color={m.color} />
                                    <div className="lv-row-main">
                                        <div className="lv-row-title"><LeaveTypeTag type={l.leaveType} />{dateRange(l.fromDate, l.toDate)}{l.halfDay && <span className="pp-chip">{l.session}</span>}</div>
                                        <div className="lv-row-sub">
                                            {l.status === 'Rejected' && l.rejectionReason
                                                ? <><b style={{ color: '#be123c' }}>Rejected:</b> {l.rejectionReason}</>
                                                : l.reason}
                                        </div>
                                    </div>
                                    <span className="lv-days hide-sm"><b>{l.totalDays}</b><small>day{Number(l.totalDays) === 1 ? '' : 's'}</small></span>
                                    <LeaveStatus status={l.status} />
                                    {l.status === 'Pending' && (
                                        <button type="button" className="lh-cancel" onClick={() => onCancel(l)} title="Cancel request" aria-label="Cancel request">
                                            <i className="mdi mdi-close"></i>
                                        </button>
                                    )}
                                </li>
                            )
                        })}
                    </ul>
                )}
            </section>
        </PeopleShell>
    )
}
