import React, { useMemo, useState } from 'react'
import { Avatar, fullName } from '../people/PeopleUI'
import './projects.css'

/* -------------------------------------------------------------------------- */
/*  Shared bits for Projects, Project detail, Tasks board and task drawer.    */
/* -------------------------------------------------------------------------- */

export const PROJECTS_ROOT = { label: 'Projects', to: '/projects' }

export const PROJECT_STATUS = {
    Planning: { color: '#64748b', icon: 'mdi-pencil-ruler' },
    Active: { color: '#0284c7', icon: 'mdi-rocket-launch-outline' },
    'On Hold': { color: '#d97706', icon: 'mdi-pause-circle-outline' },
    Completed: { color: '#059669', icon: 'mdi-check-decagram' },
    Cancelled: { color: '#e11d48', icon: 'mdi-close-octagon-outline' },
}

export const TASK_STATUS = {
    'To Do': { color: '#64748b', icon: 'mdi-checkbox-blank-circle-outline' },
    'In Progress': { color: '#0284c7', icon: 'mdi-progress-clock' },
    'In Review': { color: '#7c3aed', icon: 'mdi-eye-outline' },
    Blocked: { color: '#e11d48', icon: 'mdi-alert-octagon-outline' },
    Done: { color: '#059669', icon: 'mdi-check-circle-outline' },
}
export const TASK_COLUMNS = Object.keys(TASK_STATUS)

export const PRIORITY = {
    Low: { color: '#059669', icon: 'mdi-chevron-down' },
    Medium: { color: '#d97706', icon: 'mdi-equal' },
    High: { color: '#e11d48', icon: 'mdi-chevron-up' },
    Critical: { color: '#9f1239', icon: 'mdi-chevron-double-up' },
}

const meta = (map, key) => map[key] || { color: '#64748b', icon: 'mdi-circle-outline' }

export const Pill = ({ map, value }) => {
    const m = meta(map, value)
    return <span className="pj-pill" style={{ '--c': m.color }}><i className={`mdi ${m.icon}`}></i>{value || '—'}</span>
}
export const ProjectStatus = ({ status }) => <Pill map={PROJECT_STATUS} value={status} />
export const TaskStatus = ({ status }) => <Pill map={TASK_STATUS} value={status} />
export const PriorityTag = ({ priority }) => {
    const m = meta(PRIORITY, priority)
    return <span className="pp-tag" style={{ '--tag': m.color }}><i className={`mdi ${m.icon}`}></i>{priority || '—'}</span>
}

export const projectStatusMeta = (s) => meta(PROJECT_STATUS, s)
export const taskStatusMeta = (s) => meta(TASK_STATUS, s)
export const priorityMeta = (p) => meta(PRIORITY, p)

const DAY = 24 * 60 * 60 * 1000
export const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime() }
export const isOverdue = (task) => task.dueDate && task.status !== 'Done' && startOfDay(task.dueDate) < startOfDay(Date.now())

// "Due today" / "Due in 3d" / "2d overdue" with a colour.
export const dueInfo = (date, done = false) => {
    if (!date) return null
    const days = Math.round((startOfDay(date) - startOfDay(Date.now())) / DAY)
    const short = new Date(date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    if (done) return { text: short, color: '#64748b', icon: 'mdi-calendar-check-outline' }
    if (days < 0) return { text: `${-days}d overdue`, color: '#e11d48', icon: 'mdi-alert-circle-outline' }
    if (days === 0) return { text: 'Due today', color: '#d97706', icon: 'mdi-calendar-alert' }
    if (days <= 3) return { text: `Due in ${days}d`, color: '#d97706', icon: 'mdi-calendar-clock' }
    return { text: `Due ${short}`, color: '#64748b', icon: 'mdi-calendar-outline' }
}

export const DueTag = ({ date, done }) => {
    const d = dueInfo(date, done)
    if (!d) return null
    return <span className="pj-due" style={{ '--c': d.color }} title={new Date(date).toDateString()}><i className={`mdi ${d.icon}`}></i>{d.text}</span>
}

export const AvatarStack = ({ people = [], max = 4, size = 28 }) => (
    <span className="pj-stack" title={people.map(fullName).join(', ')}>
        {people.slice(0, max).map((p) => <Avatar key={p._id || fullName(p)} person={p} size={size} />)}
        {people.length > max && <span className="pj-stack-more" style={{ width: size, height: size }}>+{people.length - max}</span>}
    </span>
)

// Task-based progress: done / total, falling back to the stored value when there are no tasks.
export const progressOf = (project, tasks) => {
    const mine = (tasks || []).filter((t) => (t.projectId?._id || t.projectId) === project._id)
    if (!mine.length) return { pct: Number(project.progress) || 0, done: 0, total: 0, overdue: 0 }
    const done = mine.filter((t) => t.status === 'Done').length
    return { pct: Math.round((done / mine.length) * 100), done, total: mine.length, overdue: mine.filter(isOverdue).length }
}

/* Searchable multi-select of people, shown as removable chips. */
export const PeoplePicker = ({ people = [], value = [], onChange, exclude = [], placeholder = 'Search people…' }) => {
    const [q, setQ] = useState('')
    const selected = people.filter((p) => value.includes(p._id))
    const options = useMemo(() => {
        const s = q.trim().toLowerCase()
        return people
            .filter((p) => !value.includes(p._id) && !exclude.includes(p._id))
            .filter((p) => !s || `${fullName(p)} ${p.designation || ''} ${p.department || ''}`.toLowerCase().includes(s))
            .slice(0, 8)
    }, [people, value, exclude, q])

    return (
        <div className="pj-picker">
            {selected.length > 0 && (
                <div className="pj-chips">
                    {selected.map((p) => (
                        <span key={p._id} className="pj-chip">
                            <Avatar person={p} size={22} />{fullName(p)}
                            <button type="button" onClick={() => onChange(value.filter((id) => id !== p._id))} aria-label={`Remove ${fullName(p)}`}><i className="mdi mdi-close"></i></button>
                        </span>
                    ))}
                </div>
            )}
            <div className="pp-search">
                <i className="mdi mdi-account-search-outline"></i>
                <input type="search" className="pp-input" placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {q && (
                <ul className="pj-options">
                    {options.map((p) => (
                        <li key={p._id}>
                            <button type="button" onClick={() => { onChange([...value, p._id]); setQ('') }}>
                                <Avatar person={p} size={28} />
                                <span><b>{fullName(p)}</b><small>{[p.designation, p.department].filter(Boolean).join(' · ')}</small></span>
                                <i className="mdi mdi-plus"></i>
                            </button>
                        </li>
                    ))}
                    {!options.length && <li className="pj-none">No matches</li>}
                </ul>
            )}
        </div>
    )
}
