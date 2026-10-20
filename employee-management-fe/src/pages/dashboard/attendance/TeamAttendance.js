import React, { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import attendanceActions from '../../../redux/attendance/Actions'
import departmentActions from '../../../redux/department/Actions'
import branchActions from '../../../redux/branch/Actions'
import { PeopleShell, Avatar, DeptTag, ProgressRing, EmptyState, ErrorBanner, fullName } from '../../../components/people/PeopleUI'
import { ATTENDANCE_ROOT, STATUS_META, AttStatus, formatTime, ymd } from '../../../components/attendance/AttendanceUI'

const TILE_STATUSES = ['Present', 'Late', 'Half Day', 'On Leave', 'Absent']

const shiftDay = (key, delta) => {
    const d = new Date(`${key}T00:00:00`)
    d.setDate(d.getDate() + delta)
    return ymd(d)
}

export const TeamAttendance = () => {
    const dispatch = useDispatch()
    const { team, error } = useSelector((state) => state.attendanceReducer || {})
    const { list: departments } = useSelector((state) => state.departmentReducer || {})
    const { list: branches } = useSelector((state) => state.branchReducer || {})
    const todayKey = ymd(new Date())
    const [date, setDate] = useState(todayKey)
    const [department, setDepartment] = useState('')
    const [branch, setBranch] = useState('')
    const [statusFilter, setStatusFilter] = useState('')
    const [search, setSearch] = useState('')

    useEffect(() => {
        dispatch({ type: departmentActions.GET_DEPARTMENTS })
        dispatch({ type: branchActions.GET_BRANCHES })
    }, [dispatch])

    useEffect(() => {
        dispatch({ type: attendanceActions.GET_TEAM_ATTENDANCE, date, department, branch })
    }, [dispatch, date, department, branch])

    const all = useMemo(() => team || [], [team])

    const counts = useMemo(() => {
        const c = Object.fromEntries(TILE_STATUSES.map((s) => [s, 0]))
        all.forEach((t) => { if (c[t.status] !== undefined) c[t.status] += 1 })
        return c
    }, [all])

    const attended = counts.Present + counts.Late + counts['Half Day']
    const rate = all.length ? Math.round((attended / all.length) * 100) : 0

    const rows = useMemo(() => {
        const q = search.trim().toLowerCase()
        return all
            .filter((t) => !statusFilter || t.status === statusFilter)
            .filter((t) => !q || `${fullName(t.employeeId)} ${t.employeeId?.department || ''}`.toLowerCase().includes(q))
            .sort((a, b) => fullName(a.employeeId).localeCompare(fullName(b.employeeId)))
    }, [all, statusFilter, search])

    const dateObj = new Date(`${date}T00:00:00`)
    const isFiltering = statusFilter || search || department || branch
    const clearAll = () => { setStatusFilter(''); setSearch(''); setDepartment(''); setBranch('') }

    return (
        <PeopleShell
            title="Team attendance"
            root={ATTENDANCE_ROOT}
            crumbs={[{ label: 'Team' }]}
            actions={(
                <div className="at-nav">
                    <button type="button" className="at-nav-btn" onClick={() => setDate(shiftDay(date, -1))} aria-label="Previous day"><i className="mdi mdi-chevron-left"></i></button>
                    <input type="date" className="pp-input" style={{ width: 160 }} value={date} max={todayKey} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Date" />
                    <button type="button" className="at-nav-btn" onClick={() => setDate(shiftDay(date, 1))} disabled={date >= todayKey} aria-label="Next day"><i className="mdi mdi-chevron-right"></i></button>
                    {date !== todayKey && <button type="button" className="pp-btn sm" onClick={() => setDate(todayKey)}>Today</button>}
                </div>
            )}
        >
            <ErrorBanner error={error} />

            <div className="at-tiles">
                <div className="at-tile" style={{ '--c': '#0b0f19' }}>
                    <ProgressRing value={rate} size={46} stroke={5} color={rate >= 90 ? '#10b981' : rate >= 70 ? '#f59e0b' : '#f43f5e'} />
                    <div><b>{attended}/{all.length}</b><span>In today · {dateObj.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span></div>
                </div>
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
            </div>

            <div className="at-toolbar">
                <div className="pp-search">
                    <i className="mdi mdi-magnify"></i>
                    <input type="search" className="pp-input" placeholder="Search people…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search people" />
                </div>
                <select className="pp-select" value={department} onChange={(e) => setDepartment(e.target.value)} aria-label="Department">
                    <option value="">All departments</option>
                    {departments?.map((d) => <option key={d._id} value={d.name}>{d.name}</option>)}
                </select>
                <select className="pp-select" value={branch} onChange={(e) => setBranch(e.target.value)} aria-label="Branch">
                    <option value="">All branches</option>
                    {branches?.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
                </select>
                <div className="at-spacer"></div>
                {isFiltering && <button type="button" className="pp-btn sm ghost" onClick={clearAll}><i className="mdi mdi-filter-remove-outline"></i> Clear filters</button>}
            </div>

            {!rows.length ? (
                <div className="pp-card">
                    <EmptyState icon="mdi-account-clock-outline" title={all.length ? 'No one matches' : 'No attendance for this day'}
                        text={all.length ? 'Try a different status, department or name.' : 'Pick another day, or check that people have checked in.'}
                        action={isFiltering && <button type="button" className="pp-btn" onClick={clearAll}>Clear filters</button>} />
                </div>
            ) : (
                <div className="pp-card at-table-wrap">
                    <table className="at-table">
                        <thead>
                            <tr>
                                <th><i className="mdi mdi-account-outline"></i>Employee</th>
                                <th className="hide-md"><i className="mdi mdi-office-building-outline"></i>Department</th>
                                <th><i className="mdi mdi-login-variant"></i>Check in</th>
                                <th className="hide-sm"><i className="mdi mdi-logout-variant"></i>Check out</th>
                                <th><i className="mdi mdi-shield-check-outline"></i>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((t) => (
                                <tr key={t.employeeId?._id}>
                                    <td>
                                        <div className="at-person">
                                            <Avatar person={t.employeeId} size={38} />
                                            <div>
                                                <b><Link to={`/employees/${t.employeeId?._id}`} className="text-reset text-decoration-none">{fullName(t.employeeId)}</Link></b>
                                                <small>{t.employeeId?.designation || ''}</small>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="hide-md"><DeptTag name={t.employeeId?.department} /></td>
                                    <td>{t.checkIn ? <span className="at-time in"><i className="mdi mdi-arrow-down-circle-outline"></i>{formatTime(t.checkIn)}</span> : <span className="at-time empty">--:--</span>}</td>
                                    <td className="hide-sm">{t.checkOut ? <span className="at-time out"><i className="mdi mdi-arrow-up-circle-outline"></i>{formatTime(t.checkOut)}</span> : <span className="at-time empty">--:--</span>}</td>
                                    <td><AttStatus status={t.status} extra={t.lateByMinutes > 0 ? `· ${t.lateByMinutes}m late` : null} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </PeopleShell>
    )
}
