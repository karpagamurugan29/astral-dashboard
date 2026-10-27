import React, { useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import { CATEGORIES, categoryMeta, ownerId } from './ExpenseUI'
import { StatusBadge, CategoryChip, EmptyExpenseState } from './ExpenseParts'
import {
    fmtMoney, fmtShort, fmtDate, isoDay, personName, expenseTitle, expenseRef, sumAmount, pctChange, previousWindow, approvedOn, reimbursedOn,
    exportCsv, exportExcel, PAYMENT_METHODS, DAY,
} from './expenseUtils'

/* -------------------------------------------------------------------------- */
/*  Expense Reports: filters, KPI cards vs previous period, six charts and a   */
/*  detailed, exportable report. Built from the claims already loaded.         */
/* -------------------------------------------------------------------------- */

const INK = '#334155', MUTED = '#94a3b8', GRID = 'rgba(148, 163, 184, .16)', ACCENT = '#4338ca'
const STATUS_C = { Pending: '#d97706', Approved: '#0284c7', Rejected: '#e11d48', Reimbursed: '#059669' }
const tooltip = { backgroundColor: '#0f172a', borderWidth: 0, padding: [8, 12], textStyle: { color: '#fff', fontSize: 12 } }
const APPROVED = ['Approved', 'Processing', 'Reimbursed']
const PENDING = ['Pending', 'Changes Requested']

const today = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d }
const PRESETS = {
    month: ['This month', () => { const t = today(); return [new Date(t.getFullYear(), t.getMonth(), 1), t] }],
    last: ['Last month', () => { const t = new Date(); return [new Date(t.getFullYear(), t.getMonth() - 1, 1), new Date(t.getFullYear(), t.getMonth(), 0, 23, 59, 59, 999)] }],
    quarter: ['This quarter', () => { const t = today(); return [new Date(t.getFullYear(), Math.floor(t.getMonth() / 3) * 3, 1), t] }],
    six: ['Last 6 months', () => { const t = today(); return [new Date(t.getFullYear(), t.getMonth() - 5, 1), t] }],
    year: ['This year', () => { const t = today(); return [new Date(t.getFullYear(), 0, 1), t] }],
}

export const ExpenseChart = ({ title, sub, option, empty, height = 260 }) => (
    <section className="xp-chart">
        <header><b>{title}</b>{sub && <small>{sub}</small>}</header>
        {empty ? <div className="xp-chart-empty"><i className="mdi mdi-chart-box-outline"></i>No data for these filters</div> : <ReactECharts option={option} style={{ height, width: '100%' }} notMerge />}
    </section>
)

// Buckets that fit the range: days for a month, weeks for a quarter, months beyond.
const bucketsFor = (from, to) => {
    const span = (to - from) / DAY
    const out = []
    if (span <= 35) { for (let d = new Date(from); d <= to; d = new Date(d.getTime() + DAY)) out.push([new Date(d.getFullYear(), d.getMonth(), d.getDate()), new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59), d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })]) }
    else if (span <= 120) { for (let d = new Date(from); d <= to; d = new Date(d.getTime() + 7 * DAY)) out.push([new Date(d), new Date(Math.min(d.getTime() + 7 * DAY - 1, to.getTime())), `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`]) }
    else { for (let d = new Date(from.getFullYear(), from.getMonth(), 1); d <= to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) out.push([d, new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59), d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })]) }
    return out
}
const monthBuckets = (from, to) => {
    const out = []
    for (let d = new Date(from.getFullYear(), from.getMonth(), 1); d <= to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) out.push([d, new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59), d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })])
    return out
}
const within = (d, a, b) => { if (!d) return false; const t = new Date(d).getTime(); return t >= a.getTime() && t <= b.getTime() }

export const ExpenseAnalytics = ({ rows, from, to }) => {
    const buckets = useMemo(() => bucketsFor(from, to), [from, to])
    const daily = (to - from) / DAY <= 35 // daily buckets read better as bars than as a curve
    const byCat = useMemo(() => { const m = new Map(); rows.forEach((e) => m.set(e.category, (m.get(e.category) || 0) + Number(e.amount || 0))); return [...m.entries()].sort((a, b) => b[1] - a[1]) }, [rows])
    const byDept = useMemo(() => { const m = new Map(); rows.forEach((e) => { const k = e.employeeId?.department || 'Unassigned'; m.set(k, (m.get(k) || 0) + Number(e.amount || 0)) }); return [...m.entries()].sort((a, b) => a[1] - b[1]) }, [rows])
    const byPerson = useMemo(() => { const m = new Map(); rows.forEach((e) => { const k = String(ownerId(e)); const x = m.get(k) || { name: personName(e.employeeId), amount: 0, count: 0 }; x.amount += Number(e.amount || 0); x.count++; m.set(k, x) }); return [...m.values()].sort((a, b) => b.amount - a.amount).slice(0, 10).reverse() }, [rows])
    const status = useMemo(() => [['Pending', rows.filter((e) => PENDING.includes(e.status))], ['Approved', rows.filter((e) => ['Approved', 'Processing'].includes(e.status))], ['Rejected', rows.filter((e) => e.status === 'Rejected')], ['Reimbursed', rows.filter((e) => e.status === 'Reimbursed')]].map(([k, list]) => ({ name: k, value: sumAmount(list), count: list.length })), [rows])

    const axis = { axisLine: { lineStyle: { color: GRID } }, axisTick: { show: false }, axisLabel: { color: MUTED, fontSize: 11 } }
    const valAxis = { type: 'value', splitLine: { lineStyle: { color: GRID } }, axisLabel: { color: MUTED, fontSize: 11, formatter: (v) => fmtShort(v) } }
    const overTime = {
        tooltip: { ...tooltip, trigger: 'axis', valueFormatter: (v) => fmtMoney(v) },
        grid: { left: 8, right: 12, top: 16, bottom: 4, containLabel: true },
        xAxis: { type: 'category', data: buckets.map((b) => b[2]), boundaryGap: daily, ...axis },
        yAxis: valAxis,
        series: [daily ? { type: 'bar', barMaxWidth: 14, itemStyle: { color: ACCENT, borderRadius: [3, 3, 0, 0] }, data: buckets.map(([a, b]) => sumAmount(rows.filter((e) => within(e.expenseDate, a, b)))) } : { type: 'line', smooth: 0.25, symbol: 'circle', symbolSize: 5, data: buckets.map(([a, b]) => sumAmount(rows.filter((e) => within(e.expenseDate, a, b)))), lineStyle: { color: ACCENT, width: 2 }, itemStyle: { color: ACCENT }, areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(67, 56, 202, .18)' }, { offset: 1, color: 'rgba(67, 56, 202, 0)' }] } } }],
    }
    const catOpt = {
        tooltip: { ...tooltip, trigger: 'item', formatter: (p) => `<b>${p.name}</b><br/>${fmtMoney(p.value)} · ${p.percent}%` },
        legend: { orient: 'vertical', right: 0, top: 'middle', itemWidth: 9, itemHeight: 9, icon: 'circle', textStyle: { color: INK, fontSize: 11.5 }, formatter: (n) => `${n === 'Client Entertainment' ? 'Entertainment' : n}` },
        series: [{ type: 'pie', radius: ['52%', '76%'], center: ['32%', '50%'], avoidLabelOverlap: true, label: { show: false }, itemStyle: { borderColor: '#fff', borderWidth: 2 }, data: byCat.map(([k, v]) => ({ name: k, value: Math.round(v), itemStyle: { color: categoryMeta(k).color } })) }],
    }
    const hbar = (data, color) => ({
        tooltip: { ...tooltip, trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v) => fmtMoney(v) },
        grid: { left: 4, right: 56, top: 4, bottom: 4, containLabel: true },
        xAxis: { type: 'value', show: false },
        yAxis: { type: 'category', data: data.map((d) => d[0]), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: INK, fontSize: 11.5, width: 120, overflow: 'truncate' } },
        series: [{ type: 'bar', barWidth: 12, data: data.map((d) => Math.round(d[1])), itemStyle: { color, borderRadius: [0, 4, 4, 0] }, showBackground: true, backgroundStyle: { color: 'rgba(148, 163, 184, .1)', borderRadius: 4 }, label: { show: true, position: 'right', color: INK, fontSize: 11, formatter: (p) => fmtShort(p.value) } }],
    })
    const statusOpt = {
        tooltip: { ...tooltip, trigger: 'item', formatter: (p) => `<b>${p.name}</b><br/>${fmtMoney(p.value)} · ${status.find((s) => s.name === p.name)?.count || 0} claims` },
        legend: { bottom: 0, itemWidth: 9, itemHeight: 9, icon: 'circle', textStyle: { color: INK, fontSize: 11.5 } },
        series: [{ type: 'pie', radius: ['50%', '72%'], center: ['50%', '44%'], label: { show: false }, itemStyle: { borderColor: '#fff', borderWidth: 2 }, data: status.map((s) => ({ name: s.name, value: Math.round(s.value), itemStyle: { color: STATUS_C[s.name] } })) }],
    }
    // monthly, covering at least the last six months (or the whole range when it's longer)
    const months = monthBuckets(new Date(Math.min(from.getTime(), new Date(to.getFullYear(), to.getMonth() - 5, 1).getTime())), to)
    const reimbOpt = {
        tooltip: { ...tooltip, trigger: 'axis', valueFormatter: (v) => fmtMoney(v) },
        legend: { right: 0, top: 0, itemWidth: 10, itemHeight: 3, textStyle: { color: INK, fontSize: 11.5 }, data: ['Approved', 'Reimbursed'] },
        grid: { left: 8, right: 12, top: 28, bottom: 4, containLabel: true },
        xAxis: { type: 'category', data: months.map((b) => b[2]), ...axis },
        yAxis: valAxis,
        series: [
            { name: 'Approved', type: 'bar', barMaxWidth: 16, data: months.map(([a, b]) => sumAmount(rows.filter((e) => APPROVED.includes(e.status) && within(approvedOn(e), a, b)))), itemStyle: { color: '#93c5fd', borderRadius: [3, 3, 0, 0] } },
            { name: 'Reimbursed', type: 'bar', barMaxWidth: 16, data: months.map(([a, b]) => sumAmount(rows.filter((e) => e.status === 'Reimbursed' && within(reimbursedOn(e), a, b)))), itemStyle: { color: '#059669', borderRadius: [3, 3, 0, 0] } },
        ],
    }
    const none = !rows.length
    return (
        <div className="xp-charts">
            <div className="span2"><ExpenseChart title="Spending over time" sub={`${fmtDate(from)} – ${fmtDate(to)}`} option={overTime} empty={none} /></div>
            <ExpenseChart title="Expenses by category" option={catOpt} empty={none} />
            <ExpenseChart title="Approval status" sub="By amount" option={statusOpt} empty={none} />
            <ExpenseChart title="Department spending" option={hbar(byDept, '#4338ca')} empty={none} height={Math.max(180, byDept.length * 34 + 20)} />
            <ExpenseChart title="Top spenders" sub="Highest total claims" option={hbar(byPerson.map((p) => [p.name, p.amount]), '#0ea5e9')} empty={none} height={Math.max(180, byPerson.length * 30 + 20)} />
            <div className="span2"><ExpenseChart title="Reimbursement trend" sub="Approved vs reimbursed, by month" option={reimbOpt} empty={none} /></div>
        </div>
    )
}

/* ---------------- the Reports view ---------------- */
export const ExpenseReports = ({ list, employees, departments }) => {
    const [preset, setPreset] = useState('month')
    const [custom, setCustom] = useState({ from: '', to: '' })
    const [f, setF] = useState({ department: '', employee: '', category: '', status: '', payment: '' })
    const [range] = useMemo(() => {
        if (preset === 'custom' && custom.from && custom.to) return [[new Date(`${custom.from}T00:00:00`), new Date(`${custom.to}T23:59:59`)]]
        return [PRESETS[preset === 'custom' ? 'month' : preset][1]()]
    }, [preset, custom])
    const [from, to] = range
    const base = useMemo(() => list.filter((e) => e.status !== 'Draft'
        && (!f.department || e.employeeId?.department === f.department)
        && (!f.employee || String(ownerId(e)) === f.employee)
        && (!f.category || e.category === f.category)
        && (!f.status || (f.status === 'Pending' ? PENDING.includes(e.status) : f.status === 'Approved' ? ['Approved', 'Processing'].includes(e.status) : e.status === f.status))
        && (!f.payment || e.paymentMethod === f.payment)), [list, f])
    const rows = useMemo(() => base.filter((e) => within(e.expenseDate, from, to)).sort((a, b) => new Date(b.expenseDate) - new Date(a.expenseDate)), [base, from, to])
    const [pf, pt] = previousWindow(from, to)
    const prev = useMemo(() => base.filter((e) => within(e.expenseDate, pf, pt)), [base, pf, pt])

    const k = (sel) => [sumAmount(rows.filter(sel)), sumAmount(prev.filter(sel))]
    const total = k(() => true)
    const approved = k((e) => APPROVED.includes(e.status))
    const pending = k((e) => PENDING.includes(e.status))
    const rejected = k((e) => e.status === 'Rejected')
    const reimbursed = k((e) => e.status === 'Reimbursed')
    const avg = [rows.length ? total[0] / rows.length : 0, prev.length ? total[1] / prev.length : 0]
    const cards = [
        ['Total spending', total, 'mdi-wallet-outline', '#4338ca'], ['Approved', approved, 'mdi-check-circle-outline', '#0284c7'],
        ['Pending', pending, 'mdi-timer-sand', '#d97706'], ['Rejected', rejected, 'mdi-close-circle-outline', '#e11d48'],
        ['Reimbursed', reimbursed, 'mdi-cash-check', '#059669'], ['Average expense', avg, 'mdi-chart-line-variant', '#475569'],
    ]
    const sameMonth = from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear() && from.getDate() === 1
    const title = sameMonth ? `${from.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })} Expense Report` : `${fmtDate(from)} – ${fmtDate(to)} Expense Report`
    const fileName = title.toLowerCase().replace(/[^\w]+/g, '-').replace(/-+$/, '')
    const printReport = () => { document.body.classList.add('xp-printing'); const done = () => { document.body.classList.remove('xp-printing'); window.removeEventListener('afterprint', done) }; window.addEventListener('afterprint', done); window.print(); setTimeout(done, 1500) }
    const set = (key) => (e) => setF((x) => ({ ...x, [key]: e.target.value }))

    return (
        <div className="xp-reports">
            <header className="xp-rep-head">
                <div><h2>Expense Reports</h2><p>Analyze spending patterns, expenses and reimbursement activity</p></div>
                <button type="button" className="xp-btn" onClick={() => exportExcel(rows, fileName, 'Expense report')} disabled={!rows.length}><i className="mdi mdi-download"></i>Export report</button>
            </header>
            <div className="xp-rep-controls">
                <div className="xp-seg" role="group" aria-label="Date range">
                    {Object.entries(PRESETS).map(([key, [label]]) => <button key={key} type="button" className={preset === key ? 'on' : ''} onClick={() => setPreset(key)}>{label}</button>)}
                    <button type="button" className={preset === 'custom' ? 'on' : ''} onClick={() => setPreset('custom')}>Custom</button>
                </div>
                {preset === 'custom' && <><input type="date" className="xp-input" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} aria-label="From" /><input type="date" className="xp-input" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} aria-label="To" /></>}
                {departments.length > 1 && <select className="xp-input" value={f.department} onChange={set('department')} aria-label="Department"><option value="">All departments</option>{departments.map((d) => <option key={d}>{d}</option>)}</select>}
                {employees.length > 1 && <select className="xp-input" value={f.employee} onChange={set('employee')} aria-label="Employee"><option value="">All employees</option>{employees.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
                <select className="xp-input" value={f.category} onChange={set('category')} aria-label="Category"><option value="">All categories</option>{CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.value}</option>)}</select>
                <select className="xp-input" value={f.status} onChange={set('status')} aria-label="Status"><option value="">Any status</option>{['Pending', 'Approved', 'Rejected', 'Reimbursed'].map((s) => <option key={s}>{s}</option>)}</select>
                <select className="xp-input" value={f.payment} onChange={set('payment')} aria-label="Payment method"><option value="">Any payment</option>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</select>
            </div>

            <div className="xp-summary rep">
                {cards.map(([label, [now, before], icon, c]) => {
                    const t = pctChange(now, before)
                    return (
                        <div key={label} className="xp-stat" style={{ '--c': c }}>
                            <div className="xp-stat-top"><span>{label}</span><i className={`mdi ${icon}`}></i></div>
                            <b>{fmtShort(now)}</b>
                            <div className="xp-stat-foot">{before ? <><em className={t > 0 ? 'up' : t < 0 ? 'down' : ''}><i className={`mdi ${t > 0 ? 'mdi-arrow-up' : t < 0 ? 'mdi-arrow-down' : 'mdi-minus'}`}></i>{Math.abs(t).toFixed(1)}%</em><small>vs previous period</small></> : <small>No data in the previous period</small>}</div>
                        </div>
                    )
                })}
            </div>

            <ExpenseAnalytics rows={rows} from={from} to={to} />

            <section className="xp-report-doc" id="xp-report">
                <header>
                    <div><h3>{title}</h3><p>{rows.length} expense{rows.length === 1 ? '' : 's'} · generated {fmtDate(new Date())}{f.department ? ` · ${f.department}` : ''}{f.category ? ` · ${f.category}` : ''}</p></div>
                    <div className="xp-rep-actions">
                        <button type="button" className="xp-btn sm" onClick={() => exportCsv(rows, fileName)} disabled={!rows.length}><i className="mdi mdi-file-delimited-outline"></i>CSV</button>
                        <button type="button" className="xp-btn sm" onClick={() => exportExcel(rows, fileName, 'Expense report')} disabled={!rows.length}><i className="mdi mdi-file-excel-outline"></i>Excel</button>
                        <button type="button" className="xp-btn sm" onClick={printReport} disabled={!rows.length} title="Choose “Save as PDF” in the print dialog"><i className="mdi mdi-file-pdf-box"></i>PDF</button>
                        <button type="button" className="xp-btn sm" onClick={printReport} disabled={!rows.length}><i className="mdi mdi-printer"></i>Print</button>
                    </div>
                </header>
                <div className="xp-rep-totals">
                    <div><span>Total expenses</span><b>{rows.length}</b></div>
                    <div><span>Total amount</span><b>{fmtMoney(total[0])}</b></div>
                    <div><span>Approved</span><b>{fmtMoney(approved[0])}</b></div>
                    <div><span>Rejected</span><b>{fmtMoney(rejected[0])}</b></div>
                    <div><span>Pending</span><b>{fmtMoney(pending[0])}</b></div>
                    <div><span>Reimbursed</span><b>{fmtMoney(reimbursed[0])}</b></div>
                </div>
                {!rows.length ? <EmptyExpenseState icon="mdi-file-chart-outline" title="Nothing in this period" text="Try a wider date range or fewer filters." /> : (
                    <div className="xp-table-wrap">
                        <table className="xp-table compact">
                            <thead><tr><th>Date</th><th>Reference</th><th>Expense</th><th>Employee</th><th>Department</th><th>Category</th><th>Status</th><th className="num">Amount</th></tr></thead>
                            <tbody>{rows.map((e) => (
                                <tr key={e._id}><td>{fmtDate(e.expenseDate)}</td><td className="xp-muted">{expenseRef(e)}</td><td>{expenseTitle(e)}</td><td>{personName(e.employeeId)}</td><td>{e.employeeId?.department || '—'}</td><td><CategoryChip category={e.category} /></td><td><StatusBadge status={e.status} /></td><td className="num"><b>{fmtMoney(e.amount, e.currency || 'INR')}</b></td></tr>
                            ))}</tbody>
                            <tfoot><tr><td colSpan={7}>Total</td><td className="num"><b>{fmtMoney(total[0])}</b></td></tr></tfoot>
                        </table>
                    </div>
                )}
            </section>
        </div>
    )
}

export { isoDay }
