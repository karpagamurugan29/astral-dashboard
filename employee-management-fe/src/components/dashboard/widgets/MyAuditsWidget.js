import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import auditActions from '../../../redux/audit/Actions'
import dashboardActions from '../../../redux/dashboard/Actions'
import { auditStatusMeta, engagementTitle, fmtDuration, clock, useTick } from '../../audits/AuditUI'

const SORTS = {
    deadline: { label: 'Deadline', fn: (a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999) },
    mine: { label: 'My hours', fn: (a, b) => b.myMinutes - a.myMinutes },
    recent: { label: 'Last worked', fn: (a, b) => new Date(b.lastSession?.start || 0) - new Date(a.lastSession?.start || 0) },
    client: { label: 'Client', fn: (a, b) => a.clientName.localeCompare(b.clientName) },
}

const due = (d) => d === null ? null
    : d < 0 ? { text: `${-d}d overdue`, tone: 'late', icon: 'mdi-alert-circle-outline' }
        : d === 0 ? { text: 'Due today', tone: 'soon', icon: 'mdi-flag-checkered' }
            : d <= 7 ? { text: `${d}d left`, tone: 'soon', icon: 'mdi-timer-sand' }
                : { text: `${d}d left`, tone: 'ok', icon: 'mdi-flag-outline' }

const lastWorked = (s) => {
    if (!s) return 'Not started yet'
    const t = new Date(s.end || s.start)
    const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(t).setHours(0, 0, 0, 0)) / 864e5)
    const time = t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    return days === 0 ? `Today ${time}` : days === 1 ? `Yesterday ${time}` : `${t.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
}

/* Every open audit project the person is on, with their own hours and a Start / Stop on the row. */
export const MyAuditsWidget = ({ audits = [] }) => {
    const dispatch = useDispatch()
    const { activeTimer, timerBusy } = useSelector((state) => state.auditReducer || {})
    const [filter, setFilter] = useState('all')
    const [sort, setSort] = useState('deadline')
    const wasBusy = useRef(false)
    const now = useTick(!!activeTimer, 1000)

    useEffect(() => { dispatch({ type: auditActions.GET_ACTIVE_AUDIT_TIMER }) }, [dispatch])
    useEffect(() => {
        if (wasBusy.current && !timerBusy) dispatch({ type: dashboardActions.GET_AUDIT_INSIGHTS })
        wasBusy.current = !!timerBusy
    }, [timerBusy, dispatch])

    const runningId = activeTimer?.auditId?._id
    const rows = useMemo(() => audits
        .filter((a) => filter === 'all' || (filter === 'soon' ? a.daysLeft !== null && a.daysLeft <= 7 : a._id === runningId || a.myWeekMinutes > 0))
        .slice().sort(SORTS[sort].fn), [audits, filter, sort, runningId])

    const totals = audits.reduce((t, a) => ({ week: t.week + a.myWeekMinutes, today: t.today + a.myTodayMinutes, all: t.all + a.myMinutes }), { week: 0, today: 0, all: 0 })
    const soon = audits.filter((a) => a.daysLeft !== null && a.daysLeft <= 7).length

    return (
        <section className="pp-panel ma-panel">
            <header className="pp-panel-head">
                <span className="pp-panel-icon" style={{ '--c': '#0d9488' }}><i className="mdi mdi-briefcase-account-outline"></i></span>
                <div className="pp-panel-titles">
                    <h3>My audits <span className="ma-count">{audits.length}</span></h3>
                    <p>Today {fmtDuration(totals.today)} · this week {fmtDuration(totals.week)} · all time {fmtDuration(totals.all)}</p>
                </div>
                <div className="pp-panel-actions"><Link to="/audits" className="pp-link">All audit projects <i className="mdi mdi-chevron-right"></i></Link></div>
            </header>
            <div className="pp-panel-body">
                <div className="mau-tools">
                    <div className="tc-tabs" role="tablist">
                        {[['all', 'All', audits.length], ['soon', 'Due in 7 days', soon], ['active', 'Worked this week', audits.filter((a) => a.myWeekMinutes > 0 || a._id === runningId).length]].map(([k, l, n]) => (
                            <button key={k} type="button" role="tab" aria-selected={filter === k} className={`tc-tab ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{l} <b>{n}</b></button>
                        ))}
                    </div>
                    <select className="mau-sort" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort my audits">
                        {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>Sort: {v.label}</option>)}
                    </select>
                </div>

                {!rows.length ? (
                    <div className="aw-empty"><i className="mdi mdi-briefcase-off-outline"></i><span>{audits.length ? 'Nothing in this group' : "You're not on any open audit project"}</span></div>
                ) : (
                    <div className="mau-list">
                        {rows.map((a) => {
                            const m = auditStatusMeta(a.status)
                            const d = due(a.daysLeft)
                            const est = a.estimatedHours * 60
                            const teamPct = est ? Math.min(100, (a.teamMinutes / est) * 100) : 0
                            const myPct = est ? Math.min(teamPct, (a.myMinutes / est) * 100) : 0
                            const over = est && a.teamMinutes > est
                            const isRunning = a._id === runningId
                            const otherRunning = activeTimer && !isRunning
                            return (
                                <article key={a._id} className={`mau-row ${isRunning ? 'running' : ''}`}>
                                    <div className="mau-main">
                                        <div className="mau-top">
                                            <span className="mau-client"><i className="mdi mdi-domain"></i>{a.clientName}</span>
                                            <span className="pj-pill" style={{ '--c': m.color }}><i className={`mdi ${m.icon}`}></i>{a.status}</span>
                                            {d && <span className={`aw-due ${d.tone}`}><i className={`mdi ${d.icon}`}></i>{d.text}</span>}
                                            <span className="mau-role">{a.role} · {a.teamSize} people</span>
                                        </div>
                                        <Link to={`/audits/${a._id}`} className="mau-title">{engagementTitle(a)} <small>{a.auditCode}</small></Link>
                                        <div className="mau-progress" title={est ? `Team ${fmtDuration(a.teamMinutes)} of ${a.estimatedHours}h · you ${fmtDuration(a.myMinutes)}` : 'No hour estimate'}>
                                            <span className={`mau-track ${over ? 'over' : ''}`}><span className="team" style={{ width: `${teamPct}%` }}></span><span className="me" style={{ width: `${myPct}%` }}></span></span>
                                            <small>{est ? <><b>{fmtDuration(a.teamMinutes)}</b> of {a.estimatedHours}h{over ? ' · over estimate' : ''}</> : <>{fmtDuration(a.teamMinutes)} logged · no estimate</>}</small>
                                        </div>
                                    </div>
                                    <div className="mau-stats">
                                        <div><span>Today</span><b>{fmtDuration(a.myTodayMinutes)}</b></div>
                                        <div><span>This week</span><b>{fmtDuration(a.myWeekMinutes)}</b></div>
                                        <div><span>My total</span><b>{fmtDuration(a.myMinutes)}</b></div>
                                        <div className="wide"><span>Last worked</span><b>{lastWorked(a.lastSession)}</b></div>
                                    </div>
                                    <div className="mau-action">
                                        {isRunning ? (
                                            <>
                                                <span className="mau-clock">{clock(activeTimer.startTime, now)}</span>
                                                <button type="button" className="dt-btn stop" disabled={!!timerBusy} onClick={() => dispatch({ type: auditActions.STOP_AUDIT_TIMER, id: a._id })}><i className="mdi mdi-stop"></i>{timerBusy === 'locating' ? 'Locating…' : 'Stop'}</button>
                                            </>
                                        ) : (
                                            <button type="button" className="dt-btn start" disabled={!!timerBusy || !!otherRunning} title={otherRunning ? 'Stop your running timer first' : 'Start the timer on this audit'}
                                                onClick={() => dispatch({ type: auditActions.START_AUDIT_TIMER, id: a._id })}><i className="mdi mdi-play"></i>{timerBusy === 'locating' ? 'Locating…' : 'Start'}</button>
                                        )}
                                    </div>
                                </article>
                            )
                        })}
                    </div>
                )}
            </div>
        </section>
    )
}
