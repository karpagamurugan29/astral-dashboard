import React, { useState } from 'react'

// Shared shell for every premium dashboard widget: title/icon header, a Graph/Data mode
// toggle, and a fade transition between the chart and its underlying numbers — every widget
// that uses this gets the same interaction for free instead of reimplementing it per-chart.
export const ChartWidget = ({ title, icon, accent = '#0ea5e9', graph, columns, rows, empty, height = 300 }) => {
    const [mode, setMode] = useState('graph')
    const isEmpty = empty || !rows || rows.length === 0

    return (
        <div className="card card-h-100 chart-widget">
            <div className="card-body">
                <div className="d-flex align-items-center justify-content-between mb-3">
                    <div className="d-flex align-items-center gap-2">
                        <span className="chart-widget-icon" style={{ background: `${accent}1a`, color: accent }}>
                            <i data-feather={icon}></i>
                        </span>
                        <h5 className="card-title mb-0">{title}</h5>
                    </div>
                    <div className="chart-widget-toggle" role="tablist" aria-label={`${title} view mode`}>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={mode === 'graph'}
                            className={mode === 'graph' ? 'active' : ''}
                            onClick={() => setMode('graph')}
                        >
                            Graph
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={mode === 'data'}
                            className={mode === 'data' ? 'active' : ''}
                            onClick={() => setMode('data')}
                        >
                            Data
                        </button>
                    </div>
                </div>

                {isEmpty ? (
                    <div className="chart-widget-empty" style={{ height }}>
                        <i data-feather="inbox"></i>
                        <span>No data yet</span>
                    </div>
                ) : mode === 'graph' ? (
                    <div className="chart-widget-graph" style={{ height }}>{graph}</div>
                ) : (
                    <div className="chart-widget-table" style={{ maxHeight: height, overflowY: 'auto' }}>
                        <table className="table table-sm table-nowrap mb-0">
                            <thead className="table-light">
                                <tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr>
                            </thead>
                            <tbody>
                                {rows.map((row, i) => (
                                    <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}
