import React, { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link, useNavigate } from 'react-router-dom'
import auditActions from '../../../redux/audit/Actions'
import { PeopleShell, EmptyState, ErrorBanner } from '../../../components/people/PeopleUI'
import { CLIENTS_ROOT, fmtDuration, fmtHours, ActiveTimerBar } from '../../../components/audits/AuditUI'
import { ClientForm } from '../../../components/audits/ClientForm'
import '../../../components/attendance/attendance.css'
import '../projects/ProjectsList.css'
import { useAccess } from '../../../hooks/useAccess'

const SORTS = {
    name: { label: 'Name', fn: (a, b) => a.name.localeCompare(b.name) },
    open: { label: 'Most open audits', fn: (a, b) => b.stats.open - a.stats.open },
    hours: { label: 'Most hours', fn: (a, b) => b.stats.totalMinutes - a.stats.totalMinutes },
    recent: { label: 'Recently active', fn: (a, b) => new Date(b.stats.lastActivity || 0) - new Date(a.stats.lastActivity || 0) },
}

const initials = (name = '') => name.replace(/\b(pvt|ltd|private|limited|llp|and|&)\b/gi, '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'

export const ClientsList = () => {
    const dispatch = useDispatch()
    const navigate = useNavigate()
    const { clients, error } = useSelector((state) => state.auditReducer || {})
    const { can } = useAccess()
    const canManage = can(['Admin', 'HR', 'Manager', 'Team Lead'], 'projects')
    const [creating, setCreating] = useState(false)
    const [search, setSearch] = useState('')
    const [show, setShow] = useState('active')
    const [sort, setSort] = useState('name')

    useEffect(() => {
        dispatch({ type: auditActions.GET_AUDIT_CLIENTS })
        dispatch({ type: auditActions.GET_ACTIVE_AUDIT_TIMER })
    }, [dispatch])

    const all = useMemo(() => clients || [], [clients])
    const rows = useMemo(() => {
        const q = search.trim().toLowerCase()
        return all
            .filter((c) => show === 'all' || (show === 'active' ? c.status !== 'Inactive' : c.status === 'Inactive'))
            .filter((c) => !q || `${c.name} ${c.clientCode} ${c.city} ${c.contactPerson} ${c.gstin} ${c.pan} ${c.industry}`.toLowerCase().includes(q))
            .sort(SORTS[sort].fn)
    }, [all, search, show, sort])

    const openAudits = all.reduce((s, c) => s + c.stats.open, 0)
    const minutes = all.reduce((s, c) => s + c.stats.totalMinutes, 0)
    const working = all.reduce((s, c) => s + c.stats.activeNow, 0)

    return (
        <PeopleShell
            title="Clients"
            subtitle="Every client, their audit projects, and the hours your team has put in."
            root={CLIENTS_ROOT}
            crumbs={[{ label: 'All clients' }]}
            actions={<>
                <Link to="/audits" className="pp-btn"><i className="mdi mdi-briefcase-outline"></i> All audit projects</Link>
                {canManage && !creating && <button type="button" className="pp-btn primary" onClick={() => setCreating(true)}><i className="mdi mdi-plus"></i> New client</button>}
            </>}
        >
            <ErrorBanner error={error} />
            <ActiveTimerBar />

            <div className="at-tiles">
                <div className="at-tile" style={{ '--c': '#0b0f19' }}><span className="at-tile-icon"><i className="mdi mdi-domain"></i></span><div><b>{all.length}</b><span>Clients</span></div></div>
                <div className="at-tile" style={{ '--c': '#0284c7' }}><span className="at-tile-icon"><i className="mdi mdi-briefcase-search-outline"></i></span><div><b>{openAudits}</b><span>Open audit projects</span></div></div>
                <div className="at-tile" style={{ '--c': '#16a34a' }}><span className="at-tile-icon"><i className="mdi mdi-account-clock-outline"></i></span><div><b>{working}</b><span>Working right now</span></div></div>
                <div className="at-tile" style={{ '--c': '#7c3aed' }}><span className="at-tile-icon"><i className="mdi mdi-timer-outline"></i></span><div><b>{fmtHours(minutes)}h</b><span>Hours logged</span></div></div>
            </div>

            {canManage && creating && (
                <ClientForm onCancel={() => setCreating(false)} onDone={(c) => { setCreating(false); navigate(`/audits/clients/${c._id}`) }} />
            )}

            <div className="pl-toolbar">
                <div className="pp-search">
                    <i className="mdi mdi-magnify"></i>
                    <input type="search" className="pp-input" placeholder="Search name, code, city, GSTIN…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search clients" />
                </div>
                <div className="pj-filters">
                    {[['active', 'Active'], ['inactive', 'Inactive'], ['all', 'All']].map(([k, label]) => (
                        <button key={k} type="button" className={`pj-filter ${show === k ? 'active' : ''}`} style={{ '--c': '#0b0f19' }} onClick={() => setShow(k)}>{label}</button>
                    ))}
                </div>
                <div className="at-spacer"></div>
                <select className="pp-select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort clients">
                    {Object.entries(SORTS).map(([k, s]) => <option key={k} value={k}>Sort: {s.label}</option>)}
                </select>
            </div>

            {!rows.length ? (
                <div className="pp-card">
                    <EmptyState icon="mdi-domain" title={all.length ? 'No clients match' : 'No clients yet'}
                        text={all.length ? 'Try a different search or filter.' : canManage ? 'Add a client, then create audit projects for them.' : 'Clients you work for will show up here.'}
                        action={canManage && !all.length && <button type="button" className="pp-btn primary" onClick={() => setCreating(true)}><i className="mdi mdi-plus"></i> New client</button>} />
                </div>
            ) : (
                <div className="pl-grid">
                    {rows.map((c) => (
                        <article key={c._id} className={`pp-card pl-card cl-card ${c.status === 'Inactive' ? 'inactive' : ''}`} style={{ '--c': c.stats.open ? '#0284c7' : '#64748b' }}>
                            <div className="pl-top">
                                <span className="cl-mark" aria-hidden="true">{initials(c.name)}</span>
                                <div className="pl-titles">
                                    <span className="pl-code">{c.clientCode}</span>
                                    <h3 className="au-client"><Link to={`/audits/clients/${c._id}`}>{c.name}</Link></h3>
                                    <div className="au-meta">
                                        <span><i className="mdi mdi-office-building-outline"></i>{c.entityType}</span>
                                        {c.city && <span><i className="mdi mdi-map-marker-outline"></i>{c.city}</span>}
                                        {c.status === 'Inactive' && <span style={{ color: '#d97706', fontWeight: 700 }}>Inactive</span>}
                                    </div>
                                </div>
                                {c.stats.activeNow > 0 && <span className="au-working"><span className="au-pulse"></span>{c.stats.activeNow} working</span>}
                            </div>

                            <div className="cl-stats">
                                <div><b>{c.stats.open}</b><span>Open</span></div>
                                <div><b>{c.stats.engagements}</b><span>Projects</span></div>
                                <div><b>{c.stats.people}</b><span>People</span></div>
                                <div><b>{fmtDuration(c.stats.totalMinutes)}</b><span>Logged</span></div>
                            </div>

                            <div className="pl-foot">
                                {c.contactPerson
                                    ? <span className="pl-mgr"><i className="mdi mdi-account-tie-outline"></i><span><b>{c.contactPerson}</b>{c.phone ? ` · ${c.phone}` : ''}</span></span>
                                    : <span className="pp-muted-dash">No contact added</span>}
                                {c.stats.nextDeadline && (
                                    <span className="cl-next" title="Nearest deadline among open audit projects">
                                        <i className="mdi mdi-flag-outline"></i>{new Date(c.stats.nextDeadline).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                                    </span>
                                )}
                            </div>
                        </article>
                    ))}
                </div>
            )}
        </PeopleShell>
    )
}
