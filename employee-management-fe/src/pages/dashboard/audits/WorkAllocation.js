import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import { PeopleShell, Avatar, ErrorBanner, fullName, fmtDate } from '../../../components/people/PeopleUI'
import { chatApi as api } from '../../../components/chat/chatApi'
import { toast } from '../../../components/common/Toaster'
import { TaskPill, TaskDrawerLoader, PRIORITY_C } from '../../../components/audits/TaskUI'
import './AuditOps.css'

/* Team workload (route /audits/allocation): everyone working on the engagements I manage — their open tasks, remaining
   estimate against capacity (leave taken off), overdue / blocked work — and unassigned tasks.
   Reassign straight from the list; history and logged time stay with the task. */

// Plain-language load states (server sends over / full / ok / light / unknown).
const LOAD = {
    over: { c: '#dc2626', label: 'Overloaded', icon: 'mdi-alert-octagon-outline', say: (p) => `${Math.max(0, p.plannedHours - p.capacityHours)}h more work than time available` },
    full: { c: '#d97706', label: 'Fully booked', icon: 'mdi-calendar-check-outline', say: (p) => `${Math.max(0, p.capacityHours - p.plannedHours)}h left free` },
    ok: { c: '#059669', label: 'Balanced', icon: 'mdi-scale-balance', say: (p) => `${Math.max(0, p.capacityHours - p.plannedHours)}h left free` },
    light: { c: '#0284c7', label: 'Free', icon: 'mdi-account-clock-outline', say: (p) => `${Math.max(0, p.capacityHours - p.plannedHours)}h available for new work` },
    unknown: { c: '#94a3b8', label: 'No hours set', icon: 'mdi-help-circle-outline', say: () => 'Working hours not known' },
}
const ORDER = ['over', 'full', 'ok', 'light', 'unknown']
const freeH = (p) => Math.max(0, (p.capacityHours || 0) - (p.plannedHours || 0))
const SORTS = { load: ['Most loaded first', (a, b) => (b.utilization ?? -1) - (a.utilization ?? -1)], free: ['Most free first', (a, b) => freeH(b) - freeH(a)], overdue: ['Most overdue first', (a, b) => b.overdue - a.overdue || b.openTasks - a.openTasks], name: ['Name A–Z', (a, b) => fullName(a.person).localeCompare(fullName(b.person))] }
const isLate = (d) => d && new Date(d) < new Date(new Date().toDateString())

export const WorkAllocation = () => {
    const { isAuthenticated: user } = useSelector((s) => s.authReducer || {})
    const [d, setD] = useState(null)
    const [error, setError] = useState('')
    const [f, setF] = useState({ clientId: '', auditId: '', days: '14' })
    const [open, setOpen] = useState(null)
    const [task, setTask] = useState(null)
    const [show, setShow] = useState('all')
    const [q, setQ] = useState('')
    const [sort, setSort] = useState('load')
    const [closedGroups, setClosedGroups] = useState({})
    const load = useCallback(() => {
        const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v))
        return api('GET', `/audit-work/allocation?${qs}`).then((j) => { setD(j.data); setError('') }).catch((e) => setError(e.message))
    }, [f])
    useEffect(() => { load() }, [load])
    const reassign = async (t, assignee) => {
        try { const j = await api('PUT', `/audits/${t.auditId}/tasks/${t.key}/assign`, { assignee: assignee || null, note: 'Reassigned from Team workload' }); toast.success(j.message); load() } catch (e) { toast.error(e.message) }
    }
    const people = useMemo(() => d?.people || [], [d])
    // the assign list: freest people first, with how much time they have
    const pickList = useMemo(() => [...people].sort((a, b) => freeH(b) - freeH(a)), [people])
    const counts = useMemo(() => Object.fromEntries(ORDER.map((k) => [k, people.filter((p) => p.load === k).length])), [people])
    const shown = useMemo(() => {
        const needle = q.trim().toLowerCase()
        return people.filter((p) => (show === 'all' || p.load === show) && (!needle || `${fullName(p.person)} ${p.person.designation || ''}`.toLowerCase().includes(needle))).sort(SORTS[sort][1])
    }, [people, show, q, sort])
    const groups = useMemo(() => {
        const m = new Map()
        ;(d?.unassigned || []).forEach((t) => { const k = `${t.auditId}`; if (!m.has(k)) m.set(k, { key: k, title: `${t.clientName} · ${t.auditCode}`, tasks: [] }); m.get(k).tasks.push(t) })
        return [...m.values()].sort((a, b) => b.tasks.length - a.tasks.length)
    }, [d])
    const overdueTotal = people.reduce((n, p) => n + (p.overdue || 0), 0)
    const assignSelect = (t, current, compact) => (
        <select className="pp-select wl-assign" value={current || ''} onChange={(e) => reassign(t, e.target.value)} aria-label={current ? 'Move to' : 'Assign to'} style={compact ? { maxWidth: 190 } : undefined}>
            {!current && <option value="">Assign to…</option>}
            {pickList.map((p) => <option key={p.person._id} value={p.person._id}>{fullName(p.person)} — {p.load === 'over' ? 'overloaded' : `${freeH(p)}h free`}</option>)}
            {current && <option value="">— Remove owner —</option>}
        </select>
    )
    const tiles = [
        ['all', 'Everyone', people.length, '#475569', 'mdi-account-group-outline'],
        ['over', 'Overloaded', counts.over, LOAD.over.c, LOAD.over.icon],
        ['full', 'Fully booked', counts.full, LOAD.full.c, LOAD.full.icon],
        ['ok', 'Balanced', counts.ok, LOAD.ok.c, LOAD.ok.icon],
        ['light', 'Free', counts.light, LOAD.light.c, LOAD.light.icon],
    ]
    return (
        <PeopleShell title="Team workload" root={{ label: 'Audits', to: '/audits' }} crumbs={[{ label: 'Team workload' }]} backTo="/audits">
            <div className="ao wl">
                <ErrorBanner error={error} />
                <p className="ao-help wl-help"><i className="mdi mdi-lightbulb-on-outline"></i><span><b>Who is doing what.</b> Each person's upcoming task hours are compared with the time they have free (leave taken off). Move work from <b style={{ color: LOAD.over.c }}>overloaded</b> people to <b style={{ color: LOAD.light.c }}>free</b> ones, and give each task in <b>Tasks with no owner</b> a person.</span></p>

                <div className="wl-tiles">
                    {tiles.map(([k, label, n, c, icon]) => (
                        <button key={k} type="button" className={`wl-tile ${show === k ? 'on' : ''}`} style={{ '--c': c }} onClick={() => setShow(k)} aria-pressed={show === k}>
                            <i className={`mdi ${icon}`}></i><b>{d ? n : '–'}</b><span>{label}</span>
                        </button>
                    ))}
                    <a href="#wl-unassigned" className={`wl-tile warn ${d?.unassigned.length ? '' : 'zero'}`} style={{ '--c': '#7c3aed' }}>
                        <i className="mdi mdi-account-question-outline"></i><b>{d ? d.unassigned.length : '–'}</b><span>No owner yet</span>
                    </a>
                </div>

                <div className="wl-bar">
                    <label className="wl-search"><i className="mdi mdi-magnify"></i><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a person…" aria-label="Find a person" /></label>
                    <select className="pp-select" value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value, auditId: '' })} aria-label="Company"><option value="">All companies</option>{[...new Map((d?.engagements || []).map((e) => [String(e.clientId), e])).values()].map((e) => <option key={e.clientId} value={e.clientId}>{e.clientName}</option>)}</select>
                    <select className="pp-select" value={f.auditId} onChange={(e) => setF({ ...f, auditId: e.target.value })} aria-label="Engagement"><option value="">All engagements</option>{(d?.engagements || []).filter((e) => !f.clientId || String(e.clientId) === f.clientId).map((e) => <option key={e._id} value={e._id}>{e.clientName} · {e.auditCode}</option>)}</select>
                    <select className="pp-select" value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })} aria-label="Look ahead"><option value="7">Next 7 days</option><option value="14">Next 14 days</option><option value="30">Next 30 days</option></select>
                    <select className="pp-select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">{Object.entries(SORTS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
                </div>

                <div className="ao-grid main wl-main">
                    <div className="wl-people">
                        {d && overdueTotal > 0 && show === 'all' && !q && <div className="wl-note bad"><i className="mdi mdi-alert-circle-outline"></i><span>{overdueTotal} task{overdueTotal === 1 ? ' is' : 's are'} overdue across the team. <button type="button" className="atk-link" style={{ margin: 0, display: 'inline' }} onClick={() => setSort('overdue')}>Show who has them first</button></span></div>}
                        {!d ? [0, 1, 2, 3].map((i) => <div key={i} className="pp-skel" style={{ height: 66 }}></div>)
                            : !people.length ? <div className="ao-card ao-empty"><i className="mdi mdi-account-group-outline"></i>No one is working on engagements you manage yet.</div>
                                : !shown.length ? <div className="ao-card ao-empty"><i className="mdi mdi-account-search-outline"></i>Nobody matches. <button type="button" className="atk-link" onClick={() => { setShow('all'); setQ('') }}>Show everyone</button></div>
                                    : shown.map((p) => {
                                        const L = LOAD[p.load] || LOAD.unknown
                                        const isOpen = open === p.person._id
                                        const pct = p.utilization ?? 0
                                        return (
                                            <div key={p.person._id} className={`wl-row ${isOpen ? 'open' : ''}`} style={{ '--c': L.c }}>
                                                <header onClick={() => setOpen(isOpen ? null : p.person._id)} role="button" tabIndex={0} aria-expanded={isOpen} onKeyDown={(e) => e.key === 'Enter' && setOpen(isOpen ? null : p.person._id)}>
                                                    <span className="wl-who"><Avatar person={p.person} size={36} /><span><b>{fullName(p.person)}</b><small>{p.person.designation}{p.onLeaveDays ? <em> · on leave {p.onLeaveDays}d</em> : ''}</small></span></span>
                                                    <span className="wl-load">
                                                        <span className="wl-state"><i className={`mdi ${L.icon}`}></i>{L.label}<small>{L.say(p)}</small></span>
                                                        <span className="wl-meter" title={`${p.plannedHours}h of work planned · ${p.capacityHours}h available`}><i style={{ width: `${Math.min(100, pct)}%` }}></i>{pct > 100 && <i className="over" style={{ width: `${Math.min(100, pct - 100)}%` }}></i>}</span>
                                                        <small className="wl-nums">{p.plannedHours}h planned of {p.capacityHours}h · {p.utilization === null ? '—' : `${p.utilization}%`}</small>
                                                    </span>
                                                    <span className="wl-chips">
                                                        <span className="wl-chip">{p.openTasks} task{p.openTasks === 1 ? '' : 's'}</span>
                                                        {p.overdue > 0 && <span className="wl-chip bad"><i className="mdi mdi-clock-alert-outline"></i>{p.overdue} overdue</span>}
                                                        {p.blocked > 0 && <span className="wl-chip warn"><i className="mdi mdi-block-helper"></i>{p.blocked} blocked</span>}
                                                        {p.loggedThisWeek > 0 && <span className="wl-chip soft">{p.loggedThisWeek}h this week</span>}
                                                    </span>
                                                    <i className={`mdi ${isOpen ? 'mdi-chevron-up' : 'mdi-chevron-down'} wl-chev`}></i>
                                                </header>
                                                {isOpen && (
                                                    <div className="wl-body">
                                                        {p.otherEngagements.tasks > 0 && <p className="ao-muted" style={{ margin: '0 0 8px' }}>Also has {p.otherEngagements.tasks} open task{p.otherEngagements.tasks === 1 ? '' : 's'} ({p.otherEngagements.hours}h) on engagements outside this filter — counted in the load.</p>}
                                                        {!p.tasks.length ? <p className="ao-muted">No open tasks here — {fullName(p.person).split(' ')[0]} can take new work.</p> : (
                                                            <ul className="wl-tasks">{p.tasks.map((t) => (
                                                                <li key={`${t.auditId}-${t.key}`}>
                                                                    <div className="wl-t-main">
                                                                        <button type="button" className="wl-t-title" onClick={() => setTask(t)}>{t.label}</button>
                                                                        <small>{t.clientName} · {t.auditCode} · {t.stage}{t.location ? ` · ${t.location}` : ''}</small>
                                                                    </div>
                                                                    <div className="wl-t-meta">
                                                                        <TaskPill status={t.status} small />
                                                                        {t.priority !== 'Medium' && <span className="ao-chip" style={{ '--c': PRIORITY_C[t.priority] }}>{t.priority}</span>}
                                                                        <span className={isLate(t.dueDate) ? 'bad' : ''}><i className="mdi mdi-calendar-blank-outline"></i>{t.dueDate ? fmtDate(t.dueDate) : 'No due date'}</span>
                                                                        <span><i className="mdi mdi-timer-outline"></i>{t.loggedHours}h of {t.estimatedHours || 0}h</span>
                                                                    </div>
                                                                    {assignSelect(t, p.person._id, true)}
                                                                </li>
                                                            ))}</ul>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                        {d && <details className="wl-how"><summary><i className="mdi mdi-information-outline"></i>How is the load worked out?</summary><p>{d.formulas.plannedHours} {d.formulas.capacityHours} {d.formulas.utilization}</p></details>}
                    </div>

                    <aside className="wl-side" id="wl-unassigned">
                        <header><span><i className="mdi mdi-account-question-outline"></i>Tasks with no owner</span><b>{d?.unassigned.length || 0}</b></header>
                        <p className="wl-side-help">Pick someone for each task. The list shows the <b>freest people first</b>.</p>
                        {!d ? <div className="pp-skel" style={{ height: 120 }}></div> : !groups.length ? (
                            <div className="wl-allset"><i className="mdi mdi-check-decagram-outline"></i><b>All tasks have an owner</b><small>Nothing waiting to be assigned.</small></div>
                        ) : groups.map((g) => {
                            const closed = closedGroups[g.key]
                            return (
                                <section key={g.key} className="wl-group">
                                    <button type="button" className="wl-group-h" onClick={() => setClosedGroups((m) => ({ ...m, [g.key]: !closed }))} aria-expanded={!closed}>
                                        <i className={`mdi ${closed ? 'mdi-chevron-right' : 'mdi-chevron-down'}`}></i><span>{g.title}</span><b>{g.tasks.length}</b>
                                    </button>
                                    {!closed && <ul>{g.tasks.slice(0, 25).map((t) => (
                                        <li key={`${t.auditId}-${t.key}`} className="wl-u">
                                            <b title={t.label}>{t.label}</b>
                                            <div className="wl-u-meta"><span className="wl-stage">{t.stage}</span>{t.responsibleRole && <span>{t.responsibleRole}</span>}{t.dueDate && <span className={isLate(t.dueDate) ? 'bad' : ''}>Due {fmtDate(t.dueDate)}</span>}{t.estimatedHours > 0 && <span>{t.estimatedHours}h</span>}</div>
                                            {assignSelect(t)}
                                        </li>
                                    ))}{g.tasks.length > 25 && <li className="wl-more">+{g.tasks.length - 25} more — filter by this engagement to see them all</li>}</ul>}
                                </section>
                            )
                        })}
                    </aside>
                </div>
            </div>
            {task && <TaskDrawerLoader auditId={task.auditId} taskKey={task.key} me={user?._id} onClose={() => setTask(null)} onChanged={load} />}
        </PeopleShell>
    )
}
