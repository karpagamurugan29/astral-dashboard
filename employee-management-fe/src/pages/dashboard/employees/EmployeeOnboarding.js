import React, { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import employeeActions from '../../../redux/employee/Actions'
import { PeopleShell, Avatar, EmptyState, ErrorBanner, fullName, fmtDate } from '../../../components/people/PeopleUI'
import './Lifecycle.css'
import { useAccess } from '../../../hooks/useAccess'
import { toast } from '../../../components/common/Toaster'
import { confirmAction } from '../../../components/common/ConfirmDialog'

const DAY = 24 * 60 * 60 * 1000
const daysSince = (date) => Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / DAY))

// How each checklist step looks and what button helps finish it. `auto` steps tick themselves
// on the server when the real thing happens (document uploaded, asset assigned, first sign-in).
const STEP_UI = {
    welcome: { icon: 'mdi-email-send-outline', label: 'Welcome' },
    documents: { icon: 'mdi-card-account-details-outline', label: 'Documents', auto: true },
    access: { icon: 'mdi-login-variant', label: 'Sign-in', auto: true },
    asset: { icon: 'mdi-laptop', label: 'Laptop', auto: true },
    orientation: { icon: 'mdi-account-voice', label: 'Orientation' },
    policy: { icon: 'mdi-file-document-edit-outline', label: 'Policies' },
    other: { icon: 'mdi-checkbox-marked-circle-outline', label: 'Task' },
}

const progressOf = (emp) => {
    const tasks = emp.onboarding?.tasks || []
    const done = tasks.filter((t) => t.completed).length
    return { tasks, done, total: tasks.length, pct: tasks.length ? Math.round((done / tasks.length) * 100) : 0, next: tasks.findIndex((t) => !t.completed) }
}

export const EmployeeOnboarding = () => {
    const dispatch = useDispatch()
    const { onboardingList, error } = useSelector((state) => state.employeeReducer || {})
    const { can } = useAccess()
    const canManage = can(['Admin', 'HR'], 'employees')
    const [open, setOpen] = useState(null)
    const [q, setQ] = useState('')
    const [busy, setBusy] = useState({})        // key → true while a request runs
    const [selected, setSelected] = useState({})

    useEffect(() => { dispatch({ type: employeeActions.GET_ONBOARDING_LIST }) }, [dispatch])

    const say = (key) => (ok, text) => { setBusy((b) => ({ ...b, [key]: false })); toast[ok ? 'success' : 'error'](text) }
    const toggle = (emp, i, completed) => dispatch({ type: employeeActions.UPDATE_ONBOARDING_TASK, id: emp._id, taskIndex: i, completed })
    const welcome = (emp) => { setBusy((b) => ({ ...b, [`w${emp._id}`]: true })); dispatch({ type: employeeActions.SEND_ONBOARDING_WELCOME, id: emp._id, onDone: say(`w${emp._id}`) }) }
    const close = async (ids) => {
        if (!(await confirmAction({ title: ids.length === 1 ? 'Mark as already onboarded?' : `Mark ${ids.length} people as already onboarded?`, message: 'They will leave this list.', confirmLabel: 'Mark onboarded', tone: 'primary' }))) return
        setBusy((b) => ({ ...b, close: true }))
        dispatch({ type: employeeActions.CLOSE_ONBOARDING, ids, onDone: (ok, text) => { say('close')(ok, text); if (ok) setSelected({}) } })
    }

    const people = useMemo(() => {
        const needle = q.trim().toLowerCase()
        return [...(onboardingList || [])]
            .filter((e) => !needle || [e.firstName, e.lastName, e.employeeId, e.designation, e.department].some((v) => String(v || '').toLowerCase().includes(needle)))
            .sort((a, b) => (a.existingStaff - b.existingStaff) || progressOf(a).pct - progressOf(b).pct || new Date(b.joiningDate) - new Date(a.joiningDate))
    }, [onboardingList, q])
    const existing = (onboardingList || []).filter((e) => e.existingStaff)
    const openTasks = (onboardingList || []).reduce((s, e) => s + (progressOf(e).total - progressOf(e).done), 0)
    const picked = Object.keys(selected).filter((k) => selected[k])

    // The one button that moves this person forward on a given step.
    const actionFor = (emp, task, i) => {
        const id = emp._id
        switch (task.key) {
            case 'welcome':
                return <button type="button" className="pp-btn primary sm" disabled={busy[`w${id}`]} onClick={() => welcome(emp)}><i className="mdi mdi-send-outline"></i>{busy[`w${id}`] ? 'Sending…' : 'Send welcome'}</button>
            case 'documents':
                return <Link to={`/employees/${id}?tab=documents`} className="pp-btn sm"><i className="mdi mdi-upload"></i>Upload documents</Link>
            case 'asset':
                return <Link to="/assets" className="pp-btn sm"><i className="mdi mdi-laptop"></i>Assign asset</Link>
            case 'access':
                return <span className="ob-wait"><i className="mdi mdi-timer-sand"></i>Waiting for first sign-in</span>
            default:
                return <button type="button" className="pp-btn sm" onClick={() => toggle(emp, i, true)}><i className="mdi mdi-check"></i>Mark done</button>
        }
    }

    return (
        <PeopleShell backTo="/employees"
            title="Onboarding"
            crumbs={[{ label: 'Onboarding' }]}
            actions={canManage && <Link to="/employees/create" className="pp-btn primary"><i className="mdi mdi-account-plus-outline"></i> Add new joiner</Link>}
        >
            <ErrorBanner error={error} />

            {!canManage ? (
                <div className="pp-card"><EmptyState icon="mdi-lock-outline" title="You don't have access" text="Only Admin and HR can view onboarding." /></div>
            ) : (
                <>
                    {/* what this screen is for, in one glance */}
                    <section className="pp-card ob-intro">
                        <div className="ob-intro-text">
                            <h3>Get every new joiner ready in their first week</h3>
                            <p>Each new employee gets these steps when you add them. Steps marked <span className="ob-auto"><i className="mdi mdi-lightning-bolt"></i>auto</span> tick themselves when the real thing happens — you only press the rest.</p>
                        </div>
                        <ol className="ob-steps-legend">
                            {['welcome', 'documents', 'access', 'asset', 'orientation', 'policy'].map((k, i) => (
                                <li key={k}><span className="ob-dot"><i className={`mdi ${STEP_UI[k].icon}`}></i></span><b>{i + 1}. {STEP_UI[k].label}</b>{STEP_UI[k].auto && <span className="ob-auto" title="Ticks itself"><i className="mdi mdi-lightning-bolt"></i>auto</span>}</li>
                            ))}
                        </ol>
                    </section>

                    {existing.length > 0 && (
                        <div className="ob-banner">
                            <i className="mdi mdi-account-clock-outline"></i>
                            <div><b>{existing.length} {existing.length === 1 ? 'person was' : 'people were'} added long after joining</b> — they're probably existing staff, not new joiners.</div>
                            <button type="button" className="pp-btn sm" disabled={busy.close} onClick={() => close(existing.map((e) => e._id))}>Mark as already onboarded</button>
                        </div>
                    )}

                    {!onboardingList?.length ? (
                        <div className="pp-card">
                            <EmptyState icon="mdi-party-popper" title="Everyone is onboarded"
                                text="When you add a new employee, their first-week steps appear here."
                                action={<Link to="/employees/create" className="pp-btn primary"><i className="mdi mdi-plus"></i> Add new joiner</Link>} />
                        </div>
                    ) : (
                        <section className="pp-card">
                            <div className="ob-toolbar">
                                <span className="ob-count"><b>{onboardingList.length}</b> onboarding · <b>{openTasks}</b> steps left</span>
                                <input className="pp-input ob-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or employee ID…" />
                                {picked.length > 0 && <button type="button" className="pp-btn sm" disabled={busy.close} onClick={() => close(picked)}><i className="mdi mdi-check-all"></i>Already onboarded ({picked.length})</button>}
                            </div>

                            <ul className="ob-list">
                                {people.map((emp) => {
                                    const { tasks, done, total, pct, next } = progressOf(emp)
                                    const isOpen = open === emp._id
                                    const day = daysSince(emp.joiningDate)
                                    const nextTask = next >= 0 ? tasks[next] : null
                                    return (
                                        <li key={emp._id} className={`ob-person ${isOpen ? 'open' : ''}`}>
                                            <div className="ob-row">
                                                <input type="checkbox" className="ob-pick" aria-label={`Select ${fullName(emp)}`} checked={!!selected[emp._id]} onChange={(e) => setSelected((s) => ({ ...s, [emp._id]: e.target.checked }))} />
                                                <button type="button" className="ob-row-main" onClick={() => setOpen(isOpen ? null : emp._id)} aria-expanded={isOpen}>
                                                    <Avatar person={emp} size={40} />
                                                    <span className="ob-who">
                                                        <b>{fullName(emp)}</b>
                                                        <small>{emp.employeeId} · {[emp.designation, emp.department].filter(Boolean).join(' · ')}</small>
                                                        <span className="ob-tags">
                                                            <span className="ob-day" title={`Joined ${fmtDate(emp.joiningDate)}`}>{emp.existingStaff ? `Joined ${fmtDate(emp.joiningDate)}` : day === 0 ? 'Starts today' : `Day ${day + 1}`}</span>
                                                            {emp.existingStaff && <span className="ob-old">Existing staff?</span>}
                                                        </span>
                                                    </span>
                                                    <span className="ob-progress" aria-label={`${done} of ${total} steps done`}>
                                                        <span className="ob-segs">{tasks.map((t, i) => <i key={i} className={t.completed ? 'on' : ''} title={t.title}></i>)}</span>
                                                        <small>{pct === 100 ? 'All done' : nextTask ? <>Next: <b>{STEP_UI[nextTask.key]?.label || nextTask.title}</b></> : ''} · {done}/{total}</small>
                                                    </span>
                                                    <i className={`mdi ${isOpen ? 'mdi-chevron-up' : 'mdi-chevron-down'} ob-chev`}></i>
                                                </button>
                                            </div>

                                            {isOpen && (
                                                <div className="ob-detail">
                                                    <ol className="ob-tasks">
                                                        {tasks.map((t, i) => {
                                                            const ui = STEP_UI[t.key] || STEP_UI.other
                                                            return (
                                                                <li key={i} className={t.completed ? 'done' : i === next ? 'next' : ''}>
                                                                    <span className="ob-dot"><i className={`mdi ${t.completed ? 'mdi-check' : ui.icon}`}></i></span>
                                                                    <div className="ob-task-main">
                                                                        <b>{t.title}{ui.auto && <span className="ob-auto"><i className="mdi mdi-lightning-bolt"></i>auto</span>}</b>
                                                                        <small>{t.completed ? `Done ${fmtDate(t.completedAt)}${t.auto ? ' · ticked automatically' : ''}` : t.hint}</small>
                                                                    </div>
                                                                    <div className="ob-task-act">
                                                                        {t.completed
                                                                            ? <button type="button" className="ob-undo" onClick={() => toggle(emp, i, false)}>Undo</button>
                                                                            : actionFor(emp, t, i)}
                                                                    </div>
                                                                </li>
                                                            )
                                                        })}
                                                    </ol>
                                                    <div className="ob-detail-foot">
                                                        <Link to={`/employees/${emp._id}`} className="ob-link"><i className="mdi mdi-account-outline"></i>Open profile</Link>
                                                        {emp.manager?.firstName && <span className="ob-muted">Manager: {fullName(emp.manager)}</span>}
                                                        <button type="button" className="ob-link" onClick={() => close([emp._id])}><i className="mdi mdi-check-all"></i>Already onboarded — remove from list</button>
                                                    </div>
                                                </div>
                                            )}
                                        </li>
                                    )
                                })}
                            </ul>
                            {!people.length && <EmptyState icon="mdi-account-search-outline" title="No match" text="Try a different name or ID." />}
                        </section>
                    )}
                </>
            )}
        </PeopleShell>
    )
}
