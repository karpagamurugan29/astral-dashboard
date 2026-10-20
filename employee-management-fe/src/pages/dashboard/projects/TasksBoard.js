import React, { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useForm } from 'react-hook-form'
import { useLocation } from 'react-router-dom'
import taskActions from '../../../redux/task/Actions'
import projectActions from '../../../redux/project/Actions'
import employeeActions from '../../../redux/employee/Actions'
import { PeopleShell, Avatar, ErrorBanner, fullName } from '../../../components/people/PeopleUI'
import { PROJECTS_ROOT, TASK_STATUS, TASK_COLUMNS, PRIORITY, priorityMeta, DueTag, isOverdue } from '../../../components/projects/ProjectUI'
import { TaskDetailModal } from './TaskDetailModal'
import '../../../components/attendance/attendance.css'
import './TasksBoard.css'
import { useAccess } from '../../../hooks/useAccess'

const FORMER = ['Resigned', 'Terminated']
const TASK_PRIORITIES = ['Low', 'Medium', 'High']

export const TasksBoard = () => {
    const dispatch = useDispatch()
    const location = useLocation()
    const { list, error } = useSelector((state) => state.taskReducer || {})
    const { list: projects } = useSelector((state) => state.projectReducer || {})
    const { list: employees } = useSelector((state) => state.employeeReducer || {})
    const { isAuthenticated: user } = useSelector((state) => state.authReducer || {})
    const { can } = useAccess()
    const canCreate = can(['Admin', 'HR', 'Manager', 'Team Lead'], 'tasks')
    const presetProject = location.state?.projectId || ''
    const blank = { title: '', projectId: presetProject, assignedTo: '', priority: 'Medium', dueDate: '', description: '' }
    const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({ defaultValues: blank })

    const [creating, setCreating] = useState(Boolean(presetProject) && canCreate)
    const [search, setSearch] = useState('')
    const [priorityFilter, setPriorityFilter] = useState('')
    const [assigneeFilter, setAssigneeFilter] = useState('')
    const [projectFilter, setProjectFilter] = useState(presetProject)
    const [myTasksOnly, setMyTasksOnly] = useState(false)
    const [overdueOnly, setOverdueOnly] = useState(false)
    const [selectedTaskId, setSelectedTaskId] = useState(null)
    const [dragOverCol, setDragOverCol] = useState(null)
    const [draggingId, setDraggingId] = useState(null)

    useEffect(() => {
        dispatch({ type: taskActions.GET_TASKS })
        dispatch({ type: projectActions.GET_PROJECTS })
        dispatch({ type: employeeActions.GET_EMPLOYEES })
    }, [dispatch])

    const onSubmit = (data) => {
        // Empty-string selects would fail ObjectId validation server-side — send null instead.
        dispatch({ type: taskActions.ADD_TASK, payload: { ...data, projectId: data.projectId || null, assignedTo: data.assignedTo || null } })
        reset({ ...blank, projectId: data.projectId })
    }

    const moveTask = (id, status) => dispatch({ type: taskActions.UPDATE_TASK_STATUS, id, status })

    const people = useMemo(() => (employees || []).filter((e) => !FORMER.includes(e.status)), [employees])

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        return (list || []).filter((t) => {
            if (q && !`${t.title} ${t.projectId?.projectName || ''}`.toLowerCase().includes(q)) return false
            if (priorityFilter && t.priority !== priorityFilter) return false
            if (assigneeFilter && t.assignedTo?._id !== assigneeFilter) return false
            if (projectFilter && (t.projectId?._id || t.projectId) !== projectFilter) return false
            if (myTasksOnly && t.assignedTo?._id !== user?._id) return false
            if (overdueOnly && !isOverdue(t)) return false
            return true
        })
    }, [list, search, priorityFilter, assigneeFilter, projectFilter, myTasksOnly, overdueOnly, user])

    const filtering = search || priorityFilter || assigneeFilter || projectFilter || myTasksOnly || overdueOnly
    const clearAll = () => { setSearch(''); setPriorityFilter(''); setAssigneeFilter(''); setProjectFilter(''); setMyTasksOnly(false); setOverdueOnly(false) }

    const overdueCount = (list || []).filter(isOverdue).length
    const mineCount = (list || []).filter((t) => t.assignedTo?._id === user?._id && t.status !== 'Done').length

    const onDragStart = (e, taskId) => {
        e.dataTransfer.setData('text/plain', taskId)
        setDraggingId(taskId)
    }

    const onDrop = (e, status) => {
        e.preventDefault()
        setDragOverCol(null)
        setDraggingId(null)
        const taskId = e.dataTransfer.getData('text/plain')
        const task = (list || []).find((t) => t._id === taskId)
        if (taskId && task?.status !== status) moveTask(taskId, status)
    }

    return (
        <PeopleShell
            title="Task board"
            root={PROJECTS_ROOT}
            crumbs={[{ label: 'Tasks' }]}
            actions={canCreate && !creating && <button type="button" className="pp-btn primary" onClick={() => setCreating(true)}><i className="mdi mdi-plus"></i> New task</button>}
        >
            <ErrorBanner error={error} />

            {canCreate && creating && (
                <form className="pp-card pj-panel" onSubmit={handleSubmit(onSubmit)} noValidate>
                    <div className="pp-card-head">
                        <h3><i className="mdi mdi-plus-circle-outline me-2" style={{ color: '#0284c7' }}></i>New task</h3>
                        <button type="button" className="pp-btn icon ghost" onClick={() => { reset(blank); setCreating(false) }} aria-label="Close"><i className="mdi mdi-close"></i></button>
                    </div>
                    <div className="pp-card-body">
                        <div className="pj-form-grid">
                            <div className="pp-field span-2">
                                <label className="pp-label">Title<span className="req">*</span></label>
                                <input type="text" autoFocus placeholder="What needs to be done?" className={`pp-input ${errors.title ? 'is-invalid' : ''}`} {...register('title', { required: 'Give the task a title' })} />
                                {errors.title && <div className="pp-err">{errors.title.message}</div>}
                            </div>
                            <div className="pp-field">
                                <label className="pp-label">Project</label>
                                <select className="pp-select" {...register('projectId')}>
                                    <option value="">No project</option>
                                    {projects?.map((p) => <option key={p._id} value={p._id}>{p.projectName}</option>)}
                                </select>
                            </div>
                            <div className="pp-field">
                                <label className="pp-label">Assignee</label>
                                <select className="pp-select" {...register('assignedTo')}>
                                    <option value="">Unassigned</option>
                                    {people.map((e) => <option key={e._id} value={e._id}>{fullName(e)}</option>)}
                                </select>
                            </div>
                            <div className="pp-field">
                                <label className="pp-label">Priority</label>
                                <select className="pp-select" {...register('priority')}>
                                    {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </div>
                            <div className="pp-field">
                                <label className="pp-label">Due date</label>
                                <input type="date" className="pp-input" {...register('dueDate')} />
                            </div>
                            <div className="pp-field span-2">
                                <label className="pp-label">Details</label>
                                <input type="text" placeholder="Optional notes" className="pp-input" {...register('description')} />
                            </div>
                        </div>
                        <div className="pj-form-foot">
                            <button type="button" className="pp-btn" onClick={() => { reset(blank); setCreating(false) }}>Done</button>
                            <button type="submit" className="pp-btn primary" disabled={isSubmitting}><i className="mdi mdi-plus"></i> Add task</button>
                        </div>
                    </div>
                </form>
            )}

            <div className="tb-toolbar">
                <div className="pp-search">
                    <i className="mdi mdi-magnify"></i>
                    <input type="search" className="pp-input" placeholder="Search tasks…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search tasks" />
                </div>
                <select className="pp-select" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} aria-label="Project">
                    <option value="">All projects</option>
                    {projects?.map((p) => <option key={p._id} value={p._id}>{p.projectName}</option>)}
                </select>
                <select className="pp-select" value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)} aria-label="Assignee">
                    <option value="">Everyone</option>
                    {people.map((e) => <option key={e._id} value={e._id}>{fullName(e)}</option>)}
                </select>
                <div className="pj-filters">
                    {TASK_PRIORITIES.map((p) => {
                        const m = PRIORITY[p]
                        return (
                            <button key={p} type="button" className={`pj-filter ${priorityFilter === p ? 'active' : ''}`} style={{ '--c': m.color }} onClick={() => setPriorityFilter(priorityFilter === p ? '' : p)}>
                                <i className={`mdi ${m.icon}`}></i>{p}
                            </button>
                        )
                    })}
                </div>
                <button type="button" className={`tb-toggle ${myTasksOnly ? 'active' : ''}`} style={{ '--c': '#0284c7' }} onClick={() => setMyTasksOnly((v) => !v)} aria-pressed={myTasksOnly}>
                    <i className="mdi mdi-account-check-outline"></i>My tasks {mineCount > 0 && `· ${mineCount}`}
                </button>
                <button type="button" className={`tb-toggle ${overdueOnly ? 'active' : ''}`} style={{ '--c': '#e11d48' }} onClick={() => setOverdueOnly((v) => !v)} aria-pressed={overdueOnly}>
                    <i className="mdi mdi-alert-circle-outline"></i>Overdue {overdueCount > 0 && `· ${overdueCount}`}
                </button>
                {filtering && <button type="button" className="pp-btn sm ghost" onClick={clearAll}><i className="mdi mdi-filter-remove-outline"></i> Clear</button>}
            </div>

            <div className="tb-board">
                {TASK_COLUMNS.map((col) => {
                    const m = TASK_STATUS[col]
                    const items = filtered.filter((t) => t.status === col)
                    return (
                        <section
                            key={col}
                            className={`tb-col ${dragOverCol === col ? 'over' : ''}`}
                            style={{ '--c': m.color }}
                            onDragOver={(e) => { e.preventDefault(); if (dragOverCol !== col) setDragOverCol(col) }}
                            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOverCol(null) }}
                            onDrop={(e) => onDrop(e, col)}
                            aria-label={`${col} column`}
                        >
                            <div className="tb-col-head"><i className={`mdi ${m.icon}`}></i><b>{col}</b><span>{items.length}</span></div>
                            <div className="tb-list">
                                {items.map((t) => (
                                    <button
                                        type="button"
                                        key={t._id}
                                        className={`tb-card ${draggingId === t._id ? 'dragging' : ''} ${isOverdue(t) ? 'overdue' : ''}`}
                                        style={{ '--p': priorityMeta(t.priority).color }}
                                        draggable
                                        onDragStart={(e) => onDragStart(e, t._id)}
                                        onDragEnd={() => { setDraggingId(null); setDragOverCol(null) }}
                                        onClick={() => setSelectedTaskId(t._id)}
                                        title={`${t.priority} priority — click to open, drag to move`}
                                    >
                                        <p className="tb-card-title">{t.title}</p>
                                        {t.projectId && <span className="tb-card-project"><i className="mdi mdi-folder-outline"></i>{t.projectId.projectName}</span>}
                                        <div className="tb-card-foot">
                                            <DueTag date={t.dueDate} done={t.status === 'Done'} />
                                            {t.comments?.length > 0 && <span className="tb-meta"><i className="mdi mdi-comment-outline"></i>{t.comments.length}</span>}
                                            {t.assignedTo ? <Avatar person={t.assignedTo} size={26} /> : <span className="tb-meta ms-auto" title="Unassigned"><i className="mdi mdi-account-question-outline"></i></span>}
                                        </div>
                                    </button>
                                ))}
                                {!items.length && <div className="tb-empty">{draggingId ? 'Drop here' : 'No tasks'}</div>}
                            </div>
                        </section>
                    )
                })}
            </div>

            {selectedTaskId && <TaskDetailModal taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />}
        </PeopleShell>
    )
}
