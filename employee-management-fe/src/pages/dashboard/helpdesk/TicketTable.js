import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar, EmptyState, fullName } from '../../../components/people/PeopleUI'
import { api, StatusPill, PriorityPill, CategoryIcon, SlaBadge, Pager, Th, ago } from '../../../components/helpdesk/HelpdeskUI'

/* The ticket list behind My tickets and HR tickets: server-side filters, sorting and paging. */

export const useTicketList = (view, filters, sort, page) => {
    const [d, setD] = useState(null)
    const [error, setError] = useState('')
    const load = useCallback(() => {
        if (!filters) return Promise.resolve()
        const qs = new URLSearchParams({ view, sort: sort.key, dir: sort.dir, page, limit: 15 })
        Object.entries(filters).forEach(([k, v]) => { if (v) qs.set(k, v) })
        return api('GET', `/tickets?${qs}`).then((j) => { setD(j); setError('') }).catch((e) => setError(e.message))
    }, [view, filters, sort, page])
    // a short pause so typing in search doesn't fire a request per key
    useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t) }, [load])
    return { d, error, reload: load }
}

const shortDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '—')

export const TicketTable = ({ rows, meta, queue, sort, setSort, loading, empty, onAssignMe }) => {
    const nav = useNavigate()
    if (loading) return <div className="hd-loading">{[0, 1, 2, 3].map((i) => <div key={i} className="pp-skel"></div>)}</div>
    if (!rows.length) return empty || <EmptyState icon="mdi-lifebuoy" title="No tickets" text="Nothing matches these filters." />
    const open = (t) => nav(`/helpdesk/t/${t._id}`)
    return (
        <div className="hd-tablewrap">
            <table className={`hd-table ${queue ? 'queue' : ''}`}>
                <thead><tr>
                    <Th k="ticketNo" label="Ticket" sort={sort} setSort={setSort} />
                    {queue && <th>Employee</th>}
                    <th>Subject</th>
                    <Th k="priority" label="Priority" sort={sort} setSort={setSort} />
                    {queue ? <Th k="due" label="Status" title="Status and SLA — sorts by due time" sort={sort} setSort={setSort} /> : <Th k="status" label="Status" sort={sort} setSort={setSort} />}
                    <th>Assigned to</th>
                    {queue ? <Th k="updated" label="Created" title="Created date, and last update — sorts by last update" sort={sort} setSort={setSort} /> : <>
                        <Th k="createdAt" label="Created" sort={sort} setSort={setSort} />
                        <Th k="updated" label="Updated" sort={sort} setSort={setSort} />
                    </>}
                    {!queue && <th className="act"><span className="visually-hidden">Open</span></th>}
                </tr></thead>
                <tbody>{rows.map((t) => (
                    <tr key={t._id} onClick={() => open(t)} className={`${t.sla?.state === 'overdue' ? 'overdue' : ''} ${t.status === 'Pending Employee' && !queue ? 'needs-me' : ''}`} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && open(t)}>
                        <td className="no"><b>{t.ticketNo}</b>{t.escalationLevel > 0 && <i className="mdi mdi-arrow-up-bold-circle hd-esc" title="Escalated"></i>}</td>
                        {queue && <td className="who"><span><Avatar person={t.employeeId} size={26} /><span><b>{fullName(t.employeeId)}</b><small>{t.employeeId?.employeeId}</small></span></span></td>}
                        <td className="subj"><span><CategoryIcon meta={meta} name={t.category} size={28} /><span><b>{t.subject}</b><small>{t.category}{t.confidential && <i className="mdi mdi-shield-lock-outline" title="Confidential"></i>}{t.replies > 0 && <em><i className="mdi mdi-comment-outline"></i>{t.replies}</em>}{t.attachmentCount > 0 && <em><i className="mdi mdi-paperclip"></i>{t.attachmentCount}</em>}</small></span></span></td>
                        <td><PriorityPill priority={t.priority} /></td>
                        <td className={queue ? 'st' : ''}><StatusPill status={t.status} small />{queue && t.sla?.state !== 'none' && <SlaBadge sla={t.sla} compact />}</td>
                        <td className="asg">{t.assignedTo ? <span title={fullName(t.assignedTo)}><Avatar person={t.assignedTo} size={22} />{t.assignedTo.firstName} {(t.assignedTo.lastName || '').slice(0, 1)}</span> : queue && onAssignMe ? <button type="button" className="hd-link" onClick={(e) => { e.stopPropagation(); onAssignMe(t) }}>Take it</button> : <span className="hd-muted">Unassigned</span>}</td>
                        {queue ? (
                            <td className="dt two" title={`Created ${new Date(t.createdAt).toLocaleString()} · updated ${new Date(t.lastActivityAt).toLocaleString()}`}><span>{shortDate(t.createdAt)}</span><small>{ago(t.lastActivityAt)}</small></td>
                        ) : <>
                            <td className="dt" title={new Date(t.createdAt).toLocaleString()}>{shortDate(t.createdAt)}</td>
                            <td className="dt" title={new Date(t.lastActivityAt).toLocaleString()}>{ago(t.lastActivityAt)}</td>
                        </>}
                        {!queue && <td className="act"><i className="mdi mdi-chevron-right"></i></td>}
                    </tr>
                ))}</tbody>
            </table>
        </div>
    )
}

export { Pager }
