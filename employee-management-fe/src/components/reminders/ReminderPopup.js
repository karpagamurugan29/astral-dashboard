import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { chatApi as api } from '../chat/chatApi'
import { toast } from '../common/Toaster'
import './reminders.css'

/* "Today's reminders" — one grouped window for everything that's due, on every page.
   It asks the server for due reminders when the app opens, every minute, and when the tab comes
   back into view (the server delivers anything due at that moment, so this works even where no
   scheduler runs). Reminders you act on — done, dismissed or snoozed — never come back; closing
   the window only hides them for this session (they stay in the bell). Once a day it also shows
   what's on today, unless that's switched off in Notification settings. */

const POLL = 60000
const PRIO_RANK = { Critical: 0, High: 1, Medium: 2, Low: 3 }
const read = (k, store = sessionStorage) => { try { return JSON.parse(store.getItem(k) || 'null') } catch { return null } }
const write = (k, v, store = sessionStorage) => { try { store.setItem(k, JSON.stringify(v)) } catch { /* private mode */ } }
const dayKey = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
const timeText = (d) => new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
const tomorrowAt9 = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d }

export const ReminderPopup = () => {
    const navigate = useNavigate()
    const [due, setDue] = useState([])
    const [today, setToday] = useState([])
    const [open, setOpen] = useState(false)
    const [menu, setMenu] = useState(null) // reminder id whose snooze menu is open
    const [custom, setCustom] = useState('')
    const seen = useRef(new Set(read('rem-seen') || []))
    const alerted = useRef(new Set())
    const firstBtn = useRef(null)

    const check = useCallback(async () => {
        let j
        try { j = await api('GET', '/reminders/due') } catch { return } // signed out or offline: try again next time
        const list = [...(j.data || [])].sort((a, b) => (PRIO_RANK[a.priority] ?? 2) - (PRIO_RANK[b.priority] ?? 2) || new Date(a.dueAt) - new Date(b.dueAt))
        setDue(list)
        const fresh = list.filter((r) => !seen.current.has(r._id))
        // a desktop alert for new reminders while the tab is in the background
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
            fresh.filter((r) => !alerted.current.has(r._id)).forEach((r) => {
                alerted.current.add(r._id)
                try { const n = new Notification(r.title, { body: `${r.allDay ? 'Today' : timeText(r.occurrence)}${r.project ? ` · ${r.project.name}` : ''}`, tag: r._id, requireInteraction: r.priority === 'Critical' }); n.onclick = () => { window.focus(); n.close() } } catch { /* blocked */ }
            })
        }
        // once a day: what's on today
        let summary = []
        const sumKey = `rem-summary-${dayKey()}`
        if (j.dailySummary && !read(sumKey, localStorage)) {
            const from = new Date(); from.setHours(0, 0, 0, 0)
            const to = new Date(from.getTime() + 864e5 - 1)
            try {
                const c = await api('GET', `/calendar?from=${from.toISOString()}&to=${to.toISOString()}`)
                summary = (c.data || []).filter((i) => i.kind !== 'holiday' && !i.done && i.status !== 'Done')
            } catch { /* ignore */ }
            write(sumKey, 1, localStorage)
            setToday(summary)
        }
        if (fresh.length || summary.length) setOpen(true)
    }, [])

    useEffect(() => {
        const first = setTimeout(check, 2500)
        const every = setInterval(check, POLL)
        const back = () => { if (!document.hidden) check() }
        document.addEventListener('visibilitychange', back)
        return () => { clearTimeout(first); clearInterval(every); document.removeEventListener('visibilitychange', back) }
    }, [check])
    useEffect(() => { if (open) setTimeout(() => firstBtn.current?.focus(), 50) }, [open])

    const close = useCallback(() => {
        due.forEach((r) => seen.current.add(r._id))
        write('rem-seen', [...seen.current].slice(-200))
        setOpen(false); setToday([]); setMenu(null)
    }, [due])
    useEffect(() => { if (!open) return undefined; const k = (e) => e.key === 'Escape' && close(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [open, close])

    const drop = (id) => setDue((l) => { const n = l.filter((r) => r._id !== id); if (!n.length && !today.length) setOpen(false); return n })
    const act = async (r, path, body, msg) => {
        try { await api('POST', `/reminders/${r._id}/${path}`, body); drop(r._id); toast.success(msg, { title: r.title }) } catch (e) { toast.error(e.message) }
    }
    const snooze = (r, minutes, until) => { setMenu(null); setCustom(''); act(r, 'snooze', until ? { until: until.toISOString() } : { minutes }, until ? `We’ll remind you ${until.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}.` : `We’ll remind you in ${minutes < 60 ? `${minutes} minutes` : '1 hour'}.`) }
    const view = (link) => { close(); navigate(link) }
    const dismissAll = async () => { for (const r of due) { try { await api('POST', `/reminders/${r._id}/ack`, { action: 'dismiss' }) } catch { /* keep going */ } } setDue([]); if (!today.length) setOpen(false); toast.success('All reminders dismissed.') }

    if (!open || (!due.length && !today.length)) return null
    const hour = new Date().getHours()
    const total = due.length + today.length
    const urgent = due.filter((r) => r.priority === 'Critical' || r.priority === 'High').length

    return createPortal(
        <div className="pp rem-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) close() }}>
            <div className="rem-dialog" role="dialog" aria-modal="true" aria-labelledby="rem-title">
                <header className="rem-head">
                    <span className="rem-bell"><i className="mdi mdi-bell-ring-outline"></i></span>
                    <div>
                        <h3 id="rem-title">{due.length ? 'Today’s reminders' : 'Your day'}</h3>
                        <p>{hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'}! You have <b>{total}</b> item{total === 1 ? '' : 's'}{due.length ? <> — <b>{due.length}</b> due now</> : ' on today'}{urgent ? <>, <em>{urgent} important</em></> : ''}.</p>
                    </div>
                    <button type="button" className="rem-x" onClick={close} aria-label="Close"><i className="mdi mdi-close"></i></button>
                </header>

                <div className="rem-body">
                    {due.length > 0 && <>
                        <h4>Due now</h4>
                        <ul className="rem-list">{due.map((r, n) => (
                            <li key={r._id} className={`rem-item p-${(r.priority || 'Medium').toLowerCase()}`}>
                                <div className="rem-time"><b>{r.allDay ? 'All day' : timeText(r.occurrence)}</b>{r.offset > 0 && <small>reminder</small>}</div>
                                <div className="rem-main">
                                    <b>{r.title}</b>
                                    <small>{r.eventType}{r.project ? ` · ${r.project.name}` : ''}{r.location ? ` · ${r.location}` : ''}</small>
                                    {(r.priority === 'Critical' || r.priority === 'High') && <span className="rem-prio">{r.priority}</span>}
                                </div>
                                <div className="rem-actions">
                                    <button type="button" ref={n === 0 ? firstBtn : null} className="rem-btn" onClick={() => view(r.link)} title="View details"><i className="mdi mdi-open-in-new"></i><span>View</span></button>
                                    <button type="button" className="rem-btn ok" onClick={() => act(r, 'ack', { action: 'complete' }, 'Marked done.')} title="Mark as completed"><i className="mdi mdi-check"></i><span>Done</span></button>
                                    <div className="rem-snooze">
                                        <button type="button" className="rem-btn" onClick={() => setMenu(menu === r._id ? null : r._id)} aria-expanded={menu === r._id} title="Remind me later"><i className="mdi mdi-alarm-snooze"></i><span>Later</span></button>
                                        {menu === r._id && (
                                            <div className="rem-menu" role="menu">
                                                {[5, 10, 30, 60].map((m) => <button key={m} type="button" role="menuitem" onClick={() => snooze(r, m)}>{m < 60 ? `${m} minutes` : '1 hour'}</button>)}
                                                <button type="button" role="menuitem" onClick={() => snooze(r, 0, tomorrowAt9())}>Tomorrow, 9:00</button>
                                                <div className="rem-custom"><input type="datetime-local" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Custom snooze time" /><button type="button" disabled={!custom} onClick={() => { const t = new Date(custom); if (t <= new Date()) return toast.error('Pick a time in the future.'); snooze(r, 0, t) }}>Set</button></div>
                                            </div>
                                        )}
                                    </div>
                                    <button type="button" className="rem-btn ghost" onClick={() => act(r, 'ack', { action: 'dismiss' }, 'Dismissed.')} title="Dismiss" aria-label="Dismiss"><i className="mdi mdi-close"></i></button>
                                </div>
                            </li>
                        ))}</ul>
                    </>}

                    {today.length > 0 && <>
                        <h4>On today</h4>
                        <ul className="rem-today">{today.map((i) => (
                            <li key={i.key} onClick={() => i.link && view(i.link)} className={i.overdue ? 'late' : ''}>
                                <span>{i.allDay ? 'All day' : timeText(i.start)}</span>
                                <b>{i.title}</b>
                                <small>{i.kind === 'task' ? `Task deadline${i.project ? ` · ${i.project.code}` : ''}` : i.kind === 'todo' ? 'To-do' : i.kind === 'leave' ? 'You’re on leave' : `${i.eventType}${i.project ? ` · ${i.project.code}` : ''}`}</small>
                            </li>
                        ))}</ul>
                    </>}
                </div>

                <footer className="rem-foot">
                    <button type="button" className="rem-link" onClick={() => view('/calendar')}><i className="mdi mdi-calendar-month-outline"></i>Open calendar</button>
                    <span></span>
                    {due.length > 1 && <button type="button" className="pp-btn" onClick={dismissAll}>Dismiss all</button>}
                    <button type="button" className="pp-btn primary" onClick={close}>Got it</button>
                </footer>
            </div>
        </div>,
        document.body
    )
}
