import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PeopleShell, Avatar, EmptyState, ErrorBanner, fullName } from '../../components/people/PeopleUI'
import { useOrgTree, buildTree, LevelChip, TodayTag, PersonRow, TIER_TONE, reachText } from '../../components/org/OrgUI'
import { chatApi as api } from '../../components/chat/chatApi'
import { toast } from '../../components/common/Toaster'

/* The whole firm as a reporting tree. Everyone can see names and designations;
   live status shows for the people you look after. HR and leadership can change
   who reports to whom and fix people whose manager has left. */

const ROOT = { label: 'People', to: '/organisation' }

// Classic top-down org chart (laptop). Click a card to open it; the chevron folds a branch.
const ChartNode = ({ p, tree, stats, me, path, hit, folded, fold, onOpen }) => {
    const kids = tree.kids.get(p._id) || []
    const closed = folded.has(p._id)
    return (
        <li>
            <div className={`og-node ${p._id === me ? 'me' : ''} ${path?.has(p._id) ? 'path' : ''} ${hit && hit.has(p._id) ? 'hit' : ''}`} style={{ '--c': TIER_TONE[p.tier] || '#94a3b8' }}>
                <button type="button" className="og-node-card" onClick={() => onOpen(p)}>
                    {p._id === me && <em className="og-you">You</em>}
                    <Avatar person={p} size={40} />
                    <b>{fullName(p)}</b>
                    <small>{p.designation}</small>
                    {stats?.[p._id] && <TodayTag s={stats[p._id]} />}
                </button>
                {kids.length > 0 && (
                    <button type="button" className="og-fold" onClick={() => fold(p._id)} aria-label={closed ? 'Show team' : 'Hide team'}>
                        {closed ? <>+{tree.below(p._id)}</> : <i className="mdi mdi-chevron-up"></i>}
                    </button>
                )}
            </div>
            {kids.length > 0 && !closed && (() => {
                // people with no team of their own stack downwards in one column, so the chart doesn't sprawl sideways
                const leaves = kids.filter((k) => !(tree.kids.get(k._id) || []).length)
                const branches = kids.filter((k) => (tree.kids.get(k._id) || []).length)
                const stack = leaves.length > 0 && (
                    <div className="og-stack">{leaves.map((k) => (
                        <button key={k._id} type="button" className={`og-leaf ${k._id === me ? 'me' : ''} ${hit && hit.has(k._id) ? 'hit' : ''}`} data-you={k._id === me ? 'You' : undefined} style={{ '--c': TIER_TONE[k.tier] || '#94a3b8' }} onClick={() => onOpen(k)}>
                            <Avatar person={k} size={28} /><span><b>{fullName(k)}</b><small>{k.designation}</small></span>{stats?.[k._id] && <TodayTag s={stats[k._id]} />}
                        </button>
                    ))}</div>
                )
                if (!branches.length) return <div className="og-stack-solo">{stack}</div>
                return (
                    <ul>
                        {stack && <li className="og-stack-li">{stack}</li>}
                        {branches.map((k) => <ChartNode key={k._id} p={k} tree={tree} stats={stats} me={me} path={path} hit={hit} folded={folded} fold={fold} onOpen={onOpen} />)}
                    </ul>
                )
            })()}
        </li>
    )
}

// Indented list (phones, and search results).
const ListNode = ({ p, tree, stats, me, hit, folded, fold, onOpen, depth = 0 }) => {
    const kids = tree.kids.get(p._id) || []
    const closed = folded.has(p._id)
    if (hit && !hit.has(p._id)) return null
    return (
        <li style={{ '--d': depth }}>
            <PersonRow p={p} s={stats?.[p._id]} me={me} onClick={() => onOpen(p)}
                sub={<span className="og-sub"><LevelChip person={p} />{kids.length > 0 && <button type="button" className="og-expand" onClick={(e) => { e.stopPropagation(); fold(p._id) }} aria-expanded={!closed}><i className={`mdi ${closed ? 'mdi-chevron-right' : 'mdi-chevron-down'}`}></i>{tree.below(p._id)} in team</button>}</span>} />
            {kids.length > 0 && (!closed || hit) && <ul>{kids.map((k) => <ListNode key={k._id} p={k} tree={tree} stats={stats} me={me} hit={hit} folded={folded} fold={fold} onOpen={onOpen} depth={depth + 1} />)}</ul>}
        </li>
    )
}

// Side sheet for one person: their line, team, and (HR / leadership) who they report to.
const PersonSheet = ({ p, tree, data, onClose, onSaved }) => {
    const [manager, setManager] = useState(p.manager || '')
    const [busy, setBusy] = useState(false)
    const chain = []
    for (let cur = p.manager && tree.byId.get(p.manager); cur && chain.length < 15; cur = cur.manager && tree.byId.get(cur.manager)) chain.push(cur)
    const team = tree.kids.get(p._id) || []
    const s = data.stats[p._id]
    // can't report to yourself or to someone in your own team
    const below = new Set(); const walk = (id) => (tree.kids.get(id) || []).forEach((c) => { below.add(c._id); walk(c._id) }); walk(p._id)
    const options = data.people.filter((x) => x._id !== p._id && !below.has(x._id)).sort((a, b) => a.tier - b.tier || fullName(a).localeCompare(fullName(b)))
    const save = async () => {
        setBusy(true)
        try {
            const j = await api('PUT', `/org/${p._id}/manager`, { manager: manager || null })
            toast.success(j.message, { title: 'Reporting line updated' })
            if (j.warning) toast.warning(j.warning)
            onSaved()
        } catch (e) { toast.error(e.message, { title: 'Couldn’t change manager' }) }
        setBusy(false)
    }
    return createPortal(
        <div className="pp og-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <aside className="og-sheet" role="dialog" aria-modal="true" aria-label={fullName(p)}>
                <header>
                    <Avatar person={p} size={56} ring />
                    <div><b>{fullName(p)}</b><small>{p.designation} · {p.department}</small><LevelChip person={p} /></div>
                    <button type="button" className="og-x" onClick={onClose} aria-label="Close"><i className="mdi mdi-close"></i></button>
                </header>
                <div className="og-sheet-body">
                    {s && (
                        <div className="og-sheet-stats">
                            <div><small>Today</small><TodayTag s={s} /></div>
                            <div><small>Open tasks</small><b className={s.overdueTasks ? 'bad' : ''}>{s.openTasks}{s.overdueTasks ? ` (${s.overdueTasks} late)` : ''}</b></div>
                            <div><small>Projects</small><b>{s.projects}</b></div>
                            <div><small>Leave to approve</small><b>{s.pendingLeave}</b></div>
                        </div>
                    )}
                    <h5>Reports to</h5>
                    {chain.length ? <ol className="og-line compact">{chain.reverse().map((c) => <li key={c._id}><PersonRow p={c} me={data.me} /></li>)}</ol>
                        : <p className="og-empty">{p.orphan ? 'Their manager has left — pick a new one below.' : 'Nobody — top of the reporting line.'}</p>}
                    <h5>Team {team.length ? <span>{tree.below(p._id)} people · {team.length} direct</span> : null}</h5>
                    {team.length ? <ul className="og-tree">{team.map((c) => <li key={c._id}><PersonRow p={c} s={data.stats[c._id]} me={data.me} /></li>)}</ul> : <p className="og-empty">Nobody reports to {p.firstName}.</p>}
                    {data.canEdit && (
                        <div className="og-edit">
                            <h5><i className="mdi mdi-account-switch-outline"></i>Change who {p.firstName} reports to</h5>
                            <select className="pp-select" value={manager} onChange={(e) => setManager(e.target.value)}>
                                <option value="">Nobody (top of the line)</option>
                                {options.map((o) => <option key={o._id} value={o._id}>{fullName(o)} — {o.designation}</option>)}
                            </select>
                            <button type="button" className="pp-btn primary" disabled={busy || manager === (p.manager || '')} onClick={save}><i className="mdi mdi-content-save-outline"></i>{busy ? 'Saving…' : 'Save'}</button>
                        </div>
                    )}
                </div>
            </aside>
        </div>,
        document.body
    )
}

export const Organisation = () => {
    const { data, error, reload } = useOrgTree()
    const tree = useMemo(() => buildTree(data?.people), [data])
    const [view, setView] = useState(() => (window.innerWidth < 992 ? 'list' : 'chart'))
    const [q, setQ] = useState('')
    const [folded, setFolded] = useState(() => new Set())
    const [open, setOpen] = useState(null)
    const fold = (id) => setFolded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
    const chartRef = useRef(null)
    const path = useMemo(() => new Set(data?.chain || []), [data])
    const findMe = () => {
        setQ(''); setFolded(new Set())
        setTimeout(() => {
            const el = document.querySelector('.og-node.me, .og-leaf.me, .og-list .og-person.me')
            if (!el) return
            el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
            el.classList.remove('og-flash'); void el.offsetWidth; el.classList.add('og-flash')
        }, 60)
    }
    // open the chart centred on you
    useEffect(() => {
        const wrap = chartRef.current
        const mine = wrap?.querySelector('.og-node.me, .og-leaf.me')
        if (wrap && mine) wrap.scrollLeft = Math.max(0, mine.offsetLeft - wrap.clientWidth / 2 + mine.offsetWidth / 2)
    }, [data, view])

    // search: matches plus everyone above them, so the path stays visible
    const hit = useMemo(() => {
        if (!q.trim() || !data) return null
        const t = q.toLowerCase()
        const out = new Set()
        data.people.filter((p) => `${fullName(p)} ${p.designation} ${p.department} ${p.employeeId}`.toLowerCase().includes(t)).forEach((p) => {
            for (let cur = p; cur && !out.has(cur._id); cur = cur.manager && tree.byId.get(cur.manager)) out.add(cur._id)
        })
        return out
    }, [q, data, tree])

    if (error) return <PeopleShell title="Organisation" root={ROOT} crumbs={[{ label: 'Organisation' }]}><ErrorBanner error={error} /></PeopleShell>
    if (!data) return <PeopleShell title="Organisation" root={ROOT} crumbs={[{ label: 'Organisation' }]}><div className="og-loading"><i className="mdi mdi-loading mdi-spin"></i></div></PeopleShell>

    const needsManager = data.people.filter((p) => p.orphan || (!p.manager && p.tier > 1))
    const levels = [...new Set(data.ladder.map((l) => l.tier))]
    const tops = tree.roots.filter((p) => p.tier === 1 || (tree.kids.get(p._id) || []).length)
    const loose = tree.roots.filter((p) => !tops.includes(p))

    return (
        <PeopleShell title="Organisation" root={ROOT} crumbs={[{ label: 'Organisation' }]}>
            <div className="og-stats">
                <div style={{ '--c': '#1e40af' }}><i className="mdi mdi-account-group-outline"></i><b>{data.people.length}</b><small>People</small></div>
                <div style={{ '--c': '#c8102e' }}><i className="mdi mdi-crown-outline"></i><b>{data.people.filter((p) => p.tier === 1).length}</b><small>Leadership</small></div>
                <div style={{ '--c': '#0284c7' }}><i className="mdi mdi-sitemap"></i><b>{data.people.filter((p) => (tree.kids.get(p._id) || []).length).length}</b><small>Team leads</small></div>
                <div style={{ '--c': '#475569' }}><i className="mdi mdi-eye-outline"></i><b className="sm">{data.scope.firm ? 'Firm-wide' : data.scope.leads ? `${data.scope.teamSize} people` : 'Yourself'}</b><small>You can see</small></div>
            </div>

            <details className="pp-card og-ladder" open={window.innerWidth >= 992}>
                <summary><i className="mdi mdi-stairs"></i><b>Levels &amp; responsibilities</b><span>{reachText(data.scope)}</span><i className="mdi mdi-chevron-down"></i></summary>
                <ol>
                    {levels.map((t) => data.ladder.filter((l) => l.tier === t).map((l) => (
                        <li key={l.key} style={{ '--c': TIER_TONE[l.tier] }}>
                            <span className="og-tier">{l.tier}</span>
                            <div><b>{l.title}</b><p>{l.duty}</p><small>{l.reach === 'firm' ? 'Sees the whole firm' : l.reach === 'people' ? 'Sees everyone’s HR records' : l.reach === 'finance' ? 'Sees everyone’s money records' : 'Sees their own team'}</small></div>
                            <em>{data.people.filter((p) => l.designations.some((d) => d.toLowerCase() === (p.designation || '').toLowerCase())).length}</em>
                        </li>
                    )))}
                </ol>
            </details>

            {data.canEdit && needsManager.length > 0 && (
                <section className="pp-card og-fix">
                    <header><i className="mdi mdi-account-alert-outline"></i><div><b>{needsManager.length} {needsManager.length === 1 ? 'person needs' : 'people need'} a reporting manager</b><small>Their manager has left or was never set, so nobody approves their leave or sees their work.</small></div></header>
                    <div className="og-fix-list">{needsManager.map((p) => <button key={p._id} type="button" onClick={() => setOpen(p)}><Avatar person={p} size={28} /><span><b>{fullName(p)}</b><small>{p.designation}{p.orphan ? ' · manager left' : ''}</small></span><i className="mdi mdi-chevron-right"></i></button>)}</div>
                </section>
            )}

            <section className="pp-card og-board">
                <div className="og-toolbar">
                    <div className="og-views">
                        <button type="button" className={view === 'chart' ? 'on' : ''} onClick={() => setView('chart')}><i className="mdi mdi-family-tree"></i>Chart</button>
                        <button type="button" className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}><i className="mdi mdi-format-list-bulleted-square"></i>List</button>
                    </div>
                    <div className="pp-search og-search"><i className="mdi mdi-magnify"></i><input type="search" className="pp-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a person, designation or team…" /></div>
                    <button type="button" className="pp-btn sm og-findme" onClick={findMe}><i className="mdi mdi-crosshairs-gps"></i>Find me</button>
                    <button type="button" className="pp-btn sm" onClick={() => setFolded(new Set())}><i className="mdi mdi-arrow-expand-all"></i>Expand all</button>
                </div>

                {hit && !hit.size ? <EmptyState icon="mdi-account-search-outline" title="No one matches" text="Try a name, designation or department." /> : view === 'chart' && !hit ? (
                    <div className="og-chart-wrap" ref={chartRef}>
                        <ul className="og-chart">{tops.map((p) => <ChartNode key={p._id} p={p} tree={tree} stats={data.stats} me={data.me} path={path} hit={hit} folded={folded} fold={fold} onOpen={setOpen} />)}</ul>
                    </div>
                ) : (
                    <ul className="og-list">{tree.roots.map((p) => <ListNode key={p._id} p={p} tree={tree} stats={data.stats} me={data.me} hit={hit} folded={folded} fold={fold} onOpen={setOpen} />)}</ul>
                )}
                {view === 'chart' && !hit && loose.length > 0 && (
                    <div className="og-loose"><b>Not placed in the tree yet</b>{loose.map((p) => <button key={p._id} type="button" onClick={() => setOpen(p)}><Avatar person={p} size={24} />{fullName(p)}<small>{p.designation}</small></button>)}</div>
                )}
            </section>

            {open && <PersonSheet p={open} tree={tree} data={data} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); reload() }} />}
        </PeopleShell>
    )
}
