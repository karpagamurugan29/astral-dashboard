import React, { useMemo, useState } from 'react'

// Shared shell for every dashboard widget: icon + title header, a Graph / Data switch, and a
// compact data table behind the chart. The table works out which columns are numbers (including
// durations like "2h 05m" and percentages), right-aligns them, draws an in-row bar on the main
// number column, and sorts by any column on click — every widget gets it without extra code.

// "2h 05m" → 125, "45m" → 45, "12.5h" → 750, "40%" → 40, "₹1,250" → 1250; anything else → NaN.
const toNumber = (cell) => {
    if (cell === null || cell === undefined) return NaN
    if (typeof cell === 'number') return cell
    const s = String(cell).trim()
    if (!s || s === '—' || s === '-') return NaN
    const dur = s.match(/^(\d+(?:\.\d+)?)h(?:\s*(\d+)m)?$/i)
    if (dur) return Number(dur[1]) * 60 + Number(dur[2] || 0)
    const mins = s.match(/^(\d+)m$/i)
    if (mins) return Number(mins[1])
    const plain = s.replace(/[₹$,%\s]/g, '')
    return /^-?\d+(\.\d+)?$/.test(plain) ? Number(plain) : NaN
}

export const DataTable = ({ columns, rows, accent, barColumn, maxHeight }) => {
    const [sort, setSort] = useState({ col: null, dir: 'desc' })

    const numeric = useMemo(() => columns.map((_, j) => {
        const vals = rows.map((r) => r[j]).filter((v) => v !== '' && v !== null && v !== undefined && v !== '—')
        return vals.length > 0 && vals.every((v) => Number.isFinite(toNumber(v)))
    }), [columns, rows])

    const barCol = barColumn !== undefined ? barColumn : numeric.findIndex((n, j) => n && j > 0)
    const barMax = useMemo(() => (barCol >= 0 ? Math.max(0, ...rows.map((r) => toNumber(r[barCol])).filter(Number.isFinite)) : 0), [rows, barCol])

    const sorted = useMemo(() => {
        if (sort.col === null) return rows
        const j = sort.col
        const sign = sort.dir === 'asc' ? 1 : -1
        return [...rows].sort((a, b) => {
            if (numeric[j]) return sign * ((toNumber(a[j]) || 0) - (toNumber(b[j]) || 0))
            return sign * String(a[j]).localeCompare(String(b[j]))
        })
    }, [rows, sort, numeric])

    const onSort = (j) => setSort((s) => (s.col === j ? { col: j, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { col: j, dir: numeric[j] ? 'desc' : 'asc' }))

    return (
        <div className="cw-table-wrap" style={{ maxHeight }}>
            <table className="cw-table">
                <thead>
                    <tr>
                        <th className="cw-idx">#</th>
                        {columns.map((c, j) => (
                            <th key={c} className={numeric[j] ? 'num' : ''} aria-sort={sort.col === j ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                                <button type="button" onClick={() => onSort(j)}>
                                    {c}
                                    <i className={`mdi ${sort.col === j ? (sort.dir === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down') : 'mdi-swap-vertical'}`}></i>
                                </button>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {sorted.map((row, i) => (
                        <tr key={i}>
                            <td className="cw-idx">{i + 1}</td>
                            {row.map((cell, j) => (
                                <td key={j} className={`${numeric[j] ? 'num' : ''} ${j === 0 ? 'lead' : ''}`}>
                                    {j === barCol && barMax > 0 ? (
                                        <span className="cw-bar-cell">
                                            <span className="cw-bar"><span style={{ width: `${Math.max(2, (toNumber(cell) / barMax) * 100)}%`, background: accent }}></span></span>
                                            <b>{cell}</b>
                                        </span>
                                    ) : cell}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
            <div className="cw-foot">
                <span>{rows.length} row{rows.length === 1 ? '' : 's'}</span>
                <span>{sort.col === null ? 'Click a column to sort' : `Sorted by ${columns[sort.col]} · ${sort.dir === 'asc' ? 'low → high' : 'high → low'}`}</span>
            </div>
        </div>
    )
}

// Older callers pass feather icon names; draw them with MDI so they render without feather.replace().
const FEATHER_MDI = { 'bar-chart-2': 'mdi-chart-bar', briefcase: 'mdi-briefcase-outline', users: 'mdi-account-group-outline', clock: 'mdi-clock-time-four-outline', 'pie-chart': 'mdi-chart-donut', 'trending-up': 'mdi-trending-up', activity: 'mdi-pulse', calendar: 'mdi-calendar-blank-outline' }

export const ChartWidget = ({ title, subtitle, icon, accent = '#0ea5e9', graph, columns, rows, empty, height = 300, barColumn, emptyText = 'No data yet', emptyHint, emptyIcon = 'mdi-chart-box-outline', extra }) => {
    const [mode, setMode] = useState('graph')
    const isEmpty = empty || !rows || rows.length === 0
    const mdi = icon?.startsWith('mdi-') ? icon : FEATHER_MDI[icon]

    return (
        <div className="card card-h-100 chart-widget" style={{ "--pc": accent }}>
            <div className="card-body">
                <div className="cw-head">
                    <span className="chart-widget-icon" style={{ background: `${accent}1a`, color: accent, '--c': accent }}>
                        {mdi ? <i className={`mdi ${mdi}`}></i> : <i data-feather={icon}></i>}
                    </span>
                    <div className="cw-titles">
                        <h5 className="card-title mb-0">{title}</h5>
                        {subtitle && <small>{subtitle}</small>}
                    </div>
                    {extra}
                    {!isEmpty && <div className="cw-switch" role="tablist" aria-label={`${title} view`}>
                        <button type="button" role="tab" aria-selected={mode === 'graph'} className={mode === 'graph' ? 'on' : ''} onClick={() => setMode('graph')}>
                            <i className="mdi mdi-chart-bar"></i><span>Graph</span>
                        </button>
                        <button type="button" role="tab" aria-selected={mode === 'data'} className={mode === 'data' ? 'on' : ''} onClick={() => setMode('data')}>
                            <i className="mdi mdi-table"></i><span>Data</span>
                        </button>
                    </div>}
                </div>

                {isEmpty ? (
                    <div className="chart-widget-empty pd-empty" style={{ '--c': accent }}>
                        <span className="pd-empty-icon"><i className={`mdi ${emptyIcon}`}></i></span>
                        <b>{emptyText}</b>
                        {emptyHint && <small>{emptyHint}</small>}
                    </div>
                ) : mode === 'graph' ? (
                    <div className="chart-widget-graph" style={{ height }}>{graph}</div>
                ) : (
                    <DataTable columns={columns} rows={rows} accent={accent} barColumn={barColumn} maxHeight={height + 34} />
                )}
            </div>
        </div>
    )
}
