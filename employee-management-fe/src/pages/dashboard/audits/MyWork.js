import React, { useCallback, useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import { PeopleShell, Avatar, ErrorBanner, fullName, fmtDate } from '../../../components/people/PeopleUI'
import { chatApi as api } from '../../../components/chat/chatApi'
import { toast } from '../../../components/common/Toaster'
import { TaskPill, TaskDrawerLoader, TASK_STATUS, PRIORITY_C } from '../../../components/audits/TaskUI'
import './AuditOps.css'

/* My Work: every audit task assigned to me across companies and projects, reviews waiting for me,
   today's / this week's hours, timesheet status and review feedback. */

const hm = (m) => `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m`
const QUICK = ['start', 'resume', 'submit', 'complete', 'startReview', 'approve']

export const MyWork = () => {
    const { isAuthenticated: user } = useSelector((s) => s.authReducer || {})
    const [d, setD] = useState(null)
    const [error, setError] = useState('')
    const [view, setView] = useState('tasks')
    const [f, setF] = useState({ clientId: '', projectId: '', status: 'open', priority: '', due: '' })
    const [open, setOpen] = useState(null)
    const load = useCallback(() => {
        const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v))
        return api('GET', `/audit-work/me?${qs}`).then((j) => { setD(j.data); setError('') }).catch((e) => setError(e.message))
    }, [f])
    useEffect(() => { load() }, [load])
    const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target ? e.target.value : e }))
    const quick = async (t, a, ev) => {
        ev.stopPropagation()
        try { const j = await api('POST', `/audits/${t.auditId}/tasks/${t.key}/action`, { action: a.action }); toast.success(j.message); load() } catch (e) { toast.error(e.message); setOpen({ auditId: t.auditId, key: t.key }) }
    }
    const s = d?.stats || {}
    const rows = view === 'reviews' ? d?.reviews || [] : d?.tasks || []

    return (
        <PeopleShell title="My work" root={{ label: 'Audits', to: '/audits' }} crumbs={[{ label: 'My work' }]} backTo="/dashboard"
            actions={<Link to="/timesheets" className="pp-btn"><i className="mdi mdi-timetable"></i>My timesheet</Link>}>
            <div className="ao">
                <ErrorBanner error={error} />
                <div className="ao-tiles">
                    {[
                        ['open', s.open, 'Open tasks', '#2563eb', 'mdi-format-list-checks', () => setF((x) => ({ ...x, status: 'open', due: '' }))],
                        ['due', s.dueToday, 'Due today', '#d97706', 'mdi-calendar-today', () => setF((x) => ({ ...x, due: 'today', status: 'open' }))],
                        ['overdue', s.overdue, 'Overdue', '#dc2626', 'mdi-alarm', () => setF((x) => ({ ...x, due: 'overdue', status: 'open' }))],
                        ['changes', s.changesRequested, 'Changes requested', '#ea580c', 'mdi-pencil-circle-outline', () => setF((x) => ({ ...x, status: 'Changes Requested', due: '' }))],
                        ['review', s.toReview, 'To review', '#7c3aed', 'mdi-account-check-outline', () => setView('reviews')],
                        ['today', s.todayMinutes !== undefined ? hm(s.todayMinutes) : '–', 'Logged today', '#059669', 'mdi-timer-outline', null],
                        ['week', s.weekMinutes !== undefined ? hm(s.weekMinutes) : '–', 'This week', '#0284c7', 'mdi-calendar-week', null],
                    ].map(([k, v, l, c, ic, on]) => {
                        const El = on ? 'button' : 'div'
                        return <El key={k} type={on ? 'button' : undefined} className={`ao-tile ${['overdue', 'changes'].includes(k) && v ? 'alert' : ''}`} style={{ '--c': c }} onClick={on ? () => { setView(k === 'review' ? 'reviews' : 'tasks'); on() } : undefined}><i className={`mdi ${ic}`}></i><b>{d ? v ?? 0 : '–'}</b><small>{l}</small></El>
                    })}
                </div>
                {s.timesheet && (s.timesheet.draft > 0 || s.timesheet.rejected > 0) && (
                    <div className="ao-note"><i className="mdi mdi-timetable"></i><span>{s.timesheet.rejected ? <><b>{s.timesheet.rejected}</b> time entr{s.timesheet.rejected === 1 ? 'y was' : 'ies were'} returned for correction. </> : null}<b>{s.timesheet.draft}</b> entr{s.timesheet.draft === 1 ? 'y' : 'ies'} this week not submitted yet.</span><Link to="/timesheets" className="pp-btn sm primary">Open timesheet</Link></div>
                )}

                <div className="ao-tools">
                    <div className="ao-seg">{[['tasks', 'My tasks', d?.tasks?.length], ['reviews', 'Waiting for my review', d?.reviews?.length]].map(([k, l, n]) => <button key={k} type="button" className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}{n ? <em>{n}</em> : null}</button>)}</div>
                    {view === 'tasks' && <>
                        <select className="pp-select" value={f.clientId} onChange={set('clientId')} aria-label="Company"><option value="">All companies</option>{(d?.companies || []).map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</select>
                        {(d?.projects || []).length > 0 && <select className="pp-select" value={f.projectId} onChange={set('projectId')} aria-label="Project"><option value="">All projects</option>{d.projects.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}</select>}
                        <select className="pp-select" value={f.status} onChange={set('status')} aria-label="Status"><option value="open">Open</option><option value="">Everything (incl. done)</option>{Object.keys(TASK_STATUS).map((x) => <option key={x}>{x}</option>)}</select>
                        <select className="pp-select" value={f.priority} onChange={set('priority')} aria-label="Priority"><option value="">Any priority</option>{['Critical', 'High', 'Medium', 'Low'].map((p) => <option key={p}>{p}</option>)}</select>
                        <select className="pp-select" value={f.due} onChange={set('due')} aria-label="Due"><option value="">Any due date</option><option value="overdue">Overdue</option><option value="today">Due today</option><option value="week">Due this week</option></select>
                    </>}
                </div>

                {!d ? <div className="ao-tasks">{[0, 1, 2].map((i) => <div key={i} className="pp-skel" style={{ height: 64 }}></div>)}</div>
                    : !rows.length ? <div className="ao-card ao-empty"><i className={`mdi ${view === 'reviews' ? 'mdi-check-all' : 'mdi-coffee-outline'}`}></i>{view === 'reviews' ? 'Nothing waiting for your review.' : 'No tasks match these filters.'}</div>
                        : <ul className="ao-tasks">{rows.map((t) => {
                            const quickA = (t.actions || []).filter((a) => QUICK.includes(a.action) && !a.needs && !a.override)[0]
                            return (
                                <li key={`${t.auditId}-${t.key}`} className="ao-task" style={{ '--c': (TASK_STATUS[t.status] || {}).c }} onClick={() => setOpen({ auditId: t.auditId, key: t.key })} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen({ auditId: t.auditId, key: t.key })}>
                                    <span className="rail"></span>
                                    <div className="main">
                                        <div className="t"><span>{t.label}</span>{t.priority !== 'Medium' && <span className="ao-chip" style={{ '--c': PRIORITY_C[t.priority] }}>{t.priority}</span>}</div>
                                        <div className="m">
                                            <span><i className="mdi mdi-domain"></i>{t.clientName}{t.project ? ` · ${t.project.name}` : ''}</span>
                                            <span>{t.auditCode} · {t.stage}</span>
                                            {t.dueDate && <span className={t.overdue ? 'bad' : ''}><i className="mdi mdi-calendar-clock-outline"></i>{t.overdue ? 'Overdue · ' : 'Due '}{fmtDate(t.dueDate)}</span>}
                                            {t.estimatedHours > 0 && <span><i className="mdi mdi-timer-sand"></i>{t.estimatedHours}h est.</span>}
                                            {t.location && <span><i className="mdi mdi-map-marker-outline"></i>{t.location}</span>}
                                            {view === 'reviews' && t.assignee && <span className="ao-person"><Avatar person={t.assignee} size={16} />{fullName(t.assignee)}</span>}
                                        </div>
                                        {t.status === 'Changes Requested' && t.lastReview && <div className="fb"><b>Reviewer:</b> {t.lastReview}</div>}
                                    </div>
                                    <div className="side">
                                        <TaskPill status={t.status} small />
                                        {quickA && <div className="ao-quick"><button type="button" onClick={(e) => quick(t, quickA, e)}>{quickA.label}</button></div>}
                                    </div>
                                </li>
                            )
                        })}</ul>}
            </div>
            {open && <TaskDrawerLoader auditId={open.auditId} taskKey={open.key} me={user?._id} onClose={() => setOpen(null)} onChanged={load} />}
        </PeopleShell>
    )
}
