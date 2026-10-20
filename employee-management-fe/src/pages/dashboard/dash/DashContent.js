import React, { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import { DashNav } from '../../../components/dashboard/dash/DashNav'
import Chart from "react-apexcharts";
import dashboardActions from '../../../redux/dashboard/Actions'
import reportActions from '../../../redux/report/Actions'
import announcementActions from '../../../redux/announcement/Actions'
import leaveActions from '../../../redux/leave/Actions'
import attendanceActions from '../../../redux/attendance/Actions'
import { CountUp } from '../../../components/common/CountUp'
import { HeadcountByDepartment } from '../../../components/dashboard/widgets/HeadcountByDepartment'
import { TaskPipelineDonut } from '../../../components/dashboard/widgets/TaskPipelineDonut'
import { LeaveMixChart } from '../../../components/dashboard/widgets/LeaveMixChart'
import { ProjectMomentum } from '../../../components/dashboard/widgets/ProjectMomentum'
import { AnnouncementsWidget } from '../../../components/dashboard/widgets/AnnouncementsWidget'
import './DashContent.css'
import { useAccess } from '../../../hooks/useAccess'

const WORKDAY_HOURS = 9

const formatTime = (value) => {
    if (!value) return '--:--'
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const greeting = (date) => {
    const h = date.getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
}

const initials = (first, last) => `${first?.[0] || ''}${last?.[0] || ''}`.toUpperCase() || '?'

const quickActions = [
    { to: '/leave/apply', icon: 'mdi-calendar-plus', label: 'Apply leave' },
    { to: '/attendance/history', icon: 'mdi-clock-outline', label: 'My attendance' },
    { to: '/payroll/payslips', icon: 'mdi-file-document-outline', label: 'Payslips' },
    { to: '/helpdesk', icon: 'mdi-lifebuoy', label: 'Raise ticket' },
]

export const DashContent = () => {
    const dispatch = useDispatch()
    const { summary, attendanceTrend, taskStatus, leaveBreakdown, projectProgress } = useSelector((state) => state.dashboardReducer || {})
    const { headcount } = useSelector((state) => state.reportReducer || {})
    const { list: announcements, listLoading: announcementsLoading } = useSelector((state) => state.announcementReducer || {})
    const { pending: pendingLeaves, balance } = useSelector((state) => state.leaveReducer || {})
    const { today: todayAttendance, saving: checkingInOut, error: attendanceError } = useSelector((state) => state.attendanceReducer || {})
    const { isAuthenticated: user, permissions } = useSelector((state) => state.authReducer || {})
    const { can, canSee } = useAccess()
    const canApprove = can(['Admin', 'HR', 'Manager', 'Team Lead'], 'leave')
    // Same rule the Sidebar uses, so a KPI tile only links to a screen this user can open.
    const canOpen = (roles, module) =>
        (!roles || roles.includes(user?.role)) &&
        (!module || user?.role === 'Admin' || permissions?.includes(module))
    const [now, setNow] = useState(() => new Date())

    useEffect(() => {
        dispatch({ type: dashboardActions.GET_DASHBOARD_SUMMARY })
        dispatch({ type: dashboardActions.GET_ATTENDANCE_TREND })
        dispatch({ type: dashboardActions.GET_TASK_STATUS })
        dispatch({ type: dashboardActions.GET_LEAVE_BREAKDOWN })
        dispatch({ type: dashboardActions.GET_PROJECT_PROGRESS })
        dispatch({ type: reportActions.GET_HEADCOUNT_REPORT })
        dispatch({ type: announcementActions.GET_ANNOUNCEMENTS })
        dispatch({ type: attendanceActions.GET_TODAY_ATTENDANCE })
        if (canApprove) {
            dispatch({ type: leaveActions.GET_PENDING_LEAVES })
        } else {
            dispatch({ type: leaveActions.GET_LEAVE_BALANCE })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dispatch, canApprove])

    // Live clock for the attendance panel — minute precision is enough.
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 30000)
        return () => clearInterval(timer)
    }, [])

    useEffect(() => {
        if (window.feather) window.feather.replace()
    }, [summary, todayAttendance, pendingLeaves, announcements])

    const onCheckIn = () => dispatch({ type: attendanceActions.CHECK_IN, payload: { attendanceType: 'Office' } })
    const onCheckOut = () => dispatch({ type: attendanceActions.CHECK_OUT, payload: {} })

    const trendOptions = {
        chart: { toolbar: { show: false }, zoom: { enabled: false }, fontFamily: 'inherit' },
        stroke: { curve: "smooth", width: 3 },
        colors: ["#0ea5e9"],
        fill: {
            type: 'gradient',
            gradient: { shadeIntensity: 1, opacityFrom: 0.35, opacityTo: 0.02, stops: [0, 90, 100] },
        },
        dataLabels: { enabled: false },
        markers: { size: 4, strokeWidth: 2, strokeColors: '#fff', hover: { size: 6 } },
        grid: { borderColor: 'rgba(148, 163, 184, .2)', strokeDashArray: 4 },
        xaxis: {
            categories: attendanceTrend?.map((d) => new Date(d.date).toLocaleDateString(undefined, { weekday: 'short' })) || [],
            axisBorder: { show: false },
            axisTicks: { show: false },
        },
        yaxis: { labels: { formatter: (v) => Math.round(v) } },
        tooltip: { y: { formatter: (v) => `${v} present` } },
    };

    const trendSeries = [
        { name: "Present", data: attendanceTrend?.map((d) => d.present) || [] },
    ];

    const total = summary?.totalEmployees || 0
    const pct = (n) => (total ? Math.round(((n || 0) / total) * 100) : 0)
    const MANAGERS = ['Admin', 'HR', 'Manager', 'Team Lead']

    const kpis = [
        {
            label: 'Total Employees', value: summary?.totalEmployees, icon: 'mdi-account-group-outline', color: '#0b0f19',
            hint: 'Active workforce', to: '/employees',
        },
        {
            label: 'Present Today', value: summary?.presentToday, icon: 'mdi-account-check-outline', color: '#10b981',
            hint: `${pct(summary?.presentToday)}% attendance rate`, meter: pct(summary?.presentToday),
            to: canOpen(MANAGERS, 'attendance') ? '/attendance/team' : null,
        },
        {
            label: 'Absent Today', value: summary?.absentToday, icon: 'mdi-account-remove-outline', color: '#f43f5e',
            hint: `${pct(summary?.absentToday)}% of workforce`, meter: pct(summary?.absentToday),
            to: canOpen(MANAGERS, 'attendance') ? '/attendance/team' : null,
        },
        {
            label: 'On Leave', value: summary?.onLeaveToday, icon: 'mdi-calendar-account-outline', color: '#0ea5e9',
            hint: `${pct(summary?.onLeaveToday)}% of workforce`, meter: pct(summary?.onLeaveToday), to: '/leave/team-calendar',
        },
        {
            label: 'Pending Approvals', value: summary?.pendingLeaveApprovals, icon: 'mdi-clipboard-clock-outline', color: '#f59e0b',
            hint: summary?.pendingLeaveApprovals ? 'Needs review' : 'All clear',
            to: canOpen(MANAGERS, 'leave') ? '/leave/approvals' : null,
        },
        {
            label: 'Open Tickets', value: summary?.openTickets, icon: 'mdi-lifebuoy', color: '#8b5cf6',
            hint: summary?.openTickets ? 'Awaiting response' : 'All resolved',
            to: canOpen(MANAGERS, 'helpdesk') ? '/helpdesk/all' : '/helpdesk',
        },
    ];

    const trendValues = attendanceTrend?.map((d) => d.present || 0) || []
    const trendAvg = trendValues.length ? Math.round(trendValues.reduce((a, b) => a + b, 0) / trendValues.length) : 0
    const trendPeak = trendValues.length ? Math.max(...trendValues) : 0

    const workedPct = Math.min(100, ((Number(todayAttendance?.workedHours) || 0) / WORKDAY_HOURS) * 100)
    const punchStatus = !todayAttendance
        ? { cls: 'is-out', text: 'Not checked in' }
        : todayAttendance.isCheckedOut
            ? { cls: 'is-done', text: todayAttendance.sessions?.length > 1 ? `Checked out · ${todayAttendance.sessions.length} sessions` : 'Checked out' }
            : { cls: 'is-in', text: todayAttendance.status || 'Checked in' }

    return (
        <div>
            <DashNav>
                <div className="main-content">

                    <div className="page-content db">
                        <div className="container-fluid">

                            <section className="db-hero">
                                <div>
                                    <div className="db-date">
                                        <i className="mdi mdi-calendar-today"></i>
                                        {now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                                    </div>
                                    <h1>
                                        {greeting(now)}, {user?.firstName || 'there'} 👋
                                        {user?.role && <span className="db-role">{user.role}</span>}
                                    </h1>
                                    <p className="db-hero-sub">Here's what's happening across your workspace today.</p>
                                    <div className="db-actions">
                                        {quickActions.map((a) => (
                                            <Link key={a.to} to={a.to} className="db-action" title={a.label}>
                                                <i className={`mdi ${a.icon}`}></i><span>{a.label}</span>
                                            </Link>
                                        ))}
                                    </div>
                                </div>

                                {/* Check in / out only for people given the My Attendance screen. */}
                                {canSee('screen:attendance') && <div className="db-punch">
                                    <div className="db-punch-head">
                                        <div className="db-clock">
                                            {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            <small>Your attendance today</small>
                                        </div>
                                        <span className={`db-status ${punchStatus.cls}`}>{punchStatus.text}</span>
                                    </div>

                                    <div className="db-punch-times">
                                        <div><span>Check in</span><b>{formatTime(todayAttendance?.checkIn)}</b></div>
                                        <div><span>Check out</span><b>{formatTime(todayAttendance?.checkOut)}</b></div>
                                        <div><span>Worked</span><b>{todayAttendance?.workedHours ?? 0}h</b></div>
                                    </div>

                                    <div className="db-progress" title={`${Math.round(workedPct)}% of a ${WORKDAY_HOURS}h day`}>
                                        <span style={{ width: `${workedPct}%` }}></span>
                                    </div>

                                    {!todayAttendance ? (
                                        <button className="db-punch-btn" onClick={onCheckIn} disabled={checkingInOut}>
                                            <i className="mdi mdi-login-variant"></i> {checkingInOut === 'locating' ? 'Getting your location…' : checkingInOut ? 'Checking in…' : 'Check in'}
                                        </button>
                                    ) : !todayAttendance.isCheckedOut ? (
                                        <button className="db-punch-btn" onClick={onCheckOut} disabled={checkingInOut}>
                                            <i className="mdi mdi-logout-variant"></i> {checkingInOut === 'locating' ? 'Getting your location…' : checkingInOut ? 'Checking out…' : 'Check out'}
                                        </button>
                                    ) : (
                                        <button className="db-punch-btn again" onClick={onCheckIn} disabled={checkingInOut}>
                                            <i className="mdi mdi-login-variant"></i> {checkingInOut === 'locating' ? 'Getting your location…' : checkingInOut ? 'Checking in…' : 'Check in again'}
                                        </button>
                                    )}
                                    {/* "No attendance found" only means not checked in yet; anything else (e.g. location blocked) is shown. */}
                                    {attendanceError && !/no attendance found/i.test(attendanceError) && (
                                        <div className="db-punch-error" role="alert"><i className="mdi mdi-map-marker-alert-outline"></i>{attendanceError}</div>
                                    )}
                                    <div className="db-punch-hint"><i className="mdi mdi-map-marker-outline"></i> Location is recorded at every check in &amp; check out</div>
                                </div>}
                            </section>

                            <div className="db-section">
                                <h2>Overview</h2>
                                <p>Live headcount and requests for today</p>
                            </div>

                            <div className="db-kpis">
                                {kpis.map((k, i) => {
                                    const Tile = k.to ? Link : 'div'
                                    return (
                                        <Tile
                                            key={k.label}
                                            {...(k.to ? { to: k.to } : {})}
                                            className={`db-kpi ${k.to ? 'is-link' : ''}`}
                                            style={{ '--kpi': k.color, animationDelay: `${i * 0.04}s` }}
                                        >
                                            <div className="db-kpi-top">
                                                <div className="db-kpi-icon"><i className={`mdi ${k.icon}`}></i></div>
                                                {k.to && <i className="mdi mdi-arrow-top-right db-kpi-go"></i>}
                                            </div>
                                            <div className="db-kpi-label">{k.label}</div>
                                            <div className="db-kpi-value">
                                                {summary ? <CountUp value={k.value || 0} /> : <span className="db-skel" />}
                                            </div>
                                            {k.meter !== undefined && (
                                                <div className="db-meter"><span style={{ width: summary ? `${k.meter}%` : 0 }}></span></div>
                                            )}
                                            <div className="db-kpi-hint">{summary ? k.hint : ' '}</div>
                                        </Tile>
                                    )
                                })}
                            </div>

                            <div className="db-section">
                                <h2>Insights</h2>
                                <p>Trends across attendance, teams, tasks and projects</p>
                            </div>

                            <div className="row">
                                <div className="col-xl-8">
                                    <div className="card">
                                        <div className="card-header d-flex align-items-center flex-wrap gap-2">
                                            <h5 className="card-title mb-0 flex-grow-1">Attendance — last 7 days</h5>
                                            <div className="db-chips">
                                                <span className="db-chip"><small>Avg / day</small>{trendAvg}</span>
                                                <span className="db-chip"><small>Peak</small>{trendPeak}</span>
                                            </div>
                                            <Link to="/attendance/history" className="db-link">Details <i className="mdi mdi-chevron-right"></i></Link>
                                        </div>
                                        <div className="card-body">
                                            <Chart options={trendOptions} series={trendSeries} type="area" height={320} />
                                        </div>
                                    </div>
                                </div>
                                <div className="col-xl-4">
                                    <HeadcountByDepartment headcount={headcount} />
                                </div>
                            </div>

                            <div className="row">
                                <div className="col-xl-4 col-md-6">
                                    <TaskPipelineDonut taskStatus={taskStatus} />
                                </div>
                                <div className="col-xl-4 col-md-6">
                                    <LeaveMixChart leaveBreakdown={leaveBreakdown} />
                                </div>
                                <div className="col-xl-4 col-md-6">
                                    <ProjectMomentum projectProgress={projectProgress} />
                                </div>
                            </div>

                            <div className="db-section">
                                <h2>Activity</h2>
                                <p>What needs your attention</p>
                            </div>

                            <div className="row">
                                <div className="col-xl-6">
                                    <AnnouncementsWidget announcements={announcements} loading={announcementsLoading} />
                                </div>

                                <div className="col-xl-6">
                                    <div className="card card-h-100">
                                        <div className="card-header d-flex align-items-center">
                                            <h5 className="card-title mb-0 flex-grow-1">{canApprove ? 'Pending leave approvals' : 'My leave balance'}</h5>
                                            <Link to={canApprove ? '/leave/approvals' : '/leave'} className="db-link">View all <i className="mdi mdi-chevron-right"></i></Link>
                                        </div>
                                        <div className="card-body">
                                            {canApprove ? (
                                                !pendingLeaves?.length ? (
                                                    <div className="db-empty"><i className="mdi mdi-check-all"></i>You're all caught up.</div>
                                                ) : (
                                                    <ul className="db-list">
                                                        {pendingLeaves.slice(0, 5).map((lv) => (
                                                            <li className="db-item" key={lv._id}>
                                                                <span className="db-avatar">{initials(lv.employeeId?.firstName, lv.employeeId?.lastName)}</span>
                                                                <div className="db-item-body">
                                                                    <p className="db-item-title">{lv.employeeId?.firstName} {lv.employeeId?.lastName}</p>
                                                                    <p className="db-item-text">{lv.leaveType} · {lv.totalDays} day(s)</p>
                                                                </div>
                                                                <span className="db-pill">Pending</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                )
                                            ) : (
                                                <div className="db-balance">
                                                    <div style={{ '--bal': '#0ea5e9' }}><b>{balance?.casual?.balance ?? '—'}</b><span>Casual</span></div>
                                                    <div style={{ '--bal': '#f43f5e' }}><b>{balance?.sick?.balance ?? '—'}</b><span>Sick</span></div>
                                                    <div style={{ '--bal': '#10b981' }}><b>{balance?.earned?.balance ?? '—'}</b><span>Earned</span></div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <footer className="footer">
                        <div className="container-fluid">
                            <div className="row">
                                <div className="col-sm-6">
                                    {new Date().getFullYear()} © <span>Ho<b className='clr-blue'>O</b>ok</span>
                                </div>
                                <div className="col-sm-6">
                                    <div className="text-sm-end d-none d-sm-block">
                                        Design &amp; Develop by <span className="text-decoration-underline">Ho<b className='clr-blue'>O</b>ok</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </footer>
                </div>
            </DashNav>
        </div>
    )
}
