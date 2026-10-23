import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import { EmptyState, ErrorBanner } from '../../../components/people/PeopleUI'
import { money, moneyShort } from '../../../components/payroll/PayrollUI'
import { chatApi as api } from '../../../components/chat/chatApi'

/* Executive overview — the management page: money (top level only), delivery, people,
   what needs attention, and the trends. Every number links to the report behind it. */

const SEV = { high: ['#e11d48', 'Act now'], medium: ['#d97706', 'This week'], low: ['#1e40af', 'Keep an eye'] }
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0)

export const ExecutiveOverview = ({ onOpen }) => {
    const [d, setD] = useState(null)
    const [err, setErr] = useState('')
    useEffect(() => { api('GET', '/reports/overview').then((j) => setD(j.data)).catch((e) => setErr(e.message)) }, [])
    if (err) return <ErrorBanner error={err} />
    if (!d) return <div className="pp-card"><div className="pw-loading"><i className="mdi mdi-loading mdi-spin"></i></div></div>
    const f = d.finance
    const u = d.utilisation
    const go = (key) => onOpen?.(key)
    const billTrend = f && {
        tooltip: { trigger: 'axis', valueFormatter: (v) => money(v) },
        legend: { top: 0, right: 0, icon: 'circle', textStyle: { fontSize: 11, color: '#64748b' } },
        grid: { left: 4, right: 8, top: 30, bottom: 4, containLabel: true },
        xAxis: { type: 'category', data: f.trend.map((t) => t.month), axisLine: { lineStyle: { color: '#e2e8f0' } }, axisLabel: { color: '#64748b' } },
        yAxis: { type: 'value', axisLabel: { color: '#94a3b8', formatter: (v) => moneyShort(v) }, splitLine: { lineStyle: { color: '#f1f5f9' } } },
        series: [
            { name: 'Billed', type: 'bar', barWidth: 14, itemStyle: { color: '#1e40af', borderRadius: [5, 5, 0, 0] }, data: f.trend.map((t) => t.billed) },
            { name: 'Collected', type: 'bar', barWidth: 14, itemStyle: { color: '#059669', borderRadius: [5, 5, 0, 0] }, data: f.trend.map((t) => t.collected) },
        ],
    }
    const hoursTrend = {
        tooltip: { trigger: 'axis', valueFormatter: (v) => `${v}h` },
        grid: { left: 4, right: 8, top: 10, bottom: 4, containLabel: true },
        xAxis: { type: 'category', data: d.hoursTrend.map((h) => new Date(h.week).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })), axisLine: { lineStyle: { color: '#e2e8f0' } }, axisLabel: { color: '#64748b' } },
        yAxis: { type: 'value', axisLabel: { color: '#94a3b8' }, splitLine: { lineStyle: { color: '#f1f5f9' } } },
        series: [{ type: 'line', smooth: true, symbolSize: 7, data: d.hoursTrend.map((h) => h.hours), lineStyle: { width: 3, color: '#7c3aed' }, itemStyle: { color: '#7c3aed' }, areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(124,58,237,.25)' }, { offset: 1, color: 'rgba(124,58,237,0)' }] } } }],
    }
    const statusOrder = ['Planning', 'Fieldwork', 'Review', 'Reporting', 'On Hold']
    const statusColor = { Planning: '#64748b', Fieldwork: '#0284c7', Review: '#7c3aed', Reporting: '#0891b2', 'On Hold': '#d97706' }

    return (
        <div className="ex">
            {/* headline numbers */}
            <div className="ex-kpis">
                {f && <>
                    <Link to="/audits/billing" className="ex-kpi" style={{ '--c': '#1e40af' }}><small>Billed · FY {f.fy}</small><b>{money(f.billed)}</b><span>{moneyShort(f.unbilled)} still to bill</span></Link>
                    <Link to="/audits/billing" className="ex-kpi" style={{ '--c': '#059669' }}><small>Collected</small><b>{money(f.collected)}</b><span><em><i style={{ width: `${pct(f.collected, f.billed)}%` }}></i></em>{pct(f.collected, f.billed)}% of billed</span></Link>
                    <Link to="/audits/billing" className="ex-kpi" style={{ '--c': f.overdue ? '#e11d48' : '#d97706' }}><small>Outstanding</small><b>{money(f.outstanding)}</b><span>{f.overdue ? `${money(f.overdue)} overdue` : 'nothing overdue'}</span></Link>
                    <button type="button" className="ex-kpi" style={{ '--c': f.marginPct !== null && f.marginPct < 20 ? '#e11d48' : '#7c3aed' }} onClick={() => go('profitability')}><small>Margin on open work</small><b>{f.margin === null ? '—' : money(f.margin)}</b><span>{f.marginPct === null ? 'set fees on audits' : `${f.marginPct}% of fees`}</span></button>
                </>}
                <button type="button" className="ex-kpi" style={{ '--c': '#0284c7' }} onClick={() => go('utilisation')}><small>Utilisation · this month</small><b>{u.utilisation}%</b><span>{Math.round(u.auditHours)}h of {Math.round(u.capacityHours)}h capacity</span></button>
                <button type="button" className="ex-kpi" style={{ '--c': '#0891b2' }} onClick={() => go('auditProjects')}><small>Open engagements</small><b>{d.delivery.open}</b><span>{d.delivery.late ? `${d.delivery.late} past deadline` : 'all on schedule'}</span></button>
                <button type="button" className="ex-kpi" style={{ '--c': '#d97706' }} onClick={() => go('punctuality')}><small>On-time arrivals</small><b>{d.people.onTime}%</b><span>{d.people.headcount} people · {d.people.avgHours}h avg day</span></button>
                <button type="button" className="ex-kpi" style={{ '--c': d.people.compliancePct < 80 ? '#e11d48' : '#059669' }} onClick={() => go('compliance')}><small>Employee files complete</small><b>{d.people.compliancePct}%</b><span>ID, PAN, address, bank</span></button>
            </div>

            <div className="ex-two">
                {/* what needs attention */}
                <section className="pp-card ex-panel">
                    <header><i className="mdi mdi-bell-alert-outline"></i><b>Needs your attention</b><span>{d.attention.length}</span></header>
                    {d.attention.length ? <ul className="ex-att">{d.attention.map((a, i) => (
                        <li key={i} style={{ '--c': SEV[a.sev][0] }}>
                            <Link to={a.link}>
                                <span className="ex-att-ic"><i className={`mdi ${a.icon}`}></i></span>
                                <span className="ex-att-main"><b>{a.title}</b><small>{a.detail}</small></span>
                                <em>{SEV[a.sev][1]}</em><i className="mdi mdi-chevron-right"></i>
                            </Link>
                        </li>
                    ))}</ul> : <EmptyState icon="mdi-check-decagram-outline" title="All clear" text="Nothing needs attention right now." />}
                </section>

                {/* delivery */}
                <section className="pp-card ex-panel">
                    <header><i className="mdi mdi-briefcase-search-outline"></i><b>Delivery</b><button type="button" onClick={() => go('auditProjects')}>Audit projects<i className="mdi mdi-chevron-right"></i></button></header>
                    <div className="ex-pipe">{statusOrder.filter((s) => d.delivery.statusCounts[s]).map((s) => (
                        <div key={s} style={{ '--c': statusColor[s], flex: d.delivery.statusCounts[s] }}><b>{d.delivery.statusCounts[s]}</b><small>{s}</small></div>
                    ))}{!d.delivery.open && <p className="it-muted">No open engagements.</p>}</div>
                    <div className="ex-facts">
                        <div><small>Hours on open work</small><b>{Math.round(d.delivery.loggedHours || 0)}h</b><span>of {d.delivery.estimatedHours || 0}h budgeted</span></div>
                        <div><small>Over budget</small><b className={d.delivery.overBudget ? 'bad' : ''}>{d.delivery.overBudget}</b><span>engagements</span></div>
                        <div><small>Past deadline</small><b className={d.delivery.late ? 'bad' : ''}>{d.delivery.late}</b><span>engagements</span></div>
                    </div>
                    <header className="mt"><i className="mdi mdi-chart-timeline-variant"></i><b>Audit hours · last 8 weeks</b></header>
                    <div className="ex-chart sm"><ReactECharts style={{ height: '100%' }} option={hoursTrend} notMerge /></div>
                </section>
            </div>

            <div className="ex-two">
                {f ? (
                    <section className="pp-card ex-panel">
                        <header><i className="mdi mdi-finance"></i><b>Billing and collections · FY {f.fy}</b><Link to="/audits/billing">Billing<i className="mdi mdi-chevron-right"></i></Link></header>
                        <div className="ex-chart"><ReactECharts style={{ height: '100%' }} option={billTrend} notMerge /></div>
                    </section>
                ) : null}
                <section className="pp-card ex-panel">
                    <header><i className="mdi mdi-speedometer"></i><b>Team utilisation · this month</b><button type="button" onClick={() => go('utilisation')}>Details<i className="mdi mdi-chevron-right"></i></button></header>
                    {u.byDepartment.length ? <ul className="ex-util">{u.byDepartment.map((x) => (
                        <li key={x.department}><span>{x.department}</span><div><i style={{ width: `${Math.min(100, x.utilisation)}%`, background: x.utilisation > 100 ? '#e11d48' : x.utilisation < 30 ? '#94a3b8' : '#0284c7' }}></i></div><b>{x.utilisation}%</b><small>{Math.round(x.auditHours)}h</small></li>
                    ))}</ul> : <p className="it-muted">No capacity data yet.</p>}
                    <div className="ex-facts">
                        <div><small>Over capacity</small><b className={u.overloaded ? 'bad' : ''}>{u.overloaded}</b><span>people</span></div>
                        <div><small>Spare capacity</small><b>{u.bench}</b><span>people under 30%</span></div>
                        <div><small>People in view</small><b>{d.people.headcount}</b><span>{d.people.avgHours}h average day</span></div>
                    </div>
                    {d.topClients?.length > 0 && <>
                        <header className="mt"><i className="mdi mdi-domain"></i><b>Top clients by {d.money ? 'fee' : 'hours'}</b></header>
                        <ul className="ex-clients">{d.topClients.map((c) => <li key={c.name}><span>{c.name}</span><b>{d.money ? moneyShort(c.fee) : `${Math.round(c.loggedHours)}h`}</b>{d.money && c.marginPct !== null && c.marginPct !== undefined ? <em className={c.marginPct < 20 ? 'bad' : ''}>{c.marginPct}% margin</em> : <em>{Math.round(c.loggedHours)}h</em>}</li>)}</ul>
                    </>}
                </section>
            </div>
            <p className="ex-note"><i className="mdi mdi-information-outline"></i>{d.money ? 'Money figures are visible to the firm’s leadership and Accounts only.' : 'You see the figures for your own team.'} Click any number to open the full report.</p>
        </div>
    )
}
