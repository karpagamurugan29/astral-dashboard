import React, { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import leaveActions from '../../../redux/leave/Actions'
import { PeopleShell, Avatar, DeptTag, EmptyState, ErrorBanner, fullName } from '../../../components/people/PeopleUI'
import { MonthNav, ymd } from '../../../components/attendance/AttendanceUI'
import { LEAVE_ROOT, leaveMeta, LeaveTypeTag, LeaveStatus, dateRange, daysLabel, startOfDay } from '../../../components/leave/LeaveUI'
import '../../../components/attendance/attendance.css'
import './TeamLeaveCalendar.css'

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MAX_CHIPS = 3

const initials = (p) => `${p?.firstName?.[0] || ''}${p?.lastName?.[0] || ''}`.toUpperCase() || '?'
const covers = (lv, day) => startOfDay(lv.fromDate) <= day && day <= startOfDay(lv.toDate || lv.fromDate)

export const TeamLeaveCalendar = () => {
    const dispatch = useDispatch()
    const { teamCalendar, error } = useSelector((state) => state.leaveReducer || {})
    const now = new Date()
    const [month, setMonth] = useState(now.getMonth() + 1)
    const [year, setYear] = useState(now.getFullYear())
    const [selected, setSelected] = useState(null)

    useEffect(() => {
        dispatch({ type: leaveActions.GET_TEAM_LEAVE_CALENDAR, month, year })
        setSelected(null)
    }, [dispatch, month, year])

    const leaves = useMemo(
        () => (teamCalendar || []).filter((l) => l.status !== 'Rejected' && l.status !== 'Cancelled')
            .sort((a, b) => new Date(a.fromDate) - new Date(b.fromDate)),
        [teamCalendar]
    )

    // Monday-first grid with who is out each day.
    const cells = useMemo(() => {
        const first = new Date(year, month - 1, 1)
        const lead = (first.getDay() + 6) % 7
        const days = new Date(year, month, 0).getDate()
        const list = Array.from({ length: days }, (_, i) => {
            const d = new Date(year, month - 1, i + 1)
            const t = d.getTime()
            return { date: d, key: ymd(d), out: leaves.filter((l) => covers(l, t)) }
        })
        return [...Array(lead).fill(null), ...list]
    }, [leaves, month, year])

    const todayKey = ymd(new Date())
    const todayTs = startOfDay(Date.now())
    const outToday = leaves.filter((l) => covers(l, todayTs))
    const busiest = cells.filter(Boolean).reduce((best, c) => (c.out.length > (best?.out.length || 0) ? c : best), null)
    const people = new Set(leaves.map((l) => l.employeeId?._id)).size
    const totalDays = leaves.reduce((s, l) => s + (Number(l.totalDays) || 0), 0)

    const selectedCell = selected ? cells.find((c) => c && c.key === selected) : null
    const list = selectedCell ? selectedCell.out : leaves

    return (
        <PeopleShell
            title="Team calendar"
            root={LEAVE_ROOT}
            crumbs={[{ label: 'Team calendar' }]}
            backTo="/leave"
            actions={<MonthNav month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y) }} />}
        >
            <ErrorBanner error={error} />

            <div className="at-tiles">
                <div className="at-tile tc-today" style={{ '--c': '#0284c7' }}>
                    <span className="at-tile-icon"><i className="mdi mdi-account-clock-outline"></i></span>
                    <div className="tc-today-text">
                        <b>{outToday.length}</b><span>Out today</span>
                    </div>
                    {outToday.length > 0 && (
                        <span className="tc-faces">
                            {outToday.slice(0, 5).map((l) => <Avatar key={l._id} person={l.employeeId} size={30} />)}
                            {outToday.length > 5 && <span className="tc-more">+{outToday.length - 5}</span>}
                        </span>
                    )}
                </div>
                <div className="at-tile" style={{ '--c': '#7c3aed' }}>
                    <span className="at-tile-icon"><i className="mdi mdi-account-group-outline"></i></span>
                    <div><b>{people}</b><span>People off this month</span></div>
                </div>
                <div className="at-tile" style={{ '--c': '#059669' }}>
                    <span className="at-tile-icon"><i className="mdi mdi-calendar-range"></i></span>
                    <div><b>{totalDays}</b><span>Leave days booked</span></div>
                </div>
                <div className="at-tile" style={{ '--c': '#e11d48' }}>
                    <span className="at-tile-icon"><i className="mdi mdi-fire"></i></span>
                    <div>
                        <b>{busiest && busiest.out.length ? busiest.date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '—'}</b>
                        <span>Busiest day{busiest && busiest.out.length ? ` · ${busiest.out.length} out` : ''}</span>
                    </div>
                </div>
            </div>

            <div className="tc-layout">
                {/* ---------- month grid ---------- */}
                <section className="pp-card tc-cal">
                    <div className="tc-grid">
                        {DOW.map((d) => <div key={d} className="tc-dow">{d}</div>)}
                        {cells.map((c, i) => {
                            if (!c) return <div key={`b${i}`} className="tc-day blank"></div>
                            const weekend = c.date.getDay() === 0 || c.date.getDay() === 6
                            const cls = ['tc-day', weekend && 'weekend', c.key === todayKey && 'today', selected === c.key && 'selected', c.out.length && 'has'].filter(Boolean).join(' ')
                            return (
                                <button key={c.key} type="button" className={cls} onClick={() => setSelected(selected === c.key ? null : c.key)}
                                    aria-pressed={selected === c.key} aria-label={`${c.date.toDateString()}: ${c.out.length} out`}>
                                    <span className="tc-num">{c.date.getDate()}</span>
                                    <span className="tc-chips">
                                        {c.out.slice(0, MAX_CHIPS).map((l) => (
                                            <span key={l._id} className={`tc-chip ${l.status === 'Pending' ? 'pending' : ''}`} style={{ '--c': leaveMeta(l.leaveType).color }} title={`${fullName(l.employeeId)} · ${l.leaveType}${l.status === 'Pending' ? ' (pending)' : ''}`}>
                                                {initials(l.employeeId)}
                                            </span>
                                        ))}
                                        {c.out.length > MAX_CHIPS && <span className="tc-chip more">+{c.out.length - MAX_CHIPS}</span>}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                    <div className="tc-legend">
                        <span><i className="tc-chip-demo"></i>Approved</span>
                        <span><i className="tc-chip-demo pending"></i>Pending</span>
                        <span className="ms-auto">Click a day to see who's out</span>
                    </div>
                </section>

                {/* ---------- who's out ---------- */}
                <section className="pp-card">
                    <div className="pp-card-head">
                        <h3>{selectedCell ? `Out on ${selectedCell.date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}` : "Who's out this month"}</h3>
                        {selectedCell ? <button type="button" className="pp-btn sm ghost" onClick={() => setSelected(null)}>Show month</button> : <small>{leaves.length} request{leaves.length === 1 ? '' : 's'}</small>}
                    </div>
                    {!list.length ? (
                        <EmptyState icon="mdi-emoticon-happy-outline" title={selectedCell ? 'Everyone is in' : "Nobody's off this month"} text={selectedCell ? 'No one has leave on this day.' : 'Approved and pending leave will show up here.'} />
                    ) : (
                        <ul className="lv-rows">
                            {list.map((l) => (
                                <li key={l._id} className="lv-row" style={{ '--c': leaveMeta(l.leaveType).color }}>
                                    <Avatar person={l.employeeId} size={40} />
                                    <div className="lv-row-main">
                                        <div className="lv-row-title"><Link to={`/employees/${l.employeeId?._id}`} className="text-reset text-decoration-none">{fullName(l.employeeId)}</Link><LeaveTypeTag type={l.leaveType} /></div>
                                        <div className="lv-row-sub">{dateRange(l.fromDate, l.toDate)} · {daysLabel(l.totalDays)}{l.employeeId?.department ? <> · <DeptTag name={l.employeeId.department} /></> : null}</div>
                                    </div>
                                    <LeaveStatus status={l.status} />
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            </div>
        </PeopleShell>
    )
}
