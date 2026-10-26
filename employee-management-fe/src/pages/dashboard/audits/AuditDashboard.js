import React, { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PeopleShell, Avatar, ErrorBanner, fullName, fmtDate } from '../../../components/people/PeopleUI'
import { chatApi as api } from '../../../components/chat/chatApi'
import { money } from '../../../components/payroll/PayrollUI'
import { TaskPill } from '../../../components/audits/TaskUI'
import './AuditOps.css'

/* Audit management dashboard: companies → projects → engagements → tasks → people, with
   estimated vs actual hours, risk, reviews, timesheets, utilization and productivity.
   Every figure is computed from recorded work; the formulas are shown on the page. */

const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const pct = (n) => (n === null || n === undefined ? '—' : `${n}%`)
const RANGES = [['30', 'Last 30 days'], ['7', 'Last 7 days'], ['90', 'Last 90 days'], ['month', 'This month']]
const rangeOf = (k) => { const t = new Date(); if (k === 'month') return { from: ymd(new Date(t.getFullYear(), t.getMonth(), 1)), to: ymd(t) }; const f = new Date(t); f.setDate(t.getDate() - Number(k) + 1); return { from: ymd(f), to: ymd(t) } }

export const AuditDashboard = () => {
    const nav = useNavigate()
    const [range, setRange] = useState('30')
    const [f, setF] = useState({ clientId: '', projectId: '', managerId: '', employeeId: '' })
    const [d, setD] = useState(null)
    const [error, setError] = useState('')
    const [showHow, setShowHow] = useState(false)
    const load = useCallback(() => {
        const qs = new URLSearchParams({ ...rangeOf(range), ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) })
        return api('GET', `/audit-work/dashboard?${qs}`).then((j) => { setD(j.data); setError('') }).catch((e) => setError(e.message))
    }, [range, f])
    useEffect(() => { setD(null); load() }, [load])
    const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
    const c = d?.cards || {}
    const drill = (k, v) => setF((x) => ({ ...x, [k]: v }))

    return (
        <PeopleShell title="Audit dashboard" root={{ label: 'Audits', to: '/audits' }} crumbs={[{ label: 'Dashboard' }]} backTo="/audits"
            actions={<><Link to="/audits/allocation" className="pp-btn"><i className="mdi mdi-account-switch-outline"></i>Work allocation</Link><Link to="/timesheets?tab=approvals" className="pp-btn"><i className="mdi mdi-timetable"></i>Timesheet approvals</Link></>}>
            <div className="ao">
                <ErrorBanner error={error} />
                <div className="ao-filters">
                    <div className="ao-seg">{RANGES.map(([k, l]) => <button key={k} type="button" className={range === k ? 'on' : ''} onClick={() => setRange(k)}>{l}</button>)}</div>
                    <select className="pp-select" value={f.clientId} onChange={set('clientId')} aria-label="Company"><option value="">All companies</option>{(d?.filters.companies || []).map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}</select>
                    {(d?.filters.projects || []).length > 0 && <select className="pp-select" value={f.projectId} onChange={set('projectId')} aria-label="Project"><option value="">All projects</option>{d.filters.projects.map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}</select>}
                    <select className="pp-select" value={f.managerId} onChange={set('managerId')} aria-label="Manager"><option value="">All managers</option>{(d?.filters.managers || []).map((x) => <option key={x._id} value={x._id}>{fullName(x)}</option>)}</select>
                    <select className="pp-select" value={f.employeeId} onChange={set('employeeId')} aria-label="Employee"><option value="">Everyone</option>{(d?.filters.people || []).map((x) => <option key={x._id} value={x._id}>{fullName(x)}</option>)}</select>
                    {Object.values(f).some(Boolean) && <button type="button" className="pp-btn sm" onClick={() => setF({ clientId: '', projectId: '', managerId: '', employeeId: '' })}><i className="mdi mdi-filter-remove-outline"></i>Clear</button>}
                </div>

                <div className="ao-tiles">
                    {[
                        ['mdi-domain', c.companies, 'Companies', '#1e40af'], ['mdi-folder-multiple-outline', c.projects, 'Projects', '#4f46e5'], ['mdi-clipboard-text-outline', c.engagements, 'Active engagements', '#0284c7'],
                        ['mdi-progress-clock', c.tasksInProgress, 'Tasks in progress', '#2563eb'], ['mdi-hand-back-left-outline', c.tasksBlocked, 'Blocked', '#dc2626'], ['mdi-alarm', c.tasksOverdue, 'Overdue tasks', '#ea580c'],
                        ['mdi-account-check-outline', c.pendingReviews, 'Pending reviews', '#7c3aed'], ['mdi-timetable', c.timesheetsAwaiting ? `${c.timesheetsAwaiting.hours}h` : 0, `Timesheets to approve${c.timesheetsAwaiting?.people ? ` · ${c.timesheetsAwaiting.people} people` : ''}`, '#9333ea'],
                        ['mdi-scale-balance', c.estimatedHours !== undefined ? <>{c.actualHours}h<em>/{c.estimatedHours}h</em></> : '–', 'Actual vs estimated (active)', '#059669'],
                        ['mdi-alert-outline', c.atRisk, 'Engagements at risk', '#b91c1c'], ...(c.feeActive !== undefined ? [['mdi-cash-multiple', money(c.feeActive), 'Fees on active work', '#0f766e']] : []),
                    ].map(([ic, v, l, col]) => <div key={l} className={`ao-tile ${['Blocked', 'Overdue tasks', 'Engagements at risk'].includes(l) && v ? 'alert' : ''}`} style={{ '--c': col }}><i className={`mdi ${ic}`}></i><b>{d ? v ?? 0 : '–'}</b><small>{l}</small></div>)}
                </div>

                <section className="ao-card" style={{ marginBottom: 12 }}>
                    <header><b>Engagements</b><small>risk first · click to open</small></header>
                    {!d ? <div className="pp-skel" style={{ height: 160 }}></div> : !d.engagements.length ? <p className="ao-muted">No active engagements in view.</p> : (
                        <div className="ao-tablewrap"><table className="ao-table">
                            <thead><tr><th>Engagement</th><th>Manager</th><th>Risk</th><th>Progress vs time</th><th className="n">Hours</th><th className="n">Overdue</th><th className="n">Blocked</th><th className="n">In review</th><th>Deadline</th></tr></thead>
                            <tbody>{d.engagements.map((e) => (
                                <tr key={e._id} className="click" onClick={() => nav(`/audits/${e._id}`)}>
                                    <td><b>{e.clientName}</b><br /><small className="ao-muted">{e.auditCode}{e.project ? ` · ${e.project.name}` : ''} · {e.status}</small></td>
                                    <td>{e.manager ? fullName(e.manager) : '—'}</td>
                                    <td><span className={`ao-risk ${e.risk}`}>{e.risk === 'low' ? 'On track' : e.risk === 'high' ? 'High' : 'Watch'}</span>{e.reasons.length > 0 && <ul className="ao-reasons">{e.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}</td>
                                    <td><div className="ao-twobar"><span><i style={{ width: `${e.progress}%`, background: '#10b981' }}></i></span><span><i style={{ width: `${e.elapsed}%`, background: '#94a3b8' }}></i></span><small>{e.progress}% done · {e.elapsed}% of time</small></div></td>
                                    <td className={`n ${e.hoursPct > 100 ? 'bad' : ''}`}>{e.hours}h{e.estimatedHours ? ` / ${e.estimatedHours}h` : ''}</td>
                                    <td className={`n ${e.overdue ? 'bad' : ''}`}>{e.overdue}</td><td className={`n ${e.blocked ? 'bad' : ''}`}>{e.blocked}</td><td className="n">{e.inReview}</td>
                                    <td>{fmtDate(e.endDate)}</td>
                                </tr>
                            ))}</tbody>
                        </table></div>
                    )}
                </section>

                <div className="ao-grid two" style={{ marginBottom: 12 }}>
                    {[['byCompany', 'By company', 'clientId'], ['byProject', 'By project', 'projectId']].map(([k, title, fk]) => (
                        <section key={k} className="ao-card">
                            <header><b>{title}</b><small>click to filter</small></header>
                            {!d ? <div className="pp-skel" style={{ height: 100 }}></div> : !d[k].length ? <p className="ao-muted">{k === 'byProject' ? 'No engagements are grouped into projects yet.' : 'Nothing in view.'}</p> : (
                                <div className="ao-tablewrap"><table className="ao-table"><thead><tr><th>{k === 'byProject' ? 'Project' : 'Company'}</th><th className="n">Active</th><th>Tasks done</th><th className="n">Hours / est.</th><th className="n">Overdue</th></tr></thead>
                                    <tbody>{d[k].map((r) => (
                                        <tr key={r.key} className="click" onClick={() => drill(fk, r.key)}>
                                            <td>{r.label}</td><td className="n">{r.active}</td>
                                            <td><span className="ao-bar"><span><i style={{ width: `${r.tasks ? (r.done / r.tasks) * 100 : 0}%` }}></i></span>{r.done}/{r.tasks}</span></td>
                                            <td className={`n ${r.estimatedHours && r.hours > r.estimatedHours ? 'bad' : ''}`}>{r.hours}h / {r.estimatedHours}h</td>
                                            <td className={`n ${r.overdue ? 'bad' : ''}`}>{r.overdue}</td>
                                        </tr>
                                    ))}</tbody></table></div>
                            )}
                        </section>
                    ))}
                </div>

                <section className="ao-card" style={{ marginBottom: 12 }}>
                    <header><b>Team utilization &amp; productivity</b><button type="button" className="atk-link" onClick={() => setShowHow(!showHow)}><i className="mdi mdi-information-outline"></i>{showHow ? 'Hide' : 'How these are calculated'}</button></header>
                    {showHow && d && <div className="ao-help" style={{ marginBottom: 10 }}>{Object.entries(d.formulas).map(([k, v]) => <p key={k} style={{ margin: '0 0 4px' }}><b>{{ utilization: 'Utilization', billableUtilization: 'Billable utilization', onTimeRate: 'On time', estimateAccuracy: 'Estimate accuracy', firstTimeApproval: 'First-time approval', reworkHours: 'Rework', reviewTurnaround: 'Review turnaround', risk: 'Risk', caution: 'Please note' }[k] || k}:</b> {v}</p>)}</div>}
                    {!d ? <div className="pp-skel" style={{ height: 160 }}></div> : !d.productivity.length ? <p className="ao-muted">No recorded work in this period.</p> : (
                        <div className="ao-tablewrap"><table className="ao-table">
                            <thead><tr><th>Person</th><th>Utilization</th>{d.productivity[0].billableHours !== undefined && <th className="n">Billable</th>}<th className="n">Done</th><th className="n">On time</th><th className="n">Est. accuracy</th><th className="n">1st-time approval</th><th className="n">Rework</th><th className="n">Review turnaround</th><th className="n">Open / blocked</th></tr></thead>
                            <tbody>{d.productivity.map((p) => (
                                <tr key={p.person._id} className="click" onClick={() => drill('employeeId', p.person._id)}>
                                    <td><span className="ao-person"><Avatar person={p.person} size={26} /><div><b>{fullName(p.person)}</b><small>{p.person.designation}{!p.dataComplete ? ' · limited data' : ''}</small></div></span></td>
                                    <td><span className="ao-bar" style={{ '--c': p.utilization > 110 ? '#dc2626' : p.utilization > 85 ? '#d97706' : '#10b981' }}><span><i style={{ width: `${Math.min(100, p.utilization || 0)}%` }}></i></span>{pct(p.utilization)}</span><small className="ao-muted">{p.loggedHours}h of {p.capacityHours}h</small></td>
                                    {p.billableHours !== undefined && <td className="n">{p.billableHours}h · {pct(p.billableUtilization)}</td>}
                                    <td className="n">{p.tasksCompleted}</td><td className="n">{pct(p.onTimeRate)}</td><td className="n">{pct(p.estimateAccuracy)}</td><td className="n">{pct(p.firstTimeApproval)}</td>
                                    <td className="n">{p.reworkHours ? `${p.reworkHours}h` : '—'}</td><td className="n">{p.reviewTurnaroundHours === null ? '—' : `${p.reviewTurnaroundHours}h · ${p.reviewsDone}`}</td>
                                    <td className="n">{p.openTasks}{p.blocked ? <span className="bad"> / {p.blocked}</span> : ''}</td>
                                </tr>
                            ))}</tbody>
                        </table></div>
                    )}
                    <p className="ao-help">Decision support, not a ranking: read these with task complexity, review quality, leave and assignment mix in mind. Gaps in time recording lower utilization.</p>
                </section>

                <div className="ao-grid two">
                    <section className="ao-card">
                        <header><b>Time per stage</b><small>tasks completed in the period</small></header>
                        {!d ? <div className="pp-skel" style={{ height: 80 }}></div> : !d.stages.length ? <p className="ao-muted">No completed tasks in this period.</p> : d.stages.map((s) => (
                            <div key={s.stage} className="ao-stage"><b>{s.stage}</b><span className="ao-bar"><span><i style={{ width: `${Math.min(100, (s.avgDays / Math.max(...d.stages.map((x) => x.avgDays), 1)) * 100)}%`, background: '#6366f1' }}></i></span>{s.avgDays}d avg</span><small className="ao-muted">{s.avgHours}h · {s.tasks} task{s.tasks === 1 ? '' : 's'}</small></div>
                        ))}
                    </section>
                    <section className="ao-card">
                        <header><b>Blocked tasks</b><small>{d?.blockedReasons.length || 0}</small></header>
                        {!d ? <div className="pp-skel" style={{ height: 80 }}></div> : !d.blockedReasons.length ? <p className="ao-muted">Nothing blocked.</p> : (
                            <ul className="ao-tasks">{d.blockedReasons.map((b) => <li key={`${b.auditId}${b.key}`} className="ao-task" style={{ '--c': '#dc2626' }} onClick={() => nav(`/audits/${b.auditId}?tab=workflow&task=${b.key}`)}><span className="rail"></span><div className="main"><div className="t"><span>{b.label}</span></div><div className="m"><span>{b.clientName} · {b.auditCode}</span>{b.since && <span>since {fmtDate(b.since)}</span>}</div>{b.reason && <div className="fb">{b.reason}</div>}</div></li>)}</ul>
                        )}
                    </section>
                    <section className="ao-card">
                        <header><b>Due in the next 7 days</b><small>{d?.upcoming.length || 0}</small></header>
                        {!d ? <div className="pp-skel" style={{ height: 80 }}></div> : !d.upcoming.length ? <p className="ao-muted">No task deadlines this week.</p> : (
                            <ul className="ao-tasks">{d.upcoming.map((u) => <li key={`${u.auditId}${u.key}`} className="ao-task" style={{ '--c': '#d97706' }} onClick={() => nav(`/audits/${u.auditId}?tab=workflow&task=${u.key}`)}><span className="rail"></span><div className="main"><div className="t"><span>{u.label}</span></div><div className="m"><span>{u.clientName}</span><span>Due {fmtDate(u.dueDate)}</span></div></div><div className="side"><TaskPill status={u.status} small /></div></li>)}</ul>
                        )}
                    </section>
                </div>
            </div>
        </PeopleShell>
    )
}
