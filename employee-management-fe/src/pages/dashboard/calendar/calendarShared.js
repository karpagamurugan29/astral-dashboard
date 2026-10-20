import React from 'react'

// Helpers shared by the Shifts and Holidays screens.

export const HOLIDAY_TYPES = {
    National: { color: '#e11d48', icon: 'mdi-flag-outline' },
    Regional: { color: '#0284c7', icon: 'mdi-map-marker-radius-outline' },
    Optional: { color: '#7c3aed', icon: 'mdi-star-outline' },
}
export const holidayMeta = (t) => HOLIDAY_TYPES[t] || HOLIDAY_TYPES.National

export const DAY = 24 * 60 * 60 * 1000
export const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime() }
export const daysUntilLabel = (n) => (n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : `in ${n} days`)

export const toMinutes = (hhmm) => {
    const [h, m] = String(hhmm || '0:0').split(':').map(Number)
    return (h || 0) * 60 + (m || 0)
}
export const fromMinutes = (mins) => {
    const m = ((mins % 1440) + 1440) % 1440
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export const shiftMeta = (start) => {
    const h = Math.floor(toMinutes(start) / 60)
    if (h >= 20 || h < 5) return { color: '#7c3aed', icon: 'mdi-weather-night', label: 'Night shift' }
    if (h >= 13) return { color: '#ea580c', icon: 'mdi-weather-sunset', label: 'Evening shift' }
    return { color: '#f59e0b', icon: 'mdi-white-balance-sunny', label: 'Day shift' }
}

export const shiftSpan = (s) => {
    const a = toMinutes(s.startTime)
    const b = toMinutes(s.endTime)
    const dur = b > a ? b - a : 24 * 60 - a + b
    return { a, b, dur, overnight: b <= a }
}

export const pct = (mins) => `${(mins / 1440) * 100}%`

export const TimelineBar = ({ s }) => {
    const { a, b, dur, overnight } = shiftSpan(s)
    return overnight ? (
        <>
            <span style={{ left: pct(a), width: pct(1440 - a) }}></span>
            <span style={{ left: 0, width: pct(b) }}></span>
        </>
    ) : <span style={{ left: pct(a), width: pct(dur) }}></span>
}
