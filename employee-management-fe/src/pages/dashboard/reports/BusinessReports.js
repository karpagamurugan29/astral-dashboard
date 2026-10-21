import React, { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import reportActions from '../../../redux/report/Actions'
import auditActions from '../../../redux/audit/Actions'
import { EmptyState, fullName } from '../../../components/people/PeopleUI'
import { DataTable } from '../../../components/dashboard/widgets/ChartWidget'
import { engagementTitle } from '../../../components/audits/AuditUI'
import { money, moneyShort } from '../../../components/payroll/PayrollUI'
import { PRESETS, FilterBar, Tile, downloadCsv, dt } from './WorkbenchReports'

/* -------------------------------------------------------------------------- */
/*  Business insight reports: utilisation, client profitability, punctuality  */
/*  and document compliance. Same layout as the workbench reports: filters,   */
/*  summary tiles, a chart, a sortable table and CSV export.                  */
/* -------------------------------------------------------------------------- */

const pct = (n) => (n === null || n === undefined ? '—' : `${n}%`)
const tone = (v, good, ok) => (v >= good ? '#059669' : v >= ok ? '#d97706' : '#e11d48')

const usePeopleDepts = () => {
    const { list } = useSelector((state) => state.employeeReducer || {})
    return useMemo(() => [...new Set((list || []).map((p) => p.department).filter(Boolean))].sort(), [list])
}

const Note = ({ children }) => <p className="bi-note"><i className="mdi mdi-information-outline"></i>{children}</p>

const barOpt = (labels, values, { color = '#7c3aed', suffix = '', max } = {}) => ({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v) => `${v}${suffix}` },
    grid: { left: 4, right: 48, top: 4, bottom: 4, containLabel: true },
    xAxis: { type: 'value', show: false, max },
    yAxis: { type: 'category', data: labels, inverse: true, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#64748b', width: 130, overflow: 'truncate' } },
    series: [{ type: 'bar', barWidth: 12, data: values.map((v) => ({ value: v, itemStyle: { color: typeof color === 'function' ? color(v) : color, borderRadius: [0, 4, 4, 0] } })), label: { show: true, position: 'right', color: '#334155', fontWeight: 600, formatter: `{c}${suffix}` } }],
})

/* ======================= Utilisation ======================= */
export const UtilisationReport = () => {
    const dispatch = useDispatch()
    const { utilisation: d, loading } = useSelector((state) => state.reportReducer || {})
    const depts = usePeopleDepts()
    const [range, setRange] = useState(PRESETS.month.range())
    const [department, setDepartment] = useState('')
    const [band, setBand] = useState('')
    useEffect(() => { dispatch({ type: reportActions.GET_UTILISATION_REPORT, filters: { from: range[0], to: range[1], department } }) }, [dispatch, range, department])

    const s = d?.summary || {}
    const rows = (d?.rows || []).filter((r) => !band || (band === 'bench' ? r.capacityHours > 0 && r.utilisation < 30 : band === 'over' ? r.utilisation > 100 : r.utilisation >= 30 && r.utilisation <= 100))
    const columns = ['Employee', 'Designation', 'Department', 'Working days', 'Leave', 'Capacity', 'Checked-in hrs', 'Audit hrs', 'Utilisation', 'Focus', 'Audits']
    const table = rows.map((r) => [fullName(r.employee), r.employee.designation || '', r.employee.department || '', r.workingDays, r.leaveDays, `${r.capacityHours}h`, `${r.attendedHours}h`, `${r.auditHours}h`, `${r.utilisation}%`, `${r.focus}%`, r.audits])

    return (
        <>
            <FilterBar range={range} setRange={setRange} loading={loading === 'utilisation'} onExport={() => downloadCsv('utilisation', columns, table)}>
                <select className="pp-select" value={department} onChange={(e) => setDepartment(e.target.value)} aria-label="Department"><option value="">All departments</option>{depts.map((x) => <option key={x}>{x}</option>)}</select>
                <select className="pp-select" value={band} onChange={(e) => setBand(e.target.value)} aria-label="Band"><option value="">Everyone</option><option value="bench">On the bench (&lt;30%)</option><option value="healthy">Healthy (30–100%)</option><option value="over">Overloaded (&gt;100%)</option></select>
            </FilterBar>
            <div className="at-tiles">
                <Tile icon="mdi-speedometer" color={tone(s.utilisation || 0, 70, 40)} value={pct(s.utilisation)} label="Firm utilisation" />
                <Tile icon="mdi-timer-outline" color="#7c3aed" value={s.auditHours != null ? `${s.auditHours}h` : '–'} label={`Audit hours of ${s.capacityHours ?? 0}h capacity`} />
                <Tile icon="mdi-sofa-outline" color={s.bench ? '#d97706' : '#64748b'} value={s.bench ?? '–'} label="On the bench (<30%)" />
                <Tile icon="mdi-fire" color={s.overloaded ? '#e11d48' : '#64748b'} value={s.overloaded ?? '–'} label="Overloaded (>100%)" />
            </div>
            <Note>Capacity = working days since joining, minus approved leave, × {d?.dayHours || 8}h. Utilisation = audit hours ÷ capacity. Focus = audit hours ÷ hours actually checked in.</Note>
            {(d?.rows || []).length > 0 && (
                <div className="rp-two">
                    <section className="pp-card rp-chart"><h3>Utilisation by department</h3><div className="rp-chart-box"><ReactECharts style={{ height: '100%' }} notMerge option={barOpt(d.byDepartment.map((x) => x.department), d.byDepartment.map((x) => x.utilisation), { suffix: '%', color: (v) => tone(v, 70, 40) })} /></div></section>
                    <section className="pp-card rp-chart"><h3>Most utilised people</h3><div className="rp-chart-box"><ReactECharts style={{ height: '100%' }} notMerge option={barOpt(d.rows.slice(0, 8).map((r) => fullName(r.employee)), d.rows.slice(0, 8).map((r) => r.utilisation), { suffix: '%', color: (v) => (v > 100 ? '#e11d48' : '#7c3aed') })} /></div></section>
                </div>
            )}
            <section className="pp-card wb-table">
                {!table.length ? <EmptyState icon="mdi-speedometer-slow" title={loading === 'utilisation' ? 'Loading…' : 'No one in this view'} /> : <DataTable columns={columns} rows={table} accent="#7c3aed" barColumn={8} maxHeight={560} />}
            </section>
        </>
    )
}

/* ======================= Client profitability ======================= */
export const ProfitabilityReport = () => {
    const dispatch = useDispatch()
    const { profitability: d, loading } = useSelector((state) => state.reportReducer || {})
    const { clients } = useSelector((state) => state.auditReducer || {})
    const [status, setStatus] = useState('open')
    const [clientId, setClientId] = useState('')
    const [view, setView] = useState('project')
    useEffect(() => { dispatch({ type: auditActions.GET_AUDIT_CLIENTS }) }, [dispatch])
    useEffect(() => { dispatch({ type: reportActions.GET_PROFITABILITY_REPORT, filters: { status, clientId } }) }, [dispatch, status, clientId])

    const s = d?.summary || {}
    const m = !!d?.money
    const views = {
        project: m ? {
            label: 'By project',
            columns: ['Project', 'Client', 'Status', 'Fee', 'Est. hrs', 'Logged hrs', 'Budget used', 'Cost', 'Margin', 'Margin %', 'Rate / hr'],
            rows: (d?.rows || []).map((r) => [engagementTitle(r), r.clientName, r.status, money(r.fee), r.estimatedHours, r.loggedHours, pct(r.budgetUsed), money(r.cost), money(r.margin), pct(r.marginPct), r.effectiveRate != null ? money(r.effectiveRate) : '—']),
            bar: 9,
        } : {
            label: 'By project',
            columns: ['Project', 'Client', 'Status', 'Manager', 'Est. hrs', 'Logged hrs', 'Budget used', 'People'],
            rows: (d?.rows || []).map((r) => [engagementTitle(r), r.clientName, r.status, fullName(r.manager), r.estimatedHours, r.loggedHours, pct(r.budgetUsed), r.people]),
            bar: 6,
        },
        client: m ? {
            label: 'By client',
            columns: ['Client', 'Projects', 'Fee', 'Logged hrs', 'Cost', 'Margin', 'Margin %', 'Rate / hr'],
            rows: (d?.clients || []).map((c) => [c.clientName, c.projects, money(c.fee), c.loggedHours, money(c.cost), money(c.margin), pct(c.marginPct), c.effectiveRate != null ? money(c.effectiveRate) : '—']),
            bar: 2,
        } : {
            label: 'By client',
            columns: ['Client', 'Projects', 'Est. hrs', 'Logged hrs'],
            rows: (d?.clients || []).map((c) => [c.clientName, c.projects, c.estimatedHours, c.loggedHours]),
            bar: 3,
        },
    }
    const v = views[view]
    const top = (d?.clients || []).slice(0, 8)

    return (
        <>
            <div className="pp-card wb-filters">
                <div className="wb-row">
                    <select className="pp-select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
                        <option value="open">Open projects</option><option value="">All projects</option><option value="Completed">Completed</option>
                    </select>
                    <select className="pp-select" value={clientId} onChange={(e) => setClientId(e.target.value)} aria-label="Client"><option value="">All clients</option>{(clients || []).map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</select>
                    <span className="wb-spacer"></span>
                    {loading === 'profitability' && <span className="wb-loading"><i className="mdi mdi-loading mdi-spin"></i>Loading…</span>}
                    <button type="button" className="pp-btn" onClick={() => downloadCsv(`profitability-${view}`, v.columns, v.rows)}><i className="mdi mdi-download-outline"></i> Export CSV</button>
                </div>
            </div>
            <div className="at-tiles">
                {m ? (
                    <>
                        <Tile icon="mdi-cash-multiple" color="#0284c7" value={moneyShort(s.fee)} label={`Fees · ${s.projects ?? 0} projects`} />
                        <Tile icon="mdi-account-cash-outline" color="#7c3aed" value={moneyShort(s.cost)} label={`Cost of ${s.loggedHours ?? 0}h logged`} />
                        <Tile icon="mdi-trending-up" color={tone(s.marginPct ?? 0, 40, 15)} value={moneyShort(s.margin)} label={`Margin · ${pct(s.marginPct)}`} />
                        <Tile icon="mdi-alert-octagon-outline" color={s.overBudget || s.lossMaking ? '#e11d48' : '#64748b'} value={`${s.overBudget ?? 0} / ${s.lossMaking ?? 0}`} label="Over budget / loss-making" />
                    </>
                ) : (
                    <>
                        <Tile icon="mdi-briefcase-outline" color="#0284c7" value={s.projects ?? '–'} label="Projects" />
                        <Tile icon="mdi-timer-outline" color="#7c3aed" value={s.loggedHours != null ? `${s.loggedHours}h` : '–'} label={`Logged of ${s.estimatedHours ?? 0}h budget`} />
                        <Tile icon="mdi-timer-sand" color={s.nearBudget ? '#d97706' : '#64748b'} value={s.nearBudget ?? '–'} label="80–100% of budget" />
                        <Tile icon="mdi-alert-octagon-outline" color={s.overBudget ? '#e11d48' : '#64748b'} value={s.overBudget ?? '–'} label="Over budget" />
                    </>
                )}
            </div>
            <Note>{m ? 'Cost = hours logged × each person’s hourly cost (monthly salary ÷ 22 days ÷ 8h). Margin = fee − cost of time. Rate / hr = fee ÷ hours logged.' : 'Hours logged against each audit’s budget. Fees and cost are visible to Admin, HR, Partners, Directors and Accounts Head.'}</Note>
            {top.length > 0 && (
                <section className="pp-card rp-chart bi-wide">
                    <h3>{m ? 'Fee vs cost of time by client' : 'Budget vs logged hours by client'}</h3>
                    <div className="rp-chart-box">
                        <ReactECharts style={{ height: '100%' }} notMerge option={{
                            tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (x) => (m ? money(x) : `${x}h`) },
                            legend: { top: 0, right: 0, textStyle: { color: '#64748b' } },
                            grid: { left: 4, right: 12, top: 30, bottom: 4, containLabel: true },
                            xAxis: { type: 'category', data: top.map((c) => c.clientName), axisLabel: { color: '#64748b', interval: 0, width: 90, overflow: 'truncate' }, axisTick: { show: false } },
                            yAxis: { type: 'value', axisLabel: { color: '#94a3b8', formatter: (x) => (m ? moneyShort(x) : `${x}h`) }, splitLine: { lineStyle: { color: '#eef1f5' } } },
                            series: m
                                ? [{ name: 'Fee', type: 'bar', barGap: '10%', barWidth: 16, data: top.map((c) => c.fee), itemStyle: { color: '#0284c7', borderRadius: [4, 4, 0, 0] } }, { name: 'Cost of time', type: 'bar', barWidth: 16, data: top.map((c) => c.cost), itemStyle: { color: '#f59e0b', borderRadius: [4, 4, 0, 0] } }]
                                : [{ name: 'Budget', type: 'bar', barGap: '10%', barWidth: 16, data: top.map((c) => c.estimatedHours), itemStyle: { color: '#cbd5e1', borderRadius: [4, 4, 0, 0] } }, { name: 'Logged', type: 'bar', barWidth: 16, data: top.map((c) => c.loggedHours), itemStyle: { color: '#7c3aed', borderRadius: [4, 4, 0, 0] } }],
                        }} />
                    </div>
                </section>
            )}
            <section className="pp-card wb-table">
                <div className="wb-views">
                    {Object.entries(views).map(([k, x]) => <button key={k} type="button" className={`tc-tab ${view === k ? 'on' : ''}`} onClick={() => setView(k)}>{x.label} <b>{x.rows.length}</b></button>)}
                </div>
                {!v.rows.length ? <EmptyState icon="mdi-briefcase-off-outline" title={loading === 'profitability' ? 'Loading…' : 'No audit projects match'} /> : <DataTable columns={v.columns} rows={v.rows} accent="#0284c7" barColumn={v.bar} maxHeight={560} />}
            </section>
        </>
    )
}

/* ======================= Punctuality & absence ======================= */
export const PunctualityReport = () => {
    const dispatch = useDispatch()
    const { punctuality: d, loading } = useSelector((state) => state.reportReducer || {})
    const depts = usePeopleDepts()
    const [range, setRange] = useState(PRESETS.month.range())
    const [department, setDepartment] = useState('')
    useEffect(() => { dispatch({ type: reportActions.GET_PUNCTUALITY_REPORT, filters: { from: range[0], to: range[1], department } }) }, [dispatch, range, department])

    const s = d?.summary || {}
    const columns = ['Employee', 'Designation', 'Working days', 'Present', 'Late', 'Avg late (min)', 'Absent', 'Leave', 'Avg first in', 'Avg hrs / day', 'On time']
    const table = (d?.rows || []).map((r) => [fullName(r.employee), r.employee.designation || '', r.workingDays, r.present, r.late, r.avgLate || '', r.absent, r.leave, r.avgFirstIn || '—', r.avgHours, `${r.onTime}%`])
    const trend = d?.trend || []

    return (
        <>
            <FilterBar range={range} setRange={setRange} loading={loading === 'punctuality'} onExport={() => downloadCsv('punctuality', columns, table)}>
                <select className="pp-select" value={department} onChange={(e) => setDepartment(e.target.value)} aria-label="Department"><option value="">All departments</option>{depts.map((x) => <option key={x}>{x}</option>)}</select>
            </FilterBar>
            <div className="at-tiles">
                <Tile icon="mdi-clock-check-outline" color={tone(s.onTime || 0, 85, 70)} value={pct(s.onTime)} label="Arrived on time" />
                <Tile icon="mdi-clock-alert-outline" color="#d97706" value={s.late ?? '–'} label={`Late arrivals · ${s.habitualLate ?? 0} people 3+ times`} />
                <Tile icon="mdi-account-cancel-outline" color={s.absent ? '#e11d48' : '#64748b'} value={s.absent ?? '–'} label="Absent days (no check-in, no leave)" />
                <Tile icon="mdi-timer-outline" color="#7c3aed" value={s.avgHours != null ? `${s.avgHours}h` : '–'} label="Average hours a day" />
            </div>
            {trend.length > 1 && (
                <section className="pp-card rp-chart bi-wide">
                    <h3>Daily attendance and late arrivals</h3>
                    <div className="rp-chart-box">
                        <ReactECharts style={{ height: '100%' }} notMerge option={{
                            tooltip: { trigger: 'axis' },
                            legend: { top: 0, right: 0, textStyle: { color: '#64748b' } },
                            grid: { left: 4, right: 12, top: 30, bottom: 4, containLabel: true },
                            xAxis: { type: 'category', data: trend.map((x) => new Date(`${x.date}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })), axisLabel: { color: '#94a3b8' }, axisTick: { show: false } },
                            yAxis: { type: 'value', minInterval: 1, axisLabel: { color: '#94a3b8' }, splitLine: { lineStyle: { color: '#eef1f5' } } },
                            series: [
                                { name: 'Present', type: 'bar', barWidth: 14, data: trend.map((x) => x.present), itemStyle: { color: '#10b981', borderRadius: [4, 4, 0, 0] } },
                                { name: 'Late', type: 'line', smooth: true, symbolSize: 6, data: trend.map((x) => x.late), itemStyle: { color: '#f59e0b' }, lineStyle: { width: 2.5 } },
                            ],
                        }} />
                    </div>
                </section>
            )}
            <section className="pp-card wb-table">
                {!table.length ? <EmptyState icon="mdi-clock-outline" title={loading === 'punctuality' ? 'Loading…' : 'No one in this view'} /> : <DataTable columns={columns} rows={table} accent="#d97706" barColumn={4} maxHeight={560} />}
            </section>
        </>
    )
}

/* ======================= Document compliance ======================= */
export const ComplianceReport = () => {
    const dispatch = useDispatch()
    const { compliance: d, loading } = useSelector((state) => state.reportReducer || {})
    const [only, setOnly] = useState('missing')
    useEffect(() => { dispatch({ type: reportActions.GET_COMPLIANCE_REPORT }) }, [dispatch])

    const s = d?.summary || {}
    const cats = [...(d?.required || []), ...(d?.recommended || [])]
    const rows = (d?.rows || []).filter((r) => only !== 'missing' || r.missing.length)
    const columns = ['Employee', 'ID', 'Department', ...cats, 'Missing', 'Complete']
    const table = rows.map((r) => [fullName(r.employee), r.employee.employeeId, r.employee.department || '', ...cats.map((c) => (r.has[c] ? '✓' : (d.required.includes(c) ? '✗ missing' : '—'))), r.missing.length, `${r.complete}%`])

    return (
        <>
            <div className="pp-card wb-filters">
                <div className="wb-row">
                    <div className="pj-filters">
                        <button type="button" className={`pj-filter ${only === 'missing' ? 'active' : ''}`} style={{ '--c': '#4c1d95' }} onClick={() => setOnly('missing')}>Missing something</button>
                        <button type="button" className={`pj-filter ${only === 'all' ? 'active' : ''}`} style={{ '--c': '#4c1d95' }} onClick={() => setOnly('all')}>Everyone</button>
                    </div>
                    <span className="wb-spacer"></span>
                    {loading === 'compliance' && <span className="wb-loading"><i className="mdi mdi-loading mdi-spin"></i>Loading…</span>}
                    <Link to="/documents" className="pp-btn"><i className="mdi mdi-upload"></i> Upload documents</Link>
                    <button type="button" className="pp-btn" onClick={() => downloadCsv('document-compliance', columns, table)}><i className="mdi mdi-download-outline"></i> Export CSV</button>
                </div>
            </div>
            <div className="at-tiles">
                <Tile icon="mdi-shield-check-outline" color={tone(s.completePct || 0, 90, 60)} value={pct(s.completePct)} label={`Fully documented · ${s.complete ?? 0} of ${s.people ?? 0}`} />
                <Tile icon="mdi-file-alert-outline" color={s.missingDocs ? '#e11d48' : '#64748b'} value={s.missingDocs ?? '–'} label="Required documents missing" />
                <Tile icon="mdi-calendar-remove-outline" color={s.expired ? '#e11d48' : '#64748b'} value={s.expired ?? '–'} label="Expired" />
                <Tile icon="mdi-calendar-alert" color={s.expiringSoon ? '#d97706' : '#64748b'} value={s.expiringSoon ?? '–'} label="Expiring in 30 days" />
            </div>
            <Note>Required for everyone: {(d?.required || []).join(', ')}. Recommended: {(d?.recommended || []).join(', ')}.</Note>
            {(d?.expiring || []).length > 0 && (
                <section className="pp-card bi-list">
                    <h3>Expired or expiring soon</h3>
                    <ul>
                        {d.expiring.map((e, i) => (
                            <li key={i}><Link to={`/employees/${e.employee._id}?tab=documents`}>{e.employee.employeeId} · {fullName(e.employee)}</Link><span>{e.title} ({e.category})</span><b className={e.days < 0 ? 'bad' : 'warn'}>{e.days < 0 ? `Expired ${dt(e.expiryDate)}` : `Expires ${dt(e.expiryDate)}`}</b></li>
                        ))}
                    </ul>
                </section>
            )}
            <section className="pp-card wb-table">
                {!table.length ? <EmptyState icon="mdi-shield-check-outline" title={loading === 'compliance' ? 'Loading…' : 'Everyone has their required documents'} /> : <DataTable columns={columns} rows={table} accent="#e11d48" barColumn={-1} maxHeight={560} />}
            </section>
        </>
    )
}
