import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PeopleShell, Avatar, EmptyState, ErrorBanner, fullName } from '../../../components/people/PeopleUI'
import { PROJECTS_ROOT, TASK_COLUMNS, TASK_STATUS, DueTag, startOfDay } from '../../../components/projects/ProjectUI'
import { useAccess } from '../../../hooks/useAccess'
import { getCurrentLocation } from '../../../utils/geo'
import { toast } from '../../../components/common/Toaster'
import { api, TaskModal, Modal, taskTag, TASK_TYPES, CloseTaskModal } from './ProjectParts'
import { IssueView, TypeTag, TYPE_META } from './IssueView'
import './MyTasks.css'
import { Live } from '../../../components/common/Live'

/* My tasks — a tracker in the spirit of MantisBT, on the same tasks and flow as the project
   boards (To Do → In Progress → In Review → Done).
     My view  — boxes: assigned to me, waiting for my review, reported by me, monitored by me,
                recently modified, resolved.
     Issues   — a sortable, filterable table (status-coloured rows) with bulk status changes.
     Board    — the same tasks as columns, drag to move.
   Every task opens in the issue view: details, notes, history, monitoring, change status with a note. */

const PRIO = { High: ['mdi-chevron-double-up', '#e11d48', 3], Medium: ['mdi-equal', '#d97706', 2], Low: ['mdi-chevron-down', '#059669', 1] }
const SCOPES = [['involved', 'Everything I’m on'], ['assigned', 'Assigned to me'], ['reported', 'Reported by me'], ['monitored', 'Monitored by me'], ['team', 'My team’s tasks']]
const STATUS_FILTERS = [['open', 'Open'], ...TASK_COLUMNS.map((s) => [s, s]), ['all', 'All']]
const COLS = [['no', 'ID'], ['type', 'Type'], ['priority', 'P'], ['status', 'Status'], ['title', 'Summary'], ['project', 'Project'], ['assignee', 'Assigned to'], ['due', 'Due'], ['updated', 'Updated']]
const pid = (t) => t?.projectId?._id || t?.projectId
const idOf = (x) => x?._id || x
const clock = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0')).join(':') }
const ago = (d) => {
    const m = Math.round((Date.now() - new Date(d)) / 60000)
    if (m < 1) return 'just now'
    if (m < 60) return `${m}m ago`
    if (m < 1440) return `${Math.round(m / 60)}h ago`
    if (m < 10080) return `${Math.round(m / 1440)}d ago`
    return new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
const remember = (k, v) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } }
const recall = (k, d) => { try { return localStorage.getItem(k) || d } catch { return d } }
const SORTERS = {
    no: (t) => t.taskNo || 0, type: (t) => t.type || 'Task', priority: (t) => PRIO[t.priority]?.[2] || 0, status: (t) => TASK_COLUMNS.indexOf(t.status),
    title: (t) => t.title.toLowerCase(), project: (t) => t.projectId?.projectCode || '', assignee: (t) => fullName(t.assignedTo).toLowerCase(),
    due: (t) => (t.dueDate ? new Date(t.dueDate).getTime() : Infinity), updated: (t) => new Date(t.updatedAt).getTime(),
}

const StatusChip = ({ s }) => { const m = TASK_STATUS[s] || TASK_STATUS['To Do']; return <span className="tk-st" style={{ '--c': m.color }}><i className={`mdi ${m.icon}`}></i>{s}</span> }
const Prio = ({ p }) => { const m = PRIO[p] || PRIO.Medium; return <i className={`mdi ${m[0]} tk-prio`} style={{ color: m[1] }} title={`${p || 'Medium'} priority`}></i> }

// a box on "My view"
const Box = ({ title, icon, color, items, empty, onOpen, onAll, extra }) => (
    <section className="tk-box" style={{ '--c': color }}>
        <header><i className={`mdi ${icon}`}></i><b>{title}</b><span>{items.length}</span>{onAll && items.length > 0 && <button type="button" onClick={onAll}>View all<i className="mdi mdi-chevron-right"></i></button>}</header>
        {items.length ? (
            <ul>{items.slice(0, 6).map((t) => (
                <li key={t._id} onClick={() => onOpen(t)} style={{ '--s': TASK_STATUS[t.status]?.color }}>
                    <span className="tk-box-no">{taskTag(t)}</span>
                    <span className="tk-box-main"><b>{t.title}</b><small>{t.projectId?.projectCode}{t.assignedTo ? ` · ${fullName(t.assignedTo)}` : ' · Unassigned'}</small></span>
                    {extra ? extra(t) : t.dueDate && t.status !== 'Done' ? <DueTag date={t.dueDate} /> : <small className="tk-ago">{ago(t.updatedAt)}</small>}
                </li>
            ))}</ul>
        ) : <p className="tk-box-empty">{empty}</p>}
    </section>
)

export const TasksBoard = () => {
    const { user } = useAccess()
    const me = user?._id
    const [mine, setMine] = useState(null)
    const [team, setTeam] = useState(null)
    const [review, setReview] = useState([])
    const [closed, setClosed] = useState([])
    const [closing, setClosing] = useState(null) // { tasks, mode: 'close' | 'reopen' }
    const [timer, setTimer] = useState(null)
    const [canSeeTeam, setCanSeeTeam] = useState(false)
    const [error, setError] = useState('')
    const [view, setView] = useState(() => recall('tk-view2', 'myview'))
    const [f, setF] = useState({ scope: 'involved', status: 'open', priority: '', type: '', project: '', q: '' })
    const [sort, setSort] = useState({ key: 'updated', dir: -1 })
    const [sel, setSel] = useState(() => new Set())
    const [bulkTo, setBulkTo] = useState('In Progress')
    const [openId, setOpenId] = useState(null)
    const [report, setReport] = useState(null) // null | { projects } | { project, members, canManage }
    const [busy, setBusy] = useState('')
    const [dragId, setDragId] = useState(null)
    const [overCol, setOverCol] = useState(null)

    const load = useCallback((withTeam) => api('GET', `/tasks/mine${withTeam ? '?scope=team' : ''}`).then((j) => {
        setMine(j.data); setReview(j.review || []); setClosed(j.closed || []); setTimer(j.myTimer || null); setCanSeeTeam(!!j.canSeeTeam)
        if (j.team) setTeam(j.team)
        setError('')
    }).catch((e) => setError(e.message)), [])
    useEffect(() => { load(false) }, [load])
    useEffect(() => { if (f.scope === 'team' && !team) load(true) }, [f.scope, team, load])
    useEffect(() => remember('tk-view2', view), [view])
    const refresh = () => load(f.scope === 'team' || !!team)
    const setFilter = (k, v) => { setF((x) => ({ ...x, [k]: v })); setSel(new Set()) }

    const move = async (t, status) => {
        const prev = t.status
        if (prev === status) return
        const patch = (s) => { const up = (l) => l && l.map((x) => (x._id === t._id ? { ...x, status: s, updatedAt: new Date().toISOString() } : x)); setMine(up); setTeam(up); setReview(up) }
        patch(status)
        try {
            await api('PUT', `/tasks/${t._id}/move`, { status })
            toast.success(`${taskTag(t)} → ${status}`, { title: 'Status changed', action: { label: 'Undo', onClick: async () => { patch(prev); try { await api('PUT', `/tasks/${t._id}/move`, { status: prev }) } catch (e) { toast.error(e.message) } } } })
        } catch (e) { patch(prev); toast.error(e.message, { title: 'Couldn’t change the status' }) }
    }
    const bulk = async () => {
        setBusy('bulk')
        try { const j = await api('PUT', '/tasks/bulk', { ids: [...sel], status: bulkTo }); toast.success(j.message, { title: 'Bulk update' }); setSel(new Set()); await refresh() } catch (e) { toast.error(e.message) }
        setBusy('')
    }
    const startTimer = async (t) => {
        setBusy('timer')
        try {
            const loc = await getCurrentLocation()
            await api('POST', `/projects/${pid(t)}/timer/start`, { ...loc, taskId: t._id })
            toast.success(`Timing ${taskTag(t)} “${t.title}”. Start location recorded.`, { title: 'Timer started' })
            await refresh()
        } catch (e) { toast.error(e.message, { title: 'Couldn’t start the timer' }) }
        setBusy('')
    }
    const stopTimer = async () => {
        setBusy('timer')
        try {
            const loc = await getCurrentLocation()
            const j = await api('POST', `/projects/${pid(timer)}/timer/stop`, loc)
            toast.success(`${(j.message.match(/\d+h \d+m/) || ['Your time'])[0]} added to the time log.`, { title: 'Timer stopped' })
            await refresh()
        } catch (e) { toast.error(e.message, { title: 'Couldn’t stop the timer' }) }
        setBusy('')
    }
    const startReport = async () => {
        try { const j = await api('GET', '/projects'); setReport({ projects: j.data.filter((p) => !['Completed', 'Cancelled'].includes(p.status)) }) } catch (e) { toast.error(e.message) }
    }
    const pickProject = async (p) => {
        try { const j = await api('GET', `/projects/${p._id}/workspace`); const pr = j.data.project; setReport({ project: pr, members: [pr.projectManager, ...(pr.teamMembers || [])].filter(Boolean), canManage: j.data.canManage }) } catch (e) { toast.error(e.message) }
    }

    const all = useMemo(() => mine || [], [mine])
    const isMine = (t) => idOf(t.assignedTo) === me
    const source = useMemo(() => {
        if (f.scope === 'team') return team || []
        if (f.scope === 'assigned') return all.filter((t) => idOf(t.assignedTo) === me)
        if (f.scope === 'reported') return all.filter((t) => idOf(t.createdBy) === me)
        if (f.scope === 'monitored') return all.filter((t) => t.watching)
        return all
    }, [all, team, f.scope, me])
    const projects = useMemo(() => { const m = new Map(); source.forEach((t) => t.projectId && m.set(pid(t), t.projectId)); return [...m.values()].sort((a, b) => (a.projectCode || '').localeCompare(b.projectCode || '')) }, [source])
    // the board shows every status column, so it ignores the status filter
    const filtered = useMemo(() => {
        const q = f.q.trim().toLowerCase()
        return source.filter((t) => {
            if (f.priority && t.priority !== f.priority) return false
            if (f.type && (t.type || 'Task') !== f.type) return false
            if (f.project && pid(t) !== f.project) return false
            if (q && !`${taskTag(t)} ${t.taskNo} ${t.title} ${t.projectId?.projectCode || ''} ${t.projectId?.projectName || ''} ${fullName(t.assignedTo)}`.toLowerCase().includes(q)) return false
            return true
        })
    }, [source, f.priority, f.type, f.project, f.q])
    const rows = useMemo(() => {
        const list = filtered.filter((t) => (f.status === 'open' ? t.status !== 'Done' : f.status === 'all' || t.status === f.status))
        const k = SORTERS[sort.key]
        return [...list].sort((a, b) => (k(a) > k(b) ? 1 : k(a) < k(b) ? -1 : 0) * sort.dir)
    }, [filtered, f.status, sort])

    const closedProjects = useMemo(() => { const m = new Map(); closed.forEach((t) => t.projectId && m.set(pid(t), t.projectId)); return [...m.values()] }, [closed])
    const closedRows = useMemo(() => { const q = f.q.trim().toLowerCase(); return closed.filter((t) => (!f.project || pid(t) === f.project) && (!q || `${taskTag(t)} ${t.title} ${t.closeNote || ''} ${t.projectId?.projectCode || ''} ${fullName(t.assignedTo)}`.toLowerCase().includes(q))) }, [closed, f.project, f.q])
    const selectedDone = rows.filter((t) => sel.has(t._id) && t.status === 'Done')
    const afterClose = (msg, mode) => { setClosing(null); setSel(new Set()); toast.success(msg, { title: mode === 'reopen' ? 'Task reopened' : 'Closed' }); refresh() }
    const today = startOfDay(Date.now())
    const openMine = all.filter((t) => isMine(t) && t.status !== 'Done')
    const counts = {
        open: openMine.length,
        overdue: openMine.filter((t) => t.dueDate && startOfDay(t.dueDate) < today).length,
        today: openMine.filter((t) => t.dueDate && startOfDay(t.dueDate) === today).length,
        review: review.filter((t) => t.status === 'In Review').length,
    }
    const viewAll = (scope, status = 'open') => { setF((x) => ({ ...x, scope, status, priority: '', type: '', project: '', q: '' })); setView('issues') }
    const sortBy = (key) => setSort((s) => ({ key, dir: s.key === key ? -s.dir : key === 'updated' ? -1 : 1 }))
    const allSel = rows.length > 0 && rows.every((t) => sel.has(t._id))

    return (
        <PeopleShell title="My tasks" root={PROJECTS_ROOT} crumbs={[{ label: 'My tasks' }]}
            actions={<><Link to="/projects" className="pp-btn"><i className="mdi mdi-folder-outline"></i>Projects</Link><button type="button" className="pp-btn primary" onClick={startReport}><i className="mdi mdi-plus"></i>Report issue</button></>}>
            <ErrorBanner error={error} />

            {timer && (
                <div className="tk-timer">
                    <span className="tk-timer-ic"><i className="mdi mdi-timer-outline"></i></span>
                    <div><small>Working on</small><b>{timer.taskId ? `${taskTag(timer.taskId)} ${timer.taskId.title}` : 'General project work'}</b><Link to={`/projects/${pid(timer)}`}>{timer.projectId?.projectCode} · {timer.projectId?.projectName}</Link></div>
                    <span className="tk-clock"><i className="pw-dot"></i><Live>{(n) => clock(n - new Date(timer.startTime))}</Live></span>
                    <button type="button" className="tk-stop" disabled={busy === 'timer'} onClick={stopTimer}><i className="mdi mdi-stop"></i>{busy === 'timer' ? 'Stopping…' : 'Stop'}</button>
                </div>
            )}

            <div className="tk-stats">
                {[[counts.open, 'Assigned to me', '#1e40af', 'mdi-account-check-outline', () => viewAll('assigned')], [counts.today, 'Due today', '#d97706', 'mdi-calendar-today', () => viewAll('assigned')], [counts.overdue, 'Overdue', '#e11d48', 'mdi-alert-circle-outline', () => viewAll('assigned')], [counts.review, 'Waiting for my review', '#7c3aed', 'mdi-clipboard-check-outline', () => setView('myview')]].map(([n, label, c, ic, go]) => (
                    <button key={label} type="button" className="tk-stat" style={{ '--c': c }} onClick={go}><span><i className={`mdi ${ic}`}></i></span><b>{n}</b><small>{label}</small></button>
                ))}
            </div>

            <div className="tk-tabs">
                {[['myview', 'My view', 'mdi-view-dashboard-outline'], ['issues', 'Issues', 'mdi-format-list-bulleted-square'], ['board', 'Board', 'mdi-view-column-outline'], ['closed', 'Closed', 'mdi-archive-outline']].map(([k, label, ic]) => <button key={k} type="button" className={view === k ? 'on' : ''} onClick={() => setView(k)}><i className={`mdi ${ic}`}></i>{label}{k === 'closed' && closed.length > 0 && <b className="tk-tabn">{closed.length}</b>}</button>)}
            </div>

            {!mine ? <div className="pp-card"><div className="pw-loading"><i className="mdi mdi-loading mdi-spin"></i></div></div> : view === 'myview' ? (
                <div className="tk-boxes">
                    <Box title="Assigned to me" icon="mdi-account-check-outline" color="#1e40af" items={openMine.sort((a, b) => (a.dueDate ? new Date(a.dueDate) : Infinity) - (b.dueDate ? new Date(b.dueDate) : Infinity))} empty="Nothing open is assigned to you." onOpen={(t) => setOpenId(t._id)} onAll={() => viewAll('assigned')} />
                    {review.length > 0 && <Box title="Waiting for my review" icon="mdi-clipboard-check-outline" color="#7c3aed" items={review} empty="" onOpen={(t) => setOpenId(t._id)}
                        extra={(t) => t.status === 'In Review'
                            ? <span className="tk-rev" onClick={(e) => e.stopPropagation()}><button type="button" className="back" onClick={() => move(t, 'In Progress')} title="Send back"><i className="mdi mdi-restore"></i></button><button type="button" className="ok" onClick={() => move(t, 'Done')} title="Approve"><i className="mdi mdi-check-bold"></i></button></span>
                            : <StatusChip s={t.status === 'Done' ? 'Done' : t.status} />} />}
                    <Box title="Reported by me" icon="mdi-bullhorn-outline" color="#0891b2" items={all.filter((t) => idOf(t.createdBy) === me && t.status !== 'Done')} empty="Nothing open that you reported." onOpen={(t) => setOpenId(t._id)} onAll={() => viewAll('reported')} />
                    <Box title="Monitored by me" icon="mdi-eye-outline" color="#475569" items={all.filter((t) => t.watching && t.status !== 'Done')} empty="Use “Monitor” on a task to follow it here." onOpen={(t) => setOpenId(t._id)} onAll={() => viewAll('monitored')} />
                    <Box title="Recently modified" icon="mdi-update" color="#d97706" items={[...all].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))} empty="No recent changes." onOpen={(t) => setOpenId(t._id)} onAll={() => { viewAll('involved', 'all'); setSort({ key: 'updated', dir: -1 }) }} extra={(t) => <span className="tk-box-end"><StatusChip s={t.status} /><small className="tk-ago">{ago(t.updatedAt)}</small></span>} />
                    <Box title="Done — ready to close" icon="mdi-check-decagram-outline" color="#059669" items={all.filter((t) => t.status === 'Done').sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))} empty="Nothing waiting to be closed." onOpen={(t) => setOpenId(t._id)} onAll={() => viewAll('involved', 'Done')}
                        extra={(t) => <span onClick={(e) => e.stopPropagation()}><button type="button" className="pw-closebtn" onClick={() => setClosing({ tasks: [t], mode: 'close' })}><i className="mdi mdi-archive-arrow-down-outline"></i>Close</button></span>} />
                </div>
            ) : view === 'closed' ? (
                <section className="pp-card tk-board">
                    <div className="tk-filterbar">
                        <select className="pp-select" value={f.project} onChange={(e) => setFilter('project', e.target.value)} aria-label="Project"><option value="">All projects</option>{closedProjects.map((p) => <option key={p._id} value={p._id}>{p.projectCode} · {p.projectName}</option>)}</select>
                        <div className="pp-search tk-search"><i className="mdi mdi-magnify"></i><input type="search" className="pp-input" value={f.q} onChange={(e) => setFilter('q', e.target.value)} placeholder="Search closed tasks, notes…" /></div>
                    </div>
                    {!closedRows.length ? <EmptyState icon="mdi-archive-outline" title={closed.length ? 'No closed task matches' : 'Nothing closed yet'} text="Done tasks you close — with a closing note — are kept here, off the boards." /> : (
                        <ul className="tk-closed">{closedRows.map((t) => (
                            <li key={t._id} onClick={() => setOpenId(t._id)}>
                                <span className="tk-closed-ic"><i className="mdi mdi-archive-arrow-down-outline"></i></span>
                                <div className="tk-closed-main">
                                    <b><span className="tk-box-no">{taskTag(t)}</span> {t.title}</b>
                                    <small>{t.projectId && <Link to={`/projects/${pid(t)}`} onClick={(e) => e.stopPropagation()}>{t.projectId.projectCode}</Link>} · {t.assignedTo ? fullName(t.assignedTo) : 'Unassigned'} · closed {new Date(t.closedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}{t.closedBy ? ` by ${fullName(t.closedBy)}` : ''}</small>
                                    {t.closeNote && <q>{t.closeNote}</q>}
                                </div>
                                <button type="button" className="tk-reopen" onClick={(e) => { e.stopPropagation(); setClosing({ tasks: [t], mode: 'reopen' }) }}><i className="mdi mdi-restore"></i>Reopen</button>
                            </li>
                        ))}</ul>
                    )}
                    <p className="tk-foot">{closedRows.length} closed task{closedRows.length === 1 ? '' : 's'} · last 12 months</p>
                </section>
            ) : (
                <section className="pp-card tk-board">
                    <div className="tk-filterbar">
                        <select className="pp-select" value={f.scope} onChange={(e) => setFilter('scope', e.target.value)} aria-label="Whose tasks">{SCOPES.filter(([k]) => k !== 'team' || canSeeTeam).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                        {view === 'issues' && <select className="pp-select" value={f.status} onChange={(e) => setFilter('status', e.target.value)} aria-label="Status">{STATUS_FILTERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}
                        <select className="pp-select" value={f.priority} onChange={(e) => setFilter('priority', e.target.value)} aria-label="Priority"><option value="">Any priority</option>{Object.keys(PRIO).map((p) => <option key={p}>{p}</option>)}</select>
                        <select className="pp-select" value={f.type} onChange={(e) => setFilter('type', e.target.value)} aria-label="Type"><option value="">Any type</option>{TASK_TYPES.map((x) => <option key={x}>{x}</option>)}</select>
                        <select className="pp-select" value={f.project} onChange={(e) => setFilter('project', e.target.value)} aria-label="Project"><option value="">All projects</option>{projects.map((p) => <option key={p._id} value={p._id}>{p.projectCode} · {p.projectName}</option>)}</select>
                        <div className="pp-search tk-search"><i className="mdi mdi-magnify"></i><input type="search" className="pp-input" value={f.q} onChange={(e) => setFilter('q', e.target.value)} placeholder="Search #ID, summary, project, person…" /></div>
                    </div>

                    {f.scope === 'team' && !team ? <div className="pw-loading"><i className="mdi mdi-loading mdi-spin"></i></div> : view === 'issues' ? (
                        <>
                            {sel.size > 0 && (
                                <div className="tk-bulk">
                                    <b>{sel.size} selected</b>
                                    <span>Move to</span>
                                    <select className="pp-select" value={bulkTo} onChange={(e) => setBulkTo(e.target.value)}>{TASK_COLUMNS.map((s) => <option key={s}>{s}</option>)}</select>
                                    <button type="button" className="pp-btn primary sm" disabled={busy === 'bulk'} onClick={bulk}><i className="mdi mdi-check"></i>Apply</button>
                                    {selectedDone.length > 0 && <button type="button" className="pp-btn sm tk-bulk-close" onClick={() => setClosing({ tasks: selectedDone, mode: 'close' })}><i className="mdi mdi-archive-arrow-down-outline"></i>Close {selectedDone.length} done</button>}
                                    <button type="button" className="pp-btn sm" onClick={() => setSel(new Set())}>Clear</button>
                                </div>
                            )}
                            {!rows.length ? <EmptyState icon="mdi-check-all" title="No tasks match" text="Change the filters, or report a new issue." /> : (
                                <div className="tk-table-wrap">
                                    <table className="tk-table">
                                        <thead><tr>
                                            <th className="c-sel"><input type="checkbox" checked={allSel} onChange={() => setSel(allSel ? new Set() : new Set(rows.map((t) => t._id)))} aria-label="Select all" /></th>
                                            {COLS.map(([k, l]) => <th key={k} className={`c-${k}`}><button type="button" onClick={() => sortBy(k)} className={sort.key === k ? 'on' : ''}>{l}{sort.key === k && <i className={`mdi ${sort.dir > 0 ? 'mdi-arrow-up' : 'mdi-arrow-down'}`}></i>}</button></th>)}
                                        </tr></thead>
                                        <tbody>{rows.map((t) => (
                                            <tr key={t._id} style={{ '--c': TASK_STATUS[t.status]?.color }} className={`${sel.has(t._id) ? 'sel' : ''} ${t.status === 'Done' ? 'done' : ''}`} onClick={() => setOpenId(t._id)}>
                                                <td className="c-sel" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel.has(t._id)} onChange={() => setSel((s) => { const n = new Set(s); n.has(t._id) ? n.delete(t._id) : n.add(t._id); return n })} aria-label={`Select ${taskTag(t)}`} /></td>
                                                <td className="c-no">{taskTag(t)}</td>
                                                <td className="c-type"><i className={`mdi ${(TYPE_META[t.type] || TYPE_META.Task)[0]}`} style={{ color: (TYPE_META[t.type] || TYPE_META.Task)[1] }} title={t.type || 'Task'}></i><span>{t.type || 'Task'}</span></td>
                                                <td className="c-priority"><Prio p={t.priority} /></td>
                                                <td className="c-status"><StatusChip s={t.status} /></td>
                                                <td className="c-title"><b>{t.title}</b>{(t.checklist || []).length > 0 && <small><i className="mdi mdi-format-list-checks"></i>{t.checklist.filter((c) => c.done).length}/{t.checklist.length}</small>}{t.notes > 0 && <small><i className="mdi mdi-comment-outline"></i>{t.notes}</small>}{t.watching && <small title="You're monitoring this"><i className="mdi mdi-eye"></i></small>}</td>
                                                <td className="c-project">{t.projectId ? <Link to={`/projects/${pid(t)}`} onClick={(e) => e.stopPropagation()}>{t.projectId.projectCode}</Link> : '—'}</td>
                                                <td className="c-assignee">{t.assignedTo ? <span><Avatar person={t.assignedTo} size={22} />{fullName(t.assignedTo)}</span> : <em>Unassigned</em>}</td>
                                                <td className="c-due">{t.dueDate ? <DueTag date={t.dueDate} done={t.status === 'Done'} /> : '—'}</td>
                                                <td className="c-updated">{ago(t.updatedAt)}</td>
                                            </tr>
                                        ))}</tbody>
                                    </table>
                                </div>
                            )}
                            <p className="tk-foot">{rows.length} of {source.length} tasks · rows are coloured by status · click a row to open it</p>
                        </>
                    ) : (
                        <div className="pw-kanban tk-kanban">
                            {TASK_COLUMNS.map((col) => {
                                const list = filtered.filter((t) => t.status === col)
                                return (
                                    <div key={col} className={`pw-col ${overCol === col ? 'over' : ''}`} style={{ '--c': TASK_STATUS[col].color }}
                                        onDragOver={(e) => { e.preventDefault(); setOverCol(col) }} onDragLeave={() => setOverCol(null)}
                                        onDrop={() => { const t = source.find((x) => x._id === dragId); setOverCol(null); setDragId(null); if (t) move(t, col) }}>
                                        <header><i className={`mdi ${TASK_STATUS[col].icon}`}></i>{col}<span>{list.length}</span>{col === 'Done' && list.length > 1 && <button type="button" className="pw-closebtn" style={{ marginLeft: 6 }} onClick={() => setClosing({ tasks: list, mode: 'close' })}><i className="mdi mdi-archive-arrow-down-outline"></i>Close all</button>}</header>
                                        <div className="pw-col-body">
                                            {list.map((t) => (
                                                <div key={t._id} className={`pw-tcard ${dragId === t._id ? 'dragging' : ''}`} style={{ '--c': TASK_STATUS[col].color }} draggable onDragStart={() => setDragId(t._id)} onDragEnd={() => setDragId(null)} onClick={() => setOpenId(t._id)}>
                                                    <span className="pw-tno">{taskTag(t)} · {t.projectId?.projectCode}</span>
                                                    <b>{t.title}</b>
                                                    <div className="pw-tcard-meta">
                                                        <TypeTag type={t.type} />
                                                        <Prio p={t.priority} />
                                                        {t.dueDate && <DueTag date={t.dueDate} done={t.status === 'Done'} />}
                                                    </div>
                                                    <div className="pw-tcard-foot" onClick={(e) => e.stopPropagation()}>
                                                        <span className={`pw-who ${t.assignedTo ? '' : 'none'}`}>{t.assignedTo ? <><Avatar person={t.assignedTo} size={20} />{t.assignedTo.firstName}</> : 'Unassigned'}</span>
                                                        {t.status === 'Done' ? <button type="button" className="pw-closebtn" onClick={() => setClosing({ tasks: [t], mode: 'close' })}><i className="mdi mdi-archive-arrow-down-outline"></i>Close</button>
                                                            : <select className="pw-move" value={t.status} onChange={(e) => move(t, e.target.value)} aria-label="Move to">{TASK_COLUMNS.map((s) => <option key={s}>{s}</option>)}</select>}
                                                    </div>
                                                </div>
                                            ))}
                                            {!list.length && <p className="pw-col-empty">Drop a task here</p>}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </section>
            )}

            {closing && <CloseTaskModal tasks={closing.tasks} mode={closing.mode} onClose={() => setClosing(null)} onDone={(msg) => afterClose(msg, closing.mode)} />}
            {openId && <IssueView id={openId} me={me} onClose={() => setOpenId(null)} onChanged={refresh} onTimer={(t) => { setOpenId(null); startTimer(t) }} timerOn={!!timer || busy === 'timer'} />}

            {report?.projects && (
                <Modal title="Report an issue" sub="Pick the project it belongs to" icon={<span className="pw-dicon"><i className="mdi mdi-plus"></i></span>} onClose={() => setReport(null)}>
                    {report.projects.length ? <ul className="tk-pick">{report.projects.map((p) => <li key={p._id}><button type="button" onClick={() => pickProject(p)}><span className="pw-code">{p.projectCode}</span><b>{p.projectName}</b><small>{p.clientName || 'Internal'}</small><i className="mdi mdi-chevron-right"></i></button></li>)}</ul>
                        : <p className="it-muted">You’re not on any open project yet.</p>}
                </Modal>
            )}
            {report?.project && <TaskModal project={report.project} members={report.members} me={me} canManage={report.canManage} defaultStatus="To Do" onClose={() => setReport(null)}
                onSaved={(t) => { setReport(null); toast.success(`${taskTag(t) || 'Task'} “${t.title}” reported in ${report.project.projectCode}.`, { title: 'Issue reported' }); refresh(); setOpenId(t._id) }} />}
        </PeopleShell>
    )
}
