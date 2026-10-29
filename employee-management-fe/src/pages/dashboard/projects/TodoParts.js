import React, { useMemo, useRef, useState } from 'react'
import { startOfDay } from '../../../components/projects/ProjectUI'
import { toast } from '../../../components/common/Toaster'
import { confirmAction } from '../../../components/common/ConfirmDialog'
import { api, Modal, taskTag, todayISO } from './ProjectParts'
import './Todo.css'

/* The To-do page's pieces — quick add, the list grouped by due date and the to-do window — plus
   the small "why?" box the project task screens use when a task is blocked or sent back.
   To-dos are personal: no project, no review step — tick them and they're done. */

export const TODO_ROOT = { label: 'To-do', to: '/tasks' }
const DAY = 864e5
const PRIOS = [['Low', '#059669'], ['Medium', '#d97706'], ['High', '#e11d48']]
const prioColor = (p) => (PRIOS.find((x) => x[0] === p) || PRIOS[1])[1]
const isoIn = (days) => { const d = new Date(Date.now() + days * DAY); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10) }
const dueText = (d) => {
    const n = Math.round((startOfDay(d) - startOfDay(Date.now())) / DAY)
    if (n === 0) return 'Today'
    if (n === 1) return 'Tomorrow'
    if (n === -1) return 'Yesterday'
    if (n < 0) return `${-n} days late`
    if (n < 7) return new Date(d).toLocaleDateString(undefined, { weekday: 'long' })
    return new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/* ---------------- quick add ---------------- */
export const QuickAdd = ({ onAdded }) => {
    const [title, setTitle] = useState('')
    const [due, setDue] = useState('')
    const [high, setHigh] = useState(false)
    const [busy, setBusy] = useState(false)
    const dateRef = useRef(null)
    const add = async () => {
        if (!title.trim() || busy) return
        setBusy(true)
        try {
            const j = await api('POST', '/todos', { title: title.trim(), dueDate: due || null, priority: high ? 'High' : 'Medium' })
            setTitle(''); setHigh(false)
            onAdded(j.data)
        } catch (e) { toast.error(e.message) }
        setBusy(false)
    }
    const chips = [['', 'No date'], [todayISO(), 'Today'], [isoIn(1), 'Tomorrow'], [isoIn(7), 'Next week']]
    const custom = due && !chips.some(([v]) => v === due)
    return (
        <div className="td-quick">
            <div className="td-quick-row">
                <span className="td-quick-plus"><i className="mdi mdi-plus"></i></span>
                <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Add a to-do… e.g. Call the client about the GST notice" aria-label="New to-do" maxLength={160} />
                <button type="button" className={`td-flag ${high ? 'on' : ''}`} onClick={() => setHigh((h) => !h)} title={high ? 'High priority' : 'Mark as high priority'} aria-pressed={high}><i className={`mdi ${high ? 'mdi-flag' : 'mdi-flag-outline'}`}></i></button>
                <button type="button" className="td-add" disabled={!title.trim() || busy} onClick={add}>{busy ? 'Adding…' : 'Add'}</button>
            </div>
            <div className="td-quick-opts">
                {chips.map(([v, l]) => <button key={l} type="button" className={due === v ? 'on' : ''} onClick={() => setDue(v)}>{l}</button>)}
                <label className={`td-pick ${custom ? 'on' : ''}`}><i className="mdi mdi-calendar-blank-outline"></i>{custom ? dueText(due) : 'Pick date'}<input ref={dateRef} type="date" min={todayISO()} value={custom ? due : ''} onChange={(e) => setDue(e.target.value)} /></label>
            </div>
        </div>
    )
}

/* ---------------- one row ---------------- */
const Row = ({ t, onTick, onOpen, done }) => {
    const late = !done && t.dueDate && startOfDay(t.dueDate) < startOfDay(Date.now())
    const items = t.checklist || []
    return (
        <li className={`td-row ${done ? 'done' : ''}`} onClick={() => onOpen(t)}>
            <button type="button" className="td-tick" style={{ '--p': prioColor(t.priority) }}
                onClick={(e) => { e.stopPropagation(); onTick(t, !done) }}
                title={done ? 'Mark not done' : 'Mark done'} aria-label={done ? `Mark “${t.title}” not done` : `Mark “${t.title}” done`}>
                <i className={`mdi ${done ? 'mdi-check-circle' : 'mdi-check'}`}></i>
            </button>
            <div className="td-main">
                <b>{t.title}</b>
                <span className="td-meta">
                    {t.description && <span className="td-note">{t.description}</span>}
                    {items.length > 0 && <span className="td-sub"><i className="mdi mdi-format-list-checks"></i>{items.filter((c) => c.done).length}/{items.length}</span>}
                </span>
            </div>
            {t.priority === 'High' && !done && <i className="mdi mdi-flag td-hi" title="High priority"></i>}
            {t.dueDate && !done && <span className={`td-due ${late ? 'late' : ''}`}><i className="mdi mdi-calendar-blank-outline"></i>{dueText(t.dueDate)}</span>}
            <i className="mdi mdi-chevron-right td-go"></i>
        </li>
    )
}

/* ---------------- the Today view ---------------- */
export const TodayView = ({ tasks, onTick, onOpen }) => {
    const [showDone, setShowDone] = useState(false)
    const groups = useMemo(() => {
        const today = startOfDay(Date.now())
        const open = tasks.filter((t) => t.status !== 'Done')
        const byDue = (a, b) => new Date(a.dueDate) - new Date(b.dueDate) || (b.priority === 'High') - (a.priority === 'High')
        const at = (t) => startOfDay(t.dueDate)
        return {
            overdue: open.filter((t) => t.dueDate && at(t) < today).sort(byDue),
            today: open.filter((t) => t.dueDate && at(t) === today).sort(byDue),
            week: open.filter((t) => t.dueDate && at(t) > today && at(t) <= today + 7 * DAY).sort(byDue),
            later: open.filter((t) => t.dueDate && at(t) > today + 7 * DAY).sort(byDue),
            none: open.filter((t) => !t.dueDate).sort((a, b) => (b.priority === 'High') - (a.priority === 'High') || new Date(b.updatedAt) - new Date(a.updatedAt)),
            done: tasks.filter((t) => t.status === 'Done' && t.completedAt && startOfDay(t.completedAt) === today),
        }
    }, [tasks])
    const sections = [
        ['overdue', 'Overdue', 'mdi-alert-circle-outline', '#e11d48'],
        ['today', 'Today', 'mdi-white-balance-sunny', '#d97706'],
        ['week', 'Next 7 days', 'mdi-calendar-week', '#0284c7'],
        ['later', 'Later', 'mdi-calendar-month-outline', '#6366f1'],
        ['none', 'No date', 'mdi-tray', '#64748b'],
    ]
    const openCount = sections.reduce((n, [k]) => n + groups[k].length, 0)
    const total = openCount + groups.done.length
    const pct = total ? Math.round((groups.done.length / total) * 100) : 0
    const hour = new Date().getHours()

    return (
        <div className="td-today">
            <div className="td-hello">
                <div>
                    <h2>{hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'}</h2>
                    <p>{openCount ? <>You have <b>{groups.today.length + groups.overdue.length}</b> thing{groups.today.length + groups.overdue.length === 1 ? '' : 's'} for today{groups.overdue.length ? <> — <em>{groups.overdue.length} overdue</em></> : ''}.</> : 'You’re all clear. Add something above to plan your day.'}</p>
                </div>
                <div className="td-ring" style={{ '--pct': pct }} title={`${groups.done.length} done today`}><span><b>{groups.done.length}</b><small>done today</small></span></div>
            </div>

            {!openCount && !groups.done.length ? (
                <div className="td-empty"><span><i className="mdi mdi-check-all"></i></span><b>Nothing on your list</b><p>Add anything you need to remember. Only you can see your to-dos — project tasks stay in Projects.</p></div>
            ) : sections.map(([k, label, ic, c]) => groups[k].length > 0 && (
                <section key={k} className="td-sec" style={{ '--c': c }}>
                    <header><i className={`mdi ${ic}`}></i><b>{label}</b><span>{groups[k].length}</span></header>
                    <ul>{groups[k].map((t) => <Row key={t._id} t={t} onTick={onTick} onOpen={onOpen} />)}</ul>
                </section>
            ))}

            {groups.done.length > 0 && (
                <section className="td-sec done" style={{ '--c': '#059669' }}>
                    <header className="btn" onClick={() => setShowDone((v) => !v)}><i className="mdi mdi-check-circle-outline"></i><b>Completed today</b><span>{groups.done.length}</span><i className={`mdi mdi-chevron-${showDone ? 'up' : 'down'} td-caret`}></i></header>
                    {showDone && <ul>{groups.done.map((t) => <Row key={t._id} t={t} onTick={onTick} onOpen={onOpen} done />)}</ul>}
                </section>
            )}
        </div>
    )
}

/* ---------------- personal to-do window ---------------- */
export const TodoModal = ({ todo, onClose, onSaved, onDeleted }) => {
    const isNew = !todo?._id
    const init = { title: todo?.title || '', description: todo?.description || '', dueDate: todo?.dueDate ? String(todo.dueDate).slice(0, 10) : '', priority: todo?.priority || 'Medium', checklist: todo?.checklist || [] }
    const [f, setF] = useState(init)
    const [item, setItem] = useState('')
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState('')
    const done = todo?.status === 'Done'
    const dirty = JSON.stringify(f) !== JSON.stringify(init)
    const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }))

    const closeSafe = async () => {
        if (dirty && !(await confirmAction({ title: 'Discard your changes?', message: 'This to-do has changes that aren’t saved yet.', confirmLabel: 'Discard', cancelLabel: 'Keep editing', tone: 'warn' }))) return
        onClose()
    }
    const save = async (extra = {}) => {
        if (!f.title.trim()) return setErr('What do you need to do?')
        setBusy(true); setErr('')
        try {
            const body = { ...f, title: f.title.trim(), dueDate: f.dueDate || null, ...extra }
            const j = isNew ? await api('POST', '/todos', body) : await api('PUT', `/tasks/${todo._id}`, body)
            onSaved(j.data, isNew, extra.status)
        } catch (e) { setErr(e.message); setBusy(false) }
    }
    const remove = async () => {
        if (!(await confirmAction({ title: `Delete “${todo.title}”?`, message: 'It’s removed from your list for good.', confirmLabel: 'Delete' }))) return
        try { await api('DELETE', `/tasks/${todo._id}`); onDeleted(todo._id) } catch (e) { setErr(e.message) }
    }
    const addItem = () => { if (!item.trim()) return; setF((x) => ({ ...x, checklist: [...x.checklist, { text: item.trim(), done: false }] })); setItem('') }
    const doneItems = f.checklist.filter((c) => c.done).length

    return (
        <Modal title={isNew ? 'New to-do' : 'To-do'} sub="Personal · only you can see it" onClose={closeSafe}
            icon={<span className="pw-dicon" style={{ '--c': done ? '#059669' : '#0284c7' }}><i className={`mdi ${done ? 'mdi-check-circle' : 'mdi-checkbox-marked-circle-outline'}`}></i></span>}
            footer={<>
                {!isNew && <button type="button" className="pw-del" onClick={remove}><i className="mdi mdi-delete-outline"></i>Delete</button>}
                <span className="pw-err">{err}</span>
                {!isNew && <button type="button" className={`pp-btn ${done ? '' : 'td-done-btn'}`} disabled={busy} onClick={() => save({ status: done ? 'To Do' : 'Done' })}><i className={`mdi ${done ? 'mdi-restore' : 'mdi-check'}`}></i>{done ? 'Mark not done' : 'Mark done'}</button>}
                <button type="button" className="pp-btn primary" disabled={busy || (!isNew && !dirty)} onClick={() => save()}><i className="mdi mdi-content-save-outline"></i>{busy ? 'Saving…' : isNew ? 'Add to-do' : 'Save'}</button>
            </>}>
            <div className="td-form">
                <input className="pw-title-input" value={f.title} onChange={set('title')} placeholder="What do you need to do?" autoFocus={isNew} maxLength={160} />
                <div className="td-form-row">
                    <label className="pw-field"><span>Due</span><input type="date" className="pp-input" value={f.dueDate} onChange={set('dueDate')} min={isNew ? todayISO() : undefined} /></label>
                    <div className="pw-field"><span>Priority</span>
                        <div className="td-seg" role="radiogroup" aria-label="Priority">{PRIOS.map(([p, c]) => <button key={p} type="button" role="radio" aria-checked={f.priority === p} className={f.priority === p ? 'on' : ''} style={{ '--c': c }} onClick={() => set('priority')(p)}><i className="mdi mdi-flag"></i>{p}</button>)}</div>
                    </div>
                </div>
                <label className="pw-field"><span>Notes</span><textarea className="pp-input" rows={3} value={f.description} onChange={set('description')} placeholder="Details, phone numbers, links…" /></label>
                <div className="pw-field"><span>Steps {f.checklist.length > 0 && <em className="td-count">{doneItems}/{f.checklist.length}</em>}</span>
                    <ul className="pw-check">{f.checklist.map((c, i) => (
                        <li key={i} className={c.done ? 'done' : ''}>
                            <button type="button" onClick={() => setF((x) => ({ ...x, checklist: x.checklist.map((y, j) => (j === i ? { ...y, done: !y.done } : y)) }))} aria-label={c.done ? 'Mark step not done' : 'Mark step done'}><i className={`mdi ${c.done ? 'mdi-checkbox-marked-circle' : 'mdi-checkbox-blank-circle-outline'}`}></i></button>
                            <span>{c.text}</span>
                            <button type="button" className="pw-x-sm" onClick={() => setF((x) => ({ ...x, checklist: x.checklist.filter((_, j) => j !== i) }))} aria-label="Remove step"><i className="mdi mdi-close"></i></button>
                        </li>
                    ))}</ul>
                    <div className="pw-inline"><input className="pp-input" value={item} onChange={(e) => setItem(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem() } }} placeholder="Add a step and press Enter" /><button type="button" className="pp-btn" onClick={addItem} aria-label="Add step"><i className="mdi mdi-plus"></i></button></div>
                </div>
            </div>
        </Modal>
    )
}

/* ---------------- "why?" box for Blocked / sending back ---------------- */
export const ReasonModal = ({ task, to, onClose, onDone }) => {
    const [note, setNote] = useState('')
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState('')
    const blocked = to === 'Blocked'
    const go = async () => {
        if (note.trim().length < 3) return setErr(blocked ? 'Say what’s blocking it.' : 'Say what needs to change.')
        setBusy(true); setErr('')
        try { await api('PUT', `/tasks/${task._id}/move`, { status: to, note: note.trim() }); onDone() } catch (e) { setErr(e.message); setBusy(false) }
    }
    return (
        <Modal title={blocked ? `Blocked: ${taskTag(task)}` : `Send back ${taskTag(task)}`} sub={task.title} onClose={onClose}
            icon={<span className="pw-dicon" style={{ '--c': blocked ? '#e11d48' : '#d97706' }}><i className={`mdi ${blocked ? 'mdi-alert-octagon-outline' : 'mdi-restore'}`}></i></span>}
            footer={<>{err && <span className="pw-err">{err}</span>}<button type="button" className="pp-btn" onClick={onClose}>Cancel</button><button type="button" className="pp-btn primary" disabled={busy} onClick={go}><i className="mdi mdi-check"></i>{busy ? 'Saving…' : blocked ? 'Mark blocked' : `Move to ${to}`}</button></>}>
            <p className="pw-close-hint">{blocked ? 'The project lead and everyone on the task are told, with your reason.' : 'The person on the task is told what to change.'}</p>
            <textarea className="pp-input" rows={3} autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder={blocked ? 'What’s blocking it? e.g. Waiting for the client’s bank statements' : 'What needs to change? e.g. Add the March reconciliation'} />
        </Modal>
    )
}
