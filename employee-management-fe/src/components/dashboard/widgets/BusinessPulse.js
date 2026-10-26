import React from 'react'
import { Link } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import { Panel, Ring, EmptyState } from './PremiumUI'
import { Avatar, fullName } from '../../people/PeopleUI'
import { money, moneyShort } from '../../payroll/PayrollUI'
import { engagementTitle } from '../../audits/AuditUI'
import './BusinessPulse.css'

// "Business pulse": four quick reads on how the firm is doing — utilisation this week,
// profitability / budget burn of open audits, punctuality this month, document compliance.
// Staff see their own utilisation this week. Each card links to its full report.

const tone = (v, good, ok) => (v >= good ? '#059669' : v >= ok ? '#d97706' : '#e11d48')
const more = (to) => <Link to={to} className="pp-link">Report <i className="mdi mdi-chevron-right"></i></Link>

const Person = ({ p, right, sub }) => (
    <li className="bp-person">
        <Avatar person={p} size={26} />
        <span className="bp-name"><b>{fullName(p)}</b>{sub && <small>{sub}</small>}</span>
        <span className="bp-right">{right}</span>
    </li>
)

const UtilisationCard = ({ u }) => (
    <Panel icon="mdi-speedometer" color="#7c3aed" title="Utilisation this week" subtitle="Audit hours ÷ available hours" actions={more('/reports/attendance?r=utilisation')} className="bp-card">
        <div className="bp-hero">
            <Ring value={Math.min(100, u.utilisation)} label={`${u.utilisation}%`} size={74} color={tone(u.utilisation, 70, 40)} track="#eef1f5" />
            <div className="bp-facts">
                <span><b>{u.auditHours}h</b> on audits</span>
                <span><b>{u.capacityHours}h</b> available</span>
                <span className={u.bench ? 'warn' : ''}><b>{u.bench}</b> on the bench</span>
                <span className={u.overloaded ? 'bad' : ''}><b>{u.overloaded}</b> overloaded</span>
            </div>
        </div>
        {u.top?.length > 0 && (
            <div className="bp-split">
                <div><h4>Busiest</h4><ul>{u.top.map((r) => <Person key={r.employee._id} p={r.employee} right={<b style={{ color: r.utilisation > 100 ? '#e11d48' : '#7c3aed' }}>{r.utilisation}%</b>} />)}</ul></div>
                <div><h4>Most available</h4><ul>{u.bottom.map((r) => <Person key={r.employee._id} p={r.employee} right={<b style={{ color: '#64748b' }}>{r.utilisation}%</b>} />)}</ul></div>
            </div>
        )}
    </Panel>
)

const ProfitCard = ({ p }) => (
    <Panel icon={p.money ? 'mdi-finance' : 'mdi-timer-sand'} color="#0284c7" title={p.money ? 'Open audits · money' : 'Open audits · budget'} subtitle={p.money ? 'Fees against cost of time so far' : 'Hours logged against budget'} actions={more('/reports/attendance?r=profitability')} className="bp-card">
        {p.money ? (
            <div className="bp-money">
                <div><small>Fees</small><b>{moneyShort(p.fee)}</b></div>
                <div><small>Cost of time</small><b>{moneyShort(p.cost)}</b></div>
                <div><small>Margin</small><b style={{ color: tone(p.marginPct ?? 0, 40, 15) }}>{p.marginPct ?? 0}%</b></div>
            </div>
        ) : (
            <div className="bp-money">
                <div><small>Logged</small><b>{p.loggedHours}h</b></div>
                <div><small>Budget</small><b>{p.estimatedHours}h</b></div>
                <div><small>Over budget</small><b style={{ color: p.overBudget ? '#e11d48' : '#059669' }}>{p.overBudget}</b></div>
            </div>
        )}
        <h4 className="bp-h">Watch list</h4>
        {!p.watch?.length ? <p className="bp-ok"><i className="mdi mdi-check-circle-outline"></i>No audit is near or over its budget.</p> : (
            <ul className="bp-watch">
                {p.watch.map((r) => (
                    <li key={r._id}>
                        <span className="bp-name"><b>{engagementTitle(r)}</b><small>{r.clientName}</small></span>
                        <span className="bp-bar"><i style={{ width: `${Math.min(100, r.budgetUsed || 0)}%`, background: (r.budgetUsed || 0) > 100 ? '#e11d48' : '#f59e0b' }}></i></span>
                        <b className="bp-right" style={{ color: (r.budgetUsed || 0) > 100 ? '#e11d48' : '#b45309' }}>{r.budgetUsed ?? '—'}%</b>
                    </li>
                ))}
            </ul>
        )}
    </Panel>
)

const PunctualityCard = ({ q }) => (
    <Panel icon="mdi-clock-check-outline" color="#d97706" title="Punctuality this month" subtitle="Arrivals before shift start" actions={more('/reports/attendance?r=punctuality')} className="bp-card">
        <div className="bp-hero">
            <Ring value={q.onTime} size={74} color={tone(q.onTime, 85, 70)} track="#eef1f5" />
            <div className="bp-facts">
                <span><b>{q.late}</b> late arrivals</span>
                <span className={q.habitualLate ? 'warn' : ''}><b>{q.habitualLate}</b> late 3+ times</span>
                <span className={q.absent ? 'bad' : ''}><b>{q.absent}</b> absent days</span>
                <span><b>{q.avgHours}h</b> avg a day</span>
            </div>
        </div>
        {q.trend?.length > 1 && (
            <div className="bp-spark">
                <ReactECharts style={{ height: 70 }} notMerge option={{
                    grid: { left: 0, right: 0, top: 6, bottom: 0 },
                    tooltip: { trigger: 'axis', formatter: (ps) => `${ps[0].axisValue}<br/>Present ${ps[0].value} · Late ${ps[1].value}` },
                    xAxis: { type: 'category', data: q.trend.map((x) => new Date(`${x.date}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })), show: false },
                    yAxis: { type: 'value', show: false },
                    series: [
                        { type: 'bar', data: q.trend.map((x) => x.present), barWidth: '55%', itemStyle: { color: '#d1fae5', borderRadius: [3, 3, 0, 0] } },
                        { type: 'line', data: q.trend.map((x) => x.late), smooth: true, symbol: 'none', lineStyle: { color: '#f59e0b', width: 2 } },
                    ],
                }} />
                <small>Last 2 weeks · bars present, line late</small>
            </div>
        )}
        {q.topLate?.length > 0 && <ul>{q.topLate.map((r) => <Person key={r.employee._id} p={r.employee} sub={r.avgFirstIn ? `avg in ${r.avgFirstIn}` : ''} right={<b style={{ color: '#b45309' }}>{r.late}× late</b>} />)}</ul>}
    </Panel>
)

const ComplianceCard = ({ c }) => (
    <Panel icon="mdi-shield-check-outline" color="#e11d48" title="Document compliance" subtitle="ID, address, PAN and bank on file" actions={more('/reports/attendance?r=compliance')} className="bp-card">
        <div className="bp-hero">
            <Ring value={c.completePct} size={74} color={tone(c.completePct, 90, 60)} track="#eef1f5" />
            <div className="bp-facts">
                <span><b>{c.complete}</b> of {c.people} complete</span>
                <span className={c.missingDocs ? 'bad' : ''}><b>{c.missingDocs}</b> documents missing</span>
                <span className={c.expired ? 'bad' : ''}><b>{c.expired}</b> expired</span>
                <span className={c.expiringSoon ? 'warn' : ''}><b>{c.expiringSoon}</b> expiring in 30d</span>
            </div>
        </div>
        {c.missing?.length > 0 && (
            <>
                <h4 className="bp-h">Still missing</h4>
                <ul>{c.missing.map((r) => <Person key={r.employee._id} p={r.employee} sub={r.missing.join(', ')} right={<Link to={`/employees/${r.employee._id}?tab=documents`} className="bp-mini">Upload</Link>} />)}</ul>
            </>
        )}
    </Panel>
)

const EXP_COLORS = ['#ea580c', '#0284c7', '#7c3aed', '#059669', '#db2777', '#64748b']
const STATUS_TONE = { Pending: '#d97706', Approved: '#0284c7', Reimbursed: '#059669', Rejected: '#e11d48' }

const TeamExpensesCard = ({ x }) => {
    const total = x.byCategory.reduce((t, c) => t + c.amount, 0)
    return (
        <Panel icon="mdi-receipt" color="#ea580c" title="Expenses" subtitle="Team claims this month" actions={<Link to="/expenses/approvals" className="pp-link">Approve <i className="mdi mdi-chevron-right"></i></Link>} className="bp-card">
            <div className="bp-money">
                <div><small>This month</small><b>{moneyShort(x.month.amount)}</b></div>
                <div className={x.pending.count ? 'warn' : ''}><small>Awaiting you</small><b>{x.pending.count}</b><em>{moneyShort(x.pending.amount)}</em></div>
                <div><small>To reimburse</small><b>{moneyShort(x.month.toBePaid)}</b></div>
            </div>
            {total > 0 ? (
                <>
                    <div className="bp-stack" role="img" aria-label="Spend by category">
                        {x.byCategory.map((c, i) => <i key={c.category} style={{ width: `${(c.amount / total) * 100}%`, background: EXP_COLORS[i % EXP_COLORS.length] }} title={`${c.category}: ${money(c.amount)}`}></i>)}
                    </div>
                    <ul className="bp-legend">
                        {x.byCategory.slice(0, 4).map((c, i) => <li key={c.category}><i style={{ background: EXP_COLORS[i % EXP_COLORS.length] }}></i>{c.category}<b>{moneyShort(c.amount)}</b></li>)}
                    </ul>
                </>
            ) : <p className="bp-ok"><i className="mdi mdi-check-circle-outline"></i>No claims yet this month.</p>}
            {x.trend.some((t) => t.amount) && (
                <div className="bp-spark">
                    <ReactECharts style={{ height: 56 }} notMerge option={{
                        grid: { left: 0, right: 0, top: 4, bottom: 0 },
                        tooltip: { trigger: 'axis', valueFormatter: (v) => money(v) },
                        xAxis: { type: 'category', data: x.trend.map((t) => t.month), show: false },
                        yAxis: { type: 'value', show: false },
                        series: [{ type: 'bar', data: x.trend.map((t) => t.amount), barWidth: '50%', itemStyle: { color: '#fed7aa', borderRadius: [3, 3, 0, 0] }, emphasis: { itemStyle: { color: '#ea580c' } } }],
                    }} />
                    <small>Last 6 months</small>
                </div>
            )}
        </Panel>
    )
}

const MyExpenses = ({ e }) => {
    if (!e) return null
    return (
        <Panel icon="mdi-receipt" color="#ea580c" title="My expenses" subtitle="Your claims and where they stand" actions={<Link to="/expenses" className="pp-link">New claim <i className="mdi mdi-plus"></i></Link>} className="bp-me">
            <div className="bp-money">
                <div><small>Claimed this month</small><b>{moneyShort(e.monthTotal)}</b><em>{e.monthCount} claim{e.monthCount === 1 ? '' : 's'}</em></div>
                <div className={e.pending.count ? 'warn' : ''}><small>Waiting approval</small><b>{e.pending.count}</b><em>{moneyShort(e.pending.amount)}</em></div>
                <div><small>Approved, to be paid</small><b>{moneyShort(e.toBePaid.amount)}</b><em>{e.toBePaid.count} claim{e.toBePaid.count === 1 ? '' : 's'}</em></div>
            </div>
            {e.recent.length ? (
                <ul className="bp-claims">
                    {e.recent.map((c) => (
                        <li key={c._id}>
                            <span className="bp-name"><b>{c.category}</b><small>{new Date(c.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}{c.description ? ` · ${c.description.replace(/^\[Demo\]\s*/, '')}` : ''}</small></span>
                            <b className="bp-right">{money(c.amount)}</b>
                            <span className="bp-status" style={{ '--c': STATUS_TONE[c.status] || '#64748b' }}>{c.status}</span>
                        </li>
                    ))}
                </ul>
            ) : (
                <div className="bp-claim-empty">
                    <EmptyState icon="mdi-receipt" tone="#ea580c" title="No claims yet" hint="Spent money on client work? Add a claim with the bill and track it here." />
                    <div className="bp-claim-quick">
                        {[['Travel', 'mdi-car-outline'], ['Food', 'mdi-silverware-fork-knife'], ['Hotel', 'mdi-bed-outline'], ['Other', 'mdi-dots-horizontal-circle-outline']].map(([c, ic]) => (
                            <Link key={c} to="/expenses"><i className={`mdi ${ic}`}></i>{c}</Link>
                        ))}
                    </div>
                </div>
            )}
        </Panel>
    )
}

// Mon → Sun of the current week from the 14-day audit series: one bar per day, today outlined.
const WeekStrip = ({ daily = [] }) => {
    const byDate = new Map(daily.map((d) => [d.date, d.minutes]))
    const today = new Date()
    const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7))
    const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return { d, k: key(d), min: byDate.get(key(d)) || 0 } })
    const max = Math.max(8 * 60, ...days.map((x) => x.min))
    return (
        <div className="bp-week">
            {days.map(({ d, k, min }) => {
                const future = k > key(today)
                const weekend = d.getDay() === 0 || d.getDay() === 6
                return (
                    <div key={k} className={`bp-day ${k === key(today) ? 'today' : ''} ${future ? 'future' : ''} ${weekend ? 'weekend' : ''}`} title={`${d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })} · ${Math.round((min / 60) * 10) / 10}h on audits`}>
                        <small>{min ? `${Math.round((min / 60) * 10) / 10}h` : future ? '' : '–'}</small>
                        <span className="bp-day-bar"><i style={{ height: `${(min / max) * 100}%` }}></i></span>
                        <b>{d.toLocaleDateString(undefined, { weekday: 'narrow' })}</b>
                    </div>
                )
            })}
        </div>
    )
}

const MyWeek = ({ me, daily }) => {
    const u = me?.utilisation
    if (!u) return null
    return (
        <Panel icon="mdi-speedometer" color="#7c3aed" title="My week" subtitle="Your audit hours against the hours available this week" className="bp-me">
            <div className="bp-me-row">
                <Ring value={Math.min(100, u.utilisation)} label={`${u.utilisation}%`} size={70} color={tone(u.utilisation, 70, 40)} track="#eef1f5" />
                <div className="bp-me-facts">
                    <div><small>On audits</small><b>{u.auditHours}h</b></div>
                    <div><small>Checked in</small><b>{u.attendedHours}h</b></div>
                    <div><small>Available</small><b>{u.capacityHours}h</b></div>
                    <div><small>Audits worked on</small><b>{u.audits}</b></div>
                </div>
            </div>
            <WeekStrip daily={daily} />
            <div className="bp-me-row">
                <p className="bp-me-tip">{u.utilisation >= 70 ? 'Great week — most of your time is going into audit work.' : u.auditHours === 0 ? 'No audit time yet this week. Start the timer on an audit from “My audits” when you begin work.' : 'Remember to run the audit timer whenever you work on a client job.'}</p>
            </div>
        </Panel>
    )
}

export const BusinessPulse = ({ data, daily }) => {
    if (!data || data.error) return null
    const t = data.team
    if (!t) return (
        <div className="bp-staff">
            <MyWeek me={data.me} daily={daily} />
            <MyExpenses e={data.me?.expenses} />
        </div>
    )
    return (
        <>
            <div className="bp-title"><i className="mdi mdi-pulse"></i>Business pulse</div>
            <div className="bp-grid">
                <UtilisationCard u={t.utilisation} />
                <ProfitCard p={t.profitability} />
                {t.expenses && <TeamExpensesCard x={t.expenses} />}
                <PunctualityCard q={t.punctuality} />
                <ComplianceCard c={t.compliance} />
                <MyExpenses e={data.me?.expenses} />
            </div>
        </>
    )
}
