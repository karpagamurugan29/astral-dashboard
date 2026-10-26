import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Panel } from './PremiumUI'
import { Avatar, fullName } from '../../people/PeopleUI'
import { chatApi as api } from '../../chat/chatApi'
import './BirthdayLineUp.css'

/* Birthday line-up: birthdays in a date range (default today → 3 months on), nearest first.
   The server matches month + day (so New Year and 29 Feb work) and applies directory visibility. */

const pad = (n) => String(n).padStart(2, '0')
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parse = (k) => new Date(`${k}T00:00:00`)
const plusMonths = (k, n) => { const d = parse(k); const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return keyOf(d) }
const fmt = (k, opts = { day: 'numeric', month: 'short', year: 'numeric' }) => parse(k).toLocaleDateString('en-GB', opts)

const presets = () => {
    const t = new Date(), today = keyOf(t)
    return [
        ['next3', 'Next 3 months', today, plusMonths(today, 3)],
        ['month', 'This month', keyOf(new Date(t.getFullYear(), t.getMonth(), 1)), keyOf(new Date(t.getFullYear(), t.getMonth() + 1, 0))],
        ['nextm', 'Next month', keyOf(new Date(t.getFullYear(), t.getMonth() + 1, 1)), keyOf(new Date(t.getFullYear(), t.getMonth() + 2, 0))],
        ['year', 'This year', `${t.getFullYear()}-01-01`, `${t.getFullYear()}-12-31`],
    ]
}
const whenText = (r) => {
    if (r.daysAway === 0) return 'Today'
    if (r.daysAway === 1) return 'Tomorrow'
    if (r.daysAway === -1) return 'Yesterday'
    return r.daysAway > 0 ? `${r.daysAway} days` : `${-r.daysAway}d ago`
}

export const BirthdayLineUp = () => {
    const P = useMemo(presets, [])
    const [range, setRange] = useState({ from: P[0][2], to: P[0][3] })
    const [editing, setEditing] = useState(false)
    const [d, setD] = useState(null)
    const [error, setError] = useState('')
    const invalid = range.to < range.from ? 'The end date is before the start date.' : ''

    useEffect(() => {
        if (invalid || !range.from || !range.to) return undefined
        let live = true
        setD(null)
        const t = setTimeout(() => api('GET', `/employees/birthdays?from=${range.from}&to=${range.to}`)
            .then((j) => { if (live) { setD(j); setError('') } }).catch((e) => live && setError(e.message)), 150)
        return () => { live = false; clearTimeout(t) }
    }, [range, invalid])

    const rows = useMemo(() => d?.data || [], [d])
    const todays = rows.filter((r) => r.when === 'today')
    const groups = useMemo(() => {
        const g = []
        rows.forEach((r) => {
            const label = fmt(r.date, { month: 'long', year: 'numeric' })
            if (!g.length || g[g.length - 1].label !== label) g.push({ label, items: [] })
            g[g.length - 1].items.push(r)
        })
        return g
    }, [rows])
    // a range reaching into the past opens at today / the next birthday, not at the oldest one
    const listRef = useRef(null)
    useEffect(() => {
        const el = listRef.current
        const first = el?.querySelector('.bday-row.today, .bday-row.upcoming')
        if (el && first) el.scrollTop += first.getBoundingClientRect().top - el.getBoundingClientRect().top - 28
    }, [rows])
    const isDefault = range.from === P[0][2] && range.to === P[0][3]
    const active = P.find(([, , f, t]) => f === range.from && t === range.to)?.[0]

    return (
        <Panel icon="mdi-cake-variant" color="#db2777" title="Birthday line-up" className="bday"
            subtitle={<span className="bday-range"><i className="mdi mdi-calendar-range"></i>{fmt(range.from)} <i className="mdi mdi-arrow-right"></i> {fmt(range.to)}{d && !invalid ? <b>· {rows.length} birthday{rows.length === 1 ? '' : 's'}</b> : null}</span>}
            actions={<button type="button" className={`bday-toggle ${editing ? 'on' : ''}`} onClick={() => setEditing(!editing)} aria-expanded={editing} aria-label="Change date range" title="Change date range"><i className="mdi mdi-tune-variant"></i></button>}>

            {editing && (
                <div className="bday-filter">
                    <div className="bday-presets">{P.map(([k, l, f, t]) => <button key={k} type="button" className={active === k ? 'on' : ''} onClick={() => setRange({ from: f, to: t })}>{l}</button>)}</div>
                    <div className="bday-dates">
                        <label><span>From</span><input type="date" className="pp-input" value={range.from} onChange={(e) => e.target.value && setRange((r) => ({ ...r, from: e.target.value }))} /></label>
                        <label><span>To</span><input type="date" className="pp-input" value={range.to} min={range.from} onChange={(e) => e.target.value && setRange((r) => ({ ...r, to: e.target.value }))} /></label>
                        {!isDefault && <button type="button" className="bday-reset" onClick={() => setRange({ from: P[0][2], to: P[0][3] })}><i className="mdi mdi-restore"></i>Reset</button>}
                    </div>
                    {invalid && <p className="bday-err"><i className="mdi mdi-alert-circle-outline"></i>{invalid}</p>}
                </div>
            )}

            {error && !invalid ? <p className="bday-err"><i className="mdi mdi-alert-circle-outline"></i>{error}</p>
                : !d && !invalid ? <div className="bday-skel">{[0, 1, 2, 3].map((i) => <div key={i} className="pp-skel"></div>)}</div>
                    : invalid ? null
                        : !rows.length ? (
                            <div className="bday-empty">
                                <span><i className="mdi mdi-cake-variant"></i></span>
                                <b>No birthdays in this period</b>
                                <small>Nobody you can see has a birthday between {fmt(range.from)} and {fmt(range.to)}.</small>
                                {!isDefault && <button type="button" className="pp-btn sm" onClick={() => setRange({ from: P[0][2], to: P[0][3] })}>Show the next 3 months</button>}
                            </div>
                        ) : (
                            <>
                                {todays.length > 0 && (
                                    <div className="bday-today" role="status">
                                        <span className="bday-confetti" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span>
                                        <i className="mdi mdi-party-popper bday-pop" aria-hidden="true"></i>
                                        <div className="bday-today-people">{todays.slice(0, 4).map((r) => <Avatar key={r.employee._id} person={r.employee} size={34} ring />)}</div>
                                        <div className="bday-today-text">
                                            <b>{todays.length === 1 ? `Happy birthday, ${todays[0].employee.firstName}!` : `${todays.length} birthdays today!`}</b>
                                            <small>{todays.length === 1 ? `${todays[0].employee.designation || ''}${todays[0].employee.department ? ` · ${todays[0].employee.department}` : ''}` : todays.map((r) => r.employee.firstName).join(', ')}</small>
                                        </div>
                                    </div>
                                )}
                                <div className="bday-list" ref={listRef} tabIndex={0} aria-label="Birthdays">
                                    {groups.map((g) => (
                                        <div key={g.label} className="bday-group">
                                            <h4>{g.label}</h4>
                                            <ul>{g.items.map((r) => (
                                                <li key={`${r.employee._id}${r.date}`} className={`bday-row ${r.when}`}>
                                                    <span className="bday-date"><b>{parse(r.date).getDate()}</b><small>{fmt(r.date, { weekday: 'short' })}</small></span>
                                                    <Avatar person={r.employee} size={34} />
                                                    <Link to={`/employees/${r.employee._id}`} className="bday-who">
                                                        <b>{fullName(r.employee)}</b>
                                                        <small>{[r.employee.designation, r.employee.department].filter(Boolean).join(' · ') || '—'}</small>
                                                    </Link>
                                                    <span className="bday-when" title={`${fmt(r.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}${r.daysAway > 0 ? ` · in ${r.daysAway} day${r.daysAway === 1 ? '' : 's'}` : ''}`}>
                                                        {r.when === 'today' && <i className="mdi mdi-cake-variant"></i>}{whenText(r)}
                                                    </span>
                                                </li>
                                            ))}</ul>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
        </Panel>
    )
}
