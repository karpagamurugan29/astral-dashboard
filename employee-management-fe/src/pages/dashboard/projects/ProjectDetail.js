import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link, useParams } from 'react-router-dom'
import employeeActions from '../../../redux/employee/Actions'
import { PeopleShell, Avatar, EmptyState, ErrorBanner, fullName } from '../../../components/people/PeopleUI'
import { PROJECTS_ROOT, ProjectStatus, PriorityTag, AvatarStack, TASK_COLUMNS, TASK_STATUS, DueTag, isOverdue, projectStatusMeta } from '../../../components/projects/ProjectUI'
import { useAccess } from '../../../hooks/useAccess'
import { api, hm, fmtDay, fmtTime, modeIcon, PlaceLink, ProjectForm, TaskModal, TimerCard, taskTag, CloseTaskModal } from './ProjectParts'
import { toast } from '../../../components/common/Toaster'

/* -------------------------------------------------------------------------- */
/*  One project's workspace: header (status, deadline, place, team), work     */
/*  timer with location, and tabs — Board (drag & drop), List, Team, Time     */
/*  log, Details. Tasks live inside the project.                              */
/* -------------------------------------------------------------------------- */

const VIEWS = [['board', 'Board', 'mdi-view-column-outline'], ['list', 'List', 'mdi-format-list-bulleted'], ['team', 'Team', 'mdi-account-group-outline'], ['time', 'Time log', 'mdi-timer-outline'], ['closed', 'Closed', 'mdi-archive-outline'], ['details', 'Details', 'mdi-information-outline']]

export const ProjectDetail = () => {
    const { id } = useParams()
    const dispatch = useDispatch()
    const { user } = useAccess()
    const me = user?._id
    const { list: employees } = useSelector((state) => state.employeeReducer || {})
    const [w, setW] = useState(null)
    const [error, setError] = useState('')
    const [view, setView] = useState('board')
    const [modal, setModal] = useState(null) // { task } | { newStatus }
    const [closing, setClosing] = useState(null) // { tasks, mode: 'close' | 'reopen' }
    const [cq, setCq] = useState('')
    const [editing, setEditing] = useState(false)
    const [filter, setFilter] = useState('all') // all | mine | overdue
    const [drag, setDrag] = useState(null)

    const load = useCallback(() => api('GET', `/projects/${id}/workspace`).then((j) => { setW(j.data); setError('') }).catch((e) => setError(e.message)), [id])
    useEffect(() => { load() }, [load])
    useEffect(() => { const t = setInterval(load, 60000); return () => clearInterval(t) }, [load])
    useEffect(() => { if (w?.canManage && !employees?.length) dispatch({ type: employeeActions.GET_EMPLOYEES }) }, [w?.canManage, employees?.length, dispatch])

    const p = w?.project
    const tasks = useMemo(() => w?.tasks || [], [w])
    const members = useMemo(() => (p ? [p.projectManager, ...(p.teamMembers || [])].filter(Boolean) : []), [p])
    const people = useMemo(() => (employees || []).filter((e) => e.status === 'Active'), [employees])
    const shown = tasks.filter((t) => filter === 'all' || (filter === 'mine' ? (t.assignedTo?._id || t.assignedTo) === me : isOverdue(t)))
    const canEditTask = (t) => w?.canManage || (t.assignedTo?._id || t.assignedTo) === me || (t.createdBy?._id || t.createdBy) === me

    const upsertTask = (t, isNew, keepOpen) => {
        setW((x) => ({ ...x, tasks: isNew ? [...x.tasks, { ...t, loggedMinutes: 0 }] : x.tasks.map((y) => (y._id === t._id ? { ...y, ...t } : y)) }))
        if (!keepOpen) { setModal(null); toast.success(isNew ? `“${t.title}” added to the board.` : 'Your changes are saved.', { title: isNew ? 'Task added' : 'Task saved' }) }
        if (keepOpen) setModal((m) => (m?.task ? { task: { ...m.task, ...t } } : m))
    }
    const move = async (task, status) => {
        if (task.status === status) return
        const col = tasks.filter((t) => t.status === status)
        const order = (col.length ? Math.max(...col.map((t) => t.order || 0)) : 0) + 1
        setW((x) => ({ ...x, tasks: x.tasks.map((t) => (t._id === task._id ? { ...t, status, order } : t)) }))
        try { await api('PUT', `/tasks/${task._id}/move`, { status, order }) } catch (e) { toast.error(e.message, { title: 'Couldn’t move task' }); load() }
    }

    if (error && !w) return <PeopleShell title="Project" root={PROJECTS_ROOT} crumbs={[{ label: 'Project' }]}><div className="pp-card"><EmptyState icon="mdi-folder-lock-outline" title="Can’t open this project" text={error} action={<Link to="/projects" className="pp-btn">Back to projects</Link>} /></div></PeopleShell>
    if (!w) return <PeopleShell title="Project" root={PROJECTS_ROOT} crumbs={[{ label: 'Loading…' }]}><div className="pw-loading"><i className="mdi mdi-loading mdi-spin"></i></div></PeopleShell>

    const st = projectStatusMeta(p.status)
    const done = tasks.filter((t) => t.status === 'Done').length
    const overdue = tasks.filter(isOverdue).length
    const est = (p.estimatedHours || 0) * 60
    const used = est ? Math.round((w.totals.loggedMinutes / est) * 100) : null
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const daysLeft = p.endDate ? Math.ceil((new Date(p.endDate).setHours(0, 0, 0, 0) - today) / 864e5) : null
    const closed = ['Completed', 'Cancelled'].includes(p.status)

    return (
        <PeopleShell title={p.projectName} root={PROJECTS_ROOT} crumbs={[{ label: p.projectCode }]}
            actions={w.canManage && <button type="button" className="pp-btn" onClick={() => setEditing(true)}><i className="mdi mdi-pencil-outline"></i>Edit project</button>}>
            <ErrorBanner error={error} />

            {/* ---------- header ---------- */}
            <section className="pw-hero" style={{ '--c': st.color }}>
                <div className="pw-hero-main">
                    <div className="pw-hero-tags"><span className="pw-code">{p.projectCode}</span><ProjectStatus status={p.status} /><PriorityTag priority={p.priority} /></div>
                    <p className="pw-hero-sub"><i className="mdi mdi-domain"></i>{p.clientName || 'Internal project'}</p>
                    <div className="pw-hero-facts">
                        <span><i className="mdi mdi-calendar-range"></i>{fmtDay(p.startDate)} → {fmtDay(p.endDate)}</span>
                        <span className={daysLeft !== null && daysLeft < 0 && !closed ? 'bad' : daysLeft !== null && daysLeft <= 7 && !closed ? 'warn' : ''}><i className="mdi mdi-flag-checkered"></i>{closed ? p.status : daysLeft < 0 ? `${-daysLeft} days past deadline` : daysLeft === 0 ? 'Due today' : `${daysLeft} days left`}</span>
                        <span><i className={`mdi ${modeIcon(p.workMode)}`}></i>{p.workMode || 'Office'}{p.location?.siteName ? ` · ${p.location.siteName}` : ''}</span>
                        {p.location?.address && <a href={`https://www.google.com/maps/search/${encodeURIComponent(p.location.address)}`} target="_blank" rel="noreferrer"><i className="mdi mdi-map-marker-outline"></i>{p.location.address}</a>}
                    </div>
                    <div className="pw-hero-team"><Avatar person={p.projectManager} size={30} /><span><small>Lead</small><b>{fullName(p.projectManager)}</b></span><AvatarStack people={p.teamMembers || []} max={6} size={28} /></div>
                </div>
                <div className="pw-hero-kpis">
                    <div className="pw-ring" style={{ '--p': p.progress }}><b>{p.progress}%</b><small>done</small></div>
                    <div className="pw-kpi-list">
                        <span><b>{done}/{tasks.length}</b>tasks done</span>
                        <span className={overdue ? 'bad' : ''}><b>{overdue}</b>overdue</span>
                        <span><b>{hm(w.totals.loggedMinutes)}</b>{est ? `of ${p.estimatedHours}h` : 'logged'}</span>
                        {w.totals.runningNow > 0 && <span className="live"><b><i className="pw-dot"></i>{w.totals.runningNow}</b>working now</span>}
                    </div>
                    {used !== null && <div className={`pw-budget big ${used > 100 ? 'over' : used >= 80 ? 'near' : ''}`} title={`${used}% of estimated hours used`}><i style={{ width: `${Math.min(100, used)}%` }}></i></div>}
                </div>
            </section>

            {w.isMember && <TimerCard project={p} tasks={tasks} myTimer={w.myTimer} me={me} disabled={closed} onChanged={(msg, stopped) => { toast.success(stopped ? `${(msg.match(/\d+h \d+m/) || ['Your time'])[0]} added to the time log, with your stop location.` : 'Your start location is recorded. Stop the timer when you finish.', { title: stopped ? 'Timer stopped' : 'Timer started' }); load() }} />}

            {/* ---------- views ---------- */}
            <div className="pw-viewbar">
                <div className="pw-views">{VIEWS.map(([k, l, ic]) => <button key={k} type="button" className={view === k ? 'on' : ''} onClick={() => setView(k)}><i className={`mdi ${ic}`}></i><span>{l}</span>{k === 'closed' && (w.closedTasks || []).length > 0 && <b className="pw-count" style={{ background: '#059669' }}>{w.closedTasks.length}</b>}</button>)}</div>
                {(view === 'board' || view === 'list') && (
                    <div className="pw-filters">
                        {[['all', 'All'], ['mine', 'Mine'], ['overdue', 'Overdue']].map(([k, l]) => <button key={k} type="button" className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>)}
                        {!closed && (w.canManage || w.isMember) && <button type="button" className="pp-btn primary sm" onClick={() => setModal({ newStatus: 'To Do' })}><i className="mdi mdi-plus"></i>Task</button>}
                    </div>
                )}
            </div>

            {view === 'board' && (
                <div className="pw-kanban">
                    {TASK_COLUMNS.map((col) => {
                        const m = TASK_STATUS[col]
                        const items = shown.filter((t) => t.status === col).sort((a, b) => (a.order || 0) - (b.order || 0))
                        return (
                            <div key={col} className={`pw-col ${drag?.over === col ? 'over' : ''}`} style={{ '--c': m.color }}
                                onDragOver={(e) => { if (drag) { e.preventDefault(); if (drag.over !== col) setDrag({ ...drag, over: col }) } }}
                                onDragLeave={(e) => { if (e.currentTarget === e.target) setDrag((d) => (d ? { ...d, over: null } : d)) }}
                                onDrop={(e) => { e.preventDefault(); if (drag) move(drag.task, col); setDrag(null) }}>
                                <header><i className={`mdi ${m.icon}`}></i><b>{col}</b><span>{items.length}</span>
                                    {col === 'Done' && items.filter(canEditTask).length > 1 && <button type="button" className="pw-closebtn" style={{ marginLeft: 6 }} onClick={() => setClosing({ tasks: items.filter(canEditTask), mode: 'close' })} title="Close every finished task with one note"><i className="mdi mdi-archive-check-outline"></i>Close all</button>}
                                </header>
                                <div className="pw-col-body">
                                    {items.map((t) => {
                                        const cl = t.checklist || []
                                        const cd = cl.filter((c) => c.done).length
                                        const draggable = canEditTask(t)
                                        return (
                                            <article key={t._id} className={`pw-tcard ${drag?.task?._id === t._id ? 'dragging' : ''}`} draggable={draggable}
                                                onDragStart={() => setDrag({ task: t, over: null })} onDragEnd={() => setDrag(null)} onClick={() => setModal({ task: t })}>
                                                {t.labels?.length > 0 && <div className="pw-labels">{t.labels.map((l) => <span key={l}>{l}</span>)}</div>}
                                                {t.taskNo ? <span className="pw-tno">{taskTag(t)}{t.type && t.type !== 'Task' ? ` · ${t.type}` : ''}</span> : null}
                                                <b>{t.title}</b>
                                                <div className="pw-tcard-meta">
                                                    {t.priority === 'High' && <span className="hi"><i className="mdi mdi-chevron-double-up"></i>High</span>}
                                                    {t.dueDate && <DueTag date={t.dueDate} done={t.status === 'Done'} />}
                                                    {cl.length > 0 && <span className={cd === cl.length ? 'ok' : ''}><i className="mdi mdi-format-list-checks"></i>{cd}/{cl.length}</span>}
                                                    {t.comments?.length > 0 && <span><i className="mdi mdi-comment-outline"></i>{t.comments.length}</span>}
                                                    {t.loggedMinutes > 0 && <span><i className="mdi mdi-timer-outline"></i>{hm(t.loggedMinutes)}</span>}
                                                </div>
                                                <div className="pw-tcard-foot">
                                                    {t.assignedTo ? <span className="pw-who"><Avatar person={t.assignedTo} size={22} />{t.assignedTo.firstName}</span> : <span className="pw-who none">Unassigned</span>}
                                                    {draggable && t.status === 'Done' && <button type="button" className="pw-closebtn" onClick={(e) => { e.stopPropagation(); setClosing({ tasks: [t], mode: 'close' }) }} title="Close with a note — moves it to the Closed history"><i className="mdi mdi-archive-check-outline"></i>Close</button>}
                                                    {draggable && <select className="pw-move" value={t.status} onClick={(e) => e.stopPropagation()} onChange={(e) => move(t, e.target.value)} aria-label="Move task">{TASK_COLUMNS.map((s) => <option key={s}>{s}</option>)}</select>}
                                                </div>
                                            </article>
                                        )
                                    })}
                                    {!items.length && <p className="pw-col-empty">{drag ? 'Drop here' : 'No tasks'}</p>}
                                    {!closed && (w.canManage || w.isMember) && <button type="button" className="pw-quick" onClick={() => setModal({ newStatus: col })}><i className="mdi mdi-plus"></i>Add task</button>}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {view === 'list' && (
                <section className="pp-card pw-list">
                    {!shown.length ? <EmptyState icon="mdi-format-list-checks" title="No tasks here" /> : (
                        <ul>
                            {[...shown].sort((a, b) => (a.status === 'Done') - (b.status === 'Done') || new Date(a.dueDate || 8.64e15) - new Date(b.dueDate || 8.64e15)).map((t) => (
                                <li key={t._id} onClick={() => setModal({ task: t })} className={t.status === 'Done' ? 'done' : ''}>
                                    <button type="button" className="pw-tick" disabled={!canEditTask(t)} onClick={(e) => { e.stopPropagation(); move(t, t.status === 'Done' ? 'To Do' : 'Done') }} aria-label={t.status === 'Done' ? 'Reopen' : 'Mark done'}><i className={`mdi ${t.status === 'Done' ? 'mdi-checkbox-marked-circle' : 'mdi-checkbox-blank-circle-outline'}`}></i></button>
                                    <span className="pw-list-main"><b>{t.taskNo ? <span className="pw-tno">{taskTag(t)}</span> : null}{t.title}</b><small><span className="pw-dotstatus" style={{ '--c': TASK_STATUS[t.status]?.color }}></span>{t.status}{t.labels?.length ? ` · ${t.labels.join(', ')}` : ''}</small></span>
                                    {t.dueDate && <DueTag date={t.dueDate} done={t.status === 'Done'} />}
                                    {t.assignedTo ? <Avatar person={t.assignedTo} size={26} /> : <span className="pw-who none">—</span>}
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            )}

            {view === 'team' && (
                <section className="pp-card pw-team">
                    {members.map((m) => {
                        const t = w.team.find((x) => (x.employee?._id || x.employee) === m._id)
                        const open = tasks.filter((x) => (x.assignedTo?._id || x.assignedTo) === m._id && x.status !== 'Done').length
                        const finished = tasks.filter((x) => (x.assignedTo?._id || x.assignedTo) === m._id && x.status === 'Done').length
                        const running = w.logs.find((l) => l.running && (l.employeeId?._id || l.employeeId) === m._id)
                        return (
                            <div key={m._id} className="pw-member">
                                <Avatar person={m} size={42} />
                                <span className="pw-member-main"><b>{fullName(m)}{m._id === p.projectManager?._id && <em>Lead</em>}</b><small>{m.designation || ''}</small></span>
                                <span className="pw-member-stat"><b>{open}</b>open</span>
                                <span className="pw-member-stat"><b>{finished}</b>done</span>
                                <span className="pw-member-stat"><b>{hm(t?.minutes || 0)}</b>logged</span>
                                {running ? <span className="pw-live"><i className="pw-dot"></i>Working now</span> : <span className="pw-member-last">{t?.last ? `Last ${fmtDay(t.last)}` : 'No time yet'}</span>}
                            </div>
                        )
                    })}
                </section>
            )}

            {view === 'time' && (
                <section className="pp-card pw-time">
                    {!w.logs.length ? <EmptyState icon="mdi-timer-off-outline" title="No time logged yet" text="Team members start the work timer above — the time and place are recorded here." /> : (
                        <ul>
                            {w.logs.map((l) => (
                                <li key={l._id}>
                                    <Avatar person={l.employeeId} size={34} />
                                    <span className="pw-time-main">
                                        <b>{fullName(l.employeeId)}{l.taskId?.title ? <small> · {l.taskId.title}</small> : null}</b>
                                        <small>{fmtDay(l.startTime)} · {fmtTime(l.startTime)} → {l.running ? <span className="pw-now">running</span> : fmtTime(l.endTime)}</small>
                                        <span className="pw-time-places"><span className="pw-tp">Start</span><PlaceLink place={l.startLocation} />{!l.running && <><span className="pw-tp">Stop</span><PlaceLink place={l.stopLocation} /></>}</span>
                                        {l.note && <em className="pw-note">“{l.note}”</em>}
                                    </span>
                                    <b className="pw-dur">{hm(l.minutes)}</b>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            )}

            {view === 'closed' && (() => {
                const q = cq.trim().toLowerCase()
                const list = (w.closedTasks || []).filter((t) => !q || `${taskTag(t)} ${t.title} ${t.closeNote} ${fullName(t.assignedTo)}`.toLowerCase().includes(q))
                return (
                    <section className="pp-card pw-closed">
                        <div className="pw-closed-head">
                            <div><b>Closed tasks</b><br /><small>Finished work, closed with a note. Reopen anything that needs more work.</small></div>
                            <div className="pp-search"><i className="mdi mdi-magnify"></i><input type="search" className="pp-input" value={cq} onChange={(e) => setCq(e.target.value)} placeholder="Search closed tasks…" /></div>
                        </div>
                        {!list.length ? <EmptyState icon="mdi-archive-outline" title={(w.closedTasks || []).length ? 'No closed task matches' : 'Nothing closed yet'} text="When a Done task is closed it moves here with its closing note." /> : (
                            <ul>{list.map((t) => (
                                <li key={t._id}>
                                    <span className="pw-closed-ic"><i className="mdi mdi-archive-check-outline"></i></span>
                                    <div className="pw-closed-main">
                                        <b><span className="pw-tno">{taskTag(t)}</span>{t.title}</b>
                                        <small>{t.assignedTo ? fullName(t.assignedTo) : 'Unassigned'}{t.loggedMinutes ? ` · ${hm(t.loggedMinutes)} logged` : ''} · closed {fmtDay(t.closedAt)}{t.closedBy ? ` by ${fullName(t.closedBy)}` : ''}</small>
                                        {t.closeNote && <q>{t.closeNote}</q>}
                                    </div>
                                    {(w.canManage || w.isMember) && <button type="button" className="pw-reopen" onClick={() => setClosing({ tasks: [t], mode: 'reopen' })}><i className="mdi mdi-restore"></i>Reopen</button>}
                                </li>
                            ))}</ul>
                        )}
                    </section>
                )
            })()}

            {view === 'details' && (
                <section className="pp-card pw-details">
                    <h3>About this project</h3>
                    <p>{p.description || 'No description yet.'}</p>
                    <dl>
                        <div><dt>Code</dt><dd>{p.projectCode}</dd></div>
                        <div><dt>Client</dt><dd>{p.clientName || 'Internal'}</dd></div>
                        <div><dt>Lead</dt><dd>{fullName(p.projectManager)}</dd></div>
                        <div><dt>Team</dt><dd>{(p.teamMembers || []).map(fullName).join(', ') || '—'}</dd></div>
                        <div><dt>Dates</dt><dd>{fmtDay(p.startDate)} → {fmtDay(p.endDate)}</dd></div>
                        <div><dt>Estimate</dt><dd>{p.estimatedHours ? `${p.estimatedHours} hours` : '—'}</dd></div>
                        <div><dt>Work mode</dt><dd>{p.workMode || 'Office'}</dd></div>
                        <div><dt>Site</dt><dd>{[p.location?.siteName, p.location?.address].filter(Boolean).join(' · ') || '—'}</dd></div>
                        <div><dt>Created</dt><dd>{fmtDay(p.createdAt)}{p.createdBy ? ` by ${fullName(p.createdBy)}` : ''}</dd></div>
                    </dl>
                </section>
            )}

            {closing && <CloseTaskModal tasks={closing.tasks} mode={closing.mode} onClose={() => setClosing(null)} onDone={(msg) => { setClosing(null); toast.success(msg, { title: closing.mode === 'reopen' ? 'Task reopened' : 'Closed' }); load() }} />}
            {modal && <TaskModal task={modal.task} defaultStatus={modal.newStatus} project={p} members={members} me={me} canManage={w.canManage} onClose={() => setModal(null)} onSaved={upsertTask} onDeleted={(tid) => { setW((x) => ({ ...x, tasks: x.tasks.filter((t) => t._id !== tid) })); setModal(null); toast.success('The task was removed from this project.', { title: 'Task deleted' }) }} />}
            {editing && <ProjectForm project={p} people={people.length ? people : members} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); toast.success('Project details are updated.', { title: 'Project saved' }); load() }} />}
        </PeopleShell>
    )
}
