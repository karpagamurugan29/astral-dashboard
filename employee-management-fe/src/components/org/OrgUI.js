import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { chatApi as api } from '../chat/chatApi'
import { Avatar, fullName } from '../people/PeopleUI'
import './Org.css'

/* Shared pieces for the reporting tree: the profile card ("my line and my team")
   and the Organisation page (the whole firm). Data: GET /org/tree. */

export const useOrgTree = () => {
    const [data, setData] = useState(null)
    const [error, setError] = useState('')
    const load = useCallback(() => api('GET', '/org/tree').then((j) => { setData(j.data); setError('') }).catch((e) => setError(e.message)), [])
    useEffect(() => { load() }, [load])
    return { data, error, reload: load }
}

// people[] → { byId, kids (id → child ids, sorted by level then name), roots }
export const buildTree = (people = []) => {
    const byId = new Map(people.map((p) => [p._id, p]))
    const kids = new Map()
    const roots = []
    const order = (a, b) => (a.tier - b.tier) || fullName(a).localeCompare(fullName(b))
    people.forEach((p) => {
        if (p.manager && byId.has(p.manager)) { if (!kids.has(p.manager)) kids.set(p.manager, []); kids.get(p.manager).push(p) }
        else roots.push(p)
    })
    kids.forEach((list) => list.sort(order))
    roots.sort(order)
    const below = (id) => { let n = 0; const walk = (x) => (kids.get(x) || []).forEach((c) => { n += 1; walk(c._id) }); walk(id); return n }
    return { byId, kids, roots, below }
}

// Tier colours: leadership red, management blue, functions slate, consultants sky, juniors gray.
export const TIER_TONE = { 1: '#c8102e', 2: '#1e40af', 3: '#2563eb', 4: '#475569', 5: '#0284c7', 6: '#0891b2', 7: '#64748b', 8: '#94a3b8', 9: '#94a3b8' }
export const LevelChip = ({ person }) => <span className="og-level" style={{ '--c': TIER_TONE[person.tier] || '#94a3b8' }}>{person.level}</span>

const TODAY = {
    in: ['Working', '#16a34a', 'mdi-circle'],
    out: ['Checked out', '#0284c7', 'mdi-circle-half-full'],
    leave: ['On leave', '#d97706', 'mdi-beach'],
    'not-in': ['Not in yet', '#94a3b8', 'mdi-circle-outline'],
}
export const TodayTag = ({ s }) => {
    if (!s) return null
    const [label, c, icon] = TODAY[s.today] || TODAY['not-in']
    return <span className="og-today" style={{ '--c': c }}><i className={`mdi ${icon}`}></i>{s.today === 'leave' && s.leaveType ? s.leaveType.replace(' Leave', '') : label}</span>
}

// One person row; `stats` shows today + workload when the viewer looks after them.
export const PersonRow = ({ p, s, me, sub, children, onClick }) => (
    <div className={`og-person ${p._id === me ? 'me' : ''}`} onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
        onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && onClick() : undefined}>
        <Avatar person={p} size={38} />
        <span className="og-person-main">
            <b>{fullName(p)}{p._id === me && <em>You</em>}</b>
            <small>{p.designation}{p.department ? ` · ${p.department}` : ''}</small>
            {sub}
        </span>
        {s && (
            <span className="og-person-stats">
                <TodayTag s={s} />
                <span className="og-nums">
                    <span title="Open tasks" className={s.overdueTasks ? 'bad' : ''}><i className="mdi mdi-checkbox-marked-circle-outline"></i>{s.openTasks}{s.overdueTasks ? <sup>{s.overdueTasks} late</sup> : null}</span>
                    <span title="Active projects"><i className="mdi mdi-folder-outline"></i>{s.projects}</span>
                    {s.pendingLeave > 0 && <span title="Leave waiting for approval" className="warn"><i className="mdi mdi-beach"></i>{s.pendingLeave}</span>}
                </span>
            </span>
        )}
        {children}
    </div>
)

// Collapsible tree under `rootId` (the viewer's team).
export const TeamTree = ({ tree, rootId, stats, me, depth = 0, openIds, toggle }) => {
    const list = tree.kids.get(rootId) || []
    if (!list.length) return null
    return (
        <ul className={`og-tree ${depth ? 'nested' : ''}`}>
            {list.map((p) => {
                const has = (tree.kids.get(p._id) || []).length
                const open = openIds.has(p._id)
                return (
                    <li key={p._id}>
                        <PersonRow p={p} s={stats?.[p._id]} me={me}
                            sub={has ? <button type="button" className="og-expand" onClick={(e) => { e.stopPropagation(); toggle(p._id) }} aria-expanded={open}>
                                <i className={`mdi ${open ? 'mdi-chevron-down' : 'mdi-chevron-right'}`}></i>{has} direct · {tree.below(p._id)} in team
                            </button> : null} />
                        {has > 0 && open && <TeamTree tree={tree} rootId={p._id} stats={stats} me={me} depth={depth + 1} openIds={openIds} toggle={toggle} />}
                    </li>
                )
            })}
        </ul>
    )
}

// What this person can see, in plain words.
export const reachText = (scope) => scope?.firm ? 'Firm-wide — every team, project and record'
    : scope?.people ? 'Everyone’s HR records, plus your own team'
    : scope?.finance ? 'Everyone’s expenses and payroll, plus your own team'
    : scope?.leads ? `You and your team of ${scope.teamSize} (${scope.direct} reporting to you directly)`
    : 'Your own records and work'

/* --------------- Profile card: my reporting line + my team --------------- */
export const MyTeamCard = () => {
    const { data, error } = useOrgTree()
    const tree = useMemo(() => buildTree(data?.people), [data])
    const [openIds, setOpenIds] = useState(() => new Set())
    const toggle = (id) => setOpenIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
    if (error) return null
    if (!data) return <section className="pp-card og-card"><div className="og-loading"><i className="mdi mdi-loading mdi-spin"></i></div></section>

    const me = tree.byId.get(data.me)
    const line = [...data.chain].reverse().map((id) => tree.byId.get(id)).filter(Boolean)
    const step = data.ladder.find((l) => l.designations.some((d) => d.toLowerCase() === (me?.designation || '').toLowerCase()))
    const myTeam = tree.kids.get(data.me) || []
    const peers = me?.manager ? (tree.kids.get(me.manager) || []).filter((p) => p._id !== data.me) : []
    const teamIds = [data.me, ...(() => { const out = []; const walk = (id) => (tree.kids.get(id) || []).forEach((c) => { out.push(c._id); walk(c._id) }); walk(data.me); return out })()]
    const st = teamIds.slice(1).map((id) => data.stats[id]).filter(Boolean)
    const sum = (k) => st.reduce((n, s) => n + (s[k] || 0), 0)

    return (
        <section className="pp-card og-card">
            <div className="pp-card-head">
                <span className="mp-head-icon" style={{ '--c': '#1e40af' }}><i className="mdi mdi-sitemap"></i></span>
                <div><h3>Team &amp; reporting line</h3><p>Who you report to, and who reports to you.</p></div>
                <Link to="/organisation" className="pp-btn sm og-head-link"><i className="mdi mdi-family-tree"></i>Whole firm</Link>
            </div>
            <div className="pp-card-body">
                <div className="og-role" style={{ '--c': TIER_TONE[me?.tier] || '#94a3b8' }}>
                    <span className="og-role-ic"><i className="mdi mdi-badge-account-horizontal-outline"></i></span>
                    <div>
                        <b>{me?.designation}{step && step.title !== me?.designation ? ` · ${step.title}` : ''}</b>
                        <p>{step?.duty || 'Your responsibilities are set by your reporting manager.'}</p>
                        <small><i className="mdi mdi-eye-outline"></i>You can see: {reachText(data.scope)}</small>
                    </div>
                </div>

                <div className="og-two">
                    <div>
                        <h4><i className="mdi mdi-arrow-up-bold-circle-outline"></i>Higher officials</h4>
                        {line.length ? (
                            <ol className="og-line">
                                {line.map((p) => <li key={p._id}><PersonRow p={p} me={data.me} sub={<LevelChip person={p} />} /></li>)}
                                <li className="you"><PersonRow p={me} me={data.me} sub={<LevelChip person={me} />} /></li>
                            </ol>
                        ) : <p className="og-empty"><i className="mdi mdi-crown-outline"></i>You’re at the top of the reporting line.</p>}
                    </div>

                    <div>
                        {myTeam.length ? (
                            <>
                                <h4><i className="mdi mdi-account-group-outline"></i>My team <span>{teamIds.length - 1} people · {myTeam.length} direct</span></h4>
                                <div className="og-summary">
                                    <span style={{ '--c': '#16a34a' }}><b>{st.filter((s) => s.today === 'in' || s.today === 'out').length}</b>in today</span>
                                    <span style={{ '--c': '#d97706' }}><b>{st.filter((s) => s.today === 'leave').length}</b>on leave</span>
                                    <span style={{ '--c': '#1e40af' }}><b>{sum('openTasks')}</b>open tasks</span>
                                    <span style={{ '--c': '#e11d48' }}><b>{sum('overdueTasks')}</b>overdue</span>
                                </div>
                                <TeamTree tree={tree} rootId={data.me} stats={data.stats} me={data.me} openIds={openIds} toggle={toggle} />
                            </>
                        ) : (
                            <>
                                <h4><i className="mdi mdi-account-multiple-outline"></i>My team mates <span>{peers.length} people</span></h4>
                                {peers.length ? <ul className="og-tree">{peers.map((p) => <li key={p._id}><PersonRow p={p} me={data.me} /></li>)}</ul>
                                    : <p className="og-empty"><i className="mdi mdi-account-outline"></i>No one else reports to your manager yet.</p>}
                                <p className="og-note"><i className="mdi mdi-information-outline"></i>Nobody reports to you yet. When HR assigns people to you, you’ll see their day, tasks and leave here.</p>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </section>
    )
}

// Access role that goes with each designation on the firm's ladder (mirrors utils/hierarchy.js on the server).
export const ROLE_FOR_DESIGNATION = {
    'company partner': 'Admin', partner: 'Admin', director: 'Admin', 'managing director': 'Admin',
    'hr head': 'HR', 'accounts head': 'Manager', 'finance head': 'Manager',
    'senior manager': 'Manager', manager: 'Manager',
    hr: 'HR', 'hr executive': 'HR', 'hr manager': 'HR',
    accounts: 'Employee', 'accounts executive': 'Employee', accountant: 'Employee', 'finance executive': 'Employee',
    'senior consultant': 'Team Lead', 'team lead': 'Team Lead', consultant: 'Employee', 'junior consultant': 'Employee',
    associate: 'Employee', 'article assistant': 'Employee', trainee: 'Employee',
}
export const LEVEL_ORDER = ['company partner', 'partner', 'managing director', 'director', 'hr head', 'accounts head', 'finance head', 'senior manager', 'manager', 'hr manager', 'hr', 'hr executive', 'accounts', 'accounts executive', 'accountant', 'finance executive', 'senior consultant', 'consultant', 'junior consultant', 'associate', 'article assistant', 'trainee']
export const levelRank = (designation) => { const i = LEVEL_ORDER.indexOf(String(designation || '').trim().toLowerCase()); return i < 0 ? 99 : i }
