import React, { useCallback, useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { PeopleShell, Avatar, ErrorBanner, fullName, fmtDate } from '../../../components/people/PeopleUI'
import { chatApi as api } from '../../../components/chat/chatApi'
import { toast } from '../../../components/common/Toaster'
import { TaskPill, TaskDrawerLoader, PRIORITY_C } from '../../../components/audits/TaskUI'
import './AuditOps.css'

/* Work allocation: everyone working on the engagements I manage — their open tasks, remaining
   estimate against capacity (leave taken off), overdue / blocked work — and unassigned tasks.
   Reassign straight from the list; history and logged time stay with the task. */

const LOAD = { over: ['#dc2626', 'Overloaded'], full: ['#d97706', 'Fully booked'], ok: ['#059669', 'Balanced'], light: ['#0284c7', 'Has capacity'], unknown: ['#94a3b8', '—'] }

export const WorkAllocation = () => {
    const { isAuthenticated: user } = useSelector((s) => s.authReducer || {})
    const [d, setD] = useState(null)
    const [error, setError] = useState('')
    const [f, setF] = useState({ clientId: '', auditId: '', days: '14' })
    const [open, setOpen] = useState(null)
    const [task, setTask] = useState(null)
    const load = useCallback(() => {
        const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v))
        return api('GET', `/audit-work/allocation?${qs}`).then((j) => { setD(j.data); setError('') }).catch((e) => setError(e.message))
    }, [f])
    useEffect(() => { load() }, [load])
    const reassign = async (t, assignee) => {
        try { const j = await api('PUT', `/audits/${t.auditId}/tasks/${t.key}/assign`, { assignee: assignee || null, note: 'Rebalanced from Work allocation' }); toast.success(j.message); load() } catch (e) { toast.error(e.message) }
    }
    // anyone in view can take it; the server adds them to the engagement's team
    const teamFor = () => (d?.people || []).map((p) => p.person)
    const over = (d?.people || []).filter((p) => p.load === 'over').length
    return (
        <PeopleShell title="Work allocation" root={{ label: 'Audits', to: '/audits' }} crumbs={[{ label: 'Work allocation' }]} backTo="/audits">
            <div className="ao">
                <ErrorBanner error={error} />
                <div className="ao-filters">
                    <select className="pp-select" value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value, auditId: '' })} aria-label="Company"><option value="">All companies</option>{[...new Map((d?.engagements || []).map((e) => [String(e.clientId), e])).values()].map((e) => <option key={e.clientId} value={e.clientId}>{e.clientName}</option>)}</select>
                    <select className="pp-select" value={f.auditId} onChange={(e) => setF({ ...f, auditId: e.target.value })} aria-label="Engagement"><option value="">All engagements</option>{(d?.engagements || []).filter((e) => !f.clientId || String(e.clientId) === f.clientId).map((e) => <option key={e._id} value={e._id}>{e.clientName} · {e.auditCode}</option>)}</select>
                    <select className="pp-select" value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })} aria-label="Horizon"><option value="7">Next 7 days</option><option value="14">Next 14 days</option><option value="30">Next 30 days</option></select>
                    {d && <span className="ao-muted">{d.people.length} people · {over ? <b style={{ color: '#dc2626' }}>{over} overloaded</b> : 'nobody overloaded'} · {d.unassigned.length} unassigned task{d.unassigned.length === 1 ? '' : 's'}</span>}
                </div>
                <div className="ao-grid main">
                    <div className="ao-people">
                        {!d ? [0, 1, 2].map((i) => <div key={i} className="pp-skel" style={{ height: 62 }}></div>) : !d.people.length ? <div className="ao-card ao-empty"><i className="mdi mdi-account-group-outline"></i>No one is working on engagements you manage yet.</div> : d.people.map((p) => {
                            const [c, label] = LOAD[p.load]
                            const isOpen = open === p.person._id
                            return (
                                <div key={p.person._id} className="ao-prow">
                                    <header onClick={() => setOpen(isOpen ? null : p.person._id)} role="button" tabIndex={0} aria-expanded={isOpen} onKeyDown={(e) => e.key === 'Enter' && setOpen(isOpen ? null : p.person._id)}>
                                        <span className="ao-person"><Avatar person={p.person} size={32} /><div><b>{fullName(p.person)}</b><small>{p.person.designation}{p.onLeaveDays ? ` · leave in this period` : ''}</small></div></span>
                                        <div className="ao-load"><span className="ao-bar" style={{ '--c': c }}><span><i style={{ width: `${Math.min(100, p.utilization || 0)}%` }}></i></span>{p.utilization === null ? '—' : `${p.utilization}%`}</span><small style={{ color: c }}>{label} · {p.plannedHours}h of {p.capacityHours}h</small></div>
                                        <span className="stat"><b>{p.openTasks}</b>open</span>
                                        <span className={`stat hide-sm`}><b className={p.overdue ? 'bad' : ''}>{p.overdue}</b>overdue</span>
                                        <span className="stat hide-sm"><b className={p.blocked ? 'bad' : ''}>{p.blocked}</b>blocked</span>
                                        <span className="stat hide-sm"><b>{p.loggedThisWeek}h</b>this week</span>
                                        <i className={`mdi ${isOpen ? 'mdi-chevron-up' : 'mdi-chevron-down'}`}></i>
                                    </header>
                                    {isOpen && (
                                        <div className="body">
                                            {p.otherEngagements.tasks > 0 && <p className="ao-muted" style={{ margin: '6px 0' }}>Also has {p.otherEngagements.tasks} open task{p.otherEngagements.tasks === 1 ? '' : 's'} ({p.otherEngagements.hours}h) on engagements outside this view — included in the load.</p>}
                                            {!p.tasks.length ? <p className="ao-muted">No open tasks here.</p> : (
                                                <table><thead><tr><th>Task</th><th>Status</th><th>Due</th><th>Est / logged</th><th>Reassign</th></tr></thead>
                                                    <tbody>{p.tasks.map((t) => (
                                                        <tr key={`${t.auditId}-${t.key}`}>
                                                            <td><button type="button" className="atk-link" style={{ marginLeft: 0 }} onClick={() => setTask(t)}>{t.label}</button><br /><small className="ao-muted">{t.clientName} · {t.auditCode} · {t.stage}{t.location ? ` · ${t.location}` : ''}</small></td>
                                                            <td><TaskPill status={t.status} small />{t.priority !== 'Medium' && <span className="ao-chip" style={{ '--c': PRIORITY_C[t.priority], marginLeft: 4 }}>{t.priority}</span>}</td>
                                                            <td className={t.dueDate && new Date(t.dueDate) < new Date(new Date().toDateString()) ? 'bad' : ''}>{t.dueDate ? fmtDate(t.dueDate) : '—'}</td>
                                                            <td>{t.estimatedHours || 0}h / {t.loggedHours}h</td>
                                                            <td><select className="pp-select" value={p.person._id} onChange={(e) => reassign(t, e.target.value)} aria-label="Reassign">{teamFor(t.auditId).map((x) => <option key={x._id} value={x._id}>{fullName(x)}</option>)}<option value="">— Unassign —</option></select></td>
                                                        </tr>
                                                    ))}</tbody></table>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                        {d && <p className="ao-help"><b>How it's worked out.</b> {d.formulas.plannedHours} {d.formulas.capacityHours} {d.formulas.utilization}</p>}
                    </div>
                    <aside className="ao-card">
                        <header><b>Unassigned tasks</b><small>{d?.unassigned.length || 0}</small></header>
                        {!d ? <div className="pp-skel" style={{ height: 100 }}></div> : !d.unassigned.length ? <p className="ao-muted">Every open task has an owner.</p> : (
                            <ul className="ao-tasks">{d.unassigned.slice(0, 40).map((t) => (
                                <li key={`${t.auditId}-${t.key}`} className="ao-task" style={{ '--c': '#94a3b8', cursor: 'default' }}>
                                    <span className="rail"></span>
                                    <div className="main"><div className="t"><span>{t.label}</span></div><div className="m"><span>{t.clientName} · {t.stage}</span>{t.responsibleRole && <span>{t.responsibleRole}</span>}{t.dueDate && <span>Due {fmtDate(t.dueDate)}</span>}{t.estimatedHours > 0 && <span>{t.estimatedHours}h</span>}</div></div>
                                    <div className="side"><select className="pp-select" style={{ height: 30, fontSize: 12, maxWidth: 150 }} value="" onChange={(e) => reassign(t, e.target.value)} aria-label="Assign to"><option value="">Assign to…</option>{(d.people || []).map((p) => <option key={p.person._id} value={p.person._id}>{fullName(p.person)} ({p.utilization ?? '—'}%)</option>)}</select></div>
                                </li>
                            ))}</ul>
                        )}
                    </aside>
                </div>
            </div>
            {task && <TaskDrawerLoader auditId={task.auditId} taskKey={task.key} me={user?._id} onClose={() => setTask(null)} onChanged={load} />}
        </PeopleShell>
    )
}
