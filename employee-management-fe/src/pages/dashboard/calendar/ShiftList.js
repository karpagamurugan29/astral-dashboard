import React, { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useForm } from 'react-hook-form'
import calendarActions from '../../../redux/calendar/Actions'
import { PeopleShell, EmptyState, ErrorBanner } from '../../../components/people/PeopleUI'
import { ATTENDANCE_ROOT, hoursLabel } from '../../../components/attendance/AttendanceUI'
import { shiftMeta, shiftSpan, fromMinutes, toMinutes, pct, TimelineBar } from './calendarShared'
import '../../../components/attendance/attendance.css'
import './calendar.css'
import { FormModal } from '../../../components/common/FormModal'


const ShiftsScreen = ({ shifts, isAdmin, dispatch }) => {
    const form = useForm({ defaultValues: { graceMinutes: 10 } })
    const [adding, setAdding] = useState(false)
    const [now, setNow] = useState(() => new Date())

    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 60000)
        return () => clearInterval(t)
    }, [])

    const list = useMemo(() => [...(shifts || [])].sort((x, y) => toMinutes(x.startTime) - toMinutes(y.startTime)), [shifts])
    const nowMins = now.getHours() * 60 + now.getMinutes()

    const stats = useMemo(() => {
        if (!list.length) return null
        const longest = [...list].sort((x, y) => shiftSpan(y).dur - shiftSpan(x).dur)[0]
        return {
            earliest: list[0].startTime,
            longest,
            avgGrace: Math.round(list.reduce((s, x) => s + (Number(x.graceMinutes) || 0), 0) / list.length),
        }
    }, [list])

    const isRunning = (s) => {
        const { a, b, overnight } = shiftSpan(s)
        return overnight ? nowMins >= a || nowMins < b : nowMins >= a && nowMins < b
    }

    const onAdd = (data) => {
        dispatch({ type: calendarActions.ADD_SHIFT, payload: { ...data, graceMinutes: Number(data.graceMinutes) || 0 } })
        form.reset({ name: '', startTime: '', endTime: '', graceMinutes: 10 })
        setAdding(false)
    }
    const openAdd = () => { form.reset({ name: '', startTime: '', endTime: '', graceMinutes: 10 }); setAdding(true) }
    const onCancel = () => { form.reset({ name: '', startTime: '', endTime: '', graceMinutes: 10 }); setAdding(false) }
    const errs = form.formState.errors

    return (
        <>
            <div className="at-tiles">
                <div className="at-tile" style={{ '--c': '#f59e0b' }}>
                    <span className="at-tile-icon"><i className="mdi mdi-clock-time-four-outline"></i></span>
                    <div><b>{list.length}</b><span>Shifts defined</span></div>
                </div>
                <div className="at-tile" style={{ '--c': '#0284c7' }}>
                    <span className="at-tile-icon"><i className="mdi mdi-weather-sunset-up"></i></span>
                    <div><b>{stats?.earliest || '—'}</b><span>Earliest start</span></div>
                </div>
                <div className="at-tile" style={{ '--c': '#7c3aed' }}>
                    <span className="at-tile-icon"><i className="mdi mdi-timer-outline"></i></span>
                    <div><b>{stats ? hoursLabel(shiftSpan(stats.longest).dur / 60) : '—'}</b><span>Longest shift</span></div>
                </div>
                <div className="at-tile" style={{ '--c': '#059669' }}>
                    <span className="at-tile-icon"><i className="mdi mdi-timer-sand"></i></span>
                    <div><b>{stats ? `${stats.avgGrace} min` : '—'}</b><span>Average grace</span></div>
                </div>
            </div>

            {isAdmin && adding && (
                <FormModal icon="mdi-plus-circle-outline" title={"New shift"} onClose={onCancel} onSubmit={form.handleSubmit(onAdd)} submitLabel={"Add shift"} submitIcon="mdi-check">
                    <div className="pp-card-body">
                        <div className="wc-form-grid shift">
                            <div className="pp-field">
                                <label className="pp-label">Name<span className="req">*</span></label>
                                <input type="text" autoFocus placeholder="e.g. General" className={`pp-input ${errs.name ? 'is-invalid' : ''}`} {...form.register('name', { required: 'Give the shift a name' })} />
                                {errs.name && <div className="pp-err">{errs.name.message}</div>}
                            </div>
                            <div className="pp-field">
                                <label className="pp-label">Starts<span className="req">*</span></label>
                                <input type="time" className={`pp-input ${errs.startTime ? 'is-invalid' : ''}`} {...form.register('startTime', { required: 'Required' })} />
                                {errs.startTime && <div className="pp-err">{errs.startTime.message}</div>}
                            </div>
                            <div className="pp-field">
                                <label className="pp-label">Ends<span className="req">*</span></label>
                                <input type="time" className={`pp-input ${errs.endTime ? 'is-invalid' : ''}`} {...form.register('endTime', { required: 'Required' })} />
                                {errs.endTime && <div className="pp-err">{errs.endTime.message}</div>}
                            </div>
                            <div className="pp-field">
                                <label className="pp-label">Grace (min)</label>
                                <input type="number" min="0" max="120" className="pp-input" {...form.register('graceMinutes')} />
                                <div className="pp-help">Arrivals within this window aren't marked late.</div>
                            </div>
                        </div>
                    </div>
                </FormModal>
            )}

            {!list.length ? (
                <div className="pp-card">
                    <EmptyState icon="mdi-clock-time-four-outline" title="No shifts defined yet"
                        text="Shifts set the expected start time and how much grace people get before they're marked late."
                        action={isAdmin && !adding && <button type="button" className="pp-btn primary" onClick={openAdd}><i className="mdi mdi-plus"></i> Add shift</button>} />
                </div>
            ) : (
                <>
                    {/* 24-hour overview: every shift on one shared axis */}
                    <section className="pp-card wc-gantt">
                        <div className="pp-card-head">
                            <h3><i className="mdi mdi-chart-gantt me-2" style={{ color: '#0284c7' }}></i>Your day at a glance</h3>
                            <small>Now · {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
                        </div>
                        <div className="pp-card-body">
                            <div className="wc-gantt-axis">
                                <span></span>
                                <div className="wc-gantt-hours">{[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => <span key={h} style={{ left: pct(h * 60) }}>{String(h).padStart(2, '0')}</span>)}</div>
                            </div>
                            {list.map((s) => {
                                const m = shiftMeta(s.startTime)
                                return (
                                    <div className="wc-gantt-row" key={s._id} style={{ '--c': m.color }}>
                                        <div className="wc-gantt-label"><i className={`mdi ${m.icon}`}></i><span>{s.name}</span></div>
                                        <div className="wc-gantt-track">
                                            <TimelineBar s={s} />
                                            <i className="wc-gantt-now" style={{ left: pct(nowMins) }}></i>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </section>

                    <div className="wc-shift-grid">
                        {list.map((s) => {
                            const m = shiftMeta(s.startTime)
                            const { a, dur, overnight } = shiftSpan(s)
                            const running = isRunning(s)
                            return (
                                <article className="pp-card wc-shift-card" key={s._id} style={{ '--c': m.color }}>
                                    <div className="wc-shift-head">
                                        <span className="wc-shift-icon"><i className={`mdi ${m.icon}`}></i></span>
                                        <div>
                                            <b>{s.name}</b>
                                            <small>{m.label}</small>
                                        </div>
                                        {running && <span className="wc-live">On now</span>}
                                    </div>
                                    <div className="wc-shift-time">
                                        {s.startTime}<i className="mdi mdi-arrow-right"></i>{s.endTime}
                                        {overnight && <small>next day</small>}
                                    </div>
                                    <div className="wc-timeline" aria-hidden="true"><TimelineBar s={s} /></div>
                                    <div className="wc-ticks"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
                                    <div className="wc-shift-facts">
                                        <div><i className="mdi mdi-timer-outline" style={{ color: '#7c3aed' }}></i><span>Duration</span><b>{hoursLabel(dur / 60)}</b></div>
                                        <div><i className="mdi mdi-timer-sand" style={{ color: '#059669' }}></i><span>Grace</span><b>{s.graceMinutes ?? 0} min</b></div>
                                        <div><i className="mdi mdi-clock-alert-outline" style={{ color: '#d97706' }}></i><span>Late after</span><b>{fromMinutes(a + (Number(s.graceMinutes) || 0))}</b></div>
                                    </div>
                                </article>
                            )
                        })}
                    </div>
                </>
            )}

            {isAdmin && !adding && list.length > 0 && (
                <button type="button" className="wc-fab pp-btn primary" onClick={openAdd}>
                    <i className="mdi mdi-plus"></i> Add shift
                </button>
            )}
        </>
    )
}

export const ShiftList = () => {
    const dispatch = useDispatch()
    const { shifts, error } = useSelector((state) => state.calendarReducer || {})
    const { isAuthenticated: user } = useSelector((state) => state.authReducer || {})

    useEffect(() => {
        dispatch({ type: calendarActions.GET_SHIFTS })
    }, [dispatch])

    return (
        <PeopleShell title="Shifts" root={ATTENDANCE_ROOT} crumbs={[{ label: 'Shifts' }]} backTo="/attendance/today">
            <ErrorBanner error={error} />
            <ShiftsScreen shifts={shifts} isAdmin={user?.role === 'Admin'} dispatch={dispatch} />
        </PeopleShell>
    )
}
