import React, { useEffect, useMemo } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import employeeActions from '../../../redux/employee/Actions'
import { PeopleShell, Avatar, EmptyState, ErrorBanner, ProgressRing, fullName, fmtDate } from '../../../components/people/PeopleUI'
import './Lifecycle.css'
import { useAccess } from '../../../hooks/useAccess'

const DAY = 24 * 60 * 60 * 1000

const daysSince = (date) => Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / DAY))

const progressOf = (emp) => {
    const tasks = emp.onboarding?.tasks || []
    const done = tasks.filter((t) => t.completed).length
    return { tasks, done, total: tasks.length, pct: tasks.length ? Math.round((done / tasks.length) * 100) : 0 }
}

export const EmployeeOnboarding = () => {
    const dispatch = useDispatch()
    const { onboardingList, error } = useSelector((state) => state.employeeReducer || {})
    const { can } = useAccess()
    const canManage = can(['Admin', 'HR'], 'employees')

    useEffect(() => {
        dispatch({ type: employeeActions.GET_ONBOARDING_LIST })
    }, [dispatch])

    const onToggleTask = (employeeId, taskIndex, completed) => {
        dispatch({ type: employeeActions.UPDATE_ONBOARDING_TASK, id: employeeId, taskIndex, completed })
    }

    // Least-progressed first, so whoever needs attention is at the top.
    const people = useMemo(
        () => [...(onboardingList || [])].sort((a, b) => progressOf(a).pct - progressOf(b).pct),
        [onboardingList]
    )

    const stats = useMemo(() => {
        const all = people.map(progressOf)
        return {
            count: people.length,
            avg: all.length ? Math.round(all.reduce((s, p) => s + p.pct, 0) / all.length) : 0,
            open: all.reduce((s, p) => s + (p.total - p.done), 0),
        }
    }, [people])

    return (
        <PeopleShell backTo="/employees"
            title="Onboarding"
            subtitle="Get new joiners set up and productive — track every step of their first weeks."
            crumbs={[{ label: 'Onboarding' }]}
            actions={canManage && <Link to="/employees/create" className="pp-btn primary"><i className="mdi mdi-account-plus-outline"></i> Add new joiner</Link>}
        >
            <ErrorBanner error={error} />

            {!canManage ? (
                <div className="pp-card"><EmptyState icon="mdi-lock-outline" title="You don't have access" text="Only Admin and HR can view onboarding." /></div>
            ) : !people.length ? (
                <div className="pp-card">
                    <EmptyState
                        icon="mdi-party-popper"
                        title="No one is onboarding right now"
                        text="When you add a new employee, their onboarding checklist will appear here."
                        action={<Link to="/employees/create" className="pp-btn primary"><i className="mdi mdi-plus"></i> Add new joiner</Link>}
                    />
                </div>
            ) : (
                <>
                    <div className="pp-card lc-strip">
                        <span><b>{stats.count}</b> onboarding</span>
                        <span><b>{stats.avg}%</b> average progress</span>
                        <span><b>{stats.open}</b> tasks left in total</span>
                    </div>

                    <div className="lc-grid">
                        {people.map((emp) => {
                            const { tasks, done, total, pct } = progressOf(emp)
                            const next = tasks.find((t) => !t.completed)
                            const day = daysSince(emp.joiningDate)
                            return (
                                <article className="pp-card lc-card" key={emp._id}>
                                    <div className="lc-head">
                                        <Avatar person={emp} size={46} />
                                        <div className="lc-who">
                                            <Link to={`/employees/${emp._id}`}>{fullName(emp)}</Link>
                                            <p>{[emp.designation, emp.department].filter(Boolean).join(' · ')}</p>
                                            <span className="lc-when" title={`Joined ${fmtDate(emp.joiningDate)}`}>
                                                <i className="mdi mdi-calendar-start"></i>{day === 0 ? 'Starts today' : `Day ${day + 1}`}
                                            </span>
                                        </div>
                                        <ProgressRing value={pct} color={pct === 100 ? '#10b981' : '#0ea5e9'} />
                                    </div>

                                    <div className="lc-body">
                                        {tasks.map((task, i) => (
                                            <label className="pp-check" key={i} style={{ '--tone': '#10b981' }}>
                                                <input type="checkbox" checked={task.completed} onChange={(e) => onToggleTask(emp._id, i, e.target.checked)} />
                                                <span className="pp-check-box"><i className="mdi mdi-check"></i></span>
                                                <span className="pp-check-text">{task.title}</span>
                                            </label>
                                        ))}
                                    </div>

                                    <div className="lc-foot">
                                        {next
                                            ? <span>Next up: <b>{next.title}</b></span>
                                            : <span className="lc-done"><i className="mdi mdi-check-circle"></i> All set — fully onboarded</span>}
                                        <span>{done}/{total}</span>
                                    </div>
                                </article>
                            )
                        })}
                    </div>
                </>
            )}
        </PeopleShell>
    )
}
