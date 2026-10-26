import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PeopleShell, Avatar, EmptyState, fullName } from '../../../components/people/PeopleUI'
import { Modal } from '../projects/ProjectParts'
import { toast } from '../../../components/common/Toaster'
import { downloadFile } from '../../../components/chat/chatApi'
import {
    api, HELPDESK_ROOT, TICKET_STATUS, PRIORITY, StatusPill, PriorityPill, CategoryIcon, SlaBadge, useTicketMeta,
    checkFiles, fileSize, fmtMins, fmtWhen, ago,
} from '../../../components/helpdesk/HelpdeskUI'

/* One ticket: summary, conversation + activity, the moves this person may make (from the
   server), assignment and triage for HR, SLA, and feedback once resolved. */

const FLOW = ['Open', 'Assigned', 'In Progress', 'Resolved', 'Closed']
const flowIndex = (s) => ({ Open: 0, Reopened: 0, Assigned: 1, 'In Progress': 2, 'Pending Employee': 2, 'Pending HR': 2, Escalated: 2, Resolved: 3, Closed: 4, Rejected: 4 }[s] ?? 0)
const KIND = {
    'info-request': ['Information requested', 'mdi-account-question-outline', '#db2777'],
    resolution: ['Resolution', 'mdi-check-circle-outline', '#059669'],
    rejection: ['Rejected', 'mdi-close-octagon-outline', '#475569'],
    reopen: ['Reopened', 'mdi-restore', '#ea580c'],
    escalation: ['Escalation', 'mdi-arrow-up-bold-circle-outline', '#dc2626'],
    withdrawal: ['Withdrawn', 'mdi-undo-variant', '#64748b'],
}
const historyText = (h) => {
    switch (h.action) {
        case 'created': return 'raised the ticket'
        case 'assigned': return h.to === 'Unassigned' ? 'removed the assignee' : `assigned it to ${h.to}${h.from ? ` (was ${h.from})` : ''}`
        case 'status': return <>moved it {h.from && <>from <b>{h.from}</b> </>}to <b>{h.to}</b></>
        case 'priority': return <>changed priority <b>{h.from}</b> → <b>{h.to}</b></>
        case 'category': return <>moved it to <b>{h.to}</b></>
        case 'attachment': return h.note
        case 'feedback': return <>rated the resolution <b>{h.to}</b></>
        case 'sla': return <><b>{h.to}</b> — {h.note}</>
        default: return null
    }
}

const Stars = ({ value, onChange, size = 22 }) => (
    <span className="hd-stars" role={onChange ? 'radiogroup' : undefined} aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => onChange
            ? <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => onChange(n)} style={{ fontSize: size }}><i className={`mdi ${n <= value ? 'mdi-star' : 'mdi-star-outline'}`}></i></button>
            : <i key={n} className={`mdi ${n <= value ? 'mdi-star' : 'mdi-star-outline'}`} style={{ fontSize: size }}></i>)}
    </span>
)

const Files = ({ list }) => list.length ? (
    <ul className="hd-attach">{list.map((a) => (
        <li key={a.fileId}><button type="button" onClick={() => downloadFile({ url: a.url, name: a.name }).catch((e) => toast.error(e.message))} title={`Download ${a.name}`}>
            <i className={`mdi ${/image/.test(a.type) ? 'mdi-file-image-outline' : /pdf/.test(a.type) ? 'mdi-file-pdf-box' : 'mdi-file-document-outline'}`}></i><span>{a.name}</span><small>{fileSize(a.size || 0)}</small>{a.internal && <em>internal</em>}
        </button></li>
    ))}</ul>
) : null

export const TicketDetail = () => {
    const { id } = useParams()
    const meta = useTicketMeta()
    const [t, setT] = useState(null)
    const [error, setError] = useState('')
    const [move, setMove] = useState(null)
    const [note, setNote] = useState('')
    const [busy, setBusy] = useState(false)
    const [msg, setMsg] = useState('')
    const [internal, setInternal] = useState(false)
    const [files, setFiles] = useState([])
    const [show, setShow] = useState('all')
    const [fb, setFb] = useState({ rating: 0, comment: '' })
    const fileInput = useRef(null)
    const composer = useRef(null)

    const load = useCallback(() => api('GET', `/tickets/${id}`).then((j) => { setT(j.data); setError('') }).catch((e) => setError(e.message)), [id])
    useEffect(() => { setT(null); load() }, [load])
    useEffect(() => { if (t?.feedback) setFb({ rating: t.feedback.rating, comment: t.feedback.comment || '' }) }, [t?.feedback])

    const run = async (fn, ok) => {
        setBusy(true)
        try { const j = await fn(); setT(j.data); toast.success(ok || j.message); return true } catch (e) { toast.error(e.message); return false } finally { setBusy(false) }
    }
    const doMove = async (m, text = '') => {
        if (await run(() => api('PUT', `/tickets/${id}/status`, { status: m.to, note: text }))) { setMove(null); setNote('') }
    }
    const pickMove = (m) => (m.needs ? (setMove(m), setNote('')) : doMove(m))
    const send = async (e) => {
        e.preventDefault()
        if (!msg.trim() && !files.length) return
        const bad = checkFiles(files, meta?.attachments)
        if (bad) { toast.error(bad); return }
        const fd = new FormData()
        fd.append('message', msg); fd.append('internal', internal ? 'true' : 'false')
        files.forEach((f) => fd.append('files', f))
        if (await run(() => api('POST', `/tickets/${id}/comments`, fd))) { setMsg(''); setFiles([]); setInternal(false) }
    }

    const timeline = useMemo(() => {
        if (!t) return []
        const files = new Map(t.attachments.map((a) => [String(a.fileId), a]))
        const c = t.comments.map((x) => ({ type: 'comment', at: x.createdAt, x, files: (x.attachments || []).map((f) => files.get(String(f))).filter(Boolean) }))
        // status notes are already shown as comments; keep the rest of the activity
        const h = t.history.filter((x) => !['comment', 'note'].includes(x.action) && historyText(x)).map((x) => ({ type: 'event', at: x.at, x }))
        // same moment: the status change reads before the message that came with it
        return [...c, ...(show === 'all' ? h : [])].sort((a, b) => (new Date(a.at) - new Date(b.at)) || ((a.type === 'event' ? 0 : 1) - (b.type === 'event' ? 0 : 1)))
    }, [t, show])

    if (error && !t) return <PeopleShell title="Ticket" root={HELPDESK_ROOT} crumbs={[{ label: 'Ticket' }]} backTo="/helpdesk"><div className="pp-card"><EmptyState icon="mdi-lifebuoy" title="Can't open this ticket" text={error} action={<Link to="/helpdesk" className="pp-btn">Back to my tickets</Link>} /></div></PeopleShell>
    if (!t) return <PeopleShell title="Ticket" root={HELPDESK_ROOT} crumbs={[{ label: 'Ticket' }]} backTo="/helpdesk"><div className="pp-card"><div className="hd-loading">{[0, 1, 2].map((i) => <div key={i} className="pp-skel"></div>)}</div></div></PeopleShell>

    const me = t.me
    const owner = me.relation === 'owner'
    const listLink = owner ? { label: 'My tickets', to: '/helpdesk' } : { label: 'HR tickets', to: '/helpdesk/all' }
    const idx = flowIndex(t.status)
    const topFiles = t.attachments.filter((a) => !a.commentId)
    const agentsByGroup = (meta?.agents || []).reduce((g, a) => ({ ...g, [a.group]: [...(g[a.group] || []), a] }), {})

    return (
        <PeopleShell title={t.subject} root={HELPDESK_ROOT} crumbs={[listLink, { label: t.ticketNo }]} backTo={listLink.to}
            actions={me.moves.length ? <div className="hd-moves">{me.moves.map((m) => (
                <button key={m.to} type="button" disabled={busy} className={`pp-btn ${['Resolved', 'In Progress'].includes(m.to) || m.label === 'Confirm & close' ? 'primary' : ''} ${['Rejected'].includes(m.to) ? 'danger' : ''}`} onClick={() => pickMove(m)}>
                    <i className={`mdi ${m.icon}`}></i>{m.label}
                </button>
            ))}</div> : null}>

            {owner && t.status === 'Pending Employee' && (
                <div className="hd-banner" style={{ '--c': TICKET_STATUS['Pending Employee'].color }}>
                    <i className="mdi mdi-account-question-outline"></i><div><b>HR needs more information from you.</b><span>Reply below — the ticket goes straight back to HR.</span></div>
                    <button type="button" className="pp-btn sm" onClick={() => composer.current?.focus()}>Reply now</button>
                </div>
            )}
            {owner && t.status === 'Resolved' && (
                <div className="hd-banner" style={{ '--c': TICKET_STATUS.Resolved.color }}>
                    <i className="mdi mdi-check-circle-outline"></i><div><b>HR has resolved this ticket.</b><span>Confirm and close it, or reopen it if the issue isn't fixed{meta?.reopenDays ? ` (within ${meta.reopenDays} days)` : ''}.</span></div>
                </div>
            )}

            <section className="pp-card hd-summary">
                <div className="hd-sum-top">
                    <CategoryIcon meta={meta} name={t.category} size={44} />
                    <div className="hd-sum-main">
                        <div className="hd-sum-line"><span className="hd-no">{t.ticketNo}</span><StatusPill status={t.status} /><PriorityPill priority={t.priority} />{t.confidential && <span className="hd-conf"><i className="mdi mdi-shield-lock-outline"></i>Confidential</span>}{t.escalationLevel > 0 && <span className="hd-conf esc"><i className="mdi mdi-arrow-up-bold-circle-outline"></i>Escalated ×{t.escalationLevel}</span>}</div>
                        <small>{t.category} · raised {fmtWhen(t.createdAt)} · updated {ago(t.lastActivityAt)}</small>
                    </div>
                    {!owner && <SlaBadge sla={t.sla} />}
                </div>
                <ol className="hd-flow" aria-label="Progress">
                    {FLOW.map((s, i) => {
                        const done = i < idx || (i === idx && ['Resolved', 'Closed'].includes(t.status))
                        const now = i === idx && !done
                        const label = i === idx && t.status === 'Rejected' ? 'Rejected' : i === 2 && now ? t.status : s
                        return <li key={s} className={`${done ? 'done' : ''} ${now ? 'now' : ''} ${label === 'Rejected' ? 'rej' : ''}`} style={{ '--c': (TICKET_STATUS[label] || TICKET_STATUS[s]).color }}><span><i className={`mdi ${done ? 'mdi-check' : (TICKET_STATUS[label] || TICKET_STATUS[s]).icon}`}></i></span><b>{label}</b></li>
                    })}
                </ol>
            </section>

            <div className="hd-layout">
                <div className="hd-maincol">
                    <section className="pp-card hd-desc">
                        <header><Avatar person={t.employeeId} size={34} /><div><b>{fullName(t.employeeId)}</b><small>{fmtWhen(t.createdAt)}</small></div></header>
                        <p>{t.description}</p>
                        <Files list={topFiles} />
                    </section>

                    {(t.resolution || t.rejectionReason) && ['Resolved', 'Closed', 'Rejected'].includes(t.status) && (
                        <section className={`hd-outcome ${t.status === 'Rejected' ? 'rej' : ''}`}>
                            <i className={`mdi ${t.status === 'Rejected' ? 'mdi-close-octagon-outline' : 'mdi-check-decagram-outline'}`}></i>
                            <div><b>{t.status === 'Rejected' ? 'Rejected' : 'Resolution'}</b><p>{t.status === 'Rejected' ? t.rejectionReason : t.resolution}</p>{t.resolvedBy && t.status !== 'Rejected' && <small>by {fullName(t.resolvedBy)} · {fmtWhen(t.resolvedAt)}</small>}</div>
                        </section>
                    )}

                    {(me.canFeedback || t.feedback) && (
                        <section className="pp-card hd-feedback">
                            <b>{t.feedback ? 'Your feedback' : 'How did HR do?'}</b>
                            {me.canFeedback ? (
                                <form onSubmit={(e) => { e.preventDefault(); run(() => api('POST', `/tickets/${id}/feedback`, fb)) }}>
                                    <Stars value={fb.rating} onChange={(rating) => setFb((x) => ({ ...x, rating }))} />
                                    <input className="pp-input" value={fb.comment} maxLength={1000} onChange={(e) => setFb((x) => ({ ...x, comment: e.target.value }))} placeholder="Anything to add? (optional)" />
                                    <button type="submit" className="pp-btn sm primary" disabled={!fb.rating || busy}>{t.feedback ? 'Update' : 'Send'}</button>
                                </form>
                            ) : <div className="hd-fbview"><Stars value={t.feedback.rating} size={18} />{t.feedback.comment && <span>“{t.feedback.comment}”</span>}</div>}
                        </section>
                    )}

                    <section className="pp-card hd-conv">
                        <header>
                            <b>Conversation</b>
                            <div className="hd-seg">{[['all', 'Everything'], ['comments', 'Messages']].map(([k, l]) => <button key={k} type="button" className={show === k ? 'on' : ''} onClick={() => setShow(k)}>{l}</button>)}</div>
                        </header>
                        <ol className="hd-timeline">
                            {timeline.length === 0 && <li className="hd-empty">No messages yet.</li>}
                            {timeline.map((e, i) => e.type === 'event' ? (
                                <li key={`h${i}`} className={`ev ${e.x.internal ? 'internal' : ''}`}><i className="mdi mdi-circle-small"></i><span><b>{e.x.by ? fullName(e.x.by) : 'System'}</b> {historyText(e.x)}{e.x.internal && e.x.note && e.x.action !== 'status' ? <> — {e.x.note}</> : null}</span><time title={fmtWhen(e.at)}>{ago(e.at)}</time></li>
                            ) : (
                                <li key={e.x._id} className={`msg ${e.x.internal ? 'internal' : ''} ${String(e.x.employeeId?._id) === String(t.employeeId?._id) ? 'mine' : 'staff'}`}>
                                    <Avatar person={e.x.employeeId} size={30} />
                                    <div className="bubble">
                                        <div className="by"><b>{fullName(e.x.employeeId)}</b>{String(e.x.employeeId?._id) !== String(t.employeeId?._id) && <span className="tag">{e.x.internal ? 'Internal note' : 'HR'}</span>}{KIND[e.x.kind] && <span className="kind" style={{ '--c': KIND[e.x.kind][2] }}><i className={`mdi ${KIND[e.x.kind][1]}`}></i>{KIND[e.x.kind][0]}</span>}<time title={fmtWhen(e.at)}>{ago(e.at)}</time></div>
                                        {e.x.message && <p>{e.x.message}</p>}
                                        <Files list={e.files} />
                                    </div>
                                </li>
                            ))}
                        </ol>
                        {me.canComment ? (
                            <form className={`hd-composer ${internal ? 'internal' : ''}`} onSubmit={send}>
                                {me.canNote && (
                                    <div className="hd-seg mode">
                                        <button type="button" className={!internal ? 'on' : ''} onClick={() => setInternal(false)} disabled={t.status === 'Closed' || t.status === 'Rejected'}><i className="mdi mdi-reply-outline"></i>Reply to employee</button>
                                        <button type="button" className={internal ? 'on' : ''} onClick={() => setInternal(true)}><i className="mdi mdi-lock-outline"></i>Internal note</button>
                                    </div>
                                )}
                                <textarea ref={composer} rows={3} className="pp-input" maxLength={3000} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={internal ? 'Only HR and staff on this ticket see internal notes…' : owner ? 'Write a reply to HR…' : `Reply to ${t.employeeId?.firstName || 'the employee'}…`}
                                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(e) }}></textarea>
                                {files.length > 0 && <ul className="hd-files">{files.map((f, i) => <li key={`${f.name}${i}`}><i className="mdi mdi-file-outline"></i>{f.name}<small>{fileSize(f.size)}</small><button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}><i className="mdi mdi-close"></i></button></li>)}</ul>}
                                <div className="hd-comp-foot">
                                    <button type="button" className="pp-btn sm ghost" onClick={() => fileInput.current?.click()}><i className="mdi mdi-paperclip"></i>Attach</button>
                                    <input ref={fileInput} type="file" multiple hidden accept={meta?.attachments?.types?.map((x) => `.${x}`).join(',')} onChange={(e) => { const next = [...files, ...e.target.files]; const bad = checkFiles(next, meta?.attachments); if (bad) toast.error(bad); else setFiles(next); e.target.value = '' }} />
                                    <small>Ctrl + Enter to send</small>
                                    <button type="submit" className="pp-btn sm primary" disabled={busy || (!msg.trim() && !files.length)}><i className={`mdi ${internal ? 'mdi-lock-outline' : 'mdi-send-outline'}`}></i>{internal ? 'Add note' : 'Send'}</button>
                                </div>
                            </form>
                        ) : <p className="hd-closed"><i className="mdi mdi-lock-outline"></i>This ticket is {t.status.toLowerCase()}. {owner ? <Link to="/helpdesk">Raise a new ticket</Link> : null}{owner ? ' if you still need help.' : ''}</p>}
                    </section>
                </div>

                <aside className="hd-side">
                    <section className="pp-card hd-panel">
                        <h4>Employee</h4>
                        <div className="hd-person"><Avatar person={t.employeeId} size={40} /><div><b>{fullName(t.employeeId)}</b><small>{t.employeeId?.employeeId} · {t.employeeId?.designation}</small><small>{t.employeeId?.department}</small></div></div>
                    </section>
                    <section className="pp-card hd-panel">
                        <h4>Details</h4>
                        <dl>
                            <dt>Assigned to</dt>
                            <dd>{me.canAssign ? (
                                <select className="pp-select" value={t.assignedTo?._id || ''} disabled={busy} onChange={(e) => run(() => api('PUT', `/tickets/${id}/assign`, { assignedTo: e.target.value || null }))} aria-label="Assigned to">
                                    <option value="">Unassigned</option>
                                    {Object.entries(agentsByGroup).map(([g, list]) => <optgroup key={g} label={g}>{list.filter((a) => a._id !== t.employeeId?._id).map((a) => <option key={a._id} value={a._id}>{a.name} — {a.designation}</option>)}</optgroup>)}
                                </select>
                            ) : t.assignedTo ? <span className="hd-inline"><Avatar person={t.assignedTo} size={22} />{fullName(t.assignedTo)}</span> : <span className="hd-muted">Not assigned yet</span>}</dd>
                            <dt>Category</dt>
                            <dd>{me.canTriage ? <select className="pp-select" value={t.category} disabled={busy} onChange={(e) => run(() => api('PUT', `/tickets/${id}`, { category: e.target.value }))} aria-label="Category">{(meta?.categories || []).filter((c) => c.active || c.name === t.category).map((c) => <option key={c.name}>{c.name}</option>)}</select> : t.category}</dd>
                            <dt>Priority</dt>
                            <dd>{me.canTriage ? <select className="pp-select" value={t.priority} disabled={busy} onChange={(e) => run(() => api('PUT', `/tickets/${id}`, { priority: e.target.value }))} aria-label="Priority">{Object.keys(PRIORITY).map((p) => <option key={p}>{p}</option>)}</select> : <PriorityPill priority={t.priority} />}</dd>
                        </dl>
                    </section>
                    <section className="pp-card hd-panel">
                        <h4>Timeline</h4>
                        <dl className="hd-times">
                            <dt>Created</dt><dd>{fmtWhen(t.createdAt)}</dd>
                            <dt>Assigned</dt><dd>{fmtWhen(t.assignedAt)}</dd>
                            <dt>First response</dt><dd>{t.firstResponseAt ? <>{fmtWhen(t.firstResponseAt)} <small>({fmtMins(t.sla.firstResponseMins)})</small></> : '—'}</dd>
                            <dt>Resolved</dt><dd>{t.resolvedAt ? <>{fmtWhen(t.resolvedAt)} <small>({fmtMins(t.sla.resolutionMins)})</small></> : '—'}</dd>
                            <dt>Closed</dt><dd>{fmtWhen(t.closedAt)}</dd>
                            {t.reopenCount > 0 && <><dt>Reopened</dt><dd>{t.reopenCount}×</dd></>}
                        </dl>
                    </section>
                    {!owner && (
                        <section className="pp-card hd-panel">
                            <h4>SLA</h4>
                            <dl className="hd-times">
                                <dt>Response due</dt><dd className={t.sla.responseBreached ? 'bad' : ''}>{fmtWhen(t.sla.responseDueAt)}{t.sla.responseBreached && <small> · missed</small>}</dd>
                                <dt>Resolution due</dt><dd>{fmtWhen(t.sla.dueAt)}</dd>
                                <dt>Status</dt><dd><SlaBadge sla={t.sla} /></dd>
                            </dl>
                        </section>
                    )}
                </aside>
            </div>

            {move && (
                <Modal title={`${move.label} — ${t.ticketNo}`} sub={move.to === 'Escalated' ? 'The reason is an internal note — the employee only sees the status.' : move.to === 'Rejected' || move.to === 'Resolved' || move.to === 'Pending Employee' ? 'The employee will see this message.' : ''}
                    icon={<span className="hd-modal-ic" style={{ '--c': (TICKET_STATUS[move.to] || {}).color }}><i className={`mdi ${move.icon}`}></i></span>} onClose={() => setMove(null)}
                    footer={<><button type="button" className="pp-btn" onClick={() => setMove(null)}>Cancel</button><button type="button" className={`pp-btn ${move.to === 'Rejected' ? 'danger' : 'primary'}`} disabled={busy || (!move.optional && !note.trim())} onClick={() => doMove(move, note.trim())}><i className={`mdi ${move.icon}`}></i>{move.label}</button></>}>
                    <label className="pp-label" htmlFor="hd-move-note">{move.needs}{!move.optional && <span className="req">*</span>}</label>
                    <textarea id="hd-move-note" autoFocus rows={4} maxLength={3000} className="pp-input" value={note} onChange={(e) => setNote(e.target.value)}></textarea>
                </Modal>
            )}
        </PeopleShell>
    )
}
