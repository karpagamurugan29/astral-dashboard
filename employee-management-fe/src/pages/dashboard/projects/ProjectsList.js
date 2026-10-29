import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link, useNavigate } from 'react-router-dom'
import employeeActions from '../../../redux/employee/Actions'
import { PeopleShell, EmptyState, ErrorBanner, fullName } from '../../../components/people/PeopleUI'
import { PROJECTS_ROOT, ProjectStatus, PriorityTag, AvatarStack, projectStatusMeta } from '../../../components/projects/ProjectUI'
import { toast } from '../../../components/common/Toaster'
import { api, hm, fmtDay, modeIcon, ProjectForm, useTick } from './ProjectParts'

/* -------------------------------------------------------------------------- */
/*  Projects. Seniors (who manage projects) see every project with status,    */
/*  deadlines, progress and hours, and can add new ones. Everyone else sees   */
/*  the projects they're part of and their open tasks in each.                */
/* -------------------------------------------------------------------------- */

const TABS = ['All', 'Active', 'Planning', 'On Hold', 'Completed']

export const ProjectsList = () => {
    const dispatch = useDispatch()
    const navigate = useNavigate()
    const { list: employees } = useSelector((state) => state.employeeReducer || {})
    const [data, setData] = useState(null)
    const [error, setError] = useState('')
    const [tab, setTab] = useState('All')
    const [q, setQ] = useState('')
    const [lead, setLead] = useState('')
    const [creating, setCreating] = useState(false)

    const load = useCallback(() => api('GET', '/projects').then((j) => { setData(j); setError('') }).catch((e) => setError(e.message)), [])
    useEffect(() => { load() }, [load])
    useEffect(() => { if (data?.canManage && !employees?.length) dispatch({ type: employeeActions.GET_EMPLOYEES }) }, [data?.canManage, employees?.length, dispatch])

    const people = useMemo(() => (employees || []).filter((e) => e.status === 'Active').sort((a, b) => fullName(a).localeCompare(fullName(b))), [employees])
    const projects = useMemo(() => data?.data || [], [data])
    const manage = !!data?.canManage
    const leads = useMemo(() => { const m = new Map(); projects.forEach((p) => p.projectManager && m.set(p.projectManager._id, p.projectManager)); return [...m.values()] }, [projects])
    const list = projects.filter((p) => (tab === 'All' ? p.status !== 'Cancelled' : p.status === tab))
        .filter((p) => !lead || p.projectManager?._id === lead)
        .filter((p) => !q || [p.projectName, p.projectCode, p.clientName, fullName(p.projectManager)].join(' ').toLowerCase().includes(q.toLowerCase()))
    const open = projects.filter((p) => !['Completed', 'Cancelled'].includes(p.status))
    const dueSoon = open.filter((p) => p.daysLeft !== null && p.daysLeft >= 0 && p.daysLeft <= 7).length
    const overdue = open.filter((p) => p.daysLeft !== null && p.daysLeft < 0).length
    const myOpenTasks = projects.reduce((s, p) => s + (p.taskCounts?.mine || 0), 0)
    const weekMin = projects.reduce((s, p) => s + (p.weekMinutes || 0), 0)
    const myTimer = data?.myTimer
    const now = useTick(!!myTimer, 30000)

    return (
        <PeopleShell title={manage ? 'All projects' : 'My projects'} root={PROJECTS_ROOT} crumbs={[{ label: manage ? 'All projects' : 'My projects' }]}
            actions={<>
                <Link to="/projects/my-tasks" className="pp-btn"><i className="mdi mdi-format-list-checks"></i>My tasks{myOpenTasks ? <b className="pw-count">{myOpenTasks}</b> : null}</Link>
                {manage && <button type="button" className="pp-btn primary" onClick={() => setCreating(true)}><i className="mdi mdi-plus"></i>New project</button>}
            </>}>
            <ErrorBanner error={error} />

            {myTimer && (
                <Link to={`/projects/${myTimer.projectId?._id || myTimer.projectId}`} className="pw-running">
                    <i className="pw-dot"></i><span>Timer running on <b>{myTimer.projectId?.projectName}</b> · {hm((now - new Date(myTimer.startTime)) / 60000)}</span><i className="mdi mdi-chevron-right"></i>
                </Link>
            )}

            <div className="pw-stats">
                {(manage ? [
                    ['mdi-rocket-launch-outline', open.length, 'Open projects', '#0284c7'],
                    ['mdi-calendar-clock', dueSoon, 'Due in 7 days', '#d97706'],
                    ['mdi-alert-circle-outline', overdue, 'Past deadline', '#e11d48'],
                    ['mdi-timer-outline', hm(weekMin), 'Logged this week', '#7c3aed'],
                ] : [
                    ['mdi-folder-account-outline', open.length, 'My open projects', '#0284c7'],
                    ['mdi-format-list-checks', myOpenTasks, 'Tasks on my plate', '#d97706'],
                    ['mdi-alert-circle-outline', projects.reduce((s, p) => s + (p.taskCounts?.overdue || 0), 0), 'Overdue tasks', '#e11d48'],
                    ['mdi-timer-outline', hm(weekMin), 'Team time this week', '#7c3aed'],
                ]).map(([ic, n, label, c]) => <div key={label} className="pw-stat" style={{ '--c': c }}><span><i className={`mdi ${ic}`}></i></span><b>{n}</b><small>{label}</small></div>)}
            </div>

            <section className="pp-card pw-board-card">
                <div className="pw-toolbar">
                    <div className="pw-tabs">{TABS.map((t) => <button key={t} type="button" className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}<b>{t === 'All' ? projects.filter((p) => p.status !== 'Cancelled').length : projects.filter((p) => p.status === t).length}</b></button>)}</div>
                    <div className="pp-search pw-search"><i className="mdi mdi-magnify"></i><input type="search" className="pp-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search project, code, client, lead…" /></div>
                    {manage && leads.length > 1 && <select className="pp-select" value={lead} onChange={(e) => setLead(e.target.value)} aria-label="Lead"><option value="">All leads</option>{leads.map((l) => <option key={l._id} value={l._id}>{fullName(l)}</option>)}</select>}
                </div>

                {!data ? <div className="pw-loading"><i className="mdi mdi-loading mdi-spin"></i></div> : !list.length ? (
                    <EmptyState icon="mdi-folder-outline" title={projects.length ? 'No projects match' : manage ? 'No projects yet' : 'You’re not on any project yet'} text={projects.length ? 'Try another tab or search.' : manage ? 'Create a project, add the team, and they can start logging time and working through tasks.' : 'When you’re added to a project it appears here with its task board.'}
                        action={manage && !projects.length && <button type="button" className="pp-btn primary" onClick={() => setCreating(true)}><i className="mdi mdi-plus"></i>New project</button>} />
                ) : (
                    <div className="pw-grid">
                        {list.map((p) => {
                            const st = projectStatusMeta(p.status)
                            const est = (p.estimatedHours || 0) * 60
                            const used = est ? Math.round((p.loggedMinutes / est) * 100) : null
                            const late = p.daysLeft !== null && p.daysLeft < 0 && !['Completed', 'Cancelled'].includes(p.status)
                            return (
                                <Link key={p._id} to={`/projects/${p._id}`} className="pw-pcard" style={{ '--c': st.color }}>
                                    <div className="pw-pcard-top">
                                        <span className="pw-code">{p.projectCode}</span>
                                        <ProjectStatus status={p.status} />
                                        {p.myRole && <span className="pw-role">{p.myRole}</span>}
                                        {p.runningNow > 0 && <span className="pw-live" title="Timers running now"><i className="pw-dot"></i>{p.runningNow}</span>}
                                    </div>
                                    <h3>{p.projectName}</h3>
                                    <p className="pw-pcard-sub">{p.clientName || 'Internal'}<span><i className={`mdi ${modeIcon(p.workMode)}`}></i>{p.location?.siteName || p.workMode || 'Office'}</span></p>
                                    <div className="pw-progress"><div><i style={{ width: `${p.progress}%` }}></i></div><b>{p.progress}%</b></div>
                                    <div className="pw-pcard-facts">
                                        <span title="Tasks done / total"><i className="mdi mdi-checkbox-marked-circle-outline"></i>{p.taskCounts?.done || 0}/{p.taskCounts?.total || 0} tasks</span>
                                        {p.taskCounts?.overdue > 0 && <span className="bad"><i className="mdi mdi-alert-circle-outline"></i>{p.taskCounts.overdue} overdue</span>}
                                        {!manage && p.taskCounts?.mine > 0 && <span className="mine"><i className="mdi mdi-account-check-outline"></i>{p.taskCounts.mine} mine</span>}
                                        <span title="Time logged"><i className="mdi mdi-timer-outline"></i>{hm(p.loggedMinutes)}{est ? ` / ${p.estimatedHours}h` : ''}</span>
                                    </div>
                                    {used !== null && <div className={`pw-budget ${used > 100 ? 'over' : used >= 80 ? 'near' : ''}`}><i style={{ width: `${Math.min(100, used)}%` }}></i></div>}
                                    <div className="pw-pcard-foot">
                                        <AvatarStack people={[p.projectManager, ...(p.teamMembers || [])].filter(Boolean)} max={5} size={26} />
                                        <span className={`pw-deadline ${late ? 'bad' : p.daysLeft !== null && p.daysLeft <= 7 ? 'warn' : ''}`}><i className="mdi mdi-flag-checkered"></i>{p.status === 'Completed' ? 'Completed' : late ? `${-p.daysLeft}d late` : p.daysLeft === 0 ? 'Due today' : p.daysLeft !== null ? `${p.daysLeft}d left` : fmtDay(p.endDate)}</span>
                                    </div>
                                    {p.priority && ['High', 'Critical'].includes(p.priority) && <span className="pw-prio"><PriorityTag priority={p.priority} /></span>}
                                </Link>
                            )
                        })}
                    </div>
                )}
            </section>

            {creating && <ProjectForm people={people} onClose={() => setCreating(false)} onSaved={(p) => { setCreating(false); toast.success(`${p.projectCode} is ready — add tasks and the team can start.`, { title: 'Project created' }); navigate(`/projects/${p._id}`) }} />}
        </PeopleShell>
    )
}
