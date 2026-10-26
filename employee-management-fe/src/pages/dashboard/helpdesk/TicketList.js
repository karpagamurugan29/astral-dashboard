import React, { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PeopleShell, EmptyState, ErrorBanner } from '../../../components/people/PeopleUI'
import { HELPDESK_ROOT, TICKET_STATUS, useTicketMeta } from '../../../components/helpdesk/HelpdeskUI'
import { RaiseTicket } from '../../../components/helpdesk/RaiseTicket'
import { useTicketList, TicketTable, Pager } from './TicketTable'

// My tickets — only ever the signed-in person's own (the staff queue is /helpdesk/all).
const TILES = [
    ['active', 'Active', '#0284c7', 'mdi-progress-clock'],
    ['Pending Employee', 'Needs my reply', '#db2777', 'mdi-account-question-outline'],
    ['Resolved', 'Resolved', '#059669', 'mdi-check-circle-outline'],
    ['Closed', 'Closed', '#64748b', 'mdi-lock-outline'],
    ['', 'All tickets', '#0f172a', 'mdi-lifebuoy'],
]

export const TicketList = () => {
    const nav = useNavigate()
    const meta = useTicketMeta()
    const [status, setStatus] = useState('active')
    const [q, setQ] = useState('')
    const [category, setCategory] = useState('')
    const [priority, setPriority] = useState('')
    const [sort, setSort] = useState({ key: 'updated', dir: 'desc' })
    const [page, setPage] = useState(1)
    const [raising, setRaising] = useState(false)
    const filters = useMemo(() => ({ status, q: q.trim(), category, priority }), [status, q, category, priority])
    const { d, error } = useTicketList('mine', filters, sort, page)
    const counts = d?.counts || {}
    const all = Object.keys(TICKET_STATUS).reduce((n, s) => n + (counts[s] || 0), 0)
    const pick = (fn) => (v) => { fn(v); setPage(1) }

    return (
        <PeopleShell title="My tickets" root={HELPDESK_ROOT} crumbs={[{ label: 'My tickets' }]}
            actions={<>{meta?.me?.queue && <Link to="/helpdesk/all" className="pp-btn"><i className="mdi mdi-inbox-full-outline"></i>HR tickets</Link>}<button type="button" className="pp-btn primary" onClick={() => setRaising(true)}><i className="mdi mdi-plus"></i>Raise a ticket</button></>}>
            <ErrorBanner error={error} />
            <div className="hd-tiles">
                {TILES.map(([k, l, c, ic]) => (
                    <button key={l} type="button" className={`hd-tile ${status === k ? 'on' : ''} ${k === 'Pending Employee' && counts[k] ? 'alert' : ''}`} style={{ '--c': c }} onClick={() => pick(setStatus)(k)} aria-pressed={status === k}>
                        <i className={`mdi ${ic}`}></i><b>{d ? (k === 'active' ? counts.active : k ? counts[k] : all) || 0 : '–'}</b><small>{l}</small>
                    </button>
                ))}
            </div>

            <section className="pp-card hd-card">
                <div className="hd-tools">
                    <div className="pp-search"><i className="mdi mdi-magnify"></i><input type="search" className="pp-input" value={q} onChange={(e) => pick(setQ)(e.target.value)} placeholder="Search ticket ID or subject…" aria-label="Search" /></div>
                    <select className="pp-select" value={status} onChange={(e) => pick(setStatus)(e.target.value)} aria-label="Status"><option value="active">Active</option><option value="">Any status</option>{Object.keys(TICKET_STATUS).map((s) => <option key={s}>{s}</option>)}</select>
                    <select className="pp-select" value={category} onChange={(e) => pick(setCategory)(e.target.value)} aria-label="Category"><option value="">All categories</option>{(meta?.categories || []).map((c) => <option key={c.name}>{c.name}</option>)}</select>
                    <select className="pp-select" value={priority} onChange={(e) => pick(setPriority)(e.target.value)} aria-label="Priority"><option value="">Any priority</option>{(meta?.priorities || []).map((p) => <option key={p}>{p}</option>)}</select>
                    {d && <Pager page={d.page} pages={d.pages} total={d.total} limit={d.limit} onPage={setPage} />}
                </div>
                <TicketTable rows={d?.data || []} meta={meta} sort={sort} setSort={pick(setSort)} loading={!d}
                    empty={<EmptyState icon="mdi-lifebuoy" title={all ? 'Nothing here' : 'No tickets yet'} text={all ? 'No tickets match these filters.' : 'Questions about pay, leave, documents or access? Raise a ticket and HR will get back to you.'}
                        action={!all && <button type="button" className="pp-btn primary" onClick={() => setRaising(true)}><i className="mdi mdi-plus"></i>Raise a ticket</button>} />} />
            </section>
            {raising && <RaiseTicket meta={meta} onClose={() => setRaising(false)} onCreated={(t) => nav(`/helpdesk/t/${t._id}`)} />}
        </PeopleShell>
    )
}
