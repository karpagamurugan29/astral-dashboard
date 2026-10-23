import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PeopleShell, Avatar, EmptyState, ErrorBanner, fullName } from '../../../components/people/PeopleUI'
import { chatApi as api } from '../../../components/chat/chatApi'
import './SubordinateAttendance.css'

/* Subordinate attendance: a month calendar for every person you look after — office,
   work from home, field / client visits, leave, holidays and weekends, and days with no
   check-in — with each person's totals. Leads see their team; HR and seniors everyone. */

const ROOT = { label: 'Attendance', to: '/attendance/today' }
export const DAY_META = {
    present: ['Present', 'mdi-check-circle-outline', '#10b981'],
    wfh: ['Remote (WFH)', 'mdi-home-outline', '#3b82f6'],
    field: ['Field / client', 'mdi-briefcase-outline', '#8b5cf6'],
    half: ['Half day', 'mdi-circle-half-full', '#0d9488'],
    leave: ['Leave', 'mdi-beach', '#f59e0b'],
    holiday: ['Holiday', 'mdi-star-circle', '#ec4899'],
    weekend: ['Weekend', 'mdi-creation', '#ec4899'],
    absent: ['No check-in', 'mdi-close-circle-outline', '#ef4444'],
    rejected: ['Rejected', 'mdi-close-circle-outline', '#ef4444'],
    upcoming: ['Upcoming', 'mdi-minus-circle-outline', '#94a3b8'],
}
const LEGEND = [['present', 'Present'], ['wfh', 'Remote (WFH)'], ['field', 'Field duty'], ['leave', 'Leave'], ['holiday', 'Weekend / holiday'], ['absent', 'Absent / rejected']]
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const inDays = (s) => s.present + s.wfh + s.field
const rateOf = (s) => { const base = inDays(s) + s.absent; return base ? Math.round((inDays(s) / base) * 100) : 0 }
const rateColor = (r) => (r >= 90 ? '#10b981' : r >= 75 ? '#f59e0b' : '#ef4444')
const Counters = ({ s }) => (
    <span className="sa-counters">
        {[['present', s.present, 'Present'], ['wfh', s.wfh, 'Work from home'], ['field', s.field, 'Field / client'], ['leave', s.leave, 'Leave'], ['absent', s.absent, 'No check-in']].map(([k, v, t]) => (
            <span key={k} className={v ? '' : 'zero'} style={{ '--c': DAY_META[k][2] }} title={t}><i className={`mdi ${DAY_META[k][1]}`}></i>{v}</span>
        ))}
    </span>
)

export const SubordinateAttendance = () => {
    const now = new Date()
    const [year, setYear] = useState(now.getFullYear())
    const [month, setMonth] = useState(now.getMonth() + 1)
    const [d, setD] = useState(null)
    const [error, setError] = useState('')
    const [q, setQ] = useState('')
    const [open, setOpen] = useState(() => new Set())
    const [only, setOnly] = useState('')

    useEffect(() => {
        setD(null)
        api('GET', `/attendance/subordinates?year=${year}&month=${month}`).then((j) => { setD(j); setError('') }).catch((e) => setError(e.message))
    }, [year, month])

    const rows = useMemo(() => (d?.data || []).filter((r) => {
        if (q && !`${fullName(r.employee)} ${r.employee.employeeId} ${r.employee.designation} ${r.employee.department}`.toLowerCase().includes(q.toLowerCase())) return false
        if (only === 'absent') return r.summary.absent > 0
        if (only === 'leave') return r.summary.leave > 0
        if (only === 'wfh') return r.summary.wfh > 0
        return true
    }), [d, q, only])
    const totals = useMemo(() => (d?.data || []).reduce((t, r) => ({ present: t.present + r.summary.present, wfh: t.wfh + r.summary.wfh, field: t.field + r.summary.field, leave: t.leave + r.summary.leave, absent: t.absent + r.summary.absent }), { present: 0, wfh: 0, field: 0, leave: 0, absent: 0 }), [d])
    const toggle = (id) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
    const years = [...new Set([now.getFullYear() - 1, now.getFullYear(), year])].sort()
    const firstDow = d?.calendar?.[0]?.dow ?? 0

    const shiftMonth = (n) => { const t = new Date(year, month - 1 + n, 1); setYear(t.getFullYear()); setMonth(t.getMonth() + 1) }
    const isCurrent = year === now.getFullYear() && month === now.getMonth() + 1
    const allOpen = rows.length > 0 && open.size >= rows.length
    const people = d?.data || []
    const avg = people.length ? Math.round(people.reduce((t, r) => t + rateOf(r.summary), 0) / people.length) : 0

    return (
        <PeopleShell title="Subordinate attendance" root={ROOT} crumbs={[{ label: 'Subordinate attendance' }]}
            actions={<Link to="/attendance/team" className="pp-btn"><i className="mdi mdi-account-clock-outline"></i>Team today</Link>}>
            <ErrorBanner error={error} />

            <div className="sa-bar pp-card">
                <div className="sa-month-nav">
                    <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month"><i className="mdi mdi-chevron-left"></i></button>
                    <select value={month} onChange={(e) => setMonth(Number(e.target.value))} aria-label="Month">{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
                    <select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Year">{years.map((y) => <option key={y}>{y}</option>)}</select>
                    <button type="button" onClick={() => shiftMonth(1)} disabled={isCurrent} aria-label="Next month"><i className="mdi mdi-chevron-right"></i></button>
                </div>
                {!isCurrent && <button type="button" className="pp-btn sm" onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth() + 1) }}>This month</button>}
                <div className="pp-search sa-find"><i className="mdi mdi-magnify"></i><input type="search" className="pp-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a person…" /></div>
                <div className="sa-only">{[['', 'Everyone'], ['absent', 'Absences'], ['leave', 'On leave'], ['wfh', 'Remote']].map(([k, l]) => <button key={k || 'all'} type="button" className={only === k ? 'on' : ''} onClick={() => setOnly(k)}>{l}</button>)}</div>
                <button type="button" className="pp-btn sm sa-expand" onClick={() => setOpen(allOpen ? new Set() : new Set(rows.map((r) => r.employee._id)))}><i className={`mdi ${allOpen ? 'mdi-unfold-less-horizontal' : 'mdi-unfold-more-horizontal'}`}></i>{allOpen ? 'Collapse all' : 'Expand all'}</button>
            </div>

            {d && (
                <div className="sa-totals">
                    {[['', `${avg}%`, 'Attendance', 'mdi-chart-donut', rateColor(avg)], ['', people.length, 'People', 'mdi-account-group-outline', '#1e40af'], ['present', totals.present, 'Present days'], ['wfh', totals.wfh, 'WFH days'], ['field', totals.field, 'Field days'], ['leave', totals.leave, 'Leave days'], ['absent', totals.absent, 'No check-in']].map(([k, v, l, ic, c]) => (
                        <div key={l} style={{ '--c': c || DAY_META[k][2] }}><i className={`mdi ${ic || DAY_META[k][1]}`}></i><b>{v}</b><small>{l}</small></div>
                    ))}
                </div>
            )}

            <section className="pp-card sa-list">
                <div className="sa-legend">{LEGEND.map(([k, label]) => <span key={k}><i style={{ '--c': DAY_META[k][2] }}></i>{label}</span>)}<span className="sa-hint">{rows.length} of {people.length} · click a person for the calendar</span></div>
                {!d ? <div className="pw-loading"><i className="mdi mdi-loading mdi-spin"></i></div> : !rows.length ? (
                    <EmptyState icon="mdi-account-group-outline" title={people.length ? 'Nobody matches' : 'Nobody reports to you yet'} text={people.length ? 'Try another filter.' : 'When people are assigned to you, their month appears here.'} />
                ) : rows.map((r) => {
                    const isOpen = open.has(r.employee._id)
                    const rate = rateOf(r.summary)
                    return (
                        <div key={r.employee._id} className={`sa-row ${isOpen ? 'open' : ''}`}>
                            <header onClick={() => toggle(r.employee._id)} role="button" tabIndex={0} aria-expanded={isOpen} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle(r.employee._id))}>
                                <i className="mdi mdi-chevron-right sa-chev"></i>
                                <Avatar person={r.employee} size={32} />
                                <div className="sa-who"><b>{fullName(r.employee)}</b><small>{r.employee.employeeId} · {r.employee.designation}</small></div>
                                <span className="sa-strip" aria-hidden="true">{d.calendar.map((c, i) => <i key={c.key} className={c.key === d.today ? 'today' : ''} style={{ '--c': (DAY_META[r.cells[i].s] || DAY_META.upcoming)[2] }} title={`${c.day} ${MONTHS[month - 1]} · ${(DAY_META[r.cells[i].s] || DAY_META.upcoming)[0]}${r.cells[i].note ? ` — ${r.cells[i].note}` : ''}`}></i>)}</span>
                                <Counters s={r.summary} />
                                <span className="sa-rate" style={{ '--c': rateColor(rate) }}>{rate}%</span>
                            </header>
                            {isOpen && (
                                <div className="sa-detail">
                                    <div className="sa-cal">
                                        {DOW.map((w) => <span key={w} className="sa-dow">{w[0]}</span>)}
                                        {Array.from({ length: firstDow }, (_, i) => <span key={`pad${i}`}></span>)}
                                        {d.calendar.map((c, i) => {
                                            const cell = r.cells[i]
                                            const [label, ic, col] = DAY_META[cell.s] || DAY_META.upcoming
                                            return (
                                                <div key={c.key} className={`sa-day s-${cell.s} ${c.key === d.today ? 'today' : ''}`} style={{ '--c': col }} title={`${DOW[c.dow]} ${c.day} ${MONTHS[month - 1]} · ${label}${cell.note ? ` — ${cell.note}` : ''}`}>
                                                    <b>{c.day}</b><i className={`mdi ${ic}`}></i>
                                                </div>
                                            )
                                        })}
                                    </div>
                                    <div className="sa-stats">
                                        <div className="sa-big" style={{ '--c': rateColor(rate) }}><b>{rate}%</b><small>attendance · {inDays(r.summary)} of {inDays(r.summary) + r.summary.absent} working days</small><em><i style={{ width: `${rate}%` }}></i></em></div>
                                        {[['present', 'Present (office)'], ['wfh', 'Work from home'], ['field', 'Field / client'], ['leave', 'Leave'], ['absent', 'No check-in']].map(([k, l]) => (
                                            <div key={k} className="sa-stat" style={{ '--c': DAY_META[k][2] }}><i className={`mdi ${DAY_META[k][1]}`}></i><span>{l}</span><b>{r.summary[k]}</b></div>
                                        ))}
                                        {(() => { const notes = r.cells.map((c, i) => ({ ...c, day: d.calendar[i] })).filter((c) => ['leave', 'absent', 'rejected'].includes(c.s) && c.note).slice(-4); return notes.length ? <ul className="sa-notes">{notes.map((c) => <li key={c.day.key} style={{ '--c': (DAY_META[c.s] || DAY_META.absent)[2] }}><b>{c.day.day} {MONTHS[month - 1].slice(0, 3)}</b>{c.note}</li>)}</ul> : null })()}
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                })}
            </section>
        </PeopleShell>
    )
}
