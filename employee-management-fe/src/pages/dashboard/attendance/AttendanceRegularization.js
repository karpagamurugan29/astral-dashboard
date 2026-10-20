import React, { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useForm } from 'react-hook-form'
import attendanceActions from '../../../redux/attendance/Actions'
import { PeopleShell, Avatar, EmptyState, ErrorBanner, fullName } from '../../../components/people/PeopleUI'
import { ATTENDANCE_ROOT, AttStatus, statusMeta, ymd } from '../../../components/attendance/AttendanceUI'
import './AttendanceRegularization.css'
import { useAccess } from '../../../hooks/useAccess'

const niceDate = (v) => {
    if (!v) return '—'
    const d = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : new Date(v)
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

export const AttendanceRegularization = () => {
    const dispatch = useDispatch()
    const { myRegularizations, pendingRegularizations, error } = useSelector((state) => state.attendanceReducer || {})
    const { can } = useAccess()
    const canApprove = can(['Admin', 'HR', 'Manager', 'Team Lead'], 'attendance')
    const { register, handleSubmit, reset, watch, formState: { errors } } = useForm()

    useEffect(() => {
        dispatch({ type: attendanceActions.GET_MY_REGULARIZATIONS })
        if (canApprove) {
            dispatch({ type: attendanceActions.GET_PENDING_REGULARIZATIONS })
        }
    }, [dispatch, canApprove])

    const onSubmit = (data) => {
        dispatch({ type: attendanceActions.REQUEST_REGULARIZATION, payload: data })
        reset({ attendanceDate: '', requestedCheckIn: '', requestedCheckOut: '', reason: '' })
    }

    const onDecide = (id, status) => dispatch({ type: attendanceActions.DECIDE_REGULARIZATION, id, status })

    const pending = pendingRegularizations || []
    const mine = [...(myRegularizations || [])].sort((a, b) => String(b.attendanceDate).localeCompare(String(a.attendanceDate)))
    const checkIn = watch('requestedCheckIn')

    return (
        <PeopleShell title="Regularization" root={ATTENDANCE_ROOT} crumbs={[{ label: 'Regularization' }]}>
            <ErrorBanner error={error} />

            {canApprove && (
                <>
                    <h2 className="at-section-title" style={{ '--c': '#d97706' }}>
                        <i className="mdi mdi-inbox-arrow-down-outline" style={{ color: '#d97706', fontSize: 20 }}></i>
                        Waiting for your approval <span className="at-count">{pending.length}</span>
                    </h2>
                    {!pending.length ? (
                        <div className="pp-card mb-4"><EmptyState icon="mdi-check-all" title="All caught up" text="No correction requests are waiting for you." /></div>
                    ) : (
                        <div className="rg-queue">
                            {pending.map((r) => (
                                <article key={r._id} className="pp-card rg-card">
                                    <div className="rg-card-head">
                                        <Avatar person={r.employeeId} size={40} />
                                        <div><b>{fullName(r.employeeId)}</b><small>{niceDate(r.attendanceDate)}</small></div>
                                    </div>
                                    <div className="rg-times">
                                        <div className="rg-time" style={{ '--c': '#059669' }}><span><i className="mdi mdi-login-variant"></i>Correct check in</span><b>{r.requestedCheckIn || '—'}</b></div>
                                        <div className="rg-time" style={{ '--c': '#e11d48' }}><span><i className="mdi mdi-logout-variant"></i>Correct check out</span><b>{r.requestedCheckOut || '—'}</b></div>
                                    </div>
                                    {r.reason && <div className="rg-reason"><i className="mdi mdi-format-quote-open"></i>{r.reason}</div>}
                                    <div className="rg-card-foot">
                                        <button type="button" className="rg-reject" onClick={() => onDecide(r._id, 'Rejected')}><i className="mdi mdi-close"></i> Reject</button>
                                        <button type="button" className="rg-approve" onClick={() => onDecide(r._id, 'Approved')}><i className="mdi mdi-check"></i> Approve</button>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </>
            )}

            <div className="rg-layout">
                <form className="pp-card" onSubmit={handleSubmit(onSubmit)} noValidate>
                    <div className="pp-card-head"><h3><i className="mdi mdi-file-document-edit-outline me-2" style={{ color: '#0284c7' }}></i>Request a correction</h3></div>
                    <div className="pp-card-body">
                        <div className="rg-tip">
                            <i className="mdi mdi-lightbulb-on-outline"></i>
                            <span>Forgot to punch, or punched at the wrong time? Tell us the correct times and your manager will review it.</span>
                        </div>
                        <div className="rg-form-grid">
                            <div className="pp-field span-2">
                                <label className="pp-label">Date<span className="req">*</span></label>
                                <input type="date" max={ymd(new Date())} className={`pp-input ${errors.attendanceDate ? 'is-invalid' : ''}`} {...register('attendanceDate', { required: 'Pick the day to correct' })} />
                                {errors.attendanceDate && <div className="pp-err">{errors.attendanceDate.message}</div>}
                            </div>
                            <div className="pp-field">
                                <label className="pp-label">Correct check in</label>
                                <input type="time" className="pp-input" {...register('requestedCheckIn')} />
                            </div>
                            <div className="pp-field">
                                <label className="pp-label">Correct check out</label>
                                <input type="time" className={`pp-input ${errors.requestedCheckOut ? 'is-invalid' : ''}`}
                                    {...register('requestedCheckOut', { validate: (v) => !v || !checkIn || v > checkIn || 'Check out must be after check in' })} />
                                {errors.requestedCheckOut && <div className="pp-err">{errors.requestedCheckOut.message}</div>}
                            </div>
                            <div className="pp-field span-2">
                                <label className="pp-label">Reason<span className="req">*</span></label>
                                <textarea rows={3} placeholder="e.g. Forgot to check out — left at 6:30 pm after the client call." className={`pp-input ${errors.reason ? 'is-invalid' : ''}`}
                                    {...register('reason', { required: 'Tell your manager why' })}></textarea>
                                {errors.reason && <div className="pp-err">{errors.reason.message}</div>}
                            </div>
                        </div>
                        <button type="submit" className="pp-btn primary w-100">
                            <i className="mdi mdi-send-outline"></i> Submit request
                        </button>
                    </div>
                </form>

                <section className="pp-card">
                    <div className="pp-card-head"><h3>My requests</h3><small>{mine.length} total</small></div>
                    <div className="pp-card-body">
                        {!mine.length ? (
                            <EmptyState icon="mdi-clipboard-text-outline" title="No requests yet" text="Corrections you submit will show here with their status." />
                        ) : (
                            <ul className="rg-mine">
                                {mine.map((r) => (
                                    <li key={r._id} className="rg-item" style={{ '--c': statusMeta(r.status).color }}>
                                        <div className="rg-item-head"><b>{niceDate(r.attendanceDate)}</b><AttStatus status={r.status} /></div>
                                        <div className="rg-item-times">In <b>{r.requestedCheckIn || '—'}</b> · Out <b>{r.requestedCheckOut || '—'}</b></div>
                                        {r.reason && <p>{r.reason}</p>}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </section>
            </div>
        </PeopleShell>
    )
}
