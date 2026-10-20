import React, { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import locationLogActions from '../../../redux/locationLog/Actions'
import employeeActions from '../../../redux/employee/Actions'
import { PeopleShell, Avatar, EmptyState, ErrorBanner, fullName } from '../../../components/people/PeopleUI'
import { ymd } from '../../../components/attendance/AttendanceUI'
import { fmtDuration } from '../../../components/audits/AuditUI'
import { mapsLink } from '../../../utils/geo'
import { LocationMap } from './LocationMap'
import '../../../components/attendance/attendance.css'
import '../projects/ProjectsList.css'
import './LocationLog.css'

const ROOT = { label: 'Location Log', to: '/location-log' }
const FORMER = ['Resigned', 'Terminated']

export const EVENT = {
    'check-in': { label: 'Checked in', color: '#059669', icon: 'mdi-login-variant' },
    'check-out': { label: 'Checked out', color: '#e11d48', icon: 'mdi-logout-variant' },
    'audit-start': { label: 'Started audit work', color: '#0284c7', icon: 'mdi-play-circle-outline' },
    'audit-stop': { label: 'Stopped audit work', color: '#7c3aed', icon: 'mdi-stop-circle-outline' },
}

const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d) }
const PRESETS = {
    today: { label: 'Today', range: () => [addDays(0), addDays(0)] },
    yesterday: { label: 'Yesterday', range: () => [addDays(-1), addDays(-1)] },
    week: { label: 'Last 7 days', range: () => [addDays(-6), addDays(0)] },
}

const timeOf = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const coords = (l) => `${l.latitude.toFixed(5)}, ${l.longitude.toFixed(5)}`

export const LocationLog = () => {
    const dispatch = useDispatch()
    const { events, loading, error } = useSelector((state) => state.locationLogReducer || {})
    const { list: employees } = useSelector((state) => state.employeeReducer || {})
    const [preset, setPreset] = useState('today')
    const [from, setFrom] = useState(addDays(0))
    const [to, setTo] = useState(addDays(0))
    const [employeeId, setEmployeeId] = useState('')
    const [types, setTypes] = useState([])
    const [search, setSearch] = useState('')
    const [selected, setSelected] = useState(null)

    useEffect(() => { dispatch({ type: employeeActions.GET_EMPLOYEES }) }, [dispatch])
    useEffect(() => {
        if (from && to && to >= from) dispatch({ type: locationLogActions.GET_LOCATION_LOG, from, to, employeeId })
    }, [dispatch, from, to, employeeId])

    const pickPreset = (k) => {
        setPreset(k)
        if (PRESETS[k]) { const [f, t] = PRESETS[k].range(); setFrom(f); setTo(t) }
    }

    const people = useMemo(() => (employees || []).filter((e) => !FORMER.includes(e.status)).sort((a, b) => fullName(a).localeCompare(fullName(b))), [employees])

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        return (events || [])
            .filter((e) => !types.length || types.includes(e.type))
            .filter((e) => !q || `${fullName(e.employee)} ${e.employee?.employeeId || ''} ${e.location?.address || ''} ${e.audit?.clientName || ''} ${e.audit?.engagementName || ''}`.toLowerCase().includes(q))
    }, [events, types, search])

    // Day → person → their events in time order.
    const days = useMemo(() => {
        const byDay = new Map()
        filtered.forEach((e) => {
            const day = ymd(e.time)
            if (!byDay.has(day)) byDay.set(day, new Map())
            const people = byDay.get(day)
            const pid = e.employee?._id || 'unknown'
            if (!people.has(pid)) people.set(pid, { person: e.employee, events: [] })
            people.get(pid).events.push(e)
        })
        return [...byDay.entries()]
            .sort((a, b) => (a[0] < b[0] ? 1 : -1))
            .map(([day, map]) => [day, [...map.values()]
                .map((g) => ({ ...g, events: g.events.slice().sort((a, b) => new Date(a.time) - new Date(b.time)) }))
                .sort((a, b) => fullName(a.person).localeCompare(fullName(b.person)))])
    }, [filtered])

    const points = useMemo(() => filtered.filter((e) => e.location).map((e) => ({
        id: e._id,
        lat: e.location.latitude,
        lng: e.location.longitude,
        color: EVENT[e.type]?.color || '#64748b',
        title: `${fullName(e.employee)} · ${EVENT[e.type]?.label || e.type}`,
        subtitle: `${new Date(e.time).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${e.audit ? ` · ${e.audit.clientName} – ${e.audit.engagementName}` : ''}`,
    })), [filtered])

    const peopleCount = new Set(filtered.map((e) => e.employee?._id)).size
    const count = (t) => filtered.filter((e) => e.type === t).length
    const missing = filtered.filter((e) => !e.location).length
    const sel = filtered.find((e) => e._id === selected)

    const toggleType = (t) => setTypes(types.includes(t) ? types.filter((x) => x !== t) : [...types, t])
    const rangeLabel = from === to
        ? new Date(`${from}T00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
        : `${new Date(`${from}T00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${new Date(`${to}T00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`

    return (
        <PeopleShell title="Location Log" subtitle="Where each person was when they checked in, checked out, and started or stopped audit work." root={ROOT} crumbs={[{ label: rangeLabel }]}>
            <ErrorBanner error={error} />

            <div className="ll-filters pp-card">
                <div className="pj-filters">
                    {Object.entries(PRESETS).map(([k, p]) => (
                        <button key={k} type="button" className={`pj-filter ${preset === k ? 'active' : ''}`} style={{ '--c': '#0b0f19' }} onClick={() => pickPreset(k)}>{p.label}</button>
                    ))}
                    <button type="button" className={`pj-filter ${preset === 'custom' ? 'active' : ''}`} style={{ '--c': '#0b0f19' }} onClick={() => setPreset('custom')}><i className="mdi mdi-calendar-range"></i>Custom</button>
                </div>
                {preset === 'custom' && (
                    <div className="ll-range">
                        <label><span>From</span><input type="date" className="pp-input" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></label>
                        <label><span>To</span><input type="date" className="pp-input" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></label>
                    </div>
                )}
                <div className="ll-filter-row">
                    <select className="pp-select" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} aria-label="Employee">
                        <option value="">Everyone</option>
                        {people.map((p) => <option key={p._id} value={p._id}>{fullName(p)}{p.employeeId ? ` (${p.employeeId})` : ''}</option>)}
                    </select>
                    <div className="pp-search">
                        <i className="mdi mdi-magnify"></i>
                        <input type="search" className="pp-input" placeholder="Search name, place, client…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search" />
                    </div>
                </div>
                <div className="pj-filters">
                    {Object.entries(EVENT).map(([t, m]) => (
                        <button key={t} type="button" className={`pj-filter ${types.includes(t) ? 'active' : ''}`} style={{ '--c': m.color }} onClick={() => toggleType(t)}>
                            <i className={`mdi ${m.icon}`}></i>{m.label} <b>{count(t)}</b>
                        </button>
                    ))}
                </div>
            </div>

            <div className="at-tiles">
                <div className="at-tile" style={{ '--c': '#0b0f19' }}><span className="at-tile-icon"><i className="mdi mdi-account-multiple-outline"></i></span><div><b>{peopleCount}</b><span>People</span></div></div>
                <div className="at-tile" style={{ '--c': '#059669' }}><span className="at-tile-icon"><i className="mdi mdi-login-variant"></i></span><div><b>{count('check-in')}</b><span>Check-ins</span></div></div>
                <div className="at-tile" style={{ '--c': '#0284c7' }}><span className="at-tile-icon"><i className="mdi mdi-briefcase-search-outline"></i></span><div><b>{count('audit-start')}</b><span>Audit sessions</span></div></div>
                <div className="at-tile" style={{ '--c': missing ? '#d97706' : '#64748b' }}><span className="at-tile-icon"><i className="mdi mdi-map-marker-question-outline"></i></span><div><b>{missing}</b><span>Without location</span></div></div>
            </div>

            <div className="ll-layout">
                <section className="ll-list">
                    {loading && !filtered.length ? (
                        <div className="pp-card pp-card-body"><div className="pp-skel" style={{ height: 160 }}></div></div>
                    ) : !days.length ? (
                        <div className="pp-card"><EmptyState icon="mdi-map-marker-radius-outline" title="Nothing recorded" text="No check-ins or audit sessions in this period. Try another date or person." /></div>
                    ) : days.map(([day, groups]) => (
                        <div key={day} className="ll-day">
                            {from !== to && <h3 className="ll-day-title">{new Date(`${day}T00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</h3>}
                            {groups.map((g) => {
                                const first = g.events[0]
                                const last = g.events[g.events.length - 1]
                                return (
                                    <article key={`${day}-${g.person?._id}`} className="pp-card ll-person">
                                        <header className="ll-person-head">
                                            <Avatar person={g.person} size={38} />
                                            <div className="ll-person-main">
                                                <Link to={`/employees/${g.person?._id}`}>{fullName(g.person)}</Link>
                                                <small>{[g.person?.employeeId, g.person?.designation].filter(Boolean).join(' · ')}</small>
                                            </div>
                                            <div className="ll-span"><b>{timeOf(first.time)}</b>{g.events.length > 1 && <> – <b>{timeOf(last.time)}</b></>}<small>{g.events.length} event{g.events.length === 1 ? '' : 's'}</small></div>
                                        </header>
                                        <ol className="ll-timeline">
                                            {g.events.map((e) => {
                                                const m = EVENT[e.type] || {}
                                                return (
                                                    <li key={e._id} className={`ll-event ${selected === e._id ? 'active' : ''} ${e.location ? '' : 'nolocation'}`} style={{ '--c': m.color }}>
                                                        <button type="button" onClick={() => e.location && setSelected(e._id)} disabled={!e.location}>
                                                            <span className="ll-dot"><i className={`mdi ${m.icon}`}></i></span>
                                                            <span className="ll-event-main">
                                                                <span className="ll-event-top">
                                                                    <b>{m.label}</b>
                                                                    {e.audit && <span className="ll-audit">{e.audit.clientName} · {e.audit.engagementName}</span>}
                                                                    {e.type === 'check-in' && e.mode && <span className="ll-tag">{e.mode}</span>}
                                                                    {e.type === 'audit-stop' && e.minutes > 0 && <span className="ll-tag">{fmtDuration(e.minutes)}</span>}
                                                                    {e.type === 'audit-start' && e.running && <span className="ll-tag live">Working now</span>}
                                                                    <time>{timeOf(e.time)}</time>
                                                                </span>
                                                                <span className="ll-place">
                                                                    {e.location
                                                                        ? <><i className="mdi mdi-map-marker"></i>{e.location.address || coords(e.location)}{e.location.accuracy ? <em> ±{e.location.accuracy} m</em> : null}</>
                                                                        : <><i className="mdi mdi-map-marker-off-outline"></i>No location recorded</>}
                                                                </span>
                                                                {e.note && <span className="ll-note">“{e.note}”</span>}
                                                            </span>
                                                        </button>
                                                        {e.location && (
                                                            <a className="ll-ext" href={mapsLink(e.location.latitude, e.location.longitude)} target="_blank" rel="noreferrer" title="Open in Google Maps" aria-label="Open in Google Maps">
                                                                <i className="mdi mdi-open-in-new"></i>
                                                            </a>
                                                        )}
                                                    </li>
                                                )
                                            })}
                                        </ol>
                                    </article>
                                )
                            })}
                        </div>
                    ))}
                </section>

                <aside className="ll-side">
                    <div className="pp-card ll-map-card">
                        <LocationMap points={points} selectedId={selected} onSelect={setSelected} />
                        {sel ? (
                            <div className="ll-sel" style={{ '--c': EVENT[sel.type]?.color }}>
                                <div className="ll-sel-head">
                                    <Avatar person={sel.employee} size={30} />
                                    <div><b>{fullName(sel.employee)}</b><small>{EVENT[sel.type]?.label} · {new Date(sel.time).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small></div>
                                </div>
                                <p>{sel.location.address || 'Address not available'}</p>
                                <div className="ll-sel-meta">
                                    <span><i className="mdi mdi-crosshairs-gps"></i>{coords(sel.location)}</span>
                                    {sel.location.accuracy ? <span><i className="mdi mdi-target"></i>±{sel.location.accuracy} m</span> : null}
                                </div>
                                <a className="pp-btn sm" href={mapsLink(sel.location.latitude, sel.location.longitude)} target="_blank" rel="noreferrer"><i className="mdi mdi-google-maps"></i> Open in Google Maps</a>
                            </div>
                        ) : (
                            <div className="ll-sel muted"><i className="mdi mdi-gesture-tap"></i> Tap an entry or a pin to see the exact place.</div>
                        )}
                    </div>
                </aside>
            </div>
        </PeopleShell>
    )
}
