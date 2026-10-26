import React, { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import employeeActions from '../../../redux/employee/Actions'
import { PeopleShell, Avatar, EmptyState, ErrorBanner, ProgressRing, fullName, fmtDate } from '../../../components/people/PeopleUI'
import './Lifecycle.css'
import { useAccess } from '../../../hooks/useAccess'
import { FormModal } from '../../../components/common/FormModal'
import { confirmAction } from '../../../components/common/ConfirmDialog'

const DAY = 24 * 60 * 60 * 1000

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime() }

// Countdown chip: urgent (red) inside a week, amber inside a month, otherwise neutral.
const exitInfo = (exitDate) => {
    if (!exitDate) return { text: 'No exit date', tone: '#64748b' }
    const days = Math.round((startOfDay(exitDate) - startOfDay(Date.now())) / DAY)
    if (days < 0) return { text: `Left ${-days} day${days === -1 ? '' : 's'} ago`, tone: '#64748b' }
    if (days === 0) return { text: 'Last day today', tone: '#e11d48' }
    if (days <= 7) return { text: `Leaves in ${days} day${days === 1 ? '' : 's'}`, tone: '#e11d48' }
    if (days <= 30) return { text: `Leaves in ${days} days`, tone: '#d97706' }
    return { text: `Leaves ${fmtDate(exitDate)}`, tone: '#0369a1' }
}

const progressOf = (emp) => {
    const tasks = emp.offboarding?.tasks || []
    const done = tasks.filter((t) => t.completed).length
    return { tasks, done, total: tasks.length, pct: tasks.length ? Math.round((done / tasks.length) * 100) : 0 }
}

export const EmployeeOffboarding = () => {
    const dispatch = useDispatch()
    const { offboardingList, list: employees, error } = useSelector((state) => state.employeeReducer || {})
    const { can } = useAccess()
    const canManage = can(['Admin', 'HR'], 'employees')
    const [starting, setStarting] = useState(false)
    const { register, handleSubmit, reset, formState: { errors } } = useForm()

    useEffect(() => {
        dispatch({ type: employeeActions.GET_OFFBOARDING_LIST })
        dispatch({ type: employeeActions.GET_EMPLOYEES })
    }, [dispatch])

    const onStart = (data) => {
        dispatch({ type: employeeActions.INITIATE_OFFBOARDING, id: data.employeeId, payload: { exitDate: data.exitDate, reason: data.reason } })
        reset({ employeeId: '', exitDate: '', reason: '' })
        setStarting(false)
    }

    const openStart = () => { reset({ employeeId: '', exitDate: '', reason: '' }); setStarting(true) }
    const onCancelStart = () => {
        reset({ employeeId: '', exitDate: '', reason: '' })
        setStarting(false)
    }

    const onToggleTask = (employeeId, taskIndex, completed) => {
        dispatch({ type: employeeActions.UPDATE_OFFBOARDING_TASK, id: employeeId, taskIndex, completed })
    }

    const onComplete = async (employeeId, name) => {
        if (await confirmAction({ title: `Complete ${name}'s offboarding?`, message: 'Their status will be set to Resigned and their access ends.', confirmLabel: 'Complete offboarding', tone: 'warn' })) {
            dispatch({ type: employeeActions.COMPLETE_OFFBOARDING, id: employeeId })
        }
    }

    const activeEmployees = employees?.filter((e) => e.status === 'Active' && !offboardingList?.some((o) => o._id === e._id))

    // Soonest exit first.
    const people = useMemo(
        () => [...(offboardingList || [])].sort((a, b) =>
            new Date(a.offboarding?.exitDate || 8.64e15) - new Date(b.offboarding?.exitDate || 8.64e15)),
        [offboardingList]
    )

    const stats = useMemo(() => ({
        count: people.length,
        thisWeek: people.filter((p) => {
            const d = p.offboarding?.exitDate
            return d && startOfDay(d) - startOfDay(Date.now()) <= 7 * DAY
        }).length,
        ready: people.filter((p) => { const pr = progressOf(p); return pr.total && pr.done === pr.total }).length,
    }), [people])

    return (
        <PeopleShell backTo="/employees"
            title="Offboarding"
            subtitle="Handle exits smoothly — handovers, asset returns and final settlement in one checklist."
            crumbs={[{ label: 'Offboarding' }]}
            actions={canManage && !starting && (
                <button type="button" className="pp-btn primary" onClick={openStart}>
                    <i className="mdi mdi-account-arrow-right-outline"></i> Start offboarding
                </button>
            )}
        >
            <ErrorBanner error={error} />

            {!canManage ? (
                <div className="pp-card"><EmptyState icon="mdi-lock-outline" title="You don't have access" text="Only Admin and HR can manage offboarding." /></div>
            ) : (
                <>
                    {starting && (
                        <FormModal icon="mdi-plus-circle-outline" title={"Start offboarding"} onClose={onCancelStart} onSubmit={handleSubmit(onStart)} submitLabel={"Start offboarding"} submitIcon="mdi-check">
                            <div className="pp-card-body">
                                <div className="lc-start-note">
                                    <i className="mdi mdi-information-outline"></i>
                                    <span>This creates an exit checklist. Their account stays active until you mark the offboarding complete.</span>
                                </div>
                                <div className="lc-start-fields">
                                    <div className="pp-field">
                                        <label className="pp-label">Employee<span className="req">*</span></label>
                                        <select className={`pp-select ${errors.employeeId ? 'is-invalid' : ''}`} {...register('employeeId', { required: 'Choose who is leaving' })}>
                                            <option value="">Select employee</option>
                                            {activeEmployees?.map((e) => <option key={e._id} value={e._id}>{fullName(e)}{e.designation ? ` — ${e.designation}` : ''}</option>)}
                                        </select>
                                        {errors.employeeId && <div className="pp-err">{errors.employeeId.message}</div>}
                                    </div>
                                    <div className="pp-field">
                                        <label className="pp-label">Last working day<span className="req">*</span></label>
                                        <input type="date" className={`pp-input ${errors.exitDate ? 'is-invalid' : ''}`} {...register('exitDate', { required: 'Pick their last day' })} />
                                        {errors.exitDate && <div className="pp-err">{errors.exitDate.message}</div>}
                                    </div>
                                    <div className="pp-field">
                                        <label className="pp-label">Reason</label>
                                        <input type="text" placeholder="e.g. Resignation — moving cities" className="pp-input" {...register('reason')} />
                                    </div>
                                </div>
                            </div>
                        </FormModal>
                    )}

                    {!people.length ? (
                        <div className="pp-card">
                            <EmptyState
                                icon="mdi-door-open"
                                title="No exits in progress"
                                text="When someone is leaving, start their offboarding to track handover and clearance."
                                action={!starting && <button type="button" className="pp-btn" onClick={openStart}>Start offboarding</button>}
                            />
                        </div>
                    ) : (
                        <>
                            <div className="pp-card lc-strip">
                                <span><b>{stats.count}</b> in progress</span>
                                <span><b>{stats.thisWeek}</b> leaving within 7 days</span>
                                <span><b>{stats.ready}</b> ready to complete</span>
                            </div>

                            <div className="lc-grid">
                                {people.map((emp) => {
                                    const { tasks, done, total, pct } = progressOf(emp)
                                    const exit = exitInfo(emp.offboarding?.exitDate)
                                    const ready = total > 0 && done === total
                                    return (
                                        <article className="pp-card lc-card" key={emp._id}>
                                            <div className="lc-head">
                                                <Avatar person={emp} size={46} />
                                                <div className="lc-who">
                                                    <Link to={`/employees/${emp._id}`}>{fullName(emp)}</Link>
                                                    <p>{[emp.designation, emp.department].filter(Boolean).join(' · ')}</p>
                                                    <span className="lc-when" style={{ '--t': exit.tone }} title={`Last day ${fmtDate(emp.offboarding?.exitDate)}`}>
                                                        <i className="mdi mdi-calendar-end"></i>{exit.text}
                                                    </span>
                                                </div>
                                                <ProgressRing value={pct} color={ready ? '#10b981' : '#0b0f19'} />
                                            </div>

                                            {emp.offboarding?.reason && (
                                                <div className="lc-reason"><b>Reason:</b> {emp.offboarding.reason}</div>
                                            )}

                                            <div className="lc-body">
                                                {tasks.map((task, i) => (
                                                    <label className="pp-check" key={i} style={{ '--tone': '#0b0f19' }}>
                                                        <input type="checkbox" checked={task.completed} onChange={(e) => onToggleTask(emp._id, i, e.target.checked)} />
                                                        <span className="pp-check-box"><i className="mdi mdi-check"></i></span>
                                                        <span className="pp-check-text">{task.title}</span>
                                                    </label>
                                                ))}
                                            </div>

                                            <div className="lc-foot">
                                                <span>{ready ? <b>All clearance done</b> : <><b>{total - done}</b> step{total - done === 1 ? '' : 's'} left</>}</span>
                                                <button
                                                    type="button"
                                                    className={`pp-btn sm ${ready ? 'danger solid' : ''}`}
                                                    disabled={!ready}
                                                    title={ready ? '' : 'Finish every checklist step first'}
                                                    onClick={() => onComplete(emp._id, fullName(emp))}
                                                >
                                                    Complete offboarding
                                                </button>
                                            </div>
                                        </article>
                                    )
                                })}
                            </div>
                        </>
                    )}
                </>
            )}
        </PeopleShell>
    )
}
