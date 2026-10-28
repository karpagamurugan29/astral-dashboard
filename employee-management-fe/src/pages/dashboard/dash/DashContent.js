import React, { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link, useNavigate } from 'react-router-dom'
import { DashNav } from '../../../components/dashboard/dash/DashNav'
import ReactECharts from 'echarts-for-react'
import * as echarts from 'echarts'
import dashboardActions from '../../../redux/dashboard/Actions'
import reportActions from '../../../redux/report/Actions'
import announcementActions from '../../../redux/announcement/Actions'
import leaveActions from '../../../redux/leave/Actions'
import attendanceActions from '../../../redux/attendance/Actions'
import { HeadcountByDepartment } from '../../../components/dashboard/widgets/HeadcountByDepartment'
import { AnnouncementsWidget } from '../../../components/dashboard/widgets/AnnouncementsWidget'
import { AuditHoursTrend, HoursByClient, TeamWeek, DeadlinesWidget, WorkingNowWidget, AttentionWidget, AuditTimelineToday } from '../../../components/dashboard/widgets/AuditWidgets'
import { DashboardTimer } from '../../../components/dashboard/widgets/DashboardTimer'
import { BusinessPulse } from '../../../components/dashboard/widgets/BusinessPulse'
import { TodayCheckins } from '../../../components/dashboard/widgets/TodayCheckins'
import { MyAuditsWidget } from '../../../components/dashboard/widgets/MyAuditsWidget'
import { BirthdayLineUp } from '../../../components/dashboard/widgets/BirthdayLineUp'
import { KpiCard, Panel, MonthAttendance, Ring, EmptyState, CountUp } from '../../../components/dashboard/widgets/PremiumUI'
import { ChartWidget } from '../../../components/dashboard/widgets/ChartWidget'
import { CheckInOptions, ModeTag, hoursLabel } from '../../../components/attendance/AttendanceUI'
import { fmtDuration } from '../../../components/audits/AuditUI'
import { useAccess } from '../../../hooks/useAccess'
import './DashContent.css'
import './DashPremium.css'

const WORKDAY_HOURS = 9
const SENIOR = ['Admin', 'HR', 'Manager', 'Team Lead']

const formatTime = (value) => (value ? new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '--:--')
const greeting = (h) => (h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening')
const initials = (first, last) => `${first?.[0] || ''}${last?.[0] || ''}`.toUpperCase() || '?'
const share = (part, whole) => (whole ? Math.min(100, (part / whole) * 100) : 0)

const LEAVE_STATUS = { Pending: ['#b45309', '#fef3c7', 'mdi-timer-sand'], Approved: ['#047857', '#d1fae5', 'mdi-check-circle-outline'], Rejected: ['#be123c', '#ffe4e6', 'mdi-close-circle-outline'], Cancelled: ['#64748b', '#f1f5f9', 'mdi-cancel'] }
const shortDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '')
const LEAVE_TYPES = [['casual', 'Casual', '#0ea5e9', 'mdi-weather-sunny'], ['sick', 'Sick', '#f43f5e', 'mdi-medical-bag'], ['earned', 'Earned', '#10b981', 'mdi-star-circle-outline']]

export const DashContent = () => {
    const navigate = useNavigate()
    const dispatch = useDispatch()
    const { summary, attendanceTrend, auditInsights, todayCheckins: todayCheckinsRaw, businessPulse } = useSelector((state) => state.dashboardReducer || {})
    const todayCheckins = todayCheckinsRaw?.rows ? todayCheckinsRaw : null
    const { headcount } = useSelector((state) => state.reportReducer || {})
    const { list: announcements, listLoading: announcementsLoading } = useSelector((state) => state.announcementReducer || {})
    const { pending: pendingLeaves, balance, history: myLeaves } = useSelector((state) => state.leaveReducer || {})
    const { today: todayAttendance, saving: checkingInOut, error: attendanceError, history } = useSelector((state) => state.attendanceReducer || {})
    const { isAuthenticated: user } = useSelector((state) => state.authReducer || {})
    const { can, canSee } = useAccess()
    const senior = SENIOR.includes(user?.role)
    const firmWide = ['Admin', 'HR'].includes(user?.role)
    const canApprove = can(SENIOR, 'leave')
    const canSeeTeamAttendance = can(SENIOR, 'attendance')
    const canSeeAudits = canSee('screen:audits')
    const canSeeAttendance = canSee('screen:attendance')
    const [now, setNow] = useState(() => new Date())
    const [workMode, setWorkMode] = useState('Office')
    const [checkInNote, setCheckInNote] = useState('')
    const [updatedAt, setUpdatedAt] = useState(() => new Date())

    // Everyone's widgets load once; the role-based ones load separately as soon as access is known,
    // so permissions arriving after the first render don't re-request everything (that used to fetch
    // most of this page two or three times). Announcements come from the header (TopHeader.js).
    const loadMine = () => {
        const d = new Date()
        dispatch({ type: dashboardActions.GET_DASHBOARD_SUMMARY })
        dispatch({ type: dashboardActions.GET_AUDIT_INSIGHTS })
        dispatch({ type: dashboardActions.GET_BUSINESS_PULSE })
        dispatch({ type: attendanceActions.GET_TODAY_ATTENDANCE })
        dispatch({ type: attendanceActions.GET_ATTENDANCE_HISTORY, month: d.getMonth() + 1, year: d.getFullYear() })
        dispatch({ type: leaveActions.GET_LEAVE_BALANCE })
        dispatch({ type: leaveActions.GET_LEAVE_HISTORY })
        setUpdatedAt(new Date())
    }
    const loadTeam = () => { if (canSeeTeamAttendance) dispatch({ type: dashboardActions.GET_TODAY_CHECKINS }) }
    const loadFirm = () => { if (firmWide) { dispatch({ type: dashboardActions.GET_ATTENDANCE_TREND }); dispatch({ type: reportActions.GET_HEADCOUNT_REPORT }) } }
    const loadApprovals = () => { if (canApprove) dispatch({ type: leaveActions.GET_PENDING_LEAVES }) }
    // the Refresh button: everything, including announcements
    const loadAll = () => { loadMine(); loadTeam(); loadFirm(); loadApprovals(); dispatch({ type: announcementActions.GET_ANNOUNCEMENTS }) }

    useEffect(() => {
        loadMine()
        // Live widgets (timers) refresh every minute.
        const t = setInterval(() => { dispatch({ type: dashboardActions.GET_AUDIT_INSIGHTS }); setUpdatedAt(new Date()) }, 60000)
        return () => clearInterval(t)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dispatch])
    useEffect(() => {
        loadTeam()
        if (!canSeeTeamAttendance) return undefined
        const t = setInterval(loadTeam, 60000) // who's in, live
        return () => clearInterval(t)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canSeeTeamAttendance])
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { loadFirm() }, [firmWide])
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { loadApprovals() }, [canApprove])

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 30000)
        return () => clearInterval(timer)
    }, [])

    useEffect(() => {
        if (window.feather) window.feather.replace()
    }, [summary, todayAttendance, pendingLeaves, announcements, auditInsights, todayCheckins])

    // After a check-in/out completes, refresh the month calendar and the live list.
    const [wasSaving, setWasSaving] = useState(false)
    useEffect(() => {
        if (wasSaving && !checkingInOut) {
            const d = new Date()
            dispatch({ type: attendanceActions.GET_ATTENDANCE_HISTORY, month: d.getMonth() + 1, year: d.getFullYear() })
            if (canSeeTeamAttendance) dispatch({ type: dashboardActions.GET_TODAY_CHECKINS })
        }
        setWasSaving(!!checkingInOut)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [checkingInOut])

    const onCheckIn = () => {
        dispatch({ type: attendanceActions.CHECK_IN, payload: { attendanceType: workMode, remarks: checkInNote.trim() } })
        setCheckInNote('')
    }
    const onCheckOut = () => dispatch({ type: attendanceActions.CHECK_OUT, payload: {} })

    /* ------------------------------ derived ------------------------------ */
    const ai = auditInsights || {}
    const sessions = todayAttendance?.sessions || []
    const isIn = !!todayAttendance?.currentSessionStart
    const closedH = sessions.reduce((s, x) => s + (x.checkIn && x.checkOut ? (new Date(x.checkOut) - new Date(x.checkIn)) / 36e5 : 0), 0)
    const workedH = isIn ? closedH + Math.max(0, (now - new Date(todayAttendance.currentSessionStart)) / 36e5) : (Number(todayAttendance?.workedHours) || closedH)
    const workedPct = Math.min(100, (workedH / WORKDAY_HOURS) * 100)
    const status = !todayAttendance ? { cls: 'out', text: 'Not checked in', icon: 'mdi-login-variant' }
        : isIn ? { cls: 'in', text: `Present · since ${formatTime(todayAttendance.currentSessionStart)}`, icon: 'mdi-check-circle-outline' }
            : { cls: 'done', text: todayAttendance.autoCheckedOut ? 'Checked out automatically' : 'Checked out', icon: 'mdi-check-all' }

    const total = summary?.totalEmployees || 0
    const auditTodayMin = (ai.todaySessions || []).reduce((s, x) => s + (x.end ? x.minutes : (now - new Date(x.start)) / 6e4), 0)
    const openAudits = Object.values(ai.statusCounts || {}).reduce((s, n) => s + n, 0)
    const att = ai.attention
    const waiting = att ? (att.pendingLeaves + att.pendingCorrections + att.pendingExpenses + att.overdueAudits + att.overBudgetAudits) : 0
    const nextDeadline = (ai.deadlines || [])[0]
    const myOverdue = (ai.deadlines || []).filter((d) => d.daysLeft < 0).length
    const myDueSoon = (ai.deadlines || []).filter((d) => d.daysLeft >= 0 && d.daysLeft <= 7).length

    const month = useMemo(() => {
        const recs = history || []
        return { present: recs.filter((r) => ['Present', 'Late', 'Half Day'].includes(r.status)).length, late: recs.filter((r) => r.status === 'Late').length }
    }, [history])
    const workdaysSoFar = useMemo(() => {
        let n = 0
        const d = new Date(now.getFullYear(), now.getMonth(), 1)
        while (d <= now) { if (d.getDay() !== 0 && d.getDay() !== 6) n++; d.setDate(d.getDate() + 1) }
        return n
    }, [now])
    const leaveTotal = (balance?.casual?.balance ?? 0) + (balance?.sick?.balance ?? 0) + (balance?.earned?.balance ?? 0)
    const leaveRow = (label, b) => ({ label, value: b?.balance ?? '–', pct: b ? share(b.balance, b.total || b.allocated || b.balance) : 0 })

    // Today's audit activity at a glance (keeps the tile as full as its neighbours even before anyone logs time).
    const todaySessions = ai.todaySessions || []
    const todayPeople = new Set(todaySessions.map((x) => x.employee?._id)).size
    const auditTodayRows = [
        { label: 'Running now', value: (ai.activeNow || []).length, pct: share((ai.activeNow || []).length, Math.max(1, todayPeople)) },
        { label: 'Sessions', value: todaySessions.length, pct: todaySessions.length ? 100 : 0 },
        { label: 'People', value: todayPeople, pct: share(todayPeople, total || todayPeople) },
    ]
    const kpis = senior ? [
        { tone: 'violet', icon: 'mdi-account-check-outline', label: 'Present today', value: <>{summary?.presentToday ?? '–'}<small> / {total || '–'}</small></>, sub: `${summary?.onLeaveToday ?? 0} on leave · ${summary?.absentToday ?? 0} not in`, ring: { value: share(summary?.presentToday || 0, total) }, rows: [{ label: 'Present', value: summary?.presentToday ?? 0, pct: share(summary?.presentToday || 0, total) }, { label: 'On leave', value: summary?.onLeaveToday ?? 0, pct: share(summary?.onLeaveToday || 0, total) }, { label: 'Not in', value: summary?.absentToday ?? 0, pct: share(summary?.absentToday || 0, total) }], to: canSeeTeamAttendance ? '/attendance/team' : undefined },
        { tone: 'emerald', icon: 'mdi-account-clock-outline', label: 'In right now', live: true, value: todayCheckins ? todayCheckins.inNow : '–', sub: todayCheckins ? `${todayCheckins.checkedOut} checked out · ${Math.max(0, todayCheckins.teamSize - todayCheckins.rows.length)} not in yet` : 'Your team', ring: todayCheckins?.teamSize ? { value: share(todayCheckins.inNow, todayCheckins.teamSize) } : undefined, rows: todayCheckins ? [{ label: 'In now', value: todayCheckins.inNow, pct: share(todayCheckins.inNow, todayCheckins.teamSize) }, { label: 'Checked out', value: todayCheckins.checkedOut, pct: share(todayCheckins.checkedOut, todayCheckins.teamSize) }, { label: 'Not in yet', value: Math.max(0, todayCheckins.teamSize - todayCheckins.rows.length), pct: share(Math.max(0, todayCheckins.teamSize - todayCheckins.rows.length), todayCheckins.teamSize) }] : undefined, to: canSeeTeamAttendance ? '/location-log' : undefined },
        { tone: 'sunset', icon: 'mdi-timer-outline', label: 'Audit hours today', live: (ai.activeNow || []).length > 0, value: fmtDuration(auditTodayMin), sub: `${(ai.activeNow || []).length} timer${(ai.activeNow || []).length === 1 ? '' : 's'} running now`, rows: auditTodayRows, to: canSeeAudits ? '/audits' : undefined },
        { tone: 'ocean', icon: 'mdi-briefcase-search-outline', label: 'Open audit projects', value: openAudits, sub: att?.overdueAudits ? `${att.overdueAudits} past deadline` : 'None past deadline', rows: ['Planning', 'Fieldwork', 'Review', 'Reporting', 'On Hold'].filter((s) => ai.statusCounts?.[s]).map((s) => ({ label: s, value: ai.statusCounts[s], pct: share(ai.statusCounts[s], openAudits) })), to: canSeeAudits ? '/audits' : undefined },
        { tone: 'magenta', icon: 'mdi-bell-alert-outline', label: 'Waiting on you', value: waiting, sub: waiting ? 'Approvals and audits to look at' : 'All clear', rows: att ? [{ label: 'Leave', value: att.pendingLeaves, pct: att.pendingLeaves ? 100 : 0 }, { label: 'Corrections', value: att.pendingCorrections, pct: att.pendingCorrections ? 100 : 0 }, { label: 'Expenses', value: att.pendingExpenses, pct: att.pendingExpenses ? 100 : 0 }] : undefined, to: canApprove ? '/leave/approvals' : undefined },
    ] : [
        { tone: 'violet', icon: 'mdi-clock-check-outline', label: 'My day', value: hoursLabel(workedH), sub: status.text, ring: { value: workedPct }, rows: [{ label: 'Worked', value: hoursLabel(workedH), pct: workedPct }, { label: 'Left today', value: hoursLabel(Math.max(0, WORKDAY_HOURS - workedH)), pct: 100 - workedPct }, { label: 'Sessions', value: sessions.length, pct: sessions.length ? 100 : 0 }], to: canSeeAttendance ? '/attendance/today' : undefined },
        { tone: 'emerald', icon: 'mdi-timer-outline', label: 'My audit hours', value: fmtDuration(ai.me?.weekMinutes || 0), sub: `This week · today ${fmtDuration(ai.me?.todayMinutes || 0)}`, ring: { value: share((ai.me?.weekMinutes || 0) / 60, 40) }, rows: [{ label: 'Today', value: fmtDuration(ai.me?.todayMinutes || 0), pct: share((ai.me?.todayMinutes || 0) / 60, 8) }, { label: 'This week', value: fmtDuration(ai.me?.weekMinutes || 0), pct: share((ai.me?.weekMinutes || 0) / 60, 40) }, { label: 'Week target', value: '40h', pct: 100 }], to: canSeeAudits ? '/audits' : undefined },
        { tone: 'sunset', icon: 'mdi-briefcase-account-outline', label: 'My open audits', value: ai.me?.openAudits ?? 0, sub: nextDeadline ? `Next due: ${nextDeadline.clientName} · ${nextDeadline.daysLeft < 0 ? `${-nextDeadline.daysLeft}d late` : `in ${nextDeadline.daysLeft}d`}` : 'No deadlines in 3 weeks', rows: [{ label: 'Overdue', value: myOverdue, pct: share(myOverdue, ai.me?.openAudits || 1) }, { label: 'Due in 7 days', value: myDueSoon, pct: share(myDueSoon, ai.me?.openAudits || 1) }, { label: 'Open', value: ai.me?.openAudits ?? 0, pct: ai.me?.openAudits ? 100 : 0 }], to: canSeeAudits ? '/audits' : undefined },
        { tone: 'ocean', icon: 'mdi-beach', label: 'Leave balance', value: <>{leaveTotal}<small> days</small></>, rows: [leaveRow('Casual', balance?.casual), leaveRow('Sick', balance?.sick), leaveRow('Earned', balance?.earned)], to: canSee('screen:leave') ? '/leave' : undefined },
        { tone: 'magenta', icon: 'mdi-calendar-month-outline', label: 'This month', value: <>{month.present}<small> / {workdaysSoFar} days</small></>, sub: month.late ? `${month.late} late arrival${month.late === 1 ? '' : 's'}` : 'No late arrivals', ring: { value: share(month.present, workdaysSoFar) }, rows: [{ label: 'Present', value: month.present, pct: share(month.present, workdaysSoFar) }, { label: 'Late', value: month.late, pct: share(month.late, workdaysSoFar) }, { label: 'Missed', value: Math.max(0, workdaysSoFar - month.present), pct: share(Math.max(0, workdaysSoFar - month.present), workdaysSoFar) }], to: canSeeAttendance ? '/attendance/history' : undefined },
    ]

    /* -------------------------- attendance trend -------------------------- */
    // Columns of people in vs. not in for each day; weekends are greyed and labelled instead of
    // reading as a sudden drop to zero.
    const trend = (attendanceTrend || []).map((d) => {
        const dt = new Date(d.date)
        const weekend = dt.getDay() === 0 || dt.getDay() === 6
        return { dt, weekend, present: d.present || 0, rest: weekend ? 0 : Math.max(0, total - (d.present || 0)) }
    })
    const workTrend = trend.filter((d) => !d.weekend)
    const avgPresent = workTrend.length ? Math.round(workTrend.reduce((t, d) => t + d.present, 0) / workTrend.length) : 0
    const trendOption = {
        tooltip: {
            trigger: 'axis', backgroundColor: '#0f172a', borderWidth: 0, padding: [8, 12], textStyle: { color: '#fff', fontSize: 12 },
            axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(2, 132, 199, .06)' } },
            formatter: (p) => {
                const d = trend[p[0].dataIndex]
                const day = d.dt.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })
                return d.weekend ? `<strong>${day}</strong><br/>Weekend${d.present ? ` · ${d.present} worked` : ''}` : `<strong>${day}</strong><br/>${d.present} present · ${d.rest} not in<br/>${total ? Math.round((d.present / total) * 100) : 0}% attendance`
            },
        },
        grid: { left: 4, right: 12, top: 28, bottom: 4, containLabel: true },
        legend: { right: 0, top: 0, itemWidth: 10, itemHeight: 10, icon: 'roundRect', textStyle: { color: '#64748b', fontSize: 11 }, data: ['Present', 'Not in'] },
        xAxis: {
            type: 'category', data: trend.map((d) => `${d.dt.toLocaleDateString(undefined, { weekday: 'short' })}\n${d.dt.getDate()}`),
            axisLine: { lineStyle: { color: 'rgba(148, 163, 184, .25)' } }, axisTick: { show: false },
            axisLabel: { color: '#94a3b8', fontSize: 11, lineHeight: 14 },
        },
        yAxis: { type: 'value', max: total || undefined, splitLine: { lineStyle: { color: 'rgba(148, 163, 184, .16)' } }, axisLabel: { color: '#94a3b8', fontSize: 11 } },
        series: [
            {
                name: 'Present', type: 'bar', stack: 'a', barMaxWidth: 34, itemStyle: { color: '#10b981' },
                data: trend.map((d) => ({ value: d.present, itemStyle: { color: d.weekend ? '#e2e8f0' : new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: '#34d399' }, { offset: 1, color: '#059669' }]), borderRadius: d.rest ? [0, 0, 4, 4] : [6, 6, 4, 4] } })),
                label: { show: true, position: 'insideTop', color: '#fff', fontSize: 11, fontWeight: 700, formatter: (p) => (trend[p.dataIndex].weekend || !p.value ? '' : p.value) },
                markLine: avgPresent ? { silent: true, symbol: 'none', lineStyle: { color: '#334155', type: 'dashed', opacity: 0.45 }, label: { formatter: `avg ${avgPresent}`, color: '#334155', fontSize: 11, position: 'insideEndTop' }, data: [{ yAxis: avgPresent }] } : undefined,
            },
            {
                name: 'Not in', type: 'bar', stack: 'a', barMaxWidth: 34, itemStyle: { color: 'rgba(244, 63, 94, .3)' },
                data: trend.map((d) => ({ value: d.rest, itemStyle: { color: 'rgba(244, 63, 94, .14)', borderColor: 'rgba(244, 63, 94, .25)', borderRadius: [6, 6, 0, 0] } })),
                label: { show: true, position: 'insideTop', color: '#be123c', fontSize: 10.5, fontWeight: 600, formatter: (p) => (p.value > total * 0.12 ? p.value : '') },
            },
        ],
        animationDuration: 800, animationEasing: 'cubicOut',
    }

    // How many widgets this person sees (for the header chip).
    const widgetCount = 5 + (canSeeAttendance ? 1 : 0) + (canSeeTeamAttendance || canSeeAttendance ? 1 : 0) + (att ? 1 : 0)
        + (canSeeAudits && auditInsights ? (senior ? 6 : 3) : 0) + (firmWide ? 2 : 0) + 2

    const updatedMin = Math.max(0, Math.round((now - updatedAt) / 60000))

    // Everyone's own leave: a meter per type (days left of the year's allowance) and the actions people use most.
    const myLeave = (
        <>
            <div className="dlv-meters">
                {LEAVE_TYPES.map(([k, label, c, icon]) => {
                    const b = balance?.[k]
                    const tot = b?.total || b?.balance || 0
                    return (
                        <div key={k} className="dlv-meter" style={{ '--c': c }}>
                            <div className="dlv-top"><span className="dlv-ic"><i className={`mdi ${icon}`}></i></span><span>{label}</span></div>
                            <b><CountUp value={b?.balance ?? 0} /><small>/{tot || '—'}</small></b>
                            <span className="dlv-track"><i style={{ width: `${tot ? share(b?.balance || 0, tot) : 0}%` }}></i></span>
                            <small>{b ? `${b.used || 0} used` : 'Not set up'}</small>
                        </div>
                    )
                })}
            </div>
            <div className="dlv-recent">
                <h4>My recent requests</h4>
                {(myLeaves || []).length ? (
                    <ul>
                        {[...myLeaves].sort((a, b) => new Date(b.fromDate || b.createdAt) - new Date(a.fromDate || a.createdAt)).slice(0, 3).map((lv) => {
                            const [fg, bg, ic] = LEAVE_STATUS[lv.status] || LEAVE_STATUS.Cancelled
                            return (
                                <li key={lv._id}>
                                    <span className="dlv-date"><b>{lv.fromDate ? new Date(lv.fromDate).getDate() : '–'}</b>{lv.fromDate ? new Date(lv.fromDate).toLocaleDateString(undefined, { month: 'short' }) : ''}</span>
                                    <span className="dlv-what"><b>{lv.leaveType}</b><small>{lv.totalDays} day{Number(lv.totalDays) === 1 ? '' : 's'}{lv.toDate && lv.fromDate && shortDate(lv.toDate) !== shortDate(lv.fromDate) ? ` · ${shortDate(lv.fromDate)} – ${shortDate(lv.toDate)}` : ''}</small></span>
                                    <span className="dlv-status" style={{ color: fg, background: bg }}><i className={`mdi ${ic}`}></i>{lv.status}</span>
                                </li>
                            )
                        })}
                    </ul>
                ) : (
                    <p className="dlv-none"><i className="mdi mdi-beach"></i>No leave requests yet — your balance is all yours.</p>
                )}
            </div>
            <div className="pdb-quick">
                <Link to="/leave/apply"><i className="mdi mdi-calendar-plus"></i>Apply leave</Link>
                <Link to="/attendance/regularization"><i className="mdi mdi-file-document-edit-outline"></i>Fix a punch</Link>
                <Link to="/expenses"><i className="mdi mdi-receipt"></i>Claim expense</Link>
                <Link to="/payroll/payslips"><i className="mdi mdi-file-document-outline"></i>Payslips</Link>
            </div>
        </>
    )

    return (
        <div>
            <DashNav>
                <div className="main-content">
                    <div className="page-content db pdb">
                        <div className="container-fluid">

                            {/* ------------------------------ hero ------------------------------ */}
                            <header className="pdb-hero">
                                <div className="pdb-hello">
                                    <span className="pdb-avatar">{initials(user?.firstName, user?.lastName)}</span>
                                    <div className="ph-text">
                                        <span className="pdb-greet"><i className={`mdi ${now.getHours() < 17 ? 'mdi-white-balance-sunny' : 'mdi-weather-night'}`}></i>{greeting(now.getHours())}</span>
                                        <h1>{user?.firstName || 'Welcome'} {user?.lastName || ''} <span aria-hidden="true">👋</span></h1>
                                        <p>{senior ? "Here's how the firm is doing today, and what needs you." : 'Your day in one place: attendance, audits and requests.'}</p>
                                        <div className="pdb-chips">
                                            {user?.designation && <span><i className="mdi mdi-badge-account-horizontal-outline"></i>{user.designation}</span>}
                                            {senior && waiting > 0 && <Link to={canApprove ? '/leave/approvals' : '/audits'}><i className="mdi mdi-bell-ring-outline"></i>{waiting} waiting on you</Link>}
                                            {nextDeadline && canSeeAudits && <Link to={`/audits/${nextDeadline._id}`}><i className="mdi mdi-flag-outline"></i>{nextDeadline.clientName} · {nextDeadline.daysLeft < 0 ? `${-nextDeadline.daysLeft}d late` : nextDeadline.daysLeft === 0 ? 'due today' : `due in ${nextDeadline.daysLeft}d`}</Link>}
                                            <span><i className="mdi mdi-view-grid-outline"></i>{widgetCount} widgets</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="ph-side">
                                    <div className="pdb-head-actions">
                                        <button type="button" className="pdb-btn ghost" onClick={loadAll} title="Refresh now">
                                            <i className="mdi mdi-refresh"></i>{updatedMin ? `${updatedMin}m ago` : 'Just now'}
                                        </button>
                                        {canSeeAttendance && (
                                            <button type="button" className={`pdb-btn status ${status.cls}`} onClick={() => { const el = document.getElementById('my-day'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); else navigate('/attendance/today') }}><i className={`mdi ${status.icon}`}></i>{status.text}</button>
                                        )}
                                    </div>
                                </div>
                            </header>

                            {/* ------------------------------ KPI row ------------------------------ */}
                            <div className="pk-grid">
                                {kpis.map((k) => <KpiCard key={k.label} {...k} />)}
                            </div>

                            {/* ------------------------- my day + live list ------------------------- */}
                            <div className="row">
                                {canSeeAttendance && (
                                    <div className="col-xl-5">
                                        <Panel id="my-day" icon="mdi-clock-check-outline" color="#7c3aed" title="My day" subtitle="Check in, check out and run your audit timer">
                                            <div className="md-top">
                                                <Ring value={workedPct} size={92} stroke={9} color="#7c3aed" track="rgba(124, 58, 237, .14)" label={hoursLabel(workedH)} />
                                                <div className="md-facts">
                                                    <div><span>First in</span><b>{formatTime(todayAttendance?.checkIn)}</b></div>
                                                    <div><span>{isIn ? 'Status' : 'Last out'}</span><b className={isIn ? 'in' : ''}>{isIn ? 'In now' : formatTime(todayAttendance?.checkOut)}</b></div>
                                                    <div><span>Sessions</span><b>{sessions.length}</b></div>
                                                    <div><span>Of a {WORKDAY_HOURS}h day</span><b>{Math.round(workedPct)}%</b></div>
                                                </div>
                                            </div>

                                            {!isIn && (
                                                <CheckInOptions mode={workMode} onMode={setWorkMode} note={checkInNote} onNote={setCheckInNote} disabled={!!checkingInOut} />
                                            )}
                                            {!isIn ? (
                                                <button className={`md-btn ${todayAttendance ? 'again' : ''}`} onClick={onCheckIn} disabled={!!checkingInOut}>
                                                    <i className="mdi mdi-login-variant"></i>{checkingInOut === 'locating' ? 'Getting your location…' : checkingInOut ? 'Checking in…' : todayAttendance ? 'Check in again' : 'Check in'}
                                                </button>
                                            ) : (
                                                <button className="md-btn out" onClick={onCheckOut} disabled={!!checkingInOut}>
                                                    <i className="mdi mdi-logout-variant"></i>{checkingInOut === 'locating' ? 'Getting your location…' : checkingInOut ? 'Checking out…' : 'Check out'}
                                                </button>
                                            )}
                                            {attendanceError && !/no attendance found/i.test(attendanceError) && (
                                                <div className="db-punch-error" role="alert"><i className="mdi mdi-map-marker-alert-outline"></i>{attendanceError}</div>
                                            )}
                                            <div className="md-hint"><i className="mdi mdi-map-marker-outline"></i> Your location is recorded at every check in and check out</div>

                                            {sessions.length > 0 && (
                                                <ol className="md-sessions">
                                                    {sessions.map((x, i) => (
                                                        <li key={i} className={!x.checkOut ? 'open' : ''}>
                                                            <span className="md-n">{i + 1}</span>
                                                            <div className="md-s-main">
                                                                <b>{formatTime(x.checkIn)} → {x.checkOut ? formatTime(x.checkOut) : <span className="in">now</span>}</b>
                                                                {(x.checkInAddress || x.checkOutAddress) && <small><i className="mdi mdi-map-marker-outline"></i>{x.checkInAddress || x.checkOutAddress}</small>}
                                                            </div>
                                                            <ModeTag mode={x.mode} />
                                                        </li>
                                                    ))}
                                                </ol>
                                            )}

                                            {canSeeAudits && <div className="md-timer"><DashboardTimer /></div>}
                                        </Panel>
                                    </div>
                                )}
                                <div className={canSeeAttendance ? 'col-xl-7' : 'col-12'}>
                                    {canSeeTeamAttendance ? (
                                        <TodayCheckins data={todayCheckinsRaw} />
                                    ) : canSeeAttendance ? (
                                        <Panel icon="mdi-calendar-month-outline" color="#db2777" title="My attendance this month" subtitle={now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                                            actions={<Link to="/attendance/history" className="pp-link">Full history <i className="mdi mdi-chevron-right"></i></Link>}>
                                            <MonthAttendance history={history || []} />
                                        </Panel>
                                    ) : null}
                                </div>
                            </div>

                            {/* ------------------------------ my audits ------------------------------ */}
                            {canSeeAudits && auditInsights && ((ai.myAudits || []).length > 0 || !senior) && <MyAuditsWidget audits={ai.myAudits || []} />}

                            {/* --------------------------- needs attention --------------------------- */}
                            {att && <AttentionWidget attention={att} />}

                            {/* --------------------------- business pulse --------------------------- */}
                            <BusinessPulse data={businessPulse} daily={ai.daily || []} />

                            {/* Seniors keep their own attendance and leave too — the panels above are about the team. */}
                            {senior && canSeeAttendance && (
                                <div className="row">
                                    <div className="col-xl-7">
                                        <Panel icon="mdi-calendar-month-outline" color="#db2777" title="My attendance this month" subtitle={now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                                            actions={<Link to="/attendance/history" className="pp-link">Full history <i className="mdi mdi-chevron-right"></i></Link>}>
                                            <MonthAttendance history={history || []} />
                                        </Panel>
                                    </div>
                                    <div className="col-xl-5">
                                        <Panel icon="mdi-beach" color="#0284c7" title="My leave" subtitle="Your balance and quick actions"
                                            actions={<Link to="/leave/apply" className="pp-link">Apply leave <i className="mdi mdi-chevron-right"></i></Link>}>
                                            {myLeave}
                                        </Panel>
                                    </div>
                                </div>
                            )}

                            {/* ------------------------------ audit work ------------------------------ */}
                            {canSeeAudits && auditInsights && (
                                <>
                                    <AuditTimelineToday sessions={ai.todaySessions || []} dayStart={ai.dayStart} scope={senior ? 'team' : 'mine'} />
                                    <div className="row">
                                        <div className={senior ? 'col-xl-8' : 'col-12'}>
                                            <AuditHoursTrend daily={ai.daily} scope={ai.scope} />
                                        </div>
                                        {senior && (
                                            <div className="col-xl-4">
                                                <WorkingNowWidget activeNow={ai.activeNow} />
                                            </div>
                                        )}
                                    </div>
                                    {senior && (
                                        <div className="row">
                                            <div className="col-xl-4 col-md-6"><DeadlinesWidget deadlines={ai.deadlines} /></div>
                                            <div className="col-xl-4 col-md-6"><HoursByClient byClient={ai.byClient} /></div>
                                            <div className="col-xl-4 col-md-12"><TeamWeek byPerson={ai.byPerson} weekStart={ai.weekStart} /></div>
                                        </div>
                                    )}
                                </>
                            )}

                            {/* ------------------------ firm attendance (Admin/HR) ------------------------ */}
                            {firmWide && (
                                <div className="row">
                                    <div className="col-xl-8">
                                        <ChartWidget title="Attendance · last 7 days" subtitle={workTrend.length ? `Avg ${avgPresent} of ${total} present on working days` : 'People checked in each day'}
                                            icon="mdi-chart-bar-stacked" accent="#059669" height={280} empty={!trend.length}
                                            emptyText="No attendance recorded this week" emptyIcon="mdi-calendar-blank-outline"
                                            extra={<Link to="/attendance/team" className="pp-link">Team <i className="mdi mdi-chevron-right"></i></Link>}
                                            columns={['Day', 'Present', 'Not in', 'Rate']}
                                            rows={[...trend].reverse().map((d) => [d.dt.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }), d.present, d.weekend ? '—' : d.rest, d.weekend ? 'Weekend' : `${total ? Math.round((d.present / total) * 100) : 0}%`])}
                                            graph={<ReactECharts option={trendOption} style={{ height: '100%', width: '100%' }} notMerge />} />
                                    </div>
                                    <div className="col-xl-4">
                                        <HeadcountByDepartment headcount={headcount} />
                                    </div>
                                </div>
                            )}

                            {/* ------------------------------ activity ------------------------------ */}
                            <div className="row db-activity">
                                <div className="col-xl-4 col-md-6">
                                    <AnnouncementsWidget announcements={announcements} loading={announcementsLoading} />
                                </div>
                                <div className="col-xl-4 col-md-6">
                                    <Panel icon={canApprove ? 'mdi-calendar-clock' : 'mdi-beach'} color={canApprove ? '#d97706' : '#0284c7'} badge={canApprove && pendingLeaves?.length ? pendingLeaves.length : null}
                                        title={canApprove ? 'Leave waiting for approval' : 'My leave'} subtitle={canApprove ? 'Requests from your team' : 'Balance and quick actions'}
                                        actions={<Link to={canApprove ? '/leave/approvals' : '/leave/apply'} className="pp-link">{canApprove ? 'Review all' : 'Apply leave'} <i className="mdi mdi-chevron-right"></i></Link>}>
                                        {canApprove ? (
                                            !pendingLeaves?.length ? (
                                                <EmptyState icon="mdi-check-all" tone="#16a34a" title="You're all caught up" hint="New leave requests from your team will land here." />
                                            ) : (
                                                <ul className="db-list">
                                                    {pendingLeaves.slice(0, 5).map((lv) => (
                                                        <li className="db-item" key={lv._id}>
                                                            <span className="db-avatar">{initials(lv.employeeId?.firstName, lv.employeeId?.lastName)}</span>
                                                            <div className="db-item-body">
                                                                <p className="db-item-title">{lv.employeeId?.firstName} {lv.employeeId?.lastName}</p>
                                                                <p className="db-item-text">{lv.leaveType} · {lv.totalDays} day(s){lv.fromDate ? ` · from ${new Date(lv.fromDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : ''}</p>
                                                            </div>
                                                            <span className="db-days"><b>{lv.totalDays}</b>{Number(lv.totalDays) === 1 ? 'day' : 'days'}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )
                                        ) : myLeave}
                                    </Panel>
                                </div>
                                <div className="col-xl-4">
                                    <BirthdayLineUp />
                                </div>
                            </div>
                        </div>
                    </div>

                    <footer className="footer">
                        <div className="container-fluid">{new Date().getFullYear()} © Astral Consulting Limited</div>
                    </footer>
                </div>
            </DashNav>
        </div>
    )
}
