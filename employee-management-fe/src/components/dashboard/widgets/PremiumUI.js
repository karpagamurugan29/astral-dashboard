import React from 'react'
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
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
                strokeDasharray={`${(v / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
            <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fontSize={size * 0.22} fontWeight="700" fill={color}>{label ?? `${Math.round(v)}%`}</text>
        </svg>
    )
}

// accent per tone — keep in step with .pk-card.tone-* in DashPremium.css
const TONE_COLOR = { violet: '#4f46e5', emerald: '#059669', sunset: '#c2410c', ocean: '#0369a1', magenta: '#be185d' }

/* A KPI card. `rows` are small labelled bars under the value; `ring` puts a ring on the right. */
export const KpiCard = ({ tone, icon, label, value, sub, ring, rows, to, legend }) => {
    const Tag = to ? Link : 'div'
    return (
        <Tag to={to} className={`pk-card tone-${tone} ${to ? 'is-link' : ''}`}>
            <div className="pk-top">
                <span className="pk-icon"><i className={`mdi ${icon}`}></i></span>
                <span className="pk-label">{label}</span>
            </div>
            <div className="pk-body">
                <div className="pk-main">
                    <div className="pk-value">{value}</div>
                    {sub && <div className="pk-sub">{sub}</div>}
                    {legend && <div className="pk-legend">{legend.map((l) => <span key={l}><i></i>{l}</span>)}</div>}
                </div>
                {ring !== undefined && <Ring value={ring.value} label={ring.label} color={TONE_COLOR[tone] || '#4f46e5'} track="#eef1f5" />}
            </div>
            {rows && (
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

/* The white panel every widget sits in: icon tile, title, subtitle, actions on the right. */
export const Panel = ({ icon, color = '#0284c7', title, subtitle, actions, children, className = '', id }) => (
    <section className={`pp-panel ${className}`} id={id}>
        <header className="pp-panel-head">
            <span className="pp-panel-icon" style={{ '--c': color }}><i className={`mdi ${icon}`}></i></span>
            <div className="pp-panel-titles">
                <h3>{title}</h3>
                {subtitle && <p>{subtitle}</p>}
            </div>
            {actions && <div className="pp-panel-actions">{actions}</div>}
        </header>
        <div className="pp-panel-body">{children}</div>
    </section>
)

/* ---------------- My attendance this month (calendar) ---------------- */
const DAY_TONE = { Present: 'present', Late: 'late', 'Half Day': 'half', 'On Leave': 'leave', Absent: 'absent' }
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const MonthAttendance = ({ history = [], holidays = [] }) => {
    const today = new Date()
    const y = today.getFullYear(), m = today.getMonth()
    const first = new Date(y, m, 1)
    const days = new Date(y, m + 1, 0).getDate()
    const lead = (first.getDay() + 6) % 7 // Monday first
    const byDate = new Map(history.map((r) => [String(r.attendanceDate).slice(0, 10), r]))
    const holidaySet = new Set(holidays.map((h) => String(h.date || '').slice(0, 10)))

    const cells = []
    let present = 0, late = 0, hours = 0, worked = 0, missed = 0
    for (let d = 1; d <= days; d++) {
        const date = new Date(y, m, d)
        const key = ymd(date)
        const rec = byDate.get(key)
        const weekend = date.getDay() === 0 || date.getDay() === 6
        const future = date > today && key !== ymd(today)
        let tone = future ? 'future' : weekend ? 'weekend' : holidaySet.has(key) ? 'holiday' : 'absent'
        if (rec) {
            tone = DAY_TONE[rec.status] || 'present'
            if (['Present', 'Late', 'Half Day'].includes(rec.status)) { present++; worked++; hours += Number(rec.workingHours) || 0 }
            if (rec.status === 'Late') late++
        } else if (tone === 'absent' && key !== ymd(today)) missed++
        cells.push({ d, key, tone, rec, isToday: key === ymd(today) })
    }
    const avg = worked ? Math.round((hours / worked) * 10) / 10 : 0

    return (
        <div className="ma">
            <div className="ma-stats">
                <div><b>{present}</b><span>Days present</span></div>
                <div><b>{late}</b><span>Late arrivals</span></div>
                <div><b>{avg}h</b><span>Avg per day</span></div>
                <div><b>{missed}</b><span>Days missed</span></div>
            </div>
            <div className="ma-grid" role="grid" aria-label={first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}>
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((w, i) => <span key={i} className="ma-dow">{w}</span>)}
                {Array.from({ length: lead }, (_, i) => <span key={`l${i}`} />)}
                {cells.map((c) => (
                    <span key={c.key} className={`ma-day t-${c.tone} ${c.isToday ? 'today' : ''}`}
                        title={`${new Date(c.key + 'T00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}${c.rec ? ` · ${c.rec.status} · ${Math.round((c.rec.workingHours || 0) * 10) / 10}h` : c.tone === 'weekend' ? ' · weekend' : c.tone === 'holiday' ? ' · holiday' : c.tone === 'future' ? '' : ' · no check-in'}`}>
                        {c.d}
                    </span>
                ))}
            </div>
            <div className="ma-key">
                {[['present', 'Present'], ['late', 'Late'], ['half', 'Half day'], ['leave', 'Leave'], ['absent', 'No check-in'], ['weekend', 'Weekend / holiday']].map(([t, l]) => <span key={t}><i className={`t-${t}`}></i>{l}</span>)}
            </div>
        </div>
    )
}
