import React, { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useForm } from 'react-hook-form'
import { useLocation } from 'react-router-dom'
import calendarActions from '../../../redux/calendar/Actions'
import { PeopleShell, EmptyState, ErrorBanner } from '../../../components/people/PeopleUI'
import { ATTENDANCE_ROOT, MONTHS } from '../../../components/attendance/AttendanceUI'
import { HOLIDAY_TYPES, holidayMeta, DAY, startOfDay, daysUntilLabel } from './calendarShared'
import '../../../components/attendance/attendance.css'
import './calendar.css'
import { FormModal } from '../../../components/common/FormModal'
import { confirmAction } from '../../../components/common/ConfirmDialog'


const HolidaysScreen = ({ holidays, isAdmin, dispatch }) => {
    const form = useForm({ defaultValues: { type: 'National' } })
    const [adding, setAdding] = useState(false)
    const [showPast, setShowPast] = useState(false)
    const [typeFilter, setTypeFilter] = useState('')

    const today = startOfDay(Date.now())
    const year = new Date().getFullYear()
    const sorted = useMemo(() => [...(holidays || [])].sort((a, b) => new Date(a.date) - new Date(b.date)), [holidays])
    const upcoming = sorted.filter((h) => startOfDay(h.date) >= today)
    const next = upcoming[0]
    const nextMeta = next ? holidayMeta(next.type) : null
    const nextIn = next ? Math.round((startOfDay(next.date) - today) / DAY) : 0
    // A holiday on a Friday or Monday gives a three-day weekend.
    const longWeekends = upcoming.filter((h) => [1, 5].includes(new Date(h.date).getDay())).length

    const typeCounts = useMemo(() => {
        const base = showPast ? sorted : upcoming
        return Object.fromEntries(Object.keys(HOLIDAY_TYPES).map((t) => [t, base.filter((h) => (h.type || 'National') === t).length]))
    }, [sorted, upcoming, showPast])

    const groups = useMemo(() => {
        const list = (showPast ? sorted : upcoming).filter((h) => !typeFilter || (h.type || 'National') === typeFilter)
        const map = new Map()
        list.forEach((h) => {
            const d = new Date(h.date)
            const key = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
            if (!map.has(key)) map.set(key, [])
            map.get(key).push(h)
        })
        return [...map.entries()]
    }, [sorted, upcoming, showPast, typeFilter])

    const onAdd = (data) => {
        dispatch({ type: calendarActions.ADD_HOLIDAY, payload: data })
        form.reset({ name: '', date: '', type: 'National' })
        setAdding(false)
    }
    const openAdd = () => { form.reset({ name: '', date: '', type: 'National' }); setAdding(true) }
    const onCancel = () => { form.reset({ name: '', date: '', type: 'National' }); setAdding(false) }
    const onRemove = async (h) => {
        if (await confirmAction({ title: `Remove “${h.name}”?`, message: 'It comes off everyone\'s holiday calendar.', confirmLabel: 'Remove holiday' })) dispatch({ type: calendarActions.DELETE_HOLIDAY, id: h._id })
    }
    const errs = form.formState.errors
    const pastCount = sorted.length - upcoming.length

    return (
        <>
            <div className="wc-top">
                <section className="pp-card wc-next" style={{ '--c': nextMeta?.color || '#94a3b8' }}>
                    {next ? (
                        <>
                            <div className="wc-next-tile">
                                <small>{new Date(next.date).toLocaleDateString(undefined, { month: 'short' })}</small>
                                <b>{new Date(next.date).getDate()}</b>
                            </div>
                            <div>
                                <div className="wc-next-label">Next holiday</div>
                                <h3>{next.name}</h3>
                                <div className="wc-next-when">
                                    <b>{daysUntilLabel(nextIn)}</b>· {new Date(next.date).toLocaleDateString(undefined, { weekday: 'long' })}
                                    <span className="pp-tag" style={{ '--tag': nextMeta.color }}><i className={`mdi ${nextMeta.icon}`}></i>{next.type || 'National'}</span>
                                </div>
                            </div>
                            {nextIn > 0 && <div className="wc-countdown"><b>{nextIn}</b><span>day{nextIn === 1 ? '' : 's'} to go</span></div>}
                        </>
                    ) : (
                        <div><div className="wc-next-label">Next holiday</div><h3>None scheduled</h3><div className="wc-next-when">Add holidays so everyone can plan time off.</div></div>
                    )}
                </section>
                <div className="at-tile" style={{ '--c': '#e11d48' }}>
                    <span className="at-tile-icon"><i className="mdi mdi-calendar-star"></i></span>
                    <div><b>{sorted.filter((h) => new Date(h.date).getFullYear() === year).length}</b><span>Holidays in {year}</span></div>
                </div>
                <div className="at-tile" style={{ '--c': '#0284c7' }}>
                    <span className="at-tile-icon"><i className="mdi mdi-calendar-arrow-right"></i></span>
                    <div><b>{upcoming.length}</b><span>Still to come</span></div>
                </div>
                <div className="at-tile" style={{ '--c': '#059669' }}>
                    <span className="at-tile-icon"><i className="mdi mdi-beach"></i></span>
                    <div><b>{longWeekends}</b><span>Long weekends ahead</span></div>
                </div>
            </div>

            {isAdmin && adding && (
                <FormModal icon="mdi-plus-circle-outline" title={"New holiday"} onClose={onCancel} onSubmit={form.handleSubmit(onAdd)} submitLabel={"Add holiday"} submitIcon="mdi-check">
                    <div className="pp-card-body">
                        <div className="wc-form-grid holiday">
                            <div className="pp-field">
                                <label className="pp-label">Name<span className="req">*</span></label>
                                <input type="text" autoFocus placeholder="e.g. Diwali" className={`pp-input ${errs.name ? 'is-invalid' : ''}`} {...form.register('name', { required: 'Give the holiday a name' })} />
                                {errs.name && <div className="pp-err">{errs.name.message}</div>}
                            </div>
                            <div className="pp-field">
                                <label className="pp-label">Date<span className="req">*</span></label>
                                <input type="date" className={`pp-input ${errs.date ? 'is-invalid' : ''}`} {...form.register('date', { required: 'Pick a date' })} />
                                {errs.date && <div className="pp-err">{errs.date.message}</div>}
                            </div>
                            <div className="pp-field">
                                <label className="pp-label">Type</label>
                                <div className="wc-types" role="radiogroup">
                                    {Object.entries(HOLIDAY_TYPES).map(([t, m]) => (
                                        <label key={t} style={{ '--c': m.color }}>
                                            <input type="radio" value={t} {...form.register('type')} />
                                            <span><i className={`mdi ${m.icon}`}></i>{t}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </FormModal>
            )}

            <div className="at-toolbar">
                <div className="wc-filters" aria-label="Filter by type">
                    <button type="button" className={`wc-filter ${!typeFilter ? 'active' : ''}`} style={{ '--c': '#0b0f19' }} onClick={() => setTypeFilter('')}>
                        All <b>{Object.values(typeCounts).reduce((a, b) => a + b, 0)}</b>
                    </button>
                    {Object.entries(HOLIDAY_TYPES).map(([t, m]) => (
                        <button key={t} type="button" className={`wc-filter ${typeFilter === t ? 'active' : ''}`} style={{ '--c': m.color }} onClick={() => setTypeFilter(typeFilter === t ? '' : t)}>
                            <i className={`mdi ${m.icon}`}></i>{t} <b>{typeCounts[t]}</b>
                        </button>
                    ))}
                </div>
                <div className="at-spacer"></div>
                {pastCount > 0 && (
                    <button type="button" className="pp-btn sm ghost" onClick={() => setShowPast((v) => !v)}>
                        <i className={`mdi ${showPast ? 'mdi-eye-off-outline' : 'mdi-history'}`}></i>{showPast ? 'Hide past' : `Show past (${pastCount})`}
                    </button>
                )}
            </div>

            {!groups.length ? (
                <div className="pp-card">
                    <EmptyState icon="mdi-calendar-star" title={sorted.length ? 'Nothing to show' : 'No holidays added yet'}
                        text={sorted.length ? 'No holidays match this filter.' : 'Add national, regional and optional holidays so everyone can plan ahead.'}
                        action={isAdmin && !sorted.length && <button type="button" className="pp-btn primary" onClick={openAdd}><i className="mdi mdi-plus"></i> Add holiday</button>} />
                </div>
            ) : (
                <div className="wc-months">
                    {groups.map(([month, list]) => (
                        <section className="pp-card wc-month-card" key={month}>
                            <div className="wc-month-head"><b>{month}</b><span>{list.length} holiday{list.length === 1 ? '' : 's'}</span></div>
                            {list.map((h) => {
                                const m = holidayMeta(h.type)
                                const d = new Date(h.date)
                                const diff = Math.round((startOfDay(h.date) - today) / DAY)
                                const longWeekend = [1, 5].includes(d.getDay())
                                return (
                                    <div className={`wc-holiday ${diff < 0 ? 'past' : ''}`} key={h._id} style={{ '--c': m.color }}>
                                        <span className="wc-date"><b>{d.getDate()}</b><small>{d.toLocaleDateString(undefined, { weekday: 'short' })}</small></span>
                                        <div className="wc-holiday-main">
                                            <b>{h.name}</b>
                                            <small>
                                                {diff < 0 ? 'Passed' : daysUntilLabel(diff)}
                                                {longWeekend && diff >= 0 && <span className="wc-lw"><i className="mdi mdi-beach"></i>Long weekend</span>}
                                            </small>
                                        </div>
                                        <span className="pp-tag" style={{ '--tag': m.color }}><i className={`mdi ${m.icon}`}></i>{h.type || 'National'}</span>
                                        {isAdmin && (
                                            <button type="button" className="wc-del" onClick={() => onRemove(h)} title="Remove" aria-label={`Remove ${h.name}`}>
                                                <i className="mdi mdi-trash-can-outline"></i>
                                            </button>
                                        )}
                                    </div>
                                )
                            })}
                        </section>
                    ))}
                </div>
            )}

            {isAdmin && !adding && sorted.length > 0 && (
                <button type="button" className="wc-fab pp-btn primary" onClick={openAdd}>
                    <i className="mdi mdi-plus"></i> Add holiday
                </button>
            )}
        </>
    )
}

export const HolidayList = () => {
    const dispatch = useDispatch()
    const location = useLocation()
    const { holidays, error } = useSelector((state) => state.calendarReducer || {})
    const { isAuthenticated: user } = useSelector((state) => state.authReducer || {})
    const fromSettings = location.pathname.startsWith('/settings')

    useEffect(() => {
        dispatch({ type: calendarActions.GET_HOLIDAYS })
    }, [dispatch])

    return (
        <PeopleShell
            title="Holidays"
            root={fromSettings ? { label: 'Settings', to: '/settings/company' } : ATTENDANCE_ROOT}
            crumbs={[{ label: 'Holidays' }]}
            backTo={fromSettings ? '/settings/company' : '/attendance/today'}
        >
            <ErrorBanner error={error} />
            <HolidaysScreen holidays={holidays} isAdmin={user?.role === 'Admin'} dispatch={dispatch} />
        </PeopleShell>
    )
}
