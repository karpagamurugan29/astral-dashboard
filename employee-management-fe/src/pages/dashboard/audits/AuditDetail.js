import React, { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link, useParams } from 'react-router-dom'
import auditActions from '../../../redux/audit/Actions'
import employeeActions from '../../../redux/employee/Actions'
import { PeopleShell, Avatar, EmptyState, ErrorBanner, fullName, fmtDate } from '../../../components/people/PeopleUI'
import { money } from '../../../components/payroll/PayrollUI'
import { PriorityTag, PeoplePicker, startOfDay } from '../../../components/projects/ProjectUI'
import {
    AUDITS_ROOT, AUDIT_STATUS, CLOSED, auditStatusMeta, engagementTitle, clientIdOf, fmtDuration, fmtHours, fmtDateTime, fmtClockTime, useTick, TimerPanel, ActiveTimerBar, LiveClock,
} from '../../../components/audits/AuditUI'
import '../../../components/attendance/attendance.css'
import '../projects/ProjectDetail.css'
import './Billing.css'
import { useAccess } from '../../../hooks/useAccess'
import { toast } from '../../../components/common/Toaster'
import { api, InvStatus, InvoiceDrawer, InvoiceEditor, ChargesEditor } from './InvoiceParts'
import { PRESETS } from './Billing'

const AE_STAGES = [['Planning', 'mdi-pencil-ruler'], ['Fieldwork', 'mdi-briefcase-search-outline'], ['Review', 'mdi-file-eye-outline'], ['Reporting', 'mdi-file-document-edit-outline'], ['Billing', 'mdi-cash-multiple']]

const FORMER = ['Resigned', 'Terminated']
const idOf = (p) => p?._id || p

// Closed sessions count their stored duration; a running one counts up to `now`.
const minutesOf = (log, now) => (log.endTime ? log.durationMinutes || 0 : Math.max(0, (now - new Date(log.startTime)) / 60000))
const dayKey = (d) => new Date(startOfDay(d)).toISOString()

export const AuditDetail = () => {
    const { id } = useParams()
    const dispatch = useDispatch()
    const { detail: audit, error } = useSelector((state) => state.auditReducer || {})
    const { list: employees } = useSelector((state) => state.employeeReducer || {})
    const { isAuthenticated: user } = useSelector((state) => state.authReducer || {})
    const { can } = useAccess()
    const canManage = can(['Admin', 'HR', 'Manager', 'Team Lead'], 'projects')
    const [tab, setTab] = useState('workflow')
    const [econ, setEcon] = useState(null)
    const [econCanBill, setEconCanBill] = useState(false)
    const [invoiceId, setInvoiceId] = useState(null)
    const [editing, setEditing] = useState(null)
    const [period, setPeriod] = useState({ from: PRESETS[0][2], to: PRESETS[0][3] })
    const [adjust, setAdjust] = useState(null) // { id, end }
    const [toAdd, setToAdd] = useState([])
    const [logPerson, setLogPerson] = useState('')

    useEffect(() => {
        dispatch({ type: auditActions.GET_AUDIT_BY_ID, id })
        dispatch({ type: auditActions.GET_ACTIVE_AUDIT_TIMER })
        dispatch({ type: employeeActions.GET_EMPLOYEES })
        return () => dispatch({ type: auditActions.CLEAR_AUDIT_DETAIL })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id])

    const money_ = audit?.canSeeMoney
    const loadEcon = () => api('GET', `/audits/${id}/economics`).then((j) => { setEcon(j.data); setEconCanBill(j.canBill) }).catch(() => setEcon(null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { if (money_) loadEcon() }, [money_, id])
    const refresh = () => { dispatch({ type: auditActions.GET_AUDIT_BY_ID, id }); if (money_) loadEcon() }
    const toggleMilestone = async (x) => {
        try { const j = await api('PUT', `/audits/${id}/milestones/${x.key}`, { done: !x.done }); toast.success(j.message, { title: 'Checklist' }); refresh() } catch (e) { toast.error(e.message) }
    }
    const raiseInvoice = async () => {
        try {
            const j = await api('POST', '/invoices/prepare', { auditId: id, from: period.from, to: period.to })
            toast.success(j.message, { title: 'Draft bill' })
            ;(j.warnings || []).forEach((w) => toast.warning(w, { title: 'Not billed yet' }))
            setEditing(j.data); loadEcon()
        } catch (e) { toast.error(e.message) }
    }
    const review = async (logId, action, endTime) => {
        try { const j = await api('PUT', `/audits/timelogs/${logId}/review`, { action, endTime }); toast.success(j.message, { title: 'Time reviewed' }); setAdjust(null); refresh() } catch (e) { toast.error(e.message) }
    }

    const logs = useMemo(() => audit?.logs || [], [audit])
    const anyRunning = logs.some((l) => !l.endTime)
    // Totals refresh every 15s while someone is clocked in, so the numbers stay live.
    const now = useTick(anyRunning, 60000)

    // One row per person on the team (plus anyone removed who still has hours logged).
    const team = useMemo(() => {
        if (!audit) return []
        const rows = new Map()
        const add = (p, role) => { if (p && !rows.has(idOf(p))) rows.set(idOf(p), { person: p, role, logs: [] }) }
        add(audit.auditManager, 'Audit manager')
        ;(audit.teamMembers || []).forEach((p) => add(p, 'Team member'))
        logs.forEach((l) => { add(l.employeeId, 'Former member'); rows.get(idOf(l.employeeId)).logs.push(l) })
        return [...rows.values()].map((r) => ({
            ...r,
            minutes: r.logs.reduce((s, l) => s + minutesOf(l, now), 0),
            days: new Set(r.logs.map((l) => dayKey(l.startTime))).size,
            running: r.logs.find((l) => !l.endTime),
            last: r.logs[0]?.endTime || r.logs[0]?.startTime,
        }))
    }, [audit, logs, now])

    const filteredLogs = useMemo(() => (logPerson ? logs.filter((l) => idOf(l.employeeId) === logPerson) : logs), [logs, logPerson])
    const byDay = useMemo(() => {
        const groups = new Map()
        filteredLogs.forEach((l) => {
            const k = dayKey(l.startTime)
            if (!groups.has(k)) groups.set(k, [])
            groups.get(k).push(l)
        })
        return [...groups.entries()]
    }, [filteredLogs])

    if (!audit) {
        return (
            <PeopleShell title="Audit" root={AUDITS_ROOT} crumbs={[{ label: 'Audit' }]} backTo="/audits">
                <ErrorBanner error={error} />
                {!error && <div className="pp-card pp-card-body"><div className="pp-skel" style={{ height: 220 }}></div></div>}
            </PeopleShell>
        )
    }

    const m = auditStatusMeta(audit.status)
    const members = audit.teamMembers || []
    const memberIds = members.map((x) => x._id)
    const available = (employees || []).filter((e) => !FORMER.includes(e.status) && e._id !== audit.auditManager?._id)
    const isMember = audit.auditManager?._id === user?._id || memberIds.includes(user?._id)

    const totalMinutes = team.reduce((s, r) => s + r.minutes, 0)
    const daysWorked = new Set(logs.map((l) => dayKey(l.startTime))).size
    const workingNow = team.filter((r) => r.running)
    const estMinutes = (audit.estimatedHours || 0) * 60
    const usedPct = estMinutes ? Math.round((totalMinutes / estMinutes) * 100) : null

    // The signed-in user's finished time only — the TimerPanel adds the live session on top.
    const today = startOfDay(Date.now())
    const myClosed = logs.filter((l) => idOf(l.employeeId) === user?._id && l.endTime)
    const myMinutes = myClosed.reduce((s, l) => s + (l.durationMinutes || 0), 0)
    const myToday = myClosed.filter((l) => startOfDay(l.startTime) === today).reduce((s, l) => s + (l.durationMinutes || 0), 0)

    const end = audit.endDate ? startOfDay(audit.endDate) : null
    const closed = CLOSED.includes(audit.status)
    const dueText = !end || closed ? null : end >= today ? `${Math.round((end - today) / 864e5)} days to deadline` : `${Math.round((today - end) / 864e5)} days past deadline`

    const onAddMembers = () => {
        toAdd.forEach((employeeId) => dispatch({ type: auditActions.ADD_AUDIT_MEMBER, id, employeeId }))
        setToAdd([])
    }
    const onRemoveMember = (p) => {
        if (window.confirm(`Remove ${fullName(p)} from this audit? Hours they already logged stay on record.`)) {
            dispatch({ type: auditActions.REMOVE_AUDIT_MEMBER, id, employeeId: p._id })
        }
    }
    const onStatus = (status) => dispatch({ type: auditActions.UPDATE_AUDIT, id, payload: { status } })

    return (
        <PeopleShell
            title={engagementTitle(audit)}
            root={AUDITS_ROOT}
            crumbs={[{ label: audit.clientName, to: clientIdOf(audit) ? `/audits/clients/${clientIdOf(audit)}` : '/audits' }, { label: engagementTitle(audit) }]}
            backTo="/audits"
        >
            <ErrorBanner error={error} />
            <ActiveTimerBar hideFor={audit._id} />

            <section className="pp-card au-head" style={{ '--c': m.color }}>
                <div>
                    <span className="pd-code">{audit.auditCode}</span>
                    <div className="au-card-client">
                        <i className="mdi mdi-domain"></i>
                        {clientIdOf(audit) ? <Link to={`/audits/clients/${clientIdOf(audit)}`} className="au-client-link">{audit.clientName}</Link> : audit.clientName}
                    </div>
                    <h2>{engagementTitle(audit)}</h2>
                    <div className="au-meta">
                        <span><i className="mdi mdi-shape-outline"></i>{audit.auditType} audit</span>
                        {audit.financialYear && <span><i className="mdi mdi-calendar-range"></i>FY {audit.financialYear}</span>}
                        <span><i className="mdi mdi-calendar-start"></i>{fmtDate(audit.startDate)} → {fmtDate(audit.endDate)}</span>
                    </div>
                    <p>{audit.description || 'No scope notes yet.'}</p>
                    <div className="pd-tags">
                        {canManage ? (
                            <select className="pp-select pd-status-select" value={audit.status} onChange={(e) => onStatus(e.target.value)} aria-label="Audit status">
                                {Object.keys(AUDIT_STATUS).map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                        ) : <span className="pj-pill" style={{ '--c': m.color }}><i className={`mdi ${m.icon}`}></i>{audit.status}</span>}
                        {audit.priority && <PriorityTag priority={audit.priority} />}
                        {dueText && <span className="pd-health" style={{ '--h': end < today ? '#e11d48' : '#64748b' }}><i className="mdi mdi-flag-checkered"></i>{dueText}</span>}
                    </div>

                    <div className="au-budget">
                        <div className="au-hours">
                            <span><b>{fmtDuration(totalMinutes)}</b> logged by the team</span>
                            <span>{estMinutes ? `${usedPct}% of ${audit.estimatedHours}h estimate` : 'No hour estimate set'}</span>
                        </div>
                        <div className={`au-track ${estMinutes && totalMinutes > estMinutes ? 'over' : ''}`}><span style={{ width: `${estMinutes ? Math.min(100, usedPct) : 0}%` }}></span></div>
                    </div>
                </div>

                <TimerPanel audit={audit} isMember={isMember} myMinutes={myMinutes} todayMinutes={myToday} />
            </section>

            <div className="at-tiles">
                <div className="at-tile" style={{ '--c': '#7c3aed' }}><span className="at-tile-icon"><i className="mdi mdi-timer-outline"></i></span><div><b>{fmtHours(totalMinutes)}h</b><span>Total hours</span></div></div>
                <div className="at-tile" style={{ '--c': '#0284c7' }}><span className="at-tile-icon"><i className="mdi mdi-calendar-check-outline"></i></span><div><b>{daysWorked}</b><span>Days worked</span></div></div>
                <div className="at-tile" style={{ '--c': '#16a34a' }}><span className="at-tile-icon"><i className="mdi mdi-account-clock-outline"></i></span><div><b>{workingNow.length}</b><span>Working now</span></div></div>
                <div className="at-tile" style={{ '--c': '#0b0f19' }}><span className="at-tile-icon"><i className="mdi mdi-account-group-outline"></i></span><div><b>{team.filter((r) => r.role !== 'Former member').length}</b><span>People assigned</span></div></div>
            </div>

            {money_ && econ && (
                <>
                    <div className="ae-econ-head"><i className="mdi mdi-scale-balance"></i>Engagement economics<em>visible to leadership and Accounts only</em></div>
                    <div className="ae-econ">
                        <div style={{ '--c': '#1e40af' }}><small>Agreed fee</small><b>{econ.fee ? money(econ.fee) : '—'}</b><span>{econ.fee ? 'before GST' : 'set the fee on the audit'}</span></div>
                        <div style={{ '--c': '#7c3aed' }}><small>Billed</small><b>{money(econ.billed)}</b><span>{econ.unbilled ? `${money(econ.unbilled)} to bill` : econ.fee ? 'fully billed' : '—'}</span></div>
                        <div style={{ '--c': '#059669' }}><small>Received</small><b>{money(econ.received)}</b><span>{econ.outstanding > 0 ? `${money(econ.outstanding)} outstanding` : 'nothing due'}</span></div>
                        <div style={{ '--c': '#0284c7' }}><small>Hours</small><b>{Math.round(econ.hours)}h</b><span>{econ.estimatedHours ? `of ${econ.estimatedHours}h budget` : 'no budget'}</span></div>
                        <div style={{ '--c': '#d97706' }}><small>Cost of time</small><b>{money(econ.cost)}</b><span>{econ.effectiveRate ? `${money(econ.effectiveRate)}/h earned` : '—'}</span></div>
                        <div style={{ '--c': econ.marginPct === null ? '#94a3b8' : econ.marginPct < 20 ? '#e11d48' : '#059669' }}><small>Margin</small><b>{econ.margin === null ? '—' : money(econ.margin)}</b><span>{econ.marginPct === null ? 'needs a fee' : `${econ.marginPct}% of fee`}</span></div>
                    </div>
                </>
            )}

            <section className="pp-card">
                <div className="pd-tabs" role="tablist">
                    {[
                        { k: 'workflow', label: 'Workflow', icon: 'mdi-timeline-check-outline', n: `${(audit.milestones || []).filter((x) => x.done).length}/${(audit.milestones || []).length}` },
                        { k: 'team', label: 'Team & hours', icon: 'mdi-account-group-outline', n: team.length },
                        { k: 'log', label: 'Time log', icon: 'mdi-history', n: logs.length },
                        ...(money_ ? [{ k: 'billing', label: 'Billing', icon: 'mdi-receipt', n: econ?.invoiceList?.length ?? 0 }] : []),
                        { k: 'details', label: 'Details', icon: 'mdi-information-outline' },
                    ].map((t) => (
                        <button key={t.k} type="button" role="tab" aria-selected={tab === t.k} className={`pd-tab ${tab === t.k ? 'active' : ''}`} onClick={() => setTab(t.k)}>
                            <i className={`mdi ${t.icon}`}></i>{t.label}{t.n !== undefined && <b>{t.n}</b>}
                        </button>
                    ))}
                </div>

                <div className="pd-panel">
                    {tab === 'workflow' && (() => {
                        const ms = audit.milestones || []
                        const stages = AE_STAGES.map(([name, icon]) => {
                            const items = ms.filter((x) => x.stage === name)
                            const doneN = items.filter((x) => x.done).length
                            return { name, icon, items, doneN, complete: items.length > 0 && doneN === items.length }
                        })
                        const nowIdx = stages.findIndex((s) => !s.complete)
                        const statusStage = { Planning: 'Planning', Fieldwork: 'Fieldwork', Review: 'Review', Reporting: 'Reporting' }[audit.status]
                        const st = stages.find((s) => s.name === statusStage)
                        const nextStatus = { Planning: 'Fieldwork', Fieldwork: 'Review', Review: 'Reporting', Reporting: 'Completed' }[audit.status]
                        return (
                            <>
                                <div className="ae-steps">{stages.map((s, i) => (
                                    <div key={s.name} className={`ae-step ${s.complete ? 'done' : i === nowIdx ? 'now' : ''}`}>
                                        <span className="ae-step-dot"><i className={`mdi ${s.complete ? 'mdi-check' : s.icon}`}></i></span>
                                        <b>{s.name}</b><small>{s.doneN}/{s.items.length} done</small>
                                    </div>
                                ))}</div>
                                {canManage && st?.complete && nextStatus && (
                                    <div className="ae-next"><i className="mdi mdi-arrow-right-circle-outline"></i><span>Everything in <b>{st.name}</b> is done. Move the audit to <b>{nextStatus}</b>?</span><button type="button" className="pp-btn primary sm" onClick={() => onStatus(nextStatus)}>Move to {nextStatus}</button></div>
                                )}
                                {stages.map((s) => (
                                    <div key={s.name} className={`ae-stage ${s.complete ? 'complete' : ''}`}>
                                        <header><i className={`mdi ${s.icon}`}></i><b>{s.name}</b><span>{s.complete ? 'Complete' : `${s.doneN} of ${s.items.length}`}</span></header>
                                        <ul>{s.items.map((x) => {
                                            const billingStep = ['invoice', 'payment'].includes(x.key)
                                            const can = isMember || canManage
                                            return (
                                                <li key={x.key} className={x.done ? 'done' : ''}>
                                                    <button type="button" disabled={!can || billingStep} title={billingStep ? 'Ticked automatically when the invoice is issued / paid' : ''} onClick={() => toggleMilestone(x)}><i className={`mdi ${x.done ? 'mdi-checkbox-marked-circle' : 'mdi-checkbox-blank-circle-outline'}`}></i></button>
                                                    <span>{x.label}</span>
                                                    {x.done && x.doneAt && <small>{fmtDate(x.doneAt)}</small>}
                                                    {billingStep && !x.done && <small>auto</small>}
                                                </li>
                                            )
                                        })}</ul>
                                    </div>
                                ))}
                            </>
                        )
                    })()}

                    {tab === 'billing' && econ && (
                        <>
                            <ChargesEditor audit={audit} canEdit={econCanBill} onSaved={refresh} />
                            {econCanBill && (
                                <div className="bl-prep">
                                    <b><i className="mdi mdi-receipt"></i> Prepare a bill for a period — hours, retainers, visits and fees not billed yet</b>
                                    <div className="bl-chips">{PRESETS.slice(0, 3).map(([k, label, f, t]) => <button key={k} type="button" className={period.from === f && period.to === t ? 'on' : ''} onClick={() => setPeriod({ from: f, to: t })}>{label}</button>)}</div>
                                    <label>From<input type="date" className="pp-input" value={period.from} onChange={(e) => e.target.value && setPeriod((p) => ({ ...p, from: e.target.value }))} /></label>
                                    <label>To<input type="date" className="pp-input" value={period.to} onChange={(e) => e.target.value && setPeriod((p) => ({ ...p, to: e.target.value }))} /></label>
                                    <button type="button" className="pp-btn primary" onClick={raiseInvoice}><i className="mdi mdi-receipt"></i>Prepare bill</button>
                                </div>
                            )}
                            <div className="au-log-tools">
                                <span style={{ fontSize: 13, color: 'var(--pp-muted)' }}>Contract value {money(econ.fee)} · billed {money(econ.billedTaxable)} (before GST){econ.fee ? ` · ${money(econ.unbilled)} not billed yet` : ''}</span>
                            </div>
                            {!econ.invoiceList.length ? <EmptyState icon="mdi-receipt" title="No invoices yet" text={econCanBill ? 'Raise an invoice — it’s pre-filled with the fee still to bill.' : 'Accounts will raise the invoice for this engagement.'} /> : (
                                <table className="bl-table"><thead><tr><th>Invoice</th><th>Date</th><th className="n">Amount</th><th className="n">Balance</th><th>Status</th></tr></thead>
                                    <tbody>{econ.invoiceList.map((i) => (
                                        <tr key={i._id} onClick={() => setInvoiceId(i._id)} className={i.status === 'Cancelled' ? 'cx' : ''}>
                                            <td className="no">{i.invoiceNo || <em>Draft</em>}</td><td>{fmtDate(i.invoiceDate)}</td><td className="n">{money(i.total)}</td>
                                            <td className={`n ${i.balance > 0 ? 'due' : ''}`}>{['Draft', 'Cancelled'].includes(i.status) ? '—' : money(i.balance)}</td><td><InvStatus s={i.status} overdue={i.overdueDays} /></td>
                                        </tr>
                                    ))}</tbody></table>
                            )}
                        </>
                    )}

                    {tab === 'team' && (
                        <>
                            {canManage && (
                                <div className="pd-add">
                                    <PeoplePicker people={available} value={toAdd} onChange={setToAdd} exclude={memberIds} placeholder="Assign more people to this audit…" />
                                    <button type="button" className="pp-btn primary" onClick={onAddMembers} disabled={!toAdd.length}><i className="mdi mdi-account-plus-outline"></i> Assign</button>
                                </div>
                            )}
                            <div className="au-table-wrap">
                                <table className="au-table">
                                    <thead>
                                        <tr>
                                            <th>Person</th>
                                            <th>Status</th>
                                            <th className="num">Days</th>
                                            <th className="num">Sessions</th>
                                            <th className="num">Hours</th>
                                            <th>Share</th>
                                            <th>Last activity</th>
                                            {canManage && <th></th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {team.map((r) => {
                                            const share = totalMinutes ? Math.round((r.minutes / totalMinutes) * 100) : 0
                                            return (
                                                <tr key={idOf(r.person)}>
                                                    <td>
                                                        <div className="au-person">
                                                            <Avatar person={r.person} size={34} />
                                                            <div>
                                                                <Link to={`/employees/${idOf(r.person)}`}>{fullName(r.person)}</Link>
                                                                <small>{r.role}{r.person?.designation ? ` · ${r.person.designation}` : ''}</small>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        {r.running
                                                            ? <span className="au-live-tag"><span className="au-pulse"></span><LiveClock start={r.running.startTime} /></span>
                                                            : <span className="pp-muted-dash">{r.logs.length ? 'Idle' : 'Not started'}</span>}
                                                    </td>
                                                    <td className="num"><b>{r.days}</b></td>
                                                    <td className="num">{r.logs.length}</td>
                                                    <td className="num"><b>{fmtDuration(r.minutes)}</b></td>
                                                    <td>
                                                        <div className="au-share" style={{ '--c': m.color }}>
                                                            <div className="au-track"><span style={{ width: `${share}%` }}></span></div>
                                                            <small>{share}%</small>
                                                        </div>
                                                    </td>
                                                    <td>{r.last ? fmtDateTime(r.last) : '—'}</td>
                                                    {canManage && (
                                                        <td className="num">
                                                            {r.role === 'Team member' && (
                                                                <button type="button" className="au-remove" onClick={() => onRemoveMember(r.person)} title="Remove from audit" aria-label={`Remove ${fullName(r.person)}`}>
                                                                    <i className="mdi mdi-account-remove-outline"></i>
                                                                </button>
                                                            )}
                                                        </td>
                                                    )}
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}

                    {tab === 'log' && (
                        <>
                            {logs.some((l) => l.needsReview) && (
                                <div className="ae-review-banner"><i className="mdi mdi-clock-alert-outline"></i><span><b>{logs.filter((l) => l.needsReview).length} session{logs.filter((l) => l.needsReview).length === 1 ? '' : 's'} need review</b> — stopped automatically or unusually long. They aren't billed until a manager approves, corrects the end time, or marks them non-billable.</span></div>
                            )}
                            <div className="au-log-tools">
                                <select className="pp-select" value={logPerson} onChange={(e) => setLogPerson(e.target.value)} aria-label="Filter by person">
                                    <option value="">Everyone</option>
                                    {team.filter((r) => r.logs.length).map((r) => <option key={idOf(r.person)} value={idOf(r.person)}>{fullName(r.person)}</option>)}
                                </select>
                                <span className="pp-muted-dash" style={{ fontSize: 13 }}>
                                    {filteredLogs.length} session{filteredLogs.length === 1 ? '' : 's'} · {fmtDuration(filteredLogs.reduce((s, l) => s + minutesOf(l, now), 0))}
                                </span>
                            </div>
                            {!byDay.length ? <EmptyState icon="mdi-timer-outline" title="No time logged yet" text="Sessions appear here as soon as someone on the team starts the timer." /> : byDay.map(([day, items]) => (
                                <div key={day} className="au-day">
                                    <div className="au-day-head">
                                        {new Date(day).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                                        <span>{fmtDuration(items.reduce((s, l) => s + minutesOf(l, now), 0))}</span>
                                    </div>
                                    {items.map((l) => (
                                        <div key={l._id} className="au-session">
                                            <div className="au-person"><Avatar person={l.employeeId} size={26} /><b>{fullName(l.employeeId)}</b></div>
                                            <span className="au-range">
                                                {fmtClockTime(l.startTime)} – {l.endTime ? fmtClockTime(l.endTime) : <span className="au-live-tag"><span className="au-pulse"></span>running</span>}
                                            </span>
                                            <span className="au-dur">{l.endTime ? fmtDuration(l.durationMinutes) : <LiveClock start={l.startTime} />}</span>
                                            <span className="au-sess-note" title={l.note}>
                                                {l.needsReview && <span className="ae-flag" style={{ '--c': '#d97706' }} title={l.reviewReason}><i className="mdi mdi-clock-alert-outline"></i>Needs review</span>}
                                                {l.autoStopped && !l.needsReview && <span className="ae-flag" style={{ '--c': '#64748b' }}><i className="mdi mdi-timer-off-outline"></i>Auto-stopped</span>}
                                                {l.billable === false && <span className="ae-flag" style={{ '--c': '#e11d48' }}>Non-billable</span>}
                                                {l.billedInvoice && <span className="ae-flag" style={{ '--c': '#059669' }}><i className="mdi mdi-receipt"></i>Billed</span>}
                                                {l.originalMinutes != null && l.originalMinutes !== l.durationMinutes && <span className="ae-flag" style={{ '--c': '#1e40af' }}>was {fmtDuration(l.originalMinutes)}</span>}
                                                {' '}{l.note || ''}
                                                {l.needsReview && canManage && idOf(l.employeeId) !== user?._id && (
                                                    <span className="ae-review">
                                                        <button type="button" className="ok" onClick={() => review(l._id, 'approve')}>Approve</button>
                                                        {adjust?.id === l._id ? <>
                                                            <input type="datetime-local" value={adjust.end} onChange={(e) => setAdjust({ id: l._id, end: e.target.value })} />
                                                            <button type="button" onClick={() => review(l._id, 'adjust', new Date(adjust.end).toISOString())}>Save end time</button>
                                                        </> : <button type="button" onClick={() => { const d = new Date(l.endTime); setAdjust({ id: l._id, end: new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16) }) }}>Correct end time</button>}
                                                        <button type="button" className="no" onClick={() => review(l._id, 'nonbillable')}>Non-billable</button>
                                                    </span>
                                                )}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </>
                    )}

                    {tab === 'details' && (
                        <div className="pd-facts">
                            <div className="pd-fact" style={{ '--c': '#0284c7' }}><span><i className="mdi mdi-domain"></i>Client</span><b>{clientIdOf(audit) ? <Link to={`/audits/clients/${clientIdOf(audit)}`}>{audit.clientName}</Link> : audit.clientName}</b></div>
                            <div className="pd-fact" style={{ '--c': '#0b0f19' }}><span><i className="mdi mdi-account-tie-outline"></i>Audit manager</span><b>{fullName(audit.auditManager)}</b></div>
                            <div className="pd-fact" style={{ '--c': '#0284c7' }}><span><i className="mdi mdi-shape-outline"></i>Type</span><b>{audit.auditType}{audit.financialYear ? ` · FY ${audit.financialYear}` : ''}</b></div>
                            <div className="pd-fact" style={{ '--c': '#059669' }}><span><i className="mdi mdi-calendar-start"></i>Start</span><b>{fmtDate(audit.startDate)}</b></div>
                            <div className="pd-fact" style={{ '--c': '#e11d48' }}><span><i className="mdi mdi-flag-checkered"></i>Deadline</span><b>{fmtDate(audit.endDate)}</b></div>
                            <div className="pd-fact" style={{ '--c': '#7c3aed' }}><span><i className="mdi mdi-timer-sand"></i>Estimated hours</span><b>{audit.estimatedHours ? `${audit.estimatedHours}h` : '—'}</b></div>
                            {money_ && <div className="pd-fact" style={{ '--c': '#d97706' }}><span><i className="mdi mdi-cash-multiple"></i>Fee</span><b>{audit.fee ? money(audit.fee) : '—'}</b></div>}
                            <div className="pd-fact" style={{ '--c': '#0284c7' }}><span><i className="mdi mdi-play-circle-outline"></i>First work logged</span><b>{logs.length ? fmtDateTime(logs[logs.length - 1].startTime) : '—'}</b></div>
                            <div className="pd-fact" style={{ '--c': '#64748b' }}><span><i className="mdi mdi-account-plus-outline"></i>Created</span><b>{fmtDate(audit.createdAt)}</b></div>
                        </div>
                    )}
                </div>
            </section>
            {invoiceId && <InvoiceDrawer id={invoiceId} onClose={() => setInvoiceId(null)} onChanged={refresh} />}
            {editing && <InvoiceEditor invoice={editing} onClose={() => setEditing(null)} onSaved={(inv) => { setEditing(null); refresh(); if (inv?._id) setInvoiceId(inv._id) }} />}
        </PeopleShell>
    )
}
