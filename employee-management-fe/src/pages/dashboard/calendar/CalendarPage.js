import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { PeopleShell, ErrorBanner } from '../../../components/people/PeopleUI'
import { api } from '../projects/ProjectParts'
import { EventModal } from './EventModal'
import { NotificationSettings } from './NotificationSettings'
import { CATS, catOf, colorOf, iconOf, sideOf, DAY, startOfDay, addDays, startOfWeek, sameDay, dayKey, daysOf, timeText } from './calendarKit'
import './calendarApp.css'

/* Calendar — work and personal life in one place: meetings, reminders and personal plans
   (family, health, travel, birthdays, bills…) together with task deadlines, to-dos, holidays and leave.
   Month / Week / Day / Agenda (upcoming 7, 15 or 30 days). Click a day or a time to plan
   something; click an item to open it. Everything here is read from the server: events are
   saved with their reminders, tasks keep their own dates. */

const VIEWS = [['month', 'Month', 'mdi-calendar-month-outline'], ['week', 'Week', 'mdi-calendar-week'], ['day', 'Day', 'mdi-calendar-today'], ['agenda', 'Agenda', 'mdi-format-list-text']]
const HOUR = 44 // px per hour in the week and day grids
const remember = (k, v) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } }
const recall = (k, d) => { try { return localStorage.getItem(k) || d } catch { return d } }

const rangeOf = (view, cursor, upcoming) => {
    if (view === 'month') { const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1); const from = startOfWeek(first); return [from, addDays(from, 42)] }
    if (view === 'week') { const from = startOfWeek(cursor); return [from, addDays(from, 7)] }
    if (view === 'day') { const from = startOfDay(cursor); return [from, addDays(from, 1)] }
    const from = startOfDay(new Date()); return [from, addDays(from, upcoming)]
}

// side-by-side columns for overlapping timed items in one day
const layout = (list) => {
    const sorted = [...list].sort((a, b) => new Date(a.start) - new Date(b.start))
    const lanes = []
    const placed = sorted.map((i) => {
        const s = new Date(i.start).getTime(), e = Math.max(new Date(i.end).getTime(), s + 30 * 60000)
        let lane = lanes.findIndex((end) => end <= s)
        if (lane < 0) { lane = lanes.length; lanes.push(e) } else lanes[lane] = e
        return { i, s, e, lane }
    })
    return placed.map((p) => ({ ...p, lanes: Math.max(1, lanes.length) }))
}

const Pill = ({ i, onOpen, compact }) => (
    <button type="button" className={`cal-pill ${i.done || i.status === 'Done' ? 'done' : ''} ${i.overdue ? 'late' : ''} ${i.kind}`} style={{ '--c': colorOf(i) }} onClick={(e) => { e.stopPropagation(); onOpen(i) }} title={`${i.title}${i.project ? ` · ${i.project.code}` : ''}`}>
        {!i.allDay && !compact && <span className="cal-pill-t">{timeText(i.start)}</span>}
        {(i.priority === 'Critical' || i.priority === 'High') && i.kind === 'event' && <i className="mdi mdi-alert-circle cal-pill-hi"></i>}
        <span className="cal-pill-x">{i.title}</span>
        {i.recurring && <i className="mdi mdi-repeat cal-pill-r"></i>}
    </button>
)

export const CalendarPage = () => {
    const navigate = useNavigate()
    const location = useLocation()
    const [view, setView] = useState(() => recall('cal-view', 'month'))
    const [cursor, setCursor] = useState(() => new Date())
    const [upcoming, setUpcoming] = useState(7)
    const [items, setItems] = useState(null)
    const [error, setError] = useState('')
    const [q, setQ] = useState('')
    const [hidden, setHidden] = useState(() => new Set(JSON.parse(recall('cal-hidden', '[]'))))
    const [modal, setModal] = useState(null) // { id, occurrence } | { seed }
    const [settings, setSettings] = useState(false)
    const [side, setSide] = useState(() => recall('cal-side', 'all')) // all | work | personal
    const gridRef = useRef(null)
    useEffect(() => remember('cal-side', side), [side])

    useEffect(() => remember('cal-view', view), [view])
    useEffect(() => remember('cal-hidden', JSON.stringify([...hidden])), [hidden])
    const [from, to] = useMemo(() => rangeOf(view, cursor, upcoming), [view, cursor, upcoming])

    const load = useCallback(() => {
        api('GET', `/calendar?from=${from.toISOString()}&to=${to.toISOString()}`).then((j) => { setItems(j.data); setError('') }).catch((e) => setError(e.message))
    }, [from, to])
    useEffect(() => { setItems(null); load() }, [load])

    // open an event from a link (?event=…&at=…), e.g. from a notification or the reminder popup
    useEffect(() => {
        const p = new URLSearchParams(location.search)
        const id = p.get('event')
        if (id) {
            const at = p.get('at') ? new Date(Number(p.get('at'))) : null
            if (at) setCursor(at)
            setModal({ id, occurrence: at })
            navigate('/calendar', { replace: true })
        }
    }, [location.search, navigate])
    // scroll the time grids to the working day
    useEffect(() => { if ((view === 'week' || view === 'day') && gridRef.current) gridRef.current.scrollTop = HOUR * 7.5 }, [view, items])

    const shown = useMemo(() => {
        const s = q.trim().toLowerCase()
        return (items || []).filter((i) => !hidden.has(catOf(i)) && (side === 'all' || sideOf(i) === side) && (!s || `${i.title} ${i.project?.code || ''} ${i.project?.name || ''} ${i.location || ''}`.toLowerCase().includes(s)))
    }, [items, hidden, q, side])
    const byDay = useMemo(() => { const m = new Map(); shown.forEach((i) => daysOf(i).forEach((k) => { if (!m.has(k)) m.set(k, []); m.get(k).push(i) })); return m }, [shown])
    const counts = useMemo(() => { const c = {}; (items || []).forEach((i) => { const k = catOf(i); c[k] = (c[k] || 0) + 1 }); return c }, [items])

    const open = (i) => {
        if (i.kind === 'event') setModal({ id: i.id, occurrence: i.occurrence })
        else if (i.link) navigate(i.link)
    }
    const plan = (date, hour, personal = side === 'personal') => {
        const s = new Date(date); s.setHours(Math.min(hour ?? 9, 23), 0, 0, 0)
        setModal({ seed: { start: s, end: new Date(s.getTime() + 3600000), personal } })
    }
    const move = (n) => setCursor((c) => (view === 'month' ? new Date(c.getFullYear(), c.getMonth() + n, 1) : addDays(c, view === 'week' ? 7 * n : n)))
    const title = view === 'month' ? cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
        : view === 'week' ? `${from.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${addDays(to, -1).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`
            : view === 'day' ? cursor.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                : `Next ${upcoming} days`
    const today = new Date()
    const toggleCat = (k) => setHidden((h) => { const n = new Set(h); n.has(k) ? n.delete(k) : n.add(k); return n })

    /* ---------- views (plain render functions, so the time grid keeps its scroll position) ---------- */
    const Month = () => {
        const days = Array.from({ length: 42 }, (_, n) => addDays(from, n))
        return (
            <div className="cal-month">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="cal-mhead">{d}</div>)}
                {days.map((d) => {
                    const list = byDay.get(dayKey(d)) || []
                    const late = list.some((i) => i.overdue)
                    return (
                        <div key={d.toISOString()} role="button" tabIndex={0} className={`cal-cell ${d.getMonth() !== cursor.getMonth() ? 'out' : ''} ${sameDay(d, today) ? 'today' : ''} ${[0, 6].includes(d.getDay()) ? 'wknd' : ''}`}
                            onClick={() => plan(d)} onKeyDown={(e) => e.key === 'Enter' && plan(d)} aria-label={`${d.toDateString()}, ${list.length} item${list.length === 1 ? '' : 's'}. Press Enter to add an event.`}>
                            <div className="cal-cell-top">
                                <button type="button" className="cal-dnum" onClick={(e) => { e.stopPropagation(); setCursor(d); setView('day') }} title="Open this day">{d.getDate()}</button>
                                {late && <i className="mdi mdi-alert-circle cal-late" title="Something is overdue"></i>}
                            </div>
                            <div className="cal-cell-items">
                                {list.slice(0, 3).map((i) => <Pill key={i.key} i={i} onOpen={open} />)}
                                {list.length > 3 && <button type="button" className="cal-more" onClick={(e) => { e.stopPropagation(); setCursor(d); setView('day') }}>+{list.length - 3} more</button>}
                            </div>
                            {list.length > 0 && <div className="cal-dots" aria-hidden="true">{list.slice(0, 4).map((i) => <i key={i.key} style={{ background: colorOf(i) }}></i>)}</div>}
                        </div>
                    )
                })}
            </div>
        )
    }

    const TimeGrid = ({ days }) => (
        <div className="cal-tg">
            <div className="cal-tg-head" style={{ '--n': days.length }}>
                <div className="cal-tg-gut"></div>
                {days.map((d) => <button key={d.toISOString()} type="button" className={`cal-tg-day ${sameDay(d, today) ? 'today' : ''}`} onClick={() => { setCursor(d); setView('day') }}><small>{d.toLocaleDateString(undefined, { weekday: 'short' })}</small><b>{d.getDate()}</b></button>)}
            </div>
            <div className="cal-tg-all" style={{ '--n': days.length }}>
                <div className="cal-tg-gut">all-day</div>
                {days.map((d) => <div key={d.toISOString()} className="cal-tg-allcell">{(byDay.get(dayKey(d)) || []).filter((i) => i.allDay).map((i) => <Pill key={i.key} i={i} onOpen={open} compact />)}</div>)}
            </div>
            <div className="cal-tg-body" ref={gridRef}>
                <div className="cal-tg-inner" style={{ '--n': days.length, height: HOUR * 24 }}>
                    <div className="cal-tg-gut">{Array.from({ length: 24 }, (_, h) => <span key={h} style={{ top: h * HOUR }}>{h ? new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: 'numeric' }) : ''}</span>)}</div>
                    {days.map((d) => {
                        const timed = (byDay.get(dayKey(d)) || []).filter((i) => !i.allDay)
                        const nowTop = sameDay(d, today) ? ((today.getHours() * 60 + today.getMinutes()) / 60) * HOUR : null
                        return (
                            <div key={d.toISOString()} className="cal-tg-col" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); plan(d, Math.floor((e.clientY - r.top) / HOUR)) }}>
                                {Array.from({ length: 24 }, (_, h) => <i key={h} className="cal-tg-line" style={{ top: h * HOUR }}></i>)}
                                {nowTop !== null && <i className="cal-now" style={{ top: nowTop }}></i>}
                                {layout(timed).map(({ i, s, e, lane, lanes }) => {
                                    const dayStart = startOfDay(d).getTime()
                                    const top = Math.max(0, (s - dayStart) / 3600000) * HOUR
                                    const height = Math.max(22, ((Math.min(e, dayStart + DAY) - Math.max(s, dayStart)) / 3600000) * HOUR - 2)
                                    return (
                                        <button key={i.key} type="button" className={`cal-block ${i.done ? 'done' : ''}`} style={{ '--c': colorOf(i), top, height, left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)` }} onClick={(ev) => { ev.stopPropagation(); open(i) }}>
                                            <b>{i.title}</b><small>{timeText(i.start)} – {timeText(i.end)}{i.location ? ` · ${i.location}` : ''}</small>
                                        </button>
                                    )
                                })}
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )

    const Agenda = () => {
        const groups = []
        for (let d = new Date(from); d < to; d = addDays(d, 1)) { const list = byDay.get(dayKey(d)) || []; if (list.length) groups.push([new Date(d), list]) }
        if (!groups.length) return <div className="cal-empty"><span><i className="mdi mdi-calendar-check-outline"></i></span><b>Nothing planned for the next {upcoming} days</b><p>Add a meeting, a reminder or a personal plan — family, health, travel, birthdays, bills.</p></div>
        return (
            <div className="cal-agenda">
                {groups.map(([d, list]) => (
                    <section key={d.toISOString()} className={sameDay(d, today) ? 'today' : ''}>
                        <header><b>{sameDay(d, today) ? 'Today' : sameDay(d, addDays(today, 1)) ? 'Tomorrow' : d.toLocaleDateString(undefined, { weekday: 'long' })}</b><span>{d.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}</span></header>
                        <ul>{list.map((i) => (
                            <li key={i.key} onClick={() => open(i)} className={i.done || i.status === 'Done' ? 'done' : ''} style={{ '--c': colorOf(i) }}>
                                <span className="cal-ag-time">{i.allDay ? 'All day' : timeText(i.start)}</span>
                                <span className="cal-ag-bar"></span>
                                <div className="cal-ag-main">
                                    <b>{i.title}{i.recurring && <i className="mdi mdi-repeat"></i>}</b>
                                    <small>
                                        <span className="cal-tag" style={{ '--c': colorOf(i) }}><i className={`mdi ${iconOf(i)}`}></i>{i.kind === 'task' ? (i.overdue ? 'Overdue task' : `Task · ${i.status}`) : i.kind === 'event' ? i.eventType : (CATS[catOf(i)] || CATS.Meeting).label.replace(/s$/, '')}</span>
                                        {i.project && <span>{i.project.code} · {i.project.name}</span>}
                                        {i.location && <span><i className="mdi mdi-map-marker-outline"></i>{i.location}</span>}
                                        {i.assignee && <span><i className="mdi mdi-account-outline"></i>{i.assignee}</span>}
                                    </small>
                                </div>
                                {(i.priority === 'Critical' || i.priority === 'High') && i.kind === 'event' && <span className={`cal-prio ${i.priority.toLowerCase()}`}>{i.priority}</span>}
                                <i className="mdi mdi-chevron-right cal-ag-go"></i>
                            </li>
                        ))}</ul>
                    </section>
                ))}
            </div>
        )
    }

    // left panel: a mini month to jump around, and what's next
    const MiniMonth = () => {
        const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
        const start = startOfWeek(first)
        return (
            <div className="cal-mini">
                <div className="cal-mini-head">
                    <b>{cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</b>
                    <button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} aria-label="Previous month"><i className="mdi mdi-chevron-left"></i></button>
                    <button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} aria-label="Next month"><i className="mdi mdi-chevron-right"></i></button>
                </div>
                <div className="cal-mini-grid">
                    {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, n) => <span key={n} className="cal-mini-wd">{d}</span>)}
                    {Array.from({ length: 42 }, (_, n) => addDays(start, n)).map((d) => {
                        const has = (byDay.get(dayKey(d)) || []).length > 0
                        return <button key={d.toISOString()} type="button" className={`${d.getMonth() !== cursor.getMonth() ? 'out' : ''} ${sameDay(d, today) ? 'today' : ''} ${sameDay(d, cursor) && view !== 'month' ? 'sel' : ''}`} onClick={() => { setCursor(d); if (view === 'month' || view === 'agenda') setView('day') }} aria-label={d.toDateString()}>{d.getDate()}{has && <i></i>}</button>
                    })}
                </div>
            </div>
        )
    }
    const nextUp = shown.filter((i) => new Date(i.allDay ? addDays(startOfDay(i.end || i.start), 1) : i.end || i.start) > today && !i.done && i.status !== 'Done').slice(0, 6)
    const whenOf = (i) => `${sameDay(i.start, today) ? 'Today' : sameDay(i.start, addDays(today, 1)) ? 'Tomorrow' : new Date(i.start).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}${i.allDay ? '' : ` · ${timeText(i.start)}`}`
    const kindOf = (i) => (i.kind === 'event' ? i.eventType : i.kind === 'task' ? (i.overdue ? 'Overdue task' : 'Task deadline') : (CATS[catOf(i)] || CATS.Meeting).label.replace(/s$/, ''))
    const sides = [['all', 'All', 'mdi-view-grid-outline'], ['work', 'Work', 'mdi-briefcase-outline'], ['personal', 'Personal', 'mdi-heart-outline']]

    return (
        <PeopleShell title="Calendar" root={{ label: 'Calendar', to: '/calendar' }} crumbs={[{ label: title }]}
            actions={<>
                <button type="button" className="pp-btn cal-only-sm" onClick={() => plan(view === 'day' ? cursor : new Date(), new Date().getHours() + 1, true)} title="Plan something personal"><i className="mdi mdi-heart-outline"></i></button>
                <button type="button" className="pp-btn primary cal-only-sm" onClick={() => plan(view === 'day' ? cursor : new Date(), new Date().getHours() + 1)}><i className="mdi mdi-plus"></i>New</button>
            </>}>
            <ErrorBanner error={error} />
            <div className="cal-shell">
                <aside className="cal-aside">
                    <div className="cal-create">
                        <button type="button" className="cal-new" onClick={() => plan(view === 'day' ? cursor : new Date(), new Date().getHours() + 1, false)}><i className="mdi mdi-plus"></i>New event</button>
                        <button type="button" className="cal-new personal" onClick={() => plan(view === 'day' ? cursor : new Date(), new Date().getHours() + 1, true)} title="Family, health, travel, birthdays, bills…"><i className="mdi mdi-heart-outline"></i>Personal plan</button>
                    </div>
                    {MiniMonth()}
                    <div className="cal-aside-sec">
                        <h5>Show</h5>
                        <div className="cal-sidefilter">{sides.map(([k, l, ic]) => <button key={k} type="button" className={side === k ? 'on' : ''} onClick={() => setSide(k)} aria-pressed={side === k}><i className={`mdi ${ic}`}></i>{l}</button>)}</div>
                        <ul className="cal-catlist">{Object.entries(CATS).map(([k, c]) => (
                            <li key={k}><label className={hidden.has(k) ? 'off' : ''} style={{ '--c': c.color }}><input type="checkbox" checked={!hidden.has(k)} onChange={() => toggleCat(k)} /><i className="cal-check-box"></i><span>{c.label}</span>{counts[k] ? <em>{counts[k]}</em> : null}</label></li>
                        ))}</ul>
                    </div>
                    <button type="button" className="cal-settings-card" onClick={() => setSettings(true)}>
                        <span className="cal-settings-ic"><i className="mdi mdi-bell-ring-outline"></i></span>
                        <span><b>Notification settings</b><small>Reminders, email, quiet hours</small></span>
                        <i className="mdi mdi-chevron-right"></i>
                    </button>
                </aside>

                <main className="cal-main">
                    <div className="cal-top">
                        <div className="cal-nav">
                            {view !== 'agenda' ? <>
                                <button type="button" className="cal-today" onClick={() => setCursor(new Date())}>Today</button>
                                <div className="cal-arrows"><button type="button" onClick={() => move(-1)} aria-label="Previous"><i className="mdi mdi-chevron-left"></i></button><button type="button" onClick={() => move(1)} aria-label="Next"><i className="mdi mdi-chevron-right"></i></button></div>
                                <h2>{title}</h2>
                            </> : <>
                                <h2>Upcoming</h2>
                                <div className="cal-seg sm">{[7, 15, 30].map((n) => <button key={n} type="button" className={upcoming === n ? 'on' : ''} onClick={() => setUpcoming(n)}>{n} days</button>)}</div>
                            </>}
                        </div>
                        <div className="cal-tools">
                            <button type="button" className="cal-alerts" onClick={() => setSettings(true)} title="Notification settings" aria-label="Notification settings"><i className="mdi mdi-bell-ring-outline"></i><span>Alerts</span></button>
                            <div className="cal-find"><i className="mdi mdi-magnify"></i><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search the calendar" /></div>
                            <div className="cal-views" role="tablist">{VIEWS.map(([k, l, ic]) => <button key={k} type="button" role="tab" aria-selected={view === k} className={view === k ? 'on' : ''} onClick={() => setView(k)} title={l}><i className={`mdi ${ic}`}></i><span>{l}</span></button>)}</div>
                        </div>
                    </div>
                    <div className="cal-chiprow">
                        <div className="cal-sidefilter">{sides.map(([k, l, ic]) => <button key={k} type="button" className={side === k ? 'on' : ''} onClick={() => setSide(k)}><i className={`mdi ${ic}`}></i>{l}</button>)}</div>
                        {Object.entries(CATS).map(([k, c]) => <button key={k} type="button" className={`cal-cat ${hidden.has(k) ? 'off' : ''}`} style={{ '--c': c.color }} onClick={() => toggleCat(k)} aria-pressed={!hidden.has(k)}><i className="cal-cat-dot"></i>{c.label}</button>)}
                    </div>
                    <div className="cal-card">
                        {!items ? <div className="cal-loading"><i className="mdi mdi-loading mdi-spin"></i>Loading your calendar…</div>
                            : view === 'month' ? Month() : view === 'week' ? TimeGrid({ days: Array.from({ length: 7 }, (_, n) => addDays(from, n)) }) : view === 'day' ? TimeGrid({ days: [startOfDay(cursor)] }) : Agenda()}
                    </div>

                    {/* what's coming next, on its own below the calendar (the agenda already lists it) */}
                    {items && view !== 'agenda' && (
                        <section className="cal-upnext">
                            <header><h3><i className="mdi mdi-clock-fast"></i>Next up</h3>{nextUp.length > 0 && <button type="button" onClick={() => setView('agenda')}>See all upcoming<i className="mdi mdi-chevron-right"></i></button>}</header>
                            {nextUp.length ? (
                                <div className="cal-upnext-grid">{nextUp.map((i) => (
                                    <button key={i.key} type="button" className={`cal-up ${i.overdue ? 'late' : ''}`} style={{ '--c': colorOf(i) }} onClick={() => open(i)}>
                                        <span className="cal-up-ic"><i className={`mdi ${iconOf(i)}`}></i></span>
                                        <span className="cal-up-main">
                                            <small>{whenOf(i)}</small>
                                            <b>{i.title}</b>
                                            <em>{kindOf(i)}{i.project ? ` · ${i.project.code}` : ''}{i.location ? ` · ${i.location}` : ''}</em>
                                        </span>
                                        {(i.priority === 'Critical' || i.priority === 'High') && i.kind === 'event' && <span className={`cal-prio ${i.priority.toLowerCase()}`}>{i.priority}</span>}
                                    </button>
                                ))}</div>
                            ) : <p className="cal-up-empty">Nothing else coming up in this view. Plan a meeting or something personal.</p>}
                        </section>
                    )}
                </main>
            </div>

            {modal && <EventModal id={modal.id} occurrence={modal.occurrence} seed={modal.seed} onClose={() => setModal(null)} onChanged={load} />}
            {settings && <NotificationSettings onClose={() => setSettings(false)} />}
        </PeopleShell>
    )
}
