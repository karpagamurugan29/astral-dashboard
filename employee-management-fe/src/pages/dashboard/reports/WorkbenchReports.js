import React, { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import ReactECharts from 'echarts-for-react'
import reportActions from '../../../redux/report/Actions'
import auditActions from '../../../redux/audit/Actions'
import { EmptyState, fullName } from '../../../components/people/PeopleUI'
import { DataTable } from '../../../components/dashboard/widgets/ChartWidget'
import { AUDIT_STATUS, engagementTitle, fmtDuration } from '../../../components/audits/AuditUI'

/* -------------------------------------------------------------------------- */
/*  Business reports: check-in log, audit hours, audit projects. Each has a   */
/*  date range, filters, summary tiles, a chart where it helps, the compact   */
/*  sortable table and CSV export of exactly what is on screen.               */
/* -------------------------------------------------------------------------- */

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const PRESETS = {
    month: { label: 'This month', range: () => { const n = new Date(); return [ymd(new Date(n.getFullYear(), n.getMonth(), 1)), ymd(n)] } },
    week: { label: 'Last 7 days', range: () => { const n = new Date(); const s = new Date(n); s.setDate(s.getDate() - 6); return [ymd(s), ymd(n)] } },
    last: { label: 'Last month', range: () => { const n = new Date(); return [ymd(new Date(n.getFullYear(), n.getMonth() - 1, 1)), ymd(new Date(n.getFullYear(), n.getMonth(), 0))] } },
    today: { label: 'Today', range: () => { const n = ymd(new Date()); return [n, n] } },
}
const t = (d) => (d ? new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '')
const dt = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '')
const h1 = (min) => Math.round(((min || 0) / 60) * 10) / 10

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
const downloadCsv = (name, headers, rows) => {
    const blob = new Blob([[headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${name}-${ymd(new Date())}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
}

const Tile = ({ icon, color, value, label }) => (
    <div className="at-tile" style={{ '--c': color }}><span className="at-tile-icon"><i className={`mdi ${icon}`}></i></span><div><b>{value}</b><span>{label}</span></div></div>
)

/* Date presets + custom range + extra filters + export, in one bar. */
const FilterBar = ({ range, setRange, children, onExport, loading }) => {
    const [preset, setPreset] = useState('month')
    const pick = (k) => { setPreset(k); setRange(PRESETS[k].range()) }
    return (
        <div className="pp-card wb-filters">
            <div className="pj-filters">
                {Object.entries(PRESETS).map(([k, p]) => (
                    <button key={k} type="button" className={`pj-filter ${preset === k ? 'active' : ''}`} style={{ '--c': '#4c1d95' }} onClick={() => pick(k)}>{p.label}</button>
                ))}
                <button type="button" className={`pj-filter ${preset === 'custom' ? 'active' : ''}`} style={{ '--c': '#4c1d95' }} onClick={() => setPreset('custom')}><i className="mdi mdi-calendar-range"></i>Custom</button>
            </div>
            {preset === 'custom' && (
                <div className="wb-range">
                    <label>From <input type="date" className="pp-input" value={range[0]} max={range[1]} onChange={(e) => setRange([e.target.value, range[1]])} /></label>
                    <label>To <input type="date" className="pp-input" value={range[1]} min={range[0]} onChange={(e) => setRange([range[0], e.target.value])} /></label>
                </div>
            )}
            <div className="wb-row">
                {children}
                <span className="wb-spacer"></span>
                {loading && <span className="wb-loading"><i className="mdi mdi-loading mdi-spin"></i>Loading…</span>}
                <button type="button" className="pp-btn" onClick={onExport}><i className="mdi mdi-download-outline"></i> Export CSV</button>
            </div>
        </div>
    )
}

const usePeople = () => {
    const { list } = useSelector((state) => state.employeeReducer || {})
    return useMemo(() => (list || []).filter((e) => e.status === 'Active').sort((a, b) => fullName(a).localeCompare(fullName(b))), [list])
}

/* ======================= Check-in log ======================= */
export const CheckinLogReport = () => {
    const dispatch = useDispatch()
    const { checkins, loading } = useSelector((state) => state.reportReducer || {})
    const people = usePeople()
    const [range, setRange] = useState(PRESETS.month.range())
    const [employeeId, setEmployeeId] = useState('')
    const [department, setDepartment] = useState('')
    const [mode, setMode] = useState('')
    useEffect(() => { dispatch({ type: reportActions.GET_CHECKIN_REPORT, filters: { from: range[0], to: range[1], employeeId, department } }) }, [dispatch, range, employeeId, department])

    const rows = useMemo(() => (checkins?.rows || []).filter((r) => !mode || r.mode === mode), [checkins, mode])
    const s = checkins?.summary || {}
    const depts = [...new Set(people.map((p) => p.department).filter(Boolean))].sort()
    const columns = ['Employee', 'Date', 'Mode', 'Check in', 'Check-in place', 'Check out', 'Check-out place', 'Hours', 'Status', 'Late (min)', 'Comment']
    const table = rows.map((r) => [
        fullName(r.employee) + (r.session ? ` · #${r.session}` : ''), dt(r.checkIn), r.mode === 'Client' ? 'Client site' : r.mode || '—', t(r.checkIn),
        r.checkInPlace?.address || (r.checkInPlace ? `${r.checkInPlace.latitude.toFixed(4)}, ${r.checkInPlace.longitude.toFixed(4)}` : 'No location'),
        r.open ? 'In now' : `${t(r.checkOut)}${r.auto ? ' (auto)' : ''}`,
        r.auto ? 'Auto check-out' : r.checkOutPlace?.address || (r.open ? '' : r.checkOutPlace ? `${r.checkOutPlace.latitude.toFixed(4)}, ${r.checkOutPlace.longitude.toFixed(4)}` : 'No location'),
        r.hours != null ? `${r.hours}h` : '—', r.status || '', r.lateByMinutes || '', r.remarks || '',
    ])

    return (
        <>
            <FilterBar range={range} setRange={setRange} loading={loading === 'checkins'} onExport={() => downloadCsv('check-in-log', columns, table)}>
                <select className="pp-select" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} aria-label="Employee"><option value="">Everyone</option>{people.map((p) => <option key={p._id} value={p._id}>{fullName(p)}</option>)}</select>
                <select className="pp-select" value={department} onChange={(e) => setDepartment(e.target.value)} aria-label="Department"><option value="">All departments</option>{depts.map((d) => <option key={d}>{d}</option>)}</select>
                <select className="pp-select" value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Work mode"><option value="">Any mode</option><option value="Office">Office</option><option value="Client">Client site</option><option value="Home">Home</option></select>
            </FilterBar>
            <div className="at-tiles">
                <Tile icon="mdi-login-variant" color="#059669" value={s.sessions ?? '–'} label={`Check-ins · ${s.people ?? 0} people`} />
                <Tile icon="mdi-timer-outline" color="#7c3aed" value={s.hours != null ? `${s.hours}h` : '–'} label="Hours worked" />
                <Tile icon="mdi-clock-alert-outline" color="#d97706" value={s.late ?? '–'} label="Late arrivals" />
                <Tile icon="mdi-map-marker-off-outline" color={s.withoutLocation ? '#e11d48' : '#64748b'} value={s.withoutLocation ?? '–'} label="Without location" />
            </div>
            {s.byMode && (
                <div className="wb-chips">
                    {Object.entries(s.byMode).map(([m, n]) => <span key={m}><b>{n}</b> {m === 'Client' ? 'Client site' : m}</span>)}
                    {s.open > 0 && <span><b>{s.open}</b> still checked in</span>}
                    {s.auto > 0 && <span><b>{s.auto}</b> auto check-outs</span>}
                </div>
            )}
            <section className="pp-card wb-table">
                {!rows.length ? <EmptyState icon="mdi-clock-outline" title={loading === 'checkins' ? 'Loading…' : 'No check-ins in this period'} /> : <DataTable columns={columns} rows={table} accent="#059669" barColumn={-1} maxHeight={560} />}
            </section>
        </>
    )
}

/* ======================= Audit hours ======================= */
const hbar = (labels, values, color) => ({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v) => `${v}h` },
    grid: { left: 4, right: 48, top: 4, bottom: 4, containLabel: true },
    xAxis: { type: 'value', show: false },
    yAxis: { type: 'category', data: labels, inverse: true, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#64748b', width: 120, overflow: 'truncate' } },
    series: [{ type: 'bar', barWidth: 12, data: values.map((v) => ({ value: v, itemStyle: { color, borderRadius: [0, 4, 4, 0] } })), label: { show: true, position: 'right', color: '#334155', fontWeight: 600, formatter: '{c}h' } }],
})

export const AuditHoursReport = () => {
    const dispatch = useDispatch()
    const { auditHours: d, loading } = useSelector((state) => state.reportReducer || {})
    const { clients } = useSelector((state) => state.auditReducer || {})
    const people = usePeople()
    const [range, setRange] = useState(PRESETS.month.range())
    const [clientId, setClientId] = useState('')
    const [employeeId, setEmployeeId] = useState('')
    const [view, setView] = useState('project')
    useEffect(() => { dispatch({ type: auditActions.GET_AUDIT_CLIENTS }) }, [dispatch])
    useEffect(() => { dispatch({ type: reportActions.GET_AUDIT_HOURS_REPORT, filters: { from: range[0], to: range[1], clientId, employeeId } }) }, [dispatch, range, clientId, employeeId])

    const s = d?.summary || {}
    const views = {
        project: { label: 'By project', columns: ['Project', 'Client', 'Code', 'Hours', 'Days', 'People', 'Sessions', 'Estimate'], rows: (d?.byProject || []).map((r) => [engagementTitle(r), r.clientName, r.auditCode, fmtDuration(r.minutes), r.days, r.people, r.sessions, r.estimatedHours ? `${r.estimatedHours}h` : '—']) },
        person: { label: 'By person', columns: ['Person', 'Designation', 'Hours', 'Days', 'Sessions', 'Avg / day'], rows: (d?.byPerson || []).map((r) => [fullName(r.employee), r.employee?.designation || '', fmtDuration(r.minutes), r.days, r.sessions, r.days ? fmtDuration(r.minutes / r.days) : '—']) },
        client: { label: 'By client', columns: ['Client', 'Hours', 'Days', 'People', 'Sessions'], rows: (d?.byClient || []).map((r) => [r.clientName, fmtDuration(r.minutes), r.days, r.people, r.sessions]) },
        sessions: { label: 'All sessions', columns: ['Date', 'Person', 'Client', 'Project', 'Start', 'End', 'Duration', 'Start place', 'Note'], rows: (d?.sessions || []).map((r) => [dt(r.start), fullName(r.employee), r.clientName, engagementTitle(r), t(r.start), r.running ? 'Running' : t(r.end), fmtDuration(r.minutes), r.startPlace?.address || (r.startPlace ? 'Coordinates only' : 'No location'), r.note.replace(/^\[Demo\]\s*/, '')]) },
    }
    const v = views[view]

    return (
        <>
            <FilterBar range={range} setRange={setRange} loading={loading === 'audit-hours'} onExport={() => downloadCsv(`audit-hours-${view}`, v.columns, v.rows)}>
                <select className="pp-select" value={clientId} onChange={(e) => setClientId(e.target.value)} aria-label="Client"><option value="">All clients</option>{(clients || []).map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</select>
                <select className="pp-select" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} aria-label="Person"><option value="">Everyone</option>{people.map((p) => <option key={p._id} value={p._id}>{fullName(p)}</option>)}</select>
            </FilterBar>
            <div className="at-tiles">
                <Tile icon="mdi-timer-outline" color="#7c3aed" value={s.totalMinutes != null ? `${h1(s.totalMinutes)}h` : '–'} label={`Logged · ${s.sessions ?? 0} sessions`} />
                <Tile icon="mdi-domain" color="#0284c7" value={s.clients ?? '–'} label={`Clients · ${s.projects ?? 0} projects`} />
                <Tile icon="mdi-account-group-outline" color="#059669" value={s.people ?? '–'} label="People logging time" />
                <Tile icon="mdi-play-circle-outline" color="#16a34a" value={s.running ?? '–'} label="Timers running" />
            </div>
            {(d?.byClient || []).length > 0 && (
                <div className="rp-two">
                    <section className="pp-card rp-chart"><h3>Hours by client</h3><div className="rp-chart-box"><ReactECharts style={{ height: '100%' }} notMerge option={hbar(d.byClient.slice(0, 8).map((r) => r.clientName), d.byClient.slice(0, 8).map((r) => h1(r.minutes)), '#0284c7')} /></div></section>
                    <section className="pp-card rp-chart"><h3>Hours by person</h3><div className="rp-chart-box"><ReactECharts style={{ height: '100%' }} notMerge option={hbar(d.byPerson.slice(0, 8).map((r) => fullName(r.employee)), d.byPerson.slice(0, 8).map((r) => h1(r.minutes)), '#7c3aed')} /></div></section>
                </div>
            )}
            <section className="pp-card wb-table">
                <div className="wb-views">
                    {Object.entries(views).map(([k, x]) => <button key={k} type="button" className={`tc-tab ${view === k ? 'on' : ''}`} onClick={() => setView(k)}>{x.label} <b>{x.rows.length}</b></button>)}
                </div>
                {!v.rows.length ? <EmptyState icon="mdi-timer-off-outline" title={loading === 'audit-hours' ? 'Loading…' : 'No audit time in this period'} /> : <DataTable columns={v.columns} rows={v.rows} accent="#7c3aed" maxHeight={560} />}
            </section>
        </>
    )
}

/* ======================= Audit projects ======================= */
export const AuditProjectsReport = () => {
    const dispatch = useDispatch()
    const { auditProjects: d, loading } = useSelector((state) => state.reportReducer || {})
    const { clients } = useSelector((state) => state.auditReducer || {})
    const [status, setStatus] = useState('')
    const [clientId, setClientId] = useState('')
    useEffect(() => { dispatch({ type: auditActions.GET_AUDIT_CLIENTS }) }, [dispatch])
    useEffect(() => { dispatch({ type: reportActions.GET_AUDIT_PROJECTS_REPORT, filters: { status, clientId } }) }, [dispatch, status, clientId])

    const s = d?.summary || {}
    const columns = ['Project', 'Client', 'Code', 'Type', 'FY', 'Status', 'Manager', 'Team', 'Deadline', 'Days left', 'Logged', 'Estimate', '% used']
    const rows = (d?.rows || []).map((r) => [engagementTitle(r), r.clientName, r.auditCode, r.auditType, r.financialYear || '', r.status, fullName(r.manager), r.teamSize, dt(r.endDate), r.daysLeft ?? '', fmtDuration(r.loggedMinutes), r.estimatedHours ? `${r.estimatedHours}h` : '—', r.usedPct != null ? `${r.usedPct}%` : '—'])

    return (
        <>
            <div className="pp-card wb-filters">
                <div className="wb-row">
                    <select className="pp-select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">All statuses</option>{Object.keys(AUDIT_STATUS).map((x) => <option key={x}>{x}</option>)}</select>
                    <select className="pp-select" value={clientId} onChange={(e) => setClientId(e.target.value)} aria-label="Client"><option value="">All clients</option>{(clients || []).map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</select>
                    <span className="wb-spacer"></span>
                    {loading === 'audit-projects' && <span className="wb-loading"><i className="mdi mdi-loading mdi-spin"></i>Loading…</span>}
                    <button type="button" className="pp-btn" onClick={() => downloadCsv('audit-projects', columns, rows)}><i className="mdi mdi-download-outline"></i> Export CSV</button>
                </div>
            </div>
            <div className="at-tiles">
                <Tile icon="mdi-briefcase-search-outline" color="#0284c7" value={s.open ?? '–'} label={`Open · ${s.projects ?? 0} total`} />
                <Tile icon="mdi-timer-outline" color="#7c3aed" value={s.loggedMinutes != null ? `${h1(s.loggedMinutes)}h` : '–'} label={`Logged of ${s.estimatedHours ?? 0}h estimated`} />
                <Tile icon="mdi-flag-remove-outline" color={s.overdue ? '#e11d48' : '#64748b'} value={s.overdue ?? '–'} label="Past deadline" />
                <Tile icon="mdi-timer-sand" color={s.overBudget ? '#e11d48' : '#64748b'} value={s.overBudget ?? '–'} label="Over hour estimate" />
            </div>
            {s.byStatus && (
                <div className="wb-chips">
                    {Object.entries(s.byStatus).map(([k, n]) => <span key={k} style={{ '--c': AUDIT_STATUS[k]?.color }}><i className={`mdi ${AUDIT_STATUS[k]?.icon || 'mdi-circle-outline'}`}></i><b>{n}</b> {k}</span>)}
                </div>
            )}
            <section className="pp-card wb-table">
                {!rows.length ? <EmptyState icon="mdi-briefcase-off-outline" title={loading === 'audit-projects' ? 'Loading…' : 'No audit projects match'} /> : <DataTable columns={columns} rows={rows} accent="#0284c7" barColumn={10} maxHeight={560} />}
            </section>
        </>
    )
}
