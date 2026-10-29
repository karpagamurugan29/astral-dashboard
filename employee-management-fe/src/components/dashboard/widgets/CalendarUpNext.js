import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { chatApi as api } from '../../chat/chatApi'
import { Panel } from './PremiumUI'
import { CATS, catOf, colorOf, iconOf, startOfDay, addDays, sameDay, dayKey, daysOf, timeText } from '../../../pages/dashboard/calendar/calendarKit'
import './CalendarUpNext.css'

/* Dashboard: what's next on your calendar — a 7-day strip with activity dots and the next few
   items (meetings, personal plans, task deadlines, to-dos, holidays, leave). Reads the same
   /calendar feed as the Calendar page, so it only ever shows what you're allowed to see. */

const kindOf = (i) => (i.kind === 'event' ? i.eventType : i.kind === 'task' ? (i.overdue ? 'Overdue task' : 'Task deadline') : (CATS[catOf(i)] || CATS.Meeting).label.replace(/s$/, ''))

export const CalendarUpNext = () => {
    const navigate = useNavigate()
    const [items, setItems] = useState(null)
    const [error, setError] = useState('')
    const [day, setDay] = useState(null) // a day picked on the strip
    useEffect(() => {
        const from = startOfDay(new Date()), to = addDays(from, 7)
        api('GET', `/calendar?from=${from.toISOString()}&to=${to.toISOString()}`).then((j) => setItems(j.data || [])).catch((e) => setError(e.message))
    }, [])

    const now = new Date()
    const live = useMemo(() => (items || []).filter((i) => !i.done && i.status !== 'Done'), [items])
    const byDay = useMemo(() => { const m = new Map(); live.forEach((i) => daysOf(i).forEach((k) => { if (!m.has(k)) m.set(k, []); m.get(k).push(i) })); return m }, [live])
    const week = Array.from({ length: 7 }, (_, n) => addDays(startOfDay(now), n))
    const list = day
        ? (byDay.get(dayKey(day)) || [])
        : live.filter((i) => new Date(i.allDay ? addDays(startOfDay(i.end || i.start), 1) : i.end || i.start) > now).slice(0, 5)
    const todayCount = (byDay.get(dayKey(now)) || []).length
    const open = (i) => navigate(i.kind === 'event' ? i.link : i.link || '/calendar')

    return (
        <Panel icon="mdi-calendar-star" color="#2563eb" title="Calendar · next up" subtitle={items ? (todayCount ? `${todayCount} thing${todayCount === 1 ? '' : 's'} on today` : 'Nothing else on today') : 'Your week at a glance'}
            actions={<><Link to="/calendar" className="pp-link">Open calendar <i className="mdi mdi-chevron-right"></i></Link></>}>
            <div className="cun">
                <div className="cun-week" role="tablist" aria-label="Pick a day">
                    {week.map((d) => {
                        const n = (byDay.get(dayKey(d)) || []).length
                        const on = day ? sameDay(d, day) : false
                        return (
                            <button key={d.toISOString()} type="button" role="tab" aria-selected={on} className={`${sameDay(d, now) ? 'today' : ''} ${on ? 'on' : ''}`} onClick={() => setDay(on ? null : d)} title={`${n} item${n === 1 ? '' : 's'}`}>
                                <small>{sameDay(d, now) ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short' })}</small>
                                <b>{d.getDate()}</b>
                                <span className="cun-dots">{(byDay.get(dayKey(d)) || []).slice(0, 3).map((i) => <i key={i.key} style={{ background: colorOf(i) }}></i>)}</span>
                            </button>
                        )
                    })}
                </div>
                {error ? <p className="cun-empty">{error}</p> : !items ? (
                    <div className="cun-skel"><i></i><i></i><i></i></div>
                ) : list.length ? (
                    <ul className="cun-list">{list.map((i) => (
                        <li key={i.key} onClick={() => open(i)} className={i.overdue ? 'late' : ''} style={{ '--c': colorOf(i) }}>
                            <span className="cun-time">{i.allDay ? <em>All day</em> : <><b>{timeText(i.start)}</b></>}<small>{new Date(i.start) < startOfDay(now) ? 'Ongoing' : sameDay(i.start, now) ? 'Today' : sameDay(i.start, addDays(now, 1)) ? 'Tomorrow' : new Date(i.start).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}</small></span>
                            <span className="cun-ic"><i className={`mdi ${iconOf(i)}`}></i></span>
                            <span className="cun-main"><b>{i.title}</b><small>{kindOf(i)}{i.project ? ` · ${i.project.code}` : ''}{i.location ? ` · ${i.location}` : ''}</small></span>
                            {(i.priority === 'Critical' || i.priority === 'High') && i.kind === 'event' && <span className={`cun-prio ${i.priority.toLowerCase()}`}>{i.priority}</span>}
                        </li>
                    ))}</ul>
                ) : (
                    <div className="cun-empty"><i className="mdi mdi-calendar-check-outline"></i><span>{day ? 'Nothing planned that day.' : 'Nothing coming up this week.'}</span><Link to="/calendar" className="pp-link">Plan something <i className="mdi mdi-plus"></i></Link></div>
                )}
            </div>
        </Panel>
    )
}
