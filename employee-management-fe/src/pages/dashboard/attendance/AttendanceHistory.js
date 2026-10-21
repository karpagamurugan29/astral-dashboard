import React, { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import attendanceActions from '../../../redux/attendance/Actions'
import { PeopleShell, EmptyState, ErrorBanner } from '../../../components/people/PeopleUI'
import {
    ATTENDANCE_ROOT, WORKDAY_HOURS, STATUS_META, statusMeta, AttStatus, ModeTag, MonthNav, formatTime, hoursLabel, ymd, PlaceLine } from '../../../components/attendance/AttendanceUI'
import './AttendanceHistory.css'

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const TILE_STATUSES = ['Present', 'Late', 'Half Day', 'On Leave', 'Absent']

// attendanceDate is stored as "YYYY-MM-DD"; read it without timezone shifting.
const dateKey = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : ymd(v))

export const AttendanceHistory = () => {
    const dispatch = useDispatch()
    const { history, historyLoading, error } = useSelector((state) => state.attendanceReducer || {})
    const now = new Date()
    const [month, setMonth] = useState(now.getMonth() + 1)
    const [year, setYear] = useState(now.getFullYear())
    const [statusFilter, setStatusFilter] = useState('')

    useEffect(() => {
        dispatch({ type: attendanceActions.GET_ATTENDANCE_HISTORY, month, year })
        setStatusFilter('')
    }, [dispatch, month, year])

    const records = useMemo(() => [...(history || [])].sort((a, b) => dateKey(b.attendanceDate).localeCompare(dateKey(a.attendanceDate))), [history])
    const byDay = useMemo(() => Object.fromEntries(records.map((r) => [dateKey(r.attendanceDate), r])), [records])

    const counts = useMemo(() => {
        const c = Object.fromEntries(TILE_STATUSES.map((s) => [s, 0]))
        records.forEach((r) => { if (c[r.status] !== undefined) c[r.status] += 1 })
        return c
    }, [records])

    const totalHours = records.reduce((s, r) => s + (Number(r.workingHours) || 0), 0)

    // Month grid, Monday-first.
    const cells = useMemo(() => {
        const first = new Date(year, month - 1, 1)
        const lead = (first.getDay() + 6) % 7
        const days = new Date(year, month, 0).getDate()
        return [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => new Date(year, month - 1, i + 1))]
    }, [month, year])

    const todayKey = ymd(new Date())
    const visible = statusFilter ? records.filter((r) => r.status === statusFilter) : records

    return (
        <PeopleShell
            title="Attendance history"
            root={ATTENDANCE_ROOT}
            crumbs={[{ label: 'History' }]}
            actions={<MonthNav month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y) }} />}
        >
            <ErrorBanner error={error && !/no attendance found/i.test(error) ? error : ''} />

            <div className="ah-top">
                <section className="pp-card ah-cal" aria-label="Month at a glance">
                    <div className="ah-cal-head">
                        <h3>Month at a glance</h3>
                        <span className="pp-chip"><i className="mdi mdi-sigma"></i>{Math.round(totalHours)}h worked</span>
                    </div>
                    <div className="ah-grid">
                        {DOW.map((d) => <div key={d} className="ah-dow">{d}</div>)}
                        {cells.map((d, i) => {
                            if (!d) return <div key={`b${i}`} className="ah-day blank"></div>
                            const key = ymd(d)
                            const rec = byDay[key]
                            const m = rec ? statusMeta(rec.status) : null
                            const weekend = d.getDay() === 0 || d.getDay() === 6
                            const cls = ['ah-day', rec && 'has', weekend && 'weekend', key > todayKey && 'future', key === todayKey && 'today'].filter(Boolean).join(' ')
                            const label = rec ? `${d.toDateString()}: ${rec.status} · ${hoursLabel(rec.workingHours)}` : d.toDateString()
                            return (
                                <div key={key} className={cls} style={m ? { '--c': m.color } : undefined} title={label}>
                                    <span>{d.getDate()}</span>
                                    {m && <i className={`mdi ${m.icon}`}></i>}
                                </div>
                            )
                        })}
                    </div>
                    <div className="ah-legend">
                        {TILE_STATUSES.map((s) => <span key={s} style={{ '--c': STATUS_META[s].color }}><i></i>{s}</span>)}
                    </div>
                </section>

                <div className="at-tiles">
                    {TILE_STATUSES.map((s) => {
                        const m = STATUS_META[s]
                        return (
                            <button key={s} type="button" className={`at-tile ${statusFilter === s ? 'active' : ''}`} style={{ '--c': m.color }}
                                onClick={() => setStatusFilter(statusFilter === s ? '' : s)} aria-pressed={statusFilter === s}>
                                <span className="at-tile-icon"><i className={`mdi ${m.icon}`}></i></span>
                                <div><b>{counts[s]}</b><span>{s}</span></div>
                            </button>
                        )
                    })}
                    <div className="at-tile" style={{ '--c': '#7c3aed' }}>
                        <span className="at-tile-icon"><i className="mdi mdi-chart-timeline-variant"></i></span>
                        <div>
                            <b>{hoursLabel(records.length ? totalHours / Math.max(1, records.filter((r) => Number(r.workingHours) > 0).length) : 0)}</b>
                            <span>Avg per worked day</span>
                        </div>
                    </div>
                </div>
            </div>

            {statusFilter && (
                <p className="ah-filter-note">Showing <b>{visible.length}</b> {statusFilter.toLowerCase()} day{visible.length === 1 ? '' : 's'} <button type="button" onClick={() => setStatusFilter('')}>Show all</button></p>
            )}

            {historyLoading && !records.length ? (
                <div className="pp-card pp-card-body">{[0, 1, 2, 3].map((i) => <div key={i} className="pp-skel" style={{ height: 40, marginBottom: 12 }}></div>)}</div>
            ) : !visible.length ? (
                <div className="pp-card">
                    <EmptyState icon="mdi-calendar-blank-outline" title="No records for this month"
                        text="Days you check in will appear here. Missed one? You can request a correction."
                        action={<Link to="/attendance/regularization" className="pp-btn"><i className="mdi mdi-file-document-edit-outline"></i> Request correction</Link>} />
                </div>
            ) : (
                <div className="pp-card at-table-wrap">
                    <table className="at-table">
                        <thead>
                            <tr>
                                <th><i className="mdi mdi-calendar-outline"></i>Date</th>
                                <th className="hide-md"><i className="mdi mdi-briefcase-outline"></i>Mode</th>
                                <th><i className="mdi mdi-login-variant"></i>Check in</th>
                                <th><i className="mdi mdi-logout-variant"></i>Check out</th>
                                <th className="hide-sm"><i className="mdi mdi-timer-outline"></i>Worked</th>
                                <th><i className="mdi mdi-shield-check-outline"></i>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map((r) => {
                                const d = new Date(`${dateKey(r.attendanceDate)}T00:00:00`)
                                const hrs = Number(r.workingHours) || 0
                                return (
                                    <tr key={r._id}>
                                        <td className="at-date"><b>{d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</b><small>{d.toLocaleDateString(undefined, { weekday: 'long' })}</small></td>
                                        <td className="hide-md"><ModeTag mode={r.attendanceType} /></td>
                                        <td>{r.checkIn?.time ? <span className="ci-cell"><span className="at-time in"><i className="mdi mdi-arrow-down-circle-outline"></i>{formatTime(r.checkIn.time)}</span><PlaceLine place={r.checkIn} />{r.sessions?.length > 1 && <span className="ci-sessions">{r.sessions.length} sessions</span>}</span> : <span className="at-time empty">--:--</span>}</td>
                                        <td>{r.checkOut?.time ? <span className="ci-cell"><span className="at-time out"><i className="mdi mdi-arrow-up-circle-outline"></i>{formatTime(r.checkOut.time)}{r.autoCheckedOut ? ' (auto)' : ''}</span>{r.autoCheckedOut ? <span className="ci-place none"><i className="mdi mdi-robot-outline"></i>Auto check-out — no location</span> : <PlaceLine place={r.checkOut} />}</span> : <span className="at-time empty">--:--</span>}</td>
                                        <td className="hide-sm">
                                            <div className="at-hours" style={{ '--c': hrs >= WORKDAY_HOURS ? '#10b981' : '#0ea5e9' }}>
                                                <span className="at-hours-num">{hoursLabel(hrs)}</span>
                                                <span className="at-hours-bar"><span style={{ width: `${Math.min(100, (hrs / WORKDAY_HOURS) * 100)}%` }}></span></span>
                                            </div>
                                        </td>
                                        <td><AttStatus status={r.status} extra={r.lateByMinutes > 0 ? `· ${r.lateByMinutes}m` : null} /></td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </PeopleShell>
    )
}
