import React, { useMemo } from 'react'
import { Link } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import { ChartWidget } from './ChartWidget'
import { Avatar, fullName } from '../../people/PeopleUI'
import { AUDIT_STATUS, auditStatusMeta, engagementTitle, fmtDuration, useTick, clock } from '../../audits/AuditUI'
import './AuditWidgets.css'

/* -------------------------------------------------------------------------- */
/*  Audit widgets for the dashboard. One brand hue for magnitude (single-     */
/*  series charts need no categorical palette); grey for "Other"; ink-coloured */
/*  labels; recessive grid; a table view via ChartWidget's Data tab.           */
/* -------------------------------------------------------------------------- */

const HUE = '#0284c7'        // magnitude
const HUE_SOFT = '#7cc3ea'   // the same hue, quieter — earlier days / not today
const OTHER = '#cbd5e1'      // folded "Other" bucket
const INK = '#334155'
const MUTED = '#94a3b8'
const GRID = 'rgba(148, 163, 184, .18)'

const tooltipBase = {
    backgroundColor: '#0f172a',
    borderWidth: 0,
    padding: [8, 12],
    textStyle: { color: '#fff', fontSize: 12 },
}

const hours = (min) => Math.round((min / 60) * 10) / 10
const localDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }

/* ---------------- Audit hours, last 14 days (columns over time) ---------------- */
export const AuditHoursTrend = ({ daily = [], scope }) => {
    const totalMin = daily.reduce((s, d) => s + d.minutes, 0)
    const worked = daily.filter((d) => d.minutes > 0)
    const avgH = worked.length ? hours(totalMin / worked.length) : 0
    const todayKey = daily.length ? daily[daily.length - 1].date : ''

    const option = useMemo(() => ({
        tooltip: {
            ...tooltipBase,
            trigger: 'axis',
            axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(2, 132, 199, .06)' } },
            formatter: (p) => {
                const d = daily[p[0].dataIndex]
                const dt = localDate(d.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
                return `<strong>${dt}</strong><br/>${fmtDuration(d.minutes)} logged`
            },
        },
        grid: { left: 8, right: 16, top: 24, bottom: 4, containLabel: true },
        xAxis: {
            type: 'category',
            data: daily.map((d) => d.date),
            axisLine: { lineStyle: { color: GRID } },
            axisTick: { show: false },
            axisLabel: {
                color: MUTED, fontSize: 11, interval: 0,
                formatter: (v) => {
                    const dt = localDate(v)
                    // every other day on narrow charts keeps labels from colliding; today always shows
                    return `${dt.toLocaleDateString(undefined, { weekday: 'narrow' })}\n${dt.getDate()}`
                },
            },
        },
        yAxis: {
            type: 'value',
            name: 'hours',
            nameTextStyle: { color: MUTED, fontSize: 11, align: 'left', padding: [0, 0, 0, -24] },
            splitLine: { lineStyle: { color: GRID } },
            axisLabel: { color: MUTED, fontSize: 11, formatter: (v) => `${v}` },
        },
        series: [{
            type: 'bar',
            barMaxWidth: 22,
            data: daily.map((d) => ({
                value: hours(d.minutes),
                itemStyle: { color: d.date === todayKey ? HUE : HUE_SOFT, borderRadius: [4, 4, 0, 0] },
            })),
            emphasis: { itemStyle: { color: '#075985' } },
            markLine: avgH ? {
                silent: true,
                symbol: 'none',
                lineStyle: { color: INK, type: 'dashed', width: 1, opacity: 0.55 },
                label: { formatter: `avg ${avgH}h / working day`, color: INK, fontSize: 11, position: 'insideEndTop' },
                data: [{ yAxis: avgH }],
            } : undefined,
            animationDuration: 700,
            animationEasing: 'cubicOut',
        }],
    }), [daily, avgH, todayKey])

    return (
        <ChartWidget
            title={scope === 'firm' ? 'Audit hours · last 14 days' : 'My audits · last 14 days'}
            icon="bar-chart-2"
            accent={HUE}
            height={290}
            empty={!totalMin}
            columns={['Date', 'Hours logged']}
            rows={[...daily].reverse().map((d) => [localDate(d.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }), fmtDuration(d.minutes)])}
            graph={<ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge />}
        />
    )
}

/* ---------------- Hours by client, last 30 days (ranked bars) ---------------- */
export const HoursByClient = ({ byClient = [] }) => {
    const total = byClient.reduce((s, c) => s + c.minutes, 0)
    // echarts draws category axes bottom-up; "Other clients" stays last (bottom), the rest largest on top
    const rowsDesc = byClient
    const sorted = useMemo(() => [...rowsDesc].reverse(), [rowsDesc])

    const option = useMemo(() => ({
        tooltip: {
            ...tooltipBase,
            trigger: 'axis',
            axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(2, 132, 199, .06)' } },
            formatter: (p) => {
                const r = sorted[p[0].dataIndex]
                return `<strong>${r.client}</strong><br/>${fmtDuration(r.minutes)} · ${total ? Math.round((r.minutes / total) * 100) : 0}% of client time`
            },
        },
        grid: { left: 4, right: 76, top: 4, bottom: 4, containLabel: true },
        xAxis: { type: 'value', show: false, max: (v) => v.max * 1.05 },
        yAxis: {
            type: 'category',
            data: sorted.map((r) => r.client),
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { color: '#64748b', fontSize: 12, width: 110, overflow: 'truncate', margin: 10 },
        },
        series: [{
            type: 'bar',
            barWidth: 14,
            showBackground: true,
            backgroundStyle: { color: 'rgba(148, 163, 184, .12)', borderRadius: 4 },
            data: sorted.map((r) => ({ value: hours(r.minutes), itemStyle: { color: r.client === 'Other clients' ? OTHER : HUE, borderRadius: [0, 4, 4, 0] } })),
            label: {
                show: true, position: 'right', distance: 8, color: INK, fontSize: 12, fontWeight: 600,
                formatter: (p) => `${p.value}h  {share|${total ? Math.round((sorted[p.dataIndex].minutes / total) * 100) : 0}%}`,
                rich: { share: { color: MUTED, fontSize: 11, fontWeight: 500 } },
            },
            animationDuration: 700,
        }],
    }), [sorted, total])

    return (
        <ChartWidget
            title="Hours by client · 30d"
            icon="briefcase"
            accent={HUE}
            height={290}
            empty={!total}
            columns={['Client', 'Hours', 'Share']}
            rows={rowsDesc.map((r) => [r.client, fmtDuration(r.minutes), `${total ? Math.round((r.minutes / total) * 100) : 0}%`])}
            graph={<ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge />}
        />
    )
}

/* ---------------- Team hours this week (bars against a 40h week) ---------------- */
const WEEK_TARGET_H = 40

export const TeamWeek = ({ byPerson = [], weekStart }) => {
    const sorted = useMemo(() => [...byPerson].reverse(), [byPerson])
    const maxH = Math.max(WEEK_TARGET_H, ...byPerson.map((p) => hours(p.minutes)))
    const since = weekStart ? localDate(weekStart).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : ''

    const option = useMemo(() => ({
        tooltip: {
            ...tooltipBase,
            trigger: 'axis',
            axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(2, 132, 199, .06)' } },
            formatter: (p) => {
                const r = sorted[p[0].dataIndex]
                return `<strong>${fullName(r.employee)}</strong><br/>${fmtDuration(r.minutes)} this week · ${Math.round((r.minutes / 60 / WEEK_TARGET_H) * 100)}% of ${WEEK_TARGET_H}h`
            },
        },
        grid: { left: 4, right: 52, top: 22, bottom: 4, containLabel: true },
        xAxis: { type: 'value', show: false, max: Math.ceil(maxH * 1.08) },
        yAxis: {
            type: 'category',
            data: sorted.map((r) => fullName(r.employee)),
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { color: '#64748b', fontSize: 12, width: 110, overflow: 'truncate', margin: 10 },
        },
        series: [{
            type: 'bar',
            barWidth: 12,
            data: sorted.map((r) => ({ value: hours(r.minutes), itemStyle: { color: HUE, borderRadius: [0, 4, 4, 0] } })),
            label: { show: true, position: 'right', distance: 6, color: INK, fontSize: 11.5, fontWeight: 600, formatter: (p) => `${p.value}h` },
            markLine: {
                silent: true,
                symbol: 'none',
                lineStyle: { color: INK, type: 'dashed', width: 1, opacity: 0.5 },
                label: { formatter: `${WEEK_TARGET_H}h week`, color: INK, fontSize: 11, position: 'end' },
                data: [{ xAxis: WEEK_TARGET_H }],
            },
            animationDuration: 700,
        }],
    }), [sorted, maxH])

    return (
        <ChartWidget
            title="Team hours · this week"
            icon="users"
            accent={HUE}
            height={290}
            empty={!byPerson.length}
            columns={['Person', since ? `Hours since ${since}` : 'Hours this week', `% of ${WEEK_TARGET_H}h`]}
            rows={byPerson.map((r) => [fullName(r.employee), fmtDuration(r.minutes), `${Math.round((r.minutes / 60 / WEEK_TARGET_H) * 100)}%`])}
            graph={<ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge />}
        />
    )
}

/* ---------------- Deadlines ahead (a list, not a chart) ---------------- */
const dueText = (d) => d < 0 ? { text: `${-d}d overdue`, tone: 'late', icon: 'mdi-alert-circle-outline' }
    : d === 0 ? { text: 'Due today', tone: 'soon', icon: 'mdi-flag-checkered' }
        : d <= 7 ? { text: `${d}d left`, tone: 'soon', icon: 'mdi-timer-sand' }
            : { text: `${d}d left`, tone: 'ok', icon: 'mdi-flag-outline' }

export const DeadlinesWidget = ({ deadlines = [] }) => (
    <div className="card card-h-100 aw-card">
        <div className="card-body">
            <div className="aw-head">
                <span className="chart-widget-icon" style={{ background: '#e11d481a', color: '#e11d48' }}><i className="mdi mdi-flag-checkered"></i></span>
                <h5 className="card-title mb-0">Upcoming deadlines</h5>
                <Link to="/audits" className="aw-more">All <i className="mdi mdi-chevron-right"></i></Link>
            </div>
            {!deadlines.length ? (
                <div className="aw-empty"><i className="mdi mdi-calendar-check-outline"></i><span>Nothing due in the next 3 weeks</span></div>
            ) : (
                <ul className="aw-list">
                    {deadlines.map((a) => {
                        const due = dueText(a.daysLeft)
                        const est = a.estimatedHours * 60
                        const pct = est ? Math.min(100, Math.round((a.minutes / est) * 100)) : null
                        const m = auditStatusMeta(a.status)
                        return (
                            <li key={a._id}>
                                <Link to={`/audits/${a._id}`} className="aw-deadline">
                                    <span className="aw-dl-main">
                                        <small>{a.clientName}</small>
                                        <b>{engagementTitle(a)}</b>
                                        <span className="aw-dl-meta">
                                            <span className="aw-status" style={{ '--c': m.color }}><i className={`mdi ${m.icon}`}></i>{a.status}</span>
                                            <span>{fmtDuration(a.minutes)}{est ? ` of ${a.estimatedHours}h` : ''}</span>
                                        </span>
                                        {pct !== null && <span className={`aw-bar ${a.minutes > est ? 'over' : ''}`}><span style={{ width: `${pct}%` }}></span></span>}
                                    </span>
                                    <span className={`aw-due ${due.tone}`}><i className={`mdi ${due.icon}`}></i>{due.text}</span>
                                </Link>
                            </li>
                        )
                    })}
                </ul>
            )}
        </div>
    </div>
)

/* ---------------- Working right now (live) ---------------- */
export const WorkingNowWidget = ({ activeNow = [] }) => {
    const now = useTick(activeNow.length > 0, 1000)
    return (
        <div className="card card-h-100 aw-card">
            <div className="card-body">
                <div className="aw-head">
                    <span className="chart-widget-icon" style={{ background: '#16a34a1a', color: '#16a34a' }}><i className="mdi mdi-account-clock-outline"></i></span>
                    <h5 className="card-title mb-0">Working right now</h5>
                    {activeNow.length > 0 && <span className="aw-live"><span className="au-pulse"></span>{activeNow.length} live</span>}
                </div>
                {!activeNow.length ? (
                    <div className="aw-empty"><i className="mdi mdi-timer-off-outline"></i><span>No audit timers running</span></div>
                ) : (
                    <ul className="aw-list">
                        {activeNow.map((r) => (
                            <li key={`${r.employee._id}-${r.auditId}`}>
                                <Link to={`/audits/${r.auditId}`} className="aw-person">
                                    <Avatar person={r.employee} size={34} />
                                    <span className="aw-person-main">
                                        <b>{fullName(r.employee)}</b>
                                        <small>{r.clientName} · {engagementTitle(r)}</small>
                                        {r.address && <small className="aw-place"><i className="mdi mdi-map-marker-outline"></i>{r.address}</small>}
                                    </span>
                                    <span className="aw-clock">{clock(r.startTime, now)}</span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    )
}

/* ---------------- My week (stat tiles: a headline number is not a chart) ---------------- */
export const MyAuditStrip = ({ me, statusCounts = {} }) => {
    const open = Object.values(statusCounts).reduce((s, n) => s + n, 0)
    return (
        <div className="aw-strip">
            <div className="aw-stat"><span><i className="mdi mdi-timer-outline"></i>My hours today</span><b>{fmtDuration(me?.todayMinutes || 0)}</b></div>
            <div className="aw-stat"><span><i className="mdi mdi-calendar-week"></i>My hours this week</span><b>{fmtDuration(me?.weekMinutes || 0)}</b></div>
            <div className="aw-stat"><span><i className="mdi mdi-briefcase-account-outline"></i>My open audits</span><b>{me?.openAudits || 0}</b></div>
            <div className="aw-stat aw-pipe">
                <span><i className="mdi mdi-chart-timeline-variant"></i>Open audit projects by stage</span>
                <div className="aw-pipe-row">
                    {Object.keys(AUDIT_STATUS).filter((s) => statusCounts[s]).map((s) => (
                        <span key={s} className="aw-status" style={{ '--c': AUDIT_STATUS[s].color }}><i className={`mdi ${AUDIT_STATUS[s].icon}`}></i>{s} <b>{statusCounts[s]}</b></span>
                    ))}
                    {!open && <span className="aw-none">None open</span>}
                </div>
            </div>
        </div>
    )
}

/* ---------------- Needs your attention (seniors) ---------------- */
// Counts that need a decision, each a link to where it's handled. A non-zero count is
// flagged with an icon + the word, never colour alone.
export const AttentionWidget = ({ attention }) => {
    if (!attention) return null
    const items = [
        { n: attention.pendingLeaves, label: 'Leave requests', to: '/leave/approvals', icon: 'mdi-calendar-clock' },
        { n: attention.pendingCorrections, label: 'Attendance corrections', to: '/attendance/regularization', icon: 'mdi-file-document-edit-outline' },
        { n: attention.pendingExpenses, label: 'Expense claims', to: '/expenses/approvals', icon: 'mdi-receipt' },
        { n: attention.overdueAudits, label: 'Audits past deadline', to: '/audits', icon: 'mdi-flag-remove-outline', critical: true },
        { n: attention.overBudgetAudits, label: 'Audits over hour estimate', to: '/audits', icon: 'mdi-timer-sand', critical: true },
    ]
    const waiting = items.reduce((s, i) => s + (i.n || 0), 0)
    const missing = attention.notCheckedIn || { count: 0, people: [] }
    return (
        <div className="card aw-card aw-attention">
            <div className="card-body">
                <div className="aw-head">
                    <span className="chart-widget-icon" style={{ background: '#d977061a', color: '#d97706' }}><i className="mdi mdi-bell-alert-outline"></i></span>
                    <h5 className="card-title mb-0">Needs your attention</h5>
                    <span className={`aw-att-total ${waiting ? 'on' : ''}`}>{waiting ? <><i className="mdi mdi-alert-circle-outline"></i>{waiting} waiting</> : <><i className="mdi mdi-check-circle-outline"></i>All clear</>}</span>
                </div>
                <div className="aw-att-grid">
                    {items.map((i) => (
                        <Link key={i.label} to={i.to} className={`aw-att ${i.n ? (i.critical ? 'critical' : 'warn') : ''}`}>
                            <i className={`mdi ${i.icon}`}></i>
                            <b>{i.n || 0}</b>
                            <span>{i.label}</span>
                        </Link>
                    ))}
                    <Link to="/attendance/team" className={`aw-att ${missing.count ? 'warn' : ''}`}>
                        <i className="mdi mdi-account-question-outline"></i>
                        <b>{missing.count}<small> / {attention.teamSize}</small></b>
                        <span>Not checked in yet</span>
                    </Link>
                </div>
                {missing.count > 0 && (
                    <div className="aw-missing">
                        <small>Not checked in or on leave today:</small>
                        {missing.people.map((p) => <span key={p._id} className="aw-chip"><Avatar person={p} size={20} />{fullName(p)}</span>)}
                        {missing.count > missing.people.length && <span className="aw-chip more">+{missing.count - missing.people.length} more</span>}
                    </div>
                )}
            </div>
        </div>
    )
}

/* ---------------- Audit sessions today (start → end per person, a timeline) ---------------- */
// Each bar is one timer session from its start to its end; a running session grows to "now"
// in green. Bars sit on a real time axis (08:00 → 20:00 or later), so gaps and overlaps read
// at a glance; the client name rides inside bars wide enough to hold it.
const RUNNING = '#16a34a'

export const AuditTimelineToday = ({ sessions = [], dayStart, scope }) => {
    const now = useTick(sessions.some((s) => !s.end), 30000)
    const people = useMemo(() => {
        const seen = new Map()
        sessions.forEach((s) => { if (!seen.has(s.employee._id)) seen.set(s.employee._id, s.employee) })
        return [...seen.values()]
    }, [sessions])
    const d0 = dayStart ? new Date(dayStart).getTime() : new Date().setHours(0, 0, 0, 0)
    const lo = d0 + 8 * 36e5
    const hi = Math.max(d0 + 20 * 36e5, now + 15 * 6e4)
    const minStart = sessions.length ? Math.min(...sessions.map((s) => new Date(s.start).getTime())) : lo
    const from = Math.min(lo, Math.floor(minStart / 36e5) * 36e5)

    const option = useMemo(() => ({
        tooltip: {
            ...tooltipBase,
            formatter: (p) => {
                const s = sessions[p.data.idx]
                const t = (d) => new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                return `<strong>${fullName(s.employee)}</strong><br/>${s.clientName}${s.engagementName ? ` · ${s.engagementName}` : ''}<br/>${t(s.start)} – ${s.end ? t(s.end) : 'now (running)'} · ${fmtDuration(s.end ? s.minutes : (now - new Date(s.start)) / 6e4)}${s.note ? `<br/><em>${s.note.replace(/</g, '&lt;')}</em>` : ''}`
            },
        },
        grid: { left: 8, right: 18, top: 8, bottom: 26, containLabel: true },
        xAxis: {
            type: 'time', min: from, max: hi,
            splitNumber: 6,
            axisLine: { lineStyle: { color: GRID } },
            splitLine: { show: true, lineStyle: { color: GRID } },
            axisLabel: { color: MUTED, fontSize: 11, formatter: (v) => new Date(v).toLocaleTimeString([], { hour: 'numeric' }) },
        },
        yAxis: {
            type: 'category', inverse: true,
            data: people.map(fullName),
            axisLine: { show: false }, axisTick: { show: false },
            axisLabel: { color: '#64748b', fontSize: 12, width: 110, overflow: 'truncate' },
        },
        series: [{
            type: 'custom',
            encode: { x: [1, 2], y: 0 },
            data: sessions.map((s, idx) => ({
                idx,
                value: [people.findIndex((p) => p._id === s.employee._id), new Date(s.start).getTime(), s.end ? new Date(s.end).getTime() : now],
                itemStyle: { color: s.end ? HUE : RUNNING },
                label: s.clientName,
            })),
            renderItem: (params, api) => {
                const y = api.value(0)
                const a = api.coord([api.value(1), y])
                const b = api.coord([api.value(2), y])
                const h = Math.min(18, api.size([0, 1])[1] * 0.55)
                const w = Math.max(3, b[0] - a[0])
                const item = sessions[params.dataIndex]
                const color = item.end ? HUE : RUNNING
                const children = [{ type: 'rect', shape: { x: a[0], y: a[1] - h / 2, width: w, height: h, r: 4 }, style: { fill: color } }]
                if (w > 70) children.push({ type: 'text', style: { x: a[0] + 6, y: a[1], text: item.clientName, fill: '#fff', fontSize: 11, fontWeight: 600, verticalAlign: 'middle', width: w - 12, overflow: 'truncate' } })
                return { type: 'group', children }
            },
        }, {
            // the "now" marker
            type: 'line', data: [], markLine: { silent: true, symbol: 'none', lineStyle: { color: RUNNING, type: 'dashed', width: 1 }, label: { formatter: 'now', color: RUNNING, fontSize: 10, position: 'end' }, data: [{ xAxis: now }] },
        }],
    }), [sessions, people, from, hi, now])

    const height = Math.min(440, Math.max(170, 60 + people.length * 40))
    const t = (d) => new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

    return (
        <ChartWidget
            title={scope === 'mine' ? 'My audit sessions today' : 'Audit sessions today'}
            icon="clock"
            accent={HUE}
            height={height}
            empty={!sessions.length}
            columns={['Person', 'Client · project', 'Start', 'End', 'Duration']}
            rows={sessions.map((s) => [fullName(s.employee), `${s.clientName}${s.engagementName ? ` · ${s.engagementName}` : ''}`, t(s.start), s.end ? t(s.end) : 'Running', fmtDuration(s.end ? s.minutes : (now - new Date(s.start)) / 6e4)])}
            graph={<ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge />}
        />
    )
}
