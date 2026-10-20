import React, { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useForm } from 'react-hook-form'
import ticketActions from '../../../redux/ticket/Actions'
import { PeopleShell, EmptyState, ErrorBanner, fmtDate } from '../../../components/people/PeopleUI'
import { PRIORITY, PriorityTag } from '../../../components/projects/ProjectUI'
import {
    HELPDESK_ROOT, TICKET_CATEGORIES, TICKET_STATUS, TicketStatus, CategoryBadge, TicketTracker, ticketAge, ownerOf,
} from '../../../components/helpdesk/HelpdeskUI'
import '../../../components/attendance/attendance.css'

const BLANK = { subject: '', category: '', description: '', priority: 'Medium' }

// My tickets — only ever the signed-in person's own (managers' queue is /helpdesk/all).
export const TicketList = () => {
    const dispatch = useDispatch()
    const { list, listLoading, error } = useSelector((state) => state.ticketReducer || {})
    const { isAuthenticated: user } = useSelector((state) => state.authReducer || {})
    const { register, handleSubmit, reset, watch, formState: { errors } } = useForm({ defaultValues: BLANK })
    const [open, setOpen] = useState(false)
    const [statusFilter, setStatusFilter] = useState('')

    useEffect(() => {
        dispatch({ type: ticketActions.GET_TICKETS })
    }, [dispatch])

    const onSubmit = (data) => {
        dispatch({ type: ticketActions.ADD_TICKET, payload: { ...data, category: data.category || 'Other' } })
        reset(BLANK)
        setOpen(false)
    }

    const mine = useMemo(
        () => (list || []).filter((t) => !t.employeeId || ownerOf(t) === user?._id)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
        [list, user]
    )
    const counts = Object.fromEntries(Object.keys(TICKET_STATUS).map((s) => [s, mine.filter((t) => t.status === s).length]))
    const rows = statusFilter ? mine.filter((t) => t.status === statusFilter) : mine
    const description = watch('description') || ''

    return (
        <PeopleShell title="My tickets" root={HELPDESK_ROOT} crumbs={[{ label: 'My tickets' }]}
            actions={!open && <button type="button" className="pp-btn primary" onClick={() => setOpen(true)}><i className="mdi mdi-plus"></i> Raise a ticket</button>}>
            <ErrorBanner error={error} />

            <div className="at-tiles">
                {Object.entries(TICKET_STATUS).map(([s, m]) => (
                    <button key={s} type="button" className={`at-tile ${statusFilter === s ? 'active' : ''}`} style={{ '--c': m.color }} onClick={() => setStatusFilter(statusFilter === s ? '' : s)} aria-pressed={statusFilter === s}>
                        <span className="at-tile-icon"><i className={`mdi ${m.icon}`}></i></span>
                        <div><b>{counts[s]}</b><span>{s}</span></div>
                    </button>
                ))}
            </div>

            {open && (
                <form className="pp-card hd-panel" onSubmit={handleSubmit(onSubmit)} noValidate>
                    <div className="pp-card-head">
                        <h3><i className="mdi mdi-lifebuoy me-2" style={{ color: '#0284c7' }}></i>How can HR help?</h3>
                        <button type="button" className="pp-btn icon ghost" onClick={() => { reset(BLANK); setOpen(false) }} aria-label="Close"><i className="mdi mdi-close"></i></button>
                    </div>
                    <div className="pp-card-body">
                        <label className="pp-label">Topic</label>
                        <div className="hd-cats" role="radiogroup" aria-label="Category">
                            {TICKET_CATEGORIES.map((c) => (
                                <label key={c.value} style={{ '--c': c.color }}>
                                    <input type="radio" value={c.value} {...register('category')} />
                                    <span className="hd-cat-opt"><i className={`mdi ${c.icon}`}></i><span><b>{c.value}</b><small>{c.hint}</small></span></span>
                                </label>
                            ))}
                        </div>
                        <div className="hd-fields">
                            <div className="pp-field">
                                <label className="pp-label">Subject<span className="req">*</span></label>
                                <input type="text" placeholder="Short summary — e.g. Payslip for September missing" className={`pp-input ${errors.subject ? 'is-invalid' : ''}`} {...register('subject', { required: 'Add a short subject' })} />
                                {errors.subject && <div className="pp-err">{errors.subject.message}</div>}
                            </div>
                            <div className="pp-field">
                                <label className="pp-label">Priority</label>
                                <div className="hd-prio" role="radiogroup" aria-label="Priority">
                                    {['Low', 'Medium', 'High'].map((p) => (
                                        <label key={p} style={{ '--c': PRIORITY[p].color }}>
                                            <input type="radio" value={p} {...register('priority')} />
                                            <span><i className={`mdi ${PRIORITY[p].icon}`}></i>{p}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="pp-field">
                            <label className="pp-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Details<span className="req">*</span></span><small style={{ fontWeight: 400, color: 'var(--pp-muted)' }}>{description.length} characters</small>
                            </label>
                            <textarea rows={3} placeholder="What happened, and what do you need?" className={`pp-input ${errors.description ? 'is-invalid' : ''}`} {...register('description', { required: 'Describe the issue' })}></textarea>
                            {errors.description && <div className="pp-err">{errors.description.message}</div>}
                        </div>
                        <div className="pj-form-foot">
                            <button type="button" className="pp-btn" onClick={() => { reset(BLANK); setOpen(false) }}>Cancel</button>
                            <button type="submit" className="pp-btn primary"><i className="mdi mdi-send-outline"></i> Raise ticket</button>
                        </div>
                    </div>
                </form>
            )}

            <section className="pp-card">
                <div className="pp-card-head"><h3>{statusFilter ? `${statusFilter} tickets` : 'All my tickets'}</h3>{statusFilter ? <button type="button" className="pp-btn sm ghost" onClick={() => setStatusFilter('')}>Show all</button> : <small>{mine.length}</small>}</div>
                {listLoading && !mine.length ? (
                    <div className="pp-card-body">{[0, 1, 2].map((i) => <div key={i} className="pp-skel" style={{ height: 52, marginBottom: 12 }}></div>)}</div>
                ) : !rows.length ? (
                    <EmptyState icon="mdi-lifebuoy" title={mine.length ? 'Nothing here' : 'No tickets yet'}
                        text={mine.length ? 'No tickets with this status.' : 'Questions about pay, leave, IT or policy? Raise a ticket and HR will get back to you.'}
                        action={!mine.length && !open && <button type="button" className="pp-btn primary" onClick={() => setOpen(true)}><i className="mdi mdi-plus"></i> Raise a ticket</button>} />
                ) : rows.map((t) => {
                    const openish = ['Open', 'In Progress'].includes(t.status)
                    return (
                        <div key={t._id} className={`hd-row ${t.priority === 'High' && openish ? 'high' : ''}`}>
                            <CategoryBadge category={t.category} />
                            <div className="hd-main">
                                <div className="hd-subject">{t.subject}</div>
                                <div className="hd-desc">{t.description}</div>
                                <div className="hd-meta">
                                    <span>{t.category}</span>
                                    <PriorityTag priority={t.priority} />
                                    <span className="hd-age"><i className="mdi mdi-clock-outline"></i>{openish ? `open ${ticketAge(t.createdAt)}` : `raised ${fmtDate(t.createdAt)}`}</span>
                                    {t.resolvedAt && <span><i className="mdi mdi-check"></i> resolved {fmtDate(t.resolvedAt)}</span>}
                                </div>
                            </div>
                            <div className="hd-side">
                                <TicketStatus status={t.status} />
                                <TicketTracker status={t.status} />
                            </div>
                        </div>
                    )
                })}
            </section>
        </PeopleShell>
    )
}
