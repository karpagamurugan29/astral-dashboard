import React, { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { Avatar, fullName } from '../../../components/people/PeopleUI'
import { TASK_COLUMNS, TASK_STATUS, PriorityTag, DueTag } from '../../../components/projects/ProjectUI'
import { toast } from '../../../components/common/Toaster'
import { api, taskTag, TaskModal, fmtDay, CloseTaskModal } from './ProjectParts'

/* The full view of one task, bug-tracker style: details, description, checklist, notes,
   who's monitoring it and the complete history of changes. Change status with a note,
   monitor / stop monitoring, or edit everything in the project's task screen. */

export const TYPE_META = {
    Task: ['mdi-checkbox-marked-circle-outline', '#1e40af'],
    Issue: ['mdi-bug-outline', '#e11d48'],
    Query: ['mdi-help-circle-outline', '#d97706'],
    'Review point': ['mdi-comment-check-outline', '#7c3aed'],
}
export const TypeTag = ({ type = 'Task' }) => {
    const [ic, c] = TYPE_META[type] || TYPE_META.Task
    return <span className="it-type" style={{ '--c': c }}><i className={`mdi ${ic}`}></i>{type}</span>
}
const when = (d) => (d ? new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '')
const HISTORY = {
    created: (h) => <>created the task as <b>{h.to}</b></>,
    status: (h) => <>changed status <s>{h.from}</s> → <b>{h.to}</b></>,
    assigned: (h) => <>reassigned <s>{h.from}</s> → <b>{h.to}</b></>,
    priority: (h) => <>changed priority <s>{h.from}</s> → <b>{h.to}</b></>,
    type: (h) => <>changed type <s>{h.from}</s> → <b>{h.to}</b></>,
    title: (h) => <>renamed it to <b>{h.to}</b></>,
    due: (h) => <>moved the due date <s>{h.from}</s> → <b>{h.to}</b></>,
    checklist: (h) => <>updated the checklist <s>{h.from}</s> → <b>{h.to}</b></>,
    note: () => <>added a note</>,
    watch: (h) => <>{h.to}</>,
    closed: () => <>closed the task</>,
    reopened: () => <>reopened the task</>,
}

export const IssueView = ({ id, me, onClose, onChanged, onTimer, timerOn }) => {
    const [d, setD] = useState(null)
    const [tab, setTab] = useState('notes')
    const [status, setStatus] = useState('')
    const [note, setNote] = useState('')
    const [busy, setBusy] = useState('')
    const [edit, setEdit] = useState(false)
    const [closing, setClosing] = useState(null) // 'close' | 'reopen'

    const load = useCallback(() => api('GET', `/tasks/${id}`).then((j) => { setD(j); setStatus(j.data.status) }).catch((e) => { toast.error(e.message, { title: 'Couldn’t open the task' }); onClose() }), [id, onClose])
    useEffect(() => { load() }, [load])
    useEffect(() => { const k = (e) => e.key === 'Escape' && !edit && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose, edit])

    if (!d) return createPortal(<div className="pp it-overlay"><aside className="it-drawer"><div className="pw-loading"><i className="mdi mdi-loading mdi-spin"></i></div></aside></div>, document.body)
    const t = d.data
    const st = TASK_STATUS[t.status] || TASK_STATUS['To Do']
    const p = t.projectId

    const changeStatus = async () => {
        if (status === t.status && !note.trim()) return
        setBusy('status')
        try {
            if (status !== t.status) await api('PUT', `/tasks/${t._id}/move`, { status, note })
            else await api('POST', `/tasks/${t._id}/comments`, { message: note })
            toast.success(status !== t.status ? `${taskTag(t)} → ${status}` : 'Your note is added.', { title: status !== t.status ? 'Status changed' : 'Note added' })
            setNote(''); await load(); onChanged?.()
        } catch (e) { toast.error(e.message) }
        setBusy('')
    }
    const watch = async () => {
        try { const j = await api('POST', `/tasks/${t._id}/watch`); toast.info(j.message, { title: j.data.watching ? 'Monitoring' : 'Not monitoring' }); await load(); onChanged?.() } catch (e) { toast.error(e.message) }
    }
    const toggleItem = async (i) => {
        if (!d.canEdit) return
        const checklist = t.checklist.map((c, j) => (j === i ? { ...c, done: !c.done } : c))
        setD((x) => ({ ...x, data: { ...x.data, checklist } }))
        try { await api('PUT', `/tasks/${t._id}`, { checklist }); load(); onChanged?.() } catch (e) { toast.error(e.message); load() }
    }
    const done = (t.checklist || []).filter((c) => c.done).length

    return createPortal(
        <div className="pp it-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <aside className="it-drawer" role="dialog" aria-modal="true" aria-label={t.title} style={{ '--c': st.color }}>
                <header className="it-head">
                    <div className="it-head-top">
                        <span className="it-no">{taskTag(t)}</span>
                        <TypeTag type={t.type} />
                        <span className="it-status"><i className={`mdi ${t.closedAt ? 'mdi-archive-arrow-down-outline' : st.icon}`}></i>{t.closedAt ? 'Closed' : t.status}</span>
                        <button type="button" className="it-x" onClick={onClose} aria-label="Close"><i className="mdi mdi-close"></i></button>
                    </div>
                    <h2>{t.title}</h2>
                    {p && <Link to={`/projects/${p._id}`} className="it-proj"><i className="mdi mdi-folder-outline"></i>{p.projectCode} · {p.projectName}<i className="mdi mdi-chevron-right"></i></Link>}
                    <div className="it-tools">
                        <button type="button" className={`it-tool ${t.watching ? 'on' : ''}`} onClick={watch}><i className={`mdi ${t.watching ? 'mdi-eye' : 'mdi-eye-outline'}`}></i>{t.watching ? 'Monitoring' : 'Monitor'}</button>
                        {t.status !== 'Done' && !timerOn && p && <button type="button" className="it-tool" onClick={() => onTimer({ ...t, projectId: p })}><i className="mdi mdi-timer-outline"></i>Start timer</button>}
                        {d.canEdit && !t.closedAt && <button type="button" className="it-tool" onClick={() => setEdit(true)}><i className="mdi mdi-pencil-outline"></i>Edit</button>}
                        {d.canEdit && !t.closedAt && t.status === 'Done' && <button type="button" className="it-tool close" onClick={() => setClosing('close')}><i className="mdi mdi-archive-arrow-down-outline"></i>Close task</button>}
                        {d.canEdit && t.closedAt && <button type="button" className="it-tool" onClick={() => setClosing('reopen')}><i className="mdi mdi-restore"></i>Reopen</button>}
                    </div>
                </header>

                <div className="it-body">
                    {t.closedAt && (
                        <div className="it-closed">
                            <i className="mdi mdi-archive-arrow-down-outline"></i>
                            <div><b>Closed {fmtDay(t.closedAt)}{t.closedBy ? ` by ${fullName(t.closedBy)}` : ''}</b>{t.closeNote && <p>{t.closeNote}</p>}</div>
                        </div>
                    )}
                    {!t.closedAt && t.status === 'Done' && d.canEdit && (
                        <div className="it-ready">
                            <i className="mdi mdi-check-decagram-outline"></i>
                            <div><b>This task is done</b><p>Close it with a note to move it off the board and into the closed history.</p></div>
                            <button type="button" className="pp-btn primary sm" onClick={() => setClosing('close')}><i className="mdi mdi-archive-arrow-down-outline"></i>Close</button>
                        </div>
                    )}
                    <dl className="it-grid">
                        <div><dt>Assigned to</dt><dd>{t.assignedTo ? <span className="it-person"><Avatar person={t.assignedTo} size={22} />{fullName(t.assignedTo)}</span> : <em>Nobody</em>}</dd></div>
                        <div><dt>Reported by</dt><dd>{t.createdBy ? fullName(t.createdBy) : '—'}</dd></div>
                        <div><dt>Priority</dt><dd><PriorityTag priority={t.priority} /></dd></div>
                        <div><dt>Due</dt><dd>{t.dueDate ? <><span>{fmtDay(t.dueDate)}</span> <DueTag date={t.dueDate} done={t.status === 'Done'} /></> : '—'}</dd></div>
                        <div><dt>Created</dt><dd>{when(t.createdAt)}</dd></div>
                        <div><dt>Updated</dt><dd>{when(t.updatedAt)}</dd></div>
                        {t.estimatedHours ? <div><dt>Estimate</dt><dd>{t.estimatedHours}h</dd></div> : null}
                        {(t.labels || []).length > 0 && <div><dt>Labels</dt><dd className="it-labels">{t.labels.map((l) => <span key={l}>{l}</span>)}</dd></div>}
                    </dl>

                    <section className="it-sec">
                        <h4>Description</h4>
                        {t.description ? <p className="it-desc">{t.description}</p> : <p className="it-muted">No description.</p>}
                    </section>

                    {(t.checklist || []).length > 0 && (
                        <section className="it-sec">
                            <h4>Checklist <span>{done}/{t.checklist.length}</span></h4>
                            <div className="it-bar"><i style={{ width: `${(done / t.checklist.length) * 100}%` }}></i></div>
                            <ul className="it-check">{t.checklist.map((c, i) => <li key={i} className={c.done ? 'done' : ''}><button type="button" onClick={() => toggleItem(i)} disabled={!d.canEdit}><i className={`mdi ${c.done ? 'mdi-checkbox-marked' : 'mdi-checkbox-blank-outline'}`}></i></button><span>{c.text}</span></li>)}</ul>
                        </section>
                    )}

                    {/* change status, bug-tracker style: pick the new status, add a note, apply */}
                    {d.canEdit && !t.closedAt && (
                        <section className="it-sec it-change">
                            <h4>Update</h4>
                            <div className="it-flow">{TASK_COLUMNS.map((s) => <button key={s} type="button" className={status === s ? 'on' : ''} style={{ '--s': TASK_STATUS[s].color }} onClick={() => setStatus(s)}><i className={`mdi ${TASK_STATUS[s].icon}`}></i>{s}</button>)}</div>
                            <textarea className="pp-input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={status !== t.status ? `Why is it moving to ${status}? (optional note)` : 'Add a note…'} />
                            <div className="it-change-foot"><button type="button" className="pp-btn primary" disabled={busy === 'status' || (status === t.status && !note.trim())} onClick={changeStatus}><i className="mdi mdi-check"></i>{status !== t.status ? `Change to ${status}` : 'Add note'}</button></div>
                        </section>
                    )}

                    <div className="it-tabs">
                        <button type="button" className={tab === 'notes' ? 'on' : ''} onClick={() => setTab('notes')}><i className="mdi mdi-comment-text-multiple-outline"></i>Notes <b>{(t.comments || []).length}</b></button>
                        <button type="button" className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}><i className="mdi mdi-history"></i>History <b>{(t.history || []).length}</b></button>
                        <button type="button" className={tab === 'watchers' ? 'on' : ''} onClick={() => setTab('watchers')}><i className="mdi mdi-eye-outline"></i>Monitoring <b>{(t.watchers || []).length}</b></button>
                    </div>
                    {tab === 'notes' && (
                        (t.comments || []).length ? <ul className="it-notes">{t.comments.map((c, i) => <li key={c._id || i}><Avatar person={c.employeeId} size={30} /><div><b>{fullName(c.employeeId)}<small>{when(c.createdAt)}</small></b><p>{c.message}</p></div></li>)}</ul>
                            : <p className="it-muted">No notes yet{d.canEdit ? ' — add one above.' : '.'}</p>
                    )}
                    {tab === 'history' && (
                        (t.history || []).length ? <ol className="it-history">{[...t.history].reverse().map((h, i) => <li key={h._id || i}><span className="it-hdot"></span><div><p><b>{h.by ? fullName(h.by) : 'Someone'}</b> {(HISTORY[h.action] || ((x) => x.action))(h)}</p>{h.note && h.action !== 'note' && <q>{h.note}</q>}{h.action === 'note' && h.note && <q>{h.note}</q>}<small>{when(h.at)}</small></div></li>)}</ol>
                            : <p className="it-muted">History starts with the next change.</p>
                    )}
                    {tab === 'watchers' && (
                        (t.watchers || []).length ? <ul className="it-watchers">{t.watchers.map((w) => <li key={w._id}><Avatar person={w} size={26} />{fullName(w)}{w._id === me && <em>You</em>}</li>)}</ul>
                            : <p className="it-muted">Nobody is monitoring this task.</p>
                    )}
                </div>
            </aside>
            {closing && <CloseTaskModal tasks={[t]} mode={closing} onClose={() => setClosing(null)} onDone={(msg) => { setClosing(null); toast.success(msg, { title: closing === 'reopen' ? 'Task reopened' : 'Closed' }); load(); onChanged?.() }} />}
            {edit && p && <TaskModal task={t} project={p} members={d.members} me={me} canManage={d.canManage} onClose={() => setEdit(false)}
                onSaved={(u, isNew, keepOpen) => { if (!keepOpen) { setEdit(false); toast.success('Your changes are saved.', { title: 'Task saved' }) } load(); onChanged?.() }}
                onDeleted={() => { setEdit(false); toast.success('The task was removed.', { title: 'Task deleted' }); onChanged?.(); onClose() }} />}
        </div>,
        document.body
    )
}
