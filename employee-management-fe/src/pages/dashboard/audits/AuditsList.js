import { chatApi } from '../../../components/chat/chatApi'
import React, { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import auditActions from '../../../redux/audit/Actions'
import employeeActions from '../../../redux/employee/Actions'
import { PeopleShell, EmptyState, ErrorBanner, fullName } from '../../../components/people/PeopleUI'
import { CURRENCY } from '../../../components/payroll/PayrollUI'
import { PRIORITY, PeoplePicker, startOfDay } from '../../../components/projects/ProjectUI'
import {
    AUDITS_ROOT, AUDIT_STATUS, AUDIT_TYPES, CLOSED, currentFY, fmtHours, ActiveTimerBar, engagementTitle, clientIdOf,
} from '../../../components/audits/AuditUI'
import { AuditCard, isOnAudit } from '../../../components/audits/AuditCard'
import { ClientForm } from '../../../components/audits/ClientForm'
import { FormModal } from '../../../components/common/FormModal'
import '../../../components/attendance/attendance.css'
import '../projects/ProjectsList.css'
import { useAccess } from '../../../hooks/useAccess'
import { confirmAction } from '../../../components/common/ConfirmDialog'

const FORMER = ['Resigned', 'Terminated']
const BLANK = { clientId: '', projectId: '', workflowTemplateId: '', engagementName: '', auditCode: '', auditType: 'Statutory', financialYear: currentFY(), auditManager: '', priority: 'Medium', startDate: '', endDate: '', estimatedHours: '', fee: '', description: '' }

const SORTS = {
    deadline: { label: 'Deadline', fn: (a, b) => new Date(a.endDate || 8.64e15) - new Date(b.endDate || 8.64e15) },
    client: { label: 'Client', fn: (a, b) => a.clientName.localeCompare(b.clientName) || engagementTitle(a).localeCompare(engagementTitle(b)) },
    hours: { label: 'Most hours', fn: (a, b) => (b.timeSummary?.totalMinutes || 0) - (a.timeSummary?.totalMinutes || 0) },
    recent: { label: 'Newest', fn: (a, b) => new Date(b.createdAt) - new Date(a.createdAt) },
}

export const AuditsList = () => {
    const dispatch = useDispatch()
    const location = useLocation()
    const navigate = useNavigate()
    const { list, clients, error } = useSelector((state) => state.auditReducer || {})
    const { list: employees } = useSelector((state) => state.employeeReducer || {})
    const { isAuthenticated: user } = useSelector((state) => state.authReducer || {})
    const { can } = useAccess()
    const canManage = can(['Admin', 'HR', 'Manager', 'Team Lead'], 'projects')
    const presetClient = location.state?.newForClient || ''
    const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm({ defaultValues: { ...BLANK, clientId: presetClient } })
    const [team, setTeam] = useState([])
    const [creating, setCreating] = useState(!!presetClient && canManage)
    const [addingClient, setAddingClient] = useState(false)
    // A client to select once it appears in the dropdown (preset from a client page, or just created).
    const [pendingClient, setPendingClient] = useState(presetClient)
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('')
    const [clientFilter, setClientFilter] = useState('')
    const [mineOnly, setMineOnly] = useState(false)
    const [groupByClient, setGroupByClient] = useState(false)
    const [sort, setSort] = useState('deadline')
    // projects and active workflow templates for the create form
    const [projects, setProjects] = useState([])
    const [templates, setTemplates] = useState([])
    useEffect(() => {
        if (!creating) return
        chatApi('GET', '/audit-projects').then((j) => setProjects(j.data || [])).catch(() => {})
        chatApi('GET', '/workflow-templates').then((j) => setTemplates((j.data || []).filter((f) => f.active).map((f) => f.active))).catch(() => {})
    }, [creating])

    useEffect(() => {
        dispatch({ type: auditActions.GET_AUDITS })
        dispatch({ type: auditActions.GET_AUDIT_CLIENTS })
        dispatch({ type: auditActions.GET_ACTIVE_AUDIT_TIMER })
        dispatch({ type: employeeActions.GET_EMPLOYEES })
    }, [dispatch])

    // Arriving from a client's "New audit project" button: open the form for that client,
    // then drop the router state so a refresh doesn't reopen it.
    useEffect(() => {
        if (presetClient) navigate(location.pathname, { replace: true, state: null })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const [saving, setSaving] = useState(false)
    const [saveError, setSaveError] = useState('')
    const onSubmit = (data) => {
        const num = (v) => (v === '' ? undefined : Number(v))
        setSaving(true); setSaveError('')
        dispatch({
            type: auditActions.ADD_AUDIT,
            payload: { ...data, teamMembers: team, estimatedHours: num(data.estimatedHours), fee: num(data.fee) },
            // close (and clear) only once it saved; on an error keep what was typed
            onDone: (ok, message) => {
                setSaving(false)
                if (ok) { reset(BLANK); setTeam([]); setCreating(false) } else setSaveError(message)
            },
        })
    }

    const openCreate = () => { reset(BLANK); setTeam([]); setAddingClient(false); setSaveError(''); setCreating(true) }
    const onCancel = () => { reset(BLANK); setTeam([]); setCreating(false); setAddingClient(false) }

    const onArchive = async (a) => {
        if (await confirmAction({ title: `Archive ${a.auditCode}?`, message: `“${engagementTitle(a)}” for ${a.clientName} will be hidden from everyone. Logged hours, tasks and invoices are kept.`, confirmLabel: 'Archive engagement', requireText: a.auditCode })) {
            dispatch({ type: auditActions.DELETE_AUDIT, id: a._id })
        }
    }

    const all = useMemo(() => list || [], [list])
    const clientOptions = useMemo(() => (clients || []).filter((c) => c.status !== 'Inactive').sort((a, b) => a.name.localeCompare(b.name)), [clients])

    useEffect(() => {
        if (pendingClient && clientOptions.some((c) => c._id === pendingClient)) {
            setValue('clientId', pendingClient, { shouldValidate: true })
            setPendingClient('')
        }
    }, [pendingClient, clientOptions, setValue])
    const people = useMemo(() => (employees || []).filter((e) => !FORMER.includes(e.status)), [employees])
    const counts = useMemo(() => Object.fromEntries(Object.keys(AUDIT_STATUS).map((s) => [s, all.filter((a) => a.status === s).length])), [all])
    const open = all.filter((a) => !CLOSED.includes(a.status)).length
    const totalMinutes = all.reduce((s, a) => s + (a.timeSummary?.totalMinutes || 0), 0)
    const workingNow = new Set(all.flatMap((a) => a.timeSummary?.activeNow || [])).size
    const late = all.filter((a) => a.endDate && !CLOSED.includes(a.status) && startOfDay(a.endDate) < startOfDay(Date.now())).length

    const rows = useMemo(() => {
        const q = search.trim().toLowerCase()
        return all
            .filter((a) => !statusFilter || a.status === statusFilter)
            .filter((a) => !clientFilter || clientIdOf(a) === clientFilter)
            .filter((a) => !mineOnly || isOnAudit(a, user?._id))
            .filter((a) => !q || `${a.clientName} ${engagementTitle(a)} ${a.auditCode} ${a.auditType} ${a.financialYear} ${fullName(a.auditManager)}`.toLowerCase().includes(q))
            .sort(SORTS[sort].fn)
    }, [all, statusFilter, clientFilter, mineOnly, search, sort, user?._id])

    const groups = useMemo(() => {
        if (!groupByClient) return null
        const map = new Map()
        rows.forEach((a) => {
            const k = clientIdOf(a) || a.clientName
            if (!map.has(k)) map.set(k, { id: clientIdOf(a), name: a.clientName, items: [] })
            map.get(k).items.push(a)
        })
        return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
    }, [rows, groupByClient])

    const startDate = watch('startDate')
    const auditsClients = useMemo(() => {
        const seen = new Map()
        all.forEach((a) => { const id = clientIdOf(a); if (id && !seen.has(id)) seen.set(id, a.clientName) })
        return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]))
    }, [all])

    return (
        <PeopleShell
            title="Audit projects"
            subtitle="Each client's audit projects, the team on each one, and every hour they log."
            root={AUDITS_ROOT}
            crumbs={[{ label: 'All audit projects' }]}
            actions={<>
                <Link to="/audits/clients" className="pp-btn"><i className="mdi mdi-domain"></i> Clients</Link>
                {canManage && <button type="button" className="pp-btn primary" onClick={openCreate}><i className="mdi mdi-plus"></i> New engagement</button>}
            </>}
        >
            <ErrorBanner error={error} />
            <ActiveTimerBar />

            <div className="at-tiles">
                <div className="at-tile" style={{ '--c': '#0284c7' }}>
                    <span className="at-tile-icon"><i className="mdi mdi-briefcase-search-outline"></i></span>
                    <div><b>{open}</b><span>Open projects</span></div>
                </div>
                <div className="at-tile" style={{ '--c': '#16a34a' }}>
                    <span className="at-tile-icon"><i className="mdi mdi-account-clock-outline"></i></span>
                    <div><b>{workingNow}</b><span>Working right now</span></div>
                </div>
                <div className="at-tile" style={{ '--c': '#7c3aed' }}>
                    <span className="at-tile-icon"><i className="mdi mdi-timer-outline"></i></span>
                    <div><b>{fmtHours(totalMinutes)}h</b><span>Hours logged</span></div>
                </div>
                <div className="at-tile" style={{ '--c': late ? '#e11d48' : '#64748b' }}>
                    <span className="at-tile-icon"><i className="mdi mdi-alert-circle-outline"></i></span>
                    <div><b>{late}</b><span>Past deadline</span></div>
                </div>
            </div>

            {canManage && creating && (
                <FormModal size="xl" icon="mdi-briefcase-plus-outline" title="New engagement" sub="Its workflow tasks are generated from the chosen template" onClose={onCancel} onSubmit={handleSubmit(onSubmit)} submitLabel="Create engagement" busy={saving}>
                    <div className="pp-card-body">
                        {saveError && <div className="fm-error" role="alert"><i className="mdi mdi-alert-circle-outline"></i>{saveError}</div>}
                        <div className="pj-form-grid">
                            <div className="pp-field span-2">
                                <label className="pp-label">Client<span className="req">*</span></label>
                                <div className="au-client-pick">
                                    <select className={`pp-select ${errors.clientId ? 'is-invalid' : ''}`} {...register('clientId', { required: 'Choose the client' })}>
                                        <option value="">Select client</option>
                                        {clientOptions.map((c) => <option key={c._id} value={c._id}>{c.name} ({c.clientCode})</option>)}
                                    </select>
                                    {!addingClient && <button type="button" className="pp-btn" onClick={() => setAddingClient(true)}><i className="mdi mdi-plus"></i> New client</button>}
                                </div>
                                {errors.clientId && <div className="pp-err">{errors.clientId.message}</div>}
                            </div>
                            <div className="pp-field span-2">
                                <label className="pp-label">Engagement name</label>
                                <input type="text" placeholder="e.g. Statutory audit FY 2026-27 (leave blank to auto-name)" className="pp-input" {...register('engagementName')} />
                            </div>
                            <div className="pp-field">
                                <label className="pp-label">Engagement code<span className="req">*</span></label>
                                <input type="text" placeholder="e.g. SA-2026-014" className={`pp-input ${errors.auditCode ? 'is-invalid' : ''}`} {...register('auditCode', { required: 'Required' })} />
                                {errors.auditCode && <div className="pp-err">{errors.auditCode.message}</div>}
                            </div>
                            <div className="pp-field">
                                <label className="pp-label">Audit type</label>
                                <select className="pp-select" {...register('auditType')}>
                                    {AUDIT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div className="pp-field">
                                <label className="pp-label">Financial year</label>
                                <input type="text" placeholder="2026-27" className="pp-input" {...register('financialYear')} />
                            </div>
                            <div className="pp-field">
                                <label className="pp-label">Project <small style={{ fontWeight: 400, color: 'var(--pp-muted)' }}>optional</small></label>
                                <select className="pp-select" {...register('projectId')}>
                                    <option value="">No project</option>
                                    {projects.filter((p) => (p.clientId?._id || p.clientId) === watch('clientId')).map((p) => <option key={p._id} value={p._id}>{p.name} ({p.projectCode})</option>)}
                                </select>
                            </div>
                            <div className="pp-field">
                                <label className="pp-label">Audit checklist (steps)</label>
                                <select className="pp-select" {...register('workflowTemplateId')}>
                                    <option value="">Automatic — best checklist for this project / company / type</option>
                                    {templates.map((t) => <option key={t._id} value={t._id}>{t.name} v{t.version}{t.auditType ? ` · ${t.auditType}` : ''}</option>)}
                                </select>
                            </div>
                            <div className="pp-field">
                                <label className="pp-label">Audit manager<span className="req">*</span></label>
                                <select className={`pp-select ${errors.auditManager ? 'is-invalid' : ''}`} {...register('auditManager', { required: 'Pick a manager' })}>
                                    <option value="">Select</option>
                                    {people.map((e) => <option key={e._id} value={e._id}>{fullName(e)}</option>)}
                                </select>
                                {errors.auditManager && <div className="pp-err">{errors.auditManager.message}</div>}
                            </div>
                            <div className="pp-field">
                                <label className="pp-label">Start<span className="req">*</span></label>
                                <input type="date" className={`pp-input ${errors.startDate ? 'is-invalid' : ''}`} {...register('startDate', { required: 'Required' })} />
                            </div>
                            <div className="pp-field">
                                <label className="pp-label">Deadline<span className="req">*</span></label>
                                <input type="date" min={startDate || undefined} className={`pp-input ${errors.endDate ? 'is-invalid' : ''}`}
                                    {...register('endDate', { required: 'Required', validate: (v) => !startDate || !v || v >= startDate || 'Must be after the start' })} />
                                {errors.endDate && <div className="pp-err">{errors.endDate.message}</div>}
                            </div>
                            <div className="pp-field">
                                <label className="pp-label">Priority</label>
                                <select className="pp-select" {...register('priority')}>
                                    {Object.keys(PRIORITY).map((p) => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </div>
                            <div className="pp-field">
                                <label className="pp-label">Estimated hours</label>
                                <input type="number" min="0" placeholder="e.g. 120" className="pp-input" {...register('estimatedHours')} />
                            </div>
                            <div className="pp-field span-2">
                                <label className="pp-label">Assign team</label>
                                <PeoplePicker people={people} value={team} onChange={setTeam} placeholder="Add auditors, articles, staff…" />
                            </div>
                            <div className="pp-field">
                                <label className="pp-label">Fee ({CURRENCY})</label>
                                <input type="number" min="0" placeholder="Optional" className="pp-input" {...register('fee')} />
                            </div>
                            <div className="pp-field span-4">
                                <label className="pp-label">Scope / notes</label>
                                <textarea rows={2} placeholder="Scope of the audit, location, key areas…" className="pp-input" {...register('description')}></textarea>
                            </div>
                        </div>
                    </div>
                </FormModal>
            )}
            {/* opened from inside the engagement dialog, so it renders after it (on top) */}
            {canManage && creating && addingClient && (
                <ClientForm onCancel={() => setAddingClient(false)} onDone={(c) => { setAddingClient(false); setPendingClient(c._id) }} />
            )}

            <div className="pl-toolbar">
                <div className="pp-search">
                    <i className="mdi mdi-magnify"></i>
                    <input type="search" className="pp-input" placeholder="Search client, project, code…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search audit projects" />
                </div>
                <select className="pp-select" value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} aria-label="Filter by client">
                    <option value="">All clients</option>
                    {auditsClients.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
                <div className="pj-filters">
                    <button type="button" className={`pj-filter ${!statusFilter ? 'active' : ''}`} style={{ '--c': '#0b0f19' }} onClick={() => setStatusFilter('')}>All <b>{all.length}</b></button>
                    {Object.entries(AUDIT_STATUS).map(([s, m]) => counts[s] > 0 && (
                        <button key={s} type="button" className={`pj-filter ${statusFilter === s ? 'active' : ''}`} style={{ '--c': m.color }} onClick={() => setStatusFilter(statusFilter === s ? '' : s)}>
                            <i className={`mdi ${m.icon}`}></i>{s} <b>{counts[s]}</b>
                        </button>
                    ))}
                    {canManage && (
                        <button type="button" className={`pj-filter ${mineOnly ? 'active' : ''}`} style={{ '--c': '#16a34a' }} onClick={() => setMineOnly(!mineOnly)}>
                            <i className="mdi mdi-account-check-outline"></i>Assigned to me
                        </button>
                    )}
                    <button type="button" className={`pj-filter ${groupByClient ? 'active' : ''}`} style={{ '--c': '#0284c7' }} onClick={() => setGroupByClient(!groupByClient)}>
                        <i className="mdi mdi-domain"></i>Group by client
                    </button>
                </div>
                <div className="at-spacer"></div>
                <select className="pp-select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort audit projects">
                    {Object.entries(SORTS).map(([k, s]) => <option key={k} value={k}>Sort: {s.label}</option>)}
                </select>
            </div>

            {!rows.length ? (
                <div className="pp-card">
                    <EmptyState icon="mdi-briefcase-search-outline" title={all.length ? 'No audit projects match' : 'No audit projects yet'}
                        text={all.length ? 'Try a different search, client or status.' : canManage ? 'Pick a client, create an audit project, assign the team, and they can start logging time.' : 'Audit projects you are assigned to will show up here.'}
                        action={canManage && !all.length && <button type="button" className="pp-btn primary" onClick={openCreate}><i className="mdi mdi-plus"></i> New engagement</button>} />
                </div>
            ) : groups ? (
                groups.map((g) => (
                    <section key={g.id || g.name} className="au-group">
                        <h3 className="au-group-head">
                            <i className="mdi mdi-domain"></i>
                            {g.id ? <Link to={`/audits/clients/${g.id}`}>{g.name}</Link> : g.name}
                            <span>{g.items.length} project{g.items.length === 1 ? '' : 's'}</span>
                        </h3>
                        <div className="pl-grid">
                            {g.items.map((a) => <AuditCard key={a._id} audit={a} showClient={false} canManage={canManage} onArchive={onArchive} />)}
                        </div>
                    </section>
                ))
            ) : (
                <div className="pl-grid">
                    {rows.map((a) => <AuditCard key={a._id} audit={a} canManage={canManage} onArchive={onArchive} />)}
                </div>
            )}
        </PeopleShell>
    )
}
