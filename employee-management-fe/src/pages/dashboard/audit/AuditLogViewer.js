import React, { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import auditLogActions from '../../../redux/auditLog/Actions'
import { PeopleShell, Avatar, EmptyState, ErrorBanner, fullName } from '../../../components/people/PeopleUI'
import '../../../components/settings/settings.css'

const SETTINGS_ROOT = { label: 'Settings', to: '/settings/company' }

// Actions look like "employee.create" — colour by the verb, icon by the thing.
const VERB = [
    [/create|add|apply|request|upload|generate|activate/, '#059669', 'mdi-plus-circle-outline'],
    [/update|edit|change|assign|move/, '#0284c7', 'mdi-pencil-circle-outline'],
    [/delete|remove|archive|terminate|offboard/, '#e11d48', 'mdi-delete-circle-outline'],
    [/approve|paid|reimburse|resolve|complete|disburse/, '#059669', 'mdi-check-circle-outline'],
    [/reject|cancel/, '#e11d48', 'mdi-close-circle-outline'],
    [/login|logout|password/, '#7c3aed', 'mdi-shield-key-outline'],
]
const ENTITY_ICON = {
    employee: 'mdi-account-outline', leave: 'mdi-beach', attendance: 'mdi-clock-outline', payroll: 'mdi-cash-multiple', payslip: 'mdi-receipt',
    expense: 'mdi-receipt', asset: 'mdi-laptop', ticket: 'mdi-lifebuoy', project: 'mdi-folder-outline', task: 'mdi-format-list-checks',
    role: 'mdi-shield-key-outline', settings: 'mdi-cog-outline', department: 'mdi-office-building-outline', branch: 'mdi-office-building-marker-outline',
    announcement: 'mdi-bullhorn-outline', license: 'mdi-key-variant', loan: 'mdi-cash-plus', document: 'mdi-file-document-outline',
}
const actionMeta = (action = '') => {
    const [entity, verb = ''] = action.toLowerCase().split('.')
    const v = VERB.find(([re]) => re.test(verb)) || [null, '#64748b', 'mdi-circle-outline']
    return { color: v[1], icon: ENTITY_ICON[entity] || v[2], entity }
}

const dayLabel = (d) => {
    const x = new Date(d); x.setHours(0, 0, 0, 0)
    const t = new Date(); t.setHours(0, 0, 0, 0)
    const diff = Math.round((t - x) / 864e5)
    if (diff === 0) return 'Today'
    if (diff === 1) return 'Yesterday'
    return x.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`

export const AuditLogViewer = () => {
    const dispatch = useDispatch()
    const { list, error } = useSelector((state) => state.auditLogReducer || {})
    const [search, setSearch] = useState('')
    const [area, setArea] = useState('')

    useEffect(() => {
        dispatch({ type: auditLogActions.GET_AUDIT_LOGS })
    }, [dispatch])

    const all = useMemo(() => [...(list || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)), [list])
    const areas = useMemo(() => [...new Set(all.map((l) => actionMeta(l.action).entity).filter(Boolean))].sort(), [all])

    const rows = useMemo(() => {
        const q = search.trim().toLowerCase()
        return all
            .filter((l) => !area || actionMeta(l.action).entity === area)
            .filter((l) => !q || `${l.action} ${l.description} ${fullName(l.performedBy)}`.toLowerCase().includes(q))
    }, [all, area, search])

    const groups = useMemo(() => {
        const map = new Map()
        rows.forEach((l) => {
            const k = new Date(l.createdAt).toDateString()
            if (!map.has(k)) map.set(k, [])
            map.get(k).push(l)
        })
        return [...map.entries()]
    }, [rows])

    const exportCsv = () => {
        const lines = [['When', 'Action', 'Description', 'Performed by'], ...rows.map((l) => [new Date(l.createdAt).toLocaleString(), l.action, l.description, l.performedBy ? fullName(l.performedBy) : 'System'])]
        const blob = new Blob([lines.map((r) => r.map(csvCell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
        a.click()
        URL.revokeObjectURL(url)
    }

    const today = all.filter((l) => new Date(l.createdAt).toDateString() === new Date().toDateString()).length
    const people = new Set(all.map((l) => l.performedBy?._id).filter(Boolean)).size

    return (
        <PeopleShell title="Audit logs" root={SETTINGS_ROOT} crumbs={[{ label: 'Audit logs' }]}
            actions={<button type="button" className="pp-btn" onClick={exportCsv} disabled={!rows.length}><i className="mdi mdi-download-outline"></i> Export CSV</button>}>
            <ErrorBanner error={error} />

            <div className="at-tiles">
                <div className="at-tile" style={{ '--c': '#0b0f19' }}><span className="at-tile-icon"><i className="mdi mdi-history"></i></span><div><b>{all.length}</b><span>Recorded events</span></div></div>
                <div className="at-tile" style={{ '--c': '#0284c7' }}><span className="at-tile-icon"><i className="mdi mdi-calendar-today"></i></span><div><b>{today}</b><span>Today</span></div></div>
                <div className="at-tile" style={{ '--c': '#7c3aed' }}><span className="at-tile-icon"><i className="mdi mdi-account-group-outline"></i></span><div><b>{people}</b><span>People active</span></div></div>
            </div>

            <div className="au-toolbar">
                <div className="pp-search">
                    <i className="mdi mdi-magnify"></i>
                    <input type="search" className="pp-input" placeholder="Search what happened or who did it…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search audit log" />
                </div>
                <select className="pp-select" value={area} onChange={(e) => setArea(e.target.value)} aria-label="Area">
                    <option value="">All areas</option>
                    {areas.map((a) => <option key={a} value={a}>{a.charAt(0).toUpperCase() + a.slice(1)}</option>)}
                </select>
            </div>

            <section className="pp-card">
                {!groups.length ? (
                    <EmptyState icon="mdi-history" title={all.length ? 'Nothing matches' : 'No activity recorded yet'} text={all.length ? 'Try a different search or area.' : 'Changes to employees, leave, payroll and settings will be listed here.'} />
                ) : groups.map(([k, items]) => (
                    <div key={k}>
                        <div className="au-day">{dayLabel(k)} · {items.length}</div>
                        {items.map((l) => {
                            const m = actionMeta(l.action)
                            return (
                                <div key={l._id} className="au-row" style={{ '--c': m.color }}>
                                    <span className="st-icon" style={{ '--c': m.color, width: 36, height: 36, fontSize: 18 }}><i className={`mdi ${m.icon}`}></i></span>
                                    <div className="au-main">
                                        <div className="au-desc">{l.description}</div>
                                        <div className="au-meta">
                                            <span className="au-code">{l.action}</span>
                                            {l.performedBy
                                                ? <span className="d-inline-flex align-items-center gap-1"><Avatar person={l.performedBy} size={18} />{fullName(l.performedBy)}</span>
                                                : <span><i className="mdi mdi-robot-outline"></i> System</span>}
                                        </div>
                                    </div>
                                    <span className="au-time" title={new Date(l.createdAt).toLocaleString()}>{new Date(l.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                            )
                        })}
                    </div>
                ))}
            </section>
        </PeopleShell>
    )
}
