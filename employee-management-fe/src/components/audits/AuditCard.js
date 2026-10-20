import React from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import auditActions from '../../redux/audit/Actions'
import { Avatar, fullName } from '../people/PeopleUI'
import { PriorityTag, AvatarStack, startOfDay } from '../projects/ProjectUI'
import { CLOSED, AuditStatus, auditStatusMeta, engagementTitle, clientIdOf, fmtDuration } from './AuditUI'

const DAY = 24 * 60 * 60 * 1000

export const auditDeadline = (a) => {
    if (!a.endDate || CLOSED.includes(a.status)) return null
    const days = Math.round((startOfDay(a.endDate) - startOfDay(Date.now())) / DAY)
    if (days < 0) return { text: `${-days}d past deadline`, color: '#e11d48', icon: 'mdi-alert-circle-outline' }
    if (days === 0) return { text: 'Due today', color: '#d97706', icon: 'mdi-flag-checkered' }
    if (days <= 14) return { text: `${days}d left`, color: '#d97706', icon: 'mdi-timer-sand' }
    return { text: `Due ${new Date(a.endDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`, color: '#64748b', icon: 'mdi-flag-outline' }
}

export const isOnAudit = (a, userId) => a.auditManager?._id === userId || (a.teamMembers || []).some((m) => m._id === userId)

/* One audit project as a card: client, status, hours vs estimate, team, quick timer. */
export const AuditCard = ({ audit: a, showClient = true, canManage = false, onArchive }) => {
    const dispatch = useDispatch()
    const { activeTimer, timerBusy } = useSelector((state) => state.auditReducer || {})
    const { isAuthenticated: user } = useSelector((state) => state.authReducer || {})

    const m = auditStatusMeta(a.status)
    const dl = auditDeadline(a)
    const mins = a.timeSummary?.totalMinutes || 0
    const est = (a.estimatedHours || 0) * 60
    const pct = est ? Math.min(100, Math.round((mins / est) * 100)) : 0
    const active = a.timeSummary?.activeNow || []
    const runningHere = activeTimer?.auditId?._id === a._id
    const canTime = isOnAudit(a, user?._id) && !CLOSED.includes(a.status) && (!activeTimer || runningHere)
    const cid = clientIdOf(a)

    return (
        <article className="pp-card pl-card" style={{ '--c': m.color }}>
            <div className="pl-top">
                <div className="pl-titles">
                    {showClient && (
                        <div className="au-card-client">
                            <i className="mdi mdi-domain"></i>
                            {cid ? <Link to={`/audits/clients/${cid}`} className="au-client-link">{a.clientName}</Link> : a.clientName}
                        </div>
                    )}
                    <h3 className="au-client"><Link to={`/audits/${a._id}`}>{engagementTitle(a)}</Link></h3>
                    <div className="au-meta">
                        <span className="pl-code">{a.auditCode}</span>
                        <span><i className="mdi mdi-shape-outline"></i>{a.auditType}</span>
                        {a.financialYear && <span><i className="mdi mdi-calendar-range"></i>FY {a.financialYear}</span>}
                    </div>
                </div>
                {active.length > 0 && <span className="au-working" title="Team members with a running timer"><span className="au-pulse"></span>{active.length} working</span>}
            </div>

            <div className="pl-tags">
                <AuditStatus status={a.status} />
                {a.priority && <PriorityTag priority={a.priority} />}
                {dl && <span className="pp-tag" style={{ '--tag': dl.color }}><i className={`mdi ${dl.icon}`}></i>{dl.text}</span>}
            </div>

            <div className="pl-progress">
                <div className="au-hours">
                    <span><b>{fmtDuration(mins)}</b> logged{a.timeSummary?.daysWorked ? ` · ${a.timeSummary.daysWorked} day${a.timeSummary.daysWorked === 1 ? '' : 's'}` : ''}</span>
                    <span>{est ? `of ${a.estimatedHours}h est.` : 'No estimate'}</span>
                </div>
                <div className={`au-track ${est && mins > est ? 'over' : ''}`}><span style={{ width: `${est ? pct : 0}%` }}></span></div>
            </div>

            <div className="pl-foot">
                <span className="pl-mgr"><Avatar person={a.auditManager} size={24} /><span><b>{fullName(a.auditManager)}</b></span></span>
                <AvatarStack people={a.teamMembers || []} max={4} size={26} />
                {canTime && (
                    <button type="button" className={`au-card-timer ${runningHere ? 'stop' : ''}`} disabled={!!timerBusy}
                        onClick={() => dispatch({ type: runningHere ? auditActions.STOP_AUDIT_TIMER : auditActions.START_AUDIT_TIMER, id: a._id })}>
                        <i className={`mdi ${runningHere ? 'mdi-stop' : 'mdi-play'}`}></i>{timerBusy === 'locating' ? 'Locating…' : runningHere ? 'Stop' : 'Start'}
                    </button>
                )}
                {canManage && onArchive && (
                    <button type="button" className="pl-archive" onClick={() => onArchive(a)} title="Archive audit project" aria-label={`Archive ${engagementTitle(a)}`}>
                        <i className="mdi mdi-archive-outline"></i>
                    </button>
                )}
            </div>
        </article>
    )
}
