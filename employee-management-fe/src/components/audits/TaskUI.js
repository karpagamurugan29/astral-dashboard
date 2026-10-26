import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { chatApi as api, downloadFile } from '../chat/chatApi'
import { toast } from '../common/Toaster'
import { Avatar, fullName, fmtDate } from '../people/PeopleUI'
import './TaskUI.css'

/* Shared audit-task UI: status colours, the status pill and the task drawer (used by the audit
   page, My Work and Work allocation). What a person may do comes from the server (task.actions). */

export const TASK_STATUS = {
    'Not Started': { c: '#94a3b8', i: 'mdi-circle-outline' },
    Assigned: { c: '#64748b', i: 'mdi-account-clock-outline' },
    Ready: { c: '#0284c7', i: 'mdi-play-circle-outline' },
    'In Progress': { c: '#2563eb', i: 'mdi-progress-clock' },
    Blocked: { c: '#dc2626', i: 'mdi-hand-back-left-outline' },
    Submitted: { c: '#7c3aed', i: 'mdi-send-check-outline' },
    'Under Review': { c: '#9333ea', i: 'mdi-magnify-scan' },
    'Changes Requested': { c: '#ea580c', i: 'mdi-pencil-circle-outline' },
    Approved: { c: '#059669', i: 'mdi-check-decagram' },
    Completed: { c: '#10b981', i: 'mdi-check-circle' },
    Cancelled: { c: '#cbd5e1', i: 'mdi-cancel' },
}
export const DONE = ['Approved', 'Completed']
export const PRIORITY_C = { Low: '#64748b', Medium: '#0284c7', High: '#ea580c', Critical: '#dc2626' }
export const TaskPill = ({ status, small }) => {
    const m = TASK_STATUS[status] || TASK_STATUS['Not Started']
    return <span className={`atk-pill ${small ? 'sm' : ''}`} style={{ '--c': m.c }}><i className={`mdi ${m.i}`}></i>{status}</span>
}
const ACTION_TONE = { approve: 'ok', complete: 'ok', submit: 'primary', start: 'primary', resume: 'primary', unblock: 'primary', startReview: 'primary', requestChanges: 'warn', block: 'warn', cancel: 'danger', reopen: 'warn', restore: '' }
const ACTION_ICON = { start: 'mdi-play', resume: 'mdi-play', unblock: 'mdi-play', submit: 'mdi-send', complete: 'mdi-check', startReview: 'mdi-magnify', approve: 'mdi-check-decagram', requestChanges: 'mdi-pencil', block: 'mdi-hand-back-left-outline', reopen: 'mdi-restore', cancel: 'mdi-cancel', restore: 'mdi-backup-restore' }
const when = (d) => (d ? new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '')
const dur = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m` : `${Math.round(m)}m`)
const idOf = (p) => p?._id || p
const HIST = { created: 'created the task', assigned: 'assigned it', reassigned: 'reassigned it', reviewer: 'changed the reviewer', unassigned: 'unassigned it', start: 'started it', resume: 'resumed work', block: 'marked it blocked', unblock: 'unblocked it', submit: 'submitted it for review', complete: 'completed it', startReview: 'started reviewing', requestChanges: 'requested changes', approve: 'approved it', reopen: 'reopened it', cancel: 'cancelled it', restore: 'restored it', workpaper: 'added a workpaper', clarification: 'asked for clarification', escalated: 'escalated (overdue)', 'blocked-escalated': 'escalated (blocked 2+ days)', migrated: 'updated from a new template version' }

/* ---------------- the drawer ---------------- */

// audit: the engagement as returned by GET /audits/:id (or { _id, auditCode, clientName, access, team })
export const TaskDrawer = ({ audit, task: initial, tasks = [], logs = [], people = [], onClose, onChanged }) => {
    const [t, setT] = useState(initial)
    const [busy, setBusy] = useState(false)
    const [pending, setPending] = useState(null) // action that needs a note
    const [note, setNote] = useState('')
    const [comment, setComment] = useState('')
    const [kind, setKind] = useState('comment')
    const [tab, setTab] = useState('work')
    const fileRef = useRef(null)
    useEffect(() => setT(initial), [initial])
    useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])
    const base = `/audits/${audit._id}/tasks/${t.key}`
    const manage = !!audit.access?.manage
    const workpapers = audit.access?.workpapers !== false
    const run = async (fn, ok) => {
        setBusy(true)
        try { const j = await fn(); if (j.data) setT((x) => ({ ...x, ...j.data })); toast.success(ok || j.message); onChanged?.(); return true } catch (e) { toast.error(e.message); return false } finally { setBusy(false) }
    }
    const doAction = async (a, text = '') => {
        if (await run(() => api('POST', `${base}/action`, { action: a.action, note: text, override: !!a.override }))) { setPending(null); setNote('') }
    }
    const pick = (a) => (a.needs ? (setPending(a), setNote('')) : doAction(a))
    const myLogs = useMemo(() => logs.filter((l) => l.milestoneKey === t.key), [logs, t.key])
    const loggedMin = myLogs.reduce((s, l) => s + (l.endTime ? l.durationMinutes || 0 : (Date.now() - new Date(l.startTime)) / 60000), 0)
    const deps = (t.dependsOn || []).map((k) => tasks.find((x) => x.key === k)).filter(Boolean)
    const blocking = tasks.filter((x) => (x.dependsOn || []).includes(t.key))
    const est = (t.estimatedHours || 0) * 60
    const overdue = t.dueDate && !DONE.includes(t.status) && t.status !== 'Cancelled' && new Date(t.dueDate) < new Date(new Date().toDateString())
    const canWork = idOf(t.assignee) === audit.me || manage

    return createPortal(
        <div className="atk-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <aside className="atk-drawer" role="dialog" aria-modal="true" aria-label={t.label}>
                <header className="atk-head" style={{ '--c': (TASK_STATUS[t.status] || {}).c }}>
                    <div>
                        <small>{audit.clientName ? `${audit.clientName} · ` : ''}{audit.auditCode} · {t.stage}</small>
                        <h3>{t.label}</h3>
                        <div className="atk-tags">
                            <TaskPill status={t.status} />
                            <span className="atk-prio" style={{ '--c': PRIORITY_C[t.priority] || '#64748b' }}>{t.priority}</span>
                            {t.requiresReview && <span className="atk-flag"><i className="mdi mdi-account-check-outline"></i>Needs review</span>}
                            {t.requiresEvidence && <span className="atk-flag"><i className="mdi mdi-paperclip"></i>Evidence required</span>}
                            {t.optional && <span className="atk-flag">Optional</span>}
                            {overdue && <span className="atk-flag bad"><i className="mdi mdi-alarm"></i>Overdue</span>}
                        </div>
                    </div>
                    <button type="button" className="atk-x" onClick={onClose} aria-label="Close"><i className="mdi mdi-close"></i></button>
                </header>

                {(t.actions || []).length > 0 && (
                    <div className="atk-actions">
                        {t.actions.map((a) => <button key={a.action} type="button" disabled={busy} className={`atk-btn ${ACTION_TONE[a.action] || ''}`} onClick={() => pick(a)}><i className={`mdi ${ACTION_ICON[a.action] || 'mdi-arrow-right'}`}></i>{a.label}</button>)}
                    </div>
                )}
                {pending && (
                    <div className="atk-needs">
                        <label htmlFor="atk-note">{pending.needs}</label>
                        <textarea id="atk-note" rows={3} className="pp-input" autoFocus value={note} onChange={(e) => setNote(e.target.value)}></textarea>
                        <div><button type="button" className="pp-btn sm" onClick={() => setPending(null)}>Cancel</button><button type="button" className={`pp-btn sm ${pending.action === 'cancel' ? 'danger' : 'primary'}`} disabled={busy || !note.trim()} onClick={() => doAction(pending, note.trim())}>{pending.label}</button></div>
                    </div>
                )}
                {t.status === 'Blocked' && t.blockedReason && <p className="atk-banner bad"><i className="mdi mdi-hand-back-left-outline"></i><span><b>Blocked:</b> {t.blockedReason}</span></p>}
                {t.status === 'Changes Requested' && <p className="atk-banner warn"><i className="mdi mdi-pencil-circle-outline"></i><span><b>Changes requested:</b> {[...(t.comments || [])].reverse().find((c) => c.kind === 'review')?.text || 'see comments'}</span></p>}

                <div className="atk-facts">
                    <div><small>Assigned to</small>{manage ? <PersonSelect people={people} value={idOf(t.assignee)} onChange={(v) => run(() => api('PUT', `${base}/assign`, { assignee: v || null }))} disabled={busy} /> : t.assignee ? <span className="atk-who"><Avatar person={t.assignee} size={22} />{fullName(t.assignee)}</span> : <span className="atk-muted">Unassigned</span>}</div>
                    <div><small>Reviewer</small>{manage ? <PersonSelect people={people} value={idOf(t.reviewer)} empty={t.requiresReview ? 'Engagement manager' : 'No reviewer'} onChange={(v) => run(() => api('PUT', `${base}/assign`, { reviewer: v || null }))} disabled={busy} /> : t.reviewer ? <span className="atk-who"><Avatar person={t.reviewer} size={22} />{fullName(t.reviewer)}</span> : <span className="atk-muted">{t.requiresReview ? 'Engagement manager' : '—'}</span>}</div>
                    <div><small>Due</small>{manage ? <input type="date" className="pp-input" value={t.dueDate ? String(t.dueDate).slice(0, 10) : ''} onChange={(e) => run(() => api('PUT', `${base}/assign`, { dueDate: e.target.value || null }))} /> : <span className={overdue ? 'atk-bad' : ''}>{t.dueDate ? fmtDate(t.dueDate) : '—'}</span>}</div>
                    <div><small>Hours</small><span className={est && loggedMin > est ? 'atk-bad' : ''}><b>{dur(loggedMin)}</b>{est ? ` of ${t.estimatedHours}h` : ''}</span>{est > 0 && <span className="atk-bar"><i style={{ width: `${Math.min(100, (loggedMin / est) * 100)}%`, background: loggedMin > est ? '#dc2626' : undefined }}></i></span>}</div>
                    {(t.responsibleRole || t.reviewerRole) && <div><small>Roles</small><span>{t.responsibleRole || '—'}{t.reviewerRole ? ` → ${t.reviewerRole}` : ''}</span></div>}
                    {(t.location || manage) && <div><small>Work location</small>{manage ? <input className="pp-input" defaultValue={t.location || ''} placeholder="Office / client site" onBlur={(e) => e.target.value !== (t.location || '') && run(() => api('PUT', `${base}/assign`, { location: e.target.value }))} /> : <span>{t.location}</span>}</div>}
                </div>

                <nav className="atk-tabs" role="tablist">
                    {[['work', 'Work'], ...(workpapers ? [['talk', `Comments${t.comments?.length ? ` · ${t.comments.length}` : ''}`]] : []), ['time', `Time · ${myLogs.length}`], ...(workpapers ? [['history', 'History']] : [])].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
                </nav>

                <div className="atk-body">
                    {tab === 'work' && (
                        <>
                            {(t.description || t.instructions) && <section><h4>Instructions</h4>{t.description && <p>{t.description}</p>}{t.instructions && <p className="atk-pre">{t.instructions}</p>}</section>}
                            {deps.length > 0 && <section><h4>Waits for</h4><ul className="atk-deps">{deps.map((d) => <li key={d.key}><TaskPill status={d.status} small />{d.label}</li>)}</ul>{t.overrideNote && <p className="atk-muted">Started early: “{t.overrideNote}”</p>}</section>}
                            {blocking.length > 0 && <section><h4>Needed before</h4><ul className="atk-deps">{blocking.map((d) => <li key={d.key}><TaskPill status={d.status} small />{d.label}</li>)}</ul></section>}
                            {(t.deliverables || []).length > 0 && <section><h4>Deliverables</h4><ul className="atk-list">{t.deliverables.map((d) => <li key={d}><i className="mdi mdi-file-document-outline"></i>{d}</li>)}</ul></section>}
                            {(t.checklist || []).length > 0 && (
                                <section><h4>Checklist <em>{t.checklist.filter((c) => c.done).length}/{t.checklist.length}</em></h4>
                                    <ul className="atk-check">{t.checklist.map((c, i) => (
                                        <li key={i} className={c.done ? 'done' : ''}><button type="button" disabled={!canWork || busy || DONE.includes(t.status)} onClick={() => run(() => api('PUT', `${base}/checklist/${i}`, { done: !c.done }))} aria-label={`${c.done ? 'Untick' : 'Tick'} ${c.text}`}><i className={`mdi ${c.done ? 'mdi-checkbox-marked' : 'mdi-checkbox-blank-outline'}`}></i></button>{c.text}</li>
                                    ))}</ul>
                                </section>
                            )}
                            {workpapers && (
                                <section>
                                    <h4>Workpapers &amp; evidence {canWork && <button type="button" className="atk-link" onClick={() => fileRef.current?.click()}><i className="mdi mdi-upload"></i>Upload</button>}</h4>
                                    <input ref={fileRef} type="file" multiple hidden onChange={(e) => { const fd = new FormData(); [...e.target.files].forEach((f) => fd.append('files', f)); e.target.value = ''; run(() => api('POST', `${base}/files`, fd)) }} />
                                    {!(t.attachments || []).length ? <p className="atk-muted">{t.requiresEvidence ? 'Evidence is required before this task can be submitted.' : 'No files yet.'}</p> : (
                                        <ul className="atk-files">{[...t.attachments].reverse().map((f) => (
                                            <li key={f.fileId}><button type="button" onClick={() => downloadFile({ url: f.url || `${base}/files/${f.fileId}`, name: f.name }).catch((er) => toast.error(er.message))}><i className="mdi mdi-file-outline"></i><span>{f.name}</span>{f.version > 1 && <em>v{f.version}</em>}</button><small>{f.uploadedBy ? `${f.uploadedBy.firstName || ''} · ` : ''}{when(f.uploadedAt)}</small></li>
                                        ))}</ul>
                                    )}
                                </section>
                            )}
                            {!t.description && !t.instructions && !deps.length && !(t.checklist || []).length && !(t.deliverables || []).length && !workpapers && <p className="atk-muted">No instructions for this task.</p>}
                        </>
                    )}
                    {tab === 'talk' && (
                        <>
                            <ol className="atk-thread">
                                {!(t.comments || []).length && <li className="atk-muted">No comments yet.</li>}
                                {(t.comments || []).map((c) => (
                                    <li key={c._id} className={`k-${c.kind} ${c.resolved ? 'resolved' : ''}`}>
                                        <Avatar person={c.by} size={26} />
                                        <div><div className="by"><b>{fullName(c.by)}</b>{c.kind !== 'comment' && <span className="kind">{{ review: 'Review', clarification: 'Clarification', blocker: 'Blocker', reply: 'Reply' }[c.kind]}</span>}<time>{when(c.at)}</time></div><p>{c.text}</p>
                                            {!c.resolved && ['review', 'clarification', 'blocker'].includes(c.kind) && <button type="button" className="atk-link" onClick={() => run(() => api('PUT', `${base}/comments/${c._id}/resolve`))}>Mark resolved</button>}
                                            {c.resolved && <small className="atk-muted">Resolved</small>}
                                        </div>
                                    </li>
                                ))}
                            </ol>
                            <form className="atk-compose" onSubmit={(e) => { e.preventDefault(); if (comment.trim()) run(() => api('POST', `${base}/comments`, { text: comment.trim(), kind }), kind === 'clarification' ? 'Clarification sent to the manager.' : 'Comment added.').then((ok) => ok && setComment('')) }}>
                                <div className="atk-seg">{[['comment', 'Comment'], ['clarification', 'Ask for clarification']].map(([k, l]) => <button key={k} type="button" className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{l}</button>)}</div>
                                <textarea rows={2} className="pp-input" value={comment} onChange={(e) => setComment(e.target.value)} placeholder={kind === 'clarification' ? 'What do you need clarified? The manager and reviewer are notified.' : 'Write a comment…'}></textarea>
                                <button type="submit" className="pp-btn sm primary" disabled={busy || !comment.trim()}><i className="mdi mdi-send"></i>Send</button>
                            </form>
                        </>
                    )}
                    {tab === 'time' && (
                        !myLogs.length ? <p className="atk-muted">No time logged on this task yet. Pick it when you start the timer, or add it on your timesheet.</p> : (
                            <ul className="atk-time">{myLogs.map((l) => (
                                <li key={l._id}><Avatar person={l.employeeId} size={22} /><span>{fullName(l.employeeId)}</span><small>{fmtDate(l.startTime)}{l.entryType === 'manual' ? ' · manual' : ''}</small><em className={`ts-${(l.status || 'Draft').toLowerCase()}`}>{l.status || 'Draft'}</em><b>{l.endTime ? dur(l.durationMinutes || 0) : 'running'}</b></li>
                            ))}</ul>
                        )
                    )}
                    {tab === 'history' && (
                        <ol className="atk-hist">{[...(t.history || [])].reverse().map((h, i) => (
                            <li key={h._id || i}><i className="mdi mdi-circle-small"></i><div><span><b>{h.by ? `${h.by.firstName || ''} ${h.by.lastName || ''}`.trim() || 'Someone' : 'System'}</b> {HIST[h.action] || h.action}{h.from && h.to && h.from !== h.to ? <> — {h.from} → <b>{h.to}</b></> : null}</span>{h.note && <small>“{h.note}”</small>}<time>{when(h.at)}</time></div></li>
                        ))}</ol>
                    )}
                </div>
                {audit._id && <footer className="atk-foot"><Link to={`/audits/${audit._id}?tab=workflow&task=${t.key}`} onClick={onClose}>Open engagement <i className="mdi mdi-arrow-right"></i></Link></footer>}
            </aside>
        </div>,
        document.body
    )
}

export const PersonSelect = ({ people, value, onChange, empty = 'Unassigned', disabled }) => (
    <select className="pp-select" value={value || ''} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        <option value="">{empty}</option>
        {people.map((p) => <option key={p._id} value={p._id}>{fullName(p)}{p.designation ? ` — ${p.designation}` : ''}</option>)}
    </select>
)

// Opens a task from anywhere (My Work, allocation): loads its engagement first.
export const TaskDrawerLoader = ({ auditId, taskKey, me, onClose, onChanged }) => {
    const [d, setD] = useState(null)
    const load = () => api('GET', `/audits/${auditId}`).then((j) => setD(j.data)).catch((e) => { toast.error(e.message); onClose() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { load() }, [auditId])
    if (!d) return createPortal(<div className="atk-overlay"><aside className="atk-drawer"><div className="atk-body"><div className="pp-skel" style={{ height: 120 }}></div></div></aside></div>, document.body)
    const task = d.milestones.find((x) => x.key === taskKey)
    if (!task) return null
    const people = [d.auditManager, ...(d.teamMembers || [])].filter(Boolean)
    return <TaskDrawer audit={{ ...d, me }} task={task} tasks={d.milestones} logs={d.logs} people={people} onClose={onClose} onChanged={() => { load(); onChanged?.() }} />
}
