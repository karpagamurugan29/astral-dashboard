import React, { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { ChartWidget } from './ChartWidget'

const STATUS_COLORS = {
    'To Do': '#adb5bd',
    'In Progress': '#0ea5e9',
    'In Review': '#8b5cf6',
    'Blocked': '#f43f5e',
    'Done': '#10b981',
}

export const TaskPipelineDonut = ({ taskStatus }) => {
    const total = (taskStatus || []).reduce((sum, t) => sum + t.count, 0)
    const nonZero = (taskStatus || []).filter((t) => t.count > 0)

    const option = useMemo(() => ({
        tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
        legend: { bottom: 0, textStyle: { fontSize: 11 }, itemWidth: 10, itemHeight: 10 },
        series: [{
            type: 'pie',
            radius: ['52%', '75%'],
            center: ['50%', '44%'],
            itemStyle: { borderRadius: 8, borderWidth: 3, borderColor: 'transparent' },
            label: { show: false },
            emphasis: { scale: true, scaleSize: 6, label: { show: true, fontSize: 13, fontWeight: 700, formatter: '{b}\n{c}' } },
            avoidLabelOverlap: true,
            animationType: 'expansion',
            animationEasing: 'elasticOut',
            animationDuration: 900,
            data: (taskStatus || []).map((t) => ({
                name: t.status,
                value: t.count,
                itemStyle: { color: STATUS_COLORS[t.status] || '#adb5bd' },
            })),
        }],
        graphic: total > 0 ? [{
            type: 'text',
            left: 'center',
            top: '38%',
            style: { text: String(total), fontSize: 26, fontWeight: 700, fill: 'currentColor' },
        }, {
            type: 'text',
            left: 'center',
            top: '46%',
            style: { text: 'tasks', fontSize: 11, fill: '#8890a6' },
        }] : [],
    }), [taskStatus, total])

    return (
        <ChartWidget
            title="Task Pipeline"
            icon="check-square"
            accent="#10b981"
            height={300}
            empty={nonZero.length === 0}
            rows={(taskStatus || []).map((t) => [t.status, t.count])}
            columns={['Status', 'Tasks']}
            graph={<ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />}
        />
    )
}
