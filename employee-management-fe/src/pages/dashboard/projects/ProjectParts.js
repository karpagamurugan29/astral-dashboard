import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { chatApi as api } from '../../../components/chat/chatApi'
import { getCurrentLocation, mapsLink } from '../../../utils/geo'
import { Avatar, fullName } from '../../../components/people/PeopleUI'
import { PRIORITY, TASK_COLUMNS, TASK_STATUS, PeoplePicker, DueTag } from '../../../components/projects/ProjectUI'
import './ProjectWorkspace.css'
import { Live } from '../../../components/common/Live'

/* Shared pieces for the projects screens: API helper, formatters, project form, task modal, timer. */

export { api }
export const hm = (min = 0) => { const m = Math.max(0, Math.round(min)); return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${String(m % 60).padStart(2, '0')}m` : ''}` }
export const fmtDay = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
export const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '')
export const WORK_MODES = [['Office', 'mdi-office-building-outline'], ['Client site', 'mdi-domain'], ['Remote', 'mdi-home-outline'], ['Hybrid', 'mdi-swap-horizontal']]
export const modeIcon = (m) => (WORK_MODES.find((x) => x[0] === m) || WORK_MODES[0])[1]
export const placeText = (pl) => (pl ? pl.address || (pl.latitude ? `${pl.latitude.toFixed(4)}, ${pl.longitude.toFixed(4)}` : '') : '')
export const PlaceLink = ({ place }) => (place?.latitude ? <a className="pw-place" href={mapsLink(place.latitude, place.longitude)} target="_blank" rel="noreferrer"><i className="mdi mdi-map-marker-outline"></i>{placeText(place)}</a> : <span className="pw-place none"><i className="mdi mdi-map-marker-off-outline"></i>No location</span>)

export const Modal = ({ title, sub, icon, onClose, children, footer, wide }) => {
    useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])
    return createPortal(
        <div className="pp pw-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
            <div className={`pw-dialog ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
                <header className="pw-dialog-head">{icon}<div><b>{title}</b>{sub && <small>{sub}</small>}</div><button type="button" className="pw-x" onClick={onClose} aria-label="Close"><i className="mdi mdi-close"></i></button></header>
                <div className="pw-dialog-body">{children}</div>
                {footer && <footer className="pw-dialog-foot">{footer}</footer>}
            </div>
        </div>,
        document.body
    )
}

/* ---------------- new / edit project ---------------- */
export const ProjectForm = ({ project, people, onClose, onSaved }) => {
    const d = (v) => (v ? String(v).slice(0, 10) : '')
    const [f, setF] = useState({
        projectName: project?.projectName || '', clientName: project?.clientName || '', description: project?.description || '',
        projectManager: project?.projectManager?._id || project?.projectManager || '', teamMembers: (project?.teamMembers || []).map((m) => m._id || m),
        startDate: d(project?.startDate) || new Date().toISOString().slice(0, 10), endDate: d(project?.endDate), estimatedHours: project?.estimatedHours || '',
        priority: project?.priority || 'Medium', status: project?.status || 'Planning', workMode: project?.workMode || 'Office',
        siteName: project?.location?.siteName || '', address: project?.location?.address || '',
    })
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState('')
    const set = (k) => (e) => setF((x) => ({ ...x, [k]: e && e.target ? e.target.value : e }))
    const save = async () => {
        if (!f.projectName.trim()) return setErr('Give the project a name.')
        if (!f.projectManager) return setErr('Choose a project lead.')
        if (!f.startDate || !f.endDate) return setErr('Set the start and end dates.')
        setBusy(true); setErr('')
        try {
            const body = { ...f, location: { siteName: f.siteName, address: f.address }, teamMembers: f.teamMembers.filter((id) => id !== f.projectManager) }
            const j = project ? await api('PUT', `/projects/${project._id}`, body) : await api('POST', '/projects', body)
            onSaved(j.data)
        } catch (e) { setErr(e.message); setBusy(false) }
    }
    return (
        <Modal title={project ? `Edit ${project.projectCode}` : 'New project'} sub={project ? project.projectName : 'A project code is created automatically'} icon={<span className="pw-dicon"><i className="mdi mdi-folder-plus-outline"></i></span>} onClose={onClose} wide
            footer={<><span className="pw-err">{err}</span><button type="button" className="pp-btn" onClick={onClose}>Cancel</button><button type="button" className="pp-btn primary" disabled={busy} onClick={save}><i className="mdi mdi-check"></i>{busy ? 'Saving…' : project ? 'Save' : 'Create project'}</button></>}>
            <div className="pw-form">
                <label className="pw-field wide"><span>Project name *</span><input className="pp-input" value={f.projectName} onChange={set('projectName')} placeholder="e.g. ERP rollout review — Sunrise Textiles" autoFocus /></label>
                <label className="pw-field"><span>Client</span><input className="pp-input" value={f.clientName} onChange={set('clientName')} placeholder="Client or internal" /></label>
                <label className="pw-field"><span>Project lead *</span>
                    <select className="pp-select" value={f.projectManager} onChange={set('projectManager')}>
                        <option value="">Choose…</option>
                        {people.map((p) => <option key={p._id} value={p._id}>{fullName(p)}{p.designation ? ` — ${p.designation}` : ''}</option>)}
                    </select>
                </label>
                <div className="pw-field wide"><span>Team</span><PeoplePicker people={people} value={f.teamMembers} onChange={set('teamMembers')} exclude={[f.projectManager]} placeholder="Add people to the project…" /></div>
                <label className="pw-field"><span>Start *</span><input type="date" className="pp-input" value={f.startDate} onChange={set('startDate')} /></label>
                <label className="pw-field"><span>Deadline *</span><input type="date" className="pp-input" value={f.endDate} onChange={set('endDate')} /></label>
                <label className="pw-field"><span>Estimated hours</span><input type="number" min="0" className="pp-input" value={f.estimatedHours} onChange={set('estimatedHours')} /></label>
                <label className="pw-field"><span>Priority</span><select className="pp-select" value={f.priority} onChange={set('priority')}>{Object.keys(PRIORITY).map((p) => <option key={p}>{p}</option>)}</select></label>
                {project && <label className="pw-field"><span>Status</span><select className="pp-select" value={f.status} onChange={set('status')}>{['Planning', 'Active', 'On Hold', 'Completed', 'Cancelled'].map((s) => <option key={s}>{s}</option>)}</select></label>}
                <div className="pw-field wide"><span>Where the work happens</span>
                    <div className="pw-modes">{WORK_MODES.map(([m, ic]) => <button key={m} type="button" className={f.workMode === m ? 'on' : ''} onClick={() => set('workMode')(m)}><i className={`mdi ${ic}`}></i>{m}</button>)}</div>
                </div>
                <label className="pw-field"><span>Site / office name</span><input className="pp-input" value={f.siteName} onChange={set('siteName')} placeholder="e.g. Sunrise Textiles HQ" /></label>
                <label className="pw-field"><span>Address</span><input className="pp-input" value={f.address} onChange={set('address')} placeholder="Street, city" /></label>
                <label className="pw-field wide"><span>Description</span><textarea className="pp-input" rows={3} value={f.description} onChange={set('description')} placeholder="Scope, objectives, deliverables…" /></label>
            </div>
        </Modal>
    )
}

/* ---------------- task modal: create, view, edit, checklist, comments ---------------- */
export const TASK_TYPES = ['Task', 'Issue', 'Query', 'Review point']
export const taskTag = (t) => (t?.taskNo ? `#T-${String(t.taskNo).padStart(4, '0')}` : '')

export const TaskModal = ({ task, project, members, me, canManage, onClose, onSaved, onDeleted, defaultStatus }) => {
    const isNew = !task?._id
    const mine = task && ((task.assignedTo?._id || task.assignedTo) === me || (task.createdBy?._id || task.createdBy) === me)
    const editable = isNew || canManage || mine
    const [t, setT] = useState(() => ({
        title: task?.title || '', description: task?.description || '', status: task?.status || defaultStatus || 'To Do', priority: task?.priority || 'Medium', type: task?.type || 'Task',
        assignedTo: task?.assignedTo?._id || task?.assignedTo || (canManage ? '' : me), dueDate: task?.dueDate ? String(task.dueDate).slice(0, 10) : '',
        estimatedHours: task?.estimatedHours ?? '', labels: (task?.labels || []).join(', '), checklist: task?.checklist || [],
    }))
    const [comments, setComments] = useState(task?.comments || [])
    const [newItem, setNewItem] = useState('')
    const [comment, setComment] = useState('')
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState('')
    const set = (k) => (e) => setT((x) => ({ ...x, [k]: e && e.target ? e.target.value : e }))
    const body = () => ({ ...t, labels: t.labels.split(',').map((x) => x.trim()).filter(Boolean) })

    const save = async () => {
        if (!t.title.trim()) return setErr('Give the task a title.')
        setBusy(true); setErr('')
        try {
            const j = isNew ? await api('POST', `/projects/${project._id}/tasks`, body()) : await api('PUT', `/tasks/${task._id}`, body())
            onSaved(j.data, isNew)
        } catch (e) { setErr(e.message); setBusy(false) }
    }
    const toggleItem = async (i) => {
        const checklist = t.checklist.map((c, j) => (j === i ? { ...c, done: !c.done } : c))
        setT((x) => ({ ...x, checklist }))
        if (!isNew && editable) { try { const j = await api('PUT', `/tasks/${task._id}`, { checklist }); onSaved(j.data, false, true) } catch (e) { setErr(e.message) } }
    }
    const addItem = () => { if (!newItem.trim()) return; setT((x) => ({ ...x, checklist: [...x.checklist, { text: newItem.trim(), done: false }] })); setNewItem('') }
    const sendComment = async () => {
        if (!comment.trim()) return
        try { const j = await api('POST', `/tasks/${task._id}/comments`, { message: comment }); setComments(j.data.comments || []); setComment(''); onSaved(j.data, false, true) } catch (e) { setErr(e.message) }
    }
    const remove = async () => {
        if (!window.confirm(`Delete “${task.title}”?`)) return
        try { await api('DELETE', `/tasks/${task._id}`); onDeleted(task._id) } catch (e) { setErr(e.message) }
    }
    const doneCount = t.checklist.filter((c) => c.done).length
    const st = TASK_STATUS[t.status] || {}

    return (
        <Modal title={isNew ? 'New task' : `${taskTag(task)} ${task.title}`.trim()} sub={`${project.projectCode} · ${project.projectName}`} icon={<span className="pw-dicon" style={{ '--c': st.color }}><i className={`mdi ${st.icon || 'mdi-checkbox-marked-circle-outline'}`}></i></span>} onClose={onClose} wide
            footer={<>{!isNew && (canManage || (task.createdBy?._id || task.createdBy) === me) && <button type="button" className="pw-del" onClick={remove}><i className="mdi mdi-delete-outline"></i>Delete</button>}<span className="pw-err">{err}</span><button type="button" className="pp-btn" onClick={onClose}>Close</button>{editable && <button type="button" className="pp-btn primary" disabled={busy} onClick={save}><i className="mdi mdi-check"></i>{busy ? 'Saving…' : isNew ? 'Add task' : 'Save'}</button>}</>}>
            <div className="pw-task">
                <div className="pw-task-main">
                    <input className="pw-title-input" value={t.title} onChange={set('title')} placeholder="What needs to be done?" disabled={!editable} autoFocus={isNew} />
                    <textarea className="pp-input" rows={3} value={t.description} onChange={set('description')} placeholder="Details, links, acceptance criteria…" disabled={!editable} />
                    <div className="pw-sec-head"><b><i className="mdi mdi-format-list-checks"></i>Checklist</b>{t.checklist.length > 0 && <small>{doneCount}/{t.checklist.length}</small>}</div>
                    {t.checklist.length > 0 && <div className="pw-bar"><i style={{ width: `${(doneCount / t.checklist.length) * 100}%` }}></i></div>}
                    <ul className="pw-check">
                        {t.checklist.map((c, i) => (
                            <li key={i} className={c.done ? 'done' : ''}>
                                <button type="button" onClick={() => toggleItem(i)} disabled={!editable} aria-label={c.done ? 'Mark not done' : 'Mark done'}><i className={`mdi ${c.done ? 'mdi-checkbox-marked-circle' : 'mdi-checkbox-blank-circle-outline'}`}></i></button>
                                <span>{c.text}</span>
                                {editable && <button type="button" className="pw-rm" onClick={() => setT((x) => ({ ...x, checklist: x.checklist.filter((_, j) => j !== i) }))} aria-label="Remove"><i className="mdi mdi-close"></i></button>}
                            </li>
                        ))}
                    </ul>
                    {editable && <div className="pw-inline"><input className="pp-input" value={newItem} onChange={(e) => setNewItem(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem() } }} placeholder="Add an item and press Enter" /><button type="button" className="pp-btn" onClick={addItem}><i className="mdi mdi-plus"></i></button></div>}

                    {!isNew && (
                        <>
                            <div className="pw-sec-head"><b><i className="mdi mdi-comment-text-multiple-outline"></i>Comments</b><small>{comments.length}</small></div>
                            <ul className="pw-comments">
                                {comments.map((c, i) => <li key={c._id || i}><Avatar person={c.employeeId} size={28} /><div><b>{fullName(c.employeeId)}</b><small>{fmtDay(c.createdAt)} {fmtTime(c.createdAt)}</small><p>{c.message}</p></div></li>)}
                                {!comments.length && <li className="pw-muted">No comments yet.</li>}
                            </ul>
                            <div className="pw-inline"><input className="pp-input" value={comment} onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendComment() } }} placeholder="Write a comment…" /><button type="button" className="pp-btn primary" onClick={sendComment} disabled={!comment.trim()}><i className="mdi mdi-send"></i></button></div>
                        </>
                    )}
                </div>
                <aside className="pw-task-side">
                    <label className="pw-field"><span>Status</span><select className="pp-select" value={t.status} onChange={set('status')} disabled={!editable}>{TASK_COLUMNS.map((s) => <option key={s}>{s}</option>)}</select></label>
                    <label className="pw-field"><span>Assigned to</span>
                        <select className="pp-select" value={t.assignedTo} onChange={set('assignedTo')} disabled={!canManage && !isNew}>
                            <option value="">Unassigned</option>
                            {members.filter((m) => canManage || m._id === me).map((m) => <option key={m._id} value={m._id}>{fullName(m)}</option>)}
                        </select>
                    </label>
                    <label className="pw-field"><span>Type</span><select className="pp-select" value={t.type} onChange={set('type')} disabled={!editable}>{TASK_TYPES.map((x) => <option key={x}>{x}</option>)}</select></label>
                    <label className="pw-field"><span>Priority</span><select className="pp-select" value={t.priority} onChange={set('priority')} disabled={!editable}>{['Low', 'Medium', 'High'].map((p) => <option key={p}>{p}</option>)}</select></label>
                    <label className="pw-field"><span>Due date</span><input type="date" className="pp-input" value={t.dueDate} onChange={set('dueDate')} disabled={!editable} /></label>
                    <label className="pw-field"><span>Estimate (hours)</span><input type="number" min="0" step="0.5" className="pp-input" value={t.estimatedHours} onChange={set('estimatedHours')} disabled={!editable} /></label>
                    <label className="pw-field"><span>Labels</span><input className="pp-input" value={t.labels} onChange={set('labels')} placeholder="e.g. Fieldwork, Urgent" disabled={!editable} /></label>
                    {!isNew && <div className="pw-meta"><span><i className="mdi mdi-timer-outline"></i>{hm(task.loggedMinutes)} logged</span>{task.createdBy && <span><i className="mdi mdi-account-plus-outline"></i>by {fullName(task.createdBy)}</span>}{task.dueDate && <DueTag date={task.dueDate} done={task.status === 'Done'} />}</div>}
                </aside>
            </div>
        </Modal>
    )
}

/* ---------------- work timer with location ---------------- */
export const useTick = (on, ms = 1000) => {
    const [n, setN] = useState(Date.now())
    useEffect(() => { if (!on) return undefined; const t = setInterval(() => setN(Date.now()), ms); return () => clearInterval(t) }, [on, ms])
    return n
}
const clock = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` }

export const TimerCard = ({ project, tasks, myTimer, me, onChanged, disabled }) => {
    const runningHere = myTimer && (myTimer.projectId?._id || myTimer.projectId) === project._id
    const runningElsewhere = myTimer && !runningHere
    const [taskId, setTaskId] = useState('')
    const [note, setNote] = useState('')
    const [busy, setBusy] = useState('')
    const [err, setErr] = useState('')
    const myOpen = tasks.filter((t) => t.status !== 'Done' && (t.assignedTo?._id || t.assignedTo) === me)

    const go = async (action) => {
        setErr(''); setBusy('Getting your location…')
        try {
            const loc = await getCurrentLocation()
            setBusy(action === 'start' ? 'Starting…' : 'Stopping…')
            const j = await api('POST', `/projects/${project._id}/timer/${action}`, action === 'start' ? { ...loc, taskId: taskId || undefined } : { ...loc, note })
            setNote(''); onChanged(j.message, action === 'stop')
        } catch (e) { setErr(e.message) }
        setBusy('')
    }
    return (
        <section className={`pw-timer ${runningHere ? 'on' : ''}`}>
            <div className="pw-timer-head">
                <span className="pw-timer-ic"><i className="mdi mdi-timer-outline"></i></span>
                <div><b>Work timer</b><small>{runningHere ? `Started ${fmtTime(myTimer.startTime)}${myTimer.taskId?.title ? ` · ${myTimer.taskId.title}` : ''}` : 'Your location is recorded when you start and stop'}</small></div>
                {runningHere && <span className="pw-clock"><i className="pw-dot"></i><Live>{(n) => clock(n - new Date(myTimer.startTime))}</Live></span>}
            </div>
            {runningHere ? (
                <>
                    {myTimer.startLocation && <p className="pw-timer-place"><i className="mdi mdi-map-marker-check-outline"></i><span>Started at {placeText(myTimer.startLocation) || 'your location'}</span></p>}
                    <div className="pw-inline"><input className="pp-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you work on? (optional)" /><button type="button" className="pw-stop" disabled={!!busy} onClick={() => go('stop')}><i className="mdi mdi-stop"></i>{busy || 'Stop'}</button></div>
                </>
            ) : runningElsewhere ? (
                <p className="pw-timer-note"><i className="mdi mdi-information-outline"></i>Your timer is running on “{myTimer.projectId?.projectName}”. Stop it there first.</p>
            ) : (
                <div className="pw-inline">
                    <select className="pp-select" value={taskId} onChange={(e) => setTaskId(e.target.value)} disabled={disabled}>
                        <option value="">General project work</option>
                        {myOpen.map((t) => <option key={t._id} value={t._id}>{t.title}</option>)}
                    </select>
                    <button type="button" className="pw-start" disabled={!!busy || disabled} onClick={() => go('start')}><i className="mdi mdi-play"></i>{busy || 'Start'}</button>
                </div>
            )}
            {err && <p className="pw-err block"><i className="mdi mdi-alert-circle-outline"></i>{err}</p>}
        </section>
    )
}

/* ---------------- close / reopen with a note ---------------- */
// A Done task is closed with a note (what was done, or why it's closed) and moves to the
// closed history. Reopening asks for the reason. `tasks` can be several for bulk close.
const CLOSE_REASONS = ['Completed and reviewed', 'Client confirmed', 'Duplicate of another task', 'No longer needed']
export const CloseTaskModal = ({ tasks, mode = 'close', onClose, onDone }) => {
    const [note, setNote] = useState('')
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState('')
    const one = tasks.length === 1 ? tasks[0] : null
    const reopen = mode === 'reopen'
    const go = async () => {
        if (note.trim().length < 3) return setErr(reopen ? 'Say why it’s being reopened.' : 'Add a closing note.')
        setBusy(true); setErr('')
        try {
            const j = reopen ? await api('POST', `/tasks/${one._id}/reopen`, { note })
                : one ? await api('POST', `/tasks/${one._id}/close`, { note })
                    : await api('PUT', '/tasks/bulk-close', { ids: tasks.map((t) => t._id), note })
            onDone(j.message)
        } catch (e) { setErr(e.message); setBusy(false) }
    }
    return (
        <Modal title={reopen ? `Reopen ${taskTag(one)}` : one ? `Close ${taskTag(one)}` : `Close ${tasks.length} tasks`} sub={one ? one.title : 'They move to the closed history with this note'}
            icon={<span className="pw-dicon" style={{ '--c': reopen ? '#d97706' : '#059669' }}><i className={`mdi ${reopen ? 'mdi-restore' : 'mdi-archive-arrow-down-outline'}`}></i></span>} onClose={onClose}
            footer={<>{err && <span className="pw-err">{err}</span>}<button type="button" className="pp-btn" onClick={onClose}>Cancel</button><button type="button" className="pp-btn primary" disabled={busy} onClick={go}><i className={`mdi ${reopen ? 'mdi-restore' : 'mdi-archive-arrow-down-outline'}`}></i>{busy ? 'Saving…' : reopen ? 'Reopen' : 'Close'}</button></>}>
            <p className="pw-close-hint">{reopen ? 'It goes back on the board as In Progress. Everyone on the task is told why.' : 'Closed tasks leave the board and are kept in the Closed history with this note. They can be reopened later.'}</p>
            {!reopen && <div className="pw-close-chips">{CLOSE_REASONS.map((r) => <button key={r} type="button" onClick={() => setNote((n) => (n ? `${n} ${r}` : r))}>{r}</button>)}</div>}
            <textarea className="pp-input" rows={4} autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder={reopen ? 'Why is it being reopened?' : 'Closing note — what was done, the outcome, or why it’s closed'} />
        </Modal>
    )
}
