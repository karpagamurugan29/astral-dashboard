import React, { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import leaveActions from '../../../redux/leave/Actions'
import { PeopleShell, ErrorBanner } from '../../../components/people/PeopleUI'
import { LEAVE_ROOT, LEAVE_TYPES, leaveMeta, allowanceOf, dateRange, daysLabel } from '../../../components/leave/LeaveUI'
import { ymd } from '../../../components/attendance/AttendanceUI'
import './ApplyLeave.css'

const PRIMARY_COUNT = 7

const diffInDays = (from, to) => {
    if (!from || !to) return 0
    const a = new Date(from)
    const b = new Date(to)
    const days = Math.round((b - a) / (1000 * 60 * 60 * 24)) + 1
    return days > 0 ? days : 0
}

export const ApplyLeave = () => {
    const dispatch = useDispatch()
    const navigate = useNavigate()
    const location = useLocation()
    const { saving, error, balance } = useSelector((state) => state.leaveReducer || {})
    const preselected = location.state?.leaveType || ''
    const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm({
        defaultValues: { session: 'Full Day', halfDay: false, leaveType: preselected },
    })
    const [showAll, setShowAll] = useState(() => LEAVE_TYPES.findIndex((t) => t.value === preselected) >= PRIMARY_COUNT)

    useEffect(() => {
        dispatch({ type: leaveActions.GET_LEAVE_BALANCE })
    }, [dispatch])

    const leaveType = watch('leaveType')
    const fromDate = watch('fromDate')
    const toDate = watch('toDate')
    const halfDay = watch('halfDay')
    const reason = watch('reason') || ''
    const computedDays = halfDay ? 0.5 : diffInDays(fromDate, toDate)

    // A half-day request is always for a single date — keep toDate in lockstep with fromDate
    // so the disabled field doesn't submit a stale/empty value.
    useEffect(() => {
        if (halfDay && fromDate) setValue('toDate', fromDate)
    }, [halfDay, fromDate, setValue])

    // Switching half-day on picks a session; switching it off returns to a full day.
    useEffect(() => {
        setValue('session', halfDay ? 'First Half' : 'Full Day')
    }, [halfDay, setValue])

    const onSubmit = (data) => {
        dispatch({
            type: leaveActions.APPLY_LEAVE,
            payload: { ...data, totalDays: computedDays },
            onDone: () => navigate('/leave'),
        })
    }

    const quickPick = (offset, length = 1) => {
        const f = new Date()
        f.setDate(f.getDate() + offset)
        const t = new Date(f)
        t.setDate(t.getDate() + length - 1)
        setValue('fromDate', ymd(f), { shouldValidate: true })
        setValue('toDate', ymd(t), { shouldValidate: true })
    }

    const nextMonday = () => {
        const d = new Date()
        return ((8 - d.getDay()) % 7) || 7
    }

    const meta = leaveType ? leaveMeta(leaveType) : null
    const allowance = meta?.balanceKey && meta.balanceKey !== 'lossOfPay' ? allowanceOf(balance, meta.balanceKey) : null
    const after = allowance ? allowance.left - computedDays : null
    const insufficient = allowance && computedDays > allowance.left
    const visibleTypes = showAll ? LEAVE_TYPES : LEAVE_TYPES.slice(0, PRIMARY_COUNT)

    return (
        <PeopleShell title="Apply leave" root={LEAVE_ROOT} crumbs={[{ label: 'Apply' }]} backTo="/leave">
            <ErrorBanner error={error} />

            <form className="al-layout" onSubmit={handleSubmit(onSubmit)} noValidate>
                <div>
                    {/* ---------- 1. type ---------- */}
                    <section className="pp-card al-step">
                        <div className="pp-card-head"><span className="al-num">1</span><h3>What kind of leave?</h3></div>
                        <div className="pp-card-body">
                            <div className="al-types" role="radiogroup" aria-label="Leave type">
                                {visibleTypes.map((t) => {
                                    const a = t.balanceKey && t.balanceKey !== 'lossOfPay' ? allowanceOf(balance, t.balanceKey) : null
                                    const hint = t.balanceKey === 'lossOfPay' ? 'Unpaid' : a ? `${a.left} of ${a.total} left` : t.balanceKey ? '…' : 'As per policy'
                                    return (
                                        <label key={t.value} style={{ '--c': t.color }}>
                                            <input type="radio" value={t.value} {...register('leaveType', { required: 'Choose a leave type' })} />
                                            <span className="al-type">
                                                <i className={`mdi ${t.icon}`}></i>
                                                <b>{t.value}</b>
                                                <small className={a && a.left <= 0 ? 'low' : ''}>{hint}</small>
                                            </span>
                                        </label>
                                    )
                                })}
                            </div>
                            {errors.leaveType && <div className="pp-err">{errors.leaveType.message}</div>}
                            <button type="button" className="al-more" onClick={() => setShowAll((v) => !v)}>
                                {showAll ? 'Show fewer types' : `More leave types (${LEAVE_TYPES.length - PRIMARY_COUNT})`}
                            </button>
                        </div>
                    </section>

                    {/* ---------- 2. dates ---------- */}
                    <section className="pp-card al-step">
                        <div className="pp-card-head"><span className="al-num">2</span><h3>When?</h3></div>
                        <div className="pp-card-body">
                            <div className="al-quick">
                                <button type="button" className="al-chip" onClick={() => quickPick(0)}>Today</button>
                                <button type="button" className="al-chip" onClick={() => quickPick(1)}>Tomorrow</button>
                                {!halfDay && <button type="button" className="al-chip" onClick={() => quickPick(nextMonday(), 5)}>Next week (Mon–Fri)</button>}
                            </div>
                            <div className="al-dates">
                                <div className="pp-field">
                                    <label className="pp-label">From<span className="req">*</span></label>
                                    <input type="date" className={`pp-input ${errors.fromDate ? 'is-invalid' : ''}`} {...register('fromDate', { required: 'Pick a start date' })} />
                                    {errors.fromDate && <div className="pp-err">{errors.fromDate.message}</div>}
                                </div>
                                <div className="pp-field">
                                    <label className="pp-label">To<span className="req">*</span></label>
                                    <input type="date" min={fromDate || undefined} className={`pp-input ${errors.toDate ? 'is-invalid' : ''}`} disabled={halfDay}
                                        {...register('toDate', { required: 'Pick an end date', validate: (v) => !fromDate || !v || v >= fromDate || 'End date is before the start date' })} />
                                    {errors.toDate && <div className="pp-err">{errors.toDate.message}</div>}
                                </div>
                            </div>
                            <div className="al-half">
                                <label className="al-switch">
                                    <input type="checkbox" {...register('halfDay')} />
                                    <span></span>
                                    Half day
                                </label>
                                {halfDay && (
                                    <div className="pp-seg" role="radiogroup" aria-label="Session">
                                        {['First Half', 'Second Half'].map((s) => (
                                            <button key={s} type="button" className={watch('session') === s ? 'active' : ''} onClick={() => setValue('session', s)}>
                                                <i className={`mdi ${s === 'First Half' ? 'mdi-weather-sunset-up' : 'mdi-weather-sunset-down'}`}></i>{s}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>

                    {/* ---------- 3. reason ---------- */}
                    <section className="pp-card al-step">
                        <div className="pp-card-head"><span className="al-num">3</span><h3>Reason</h3><small className="ms-auto">{reason.length} characters</small></div>
                        <div className="pp-card-body">
                            <textarea rows={3} placeholder="A short note for your manager — e.g. Family function in Chennai." className={`pp-input ${errors.reason ? 'is-invalid' : ''}`}
                                {...register('reason', { required: 'Add a short reason' })}></textarea>
                            {errors.reason && <div className="pp-err">{errors.reason.message}</div>}
                        </div>
                    </section>
                </div>

                {/* ---------- summary ---------- */}
                <aside className="pp-card al-summary" style={{ '--c': meta?.color || '#0b0f19' }}>
                    <div className="al-sum-top">
                        <span className="al-sum-icon"><i className={`mdi ${meta?.icon || 'mdi-calendar-plus'}`}></i></span>
                        <h4>{leaveType || 'Choose a leave type'}</h4>
                        <p>{fromDate ? dateRange(fromDate, halfDay ? fromDate : toDate) : 'Pick your dates'}{halfDay && fromDate ? ` · ${watch('session')}` : ''}</p>
                    </div>
                    <div className="al-sum-days">
                        <b>{computedDays}</b>
                        <span>{computedDays === 1 ? 'day' : 'days'} requested</span>
                    </div>

                    {allowance && (
                        <div className="al-sum-bal">
                            <div className="al-sum-row"><span>Available now</span><b>{daysLabel(allowance.left)}</b></div>
                            <div className="al-bar" aria-hidden="true">
                                <span className="using" style={{ width: `${allowance.total ? Math.min(100, (allowance.left / allowance.total) * 100) : 0}%` }}></span>
                                <span className="after" style={{ width: `${allowance.total ? Math.max(0, Math.min(100, (after / allowance.total) * 100)) : 0}%` }}></span>
                            </div>
                            <div className="al-sum-row"><span>After this request</span><b style={{ color: insufficient ? '#e11d48' : undefined }}>{daysLabel(Math.max(0, after))}</b></div>
                        </div>
                    )}

                    {insufficient && (
                        <div className="al-warn"><i className="mdi mdi-alert-circle-outline"></i><span>You only have {daysLabel(allowance.left)} of {meta.short} left. Shorten the dates or pick another type.</span></div>
                    )}
                    {meta?.balanceKey === 'lossOfPay' && (
                        <div className="al-note"><i className="mdi mdi-information-outline"></i><span>Loss of pay days are unpaid and deducted from salary.</span></div>
                    )}
                    {!meta?.balanceKey && meta && (
                        <div className="al-note"><i className="mdi mdi-information-outline"></i><span>{meta.value} follows company policy and needs approval.</span></div>
                    )}

                    <div className="al-sum-foot">
                        <button type="submit" className="pp-btn primary" disabled={saving || computedDays <= 0 || insufficient}>
                            {saving ? 'Submitting…' : <><i className="mdi mdi-send-outline"></i> Submit request</>}
                        </button>
                        <Link to="/leave" className="pp-btn">Cancel</Link>
                    </div>
                </aside>
            </form>
        </PeopleShell>
    )
}
