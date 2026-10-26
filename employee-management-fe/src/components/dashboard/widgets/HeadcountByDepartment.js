import React, { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import * as echarts from 'echarts'
import { ChartWidget } from './ChartWidget'

// Ranked horizontal bars: easier to read and compare than the old rotating 3D chart,
// and every department name stays legible no matter how many there are.
const barGradient = (from, to) => new echarts.graphic.LinearGradient(0, 0, 1, 0, [
    { offset: 0, color: from },
    { offset: 1, color: to },
])

export const HeadcountByDepartment = ({ headcount }) => {
    // Largest department on top — echarts draws category axes bottom-up, so sort ascending.
    const sorted = useMemo(() => [...(headcount || [])].sort((a, b) => a.count - b.count), [headcount])
    const total = useMemo(() => sorted.reduce((sum, h) => sum + (h.count || 0), 0), [sorted])
    const maxCount = sorted.length ? sorted[sorted.length - 1].count : 0

    const option = useMemo(() => ({
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(14, 165, 233, .06)' } },
            backgroundColor: '#0f172a',
            borderWidth: 0,
            padding: [8, 12],
            textStyle: { color: '#fff', fontSize: 12 },
            formatter: (p) => {
                const count = p[0].value
                const share = total ? Math.round((count / total) * 100) : 0
                return `<strong>${p[0].name}</strong><br/>${count} employee${count === 1 ? '' : 's'} · ${share}% of workforce`
            },
        },
        grid: { left: 4, right: 64, top: 4, bottom: 4, containLabel: true },
        xAxis: { type: 'value', show: false, max: maxCount * 1.05 || 1 },
        yAxis: {
            type: 'category',
            data: sorted.map((h) => h.department),
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { color: '#64748b', fontSize: 12, width: 110, overflow: 'truncate', margin: 12 },
        },
        series: [{
            type: 'bar',
            barWidth: 12,
            showBackground: true,
            backgroundStyle: { color: 'rgba(148, 163, 184, .12)', borderRadius: 99 },
            data: sorted.map((h) => ({
                value: h.count,
                itemStyle: {
                    borderRadius: 99,
                    shadowBlur: 6, shadowColor: 'rgba(2, 132, 199, .2)',
                    // the largest department gets the full brand gradient, the rest a softer tint
                    color: h.count === maxCount
                        ? barGradient('#0284c7', '#0ea5e9')
                        : barGradient('#7dd3fc', '#38bdf8'),
                },
            })),
            label: {
                show: true,
                position: 'right',
                distance: 8,
                color: '#334155',
                fontSize: 12,
                fontWeight: 600,
                formatter: (p) => `${p.value}  {share|${total ? Math.round((p.value / total) * 100) : 0}%}`,
                rich: { share: { color: '#94a3b8', fontSize: 11, fontWeight: 500 } },
            },
            emphasis: { itemStyle: { color: barGradient('#075985', '#0284c7') } },
            animationDuration: 900,
            animationEasing: 'cubicOut',
        }],
    }), [sorted, total, maxCount])

    return (
        <ChartWidget
            title="Headcount by department"
            subtitle={total ? `${total} people · ${sorted.length} department${sorted.length === 1 ? '' : 's'}` : undefined}
            icon="mdi-account-group-outline"
            accent="#0ea5e9"
            emptyText="No departments yet"
            emptyIcon="mdi-account-group-outline"
            height={Math.min(320, Math.max(140, 24 + sorted.length * 42))}
            rows={[...sorted].reverse().map((h) => [h.department, h.count, `${total ? Math.round((h.count / total) * 100) : 0}%`])}
            columns={['Department', 'Employees', 'Share']}
            graph={<ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />}
        />
    )
}
