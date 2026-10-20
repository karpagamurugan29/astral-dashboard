import React, { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import attendanceActions from '../../../redux/attendance/Actions'
import { PeopleShell, ProgressRing, ErrorBanner } from '../../../components/people/PeopleUI'
import { ATTENDANCE_ROOT, WORKDAY_HOURS, MODE_META, AttStatus, ModeTag, formatTime, hoursLabel } from '../../../components/attendance/AttendanceUI'
import './AttendanceToday.css'

const greeting = (d) => (d.getHours() < 12 ? 'Good morning' : d.getHours() < 17 ? 'Good afternoon' : 'Good evening')

const fetchMonth = (dispatch) => {
    const d = new Date()
    dispatch({ type: attendanceActions.GET_ATTENDANCE_HISTORY, month: d.getMonth() + 1, year: d.getFullYear() })
}

export const AttendanceToday = () => {
    const dispatch = useDispatch()
    const { today, todayLoading, saving, error, history } = useSelector((state) => state.attendanceReducer || {})
    const { isAuthenticated: user } = useSelector((state) => state.authReducer || {})
    const [now, setNow] = useState(() => new Date())
    const [mode, setMode] = useState('Office')

    useEffect(() => {
        dispatch({ type: attendanceActions.GET_TODAY_ATTENDANCE })
        fetchMonth(dispatch)
    }, [dispatch])

    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 1000)
        return () => clearInterval(t)
    }, [])

    // After a punch completes, refresh this month's summary so the side panel stays in step.
    const [wasSaving, setWasSaving] = useState(false)
    useEffect(() => {
        if (wasSaving && !saving) fetchMonth(dispatch)
        setWasSaving(!!saving)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [saving])

    const onCheckIn = () => dispatch({ type: attendanceActions.CHECK_IN, payload: { attendanceType: mode } })
    const onCheckOut = () => dispatch({ type: attendanceActions.CHECK_OUT, payload: {} })

    const required = today?.requiredHours || WORKDAY_HOURS
    const sessions = today?.sessions || []
    const isIn = !!today?.currentSessionStart
    // Finished sessions plus the open one counted live, instead of waiting for the next fetch.
    const closedHours = sessions.reduce((s, x) => s + (x.checkIn && x.checkOut ? (new Date(x.checkOut) - new Date(x.checkIn)) / 36e5 : 0), 0)
    const worked = isIn ? closedHours + Math.max(0, (now - new Date(today.currentSessionStart)) / 36e5) : (Number(today?.workedHours) || closedHours)
    const pct = Math.min(100, (worked / required) * 100)
    const remaining = Math.max(0, required - worked)

    const month = useMemo(() => {
        const recs = history || []
        const attended = recs.filter((r) => ['Present', 'Late', 'Half Day'].includes(r.status))
        const total = recs.reduce((s, r) => s + (Number(r.workingHours) || 0), 0)
        return {
            present: attended.length,
            late: recs.filter((r) => r.status === 'Late').length,
            total,
            avg: attended.length ? total / attended.length : 0,
        }
    }, [history])

    const recent = useMemo(
        () => [...(history || [])].sort((a, b) => String(b.attendanceDate).localeCompare(String(a.attendanceDate))).slice(0, 5),
        [history]
    )

    const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const secs = String(now.getSeconds()).padStart(2, '0')

    return (
        <PeopleShell
            title="My attendance"
            root={ATTENDANCE_ROOT}
            crumbs={[{ label: 'My attendance' }]}
            actions={<Link to="/attendance/history" className="pp-btn"><i className="mdi mdi-calendar-month-outline"></i> Full history</Link>}
        >
            {/* "No attendance found for today" just means not checked in yet — not an error to show. */}
            <ErrorBanner error={error && !/no attendance found/i.test(error) ? error : ''} />

            <div className="mt-layout">
                {/* ---------- time clock ---------- */}
                <section className="pp-card mt-clock">
                    <div className="mt-clock-top">
                        <div>
                            <div className="mt-date">{now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
                            <div className="mt-time">{time}<small>:{secs}</small></div>
                            <div className="mt-greet">{greeting(now)}, {user?.firstName || 'there'}</div>
                        </div>
                        {today && (
                            <div className="mt-tags">
                                <AttStatus status={today.status} extra={today.lateByMinutes > 0 ? `· ${today.lateByMinutes}m` : null} />
                                <ModeTag mode={today.attendanceType} />
                            </div>
                        )}
                    </div>

                    {todayLoading && !today ? (
                        <div className="pp-skel" style={{ height: 180 }}></div>
                    ) : (
                        <>
                            <div className="mt-body">
                                <div className="mt-ring-wrap">
                                    <ProgressRing value={pct} size={168} stroke={12} color={pct >= 100 ? '#10b981' : '#0ea5e9'}>
                                        <span className="mt-ring-center">
                                            <b>{hoursLabel(worked)}</b>
                                            <span>of {required}h today</span>
                                        </span>
                                    </ProgressRing>
                                </div>
                                <div className="mt-facts">
                                    <div className="mt-fact" style={{ '--c': '#059669' }}><span><i className="mdi mdi-login-variant"></i>Checked in</span><b>{formatTime(today?.checkIn)}</b></div>
                                    <div className="mt-fact" style={{ '--c': '#e11d48' }}><span><i className="mdi mdi-logout-variant"></i>{sessions.length > 1 ? 'Last out' : 'Checked out'}</span><b>{isIn ? 'In now' : formatTime(today?.checkOut)}</b></div>
                                    <div className="mt-fact" style={{ '--c': '#0284c7' }}><span><i className="mdi mdi-timer-sand"></i>Remaining</span><b>{today ? hoursLabel(remaining) : `${required}h`}</b></div>
                                    <div className="mt-fact" style={{ '--c': '#7c3aed' }}><span><i className="mdi mdi-percent-outline"></i>Day done</span><b>{Math.round(pct)}%</b></div>
                                </div>
                            </div>

                            <div className="mt-actions">
                                {!today ? (
                                    <>
                                        <div className="mt-mode-label">Where are you working today?</div>
                                        <div className="mt-modes" role="radiogroup" aria-label="Work mode">
                                            {Object.entries(MODE_META).map(([m, meta]) => (
                                                <label key={m} style={{ '--c': meta.color }}>
                                                    <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} />
                                                    <span><i className={`mdi ${meta.icon}`}></i>{m}</span>
                                                </label>
                                            ))}
                                        </div>
                                        <button type="button" className="mt-big" onClick={onCheckIn} disabled={saving}>
                                            <i className="mdi mdi-fingerprint"></i>{saving === 'locating' ? 'Getting your location…' : saving ? 'Checking in…' : 'Check in'}
                                        </button>
                                    </>
                                ) : !today.isCheckedOut ? (
                                    <button type="button" className="mt-big out" onClick={onCheckOut} disabled={saving}>
                                        <i className="mdi mdi-logout-variant"></i>{saving === 'locating' ? 'Getting your location…' : saving ? 'Checking out…' : 'Check out'}
                                    </button>
                                ) : (
                                    <>
                                        <div className="mt-done">
                                            <i className="mdi mdi-check-decagram"></i>
                                            <div><b>{today.autoCheckedOut ? 'Checked out automatically' : 'Checked out'}</b>{today.autoCheckedOut ? <>You didn't check out, so the system did at the cut-off. If that's wrong, <Link to="/attendance/regularization">request a correction</Link>.</> : <>You've worked {hoursLabel(worked)} today across {sessions.length} session{sessions.length === 1 ? '' : 's'}.</>}</div>
                                        </div>
                                        <div className="mt-mode-label">Going back to work? Where are you now?</div>
                                        <div className="mt-modes" role="radiogroup" aria-label="Work mode">
                                            {Object.entries(MODE_META).map(([m, meta]) => (
                                                <label key={m} style={{ '--c': meta.color }}>
                                                    <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} />
                                                    <span><i className={`mdi ${meta.icon}`}></i>{m}</span>
                                                </label>
                                            ))}
                                        </div>
                                        <button type="button" className="mt-big again" onClick={onCheckIn} disabled={saving}>
                                            <i className="mdi mdi-login-variant"></i>{saving === 'locating' ? 'Getting your location…' : saving ? 'Checking in…' : 'Check in again'}
                                        </button>
                                    </>
                                )}
                                {sessions.length > 0 && (
                                    <div className="mt-sessions">
                                        <div className="mt-sessions-head">Today's sessions <span>{hoursLabel(worked)}</span></div>
                                        <ol>
                                            {sessions.map((x, i) => {
                                                const open = !x.checkOut
                                                const hrs = ((open ? now : new Date(x.checkOut)) - new Date(x.checkIn)) / 36e5
                                                return (
                                                    <li key={i} className={open ? 'open' : ''}>
                                                        <span className="mt-sess-n">{i + 1}</span>
                                                        <span className="mt-sess-main">
                                                            <b>{formatTime(x.checkIn)} → {open ? <span className="mt-sess-live">now</span> : formatTime(x.checkOut)}</b>
                                                            {(x.checkInAddress || x.checkOutAddress) && <small title={x.checkInAddress}><i className="mdi mdi-map-marker-outline"></i>{x.checkInAddress || x.checkOutAddress}</small>}
                                                        </span>
                                                        <ModeTag mode={x.mode} />
                                                        <span className="mt-sess-hrs">{hoursLabel(Math.max(0, hrs))}</span>
                                                    </li>
                                                )
                                            })}
                                        </ol>
                                    </div>
                                )}
                                <p className="mt-hint"><i className="mdi mdi-map-marker-outline"></i> Your location is recorded every time you check in and check out.</p>
                                <p className="mt-hint">Missed a punch? <Link to="/attendance/regularization">Request a correction</Link></p>
                            </div>
                        </>
                    )}
                </section>

                {/* ---------- side ---------- */}
                <div className="mt-side">
                    <section className="pp-card">
                        <div className="pp-card-head"><h3>This month</h3><small>{now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</small></div>
                        <div className="pp-card-body">
                            <div className="mt-month">
                                <div className="mt-stat" style={{ '--c': '#059669' }}><i className="mdi mdi-calendar-check-outline"></i><div><b>{month.present}</b><span>Days attended</span></div></div>
                                <div className="mt-stat" style={{ '--c': '#d97706' }}><i className="mdi mdi-clock-alert-outline"></i><div><b>{month.late}</b><span>Late arrivals</span></div></div>
                                <div className="mt-stat" style={{ '--c': '#0284c7' }}><i className="mdi mdi-chart-timeline-variant"></i><div><b>{hoursLabel(month.avg)}</b><span>Average per day</span></div></div>
                                <div className="mt-stat" style={{ '--c': '#7c3aed' }}><i className="mdi mdi-sigma"></i><div><b>{Math.round(month.total)}h</b><span>Total worked</span></div></div>
                            </div>
                        </div>
                    </section>

                    <section className="pp-card">
                        <div className="pp-card-head"><h3>Recent days</h3><Link to="/attendance/history" className="pp-btn sm ghost">View all <i className="mdi mdi-chevron-right"></i></Link></div>
                        <div className="pp-card-body" style={{ paddingTop: 8, paddingBottom: 8 }}>
                            {!recent.length ? (
                                <p className="pp-muted-dash mb-0 py-3 text-center">No records this month yet.</p>
                            ) : (
                                <ul className="mt-recent">
                                    {recent.map((r) => {
                                        const d = new Date(r.attendanceDate)
                                        return (
                                            <li className="mt-day" key={r._id}>
                                                <span className="mt-day-date"><b>{d.getDate()}</b><small>{d.toLocaleDateString(undefined, { weekday: 'short' })}</small></span>
                                                <span className="mt-day-main"><b>{formatTime(r.checkIn?.time)}</b> → <b>{formatTime(r.checkOut?.time)}</b> · {hoursLabel(r.workingHours)}{r.sessions?.length > 1 ? ` · ${r.sessions.length} sessions` : ''}</span>
                                                <AttStatus status={r.status} />
                                            </li>
                                        )
                                    })}
                                </ul>
                            )}
                        </div>
                    </section>

                    <section className="mt-links">
                        <Link to="/attendance/regularization" className="mt-link" style={{ '--c': '#d97706' }}>
                            <i className="mdi mdi-file-document-edit-outline"></i>
                            <span>Regularization<small>Fix a missed or wrong punch</small></span>
                            <i className="mdi mdi-chevron-right"></i>
                        </Link>
                        <Link to="/attendance/holidays" className="mt-link" style={{ '--c': '#e11d48' }}>
                            <i className="mdi mdi-calendar-star"></i>
                            <span>Holidays<small>Upcoming days off and long weekends</small></span>
                            <i className="mdi mdi-chevron-right"></i>
                        </Link>
                    </section>
                </div>
            </div>
        </PeopleShell>
    )
}
