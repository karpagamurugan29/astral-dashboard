import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import departmentActions from '../../../redux/department/Actions'
import branchActions from '../../../redux/branch/Actions'
import { PeopleShell, Avatar, EmptyState, ErrorBanner, fullName } from '../../../components/people/PeopleUI'
import { ATTENDANCE_ROOT, ymd } from '../../../components/attendance/AttendanceUI'
import { ExportAttendanceButton } from '../../../components/attendance/ExportAttendance'
import { chatApi as api } from '../../../components/chat/chatApi'
import { mapsLink } from '../../../utils/geo'
import './TeamAttendance.css'

/* Team attendance for a day (default today) or any date range.
   One day  → who's in: first in, last out, mode, hours, late, place.
   A range  → one row per person: a day strip, totals and attendance %; open a row for each day.
   Leads see their team; HR and senior leadership see everyone. */

const CODE = {
    present: ['Present', '#10b981', 'mdi-check-circle'],
    late: ['Late', '#f59e0b', 'mdi-clock-alert'],
    half: ['Half day', '#0d9488', 'mdi-circle-half-full'],
    wfh: ['Work from home', '#3b82f6', 'mdi-home'],
    field: ['Field / client', '#8b5cf6', 'mdi-briefcase'],
    leave: ['On leave', '#f97316', 'mdi-beach'],
    holiday: ['Holiday', '#ec4899', 'mdi-star-circle'],
    weekend: ['Weekend', '#cbd5e1', 'mdi-minus'],
    absent: ['Absent', '#ef4444', 'mdi-close-circle'],
    upcoming: ['Upcoming', '#e2e8f0', 'mdi-minus'],
    na: ['Not joined', '#e2e8f0', 'mdi-minus'],
}
const IN_CODES = ['present', 'late', 'half', 'wfh', 'field']
const shift = (key, n) => { const d = new Date(`${key}T00:00:00`); d.setDate(d.getDate() + n); return ymd(d) }
const presets = () => {
    const t = new Date(), today = ymd(t)
    const mon = new Date(t); mon.setDate(t.getDate() - ((t.getDay() + 6) % 7))
    return [
        ['today', 'Today', today, today],
        ['yesterday', 'Yesterday', shift(today, -1), shift(today, -1)],
        ['week', 'This week', ymd(mon), today],
        ['month', 'This month', ymd(new Date(t.getFullYear(), t.getMonth(), 1)), today],
        ['last', 'Last month', ymd(new Date(t.getFullYear(), t.getMonth() - 1, 1)), ymd(new Date(t.getFullYear(), t.getMonth(), 0))],
    ]
}
const fmtDay = (k, opts = { weekday: 'short', day: 'numeric', month: 'short' }) => new Date(`${k}T00:00:00`).toLocaleDateString(undefined, opts)
const Chip = ({ code, extra }) => { const [l, c, ic] = CODE[code] || CODE.absent; return <span className="ta-chip" style={{ '--c': c }}><i className={`mdi ${ic}`}></i>{l}{extra ? <em>{extra}</em> : null}</span> }
const Place = ({ p }) => (p?.latitude ? <a className="ta-place" href={mapsLink(p.latitude, p.longitude)} target="_blank" rel="noreferrer" title={p.address}><i className="mdi mdi-map-marker-outline"></i>{p.address || `${p.latitude.toFixed(4)}, ${p.longitude.toFixed(4)}`}</a> : <span className="ta-muted">—</span>)

export const TeamAttendance = () => {
    const dispatch = useDispatch()
    const { list: departments } = useSelector((state) => state.departmentReducer || {})
    const { list: branches } = useSelector((state) => state.branchReducer || {})
    const P = useMemo(presets, [])
    const [range, setRange] = useState({ from: P[0][2], to: P[0][3] })
    const [department, setDepartment] = useState('')
    const [branch, setBranch] = useState('')
    const [filter, setFilter] = useState('')
    const [q, setQ] = useState('')
    const [d, setD] = useState(null)
    const [error, setError] = useState('')
    const [openRow, setOpenRow] = useState(null)

    useEffect(() => { dispatch({ type: departmentActions.GET_DEPARTMENTS }); dispatch({ type: branchActions.GET_BRANCHES }) }, [dispatch])
    const load = useCallback(() => {
        const qs = new URLSearchParams({ from: range.from, to: range.to, ...(department ? { department } : {}), ...(branch ? { branch } : {}) })
        return api('GET', `/attendance/team-range?${qs}`).then((j) => { setD(j); setError('') }).catch((e) => setError(e.message))
    }, [range, department, branch])
    useEffect(() => { setD(null); load() }, [load])
    // today's view stays live without re-rendering anything else
    useEffect(() => { if (range.from !== range.to || range.to !== ymd(new Date())) return undefined; const t = setInterval(load, 60000); return () => clearInterval(t) }, [range, load])

    const single = range.from === range.to
    const today = ymd(new Date())
    const rows = useMemo(() => d?.data || [], [d])
    const counts = useMemo(() => {
        const c = { in: 0, inNow: 0, present: 0, late: 0, half: 0, wfh: 0, field: 0, leave: 0, absent: 0 }
        rows.forEach((r) => {
            if (single) {
                const cell = r.cells[0] || {}
                if (IN_CODES.includes(cell.code)) c.in++
                if (cell.inNow) c.inNow++
                if (cell.late) c.late++
                if (cell.code && c[cell.code] !== undefined && cell.code !== 'late') c[cell.code]++
                if (cell.code === 'late') c.present++
            } else {
                const s = r.summary
                c.present += s.present; c.late += s.late; c.half += s.half; c.wfh += s.wfh; c.field += s.field; c.leave += s.leave; c.absent += s.absent
            }
        })
        return c
    }, [rows, single])
    const avgRate = rows.length ? Math.round(rows.reduce((t, r) => t + (r.summary.rate || 0), 0) / rows.length) : 0
    const totalHours = Math.round(rows.reduce((t, r) => t + (r.summary.hours || 0), 0))

    const shown = useMemo(() => {
        const s = q.trim().toLowerCase()
        return rows.filter((r) => {
            if (s && !`${fullName(r.employee)} ${r.employee.employeeId} ${r.employee.designation} ${r.employee.department}`.toLowerCase().includes(s)) return false
            if (!filter) return true
            if (single) {
                const c = r.cells[0] || {}
                if (filter === 'in') return IN_CODES.includes(c.code)
                if (filter === 'inNow') return c.inNow
                if (filter === 'late') return c.late > 0
                if (filter === 'present') return ['present', 'late'].includes(c.code)
                return c.code === filter
            }
            return (r.summary[filter] || 0) > 0
        })
    }, [rows, q, filter, single])

    const tiles = single
        ? [['in', `${counts.in}/${rows.length}`, 'In today', '#0f172a', 'mdi-account-check'], ['inNow', counts.inNow, 'In now', '#10b981', 'mdi-access-point'], ['late', counts.late, 'Late', '#f59e0b', 'mdi-clock-alert'], ['wfh', counts.wfh, 'WFH', '#3b82f6', 'mdi-home'], ['field', counts.field, 'Field', '#8b5cf6', 'mdi-briefcase'], ['leave', counts.leave, 'On leave', '#f97316', 'mdi-beach'], ['absent', counts.absent, 'Absent', '#ef4444', 'mdi-close-circle']]
        : [['', `${avgRate}%`, 'Attendance', '#0f172a', 'mdi-chart-donut'], ['present', counts.present, 'Present days', '#10b981', 'mdi-check-circle'], ['late', counts.late, 'Late', '#f59e0b', 'mdi-clock-alert'], ['wfh', counts.wfh, 'WFH days', '#3b82f6', 'mdi-home'], ['field', counts.field, 'Field days', '#8b5cf6', 'mdi-briefcase'], ['leave', counts.leave, 'Leave days', '#f97316', 'mdi-beach'], ['absent', counts.absent, 'Absent days', '#ef4444', 'mdi-close-circle']]
    const label = single ? (range.from === today ? 'Today' : fmtDay(range.from, { weekday: 'long', day: 'numeric', month: 'long' })) : `${fmtDay(range.from, { day: 'numeric', month: 'short' })} – ${fmtDay(range.to, { day: 'numeric', month: 'short', year: 'numeric' })}`

    return (
        <PeopleShell title="Team attendance" root={ATTENDANCE_ROOT} crumbs={[{ label: 'Team' }]}
            actions={<><Link to="/attendance/subordinates" className="pp-btn"><i className="mdi mdi-calendar-month-outline"></i>Monthly view</Link><ExportAttendanceButton className="pp-btn primary" range={range} department={department} label="Export" /></>}>
            <ErrorBanner error={error} />

            <div className="ta-bar pp-card">
                <div className="ta-presets">{P.map(([k, l, f, t]) => <button key={k} type="button" className={range.from === f && range.to === t ? 'on' : ''} onClick={() => { setRange({ from: f, to: t }); setFilter(''); setOpenRow(null) }}>{l}</button>)}</div>
                <div className="ta-dates">
                    {single && <button type="button" className="ta-step" onClick={() => setRange({ from: shift(range.from, -1), to: shift(range.from, -1) })} aria-label="Previous day"><i className="mdi mdi-chevron-left"></i></button>}
                    <input type="date" className="pp-input" value={range.from} max={today} onChange={(e) => e.target.value && setRange((r) => ({ from: e.target.value, to: e.target.value > r.to ? e.target.value : r.to }))} aria-label="From" />
                    <span>to</span>
                    <input type="date" className="pp-input" value={range.to} min={range.from} max={today} onChange={(e) => e.target.value && setRange((r) => ({ ...r, to: e.target.value }))} aria-label="To" />
                    {single && <button type="button" className="ta-step" disabled={range.from >= today} onClick={() => setRange({ from: shift(range.from, 1), to: shift(range.from, 1) })} aria-label="Next day"><i className="mdi mdi-chevron-right"></i></button>}
                </div>
                <span className="ta-label"><i className="mdi mdi-calendar-blank-outline"></i>{label}{!single && d ? ` · ${d.days} days` : ''}</span>
            </div>

            <div className="ta-tiles">{tiles.map(([k, v, l, c, ic]) => (
                <button key={l} type="button" className={`ta-tile ${filter === k && k ? 'on' : ''}`} style={{ '--c': c }} onClick={() => k && setFilter(filter === k ? '' : k)} disabled={!k}>
                    <i className={`mdi ${ic}`}></i><b>{d ? v : '–'}</b><small>{l}</small>
                </button>
            ))}{!single && <div className="ta-tile static" style={{ '--c': '#1e40af' }}><i className="mdi mdi-timer-outline"></i><b>{d ? `${totalHours}h` : '–'}</b><small>Hours worked</small></div>}</div>

            <section className="pp-card ta-card">
                <div className="ta-tools">
                    <div className="pp-search"><i className="mdi mdi-magnify"></i><input type="search" className="pp-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, ID, designation…" /></div>
                    <select className="pp-select" value={department} onChange={(e) => setDepartment(e.target.value)} aria-label="Department"><option value="">All departments</option>{(departments || []).map((x) => <option key={x._id} value={x.name}>{x.name}</option>)}</select>
                    <select className="pp-select" value={branch} onChange={(e) => setBranch(e.target.value)} aria-label="Branch"><option value="">All branches</option>{(branches || []).map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}</select>
                    {(filter || q || department || branch) && <button type="button" className="pp-btn sm" onClick={() => { setFilter(''); setQ(''); setDepartment(''); setBranch('') }}><i className="mdi mdi-filter-remove-outline"></i>Clear</button>}
                    <span className="ta-count">{shown.length} of {rows.length} people</span>
                </div>

                {!d ? <div className="pw-loading"><i className="mdi mdi-loading mdi-spin"></i></div> : !shown.length ? (
                    <EmptyState icon="mdi-account-clock-outline" title={rows.length ? 'No one matches' : 'No one to show'} text={rows.length ? 'Try another filter or name.' : 'People you look after appear here.'} />
                ) : single ? (
                    <div className="ta-wrap"><table className="ta-table">
                        <thead><tr><th>Employee</th><th>Status</th><th>First in</th><th>Last out</th><th className="n">Hours</th><th>Check-in place</th></tr></thead>
                        <tbody>{shown.map((r) => {
                            const c = r.cells[0] || {}
                            return (
                                <tr key={r.employee._id} style={{ '--c': (CODE[c.code] || CODE.absent)[1] }}>
                                    <td><span className="ta-person"><Avatar person={r.employee} size={30} /><span><Link to={`/employees/${r.employee._id}`}>{fullName(r.employee)}</Link><small>{r.employee.designation}{r.employee.department ? ` · ${r.employee.department}` : ''}</small></span></span></td>
                                    <td><Chip code={c.code} extra={c.late ? `${c.late}m late` : c.leaveType || ''} /></td>
                                    <td>{c.first ? <span className="ta-time in">{c.first}{c.mode && <small>{c.mode}</small>}</span> : <span className="ta-muted">—</span>}</td>
                                    <td>{c.inNow ? <span className="ta-live"><i></i>In now</span> : c.last ? <span className="ta-time">{c.last}{c.note && <small>{c.note}</small>}{c.sessions > 1 && <small>{c.sessions} sessions</small>}</span> : <span className="ta-muted">{c.note || '—'}</span>}</td>
                                    <td className="n">{c.hours ? `${c.hours}h` : '—'}</td>
                                    <td className="ta-placecell"><Place p={c.inPlace} />{c.remarks && <small>“{c.remarks}”</small>}</td>
                                </tr>
                            )
                        })}</tbody>
                    </table></div>
                ) : (
                    <div className="ta-wrap"><table className="ta-table range">
                        <thead><tr><th>Employee</th><th>Days</th><th className="n">Present</th><th className="n">Late</th><th className="n">WFH</th><th className="n">Field</th><th className="n">Leave</th><th className="n">Absent</th><th className="n">Hours</th><th className="n">Avg in</th><th>Attendance</th></tr></thead>
                        <tbody>{shown.map((r) => {
                            const s = r.summary, open = openRow === r.employee._id
                            return (
                                <React.Fragment key={r.employee._id}>
                                    <tr className={`click ${open ? 'open' : ''}`} onClick={() => setOpenRow(open ? null : r.employee._id)}>
                                        <td><span className="ta-person"><i className={`mdi ${open ? 'mdi-chevron-down' : 'mdi-chevron-right'} ta-caret`}></i><Avatar person={r.employee} size={30} /><span><b>{fullName(r.employee)}</b><small>{r.employee.employeeId} · {r.employee.designation}</small></span></span></td>
                                        <td><span className="ta-strip">{r.cells.map((c) => <i key={c.date} style={{ '--c': (CODE[c.code] || CODE.absent)[1] }} title={`${fmtDay(c.date)} · ${c.status}${c.first ? ` · in ${c.first}` : ''}${c.last ? ` · out ${c.last}` : ''}`}></i>)}</span></td>
                                        <td className="n">{s.present + s.half}</td><td className={`n ${s.late ? 'warn' : ''}`}>{s.late}</td><td className="n">{s.wfh}</td><td className="n">{s.field}</td><td className="n">{s.leave}</td><td className={`n ${s.absent ? 'bad' : ''}`}>{s.absent}</td>
                                        <td className="n">{s.hours}h</td><td className="n">{s.avgIn || '—'}</td>
                                        <td><span className="ta-rate" style={{ '--c': s.rate >= 90 ? '#10b981' : s.rate >= 75 ? '#f59e0b' : '#ef4444' }}><em><i style={{ width: `${Math.min(100, s.rate)}%` }}></i></em>{s.rate}%</span></td>
                                    </tr>
                                    {open && (
                                        <tr className="ta-days"><td colSpan={11}>
                                            <table><thead><tr><th>Date</th><th>Status</th><th>First in</th><th>Last out</th><th className="n">Hours</th><th className="n">Late</th><th>Place</th></tr></thead>
                                                <tbody>{r.cells.filter((c) => !['upcoming', 'na'].includes(c.code)).map((c) => (
                                                    <tr key={c.date} className={['weekend', 'holiday'].includes(c.code) ? 'dim' : ''}>
                                                        <td>{fmtDay(c.date)}</td><td><Chip code={c.code} extra={c.leaveType || ''} /></td>
                                                        <td>{c.first || '—'}{c.mode && c.first ? <small> · {c.mode}</small> : null}</td><td>{c.last || c.note || '—'}</td>
                                                        <td className="n">{c.hours ? `${c.hours}h` : '—'}</td><td className="n">{c.late ? `${c.late}m` : '—'}</td><td className="ta-placecell"><Place p={c.inPlace} /></td>
                                                    </tr>
                                                ))}</tbody></table>
                                        </td></tr>
                                    )}
                                </React.Fragment>
                            )
                        })}</tbody>
                    </table></div>
                )}
                {!single && d && <p className="ta-legend">{['present', 'late', 'half', 'wfh', 'field', 'leave', 'holiday', 'weekend', 'absent'].map((k) => <span key={k}><i style={{ '--c': CODE[k][1] }}></i>{CODE[k][0]}</span>)}<span className="ta-muted">· click a person to see each day</span></p>}
            </section>
        </PeopleShell>
    )
}
