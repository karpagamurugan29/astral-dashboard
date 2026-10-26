import React, { useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import { PeopleShell, EmptyState, ErrorBanner } from '../../../components/people/PeopleUI'
import { toast } from '../../../components/common/Toaster'
import { api, HELPDESK_ROOT, TICKET_STATUS, useTicketMeta, fmtMins } from '../../../components/helpdesk/HelpdeskUI'
import { useTicketList, TicketTable, Pager } from './TicketTable'

/* HR tickets — the staff queue. HR / Admin see every ticket; managers and leads see the ones
   assigned to them plus their team's (not confidential categories). The server decides. */

const TILES = [
    ['unassigned', 'Unassigned', '#7c3aed', 'mdi-account-off-outline'],
    ['Open', 'Open', TICKET_STATUS.Open.color, TICKET_STATUS.Open.icon],
    ['Pending HR', 'Pending HR', TICKET_STATUS['Pending HR'].color, TICKET_STATUS['Pending HR'].icon],
    ['Pending Employee', 'With employee', TICKET_STATUS['Pending Employee'].color, TICKET_STATUS['Pending Employee'].icon],
    ['Escalated', 'Escalated', TICKET_STATUS.Escalated.color, TICKET_STATUS.Escalated.icon],
    ['overdue', 'Overdue', '#b91c1c', 'mdi-alarm-light-outline'],
    ['Resolved', 'Resolved', TICKET_STATUS.Resolved.color, TICKET_STATUS.Resolved.icon],
]
const BLANK = { status: 'active', q: '', category: '', priority: '', assignee: '', from: '', to: '', sla: '' }

export const HRTickets = () => {
    const meta = useTicketMeta()
    const { isAuthenticated: user } = useSelector((state) => state.authReducer || {})
    const [f, setF] = useState(BLANK)
    const [sort, setSort] = useState({ key: 'priority', dir: 'desc' })
    const [page, setPage] = useState(1)
    const filters = useMemo(() => ({ ...f, q: f.q.trim() }), [f])
    const { d, error, reload } = useTicketList('queue', meta?.me?.queue ? filters : null, sort, page)
    const set = (k) => (e) => { const v = e?.target ? e.target.value : e; setF((x) => ({ ...x, [k]: v })); setPage(1) }
    const counts = d?.counts || {}
    const tileOn = (k) => (k === 'unassigned' ? f.assignee === 'none' : k === 'overdue' ? f.sla === 'overdue' : f.status === k && !f.sla && f.assignee !== 'none')
    const tile = (k) => {
        if (tileOn(k)) { setF((x) => ({ ...x, status: 'active', assignee: '', sla: '' })); setPage(1); return }
        if (k === 'unassigned') setF((x) => ({ ...x, status: 'active', assignee: 'none', sla: '' }))
        else if (k === 'overdue') setF((x) => ({ ...x, status: 'active', sla: 'overdue', assignee: '' }))
        else setF((x) => ({ ...x, status: k, sla: '', assignee: '' }))
        setPage(1)
    }
    const assignMe = async (t) => {
        try { await api('PUT', `/tickets/${t._id}/assign`, { assignedTo: user?._id }); toast.success(`${t.ticketNo} is assigned to you.`); reload() } catch (e) { toast.error(e.message) }
    }
    const dirty = JSON.stringify(f) !== JSON.stringify(BLANK)

    if (meta && !meta.me.queue) {
        return (
            <PeopleShell title="HR tickets" root={HELPDESK_ROOT} crumbs={[{ label: 'HR tickets' }]} backTo="/helpdesk">
                <div className="pp-card"><EmptyState icon="mdi-lock-outline" title="You don't have access" text="Only HR, managers and admins can work the ticket queue." action={<Link to="/helpdesk" className="pp-btn">Go to my tickets</Link>} /></div>
            </PeopleShell>
        )
    }

    return (
        <PeopleShell title="HR tickets" root={HELPDESK_ROOT} crumbs={[{ label: 'HR tickets' }]} backTo="/helpdesk"
            actions={<>{meta?.me?.settings && <Link to="/helpdesk/settings" className="pp-btn"><i className="mdi mdi-cog-outline"></i>Settings</Link>}<Link to="/helpdesk" className="pp-btn"><i className="mdi mdi-account-outline"></i>My tickets</Link></>}>
            <ErrorBanner error={error} />
            <div className="hd-tiles queue">
                {TILES.map(([k, l, c, ic]) => (
                    <button key={k} type="button" className={`hd-tile ${tileOn(k) ? 'on' : ''} ${(k === 'overdue' || k === 'Escalated') && counts[k] ? 'alert' : ''}`} style={{ '--c': c }} onClick={() => tile(k)} aria-pressed={tileOn(k)}>
                        <i className={`mdi ${ic}`}></i><b>{d ? counts[k] || 0 : '–'}</b><small>{l}</small>
                    </button>
                ))}
            </div>
            {d?.stats && (
                <div className="hd-stats">
                    <span><i className="mdi mdi-reply-outline"></i>Avg first response <b>{fmtMins(d.stats.avgResponseMins)}</b></span>
                    <span><i className="mdi mdi-check-all"></i>Avg resolution <b>{fmtMins(d.stats.avgResolutionMins)}</b></span>
                    <span><i className="mdi mdi-check-decagram-outline"></i>Resolved within SLA <b>{d.stats.slaMet === null ? '—' : `${d.stats.slaMet}%`}</b></span>
                    <small>last 30 days · {counts.active || 0} active</small>
                </div>
            )}

            <section className="pp-card hd-card">
                <div className="hd-tools">
                    <div className="pp-search"><i className="mdi mdi-magnify"></i><input type="search" className="pp-input" value={f.q} onChange={set('q')} placeholder="Ticket ID, subject or employee…" aria-label="Search" /></div>
                    <select className="pp-select" value={f.status} onChange={set('status')} aria-label="Status"><option value="active">Active</option><option value="">Any status</option>{Object.keys(TICKET_STATUS).map((s) => <option key={s}>{s}</option>)}</select>
                    <select className="pp-select" value={f.priority} onChange={set('priority')} aria-label="Priority"><option value="">Any priority</option>{(meta?.priorities || []).map((p) => <option key={p}>{p}</option>)}</select>
                    <select className="pp-select" value={f.category} onChange={set('category')} aria-label="Category"><option value="">All categories</option>{(meta?.categories || []).map((c) => <option key={c.name}>{c.name}</option>)}</select>
                    <select className="pp-select" value={f.assignee} onChange={set('assignee')} aria-label="Assigned to">
                        <option value="">Anyone</option><option value="me">Assigned to me</option><option value="none">Unassigned</option>
                        {(meta?.agents || []).map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
                    </select>
                    <span className="hd-dates"><input type="date" className="pp-input" value={f.from} max={f.to || undefined} onChange={set('from')} aria-label="Created from" /><span>–</span><input type="date" className="pp-input" value={f.to} min={f.from || undefined} onChange={set('to')} aria-label="Created to" /></span>
                    {dirty && <button type="button" className="pp-btn sm" onClick={() => { setF(BLANK); setPage(1) }}><i className="mdi mdi-filter-remove-outline"></i>Clear</button>}
                    {d && <Pager page={d.page} pages={d.pages} total={d.total} limit={d.limit} onPage={setPage} />}
                </div>
                <TicketTable queue rows={d?.data || []} meta={meta} sort={sort} setSort={(s) => { setSort(s); setPage(1) }} loading={!d} onAssignMe={meta?.me?.desk ? assignMe : null}
                    empty={<EmptyState icon="mdi-check-all" title={f.status === 'active' && !dirty ? 'Queue is clear' : 'Nothing here'} text={f.status === 'active' && !dirty ? 'No active tickets right now.' : 'No tickets match these filters.'} />} />
            </section>
        </PeopleShell>
    )
}
