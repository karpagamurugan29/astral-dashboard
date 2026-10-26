import React, { useMemo } from 'react'
import { Link } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import * as echarts from 'echarts'
import { ChartWidget } from './ChartWidget'
import { Avatar, fullName } from '../../people/PeopleUI'
import { AUDIT_STATUS, auditStatusMeta, engagementTitle, fmtDuration, useTick, clock } from '../../audits/AuditUI'
import './AuditWidgets.css'
import { Live } from '../../common/Live'
import { Panel, EmptyState, LivePill } from './PremiumUI'

/* -------------------------------------------------------------------------- */
/*  Audit widgets for the dashboard. One brand hue for magnitude (single-     */
/*  series charts need no categorical palette); grey for "Other"; ink-coloured */
/*  labels; recessive grid; a table view via ChartWidget's Data tab.           */
/* -------------------------------------------------------------------------- */

const HUE = '#0284c7'        // magnitude
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

// Vertical / horizontal gradients give bars depth without adding colours.
const vGrad = (top, bottom) => new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: top }, { offset: 1, color: bottom }])
const hGrad = (from, to) => new echarts.graphic.LinearGradient(0, 0, 1, 0, [{ offset: 0, color: from }, { offset: 1, color: to }])
const BAR = () => vGrad('#38bdf8', '#0284c7')
const BAR_SOFT = () => vGrad('#bae6fd', '#7dd3fc')
const BAR_TODAY = () => vGrad('#a78bfa', '#6d28d9')
const isWeekend = (key) => { const d = localDate(key).getDay(); return d === 0 || d === 6 }

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
                    return v === todayKey ? `{today|${dt.toLocaleDateString(undefined, { weekday: 'narrow' })}\n${dt.getDate()}}` : `${dt.toLocaleDateString(undefined, { weekday: 'narrow' })}\n${dt.getDate()}`
                },
                rich: { today: { color: '#6d28d9', fontWeight: 800, fontSize: 11, lineHeight: 14, align: 'center' } },
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
            barMaxWidth: 26,
            data: daily.map((d) => ({
                value: hours(d.minutes),
                itemStyle: { color: d.date === todayKey ? BAR_TODAY() : isWeekend(d.date) ? BAR_SOFT() : BAR(), borderRadius: [6, 6, 2, 2], shadowColor: d.date === todayKey ? 'rgba(109, 40, 217, .35)' : 'rgba(2, 132, 199, .18)', shadowBlur: 8, shadowOffsetY: 3 },
            })),
            showBackground: true,
            backgroundStyle: { color: 'rgba(148, 163, 184, .07)', borderRadius: [6, 6, 2, 2] },
            emphasis: { itemStyle: { color: vGrad('#0ea5e9', '#075985') } },
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
            subtitle={totalMin ? `${fmtDuration(totalMin)} logged · avg ${avgH}h per working day` : undefined}
            emptyText="No audit time logged in the last 14 days"
            emptyHint="Start a timer on an audit and your hours chart builds up here."
            emptyIcon="mdi-chart-bar"
            icon="mdi-chart-bar"
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
    const height = Math.min(290, Math.max(150, 30 + byClient.length * 40))

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
            backgroundStyle: { color: 'rgba(148, 163, 184, .12)', borderRadius: 99 },
            data: sorted.map((r, i) => ({ value: hours(r.minutes), itemStyle: { color: r.client === 'Other clients' ? OTHER : i === sorted.length - 1 ? hGrad('#38bdf8', '#0369a1') : hGrad('#bae6fd', '#38bdf8'), borderRadius: 99 } })),
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
            subtitle={total ? `${fmtDuration(total)} across ${byClient.length} client${byClient.length === 1 ? '' : 's'}` : undefined}
            emptyText="No client hours in the last 30 days"
            emptyIcon="mdi-briefcase-outline"
            icon="mdi-briefcase-outline"
            accent={HUE}
            height={height}
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
            data: sorted.map((r) => { const h = hours(r.minutes); return { value: h, itemStyle: { color: h > WEEK_TARGET_H ? hGrad('#fda4af', '#e11d48') : h >= WEEK_TARGET_H * 0.75 ? hGrad('#6ee7b7', '#059669') : hGrad('#bae6fd', '#0284c7'), borderRadius: 99 } } }),
            showBackground: true,
            backgroundStyle: { color: 'rgba(148, 163, 184, .1)', borderRadius: 99 },
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
            subtitle={byPerson.length ? `${byPerson.length} people · target ${WEEK_TARGET_H}h each` : undefined}
            emptyText="No audit hours logged this week"
            emptyHint="Hours appear as the team runs their audit timers."
            emptyIcon="mdi-account-group-outline"
            icon="mdi-account-group-outline"
            accent={HUE}
            height={Math.min(290, Math.max(150, 40 + byPerson.length * 34))}
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

export const DeadlinesWidget = ({ deadlines = [] }) => {
    const late = deadlines.filter((d) => d.daysLeft < 0).length
    return (
        <Panel icon="mdi-flag-checkered" color="#e11d48" title="Upcoming deadlines" badge={deadlines.length || null}
            subtitle={late ? `${late} overdue · next 3 weeks` : 'Next 3 weeks'}
            actions={<Link to="/audits" className="pp-link">All <i className="mdi mdi-chevron-right"></i></Link>}>
            {!deadlines.length ? (
                <EmptyState icon="mdi-calendar-check-outline" tone="#16a34a" title="Nothing due in the next 3 weeks" hint="You're ahead of every deadline." />
            ) : (
                <ul className="aw-list">
                    {deadlines.map((a) => {
                        const due = dueText(a.daysLeft)
                        const est = a.estimatedHours * 60
                        const pct = est ? Math.min(100, Math.round((a.minutes / est) * 100)) : null
                        const m = auditStatusMeta(a.status)
                        return (
                            <li key={a._id}>
                                <Link to={`/audits/${a._id}`} className={`aw-deadline t-${due.tone}`}>
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
        </Panel>
    )
}

/* ---------------- Working right now (live) ---------------- */
export const WorkingNowWidget = ({ activeNow = [] }) => (
    <Panel icon="mdi-account-clock-outline" color="#16a34a" title="Working right now"
        subtitle={activeNow.length ? 'Live audit timers across the team' : 'Live audit timers'}
        actions={activeNow.length > 0 ? <LivePill>{activeNow.length} live</LivePill> : null}>
        {!activeNow.length ? (
            <EmptyState icon="mdi-timer-off-outline" tone="#16a34a" title="No audit timers running" hint="When someone starts a timer they'll appear here with a live clock." />
        ) : (
            <ul className="aw-list">
                {activeNow.map((r) => (
                    <li key={`${r.employee._id}-${r.auditId}`}>
                        <Link to={`/audits/${r.auditId}`} className="aw-person">
                            <span className="aw-av-live"><Avatar person={r.employee} size={34} /></span>
                            <span className="aw-person-main">
                                <b>{fullName(r.employee)}</b>
                                <small>{r.clientName} · {engagementTitle(r)}</small>
                                {r.address && <small className="aw-place"><i className="mdi mdi-map-marker-outline"></i>{r.address}</small>}
                            </span>
                            <span className="aw-clock"><Live>{(n) => clock(r.startTime, n)}</Live></span>
                        </Link>
                    </li>
                ))}
            </ul>
        )}
    </Panel>
)

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
        <Panel icon="mdi-bell-alert-outline" color="#d97706" title="Needs your attention" className="aw-attention"
            subtitle={waiting ? 'Decisions waiting on you — tap a tile to act' : 'Nothing waiting on you right now'}
            actions={<span className={`aw-att-total ${waiting ? 'on' : ''}`}>{waiting ? <><i className="mdi mdi-alert-circle-outline"></i>{waiting} waiting</> : <><i className="mdi mdi-check-circle-outline"></i>All clear</>}</span>}>
                <div className="aw-att-grid">
                    {items.map((i) => (
                        <Link key={i.label} to={i.to} className={`aw-att ${i.n ? (i.critical ? 'critical' : 'warn') : 'ok'}`}>
                            <i className={`mdi ${i.icon}`}></i>
                            <b>{i.n || 0}</b>
                            <span>{i.label}</span>
                            <em className="mdi mdi-arrow-right"></em>
                        </Link>
                    ))}
                    <Link to="/attendance/team" className={`aw-att ${missing.count ? 'warn' : 'ok'}`}>
                        <i className="mdi mdi-account-question-outline"></i>
                        <b>{missing.count}<small> / {attention.teamSize}</small></b>
                        <span>Not checked in yet</span>
                        <em className="mdi mdi-arrow-right"></em>
                    </Link>
                </div>
                {missing.count > 0 && (
                    <div className="aw-missing">
                        <small>Not checked in or on leave today:</small>
                        {missing.people.map((p) => <span key={p._id} className="aw-chip"><Avatar person={p} size={20} />{fullName(p)}</span>)}
                        {missing.count > missing.people.length && <Link to="/attendance/team" className="aw-chip more">+{missing.count - missing.people.length} more</Link>}
                    </div>
                )}
        </Panel>
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
                const children = [{ type: 'rect', shape: { x: a[0], y: a[1] - h / 2, width: w, height: h, r: h / 2 }, style: { fill: item.end ? hGrad('#38bdf8', '#0284c7') : hGrad('#4ade80', color), shadowBlur: 6, shadowColor: item.end ? 'rgba(2,132,199,.25)' : 'rgba(22,163,74,.35)' } }]
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
            subtitle={sessions.length ? `${sessions.length} session${sessions.length === 1 ? '' : 's'} · ${people.length} ${people.length === 1 ? 'person' : 'people'}` : undefined}
            extra={sessions.some((x) => !x.end) ? <LivePill>{sessions.filter((x) => !x.end).length} running</LivePill> : null}
            emptyText={scope === 'mine' ? 'No audit sessions yet today' : 'No one has started an audit timer today'}
            emptyHint={scope === 'mine' ? 'Press Start on an audit to begin tracking — each session lands on this timeline.' : 'Sessions show here on a live timeline as people start their timers.'}
            emptyIcon="mdi-timeline-clock-outline"
            icon="mdi-timeline-clock-outline"
            accent={HUE}
            height={height}
            empty={!sessions.length}
            columns={['Person', 'Client · project', 'Start', 'End', 'Duration']}
            rows={sessions.map((s) => [fullName(s.employee), `${s.clientName}${s.engagementName ? ` · ${s.engagementName}` : ''}`, t(s.start), s.end ? t(s.end) : 'Running', fmtDuration(s.end ? s.minutes : (now - new Date(s.start)) / 6e4)])}
            graph={<ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge />}
        />
    )
}
