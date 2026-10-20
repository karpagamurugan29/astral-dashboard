import React, { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import projectActions from '../../../redux/project/Actions'
import taskActions from '../../../redux/task/Actions'
import employeeActions from '../../../redux/employee/Actions'
import { PeopleShell, Avatar, ProgressRing, EmptyState, ErrorBanner, fullName } from '../../../components/people/PeopleUI'
import { CURRENCY } from '../../../components/payroll/PayrollUI'
import {
    PROJECTS_ROOT, PROJECT_STATUS, PRIORITY, ProjectStatus, PriorityTag, projectStatusMeta, AvatarStack, PeoplePicker, progressOf, startOfDay,
} from '../../../components/projects/ProjectUI'
import '../../../components/attendance/attendance.css'
import './ProjectsList.css'

const DAY = 24 * 60 * 60 * 1000
const FORMER = ['Resigned', 'Terminated']
const BLANK = { projectCode: '', projectName: '', clientName: '', description: '', projectManager: '', priority: 'Medium', startDate: '', endDate: '', budget: '' }

const deadline = (p) => {
    if (!p.endDate || ['Completed', 'Cancelled'].includes(p.status)) return null
    const days = Math.round((startOfDay(p.endDate) - startOfDay(Date.now())) / DAY)
    if (days < 0) return { text: `${-days}d past deadline`, color: '#e11d48', icon: 'mdi-alert-circle-outline' }
    if (days === 0) return { text: 'Due today', color: '#d97706', icon: 'mdi-flag-checkered' }
    if (days <= 14) return { text: `${days}d left`, color: '#d97706', icon: 'mdi-timer-sand' }
    return { text: `Ends ${new Date(p.endDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`, color: '#64748b', icon: 'mdi-flag-outline' }
}

const SORTS = {
    deadline: { label: 'Deadline', fn: (a, b) => new Date(a.endDate || 8.64e15) - new Date(b.endDate || 8.64e15) },
    name: { label: 'Name', fn: (a, b) => a.projectName.localeCompare(b.projectName) },
    progress: { label: 'Least progress', fn: (a, b, tasks) => progressOf(a, tasks).pct - progressOf(b, tasks).pct },
}

export const ProjectsList = () => {
    const dispatch = useDispatch()
    const { list, error } = useSelector((state) => state.projectReducer || {})
    const { list: tasks } = useSelector((state) => state.taskReducer || {})
    const { list: employees } = useSelector((state) => state.employeeReducer || {})
    const { isAuthenticated: user } = useSelector((state) => state.authReducer || {})
    const canManage = ['Admin', 'HR', 'Manager', 'Team Lead'].includes(user?.role)
    const { register, handleSubmit, reset, watch, formState: { errors } } = useForm({ defaultValues: BLANK })
    const [team, setTeam] = useState([])
    const [creating, setCreating] = useState(false)
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('')
    const [sort, setSort] = useState('deadline')

    useEffect(() => {
        dispatch({ type: projectActions.GET_PROJECTS })
        dispatch({ type: taskActions.GET_TASKS })
        dispatch({ type: employeeActions.GET_EMPLOYEES })
    }, [dispatch])

    const onSubmit = (data) => {
        const payload = { ...data, teamMembers: team, budget: data.budget === '' ? undefined : Number(data.budget) }
        dispatch({ type: projectActions.ADD_PROJECT, payload })
        reset(BLANK)
        setTeam([])
        setCreating(false)
    }

    const onCancel = () => { reset(BLANK); setTeam([]); setCreating(false) }

    const onDelete = (p) => {
        if (window.confirm(`Archive project "${p.projectName}"? It will be hidden from everyone's project list.`)) {
            dispatch({ type: projectActions.DELETE_PROJECT, id: p._id })
        }
    }

    const all = useMemo(() => list || [], [list])
    const people = useMemo(() => (employees || []).filter((e) => !FORMER.includes(e.status)), [employees])
    const counts = useMemo(() => Object.fromEntries(Object.keys(PROJECT_STATUS).map((s) => [s, all.filter((p) => p.status === s).length])), [all])
    const late = all.filter((p) => p.endDate && !['Completed', 'Cancelled'].includes(p.status) && startOfDay(p.endDate) < startOfDay(Date.now())).length

    const rows = useMemo(() => {
        const q = search.trim().toLowerCase()
        return all
            .filter((p) => !statusFilter || p.status === statusFilter)
            .filter((p) => !q || `${p.projectName} ${p.projectCode} ${p.clientName || ''} ${fullName(p.projectManager)}`.toLowerCase().includes(q))
            .sort((a, b) => SORTS[sort].fn(a, b, tasks))
    }, [all, statusFilter, search, sort, tasks])

    const startDate = watch('startDate')

    return (
        <PeopleShell
            title="Projects"
            root={PROJECTS_ROOT}
            crumbs={[{ label: 'All projects' }]}
            actions={<>
                <Link to="/tasks" className="pp-btn"><i className="mdi mdi-view-column-outline"></i> Task board</Link>
                {canManage && !creating && <button type="button" className="pp-btn primary" onClick={() => setCreating(true)}><i className="mdi mdi-plus"></i> New project</button>}
            </>}
        >
            <ErrorBanner error={error} />

            <div className="at-tiles">
                <div className="at-tile" style={{ '--c': '#0284c7' }}>
                    <span className="at-tile-icon"><i className="mdi mdi-rocket-launch-outline"></i></span>
                    <div><b>{counts.Active}</b><span>Active</span></div>
                </div>
                <div className="at-tile" style={{ '--c': '#64748b' }}>
                    <span className="at-tile-icon"><i className="mdi mdi-pencil-ruler"></i></span>
                    <div><b>{counts.Planning}</b><span>In planning</span></div>
                </div>
                <div className="at-tile" style={{ '--c': '#059669' }}>
                    <span className="at-tile-icon"><i className="mdi mdi-check-decagram"></i></span>
                    <div><b>{counts.Completed}</b><span>Completed</span></div>
                </div>
                <div className="at-tile" style={{ '--c': late ? '#e11d48' : '#64748b' }}>
                    <span className="at-tile-icon"><i className="mdi mdi-alert-circle-outline"></i></span>
                    <div><b>{late}</b><span>Past deadline</span></div>
                </div>
            </div>

            {canManage && creating && (
                <form className="pp-card pj-panel" onSubmit={handleSubmit(onSubmit)} noValidate>
                    <div className="pp-card-head">
                        <h3><i className="mdi mdi-folder-plus-outline me-2" style={{ color: '#0284c7' }}></i>New project</h3>
                        <button type="button" className="pp-btn icon ghost" onClick={onCancel} aria-label="Close"><i className="mdi mdi-close"></i></button>
                    </div>
                    <div className="pp-card-body">
                        <div className="pj-form-grid">
                            <div className="pp-field">
                                <label className="pp-label">Code<span className="req">*</span></label>
                                <input type="text" autoFocus placeholder="e.g. HRM-24" className={`pp-input ${errors.projectCode ? 'is-invalid' : ''}`} {...register('projectCode', { required: 'Required' })} />
                                {errors.projectCode && <div className="pp-err">{errors.projectCode.message}</div>}
                            </div>
                            <div className="pp-field span-2">
                                <label className="pp-label">Project name<span className="req">*</span></label>
                                <input type="text" placeholder="e.g. Mobile app relaunch" className={`pp-input ${errors.projectName ? 'is-invalid' : ''}`} {...register('projectName', { required: 'Give the project a name' })} />
                                {errors.projectName && <div className="pp-err">{errors.projectName.message}</div>}
                            </div>
                            <div className="pp-field">
                                <label className="pp-label">Client</label>
                                <input type="text" placeholder="Internal" className="pp-input" {...register('clientName')} />
                            </div>
                            <div className="pp-field">
                                <label className="pp-label">Project manager<span className="req">*</span></label>
                                <select className={`pp-select ${errors.projectManager ? 'is-invalid' : ''}`} {...register('projectManager', { required: 'Pick a manager' })}>
                                    <option value="">Select</option>
                                    {people.map((e) => <option key={e._id} value={e._id}>{fullName(e)}</option>)}
                                </select>
                                {errors.projectManager && <div className="pp-err">{errors.projectManager.message}</div>}
                            </div>
                            <div className="pp-field">
                                <label className="pp-label">Priority</label>
                                <select className="pp-select" {...register('priority')}>
                                    {Object.keys(PRIORITY).map((p) => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </div>
                            <div className="pp-field">
                                <label className="pp-label">Start<span className="req">*</span></label>
                                <input type="date" className={`pp-input ${errors.startDate ? 'is-invalid' : ''}`} {...register('startDate', { required: 'Required' })} />
                            </div>
                            <div className="pp-field">
                                <label className="pp-label">Deadline<span className="req">*</span></label>
                                <input type="date" min={startDate || undefined} className={`pp-input ${errors.endDate ? 'is-invalid' : ''}`}
                                    {...register('endDate', { required: 'Required', validate: (v) => !startDate || !v || v >= startDate || 'Must be after the start' })} />
                                {errors.endDate && <div className="pp-err">{errors.endDate.message}</div>}
                            </div>
                            <div className="pp-field span-2">
                                <label className="pp-label">Team</label>
                                <PeoplePicker people={people} value={team} onChange={setTeam} placeholder="Add team members…" />
                            </div>
                            <div className="pp-field">
                                <label className="pp-label">Budget ({CURRENCY})</label>
                                <input type="number" min="0" placeholder="Optional" className="pp-input" {...register('budget')} />
                            </div>
                            <div className="pp-field span-4">
                                <label className="pp-label">Description</label>
                                <textarea rows={2} placeholder="What is this project about?" className="pp-input" {...register('description')}></textarea>
                            </div>
                        </div>
                        <div className="pj-form-foot">
                            <button type="button" className="pp-btn" onClick={onCancel}>Cancel</button>
                            <button type="submit" className="pp-btn primary"><i className="mdi mdi-check"></i> Create project</button>
                        </div>
                    </div>
                </form>
            )}

            <div className="pl-toolbar">
                <div className="pp-search">
                    <i className="mdi mdi-magnify"></i>
                    <input type="search" className="pp-input" placeholder="Search projects…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search projects" />
                </div>
                <div className="pj-filters">
                    <button type="button" className={`pj-filter ${!statusFilter ? 'active' : ''}`} style={{ '--c': '#0b0f19' }} onClick={() => setStatusFilter('')}>All <b>{all.length}</b></button>
                    {Object.entries(PROJECT_STATUS).map(([s, m]) => counts[s] > 0 && (
                        <button key={s} type="button" className={`pj-filter ${statusFilter === s ? 'active' : ''}`} style={{ '--c': m.color }} onClick={() => setStatusFilter(statusFilter === s ? '' : s)}>
                            <i className={`mdi ${m.icon}`}></i>{s} <b>{counts[s]}</b>
                        </button>
                    ))}
                </div>
                <div className="at-spacer"></div>
                <select className="pp-select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort projects">
                    {Object.entries(SORTS).map(([k, s]) => <option key={k} value={k}>Sort: {s.label}</option>)}
                </select>
            </div>

            {!rows.length ? (
                <div className="pp-card">
                    <EmptyState icon="mdi-folder-outline" title={all.length ? 'No projects match' : 'No projects yet'}
                        text={all.length ? 'Try a different search or status.' : canManage ? 'Create a project to organise tasks and people.' : 'Projects you are part of will show up here.'}
                        action={canManage && !all.length && <button type="button" className="pp-btn primary" onClick={() => setCreating(true)}><i className="mdi mdi-plus"></i> New project</button>} />
                </div>
            ) : (
                <div className="pl-grid">
                    {rows.map((p) => {
                        const m = projectStatusMeta(p.status)
                        const prog = progressOf(p, tasks)
                        const dl = deadline(p)
                        return (
                            <article key={p._id} className="pp-card pl-card" style={{ '--c': m.color }}>
                                <div className="pl-top">
                                    <div className="pl-titles">
                                        <span className="pl-code">{p.projectCode}</span>
                                        <h3><Link to={`/projects/${p._id}`}>{p.projectName}</Link></h3>
                                        <span className="pl-client">{p.clientName || 'Internal'}</span>
                                    </div>
                                    <ProgressRing value={prog.pct} size={52} stroke={5} color={m.color} />
                                </div>

                                <p className="pl-desc">{p.description || <span className="pp-muted-dash">No description</span>}</p>

                                <div className="pl-tags">
                                    <ProjectStatus status={p.status} />
                                    {p.priority && <PriorityTag priority={p.priority} />}
                                    {dl && <span className="pp-tag" style={{ '--tag': dl.color }}><i className={`mdi ${dl.icon}`}></i>{dl.text}</span>}
                                </div>

                                <div className="pl-progress">
                                    <div className="pl-progress-head">
                                        <span>{prog.total ? <><b>{prog.done}</b> of {prog.total} tasks done</> : 'No tasks yet'}</span>
                                        {prog.overdue > 0 && <span style={{ color: '#e11d48', fontWeight: 600 }}>{prog.overdue} overdue</span>}
                                    </div>
                                    <div className="pl-track"><span style={{ width: `${prog.pct}%` }}></span></div>
                                </div>

                                <div className="pl-foot">
                                    <span className="pl-mgr"><Avatar person={p.projectManager} size={24} /><span><b>{fullName(p.projectManager)}</b></span></span>
                                    <AvatarStack people={p.teamMembers || []} max={4} size={26} />
                                    {canManage && (
                                        <button type="button" className="pl-archive" onClick={() => onDelete(p)} title="Archive project" aria-label={`Archive ${p.projectName}`}>
                                            <i className="mdi mdi-archive-outline"></i>
                                        </button>
                                    )}
                                </div>
                            </article>
                        )
                    })}
                </div>
            )}
        </PeopleShell>
    )
}
