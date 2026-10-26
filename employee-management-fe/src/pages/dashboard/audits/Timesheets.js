import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PeopleShell, Avatar, ErrorBanner, fullName } from '../../../components/people/PeopleUI'
import { chatApi as api } from '../../../components/chat/chatApi'
import { toast } from '../../../components/common/Toaster'
import { Modal } from '../projects/ProjectParts'
import './AuditOps.css'
import { confirmAction } from '../../../components/common/ConfirmDialog'

/* Timesheets for audit work. My week: timer and manual entries, day totals (attendance shown for
   comparison only), submit the week, ask for a correction on approved time. Approvals (managers):
   approve or return submitted time, decide corrections. */

const hm = (m) => `${Math.floor((m || 0) / 60)}h ${String(Math.round((m || 0) % 60)).padStart(2, '0')}m`
const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const addDays = (k, n) => { const d = new Date(`${k}T00:00:00`); d.setDate(d.getDate() + n); return ymd(d) }
const dayName = (k, o = { weekday: 'short' }) => new Date(`${k}T00:00:00`).toLocaleDateString(undefined, o)
const clock = (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const BLANK = { auditId: '', workDate: '', mode: 'hours', hours: '', startTime: '', endTime: '', breakMinutes: '', step: '', description: '', billable: true }

const EntryForm = ({ engagements, initial, onClose, onSaved }) => {
    const [f, setF] = useState(initial)
    const [busy, setBusy] = useState(false)
    const eng = engagements.find((e) => e._id === f.auditId)
    const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
    const save = async () => {
        setBusy(true)
        try {
            const body = { auditId: f.auditId, workDate: f.workDate, step: f.step, description: f.description, billable: f.billable, breakMinutes: Number(f.breakMinutes) || 0, ...(f.mode === 'range' ? { startTime: f.startTime, endTime: f.endTime } : { minutes: Math.round(Number(f.hours) * 60) }) }
            const j = f._id ? await api('PUT', `/timesheets/entries/${f._id}`, body) : await api('POST', '/timesheets/entries', body)
            toast.success(j.message); onSaved()
        } catch (e) { toast.error(e.message) } finally { setBusy(false) }
    }
    const timer = f._id && f.entryType !== 'manual'
    return (
        <Modal title={f._id ? 'Edit time entry' : 'Add time'} sub={timer ? 'Timer sessions: only the description, task and billable flag can change.' : 'Time you worked without the timer — e.g. at a client site.'} onClose={onClose}
            footer={<><button type="button" className="pp-btn" onClick={onClose}>Cancel</button><button type="button" className="pp-btn primary" onClick={save} disabled={busy}>{busy ? <i className="mdi mdi-loading mdi-spin"></i> : <i className="mdi mdi-content-save-outline"></i>}Save</button></>}>
            <div className="ao-form">
                <label className="wide">Engagement<select className="pp-select" value={f.auditId} onChange={(e) => setF((x) => ({ ...x, auditId: e.target.value, step: '' }))} disabled={!!f._id}><option value="">Choose…</option>{engagements.map((e) => <option key={e._id} value={e._id}>{e.clientName} · {e.title} ({e.auditCode})</option>)}</select></label>
                <label className="wide">Task<select className="pp-select" value={f.step} onChange={set('step')}><option value="">General (no task)</option>{(eng?.tasks || []).map((t) => <option key={t.key} value={t.key}>{t.mine ? '★ ' : ''}{t.stage} · {t.label}</option>)}</select></label>
                {!timer && <>
                    <label>Date<input type="date" className="pp-input" value={f.workDate} max={ymd(new Date())} onChange={set('workDate')} /></label>
                    <label>Enter as<select className="pp-select" value={f.mode} onChange={set('mode')}><option value="hours">Hours</option><option value="range">Start – end time</option></select></label>
                    {f.mode === 'hours' ? <label>Hours<input type="number" min="0.25" step="0.25" className="pp-input" value={f.hours} onChange={set('hours')} placeholder="e.g. 2.5" /></label> : <>
                        <label>Start<input type="time" className="pp-input" value={f.startTime} onChange={set('startTime')} /></label>
                        <label>End<input type="time" className="pp-input" value={f.endTime} onChange={set('endTime')} /></label>
                        <label>Break (min)<input type="number" min="0" className="pp-input" value={f.breakMinutes} onChange={set('breakMinutes')} /></label>
                    </>}
                </>}
                <label className="wide">Work done<textarea rows={3} className="pp-input" value={f.description} onChange={set('description')} placeholder="What you did — shown to your manager and on bills"></textarea></label>
                <label className="wide" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, fontWeight: 500 }}><input type="checkbox" checked={f.billable} onChange={set('billable')} />Billable to the client</label>
            </div>
        </Modal>
    )
}

const MyWeek = () => {
    const [week, setWeek] = useState(ymd(new Date()))
    const [d, setD] = useState(null)
    const [error, setError] = useState('')
    const [form, setForm] = useState(null)
    const [busy, setBusy] = useState(false)
    const load = useCallback(() => api('GET', `/timesheets/me?week=${week}`).then((j) => { setD(j.data); setError('') }).catch((e) => setError(e.message)), [week])
    useEffect(() => { load() }, [load])
    const today = ymd(new Date())
    const submit = async () => {
        if (!(await confirmAction({ title: 'Submit this week?', message: 'Submitted time is locked until your manager approves or returns it.', confirmLabel: 'Submit week', tone: 'primary' }))) return
        setBusy(true)
        try { const j = await api('POST', '/timesheets/submit', { week: d.week }); toast.success(j.message); load() } catch (e) { toast.error(e.message) } finally { setBusy(false) }
    }
    const remove = async (e) => { if (await confirmAction({ title: 'Remove this time entry?', message: `${hm(e.durationMinutes)} on ${e.auditId?.clientName || 'this engagement'}.`, confirmLabel: 'Remove entry' })) { try { await api('DELETE', `/timesheets/entries/${e._id}`); toast.success('Removed.'); load() } catch (er) { toast.error(er.message) } } }
    const correct = async (e) => {
        const h = window.prompt(`Correct ${hm(e.durationMinutes)} to how many hours?`, (e.durationMinutes / 60).toFixed(2))
        if (h === null) return
        const reason = window.prompt('Reason for the correction (your manager approves it):')
        if (!reason) return
        try { await api('POST', `/timesheets/entries/${e._id}/adjustments`, { minutes: Math.round(Number(h) * 60), reason }); toast.success('Correction sent for approval.'); load() } catch (er) { toast.error(er.message) }
    }
    const t = d?.totals || {}
    const editable = (e) => ['Draft', 'Rejected'].includes(e.status) && e.endTime
    return (
        <>
            <ErrorBanner error={error} />
            <div className="ao-tools">
                <div className="ao-week">
                    <button type="button" onClick={() => setWeek(addDays(d?.week || week, -7))} aria-label="Previous week"><i className="mdi mdi-chevron-left"></i></button>
                    <b>{d ? `${dayName(d.week, { day: 'numeric', month: 'short' })} – ${dayName(addDays(d.week, 6), { day: 'numeric', month: 'short', year: 'numeric' })}` : '…'}</b>
                    <button type="button" onClick={() => setWeek(addDays(d?.week || week, 7))} disabled={d && addDays(d.week, 7) > today} aria-label="Next week"><i className="mdi mdi-chevron-right"></i></button>
                </div>
                {d && <span className={`ao-st ${d.status === 'Approved' ? 'Approved' : d.status === 'Submitted' ? 'Submitted' : ''}`}>{d.status}</span>}
                <span className="grow"></span>
                <button type="button" className="pp-btn" onClick={() => setForm({ ...BLANK, workDate: today > addDays(d?.week || week, 6) ? addDays(d?.week || week, 6) : today })} disabled={!d?.engagements?.length}><i className="mdi mdi-plus"></i>Add time</button>
                <button type="button" className="pp-btn primary" onClick={submit} disabled={busy || !(t.draft + t.rejected) || t.running}><i className="mdi mdi-send"></i>Submit week{t.draft + t.rejected ? ` (${t.draft + t.rejected})` : ''}</button>
            </div>
            {d && (
                <div className="ao-days">{d.days.map((x) => (
                    <div key={x.date} className={`ao-day ${x.date === today ? 'today' : ''} ${[0, 6].includes(new Date(`${x.date}T00:00:00`).getDay()) ? 'wkend' : ''}`}>
                        <small>{dayName(x.date)} {Number(x.date.slice(8))}</small>
                        <b>{x.minutes ? hm(x.minutes) : '—'}</b>
                        {x.leave ? <span className="leave">{x.leave}</span> : <span title="Attendance hours — for comparison only">{x.attendanceHours ? `att. ${x.attendanceHours}h` : ' '}</span>}
                    </div>
                ))}</div>
            )}
            <section className="ao-card" style={{ padding: 0 }}>
                <header style={{ padding: '10px 12px', margin: 0, borderBottom: '1px solid var(--ao-line)' }}><b>Entries</b><small>{d ? `${hm(t.minutes)} · ${t.approved || 0} approved · ${t.submitted || 0} submitted · ${t.draft || 0} draft${t.rejected ? ` · ${t.rejected} returned` : ''}` : ''}</small></header>
                {!d ? <div style={{ padding: 12 }}><div className="pp-skel" style={{ height: 120 }}></div></div> : !d.entries.length ? <div className="ao-empty"><i className="mdi mdi-timetable"></i>No time this week. Start a timer on an audit, or add time here.</div> : d.entries.map((e) => (
                    <div key={e._id} className="ao-entry">
                        <span className="d">{dayName(e.workDate, { weekday: 'short', day: 'numeric', month: 'short' })}<br />{e.entryType === 'manual' ? 'manual' : `${clock(e.startTime)}–${e.endTime ? clock(e.endTime) : 'now'}`}</span>
                        <span className="w"><b>{e.auditId?.clientName} · {e.milestoneLabel || 'General'}</b><small>{e.note || <em>No description yet — add one before submitting</em>}{e.reviewComment ? ` · Manager: ${e.reviewComment}` : ''}{(e.adjustments || []).some((a) => a.status === 'Requested') ? ' · correction pending' : ''}</small></span>
                        <span className="h">{e.endTime ? hm(e.durationMinutes) : 'running'}</span>
                        <span className={`ao-st ${e.status}`}>{e.status === 'Rejected' ? 'Returned' : e.status}</span>
                        <span className="acts">
                            {editable(e) && <button type="button" className="ao-icon" onClick={() => setForm({ ...BLANK, ...e, auditId: e.auditId?._id, step: e.milestoneKey || '', description: e.note || '', hours: (e.durationMinutes / 60).toString(), mode: 'hours' })} aria-label="Edit"><i className="mdi mdi-pencil-outline"></i></button>}
                            {editable(e) && e.entryType === 'manual' && <button type="button" className="ao-icon" onClick={() => remove(e)} aria-label="Remove"><i className="mdi mdi-delete-outline"></i></button>}
                            {e.status === 'Approved' && !e.billedInvoice && <button type="button" className="ao-icon" onClick={() => correct(e)} title="Request a correction" aria-label="Request a correction"><i className="mdi mdi-file-document-edit-outline"></i></button>}
                        </span>
                    </div>
                ))}
            </section>
            <p className="ao-help">Attendance hours are shown for comparison only — they don't count as audit time. Submitted time is locked; approved time changes only through a correction your manager approves.</p>
            {form && <EntryForm engagements={d?.engagements || []} initial={form} onClose={() => setForm(null)} onSaved={() => { setForm(null); load() }} />}
        </>
    )
}

const Approvals = () => {
    const [status, setStatus] = useState('Submitted')
    const [d, setD] = useState(null)
    const [sel, setSel] = useState(new Set())
    const [error, setError] = useState('')
    const load = useCallback(() => api('GET', `/timesheets/approvals?status=${status}`).then((j) => { setD(j.data); setSel(new Set()); setError('') }).catch((e) => setError(e.message)), [status])
    useEffect(() => { load() }, [load])
    const decide = async (ids, decision) => {
        let comment = ''
        if (decision === 'reject') { comment = window.prompt('What needs correcting? (sent to the employee)') || ''; if (!comment.trim()) return }
        try { const j = await api('POST', '/timesheets/decide', { ids, decision, comment }); toast.success(j.message); load() } catch (e) { toast.error(e.message) }
    }
    const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
    return (
        <>
            <ErrorBanner error={error} />
            <div className="ao-tools">
                <div className="ao-seg">{['Submitted', 'Approved', 'Rejected'].map((s) => <button key={s} type="button" className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>{s === 'Submitted' ? 'Waiting' : s === 'Rejected' ? 'Returned' : 'Approved (60 days)'}</button>)}</div>
                <span className="grow"></span>
                {status === 'Submitted' && sel.size > 0 && <><button type="button" className="pp-btn" onClick={() => decide([...sel], 'reject')}>Return {sel.size}</button><button type="button" className="pp-btn primary" onClick={() => decide([...sel], 'approve')}><i className="mdi mdi-check"></i>Approve {sel.size}</button></>}
            </div>
            {!d ? <div className="pp-skel" style={{ height: 160 }}></div> : !d.length ? <div className="ao-card ao-empty"><i className="mdi mdi-check-all"></i>{status === 'Submitted' ? 'No timesheets waiting for you.' : 'Nothing here.'}</div> : d.map((g) => (
                <div key={`${g.employee?._id}-${g.week}`} className="ao-group">
                    <header>
                        <span className="ao-person"><Avatar person={g.employee} size={30} /><div><b>{fullName(g.employee)}</b><small>Week of {dayName(g.week, { day: 'numeric', month: 'short' })} · {g.entries.length} entr{g.entries.length === 1 ? 'y' : 'ies'}</small></div></span>
                        <span className="grow"></span>
                        <b>{hm(g.minutes)}</b>
                        {status === 'Submitted' && <><button type="button" className="pp-btn sm" onClick={() => decide(g.entries.map((e) => e._id), 'reject')}>Return</button><button type="button" className="pp-btn sm primary" onClick={() => decide(g.entries.map((e) => e._id), 'approve')}><i className="mdi mdi-check"></i>Approve all</button></>}
                    </header>
                    {g.entries.map((e) => (
                        <div key={e._id} className="ao-entry">
                            {status === 'Submitted' ? <input type="checkbox" checked={sel.has(e._id)} onChange={() => toggle(e._id)} aria-label="Select" /> : <span></span>}
                            <span className="d">{dayName(e.workDate, { weekday: 'short', day: 'numeric', month: 'short' })}<br />{e.entryType === 'manual' ? 'manual' : `${clock(e.startTime)}–${clock(e.endTime)}`}</span>
                            <span className="w"><b>{e.audit?.clientName} · {e.milestoneLabel || 'General'}</b><small>{e.note}{e.needsReview ? ' · ⚠ auto-stopped / long session' : ''}{e.billable === false ? ' · non-billable' : ''}</small></span>
                            <span className="h">{hm(e.durationMinutes)}</span>
                            <span className={`ao-st ${e.status}`}>{e.status === 'Rejected' ? 'Returned' : e.status}</span>
                        </div>
                    ))}
                </div>
            ))}
        </>
    )
}

const Corrections = () => {
    const [d, setD] = useState(null)
    const load = () => api('GET', '/timesheets/adjustments').then((j) => setD(j.data)).catch((e) => toast.error(e.message))
    useEffect(() => { load() }, [])
    const decide = async (l, decision) => { try { const j = await api('POST', `/timesheets/entries/${l._id}/adjustments/${l.adjustment._id}`, { decision }); toast.success(j.message); load() } catch (e) { toast.error(e.message) } }
    if (!d) return <div className="pp-skel" style={{ height: 120 }}></div>
    if (!d.length) return <div className="ao-card ao-empty"><i className="mdi mdi-check-all"></i>No correction requests.</div>
    return <div className="ao-card" style={{ padding: 0 }}>{d.map((l) => (
        <div key={l._id} className="ao-entry">
            <span className="d">{dayName(l.workDate, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
            <span className="w"><b>{fullName(l.employeeId)} · {l.audit?.clientName}</b><small>{hm(l.adjustment.fromMinutes)} → <b>{hm(l.adjustment.toMinutes)}</b> — “{l.adjustment.reason}”</small></span>
            <span></span>
            <button type="button" className="pp-btn sm" onClick={() => decide(l, 'decline')}>Decline</button>
            <button type="button" className="pp-btn sm primary" onClick={() => decide(l, 'apply')}>Apply</button>
        </div>
    ))}</div>
}

export const Timesheets = () => {
    const [params, setParams] = useSearchParams()
    const tab = params.get('tab') || 'mine'
    const tabs = useMemo(() => [['mine', 'My week'], ['approvals', 'Approvals'], ['corrections', 'Corrections']], [])
    return (
        <PeopleShell title="Timesheets" root={{ label: 'Audits', to: '/audits' }} crumbs={[{ label: 'Timesheets' }]} backTo="/my-work">
            <div className="ao">
                <div className="ao-tools"><div className="ao-seg">{tabs.map(([k, l]) => <button key={k} type="button" className={tab === k ? 'on' : ''} onClick={() => setParams({ tab: k }, { replace: true })}>{l}</button>)}</div></div>
                {tab === 'mine' ? <MyWeek /> : tab === 'approvals' ? <Approvals /> : <Corrections />}
            </div>
        </PeopleShell>
    )
}
