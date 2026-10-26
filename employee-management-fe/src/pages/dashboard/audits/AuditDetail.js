import React, { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import auditActions from '../../../redux/audit/Actions'
import employeeActions from '../../../redux/employee/Actions'
import { PeopleShell, Avatar, EmptyState, ErrorBanner, fullName, fmtDate } from '../../../components/people/PeopleUI'
import { money } from '../../../components/payroll/PayrollUI'
import { PriorityTag, PeoplePicker, startOfDay } from '../../../components/projects/ProjectUI'
import {
    AUDITS_ROOT, AUDIT_STATUS, CLOSED, auditStatusMeta, engagementTitle, clientIdOf, fmtDuration, fmtHours, fmtDateTime, fmtClockTime, useTick, TimerPanel, ActiveTimerBar, LiveClock, LiveClockText,
    StepSelect, defaultStep, switchStep, workSteps,
} from '../../../components/audits/AuditUI'
import { WorkflowEditor } from '../../../components/audits/WorkflowEditor'
import { TaskPill, TaskDrawer } from '../../../components/audits/TaskUI'
import { Modal } from '../projects/ProjectParts'
import '../../../components/attendance/attendance.css'
import '../projects/ProjectDetail.css'
import './Billing.css'
import './AuditWork.css'
import { useAccess } from '../../../hooks/useAccess'
import { toast } from '../../../components/common/Toaster'
import { api, InvStatus, InvoiceDrawer, InvoiceEditor, ChargesEditor } from './InvoiceParts'
import { PRESETS } from './Billing'
import { downloadCsv } from '../reports/WorkbenchReports'
import { confirmAction } from '../../../components/common/ConfirmDialog'

/* The audit work page: where the team runs one engagement day to day.
   Hero (status pipeline, dates, people, my timer) → key numbers → tabs (Overview, Workflow, Team,
   Time log, Billing, Details) with a side rail of who's working and recent activity.
   On phones it becomes an app screen: swipeable sticky tabs and a timer bar above the bottom nav. */

const STAGES = [['Planning', 'mdi-pencil-ruler'], ['Fieldwork', 'mdi-briefcase-search-outline'], ['Review', 'mdi-file-eye-outline'], ['Reporting', 'mdi-file-document-edit-outline'], ['Billing', 'mdi-cash-multiple']]
const PIPELINE = ['Planning', 'Fieldwork', 'Review', 'Reporting', 'Completed']
const NEXT_STATUS = { Planning: 'Fieldwork', Fieldwork: 'Review', Review: 'Reporting', Reporting: 'Completed' }
const FORMER = ['Resigned', 'Terminated']
const idOf = (p) => p?._id || p
const minutesOf = (log, now) => (log.endTime ? log.durationMinutes || 0 : Math.max(0, (now - new Date(log.startTime)) / 60000))
const dayKey = (d) => new Date(startOfDay(d)).toISOString()
const DAY = 864e5

/* ---------------- small pieces ---------------- */

const Stack = ({ people, max = 5, size = 28 }) => (
    <span className="wk-stack">
        {people.slice(0, max).map((p) => <Avatar key={idOf(p)} person={p} size={size} />)}
        {people.length > max && <em style={{ width: size, height: size }}>+{people.length - max}</em>}
    </span>
)

const Ring = ({ pct, color, size = 46, children }) => {
    const r = (size - 6) / 2, c = 2 * Math.PI * r
    return (
        <span className="wk-ring" style={{ width: size, height: size }}>
            <svg width={size} height={size} aria-hidden="true"><circle cx={size / 2} cy={size / 2} r={r} stroke="#eef2f7" strokeWidth="5" fill="none" /><circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth="5" fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, Math.max(0, pct)) / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} /></svg>
            <b>{children}</b>
        </span>
    )
}

// Last 14 days of team hours as bars (no chart library needed)
const HoursChart = ({ logs, now }) => {
    const days = useMemo(() => {
        const today = startOfDay(now)
        return Array.from({ length: 14 }, (_, i) => {
            const d = today - (13 - i) * DAY
            const mins = logs.filter((l) => startOfDay(l.startTime) === d).reduce((s, l) => s + minutesOf(l, now), 0)
            return { d, mins }
        })
    }, [logs, now])
    const max = Math.max(60, ...days.map((x) => x.mins))
    const total = days.reduce((s, x) => s + x.mins, 0)
    return (
        <div className="wk-chart">
            <header><b>Team hours · last 14 days</b><span>{fmtDuration(total)}</span></header>
            <div className="wk-bars">{days.map((x, i) => {
                const dt = new Date(x.d), wkend = [0, 6].includes(dt.getDay())
                return (
                    <div key={x.d} className={`wk-bar ${i === 13 ? 'today' : ''} ${wkend ? 'wkend' : ''}`} title={`${dt.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · ${fmtDuration(x.mins)}`}>
                        <span><i style={{ height: `${(x.mins / max) * 100}%` }}></i></span>
                        <small>{dt.toLocaleDateString(undefined, { weekday: 'narrow' })}</small>
                    </div>
                )
            })}</div>
        </div>
    )
}

// Phone: the timer as an app-style bar above the bottom navigation
const MobileTimerBar = ({ audit, isMember, userId }) => {
    const dispatch = useDispatch()
    const { activeTimer, timerBusy } = useSelector((state) => state.auditReducer || {})
    const [sheet, setSheet] = useState(false)
    const [step, setStep] = useState(() => defaultStep(audit, userId))
    if (!isMember || CLOSED.includes(audit.status)) return null
    const here = activeTimer && activeTimer.auditId?._id === audit._id
    const elsewhere = activeTimer && !here
    const hasSteps = workSteps(audit).length > 0
    const label = (k) => workSteps(audit).find((m) => m.key === k)?.label || 'General'
    const start = () => { dispatch({ type: auditActions.START_AUDIT_TIMER, id: audit._id, step }); setSheet(false) }
    return (
        <>
            {sheet && (
                <div className="wk-sheet" onClick={() => setSheet(false)} role="dialog" aria-modal="true" aria-label="Choose a workflow step">
                    <div onClick={(e) => e.stopPropagation()}>
                        <span className="grab"></span>
                        <b>{here ? 'Switch to another step' : 'What are you working on?'}</b>
                        <StepSelect audit={audit} value={here ? activeTimer.milestoneKey || '' : step} onChange={(k) => (here ? switchStep(dispatch, audit._id, k).then(() => setSheet(false)).catch((e) => toast.error(e.message)) : setStep(k))} />
                        {!here && <button type="button" className="wk-mtbtn go" disabled={!!timerBusy} onClick={start}><i className="mdi mdi-play"></i>Start on “{label(step)}”</button>}
                    </div>
                </div>
            )}
            <div className={`wk-mtimer ${here ? 'running' : ''}`}>
                {here ? <><span className="wk-pulse"></span><button type="button" className="wk-mt-info" onClick={() => hasSteps && setSheet(true)}><b><LiveClockText start={activeTimer.startTime} /></b><small>{hasSteps ? <>{label(activeTimer.milestoneKey)} <i className="mdi mdi-swap-horizontal"></i></> : `since ${fmtClockTime(activeTimer.startTime)}`}</small></button></>
                    : elsewhere ? <div className="wk-mt-info"><b>Timer running elsewhere</b><small>{activeTimer.auditId?.clientName}</small></div>
                        : <button type="button" className="wk-mt-info" onClick={() => hasSteps && setSheet(true)}><b>Ready to work?</b><small>{hasSteps ? <>{label(step)} <i className="mdi mdi-chevron-up"></i></> : 'Start the timer for this audit'}</small></button>}
                {elsewhere ? <Link to={`/audits/${activeTimer.auditId?._id}`} className="wk-mtbtn ghost">Open</Link>
                    : <button type="button" className={`wk-mtbtn ${here ? 'stop' : ''}`} disabled={!!timerBusy} onClick={() => (here ? dispatch({ type: auditActions.STOP_AUDIT_TIMER, id: audit._id }) : start())}>
                        <i className={`mdi ${here ? 'mdi-stop' : 'mdi-play'}`}></i>{timerBusy === 'locating' ? 'Locating…' : here ? 'Stop' : 'Start'}
                    </button>}
            </div>
        </>
    )
}

/* ---------------- page ---------------- */

export const AuditDetail = () => {
    const { id } = useParams()
    const dispatch = useDispatch()
    const { detail: audit, error } = useSelector((state) => state.auditReducer || {})
    const { list: employees } = useSelector((state) => state.employeeReducer || {})
    const { isAuthenticated: user } = useSelector((state) => state.authReducer || {})
    const { can } = useAccess()
    const canManage = can(['Admin', 'HR', 'Manager', 'Team Lead'], 'projects')
    const [params, setParams] = useSearchParams()
    const tab = params.get('tab') || 'overview'
    const setTab = (t) => setParams((p) => { const n = new URLSearchParams(p); n.set('tab', t); return n }, { replace: true })
    const [econ, setEcon] = useState(null)
    const [econCanBill, setEconCanBill] = useState(false)
    const [invoiceId, setInvoiceId] = useState(null)
    const [editing, setEditing] = useState(null)
    const [period, setPeriod] = useState({ from: PRESETS[0][2], to: PRESETS[0][3] })
    const [adjust, setAdjust] = useState(null) // { id, end }
    const [toAdd, setToAdd] = useState([])
    const [logPerson, setLogPerson] = useState('')
    const [logRange, setLogRange] = useState('all')
    const [reviewOnly, setReviewOnly] = useState(false)
    const [openStages, setOpenStages] = useState(null) // null = just the current stage
    const [teamSort, setTeamSort] = useState('hours')
    const [moreDesc, setMoreDesc] = useState(false)
    const [logStep, setLogStep] = useState('')
    const [configuring, setConfiguring] = useState(false)
    const [retag, setRetag] = useState(null)
    const [openPerson, setOpenPerson] = useState(null)

    useEffect(() => {
        dispatch({ type: auditActions.GET_AUDIT_BY_ID, id })
        dispatch({ type: auditActions.GET_ACTIVE_AUDIT_TIMER })
        dispatch({ type: employeeActions.GET_EMPLOYEES })
        return () => dispatch({ type: auditActions.CLEAR_AUDIT_DETAIL })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id])

    const money_ = audit?.canSeeMoney
    const loadEcon = () => api('GET', `/audits/${id}/economics`).then((j) => { setEcon(j.data); setEconCanBill(j.canBill) }).catch(() => setEcon(null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { if (money_) loadEcon() }, [money_, id])
    const refresh = () => { dispatch({ type: auditActions.GET_AUDIT_BY_ID, id }); if (money_) loadEcon() }
    const openTask = params.get('task')
    const setOpenTask = (k) => setParams((p) => { const n = new URLSearchParams(p); if (k) n.set('task', k); else n.delete('task'); return n }, { replace: true })
    const [migration, setMigration] = useState(null)
    const previewMigration = async () => { try { setMigration((await api('GET', `/audits/${id}/workflow/migrate`)).data) } catch (e) { toast.error(e.message) } }
    const applyMigration = async () => { try { const j = await api('POST', `/audits/${id}/workflow/migrate`, { templateId: migration.template._id }); toast.success(j.message, { title: 'Workflow updated' }); setMigration(null); refresh() } catch (e) { toast.error(e.message) } }
    const raiseInvoice = async () => {
        try {
            const j = await api('POST', '/invoices/prepare', { auditId: id, from: period.from, to: period.to })
            toast.success(j.message, { title: 'Draft bill' })
            ;(j.warnings || []).forEach((w) => toast.warning(w, { title: 'Not billed yet' }))
            setEditing(j.data); loadEcon()
        } catch (e) { toast.error(e.message) }
    }
    const review = async (logId, action, endTime) => {
        try { const j = await api('PUT', `/audits/timelogs/${logId}/review`, { action, endTime }); toast.success(j.message, { title: 'Time reviewed' }); setAdjust(null); refresh() } catch (e) { toast.error(e.message) }
    }

    const logs = useMemo(() => audit?.logs || [], [audit])
    const anyRunning = logs.some((l) => !l.endTime)
    // totals move once a minute while someone is clocked in; the live clocks tick by themselves
    const now = useTick(anyRunning, 60000)

    // one row per person on the team (plus anyone removed who still has hours logged)
    const team = useMemo(() => {
        if (!audit) return []
        const rows = new Map()
        const add = (p, role) => { if (p && !rows.has(idOf(p))) rows.set(idOf(p), { person: p, role, logs: [] }) }
        add(audit.auditManager, 'Audit manager')
        ;(audit.teamMembers || []).forEach((p) => add(p, 'Team member'))
        logs.forEach((l) => { add(l.employeeId, 'Former member'); rows.get(idOf(l.employeeId)).logs.push(l) })
        return [...rows.values()].map((r) => ({
            ...r,
            minutes: r.logs.reduce((s, l) => s + minutesOf(l, now), 0),
            days: new Set(r.logs.map((l) => dayKey(l.startTime))).size,
            running: r.logs.find((l) => !l.endTime),
            last: r.logs[0]?.endTime || r.logs[0]?.startTime,
        }))
    }, [audit, logs, now])

    // per workflow step: minutes, who worked on it and when it was first started
    const stepStats = useMemo(() => {
        const out = {}
        logs.forEach((l) => {
            const k = l.milestoneKey || ''
            const s = out[k] || (out[k] = { minutes: 0, people: new Map(), first: null, label: l.milestoneLabel || 'General', running: false })
            const mins = minutesOf(l, now)
            s.minutes += mins
            const pid = idOf(l.employeeId)
            const p = s.people.get(pid) || { person: l.employeeId, minutes: 0 }
            p.minutes += mins; s.people.set(pid, p)
            if (!s.first || new Date(l.startTime) < new Date(s.first)) s.first = l.startTime
            if (!l.endTime) s.running = true
        })
        return out
    }, [logs, now])
    const personSteps = (pid) => {
        const m = new Map()
        logs.filter((l) => idOf(l.employeeId) === pid).forEach((l) => { const k = l.milestoneKey || ''; m.set(k, { label: l.milestoneLabel || 'General', minutes: (m.get(k)?.minutes || 0) + minutesOf(l, now) }) })
        return [...m.entries()].sort((a, b) => b[1].minutes - a[1].minutes)
    }
    const doRetag = async (logId, step) => {
        try { const j = await api('PUT', `/audits/timelogs/${logId}/step`, { step }); toast.success(j.message); setRetag(null); refresh() } catch (e) { toast.error(e.message) }
    }

    const filteredLogs = useMemo(() => {
        const since = logRange === 'week' ? startOfDay(now) - ((new Date(now).getDay() + 6) % 7) * DAY : logRange === 'month' ? new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1).getTime() : 0
        return logs.filter((l) => (!logPerson || idOf(l.employeeId) === logPerson) && (!reviewOnly || l.needsReview) && (logStep === '' || (logStep === '-' ? !l.milestoneKey : l.milestoneKey === logStep)) && new Date(l.startTime).getTime() >= since)
    }, [logs, logPerson, logRange, reviewOnly, logStep, now])
    const byDay = useMemo(() => {
        const groups = new Map()
        filteredLogs.forEach((l) => { const k = dayKey(l.startTime); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(l) })
        return [...groups.entries()]
    }, [filteredLogs])

    if (!audit) {
        return (
            <PeopleShell title="Audit" root={AUDITS_ROOT} crumbs={[{ label: 'Audit' }]} backTo="/audits">
                <ErrorBanner error={error} />
                {!error && <div className="wk-skel"><div className="pp-skel" style={{ height: 180 }}></div><div className="pp-skel" style={{ height: 70 }}></div><div className="pp-skel" style={{ height: 320 }}></div></div>}
            </PeopleShell>
        )
    }

    const m = auditStatusMeta(audit.status)
    const members = audit.teamMembers || []
    const memberIds = members.map((x) => x._id)
    const available = (employees || []).filter((e) => !FORMER.includes(e.status) && e._id !== audit.auditManager?._id)
    const isMember = audit.auditManager?._id === user?._id || memberIds.includes(user?._id)
    const assigned = team.filter((r) => r.role !== 'Former member')

    const totalMinutes = team.reduce((s, r) => s + r.minutes, 0)
    const daysWorked = new Set(logs.map((l) => dayKey(l.startTime))).size
    const workingNow = team.filter((r) => r.running)
    const estMinutes = (audit.estimatedHours || 0) * 60
    const usedPct = estMinutes ? Math.round((totalMinutes / estMinutes) * 100) : null
    const needsReview = logs.filter((l) => l.needsReview)

    const today = startOfDay(Date.now())
    const myClosed = logs.filter((l) => idOf(l.employeeId) === user?._id && l.endTime)
    const myMinutes = myClosed.reduce((s, l) => s + (l.durationMinutes || 0), 0)
    const myToday = myClosed.filter((l) => startOfDay(l.startTime) === today).reduce((s, l) => s + (l.durationMinutes || 0), 0)

    const start = audit.startDate ? startOfDay(audit.startDate) : null
    const end = audit.endDate ? startOfDay(audit.endDate) : null
    const closed = CLOSED.includes(audit.status)
    const daysLeft = end ? Math.round((end - today) / DAY) : null
    const timePct = start && end && end > start ? Math.round(Math.min(1, Math.max(0, (today - start) / (end - start))) * 100) : null

    // checklist by stage
    const ms = audit.milestones || []
    const STAGE_ICON = Object.fromEntries(STAGES)
    const stages = (audit.stages?.length ? audit.stages : STAGES.map(([n]) => n)).map((name) => [name, STAGE_ICON[name] || 'mdi-flag-outline']).map(([name, icon]) => {
        const items = ms.filter((x) => x.stage === name)
        const doneN = items.filter((x) => x.done).length
        return { name, icon, items, doneN, complete: items.length > 0 && doneN === items.length }
    })
    const doneAll = ms.filter((x) => x.done).length
    const checkPct = ms.length ? Math.round((doneAll / ms.length) * 100) : 0
    const currentStage = stages.find((s) => s.name === audit.status) || stages.find((s) => !s.complete) || stages[stages.length - 1]
    const nextStatus = NEXT_STATUS[audit.status]
    const stageDone = stages.find((s) => s.name === audit.status)?.complete
    const isOpen = (name) => (openStages ? openStages.includes(name) : name === currentStage?.name)
    const toggleStage = (name) => setOpenStages((o) => { const cur = o || [currentStage?.name]; return cur.includes(name) ? cur.filter((x) => x !== name) : [...cur, name] })

    const onAddMembers = () => { toAdd.forEach((employeeId) => dispatch({ type: auditActions.ADD_AUDIT_MEMBER, id, employeeId })); setToAdd([]) }
    const onRemoveMember = async (p) => { if (await confirmAction({ title: `Remove ${fullName(p)} from this audit?`, message: 'Hours they already logged stay on record; their open tasks go back to you to reassign.', confirmLabel: 'Remove' })) dispatch({ type: auditActions.REMOVE_AUDIT_MEMBER, id, employeeId: p._id }) }
    // completing checks the open mandatory tasks on the server; leadership may override with a reason
    const onStatus = async (status, overrideReason) => {
        try {
            const j = await api('PUT', `/audits/${id}`, { status, ...(overrideReason ? { overrideReason } : {}) })
            toast.success(j.message); refresh()
        } catch (e) {
            if (status === 'Completed' && audit.access?.leader && !overrideReason && /still open/.test(e.message)) {
                const why = window.prompt(`${e.message}\n\nTo complete it anyway, give a reason (recorded in the audit trail):`)
                if (why && why.trim()) onStatus(status, why.trim())
            } else toast.error(e.message)
        }
    }
    const exportLog = () => downloadCsv(`${audit.auditCode || 'audit'}-time-log`, ['Date', 'Person', 'Step', 'Start', 'End', 'Minutes', 'Hours', 'Note', 'Review', 'Billable', 'Billed'],
        filteredLogs.map((l) => [fmtDate(l.startTime), fullName(l.employeeId), l.milestoneLabel || 'General', fmtClockTime(l.startTime), l.endTime ? fmtClockTime(l.endTime) : 'running', Math.round(minutesOf(l, now)), (minutesOf(l, now) / 60).toFixed(2), l.note || '', l.needsReview ? 'Needs review' : '', l.billable === false ? 'No' : 'Yes', l.billedInvoice ? 'Yes' : '']))

    const sortedTeam = [...team].sort((a, b) => (teamSort === 'name' ? fullName(a.person).localeCompare(fullName(b.person)) : teamSort === 'recent' ? new Date(b.last || 0) - new Date(a.last || 0) : b.minutes - a.minutes))
    const recent = logs.slice(0, 6)
    const TABS = [
        { k: 'overview', label: 'Overview', icon: 'mdi-view-dashboard-outline' },
        { k: 'workflow', label: 'Workflow', icon: 'mdi-timeline-check-outline', n: `${doneAll}/${ms.length}` },
        { k: 'team', label: 'Team', icon: 'mdi-account-group-outline', n: assigned.length },
        { k: 'log', label: 'Time log', icon: 'mdi-history', n: logs.length, alert: needsReview.length },
        ...(money_ ? [{ k: 'billing', label: 'Billing', icon: 'mdi-receipt', n: econ?.invoiceList?.length ?? 0 }] : []),
        { k: 'details', label: 'Details', icon: 'mdi-information-outline' },
    ]

    // compact task list (overview): status pill + name; click opens the task
    const checklist = (s) => (
        <ul className="wk-checks">{s.items.map((x) => (
            <li key={x.key} className={`${x.done ? 'done' : ''} click`} onClick={() => setOpenTask(x.key)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpenTask(x.key)}>
                <span className="lbl">{x.label}</span>
                {x.assignee && <Avatar person={x.assignee} size={20} />}
                <TaskPill status={x.status} small />
            </li>
        ))}</ul>
    )

    // a workflow step with its owner, due date, hours against budget and who worked on it
    const stepRows = (st) => (
        <ul className="wk-steprows">{st.items.map((x) => {
            const ss = stepStats[x.key]
            const mins = ss?.minutes || 0, est = (x.estimatedHours || 0) * 60
            const pct = est ? Math.round((mins / est) * 100) : null
            const due = x.dueDate ? startOfDay(x.dueDate) : null
            const late = due && !x.done && due < today
            const ppl = ss ? [...ss.people.values()].sort((a, b) => b.minutes - a.minutes) : []
            return (
                <li key={x.key} className={`${x.done ? 'done' : ''} ${late ? 'late' : ''} click`} onClick={() => setOpenTask(x.key)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpenTask(x.key)}>
                    <span className="tick"><TaskPill status={x.status} small /></span>
                    <div className="body">
                        <div className="t"><span>{x.label}</span>{ss?.running && <span className="wk-live"><span className="wk-pulse sm"></span>now</span>}</div>
                        <div className="meta">
                            {x.assignee ? <span className="own"><Avatar person={x.assignee} size={18} />{fullName(x.assignee)}</span> : <span className="own none"><i className="mdi mdi-account-outline"></i>No owner</span>}
                            {due && <span className={`dl ${late ? 'late' : ''}`}><i className="mdi mdi-calendar-clock-outline"></i>{late ? `${Math.round((today - due) / DAY)}d overdue` : fmtDate(x.dueDate)}</span>}
                            {ss?.first && <span><i className="mdi mdi-play-circle-outline"></i>started {fmtDateTime(ss.first)}</span>}
                            {x.done && x.doneAt && <span><i className="mdi mdi-check"></i>done {fmtDate(x.doneAt)}</span>}
                            {['invoice', 'payment'].includes(x.key) && !x.done && <span className="auto">auto</span>}
                        </div>
                    </div>
                    {ppl.length > 0 && <Stack people={ppl.map((p) => p.person)} max={3} size={24} />}
                    <div className={`hrs ${pct > 100 ? 'over' : ''}`} title={ppl.map((p) => `${fullName(p.person)}: ${fmtDuration(p.minutes)}`).join('\n')}>
                        <b>{mins ? fmtDuration(mins) : '—'}{est ? <em> / {x.estimatedHours}h</em> : null}</b>
                        {est > 0 && <span className="wk-progress mini"><i style={{ width: `${Math.min(100, pct)}%`, background: pct > 100 ? '#e11d48' : undefined }}></i></span>}
                    </div>
                </li>
            )
        })}</ul>
    )
    const stepHours = Object.entries(stepStats).map(([k, v]) => ({ key: k, ...v, est: ((ms.find((x) => x.key === k)?.estimatedHours) || 0) * 60 })).sort((a, b) => b.minutes - a.minutes)

    return (
        <PeopleShell title={engagementTitle(audit)} root={AUDITS_ROOT}
            crumbs={[{ label: audit.clientName, to: clientIdOf(audit) ? `/audits/clients/${clientIdOf(audit)}` : '/audits' }, { label: engagementTitle(audit) }]} backTo="/audits">
            <div className={`wk ${isMember && !closed ? 'has-timer' : ''}`}>
                <MobileTimerBar audit={audit} isMember={isMember} userId={user?._id} />
                <ErrorBanner error={error} />
                <ActiveTimerBar hideFor={audit._id} />

                {/* ---------------- hero ---------------- */}
                <section className="wk-hero" style={{ '--c': m.color }}>
                    <div className="wk-hero-main">
                        <div className="wk-hero-top">
                            <span className="wk-code">{audit.auditCode}</span>
                            <span className="wk-status" style={{ '--c': m.color }}><i className={`mdi ${m.icon}`}></i>{audit.status}</span>
                            {audit.priority && <PriorityTag priority={audit.priority} />}
                            {!closed && daysLeft !== null && <span className={`wk-due ${daysLeft < 0 ? 'late' : daysLeft <= 7 ? 'soon' : ''}`}><i className="mdi mdi-flag-checkered"></i>{daysLeft < 0 ? `${-daysLeft}d overdue` : daysLeft === 0 ? 'Due today' : `${daysLeft}d left`}</span>}
                        </div>
                        <div className="wk-client"><i className="mdi mdi-domain"></i>{clientIdOf(audit) ? <Link to={`/audits/clients/${clientIdOf(audit)}`}>{audit.clientName}</Link> : audit.clientName}{audit.project && <><i className="mdi mdi-chevron-right"></i><Link to={`/audits/projects/${audit.project._id}`}>{audit.project.name}</Link></>}</div>
                        <h2>{engagementTitle(audit)}</h2>
                        <div className="wk-meta">
                            <span><i className="mdi mdi-shape-outline"></i>{audit.auditType} audit</span>
                            {audit.financialYear && <span><i className="mdi mdi-calendar-range"></i>FY {audit.financialYear}</span>}
                            <span><i className="mdi mdi-calendar-start"></i>{fmtDate(audit.startDate)} → {fmtDate(audit.endDate)}</span>
                        </div>
                        {audit.description && <p className={`wk-desc ${moreDesc ? 'open' : ''}`} onClick={() => setMoreDesc(!moreDesc)} title={moreDesc ? '' : 'Show all'}>{audit.description}</p>}

                        {/* status pipeline — managers click a step to move the audit */}
                        <ol className="wk-pipe" aria-label="Audit status">
                            {PIPELINE.map((s, i) => {
                                const at = PIPELINE.indexOf(audit.status)
                                const state = audit.status === 'Cancelled' ? '' : at > i || audit.status === 'Completed' ? 'done' : at === i ? 'now' : ''
                                const sm = AUDIT_STATUS[s]
                                return (
                                    <li key={s} className={state} style={{ '--c': sm.color }}>
                                        <button type="button" disabled={!canManage || s === audit.status} onClick={() => onStatus(s)} title={canManage && s !== audit.status ? `Move to ${s}` : s}>
                                            <span><i className={`mdi ${state === 'done' ? 'mdi-check' : sm.icon}`}></i></span><b>{s}</b>
                                        </button>
                                    </li>
                                )
                            })}
                        </ol>
                        {canManage && (
                            <div className="wk-side-status">
                                {['On Hold', 'Cancelled'].map((s) => audit.status === s
                                    ? <span key={s} className="wk-chipbtn on" style={{ '--c': AUDIT_STATUS[s].color }}><i className={`mdi ${AUDIT_STATUS[s].icon}`}></i>{s} — pick a stage above to resume</span>
                                    : !closed && <button key={s} type="button" className="wk-chipbtn" style={{ '--c': AUDIT_STATUS[s].color }} onClick={async () => (await confirmAction({ title: `Mark this audit as ${s}?`, message: s === 'Cancelled' ? 'Nobody can log time on it afterwards.' : 'Work pauses until you pick a stage to resume.', confirmLabel: s === 'Cancelled' ? 'Cancel audit' : 'Put on hold', tone: s === 'Cancelled' ? 'danger' : 'warn' })) && onStatus(s)}><i className={`mdi ${AUDIT_STATUS[s].icon}`}></i>{s === 'On Hold' ? 'Put on hold' : 'Cancel audit'}</button>)}
                            </div>
                        )}

                        <div className="wk-people">
                            <div><small>Manager</small><span className="wk-inline"><Avatar person={audit.auditManager} size={26} />{fullName(audit.auditManager)}</span></div>
                            <div><small>Team</small>{members.length ? <Stack people={members} /> : <span className="wk-muted">No one yet</span>}</div>
                            {workingNow.length > 0 && <div><small>Working now</small><span className="wk-inline live"><span className="wk-pulse"></span>{workingNow.length === 1 ? fullName(workingNow[0].person) : `${workingNow.length} people`}</span></div>}
                        </div>
                    </div>
                    <div className="wk-hero-timer"><TimerPanel audit={audit} isMember={isMember} myMinutes={myMinutes} todayMinutes={myToday} /></div>
                </section>

                {/* ---------------- key numbers ---------------- */}
                <div className="wk-kpis">
                    <div className="wk-kpi">
                        <Ring pct={usedPct ?? 0} color={usedPct > 100 ? '#e11d48' : usedPct > 85 ? '#d97706' : '#7c3aed'}>{usedPct === null ? '—' : `${usedPct}%`}</Ring>
                        <div><b>{fmtHours(totalMinutes)}h</b><small>{estMinutes ? `of ${audit.estimatedHours}h budget` : 'logged · no budget'}</small></div>
                    </div>
                    <div className="wk-kpi">
                        <Ring pct={checkPct} color="#059669">{checkPct}%</Ring>
                        <div><b>{doneAll}/{ms.length}</b><small>checklist done</small></div>
                    </div>
                    <div className="wk-kpi">
                        <Ring pct={timePct ?? 0} color={daysLeft !== null && daysLeft < 0 && !closed ? '#e11d48' : '#0284c7'}>{timePct === null ? '—' : `${timePct}%`}</Ring>
                        <div><b>{closed ? audit.status : daysLeft === null ? '—' : daysLeft < 0 ? `${-daysLeft}d late` : `${daysLeft}d`}</b><small>{closed ? 'engagement closed' : 'to deadline · time used'}</small></div>
                    </div>
                    <div className="wk-kpi plain"><i className="mdi mdi-calendar-check-outline" style={{ '--c': '#0284c7' }}></i><div><b>{daysWorked}</b><small>days worked</small></div></div>
                    <div className="wk-kpi plain"><i className="mdi mdi-account-clock-outline" style={{ '--c': '#16a34a' }}></i><div><b>{workingNow.length}<em>/{assigned.length}</em></b><small>working now</small></div></div>
                </div>

                {money_ && econ && (
                    <div className="wk-econ">
                        <header><i className="mdi mdi-scale-balance"></i>Engagement economics<em>leadership &amp; Accounts only</em></header>
                        <div className="wk-econ-grid">
                            <div style={{ '--c': '#1e40af' }}><small>Agreed fee</small><b>{econ.fee ? money(econ.fee) : '—'}</b><span>{econ.fee ? 'before GST' : 'set the fee'}</span></div>
                            <div style={{ '--c': '#7c3aed' }}><small>Billed</small><b>{money(econ.billed)}</b><span>{econ.unbilled ? `${money(econ.unbilled)} to bill` : econ.fee ? 'fully billed' : '—'}</span></div>
                            <div style={{ '--c': '#059669' }}><small>Received</small><b>{money(econ.received)}</b><span>{econ.outstanding > 0 ? `${money(econ.outstanding)} due` : 'nothing due'}</span></div>
                            <div style={{ '--c': '#d97706' }}><small>Cost of time</small><b>{money(econ.cost)}</b><span>{econ.effectiveRate ? `${money(econ.effectiveRate)}/h earned` : '—'}</span></div>
                            <div style={{ '--c': econ.marginPct === null ? '#94a3b8' : econ.marginPct < 20 ? '#e11d48' : '#059669' }}><small>Margin</small><b>{econ.margin === null ? '—' : money(econ.margin)}</b><span>{econ.marginPct === null ? 'needs a fee' : `${econ.marginPct}% of fee`}</span></div>
                        </div>
                    </div>
                )}

                {/* ---------------- work area ---------------- */}
                <div className="wk-body">
                    <div className="wk-main">
                        <nav className="wk-tabs" role="tablist" aria-label="Audit sections">
                            {TABS.map((t) => (
                                <button key={t.k} type="button" role="tab" aria-selected={tab === t.k} className={tab === t.k ? 'on' : ''} onClick={() => setTab(t.k)}>
                                    <i className={`mdi ${t.icon}`}></i><span>{t.label}</span>{t.n !== undefined && <b>{t.n}</b>}{t.alert > 0 && <em title={`${t.alert} to review`}>{t.alert}</em>}
                                </button>
                            ))}
                        </nav>

                        <div className="wk-panel">
                            {/* overview */}
                            {tab === 'overview' && (
                                <div className="wk-ov">
                                    <section className="wk-card wk-now">
                                        <header>
                                            <span className="wk-icon" style={{ '--c': m.color }}><i className={`mdi ${currentStage.icon}`}></i></span>
                                            <div><small>Current stage</small><b>{currentStage.name}</b></div>
                                            <span className="wk-count">{currentStage.doneN}/{currentStage.items.length}</span>
                                        </header>
                                        <div className="wk-progress"><i style={{ width: `${currentStage.items.length ? (currentStage.doneN / currentStage.items.length) * 100 : 0}%` }}></i></div>
                                        {checklist({ ...currentStage, items: [...currentStage.items].sort((a, b) => a.done - b.done) })}
                                        {canManage && stageDone && nextStatus && (
                                            <div className="wk-nextstep"><i className="mdi mdi-arrow-right-circle-outline"></i><span>All of <b>{currentStage.name}</b> is done.</span><button type="button" className="pp-btn primary sm" onClick={() => onStatus(nextStatus)}>Move to {nextStatus}</button></div>
                                        )}
                                        <button type="button" className="wk-link" onClick={() => setTab('workflow')}>See every stage <i className="mdi mdi-chevron-right"></i></button>
                                    </section>
                                    <section className="wk-card"><HoursChart logs={logs} now={now} /></section>
                                    <section className="wk-card wk-share">
                                        <header className="wk-cardhead"><b>Hours by workflow step</b><button type="button" className="wk-link" onClick={() => setTab('workflow')}>Workflow <i className="mdi mdi-chevron-right"></i></button></header>
                                        {!stepHours.length ? <p className="wk-muted">No time logged yet. Pick a step when you start the timer.</p> : (
                                            <ul>{stepHours.slice(0, 6).map((x) => (
                                                <li key={x.key || 'general'} className="step">
                                                    <span className={`wk-stepdot ${x.key ? '' : 'gen'}`}></span>
                                                    <span className="nm" title={x.label}>{x.label}{x.running && <span className="wk-pulse sm"></span>}</span>
                                                    <span className="bar"><i style={{ width: `${Math.min(100, x.est ? (x.minutes / x.est) * 100 : (x.minutes / stepHours[0].minutes) * 100)}%`, background: x.est && x.minutes > x.est ? '#e11d48' : '#0284c7' }}></i></span>
                                                    <b>{fmtDuration(x.minutes)}{x.est ? <em> / {Math.round(x.est / 60)}h</em> : null}</b>
                                                </li>
                                            ))}</ul>
                                        )}
                                    </section>
                                    <section className="wk-card wk-share">
                                        <header className="wk-cardhead"><b>Hours by person</b><button type="button" className="wk-link" onClick={() => setTab('team')}>Team <i className="mdi mdi-chevron-right"></i></button></header>
                                        {!totalMinutes ? <p className="wk-muted">No time logged yet.</p> : (
                                            <ul>{[...team].filter((r) => r.minutes).sort((a, b) => b.minutes - a.minutes).slice(0, 6).map((r) => (
                                                <li key={idOf(r.person)}>
                                                    <Avatar person={r.person} size={26} />
                                                    <span className="nm">{fullName(r.person)}{r.running && <span className="wk-pulse sm"></span>}</span>
                                                    <span className="bar"><i style={{ width: `${(r.minutes / totalMinutes) * 100}%`, background: m.color }}></i></span>
                                                    <b>{fmtDuration(r.minutes)}</b>
                                                </li>
                                            ))}</ul>
                                        )}
                                    </section>
                                    {needsReview.length > 0 && (
                                        <button type="button" className="wk-alert" onClick={() => { setReviewOnly(true); setTab('log') }}>
                                            <i className="mdi mdi-clock-alert-outline"></i><span><b>{needsReview.length} session{needsReview.length === 1 ? '' : 's'} need review</b> — auto-stopped or unusually long; not billed until approved.</span><i className="mdi mdi-chevron-right"></i>
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* workflow */}
                            {tab === 'workflow' && (
                                <>
                                    <div className="wk-steps">{stages.map((s) => {
                                        const state = s.complete ? 'done' : s.name === currentStage.name ? 'now' : ''
                                        return (
                                            <button key={s.name} type="button" className={`wk-step ${state}`} onClick={() => setOpenStages([s.name])}>
                                                <span className="dot"><i className={`mdi ${s.complete ? 'mdi-check' : s.icon}`}></i></span>
                                                <b>{s.name}</b><small>{s.doneN}/{s.items.length}</small>
                                            </button>
                                        )
                                    })}</div>
                                    <div className="wk-wf-tools">
                                        <span>{doneAll} of {ms.length} steps done · {ms.filter((x) => x.assignee).length} with an owner{audit.workflowUpdatedAt ? ` · configured ${fmtDate(audit.workflowUpdatedAt)}` : ''}</span>
                                        <button type="button" className="wk-link" onClick={() => setOpenStages(openStages && openStages.length === stages.length ? [] : stages.map((s) => s.name))}>{openStages && openStages.length === stages.length ? 'Collapse all' : 'Expand all'}</button>
                                        {audit.canConfigure && <button type="button" className="pp-btn sm primary" onClick={() => setConfiguring(true)}><i className="mdi mdi-sitemap"></i>Configure workflow</button>}
                                    </div>
                                    <div className="wk-statusbar">{['Ready', 'In Progress', 'Blocked', 'Submitted', 'Under Review', 'Changes Requested'].map((st) => { const n = ms.filter((x) => x.status === st).length; return n ? <span key={st}><TaskPill status={st} small /><b>{n}</b></span> : null })}</div>
                                    {audit.newerTemplate && audit.canConfigure && (
                                        <div className="wk-nextstep"><i className="mdi mdi-update"></i><span>“{audit.newerTemplate.name}” <b>v{audit.newerTemplate.version}</b> is available — this engagement uses v{audit.workflowTemplate?.version}. It won't change unless you update it.</span><button type="button" className="pp-btn sm" onClick={previewMigration}>Preview update</button></div>
                                    )}
                                    {canManage && stageDone && nextStatus && (
                                        <div className="wk-nextstep"><i className="mdi mdi-arrow-right-circle-outline"></i><span>Everything in <b>{audit.status}</b> is done. Move the audit to <b>{nextStatus}</b>?</span><button type="button" className="pp-btn primary sm" onClick={() => onStatus(nextStatus)}>Move to {nextStatus}</button></div>
                                    )}
                                    {stages.map((s) => (
                                        <div key={s.name} className={`wk-stage ${s.complete ? 'complete' : ''} ${isOpen(s.name) ? 'open' : ''}`}>
                                            <button type="button" className="wk-stage-head" onClick={() => toggleStage(s.name)} aria-expanded={isOpen(s.name)}>
                                                <i className={`mdi ${s.icon}`}></i><b>{s.name}</b>
                                                <span className="wk-progress mini"><i style={{ width: `${s.items.length ? (s.doneN / s.items.length) * 100 : 0}%` }}></i></span>
                                                <span className="cnt">{s.complete ? 'Complete' : `${s.doneN} of ${s.items.length}`}</span>
                                                <i className="mdi mdi-chevron-down chev"></i>
                                            </button>
                                            {isOpen(s.name) && (s.items.length ? stepRows(s) : <p className="wk-muted wk-pad">No steps in this stage.</p>)}
                                        </div>
                                    ))}
                                </>
                            )}

                            {/* team */}
                            {tab === 'team' && (
                                <>
                                    <div className="wk-tools">
                                        {canManage && (
                                            <div className="wk-add">
                                                <PeoplePicker people={available} value={toAdd} onChange={setToAdd} exclude={memberIds} placeholder="Assign more people…" />
                                                <button type="button" className="pp-btn primary" onClick={onAddMembers} disabled={!toAdd.length}><i className="mdi mdi-account-plus-outline"></i>Assign</button>
                                            </div>
                                        )}
                                        <select className="pp-select" value={teamSort} onChange={(e) => setTeamSort(e.target.value)} aria-label="Sort team"><option value="hours">Most hours</option><option value="recent">Recently active</option><option value="name">Name</option></select>
                                    </div>
                                    <ul className="wk-team">{sortedTeam.map((r) => {
                                        const share = totalMinutes ? Math.round((r.minutes / totalMinutes) * 100) : 0
                                        return (
                                            <li key={idOf(r.person)} className={`${r.role === 'Former member' ? 'former' : ''} ${openPerson === idOf(r.person) ? 'open' : ''}`}>
                                                <Avatar person={r.person} size={38} />
                                                <div className="who"><Link to={`/employees/${idOf(r.person)}`}>{fullName(r.person)}</Link><small>{r.role}{r.person?.designation ? ` · ${r.person.designation}` : ''}</small></div>
                                                <div className="st">{r.running ? <span className="wk-live"><span className="wk-pulse sm"></span><LiveClock start={r.running.startTime} /></span> : <span className="wk-muted">{r.logs.length ? `Last ${fmtDateTime(r.last)}` : 'Not started'}</span>}</div>
                                                <div className="nums"><span><b>{r.days}</b>days</span><span><b>{r.logs.length}</b>sessions</span><span><b>{fmtDuration(r.minutes)}</b>{share}%</span></div>
                                                <span className="acts">
                                                    {r.logs.length > 0 && <button type="button" className="wk-iconbtn" onClick={() => setOpenPerson(openPerson === idOf(r.person) ? null : idOf(r.person))} aria-expanded={openPerson === idOf(r.person)} title="Hours by step" aria-label={`Hours by step for ${fullName(r.person)}`}><i className={`mdi ${openPerson === idOf(r.person) ? 'mdi-chevron-up' : 'mdi-chart-bar'}`}></i></button>}
                                                    {canManage && r.role === 'Team member' && <button type="button" className="wk-iconbtn danger" onClick={() => onRemoveMember(r.person)} title="Remove from audit" aria-label={`Remove ${fullName(r.person)}`}><i className="mdi mdi-account-remove-outline"></i></button>}
                                                </span>
                                                {openPerson === idOf(r.person) && (
                                                    <div className="wk-psteps">{personSteps(idOf(r.person)).map(([k, v]) => (
                                                        <div key={k || 'general'}><span title={v.label}>{v.label}</span><span className="bar"><i style={{ width: `${r.minutes ? (v.minutes / r.minutes) * 100 : 0}%` }}></i></span><b>{fmtDuration(v.minutes)}</b></div>
                                                    ))}</div>
                                                )}
                                            </li>
                                        )
                                    })}</ul>
                                </>
                            )}

                            {/* time log */}
                            {tab === 'log' && (
                                <>
                                    <div className="wk-tools">
                                        <div className="wk-seg">{[['all', 'All'], ['week', 'This week'], ['month', 'This month']].map(([k, l]) => <button key={k} type="button" className={logRange === k ? 'on' : ''} onClick={() => setLogRange(k)}>{l}</button>)}</div>
                                        <select className="pp-select" value={logPerson} onChange={(e) => setLogPerson(e.target.value)} aria-label="Filter by person">
                                            <option value="">Everyone</option>
                                            {team.filter((r) => r.logs.length).map((r) => <option key={idOf(r.person)} value={idOf(r.person)}>{fullName(r.person)}</option>)}
                                        </select>
                                        {workSteps(audit).length > 0 && (
                                            <select className="pp-select" value={logStep} onChange={(e) => setLogStep(e.target.value)} aria-label="Filter by step">
                                                <option value="">All steps</option><option value="-">General (no step)</option>
                                                {workSteps(audit).filter((x) => stepStats[x.key]).map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                                            </select>
                                        )}
                                        {needsReview.length > 0 && <button type="button" className={`wk-chipbtn ${reviewOnly ? 'on' : ''}`} style={{ '--c': '#d97706' }} onClick={() => setReviewOnly(!reviewOnly)}><i className="mdi mdi-clock-alert-outline"></i>Needs review · {needsReview.length}</button>}
                                        <span className="wk-sum">{filteredLogs.length} session{filteredLogs.length === 1 ? '' : 's'} · <b>{fmtDuration(filteredLogs.reduce((s, l) => s + minutesOf(l, now), 0))}</b></span>
                                        <button type="button" className="pp-btn sm" onClick={exportLog} disabled={!filteredLogs.length}><i className="mdi mdi-file-delimited-outline"></i>Export</button>
                                    </div>
                                    {!byDay.length ? <EmptyState icon="mdi-timer-outline" title={logs.length ? 'No sessions match' : 'No time logged yet'} text={logs.length ? 'Try another period or person.' : 'Sessions appear here as soon as someone starts the timer.'} /> : byDay.map(([day, items]) => (
                                        <div key={day} className="wk-day">
                                            <div className="wk-dayhead"><b>{new Date(day).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</b><span>{fmtDuration(items.reduce((s, l) => s + minutesOf(l, now), 0))}</span></div>
                                            {items.map((l) => (
                                                <div key={l._id} className={`wk-sess ${l.needsReview ? 'review' : ''}`}>
                                                    <Avatar person={l.employeeId} size={30} />
                                                    <div className="main">
                                                        <div className="l1"><b>{fullName(l.employeeId)}</b>
                                                            {retag === l._id ? <StepSelect audit={audit} className="wk-retag" value={l.milestoneKey || ''} onChange={(k) => doRetag(l._id, k)} />
                                                                : <button type="button" className={`wk-steptag ${l.milestoneKey ? '' : 'gen'}`} disabled={!(idOf(l.employeeId) === user?._id || audit.canConfigure) || !!l.billedInvoice} onClick={() => setRetag(l._id)} title={idOf(l.employeeId) === user?._id || audit.canConfigure ? 'Change step' : ''}>
                                                                    <i className="mdi mdi-sitemap"></i>{l.milestoneLabel || 'General'}
                                                                </button>}
                                                            <span className="rng">{fmtClockTime(l.startTime)} – {l.endTime ? fmtClockTime(l.endTime) : <span className="wk-live"><span className="wk-pulse sm"></span>running</span>}</span></div>
                                                        {(l.note || l.needsReview || l.autoStopped || l.billable === false || l.billedInvoice) && (
                                                            <div className="l2">
                                                                {l.needsReview && <span className="wk-flag" style={{ '--c': '#d97706' }} title={l.reviewReason}><i className="mdi mdi-clock-alert-outline"></i>Needs review{l.reviewReason ? ` · ${l.reviewReason}` : ''}</span>}
                                                                {l.autoStopped && !l.needsReview && <span className="wk-flag" style={{ '--c': '#64748b' }}><i className="mdi mdi-timer-off-outline"></i>Auto-stopped</span>}
                                                                {l.billable === false && <span className="wk-flag" style={{ '--c': '#e11d48' }}>Non-billable</span>}
                                                                {l.billedInvoice && <span className="wk-flag" style={{ '--c': '#059669' }}><i className="mdi mdi-receipt"></i>Billed</span>}
                                                                {l.originalMinutes != null && l.originalMinutes !== l.durationMinutes && <span className="wk-flag" style={{ '--c': '#1e40af' }}>was {fmtDuration(l.originalMinutes)}</span>}
                                                                {l.note && <span className="note">{l.note}</span>}
                                                            </div>
                                                        )}
                                                        {l.needsReview && canManage && idOf(l.employeeId) !== user?._id && (
                                                            <div className="wk-review">
                                                                <button type="button" className="ok" onClick={() => review(l._id, 'approve')}><i className="mdi mdi-check"></i>Approve</button>
                                                                {adjust?.id === l._id ? <>
                                                                    <input type="datetime-local" className="pp-input" value={adjust.end} onChange={(e) => setAdjust({ id: l._id, end: e.target.value })} aria-label="Corrected end time" />
                                                                    <button type="button" onClick={() => review(l._id, 'adjust', new Date(adjust.end).toISOString())}>Save end</button>
                                                                </> : <button type="button" onClick={() => { const d = new Date(l.endTime); setAdjust({ id: l._id, end: new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16) }) }}><i className="mdi mdi-pencil-outline"></i>Correct end</button>}
                                                                <button type="button" className="no" onClick={() => review(l._id, 'nonbillable')}>Non-billable</button>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <span className="dur">{l.endTime ? fmtDuration(l.durationMinutes) : <LiveClock start={l.startTime} />}</span>
                                                </div>
                                            ))}
                                        </div>
                                    ))}
                                </>
                            )}

                            {/* billing */}
                            {tab === 'billing' && econ && (
                                <>
                                    <ChargesEditor audit={audit} canEdit={econCanBill} onSaved={refresh} />
                                    {econCanBill && (
                                        <div className="bl-prep">
                                            <b><i className="mdi mdi-receipt"></i> Prepare a bill for a period — hours, retainers, visits and fees not billed yet</b>
                                            <div className="bl-chips">{PRESETS.slice(0, 3).map(([k, label, f, t]) => <button key={k} type="button" className={period.from === f && period.to === t ? 'on' : ''} onClick={() => setPeriod({ from: f, to: t })}>{label}</button>)}</div>
                                            <label>From<input type="date" className="pp-input" value={period.from} onChange={(e) => e.target.value && setPeriod((p) => ({ ...p, from: e.target.value }))} /></label>
                                            <label>To<input type="date" className="pp-input" value={period.to} onChange={(e) => e.target.value && setPeriod((p) => ({ ...p, to: e.target.value }))} /></label>
                                            <button type="button" className="pp-btn primary" onClick={raiseInvoice}><i className="mdi mdi-receipt"></i>Prepare bill</button>
                                        </div>
                                    )}
                                    <p className="wk-muted wk-billsum">Contract value {money(econ.fee)} · billed {money(econ.billedTaxable)} (before GST){econ.fee ? ` · ${money(econ.unbilled)} not billed yet` : ''}</p>
                                    {!econ.invoiceList.length ? <EmptyState icon="mdi-receipt" title="No invoices yet" text={econCanBill ? 'Prepare a bill — it’s pre-filled with what is still to bill.' : 'Accounts will raise the invoice for this engagement.'} /> : (
                                        <div className="wk-tablewrap"><table className="bl-table"><thead><tr><th>Invoice</th><th>Date</th><th className="n">Amount</th><th className="n">Balance</th><th>Status</th></tr></thead>
                                            <tbody>{econ.invoiceList.map((i) => (
                                                <tr key={i._id} onClick={() => setInvoiceId(i._id)} className={i.status === 'Cancelled' ? 'cx' : ''}>
                                                    <td className="no">{i.invoiceNo || <em>Draft</em>}</td><td>{fmtDate(i.invoiceDate)}</td><td className="n">{money(i.total)}</td>
                                                    <td className={`n ${i.balance > 0 ? 'due' : ''}`}>{['Draft', 'Cancelled'].includes(i.status) ? '—' : money(i.balance)}</td><td><InvStatus s={i.status} overdue={i.overdueDays} /></td>
                                                </tr>
                                            ))}</tbody></table></div>
                                    )}
                                </>
                            )}

                            {/* details */}
                            {tab === 'details' && (
                                <dl className="wk-facts">
                                    {[
                                        ['mdi-domain', 'Client', clientIdOf(audit) ? <Link to={`/audits/clients/${clientIdOf(audit)}`}>{audit.clientName}</Link> : audit.clientName],
                                        ['mdi-pound', 'Audit code', audit.auditCode],
                                        ['mdi-account-tie-outline', 'Audit manager', fullName(audit.auditManager)],
                                        ['mdi-shape-outline', 'Type', `${audit.auditType}${audit.financialYear ? ` · FY ${audit.financialYear}` : ''}`],
                                        ['mdi-calendar-start', 'Start', fmtDate(audit.startDate)],
                                        ['mdi-flag-checkered', 'Deadline', fmtDate(audit.endDate)],
                                        ['mdi-timer-sand', 'Estimated hours', audit.estimatedHours ? `${audit.estimatedHours}h` : '—'],
                                        ...(money_ ? [['mdi-cash-multiple', 'Fee', audit.fee ? money(audit.fee) : '—']] : []),
                                        ['mdi-play-circle-outline', 'First work logged', logs.length ? fmtDateTime(logs[logs.length - 1].startTime) : '—'],
                                        ['mdi-account-plus-outline', 'Created', fmtDate(audit.createdAt)],
                                    ].map(([ic, k, v]) => <div key={k}><dt><i className={`mdi ${ic}`}></i>{k}</dt><dd>{v}</dd></div>)}
                                    {audit.description && <div className="wide"><dt><i className="mdi mdi-text-box-outline"></i>Scope notes</dt><dd className="pre">{audit.description}</dd></div>}
                                </dl>
                            )}
                        </div>
                    </div>

                    {/* ---------------- side rail ---------------- */}
                    <aside className="wk-rail">
                        <section className="wk-card">
                            <header className="wk-cardhead"><b>Team</b><small>{workingNow.length} working now</small></header>
                            <ul className="wk-railteam">{[...assigned].sort((a, b) => !!b.running - !!a.running || b.minutes - a.minutes).map((r) => (
                                <li key={idOf(r.person)}>
                                    <span className="av"><Avatar person={r.person} size={30} />{r.running && <span className="wk-dot"></span>}</span>
                                    <div><b>{fullName(r.person)}</b><small>{r.running ? <>working · <LiveClock start={r.running.startTime} /></> : r.role === 'Audit manager' ? 'Audit manager' : r.logs.length ? `${fmtDuration(r.minutes)} logged` : 'not started'}</small></div>
                                </li>
                            ))}</ul>
                        </section>
                        <section className="wk-card">
                            <header className="wk-cardhead"><b>Recent activity</b><button type="button" className="wk-link" onClick={() => setTab('log')}>All <i className="mdi mdi-chevron-right"></i></button></header>
                            {!recent.length ? <p className="wk-muted">Nothing yet.</p> : (
                                <ol className="wk-feed">{recent.map((l) => (
                                    <li key={l._id}>
                                        <i className={`mdi ${l.endTime ? 'mdi-clock-check-outline' : 'mdi-play-circle-outline'}`}></i>
                                        <div><span><b>{fullName(l.employeeId).split(' ')[0]}</b> {l.endTime ? `logged ${fmtDuration(l.durationMinutes)}` : 'started the timer'}</span>{l.note && <small>“{l.note}”</small>}<time>{fmtDateTime(l.endTime || l.startTime)}</time></div>
                                    </li>
                                ))}</ol>
                            )}
                        </section>
                    </aside>
                </div>
            </div>
            {configuring && (
                <WorkflowEditor audit={audit} hoursByStep={Object.fromEntries(Object.entries(stepStats).map(([k, v]) => [k, v.minutes]))}
                    people={[audit.auditManager, ...members, ...(employees || []).filter((e) => !FORMER.includes(e.status))].filter((p, i, a) => p && a.findIndex((q) => idOf(q) === idOf(p)) === i)}
                    canStandard={audit.canSetStandard} onClose={() => setConfiguring(false)} onSaved={() => { setConfiguring(false); refresh() }} />
            )}
            {openTask && audit.milestones?.find((x) => x.key === openTask) && (
                <TaskDrawer audit={{ ...audit, me: user?._id }} task={audit.milestones.find((x) => x.key === openTask)} tasks={audit.milestones} logs={logs}
                    people={[audit.auditManager, ...members].filter(Boolean)} onClose={() => setOpenTask(null)} onChanged={refresh} />
            )}
            {migration && (
                <Modal title="Update workflow" sub={`Move to “${migration.template.name}” v${migration.template.version}`} icon={<span className="wf-ic"><i className="mdi mdi-update"></i></span>} onClose={() => setMigration(null)}
                    footer={<><button type="button" className="pp-btn" onClick={() => setMigration(null)}>Cancel</button><button type="button" className="pp-btn primary" onClick={applyMigration} disabled={!migration.add.length && !migration.update.length && !migration.retire.length}>Apply update</button></>}>
                    <div className="wk-migrate">
                        <p>Work already started, submitted or approved is kept as it is. Nothing is deleted.</p>
                        {[['add', 'New tasks added', 'mdi-plus-circle-outline', '#059669'], ['update', 'Not-started tasks updated', 'mdi-pencil-outline', '#0284c7'], ['retire', 'Not-started tasks retired (cancelled)', 'mdi-archive-outline', '#94a3b8']].map(([k, l, ic, c]) => (
                            <section key={k} style={{ '--c': c }}><b><i className={`mdi ${ic}`}></i>{l} · {migration[k].length}</b>{migration[k].length ? <ul>{migration[k].map((x) => <li key={x}>{x}</li>)}</ul> : <small>None</small>}</section>
                        ))}
                        <small>{migration.keep} task{migration.keep === 1 ? '' : 's'} stay unchanged.</small>
                    </div>
                </Modal>
            )}
            {invoiceId && <InvoiceDrawer id={invoiceId} onClose={() => setInvoiceId(null)} onChanged={refresh} />}
            {editing && <InvoiceEditor invoice={editing} onClose={() => setEditing(null)} onSaved={(inv) => { setEditing(null); refresh(); if (inv?._id) setInvoiceId(inv._id) }} />}
        </PeopleShell>
    )
}
