import React, { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link, useNavigate, useParams } from 'react-router-dom'
import auditActions from '../../../redux/audit/Actions'
import { PeopleShell, Avatar, EmptyState, ErrorBanner, fullName, fmtDate } from '../../../components/people/PeopleUI'
import { CLIENTS_ROOT, AUDIT_STATUS, CLOSED, fmtDuration, fmtHours, fmtDateTime, engagementTitle, ActiveTimerBar } from '../../../components/audits/AuditUI'
import { AuditCard } from '../../../components/audits/AuditCard'
import { ClientForm } from '../../../components/audits/ClientForm'
import '../../../components/attendance/attendance.css'
import '../projects/ProjectsList.css'
import '../projects/ProjectDetail.css'
import { useAccess } from '../../../hooks/useAccess'

export const ClientDetail = () => {
    const { id } = useParams()
    const dispatch = useDispatch()
    const navigate = useNavigate()
    const { clientDetail: client, error } = useSelector((state) => state.auditReducer || {})
    const { can } = useAccess()
    const canManage = can(['Admin', 'HR', 'Manager', 'Team Lead'], 'projects')
    const [tab, setTab] = useState('projects')
    const [editing, setEditing] = useState(false)
    const [statusFilter, setStatusFilter] = useState('')

    useEffect(() => {
        dispatch({ type: auditActions.GET_AUDIT_CLIENT_BY_ID, id })
        dispatch({ type: auditActions.GET_ACTIVE_AUDIT_TIMER })
        return () => dispatch({ type: auditActions.CLEAR_AUDIT_CLIENT_DETAIL })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id])

    const engagements = useMemo(() => client?.engagements || [], [client])
    const counts = useMemo(() => Object.fromEntries(Object.keys(AUDIT_STATUS).map((s) => [s, engagements.filter((e) => e.status === s).length])), [engagements])
    const shown = useMemo(() => engagements
        .filter((e) => !statusFilter || e.status === statusFilter)
        .slice()
        .sort((a, b) => Number(CLOSED.includes(a.status)) - Number(CLOSED.includes(b.status)) || new Date(a.endDate || 8.64e15) - new Date(b.endDate || 8.64e15)),
    [engagements, statusFilter])
    const people = useMemo(() => (client?.byEmployee || []).slice().sort((a, b) => b.totalMinutes - a.totalMinutes), [client])

    if (!client) {
        return (
            <PeopleShell title="Client" root={CLIENTS_ROOT} crumbs={[{ label: 'Client' }]} backTo="/audits/clients">
                <ErrorBanner error={error} />
                {!error && <div className="pp-card pp-card-body"><div className="pp-skel" style={{ height: 220 }}></div></div>}
            </PeopleShell>
        )
    }

    const open = engagements.filter((e) => !CLOSED.includes(e.status)).length
    const totalMinutes = client.timeSummary?.totalMinutes || 0
    const working = new Set(engagements.flatMap((e) => e.timeSummary?.activeNow || [])).size
    const maxMinutes = Math.max(1, ...people.map((p) => p.totalMinutes))

    const newProject = () => navigate('/audits', { state: { newForClient: client._id } })
    const onArchiveClient = () => {
        if (window.confirm(`Archive ${client.name}? It will be hidden from the client list. Its audit projects and hours stay on record.`)) {
            dispatch({ type: auditActions.DELETE_AUDIT_CLIENT, id: client._id, onDone: () => navigate('/audits/clients') })
        }
    }
    const onArchiveAudit = (a) => {
        if (window.confirm(`Archive "${engagementTitle(a)}" (${a.auditCode})? Logged hours are kept.`)) {
            dispatch({ type: auditActions.DELETE_AUDIT, id: a._id })
        }
    }

    const facts = [
        ['mdi-pound', 'Client code', client.clientCode],
        ['mdi-office-building-outline', 'Entity', client.entityType],
        ['mdi-factory', 'Industry', client.industry],
        ['mdi-card-account-details-outline', 'PAN', client.pan],
        ['mdi-receipt-text-outline', 'GSTIN', client.gstin],
        ['mdi-map-marker-outline', 'City', client.city],
    ].filter(([, , v]) => v)

    return (
        <PeopleShell
            title={client.name}
            root={CLIENTS_ROOT}
            crumbs={[{ label: 'All clients', to: '/audits/clients' }, { label: client.name }]}
            backTo="/audits/clients"
            actions={canManage && <>
                {!editing && <button type="button" className="pp-btn" onClick={() => setEditing(true)}><i className="mdi mdi-pencil-outline"></i> Edit</button>}
                <button type="button" className="pp-btn primary" onClick={newProject}><i className="mdi mdi-plus"></i> New audit project</button>
            </>}
        >
            <ErrorBanner error={error} />
            <ActiveTimerBar />

            {editing && <ClientForm client={client} onCancel={() => setEditing(false)} onDone={() => setEditing(false)} />}

            <section className="pp-card cl-head">
                <div className="cl-head-main">
                    <span className="pd-code">{client.clientCode}</span>
                    <h2>{client.name}{client.status === 'Inactive' && <span className="cl-inactive">Inactive</span>}</h2>
                    <div className="cl-facts">
                        {facts.map(([icon, label, value]) => <span key={label} title={label}><i className={`mdi ${icon}`}></i>{value}</span>)}
                    </div>
                    {client.address && <p className="cl-address"><i className="mdi mdi-home-city-outline"></i>{client.address}</p>}
                </div>
                <div className="cl-contact">
                    <small>Contact</small>
                    <b>{client.contactPerson || '—'}</b>
                    {client.phone && <a href={`tel:${client.phone.replace(/\s+/g, '')}`}><i className="mdi mdi-phone-outline"></i>{client.phone}</a>}
                    {client.email && <a href={`mailto:${client.email}`}><i className="mdi mdi-email-outline"></i>{client.email}</a>}
                </div>
            </section>

            <div className="at-tiles">
                <div className="at-tile" style={{ '--c': '#0284c7' }}><span className="at-tile-icon"><i className="mdi mdi-briefcase-search-outline"></i></span><div><b>{open}<small style={{ fontSize: 13, color: '#64748b' }}> / {engagements.length}</small></b><span>Open audit projects</span></div></div>
                <div className="at-tile" style={{ '--c': '#7c3aed' }}><span className="at-tile-icon"><i className="mdi mdi-timer-outline"></i></span><div><b>{fmtHours(totalMinutes)}h</b><span>Hours logged</span></div></div>
                <div className="at-tile" style={{ '--c': '#0b0f19' }}><span className="at-tile-icon"><i className="mdi mdi-account-group-outline"></i></span><div><b>{people.length}</b><span>People involved</span></div></div>
                <div className="at-tile" style={{ '--c': '#16a34a' }}><span className="at-tile-icon"><i className="mdi mdi-account-clock-outline"></i></span><div><b>{working}</b><span>Working right now</span></div></div>
            </div>

            <section className="pp-card">
                <div className="pd-tabs" role="tablist">
                    {[
                        { k: 'projects', label: 'Audit projects', icon: 'mdi-briefcase-outline', n: engagements.length },
                        { k: 'people', label: 'People & hours', icon: 'mdi-account-group-outline', n: people.length },
                        { k: 'notes', label: 'Notes', icon: 'mdi-note-text-outline' },
                    ].map((t) => (
                        <button key={t.k} type="button" role="tab" aria-selected={tab === t.k} className={`pd-tab ${tab === t.k ? 'active' : ''}`} onClick={() => setTab(t.k)}>
                            <i className={`mdi ${t.icon}`}></i>{t.label}{t.n !== undefined && <b>{t.n}</b>}
                        </button>
                    ))}
                </div>

                <div className="pd-panel">
                    {tab === 'projects' && (
                        <>
                            {engagements.length > 0 && (
                                <div className="pj-filters" style={{ marginBottom: 16 }}>
                                    <button type="button" className={`pj-filter ${!statusFilter ? 'active' : ''}`} style={{ '--c': '#0b0f19' }} onClick={() => setStatusFilter('')}>All <b>{engagements.length}</b></button>
                                    {Object.entries(AUDIT_STATUS).map(([s, m]) => counts[s] > 0 && (
                                        <button key={s} type="button" className={`pj-filter ${statusFilter === s ? 'active' : ''}`} style={{ '--c': m.color }} onClick={() => setStatusFilter(statusFilter === s ? '' : s)}>
                                            <i className={`mdi ${m.icon}`}></i>{s} <b>{counts[s]}</b>
                                        </button>
                                    ))}
                                </div>
                            )}
                            {!shown.length ? (
                                <EmptyState icon="mdi-briefcase-plus-outline" title={engagements.length ? 'No projects with this status' : 'No audit projects yet'}
                                    text={canManage ? 'Create an audit project for this client and assign its team.' : 'Projects you are assigned to will show up here.'}
                                    action={canManage && !engagements.length && <button type="button" className="pp-btn primary" onClick={newProject}><i className="mdi mdi-plus"></i> New audit project</button>} />
                            ) : (
                                <div className="pl-grid">
                                    {shown.map((a) => <AuditCard key={a._id} audit={a} showClient={false} canManage={canManage} onArchive={onArchiveAudit} />)}
                                </div>
                            )}
                        </>
                    )}

                    {tab === 'people' && (
                        !people.length ? <EmptyState icon="mdi-account-group-outline" title="Nobody assigned yet" text="People assigned to this client's audit projects appear here." /> : (
                            <div className="au-table-wrap">
                                <table className="au-table">
                                    <thead>
                                        <tr><th>Person</th><th className="num">Projects</th><th className="num">Days</th><th className="num">Sessions</th><th className="num">Hours</th><th>Share</th><th>Last activity</th></tr>
                                    </thead>
                                    <tbody>
                                        {people.map((r) => (
                                            <tr key={r.employee?._id}>
                                                <td>
                                                    <div className="au-person">
                                                        <Avatar person={r.employee} size={34} />
                                                        <div>
                                                            <Link to={`/employees/${r.employee?._id}`}>{fullName(r.employee)}</Link>
                                                            <small>{r.employee?.designation || ''}</small>
                                                        </div>
                                                        {r.running && <span className="au-live-tag" title="Timer running"><span className="au-pulse"></span></span>}
                                                    </div>
                                                </td>
                                                <td className="num">{r.engagements}</td>
                                                <td className="num"><b>{r.daysWorked}</b></td>
                                                <td className="num">{r.sessions}</td>
                                                <td className="num"><b>{fmtDuration(r.totalMinutes)}</b></td>
                                                <td>
                                                    <div className="au-share" style={{ '--c': '#0284c7' }}>
                                                        <div className="au-track"><span style={{ width: `${(r.totalMinutes / maxMinutes) * 100}%` }}></span></div>
                                                        <small>{totalMinutes ? Math.round((r.totalMinutes / totalMinutes) * 100) : 0}%</small>
                                                    </div>
                                                </td>
                                                <td>{r.sessions ? fmtDateTime(r.lastActivity) : '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )
                    )}

                    {tab === 'notes' && (
                        <>
                            <p style={{ whiteSpace: 'pre-wrap', margin: 0, color: client.notes ? undefined : '#94a3b8' }}>{client.notes || 'No notes for this client yet.'}</p>
                            <p className="pp-muted-dash" style={{ fontSize: 12, marginTop: 16 }}>Client since {fmtDate(client.createdAt)}</p>
                            {canManage && (
                                <button type="button" className="pp-btn sm" style={{ marginTop: 8, color: '#e11d48' }} onClick={onArchiveClient}>
                                    <i className="mdi mdi-archive-outline"></i> Archive client
                                </button>
                            )}
                        </>
                    )}
                </div>
            </section>
        </PeopleShell>
    )
}
