import React from 'react'
import './attendance.css'
import './checkin.css'

/* -------------------------------------------------------------------------- */
/*  Shared bits for every Attendance screen: status / work-mode colours and   */
/*  icons, time formatting and the month navigator.                           */
/* -------------------------------------------------------------------------- */

export const ATTENDANCE_ROOT = { label: 'Attendance', to: '/attendance/today' }
export const WORKDAY_HOURS = 9

export const STATUS_META = {
    Present: { color: '#059669', icon: 'mdi-check-circle-outline' },
    Late: { color: '#d97706', icon: 'mdi-clock-alert-outline' },
    'Half Day': { color: '#ea580c', icon: 'mdi-circle-half-full' },
    'On Leave': { color: '#0284c7', icon: 'mdi-beach' },
    Absent: { color: '#e11d48', icon: 'mdi-close-circle-outline' },
    Pending: { color: '#d97706', icon: 'mdi-timer-sand' },
    Approved: { color: '#059669', icon: 'mdi-check-circle-outline' },
    Rejected: { color: '#e11d48', icon: 'mdi-close-circle-outline' },
}
export const statusMeta = (s) => STATUS_META[s] || { color: '#64748b', icon: 'mdi-circle-outline' }

export const MODE_META = {
    Office: { color: '#0284c7', icon: 'mdi-office-building-outline' },
    Home: { color: '#7c3aed', icon: 'mdi-home-outline' },
    Client: { color: '#0d9488', icon: 'mdi-briefcase-outline', label: 'Client site' },
    Field: { color: '#0d9488', icon: 'mdi-map-marker-outline' }, // older records
}

// What people pick from when checking in.
export const WORK_MODES = ['Office', 'Home', 'Client']

/* Where a check-in / check-out happened: the address (or coordinates), linking to the map. */
export const PlaceLine = ({ place }) => {
    if (!place || !Number.isFinite(place.latitude)) return <span className="ci-place none"><i className="mdi mdi-map-marker-off-outline"></i>No location</span>
    const label = place.address || `${place.latitude.toFixed(5)}, ${place.longitude.toFixed(5)}`
    return (
        <a className="ci-place" href={`https://www.google.com/maps?q=${place.latitude},${place.longitude}`} target="_blank" rel="noreferrer" title={label}>
            <i className="mdi mdi-map-marker-outline"></i>{label}
        </a>
    )
}

/* Where are you working + an optional comment, shown above a Check in button. */
export const CheckInOptions = ({ mode, onMode, note, onNote, disabled }) => (
    <div className="ci-options">
        <div className="ci-modes" role="radiogroup" aria-label="Where are you working?">
            {WORK_MODES.map((m) => {
                const meta = MODE_META[m]
                return (
                    <button key={m} type="button" role="radio" aria-checked={mode === m} disabled={disabled}
                        className={`ci-mode ${mode === m ? 'on' : ''}`} style={{ '--c': meta.color }} onClick={() => onMode(m)}>
                        <i className={`mdi ${meta.icon}`}></i>{meta.label || m}
                    </button>
                )
            })}
        </div>
        <input type="text" className="ci-note" value={note} maxLength={200} disabled={disabled}
            onChange={(e) => onNote(e.target.value)}
            placeholder={mode === 'Client' ? 'Comment — e.g. which client / site (optional)' : 'Comment (optional)'} aria-label="Comment" />
    </div>
)

export const AttStatus = ({ status, extra }) => {
    if (!status) return <span className="pp-muted-dash">—</span>
    const m = statusMeta(status)
    return (
        <span className="at-status" style={{ '--c': m.color }}>
            <i className={`mdi ${m.icon}`}></i>{status}{extra && <small>{extra}</small>}
        </span>
    )
}

export const ModeTag = ({ mode }) => {
    if (!mode) return <span className="pp-muted-dash">—</span>
    const m = MODE_META[mode] || { color: '#475569', icon: 'mdi-briefcase-outline' }
    return <span className="pp-tag" style={{ '--tag': m.color }}><i className={`mdi ${m.icon}`}></i>{m.label || mode}</span>
}

export const formatTime = (value) => {
    if (!value) return '--:--'
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export const hoursLabel = (h) => {
    // Round to whole minutes first, so 8.999h reads "9h", not "8h 60m".
    const total = Math.round((Number(h) || 0) * 60)
    const hrs = Math.floor(total / 60)
    const mins = total % 60
    return mins ? `${hrs}h ${mins}m` : `${hrs}h`
}

// "YYYY-MM-DD" in local time, matching how the backend stores attendanceDate.
export const ymd = (d) => {
    const x = new Date(d)
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export const MonthNav = ({ month, year, onChange }) => {
    const now = new Date()
    const isCurrent = month === now.getMonth() + 1 && year === now.getFullYear()
    const shift = (delta) => {
        const d = new Date(year, month - 1 + delta, 1)
        onChange(d.getMonth() + 1, d.getFullYear())
    }
    return (
        <div className="at-nav">
            <button type="button" className="at-nav-btn" onClick={() => shift(-1)} aria-label="Previous month"><i className="mdi mdi-chevron-left"></i></button>
            <span className="at-nav-label">{MONTHS[month - 1]} {year}</span>
            <button type="button" className="at-nav-btn" onClick={() => shift(1)} disabled={isCurrent} aria-label="Next month"><i className="mdi mdi-chevron-right"></i></button>
            {!isCurrent && <button type="button" className="pp-btn sm" onClick={() => onChange(now.getMonth() + 1, now.getFullYear())}>This month</button>}
        </div>
    )
}
