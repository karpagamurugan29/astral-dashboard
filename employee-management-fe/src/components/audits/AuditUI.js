import React, { useEffect, useState } from 'react'
import { chatApi } from '../chat/chatApi'
import { useDispatch, useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import auditActions from '../../redux/audit/Actions'
import './audits.css'

/* -------------------------------------------------------------------------- */
/*  Shared bits for the Audits list, Audit detail and the running-timer bar.  */
/* -------------------------------------------------------------------------- */

export const AUDITS_ROOT = { label: 'Audits', to: '/audits' }
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
/* ---------------- workflow steps for the timer ---------------- */
const BILLING_KEYS = ['invoice', 'payment']
// steps time can be logged against, grouped by stage
export const workSteps = (audit) => (audit?.milestones || []).filter((m) => !BILLING_KEYS.includes(m.key))
// the step a person most likely means: theirs in the current stage, else any open one in the current stage,
// else theirs anywhere, else the first open one
export const defaultStep = (audit, userId) => {
    const steps = workSteps(audit)
    const open = steps.filter((m) => !m.done)
    const mine = (m) => String(m.assignee?._id || m.assignee || '') === String(userId || '')
    return (open.find((m) => mine(m) && m.stage === audit.status) || open.find((m) => m.stage === audit.status) || open.find(mine) || open[0] || steps[0])?.key || ''
}
export const StepSelect = ({ audit, value, onChange, className = '', disabled }) => {
    const steps = workSteps(audit)
    const stages = [...new Set(steps.map((m) => m.stage))]
    return (
        <select className={`pp-select ${className}`} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} aria-label="Workflow step">
            <option value="">General (no step)</option>
            {stages.map((st) => <optgroup key={st} label={st}>{steps.filter((m) => m.stage === st).map((m) => <option key={m.key} value={m.key}>{m.done ? '✓ ' : ''}{m.label}</option>)}</optgroup>)}
        </select>
    )
}
// switch the running timer to another step (closes the session, opens the next)
export const switchStep = async (dispatch, auditId, step) => {
    const j = await chatApi('POST', `/audits/${auditId}/timer/switch`, { step })
    dispatch({ type: auditActions.GET_ACTIVE_AUDIT_TIMER })
    dispatch({ type: auditActions.GET_AUDIT_BY_ID, id: auditId })
    return j
}

export const TimerPanel = ({ audit, isMember, todayMinutes = 0, myMinutes = 0 }) => {
    const dispatch = useDispatch()
    const { activeTimer, timerBusy } = useSelector((state) => state.auditReducer || {})
    const [note, setNote] = useState('')
    const { isAuthenticated: me } = useSelector((state) => state.authReducer || {})
    const [step, setStep] = useState(() => defaultStep(audit, me?._id))
    const [switching, setSwitching] = useState(false)
    const runningHere = activeTimer && activeTimer.auditId?._id === audit._id
    const runningElsewhere = activeTimer && !runningHere
    const closed = CLOSED.includes(audit.status)
    // totals move once a minute; the seconds clock below ticks by itself
    const now = useTick(!!runningHere, 60000)
    const liveMinutes = runningHere ? (now - new Date(activeTimer.startTime)) / 60000 : 0

    const start = () => dispatch({ type: auditActions.START_AUDIT_TIMER, id: audit._id, step })
    const stop = () => { dispatch({ type: auditActions.STOP_AUDIT_TIMER, id: audit._id, note }); setNote('') }
    const onSwitch = async (k) => { setSwitching(true); try { await switchStep(dispatch, audit._id, k) } catch (e) { window.alert(e.message) } finally { setSwitching(false) } }
    const hasSteps = workSteps(audit).length > 0

    if (!isMember) {
        return (
            <div className="au-timer muted">
                <i className="mdi mdi-lock-clock au-timer-icon"></i>
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
            {hasSteps && !closed && !runningElsewhere && (
                <label className="au-step">
                    <span>{runningHere ? 'Working on' : 'Step'}</span>
                    <StepSelect audit={audit} value={runningHere ? activeTimer.milestoneKey || '' : step} onChange={runningHere ? onSwitch : setStep} disabled={switching || !!timerBusy} />
                </label>
            )}

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
            {!closed && !runningElsewhere && <div className="au-geo-hint"><i className="mdi mdi-map-marker-outline"></i>Your location is recorded when you start and stop. Timers stop automatically when you check out, at 7 PM, or after 10 hours.</div>}

            <div className="au-timer-stats">
                <span><small>Today</small><b>{fmtDuration(todayMinutes + liveMinutes)}</b></span>
                <span><small>My total</small><b>{fmtDuration(myMinutes + liveMinutes)}</b></span>
            </div>
        </div>
    )
}
