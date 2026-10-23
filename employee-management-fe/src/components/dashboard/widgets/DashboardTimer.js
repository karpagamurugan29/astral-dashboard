import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import auditActions from '../../../redux/audit/Actions'
import dashboardActions from '../../../redux/dashboard/Actions'
import { CLOSED, engagementTitle, clock, fmtClockTime } from '../../audits/AuditUI'
import { isOnAudit } from '../../audits/AuditCard'
import { Live } from '../../common/Live'

/* Start / stop the audit timer from the dashboard — same actions (and location capture) as the
   project page, so a session started here shows up there and in the Location Log. */
export const DashboardTimer = () => {
    const dispatch = useDispatch()
    const { list, activeTimer, timerBusy, error } = useSelector((state) => state.auditReducer || {})
    const { isAuthenticated: user } = useSelector((state) => state.authReducer || {})
    const [pick, setPick] = useState('')
    const [note, setNote] = useState('')
    const wasBusy = useRef(false)

    useEffect(() => {
        dispatch({ type: auditActions.GET_AUDITS })
        dispatch({ type: auditActions.GET_ACTIVE_AUDIT_TIMER })
    }, [dispatch])

    // When a start/stop finishes, refresh the dashboard's hours and "working now" widgets.
    useEffect(() => {
        if (wasBusy.current && !timerBusy) dispatch({ type: dashboardActions.GET_AUDIT_INSIGHTS })
        wasBusy.current = !!timerBusy
    }, [timerBusy, dispatch])

    const mine = useMemo(
        () => (list || []).filter((a) => !CLOSED.includes(a.status) && isOnAudit(a, user?._id))
            .sort((a, b) => a.clientName.localeCompare(b.clientName)),
        [list, user?._id]
    )
    useEffect(() => { if (!pick && mine.length) setPick(mine[0]._id) }, [mine, pick])

    const running = activeTimer?.auditId
    const busyLabel = timerBusy === 'locating' ? 'Getting location…' : null

    const start = () => pick && dispatch({ type: auditActions.START_AUDIT_TIMER, id: pick })
    const stop = () => { dispatch({ type: auditActions.STOP_AUDIT_TIMER, id: running._id, note }); setNote('') }

    return (
        <div className={`dt-card ${running ? 'running' : ''}`}>
            <div className="dt-left">
                <span className="dt-icon"><i className={`mdi ${running ? 'mdi-timer-play-outline' : 'mdi-timer-outline'}`}></i></span>
                <div className="dt-text">
                    <small>{running ? <><span className="au-pulse"></span> Timer running</> : 'My audit timer'}</small>
                    {running ? (
                        <Link to={`/audits/${running._id}`} className="dt-title">{running.clientName} · {engagementTitle(running)}</Link>
                    ) : mine.length ? (
                        <select className="pp-select dt-select" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Audit to time">
                            {mine.map((a) => <option key={a._id} value={a._id}>{a.clientName} · {engagementTitle(a)}</option>)}
                        </select>
                    ) : (
                        <span className="dt-title muted">You're not assigned to an open audit yet</span>
                    )}
                    {running && <span className="dt-since">Started {fmtClockTime(activeTimer.startTime)}</span>}
                </div>
            </div>

            <div className="dt-right">
                {running && <span className="dt-clock"><Live>{(n) => clock(activeTimer.startTime, n)}</Live></span>}
                {running && <input type="text" className="pp-input dt-note" placeholder="What did you work on? (optional)" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />}
                {running ? (
                    <button type="button" className="dt-btn stop" onClick={stop} disabled={!!timerBusy}><i className="mdi mdi-stop"></i>{busyLabel || (timerBusy ? 'Stopping…' : 'Stop')}</button>
                ) : (
                    <button type="button" className="dt-btn start" onClick={start} disabled={!!timerBusy || !mine.length}><i className="mdi mdi-play"></i>{busyLabel || (timerBusy ? 'Starting…' : 'Start')}</button>
                )}
            </div>

            {error && /timer|location|audit/i.test(error) && <div className="dt-error" role="alert"><i className="mdi mdi-alert-circle-outline"></i>{error}</div>}
        </div>
    )
}
