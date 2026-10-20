import React, { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useLocation } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import reportActions from '../../../redux/report/Actions'
import projectActions from '../../../redux/project/Actions'
import employeeActions from '../../../redux/employee/Actions'
import { PeopleShell, Avatar, DeptTag, deptColor, EmptyState, ErrorBanner, fullName, fmtDate } from '../../../components/people/PeopleUI'
import { money, moneyShort, periodLabel, PayStatus } from '../../../components/payroll/PayrollUI'
import { leaveMeta, leaveStatusMeta } from '../../../components/leave/LeaveUI'
import { categoryMeta, expenseStatusMeta } from '../../../components/expense/ExpenseUI'
import { PROJECT_STATUS, ProjectStatus, TaskStatus, PriorityTag } from '../../../components/projects/ProjectUI'
import '../../../components/attendance/attendance.css'
import '../../../components/payroll/payroll.css'
import './ReportBuilder.css'

const REPORTS = [
    { key: 'headcount', label: 'Headcount', icon: 'mdi-account-group-outline', color: '#0284c7', desc: 'Current employees by department' },
    { key: 'attendance', label: 'Attendance', icon: 'mdi-clock-check-outline', color: '#059669', desc: 'This month, per employee' },
    { key: 'leave', label: 'Leave', icon: 'mdi-beach', color: '#7c3aed', desc: 'Requests and days by type and status' },
    { key: 'payroll', label: 'Payroll', icon: 'mdi-cash-multiple', color: '#0b0f19', desc: 'Cost of the last 12 payroll runs' },
    { key: 'expenses', label: 'Expenses', icon: 'mdi-receipt', color: '#ea580c', desc: 'Claims by category and status' },
    { key: 'projects', label: 'Projects', icon: 'mdi-folder-outline', color: '#0d9488', desc: 'Delivery health across projects' },
    { key: 'tasks', label: 'Tasks', icon: 'mdi-format-list-checks', color: '#db2777', desc: 'Task status, owners and overdue work' },
]
const ROUTE_TO_REPORT = { employees: 'headcount', attendance: 'attendance', leave: 'leave', payroll: 'payroll' }

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
const downloadCsv = (name, headers, rows) => {
    const blob = new Blob([[headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
}

const donut = (data) => ({
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, icon: 'circle', textStyle: { fontSize: 11, color: '#64748b' } },
    series: [{ type: 'pie', radius: ['48%', '72%'], center: ['50%', '44%'], itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 }, label: { show: false }, data }],
})
const hbar = (labels, values, colors) => ({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 4, right: 40, top: 6, bottom: 6, containLabel: true },
    xAxis: { type: 'value', show: false },
    yAxis: { type: 'category', data: labels, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#64748b', width: 110, overflow: 'truncate' } },
    series: [{ type: 'bar', barWidth: 14, data: values.map((v, i) => ({ value: v, itemStyle: { color: colors[i], borderRadius: 6 } })), label: { show: true, position: 'right', color: '#334155', fontWeight: 600 } }],
})

const Tile = ({ icon, color, value, label }) => (
    <div className="at-tile" style={{ '--c': color }}><span className="at-tile-icon"><i className={`mdi ${icon}`}></i></span><div><b>{value}</b><span>{label}</span></div></div>
)

export const ReportBuilder = () => {
    const dispatch = useDispatch()
    const location = useLocation()
    const { headcount, attendance, leave, payroll, expense, projects, tasks, error } = useSelector((state) => state.reportReducer || {})
    const { list: allProjects } = useSelector((state) => state.projectReducer || {})
    const { list: allEmployees } = useSelector((state) => state.employeeReducer || {})
    const { isAuthenticated: user, permissions } = useSelector((state) => state.authReducer || {})
    const canView = ['Admin', 'HR', 'Manager', 'Team Lead'].includes(user?.role) && (user?.role === 'Admin' || permissions?.includes('reports'))
    const routeKey = location.pathname.split('/').pop()
    const [tab, setTab] = useState(ROUTE_TO_REPORT[routeKey] || 'headcount')

    const [projectFilters, setProjectFilters] = useState({ projectId: '', projectManager: '', status: '', startDate: '', endDate: '' })
    const [taskFilters, setTaskFilters] = useState({ projectId: '', assignedTo: '', status: '', priority: '', startDate: '', endDate: '', overdue: '' })

    useEffect(() => { if (ROUTE_TO_REPORT[routeKey]) setTab(ROUTE_TO_REPORT[routeKey]) }, [routeKey])

    useEffect(() => {
        if (!canView) return
        dispatch({ type: reportActions.GET_HEADCOUNT_REPORT })
        dispatch({ type: reportActions.GET_ATTENDANCE_REPORT })
        dispatch({ type: reportActions.GET_LEAVE_REPORT })
        dispatch({ type: reportActions.GET_PAYROLL_REPORT })
        dispatch({ type: reportActions.GET_EXPENSE_REPORT })
        dispatch({ type: projectActions.GET_PROJECTS })
        dispatch({ type: employeeActions.GET_EMPLOYEES })
    }, [dispatch, canView])

    useEffect(() => {
        if (canView && tab === 'projects') dispatch({ type: reportActions.GET_PROJECT_REPORT, filters: projectFilters })
    }, [dispatch, canView, tab, projectFilters])

    useEffect(() => {
        if (canView && tab === 'tasks') dispatch({ type: reportActions.GET_TASK_REPORT, filters: taskFilters })
    }, [dispatch, canView, tab, taskFilters])

    const managers = useMemo(() => (allEmployees || []).filter((e) => ['Admin', 'HR', 'Manager', 'Team Lead'].includes(e.role)), [allEmployees])
    const report = REPORTS.find((r) => r.key === tab)

    if (!canView) {
        return (
            <PeopleShell title="Reports" root={{ label: 'Reports', to: '/reports/attendance' }} crumbs={[{ label: 'Reports' }]}>
                <div className="pp-card"><EmptyState icon="mdi-lock-outline" title="You don't have access" text="Reports are available to HR, managers and admins." /></div>
            </PeopleShell>
        )
    }

    /* ---------- per-report data shaping ---------- */
    const hc = [...(headcount || [])].sort((a, b) => b.count - a.count)
    const hcTotal = hc.reduce((s, h) => s + h.count, 0)

    const att = (attendance || []).map((a) => {
        const get = (s) => a.statuses?.find((x) => x.status === s)?.count || 0
        const present = get('Present') + get('Late')
        const half = get('Half Day')
        const absent = get('Absent')
        const days = present + half + absent
        return { ...a, present, half, absent, rate: days ? Math.round(((present + half * 0.5) / days) * 100) : 0 }
    }).sort((a, b) => a.rate - b.rate)
    const attAvg = att.length ? Math.round(att.reduce((s, a) => s + a.rate, 0) / att.length) : 0

    const lvTypes = leave?.byType || []
    const lvStatus = leave?.byStatus || []
    const pay = [...(payroll || [])].sort((a, b) => String(a.period).localeCompare(String(b.period)))
    const exCat = expense?.byCategory || []
    const exStatus = expense?.byStatus || []

    const exportCurrent = () => {
        if (tab === 'headcount') downloadCsv('headcount', ['Department', 'Employees', 'Share %'], hc.map((h) => [h.department, h.count, hcTotal ? Math.round((h.count / hcTotal) * 100) : 0]))
        if (tab === 'attendance') downloadCsv('attendance', ['Employee', 'Department', 'Present', 'Half day', 'Absent', 'Attendance %'], att.map((a) => [`${a.firstName} ${a.lastName}`, a.department, a.present, a.half, a.absent, a.rate]))
        if (tab === 'leave') downloadCsv('leave', ['Leave type', 'Requests', 'Days'], lvTypes.map((t) => [t.leaveType, t.count, t.totalDays]))
        if (tab === 'payroll') downloadCsv('payroll', ['Period', 'Status', 'Gross', 'Deductions', 'Net'], pay.map((p) => [p.period, p.status, p.totalGross, p.totalDeductions, p.totalNet]))
        if (tab === 'expenses') downloadCsv('expenses', ['Category', 'Claims', 'Total'], exCat.map((c) => [c.category, c.count, c.total]))
        if (tab === 'projects') downloadCsv('projects', ['Project', 'Manager', 'Members', 'Start', 'End', 'Status', 'Tasks', 'Completed', 'Pending', 'Overdue'], (projects || []).map((p) => [p.projectName, fullName(p.projectManager), p.teamMembers?.length || 0, fmtDate(p.startDate), fmtDate(p.endDate), p.status, p.totalTasks, p.completedTasks, p.pendingTasks, p.overdueTasks]))
        if (tab === 'tasks') downloadCsv('tasks', ['Task', 'Project', 'Assignee', 'Priority', 'Status', 'Due', 'Created', 'Overdue'], (tasks || []).map((t) => [t.title, t.project?.projectName || '', t.assignedTo ? fullName(t.assignedTo) : 'Unassigned', t.priority, t.status, fmtDate(t.dueDate), fmtDate(t.createdAt), t.isOverdue ? 'Yes' : 'No']))
    }

    return (
        <PeopleShell title="Reports" root={{ label: 'Reports', to: '/reports/attendance' }} crumbs={[{ label: report.label }]}>
            <ErrorBanner error={error} />

            <div className="rp-layout">
                <nav className="pp-card rp-nav" aria-label="Reports">
                    <div className="rp-nav-label">Reports</div>
                    {REPORTS.map((r) => (
                        <button key={r.key} type="button" className={tab === r.key ? 'active' : ''} style={{ '--c': r.color }} onClick={() => setTab(r.key)} aria-current={tab === r.key ? 'page' : undefined}>
                            <i className={`mdi ${r.icon}`}></i>{r.label}
                        </button>
                    ))}
                </nav>

                <div>
                    <div className="rp-head" style={{ '--c': report.color }}>
                        <div><h2><i className={`mdi ${report.icon}`}></i>{report.label} report</h2><p>{report.desc}</p></div>
                        <button type="button" className="pp-btn" onClick={exportCurrent}><i className="mdi mdi-download-outline"></i> Export CSV</button>
                    </div>

                    {/* ===================== Headcount ===================== */}
                    {tab === 'headcount' && (
                        <>
                            <div className="at-tiles">
                                <Tile icon="mdi-account-group-outline" color="#0284c7" value={hcTotal} label="Employees" />
                                <Tile icon="mdi-office-building-outline" color="#7c3aed" value={hc.length} label="Departments" />
                                <Tile icon="mdi-trophy-outline" color="#d97706" value={hc[0]?.department || '—'} label={hc[0] ? `Largest · ${hc[0].count}` : 'Largest'} />
                                <Tile icon="mdi-scale-balance" color="#059669" value={hc.length ? Math.round(hcTotal / hc.length) : 0} label="Average per department" />
                            </div>
                            {!hc.length ? <div className="pp-card"><EmptyState icon="mdi-chart-bar" title="No data yet" /></div> : (
                                <div className="rp-two">
                                    <section className="pp-card rp-chart"><h3>By department</h3><div className="rp-chart-box"><ReactECharts style={{ height: '100%' }} option={hbar([...hc].reverse().map((h) => h.department), [...hc].reverse().map((h) => h.count), [...hc].reverse().map((h) => deptColor(h.department)))} notMerge /></div></section>
                                    <section className="pp-card">
                                        <table className="at-table"><thead><tr><th>Department</th><th>Employees</th><th className="hide-sm">Share</th></tr></thead><tbody>
                                            {hc.map((h) => <tr key={h.department}><td><DeptTag name={h.department} /></td><td className="rp-num">{h.count}</td><td className="hide-sm"><div className="rp-rate"><b>{hcTotal ? Math.round((h.count / hcTotal) * 100) : 0}%</b><span className="rp-bar"><span style={{ width: `${hcTotal ? (h.count / hcTotal) * 100 : 0}%`, background: deptColor(h.department) }}></span></span></div></td></tr>)}
                                        </tbody></table>
                                    </section>
                                </div>
                            )}
                        </>
                    )}

                    {/* ===================== Attendance ===================== */}
                    {tab === 'attendance' && (
                        <>
                            <div className="at-tiles">
                                <Tile icon="mdi-percent-outline" color={attAvg >= 90 ? '#059669' : attAvg >= 75 ? '#d97706' : '#e11d48'} value={`${attAvg}%`} label="Average attendance" />
                                <Tile icon="mdi-star-circle-outline" color="#059669" value={att.filter((a) => a.absent === 0 && a.half === 0 && a.present > 0).length} label="Perfect attendance" />
                                <Tile icon="mdi-account-alert-outline" color="#e11d48" value={att.filter((a) => a.rate < 75).length} label="Below 75%" />
                                <Tile icon="mdi-close-circle-outline" color="#64748b" value={att.reduce((s, a) => s + a.absent, 0)} label="Absences this month" />
                            </div>
                            <section className="pp-card">
                                {!att.length ? <EmptyState icon="mdi-clock-outline" title="No attendance records this month" /> : (
                                    <table className="at-table"><thead><tr><th>Employee</th><th className="hide-md">Department</th><th>Present</th><th className="hide-sm">Half</th><th>Absent</th><th>Attendance</th></tr></thead><tbody>
                                        {att.map((a) => (
                                            <tr key={a.employeeId}>
                                                <td><div className="at-person"><Avatar person={a} size={32} /><b>{a.firstName} {a.lastName}</b></div></td>
                                                <td className="hide-md"><DeptTag name={a.department} /></td>
                                                <td className="rp-num good">{a.present}</td>
                                                <td className="hide-sm rp-num">{a.half}</td>
                                                <td className={`rp-num ${a.absent ? 'bad' : ''}`}>{a.absent}</td>
                                                <td><div className="rp-rate"><b>{a.rate}%</b><span className="rp-bar"><span style={{ width: `${a.rate}%`, background: a.rate >= 90 ? '#10b981' : a.rate >= 75 ? '#f59e0b' : '#f43f5e' }}></span></span></div></td>
                                            </tr>
                                        ))}
                                    </tbody></table>
                                )}
                            </section>
                        </>
                    )}

                    {/* ===================== Leave ===================== */}
                    {tab === 'leave' && (
                        <>
                            <div className="at-tiles">
                                <Tile icon="mdi-file-document-multiple-outline" color="#7c3aed" value={lvTypes.reduce((s, t) => s + t.count, 0)} label="Requests" />
                                <Tile icon="mdi-calendar-range" color="#0284c7" value={lvTypes.reduce((s, t) => s + (t.totalDays || 0), 0)} label="Days requested" />
                                <Tile icon="mdi-check-circle-outline" color="#059669" value={lvStatus.find((s) => s.status === 'Approved')?.count || 0} label="Approved" />
                                <Tile icon="mdi-timer-sand" color="#d97706" value={lvStatus.find((s) => s.status === 'Pending')?.count || 0} label="Pending" />
                            </div>
                            {!lvTypes.length ? <div className="pp-card"><EmptyState icon="mdi-beach" title="No leave data yet" /></div> : (
                                <div className="rp-two">
                                    <section className="pp-card rp-chart"><h3>Days by leave type</h3><div className="rp-chart-box"><ReactECharts style={{ height: '100%' }} option={donut(lvTypes.map((t) => ({ name: t.leaveType, value: t.totalDays, itemStyle: { color: leaveMeta(t.leaveType).color } })))} notMerge /></div></section>
                                    <section className="pp-card rp-chart"><h3>Requests by status</h3><div className="rp-chart-box"><ReactECharts style={{ height: '100%' }} option={hbar(lvStatus.map((s) => s.status), lvStatus.map((s) => s.count), lvStatus.map((s) => leaveStatusMeta(s.status).color))} notMerge /></div></section>
                                </div>
                            )}
                        </>
                    )}

                    {/* ===================== Payroll ===================== */}
                    {tab === 'payroll' && (
                        <>
                            <div className="at-tiles">
                                <Tile icon="mdi-cash-multiple" color="#0b0f19" value={moneyShort(pay.reduce((s, p) => s + (p.totalNet || 0), 0))} label={`Net paid · ${pay.length} runs`} />
                                <Tile icon="mdi-scale-balance" color="#0284c7" value={moneyShort(pay.length ? pay.reduce((s, p) => s + (p.totalNet || 0), 0) / pay.length : 0)} label="Average per run" />
                                <Tile icon="mdi-trending-up" color="#059669" value={moneyShort(pay.reduce((s, p) => s + (p.totalGross || 0), 0))} label="Gross cost" />
                                <Tile icon="mdi-trending-down" color="#e11d48" value={moneyShort(pay.reduce((s, p) => s + (p.totalDeductions || 0), 0))} label="Deductions" />
                            </div>
                            {!pay.length ? <div className="pp-card"><EmptyState icon="mdi-cash-multiple" title="No payroll runs yet" /></div> : (
                                <>
                                    <section className="pp-card rp-chart mb-3"><h3>Monthly cost</h3><div className="rp-chart-box">
                                        <ReactECharts style={{ height: '100%' }} notMerge option={{
                                            tooltip: { trigger: 'axis', valueFormatter: (v) => money(v) },
                                            legend: { bottom: 0, icon: 'circle', textStyle: { color: '#64748b' } },
                                            grid: { left: 8, right: 8, top: 16, bottom: 36, containLabel: true },
                                            xAxis: { type: 'category', data: pay.map((p) => periodLabel(p.period, { month: 'short', year: '2-digit' })), axisTick: { show: false } },
                                            yAxis: { type: 'value', axisLabel: { formatter: (v) => moneyShort(v) }, splitLine: { lineStyle: { type: 'dashed', color: '#e2e8f0' } } },
                                            series: [
                                                { name: 'Net', type: 'bar', stack: 'p', data: pay.map((p) => p.totalNet), itemStyle: { color: '#0ea5e9', borderRadius: [0, 0, 0, 0] }, barWidth: 22 },
                                                { name: 'Deductions', type: 'bar', stack: 'p', data: pay.map((p) => p.totalDeductions), itemStyle: { color: '#fda4af', borderRadius: [6, 6, 0, 0] } },
                                            ],
                                        }} />
                                    </div></section>
                                    <section className="pp-card">
                                        <table className="at-table"><thead><tr><th>Period</th><th className="hide-sm">Status</th><th className="hide-md">Gross</th><th className="hide-md">Deductions</th><th>Net</th></tr></thead><tbody>
                                            {[...pay].reverse().map((p) => <tr key={p._id}><td><b>{periodLabel(p.period)}</b></td><td className="hide-sm"><PayStatus status={p.status} /></td><td className="hide-md"><span className="py-amount">{money(p.totalGross)}</span></td><td className="hide-md"><span className="py-amount neg">− {money(p.totalDeductions)}</span></td><td><span className="py-amount net">{money(p.totalNet)}</span></td></tr>)}
                                        </tbody></table>
                                    </section>
                                </>
                            )}
                        </>
                    )}

                    {/* ===================== Expenses ===================== */}
                    {tab === 'expenses' && (
                        <>
                            <div className="at-tiles">
                                <Tile icon="mdi-receipt" color="#ea580c" value={moneyShort(exStatus.reduce((s, x) => s + (x.total || 0), 0))} label="Total claimed" />
                                <Tile icon="mdi-cash-check" color="#059669" value={moneyShort(exStatus.find((s) => s.status === 'Reimbursed')?.total || 0)} label="Reimbursed" />
                                <Tile icon="mdi-cash-refund" color="#0284c7" value={moneyShort(exStatus.find((s) => s.status === 'Approved')?.total || 0)} label="Approved · to pay" />
                                <Tile icon="mdi-timer-sand" color="#d97706" value={exStatus.find((s) => s.status === 'Pending')?.count || 0} label="Pending claims" />
                            </div>
                            {!exCat.length ? <div className="pp-card"><EmptyState icon="mdi-receipt" title="No approved expenses yet" /></div> : (
                                <div className="rp-two">
                                    <section className="pp-card rp-chart"><h3>Spend by category</h3><div className="rp-chart-box"><ReactECharts style={{ height: '100%' }} option={{ ...donut(exCat.map((c) => ({ name: c.category, value: c.total, itemStyle: { color: categoryMeta(c.category).color } }))), tooltip: { trigger: 'item', formatter: (p) => `${p.name}: ${money(p.value)} (${p.percent}%)` } }} notMerge /></div></section>
                                    <section className="pp-card">
                                        <table className="at-table"><thead><tr><th>Category</th><th>Claims</th><th>Total</th></tr></thead><tbody>
                                            {exCat.map((c) => { const m = categoryMeta(c.category); return <tr key={c.category}><td><span className="pp-tag" style={{ '--tag': m.color }}><i className={`mdi ${m.icon}`}></i>{c.category}</span></td><td className="rp-num">{c.count}</td><td><span className="py-amount">{money(c.total)}</span></td></tr> })}
                                            {exStatus.map((s) => <tr key={s.status}><td><span className="pp-tag" style={{ '--tag': expenseStatusMeta(s.status).color }}><i className={`mdi ${expenseStatusMeta(s.status).icon}`}></i>{s.status}</span></td><td className="rp-num">{s.count}</td><td><span className="py-amount">{money(s.total)}</span></td></tr>)}
                                        </tbody></table>
                                    </section>
                                </div>
                            )}
                        </>
                    )}

                    {/* ===================== Projects ===================== */}
                    {tab === 'projects' && (
                        <section className="pp-card">
                            <div className="rp-filters">
                                <select className="pp-select" value={projectFilters.projectId} onChange={(e) => setProjectFilters((f) => ({ ...f, projectId: e.target.value }))} aria-label="Project">
                                    <option value="">All projects</option>
                                    {allProjects?.map((p) => <option key={p._id} value={p._id}>{p.projectName}</option>)}
                                </select>
                                <select className="pp-select" value={projectFilters.projectManager} onChange={(e) => setProjectFilters((f) => ({ ...f, projectManager: e.target.value }))} aria-label="Manager">
                                    <option value="">All managers</option>
                                    {managers.map((m) => <option key={m._id} value={m._id}>{fullName(m)}</option>)}
                                </select>
                                <select className="pp-select" value={projectFilters.status} onChange={(e) => setProjectFilters((f) => ({ ...f, status: e.target.value }))} aria-label="Status">
                                    <option value="">All statuses</option>
                                    {Object.keys(PROJECT_STATUS).map((s) => <option key={s} value={s}>{s}</option>)}
                                </select>
                                <input type="date" className="pp-input" value={projectFilters.startDate} onChange={(e) => setProjectFilters((f) => ({ ...f, startDate: e.target.value }))} title="From" aria-label="From" />
                                <input type="date" className="pp-input" value={projectFilters.endDate} onChange={(e) => setProjectFilters((f) => ({ ...f, endDate: e.target.value }))} title="To" aria-label="To" />
                            </div>
                            {!projects?.length ? <EmptyState icon="mdi-folder-outline" title="No projects match these filters" /> : (
                                <table className="at-table"><thead><tr><th>Project</th><th className="hide-md">Manager</th><th className="hide-sm">Status</th><th>Progress</th><th className="hide-lg">Done / total</th><th>Overdue</th></tr></thead><tbody>
                                    {projects.map((p) => {
                                        const pct = p.totalTasks ? Math.round((p.completedTasks / p.totalTasks) * 100) : (p.progress || 0)
                                        return (
                                            <tr key={p._id}>
                                                <td><b>{p.projectName}</b><div style={{ fontSize: 12, color: 'var(--pp-muted)' }}>{fmtDate(p.startDate)} → {fmtDate(p.endDate)}</div></td>
                                                <td className="hide-md">{p.projectManager ? <div className="at-person"><Avatar person={p.projectManager} size={26} />{fullName(p.projectManager)}</div> : '—'}</td>
                                                <td className="hide-sm"><ProjectStatus status={p.status} /></td>
                                                <td><div className="rp-rate"><b>{pct}%</b><span className="rp-bar"><span style={{ width: `${pct}%`, background: '#0ea5e9' }}></span></span></div></td>
                                                <td className="hide-lg rp-num">{p.completedTasks}/{p.totalTasks}</td>
                                                <td className={`rp-num ${p.overdueTasks ? 'bad' : ''}`}>{p.overdueTasks || 0}</td>
                                            </tr>
                                        )
                                    })}
                                </tbody></table>
                            )}
                        </section>
                    )}

                    {/* ===================== Tasks ===================== */}
                    {tab === 'tasks' && (
                        <section className="pp-card">
                            <div className="rp-filters">
                                <select className="pp-select" value={taskFilters.projectId} onChange={(e) => setTaskFilters((f) => ({ ...f, projectId: e.target.value }))} aria-label="Project">
                                    <option value="">All projects</option>
                                    {allProjects?.map((p) => <option key={p._id} value={p._id}>{p.projectName}</option>)}
                                </select>
                                <select className="pp-select" value={taskFilters.assignedTo} onChange={(e) => setTaskFilters((f) => ({ ...f, assignedTo: e.target.value }))} aria-label="Assignee">
                                    <option value="">All assignees</option>
                                    {allEmployees?.map((e) => <option key={e._id} value={e._id}>{fullName(e)}</option>)}
                                </select>
                                <select className="pp-select" value={taskFilters.status} onChange={(e) => setTaskFilters((f) => ({ ...f, status: e.target.value }))} aria-label="Status">
                                    <option value="">All statuses</option>
                                    {['To Do', 'In Progress', 'In Review', 'Blocked', 'Done'].map((s) => <option key={s} value={s}>{s}</option>)}
                                </select>
                                <select className="pp-select" value={taskFilters.priority} onChange={(e) => setTaskFilters((f) => ({ ...f, priority: e.target.value }))} aria-label="Priority">
                                    <option value="">All priorities</option>
                                    {['Low', 'Medium', 'High'].map((s) => <option key={s} value={s}>{s}</option>)}
                                </select>
                                <button type="button" className={`pp-btn sm ${taskFilters.overdue === 'true' ? 'danger solid' : ''}`} onClick={() => setTaskFilters((f) => ({ ...f, overdue: f.overdue === 'true' ? '' : 'true' }))} aria-pressed={taskFilters.overdue === 'true'}>
                                    <i className="mdi mdi-alert-circle-outline"></i> Overdue only
                                </button>
                            </div>
                            {!tasks?.length ? <EmptyState icon="mdi-format-list-checks" title="No tasks match these filters" /> : (
                                <table className="at-table"><thead><tr><th>Task</th><th className="hide-md">Assignee</th><th className="hide-lg">Priority</th><th>Status</th><th className="hide-sm">Due</th></tr></thead><tbody>
                                    {tasks.map((t) => (
                                        <tr key={t._id}>
                                            <td><b>{t.title}</b><div style={{ fontSize: 12, color: 'var(--pp-muted)' }}>{t.project?.projectName || 'No project'}</div></td>
                                            <td className="hide-md">{t.assignedTo ? <div className="at-person"><Avatar person={t.assignedTo} size={26} />{fullName(t.assignedTo)}</div> : <span className="pp-muted-dash">Unassigned</span>}</td>
                                            <td className="hide-lg"><PriorityTag priority={t.priority} /></td>
                                            <td><TaskStatus status={t.status} /></td>
                                            <td className="hide-sm"><span className={t.isOverdue ? 'rp-num bad' : ''}>{fmtDate(t.dueDate)}{t.isOverdue ? ' · overdue' : ''}</span></td>
                                        </tr>
                                    ))}
                                </tbody></table>
                            )}
                        </section>
                    )}
                </div>
            </div>
        </PeopleShell>
    )
}
