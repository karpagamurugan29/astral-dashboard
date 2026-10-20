import React, { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { ChartWidget } from './ChartWidget'

const PALETTE = ['#0ea5e9', '#0ea5e9', '#f59e0b', '#10b981', '#f43f5e', '#8b5cf6', '#06b6d4']

export const LeaveMixChart = ({ leaveBreakdown }) => {
    const data = leaveBreakdown || []

    const option = useMemo(() => ({
        tooltip: { trigger: 'item', formatter: (p) => `${p.name}: ${p.value} day${p.value === 1 ? '' : 's'}` },
        polar: { radius: [18, '75%'] },
        angleAxis: { max: Math.max(1, ...data.map((d) => d.totalDays)), startAngle: 90 },
        radiusAxis: { type: 'category', data: data.map((d) => d.leaveType), axisLine: { show: false }, axisLabel: { fontSize: 11 } },
        series: [{
            type: 'bar',
            data: data.map((d, i) => ({ value: d.totalDays, itemStyle: { color: PALETTE[i % PALETTE.length] } })),
            coordinateSystem: 'polar',
            roundCap: true,
            barWidth: 12,
            animationDuration: 900,
            animationEasing: 'cubicOut',
        }],
    }), [data])

    return (
        <ChartWidget
            title="Leave Mix"
            icon="calendar"
            accent="#f59e0b"
            height={300}
            rows={data.map((d) => [d.leaveType, `${d.totalDays} day${d.totalDays === 1 ? '' : 's'}`, d.count])}
            columns={['Type', 'Days', 'Requests']}
            graph={<ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />}
        />
    )
}
