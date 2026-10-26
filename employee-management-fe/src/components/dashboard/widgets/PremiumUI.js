import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

/* -------------------------------------------------------------------------- */
/*  Building blocks of the premium dashboard: gradient KPI cards, a progress  */
/*  ring, a panel frame, and the month-at-a-glance attendance calendar.       */
/* -------------------------------------------------------------------------- */

// Progress ring drawn in white on a gradient card (or in a colour on a light panel).
export const Ring = ({ value = 0, size = 64, stroke = 7, color = '#fff', track = 'rgba(255,255,255,.28)', label }) => {
    const r = (size - stroke) / 2
    const c = 2 * Math.PI * r
    const v = Math.max(0, Math.min(100, value))
    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="pd-ring" role="img" aria-label={`${Math.round(v)}%`}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
            {v > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" className="pd-ring-bar"
                style={{ '--len': (v / 100) * c }} strokeDasharray={`${(v / 100) * c} ${c * 2}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />}
            <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fontSize={size * 0.22} fontWeight="700" fill={color}>{label ?? `${Math.round(v)}%`}</text>
        </svg>
    )
}

// accent per tone — keep in step with .pk-card.tone-* in DashPremium.css
const TONE_COLOR = { violet: '#4f46e5', emerald: '#059669', sunset: '#c2410c', ocean: '#0369a1', magenta: '#be185d' }

/* Counts a number up from 0 the first time it appears (and eases to new values after that).
   Anything that isn't a plain number (JSX, "8h 05m", "₹26L") is shown as it is. */
export const CountUp = ({ value, duration = 900 }) => {
    const num = typeof value === 'number' && Number.isFinite(value) ? value : null
    const [shown, setShown] = useState(num === null ? value : 0)
    const from = useRef(0)
    useEffect(() => {
        if (num === null) { setShown(value); return undefined }
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setShown(num); from.current = num; return undefined }
        const start = performance.now()
        const a = from.current
        let raf
        const step = (t) => {
            const k = Math.min(1, (t - start) / duration)
            const eased = 1 - Math.pow(1 - k, 3)
            const v = a + (num - a) * eased
            setShown(Number.isInteger(num) ? Math.round(v) : Math.round(v * 10) / 10)
            if (k < 1) raf = requestAnimationFrame(step)
            else from.current = num
        }
        raf = requestAnimationFrame(step)
        return () => cancelAnimationFrame(raf)
    }, [num, value, duration])
    return <>{shown}</>
}

/* The friendly "nothing here yet" block every widget uses: icon, one line, an optional hint and action. */
export const EmptyState = ({ icon = 'mdi-chart-box-outline', title, hint, action, tone = '#64748b' }) => (
    <div className="pd-empty" style={{ '--c': tone }}>
        <span className="pd-empty-icon"><i className={`mdi ${icon}`}></i></span>
        <b>{title}</b>
        {hint && <small>{hint}</small>}
        {action}
    </div>
)

/* A KPI card. `rows` are small labelled bars under the value; `ring` puts a ring on the right. */
export const KpiCard = ({ tone, icon, label, value, sub, ring, rows, to, legend, live }) => {
    const Tag = to ? Link : 'div'
    return (
        <Tag to={to} className={`pk-card tone-${tone} ${to ? 'is-link' : ''}`}>
            <div className="pk-top">
                <span className="pk-icon"><i className={`mdi ${icon}`}></i></span>
                <span className="pk-label">{label}</span>
                {live && <span className="pk-live" title="Updates live"><i></i>Live</span>}
                {to && <i className="mdi mdi-arrow-top-right pk-go" aria-hidden="true"></i>}
            </div>
            <div className="pk-body">
                <div className="pk-main">
                    <div className="pk-value"><CountUp value={value} /></div>
                    {sub && <div className="pk-sub">{sub}</div>}
                    {legend && <div className="pk-legend">{legend.map((l) => <span key={l}><i></i>{l}</span>)}</div>}
                </div>
                {ring !== undefined && <Ring value={ring.value} label={ring.label} color={TONE_COLOR[tone] || '#4f46e5'} track="#eef1f5" />}
            </div>
            {rows?.length > 0 && (
                <div className="pk-rows">
                    {rows.map((r) => (
                        <div key={r.label} className="pk-row">
                            <span>{r.label}</span>
                            <span className="pk-bar"><span style={{ width: `${Math.max(0, Math.min(100, r.pct || 0))}%` }}></span></span>
                            <b>{r.value}</b>
                        </div>
                    ))}
                </div>
            )}
        </Tag>
    )
}

/* The white panel every widget sits in: icon tile, title (+ optional badge), subtitle, actions on the right. */
export const Panel = ({ icon, color = '#0284c7', title, subtitle, badge, actions, children, className = '', id, bodyClass = '' }) => (
    <section className={`pp-panel ${className}`} id={id} style={{ '--pc': color }}>
        <header className="pp-panel-head">
            <span className="pp-panel-icon" style={{ '--c': color }}><i className={`mdi ${icon}`}></i></span>
            <div className="pp-panel-titles">
                <h3>{title}{badge !== undefined && badge !== null && badge !== false && <span className="pp-badge">{badge}</span>}</h3>
                {subtitle && <p>{subtitle}</p>}
            </div>
            {actions && <div className="pp-panel-actions">{actions}</div>}
        </header>
        <div className={`pp-panel-body ${bodyClass}`}>{children}</div>
    </section>
)

/* A pulsing "live" pill for widgets that refresh on their own. */
export const LivePill = ({ children = 'Live', tone = '#16a34a' }) => <span className="pp-live" style={{ '--c': tone }}><i></i>{children}</span>

/* ---------------- My attendance this month (calendar) ---------------- */
// Soft tiles: date, a status tint, and what happened (hours, "Late", "Leave"…). A ring shows the
// attendance rate for working days so far; a slim column on the right totals each week's hours.
const DAY_TONE = { Present: 'present', Late: 'late', 'Half Day': 'half', 'On Leave': 'leave', Absent: 'absent' }
const MODE_ICON = { Home: 'mdi-home-outline', Client: 'mdi-briefcase-outline', Field: 'mdi-map-marker-outline' }
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const hrs = (h) => (h ? `${Math.round(h * 10) / 10}h` : '')
const clock = (t) => (t ? new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '')

export const MonthAttendance = ({ history = [], holidays = [] }) => {
    const today = new Date()
    const todayKey = ymd(today)
    const y = today.getFullYear(), m = today.getMonth()
    const first = new Date(y, m, 1)
    const days = new Date(y, m + 1, 0).getDate()
    const lead = (first.getDay() + 6) % 7 // Monday first
    const byDate = new Map(history.map((r) => [String(r.attendanceDate).slice(0, 10), r]))
    const holidayMap = new Map(holidays.map((h) => [String(h.date || '').slice(0, 10), h.name || 'Holiday']))

    const cells = []
    let present = 0, late = 0, hours = 0, worked = 0, missed = 0, workdays = 0
    for (let d = 1; d <= days; d++) {
        const date = new Date(y, m, d)
        const key = ymd(date)
        const rec = byDate.get(key)
        const weekend = date.getDay() === 0 || date.getDay() === 6
        const future = key > todayKey
        let tone = future ? 'future' : weekend ? 'weekend' : holidayMap.has(key) ? 'holiday' : 'absent'
        if (!future && !weekend && !holidayMap.has(key)) workdays++
        let label = ''
        if (rec) {
            tone = DAY_TONE[rec.status] || 'present'
            if (['Present', 'Late', 'Half Day'].includes(rec.status)) { present++; worked++; hours += Number(rec.workingHours) || 0 }
            if (rec.status === 'Late') late++
            label = rec.status === 'On Leave' ? 'Leave' : hrs(rec.workingHours) || (key === todayKey ? 'In' : rec.status)
        } else if (tone === 'absent') {
            if (key === todayKey) { tone = 'pending'; label = 'Today' } else { missed++; label = 'Missed' }
        } else if (tone === 'holiday') label = 'Holiday'
        cells.push({ d, key, tone, rec, label, isToday: key === todayKey, mode: rec?.attendanceType, inAt: rec?.checkIn?.time || rec?.sessions?.[0]?.checkIn?.time })
    }
    const avg = worked ? Math.round((hours / worked) * 10) / 10 : 0
    const rate = workdays ? Math.round((present / workdays) * 100) : 0
    const rateColor = rate >= 90 ? '#10b981' : rate >= 75 ? '#f59e0b' : '#ef4444'

    // rows of 7 (with leading blanks), each with its week total
    const slots = [...Array.from({ length: lead }, () => null), ...cells]
    while (slots.length % 7) slots.push(null)
    const weeks = Array.from({ length: slots.length / 7 }, (_, i) => slots.slice(i * 7, i * 7 + 7))
    const r = 22, circ = 2 * Math.PI * r

    return (
        <div className="ma">
            <div className="ma-top">
                <div className="ma-rate" style={{ '--c': rateColor }} title="Days present ÷ working days so far">
                    <svg width="56" height="56" aria-hidden="true"><circle cx="28" cy="28" r={r} className="track" /><circle cx="28" cy="28" r={r} className="bar" strokeDasharray={circ} strokeDashoffset={circ * (1 - rate / 100)} /></svg>
                    <b>{rate}%</b>
                </div>
                <div className="ma-stats">
                    <div style={{ '--c': '#10b981' }}><i className="mdi mdi-check-circle-outline"></i><b>{present}<em>/{workdays}</em></b><span>Present</span></div>
                    <div style={{ '--c': '#f59e0b' }}><i className="mdi mdi-clock-alert-outline"></i><b>{late}</b><span>Late</span></div>
                    <div style={{ '--c': '#0ea5e9' }}><i className="mdi mdi-timer-outline"></i><b>{avg}h</b><span>Avg / day</span></div>
                    <div style={{ '--c': missed ? '#ef4444' : '#94a3b8' }}><i className="mdi mdi-calendar-remove-outline"></i><b>{missed}</b><span>Missed</span></div>
                </div>
            </div>

            <div className="ma-cal" role="grid" aria-label={first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}>
                <div className="ma-row head" role="row">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((w) => <span key={w} className="ma-dow">{w}</span>)}<span className="ma-dow wk">Week</span></div>
                {weeks.map((wk, i) => {
                    const total = wk.reduce((t, c) => t + (c?.rec && ['Present', 'Late', 'Half Day'].includes(c.rec.status) ? Number(c.rec.workingHours) || 0 : 0), 0)
                    return (
                        <div key={i} className="ma-row" role="row">
                            {wk.map((c, j) => c ? (
                                <span key={c.key} role="gridcell" className={`ma-day t-${c.tone} ${c.isToday ? 'today' : ''}`}
                                    title={`${new Date(c.key + 'T00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}${c.rec ? ` · ${c.rec.status}${c.inAt ? ` · in ${clock(c.inAt)}` : ''}${c.rec.workingHours ? ` · ${hrs(c.rec.workingHours)}` : ''}` : c.tone === 'holiday' ? ` · ${holidayMap.get(c.key)}` : c.tone === 'weekend' ? ' · weekend' : c.tone === 'absent' ? ' · no check-in' : ''}`}>
                                    <b>{c.d}</b>
                                    {c.mode && MODE_ICON[c.mode] && <i className={`mdi ${MODE_ICON[c.mode]} ma-mode`}></i>}
                                    {c.label && <small>{c.label}</small>}
                                </span>
                            ) : <span key={`e${i}${j}`} className="ma-day t-empty" aria-hidden="true"></span>)}
                            <span className={`ma-wk ${total ? '' : 'none'}`}>{total ? hrs(total) : '—'}</span>
                        </div>
                    )
                })}
            </div>

            <div className="ma-key">
                {[['present', 'Present'], ['late', 'Late'], ['half', 'Half day'], ['leave', 'Leave'], ['absent', 'Missed'], ['weekend', 'Weekend / holiday']].map(([t, l]) => <span key={t}><i className={`t-${t}`}></i>{l}</span>)}
                <span className="ma-key-mode"><i className="mdi mdi-home-outline"></i>WFH <i className="mdi mdi-briefcase-outline"></i>Client</span>
            </div>
        </div>
    )
}
