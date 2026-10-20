import React, { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { ChartWidget } from './ChartWidget'

const STATUS_COLORS = {
    Planning: '#adb5bd',
    Active: '#0ea5e9',
    'On Hold': '#f59e0b',
    Completed: '#10b981',
    Cancelled: '#f43f5e',
}

export const ProjectMomentum = ({ projectProgress }) => {
    const data = [...(projectProgress || [])].sort((a, b) => a.progress - b.progress)

    const option = useMemo(() => ({
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (p) => `${p[0].name}: ${p[0].value}%` },
        grid: { left: 8, right: 24, top: 8, bottom: 8, containLabel: true },
        xAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value}%', fontSize: 10 }, splitLine: { lineStyle: { opacity: 0.15 } } },
        yAxis: { type: 'category', data: data.map((p) => p.projectName), axisLabel: { fontSize: 11, width: 110, overflow: 'truncate' } },
        series: [{
            type: 'bar',
            data: data.map((p) => ({ value: p.progress, itemStyle: { color: STATUS_COLORS[p.status] || '#0ea5e9', borderRadius: [0, 6, 6, 0] } })),
            barWidth: 14,
            animationDuration: 900,
            animationEasing: 'cubicOut',
            label: { show: true, position: 'right', formatter: '{c}%', fontSize: 11, fontWeight: 600 },
        }],
    }), [data])

    return (
        <ChartWidget
            title="Project Momentum"
            icon="trending-up"
            accent="#06b6d4"
            height={300}
            rows={data.map((p) => [p.projectName, p.status, `${p.progress}%`])}
            columns={['Project', 'Status', 'Progress']}
            graph={<ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />}
        />
    )
}
