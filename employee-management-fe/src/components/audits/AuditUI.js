import React, { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import auditActions from '../../redux/audit/Actions'
import './audits.css'

/* -------------------------------------------------------------------------- */
/*  Shared bits for the Audits list, Audit detail and the running-timer bar.  */
/* -------------------------------------------------------------------------- */

export const AUDITS_ROOT = { label: 'Audit projects', to: '/audits' }
export const CLIENTS_ROOT = { label: 'Clients', to: '/audits/clients' }

export const ENTITY_TYPES = ['Company', 'LLP', 'Partnership', 'Proprietorship', 'Trust', 'Society', 'Individual', 'Government', 'Other']

// "Statutory audit · FY 2026-27" when no name was given.
export const engagementTitle = (a) => a?.engagementName || `${a?.auditType || 'Audit'} audit${a?.financialYear ? ` · FY ${a.financialYear}` : ''}`
export const clientIdOf = (a) => a?.clientId?._id || a?.clientId || null

export const AUDIT_STATUS = {
    Planning: { color: '#64748b', icon: 'mdi-pencil-ruler' },
    Fieldwork: { color: '#0284c7', icon: 'mdi-briefcase-search-outline' },
    Review: { color: '#7c3aed', icon: 'mdi-file-eye-outline' },
    Reporting: { color: '#0891b2', icon: 'mdi-file-document-edit-outline' },
    'On Hold': { color: '#d97706', icon: 'mdi-pause-circle-outline' },
    Completed: { color: '#059669', icon: 'mdi-check-decagram' },
    Cancelled: { color: '#e11d48', icon: 'mdi-close-octagon-outline' },
}

export const AUDIT_TYPES = ['Statutory', 'Internal', 'Tax', 'GST', 'Stock', 'Concurrent', 'Forensic', 'Other']

export const CLOSED = ['Completed', 'Cancelled']

export const auditStatusMeta = (s) => AUDIT_STATUS[s] || { color: '#64748b', icon: 'mdi-circle-outline' }

export const AuditStatus = ({ status }) => {
    const m = auditStatusMeta(status)
    return <span className="pj-pill" style={{ '--c': m.color }}><i className={`mdi ${m.icon}`}></i>{status || '—'}</span>
}

// Indian financial years run April → March, e.g. "2026-27".
export const currentFY = () => {
    const d = new Date()
    const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1
    return `${y}-${String((y + 1) % 100).padStart(2, '0')}`
}

// 125 → "2h 05m"; 0 → "0h"
export const fmtDuration = (minutes = 0) => {
    const m = Math.max(0, Math.round(minutes))
    const h = Math.floor(m / 60)
    const r = m % 60
    if (!h && !r) return '0h'
    if (!h) return `${r}m`
    return r ? `${h}h ${String(r).padStart(2, '0')}m` : `${h}h`
}

export const fmtHours = (minutes = 0) => (Math.round((minutes / 60) * 10) / 10).toLocaleString()

// Live HH:MM:SS since a start time.
export const clock = (start, now = Date.now()) => {
    const s = Math.max(0, Math.floor((now - new Date(start)) / 1000))
    const pad = (n) => String(n).padStart(2, '0')
    return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}

export const fmtDateTime = (d) => d ? new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—'
export const fmtClockTime = (d) => d ? new Date(d).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '—'

// Re-renders the caller every `ms` while `active` — drives the running clocks.
export const useTick = (active, ms = 1000) => {
    const [now, setNow] = useState(Date.now())
    useEffect(() => {
        if (!active) return undefined
        setNow(Date.now())
        const t = setInterval(() => setNow(Date.now()), ms)
        return () => clearInterval(t)
    }, [active, ms])
    return now
}

export const LiveClockText = ({ start }) => clock(start, useTick(true))

export const LiveClock = ({ start }) => {
    const now = useTick(true)
    return <span className="au-clock">{clock(start, now)}</span>
}

/* Thin bar shown on Audit pages while the signed-in user's timer is running. */
export const ActiveTimerBar = ({ hideFor }) => {
    const dispatch = useDispatch()
    const { activeTimer, timerBusy } = useSelector((state) => state.auditReducer || {})
    const auditId = activeTimer?.auditId?._id
    if (!activeTimer || (hideFor && hideFor === auditId)) return null
    return (
        <div className="au-livebar" role="status">
            <span className="au-pulse"></span>
            <span className="au-livebar-text">
                Timer running on <Link to={`/audits/${auditId}`}><b>{activeTimer.auditId?.clientName}</b> · {engagementTitle(activeTimer.auditId)}</Link>
                <small>{activeTimer.auditId?.auditCode}</small>
            </span>
            <LiveClock start={activeTimer.startTime} />
            <button type="button" className="au-stop sm" disabled={timerBusy} onClick={() => dispatch({ type: auditActions.STOP_AUDIT_TIMER, id: auditId })}>
                <i className="mdi mdi-stop"></i> Stop
            </button>
        </div>
    )
}

/* The big Start / Stop control on an audit, for the signed-in user. */
export const TimerPanel = ({ audit, isMember, todayMinutes = 0, myMinutes = 0 }) => {
    const dispatch = useDispatch()
    const { activeTimer, timerBusy } = useSelector((state) => state.auditReducer || {})
    const [note, setNote] = useState('')
    const runningHere = activeTimer && activeTimer.auditId?._id === audit._id
    const runningElsewhere = activeTimer && !runningHere
    const closed = CLOSED.includes(audit.status)
    // totals move once a minute; the seconds clock below ticks by itself
    const now = useTick(!!runningHere, 60000)
    const liveMinutes = runningHere ? (now - new Date(activeTimer.startTime)) / 60000 : 0

    const start = () => dispatch({ type: auditActions.START_AUDIT_TIMER, id: audit._id })
    const stop = () => { dispatch({ type: auditActions.STOP_AUDIT_TIMER, id: audit._id, note }); setNote('') }

    if (!isMember) {
        return (
            <div className="au-timer muted">
                <i className="mdi mdi-timer-lock-outline au-timer-icon"></i>
                <b>Time tracking</b>
                <small>Only people assigned to this audit can start a timer.</small>
            </div>
        )
    }

    return (
        <div className={`au-timer ${runningHere ? 'running' : ''}`}>
            <div className="au-timer-label">
                {runningHere ? <><span className="au-pulse"></span>You're working on this audit</> : <><i className="mdi mdi-timer-outline"></i>My timer</>}
            </div>
            <div className="au-timer-face">{runningHere ? <LiveClockText start={activeTimer.startTime} /> : '00:00:00'}</div>
            {runningHere && <div className="au-timer-since">Started at {fmtClockTime(activeTimer.startTime)}</div>}

            {runningHere ? (
                <>
                    <input type="text" className="pp-input au-note" placeholder="What did you work on? (optional)" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
                    <button type="button" className="au-stop" onClick={stop} disabled={timerBusy}><i className="mdi mdi-stop-circle-outline"></i> {timerBusy === 'locating' ? 'Getting location…' : timerBusy ? 'Stopping…' : 'Stop timer'}</button>
                </>
            ) : runningElsewhere ? (
                <div className="au-timer-note">
                    <i className="mdi mdi-information-outline"></i>
                    <span>Your timer is running on <Link to={`/audits/${activeTimer.auditId?._id}`}>{activeTimer.auditId?.clientName} · {engagementTitle(activeTimer.auditId)}</Link>. Stop it there first.</span>
                </div>
            ) : closed ? (
                <div className="au-timer-note"><i className="mdi mdi-lock-outline"></i><span>This audit is {audit.status.toLowerCase()}; time can no longer be logged.</span></div>
            ) : (
                <button type="button" className="au-start" onClick={start} disabled={timerBusy}><i className="mdi mdi-play-circle-outline"></i> {timerBusy === 'locating' ? 'Getting location…' : timerBusy ? 'Starting…' : 'Start timer'}</button>
            )}

            {runningHere && liveMinutes > 8 * 60 && <div className="au-timer-note warn"><i className="mdi mdi-alert-outline"></i><span>Running for {fmtDuration(liveMinutes)}. Still working? Stop it when you finish — after 10 hours it stops by itself and goes to your manager for review.</span></div>}
            {!closed && !runningElsewhere && <div className="au-geo-hint"><i className="mdi mdi-map-marker-outline"></i>Your location is recorded when you start and stop. Timers stop automatically when you check out, at 8 PM, or after 10 hours.</div>}

            <div className="au-timer-stats">
                <span><small>Today</small><b>{fmtDuration(todayMinutes + liveMinutes)}</b></span>
                <span><small>My total</small><b>{fmtDuration(myMinutes + liveMinutes)}</b></span>
            </div>
        </div>
    )
}
