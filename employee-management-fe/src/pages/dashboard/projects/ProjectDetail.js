import React, { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link, useParams } from 'react-router-dom'
import projectActions from '../../../redux/project/Actions'
import taskActions from '../../../redux/task/Actions'
import employeeActions from '../../../redux/employee/Actions'
import { PeopleShell, Avatar, ProgressRing, EmptyState, ErrorBanner, fullName, fmtDate } from '../../../components/people/PeopleUI'
import { money } from '../../../components/payroll/PayrollUI'
import {
    PROJECTS_ROOT, PROJECT_STATUS, TASK_STATUS, TASK_COLUMNS, PriorityTag, TaskStatus, DueTag, PeoplePicker,
    projectStatusMeta, taskStatusMeta, isOverdue, startOfDay,
} from '../../../components/projects/ProjectUI'
import { TaskDetailModal } from './TaskDetailModal'
import '../../../components/attendance/attendance.css'
import './ProjectDetail.css'
import { useAccess } from '../../../hooks/useAccess'

const FORMER = ['Resigned', 'Terminated']

export const ProjectDetail = () => {
    const { id } = useParams()
    const dispatch = useDispatch()
    const { detail: project, error } = useSelector((state) => state.projectReducer || {})
    const { list: allTasks } = useSelector((state) => state.taskReducer || {})
    const { list: employees } = useSelector((state) => state.employeeReducer || {})
    const { can } = useAccess()
    const canManage = can(['Admin', 'HR', 'Manager', 'Team Lead'], 'projects')
    const [tab, setTab] = useState('overview')
    const [toAdd, setToAdd] = useState([])
    const [openTask, setOpenTask] = useState(null)
    const [taskFilter, setTaskFilter] = useState('')

    useEffect(() => {
        dispatch({ type: projectActions.GET_PROJECT_BY_ID, id })
        dispatch({ type: taskActions.GET_TASKS })
        dispatch({ type: employeeActions.GET_EMPLOYEES })
        return () => dispatch({ type: projectActions.CLEAR_PROJECT_DETAIL })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id])

    const projectTasks = useMemo(() => (allTasks || []).filter((t) => (t.projectId?._id || t.projectId) === id), [allTasks, id])
    const total = projectTasks.length
    const done = projectTasks.filter((t) => t.status === 'Done').length
    const overdue = projectTasks.filter(isOverdue).length
    const pct = total ? Math.round((done / total) * 100) : 0
    const byStatus = TASK_COLUMNS.map((s) => ({ s, n: projectTasks.filter((t) => t.status === s).length }))

    const onAddMembers = () => {
        toAdd.forEach((employeeId) => dispatch({ type: projectActions.ADD_PROJECT_MEMBER, id, employeeId }))
        setToAdd([])
    }

    const onRemoveMember = (m) => {
        if (window.confirm(`Remove ${fullName(m)} from this project?`)) dispatch({ type: projectActions.REMOVE_PROJECT_MEMBER, id, employeeId: m._id })
    }

    const onStatus = (status) => dispatch({ type: projectActions.UPDATE_PROJECT, id, payload: { status } })

    if (!project) {
        return (
            <PeopleShell title="Project" root={PROJECTS_ROOT} crumbs={[{ label: 'Project' }]} backTo="/projects">
                <ErrorBanner error={error} />
                {!error && <div className="pp-card pp-card-body"><div className="pp-skel" style={{ height: 200 }}></div></div>}
            </PeopleShell>
        )
    }

    const m = projectStatusMeta(project.status)
    const members = project.teamMembers || []
    const available = (employees || []).filter((e) => !FORMER.includes(e.status))
    const memberIds = members.map((x) => x._id)

    // Time elapsed between start and deadline, to compare with work done.
    const start = project.startDate ? startOfDay(project.startDate) : null
    const end = project.endDate ? startOfDay(project.endDate) : null
    const now = startOfDay(Date.now())
    const elapsed = start && end && end > start ? Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100)) : null
    const closed = ['Completed', 'Cancelled'].includes(project.status)
    const health = closed ? null
        : end && now > end ? { text: 'Past deadline', color: '#e11d48', icon: 'mdi-alert-circle-outline' }
            : elapsed !== null && total && pct + 15 < elapsed ? { text: 'At risk', color: '#d97706', icon: 'mdi-alert-outline' }
                : elapsed !== null ? { text: 'On track', color: '#059669', icon: 'mdi-check-circle-outline' } : null

    const openFor = (memberId) => projectTasks.filter((t) => t.assignedTo?._id === memberId && t.status !== 'Done').length
    const visibleTasks = (taskFilter ? projectTasks.filter((t) => t.status === taskFilter) : projectTasks)
        .slice().sort((a, b) => TASK_COLUMNS.indexOf(a.status) - TASK_COLUMNS.indexOf(b.status) || new Date(a.dueDate || 8.64e15) - new Date(b.dueDate || 8.64e15))

    return (
        <PeopleShell
            title={project.projectName}
            root={PROJECTS_ROOT}
            crumbs={[{ label: 'All projects', to: '/projects' }, { label: project.projectName }]}
            backTo="/projects"
            actions={<Link to="/tasks" state={{ projectId: id }} className="pp-btn primary"><i className="mdi mdi-plus"></i> Add task</Link>}
        >
            <ErrorBanner error={error} />

            <section className="pp-card pd-head" style={{ '--c': m.color }}>
                <div>
                    <span className="pd-code">{project.projectCode}</span>
                    <h2>{project.projectName}</h2>
                    <p>{project.description || 'No description yet.'}</p>
                    <div className="pd-tags">
                        {canManage ? (
                            <select className="pp-select pd-status-select" value={project.status} onChange={(e) => onStatus(e.target.value)} aria-label="Project status">
                                {Object.keys(PROJECT_STATUS).map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                        ) : <span className="pj-pill" style={{ '--c': m.color }}><i className={`mdi ${m.icon}`}></i>{project.status}</span>}
                        {project.priority && <PriorityTag priority={project.priority} />}
                        {health && <span className="pd-health" style={{ '--h': health.color }}><i className={`mdi ${health.icon}`}></i>{health.text}</span>}
                    </div>
                </div>
                <div className="pd-ring">
                    <ProgressRing value={pct} size={96} stroke={9} color={m.color} />
                    <small>{done}/{total} tasks done</small>
                </div>

                {start && end && (
                    <div className="pd-time">
                        <div className="pd-time-head">
                            <span><b>{Math.round(elapsed)}%</b> of time used · <b>{pct}%</b> of tasks done</span>
                            <span>{end >= now ? `${Math.round((end - now) / 864e5)} days to deadline` : `${Math.round((now - end) / 864e5)} days past deadline`}</span>
                        </div>
                        <div className="pd-track" aria-hidden="true">
                            <span className="elapsed" style={{ width: `${elapsed}%` }}></span>
                            <span className="done" style={{ width: `calc(${pct}% - 4px)` }}></span>
                            {now >= start && now <= end && <i className="pd-today" style={{ left: `${elapsed}%` }}></i>}
                        </div>
                        <div className="pd-dates"><span>{fmtDate(project.startDate)}</span><span>{fmtDate(project.endDate)}</span></div>
                    </div>
                )}
            </section>

            <div className="at-tiles">
                <div className="at-tile" style={{ '--c': '#059669' }}><span className="at-tile-icon"><i className="mdi mdi-check-all"></i></span><div><b>{done}/{total}</b><span>Tasks done</span></div></div>
                <div className="at-tile" style={{ '--c': overdue ? '#e11d48' : '#64748b' }}><span className="at-tile-icon"><i className="mdi mdi-alert-circle-outline"></i></span><div><b>{overdue}</b><span>Overdue tasks</span></div></div>
                <div className="at-tile" style={{ '--c': '#7c3aed' }}><span className="at-tile-icon"><i className="mdi mdi-account-group-outline"></i></span><div><b>{members.length}</b><span>Team members</span></div></div>
                <div className="at-tile" style={{ '--c': '#0284c7' }}><span className="at-tile-icon"><i className="mdi mdi-wallet-outline"></i></span><div><b>{project.budget ? money(project.budget) : '—'}</b><span>Budget</span></div></div>
            </div>

            <section className="pp-card">
                <div className="pd-tabs" role="tablist">
                    {[
                        { k: 'overview', label: 'Overview', icon: 'mdi-view-dashboard-outline' },
                        { k: 'team', label: 'Team', icon: 'mdi-account-group-outline', n: members.length },
                        { k: 'tasks', label: 'Tasks', icon: 'mdi-format-list-checks', n: total },
                    ].map((t) => (
                        <button key={t.k} type="button" role="tab" aria-selected={tab === t.k} className={`pd-tab ${tab === t.k ? 'active' : ''}`} onClick={() => setTab(t.k)}>
                            <i className={`mdi ${t.icon}`}></i>{t.label}{t.n !== undefined && <b>{t.n}</b>}
                        </button>
                    ))}
                </div>

                <div className="pd-panel">
                    {tab === 'overview' && (
                        <>
                            <div className="pd-facts">
                                <div className="pd-fact" style={{ '--c': '#0b0f19' }}><span><i className="mdi mdi-account-tie-outline"></i>Manager</span><b>{fullName(project.projectManager)}</b></div>
                                <div className="pd-fact" style={{ '--c': '#0284c7' }}><span><i className="mdi mdi-domain"></i>Client</span><b>{project.clientName || 'Internal'}</b></div>
                                <div className="pd-fact" style={{ '--c': '#059669' }}><span><i className="mdi mdi-calendar-start"></i>Start</span><b>{fmtDate(project.startDate)}</b></div>
                                <div className="pd-fact" style={{ '--c': '#e11d48' }}><span><i className="mdi mdi-flag-checkered"></i>Deadline</span><b>{fmtDate(project.endDate)}</b></div>
                            </div>
                            <h4 className="pd-breakdown-title">Tasks by status</h4>
                            {!total ? <p className="pp-muted-dash mb-0">No tasks yet — <Link to="/tasks" state={{ projectId: id }} style={{ color: '#0284c7', fontWeight: 600 }}>add the first one</Link>.</p> : (
                                <>
                                    <div className="pd-bar" aria-hidden="true">
                                        {byStatus.map(({ s, n }) => n > 0 && <span key={s} style={{ width: `${(n / total) * 100}%`, background: taskStatusMeta(s).color }}></span>)}
                                    </div>
                                    <div className="pd-legend">
                                        {byStatus.map(({ s, n }) => <span key={s} style={{ '--c': TASK_STATUS[s].color }}><i></i>{s} <b>{n}</b></span>)}
                                    </div>
                                </>
                            )}
                        </>
                    )}

                    {tab === 'team' && (
                        <>
                            {canManage && (
                                <div className="pd-add">
                                    <PeoplePicker people={available} value={toAdd} onChange={setToAdd} exclude={memberIds} placeholder="Add people to this project…" />
                                    <button type="button" className="pp-btn primary" onClick={onAddMembers} disabled={!toAdd.length}><i className="mdi mdi-account-plus-outline"></i> Add</button>
                                </div>
                            )}
                            {!members.length ? <EmptyState icon="mdi-account-group-outline" title="No team members yet" text={canManage ? 'Search above to add people.' : 'Team members will appear here.'} /> : (
                                <div className="pd-team">
                                    {members.map((mb) => (
                                        <div key={mb._id} className="pd-member">
                                            <Avatar person={mb} size={40} />
                                            <div className="pd-member-main">
                                                <Link to={`/employees/${mb._id}`}>{fullName(mb)}</Link>
                                                <small>{openFor(mb._id)} open task{openFor(mb._id) === 1 ? '' : 's'}</small>
                                                {project.projectManager?._id === mb._id && <div className="pd-role">Project manager</div>}
                                            </div>
                                            {canManage && (
                                                <button type="button" className="pd-remove" onClick={() => onRemoveMember(mb)} title="Remove from project" aria-label={`Remove ${fullName(mb)}`}>
                                                    <i className="mdi mdi-account-remove-outline"></i>
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                    {tab === 'tasks' && (
                        <>
                            <div className="pd-task-head">
                                <div className="pj-filters">
                                    <button type="button" className={`pj-filter ${!taskFilter ? 'active' : ''}`} style={{ '--c': '#0b0f19' }} onClick={() => setTaskFilter('')}>All <b>{total}</b></button>
                                    {byStatus.filter((x) => x.n).map(({ s, n }) => (
                                        <button key={s} type="button" className={`pj-filter ${taskFilter === s ? 'active' : ''}`} style={{ '--c': TASK_STATUS[s].color }} onClick={() => setTaskFilter(taskFilter === s ? '' : s)}>
                                            <i className={`mdi ${TASK_STATUS[s].icon}`}></i>{s} <b>{n}</b>
                                        </button>
                                    ))}
                                </div>
                                <Link to="/tasks" className="pp-btn sm"><i className="mdi mdi-view-column-outline"></i> Open board</Link>
                            </div>
                            {!visibleTasks.length ? <EmptyState icon="mdi-format-list-checks" title="No tasks here" text="Tasks linked to this project will show up here." /> : (
                                <div>
                                    {visibleTasks.map((t) => (
                                        <button key={t._id} type="button" className="pd-task" style={{ '--c': taskStatusMeta(t.status).color }} onClick={() => setOpenTask(t._id)}>
                                            <span className="pd-task-dot"></span>
                                            <span className="pd-task-main">
                                                <b>{t.title}</b>
                                                <small><PriorityTag priority={t.priority} /><DueTag date={t.dueDate} done={t.status === 'Done'} />{t.comments?.length > 0 && <span><i className="mdi mdi-comment-outline"></i> {t.comments.length}</span>}</small>
                                            </span>
                                            {t.assignedTo ? <Avatar person={t.assignedTo} size={28} /> : <span className="pp-muted-dash hide-sm" style={{ fontSize: 12 }}>Unassigned</span>}
                                            <span className="hide-sm"><TaskStatus status={t.status} /></span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </section>

            {openTask && <TaskDetailModal taskId={openTask} onClose={() => setOpenTask(null)} />}
        </PeopleShell>
    )
}
