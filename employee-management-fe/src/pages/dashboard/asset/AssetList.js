import React, { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link, useLocation } from 'react-router-dom'
import assetActions from '../../../redux/asset/Actions'
import employeeActions from '../../../redux/employee/Actions'
import { PeopleShell, Avatar, EmptyState, ErrorBanner, fullName, fmtDate } from '../../../components/people/PeopleUI'
import { ASSET_ROOT, ASSET_TYPES, AssetStatus, AssetIcon, assetTypeMeta, since } from '../../../components/asset/AssetUI'
import './AssetList.css'
import { useAccess } from '../../../hooks/useAccess'
import { toast } from '../../../components/common/Toaster'

/* -------------------------------------------------------------------------- */
/*  Assets. Top levels (Admin / HR, or anyone given the Assets permission)    */
/*  get the full register: add, assign, take back, history. Everyone else     */
/*  sees only the equipment assigned to them ("My assets").                   */
/* -------------------------------------------------------------------------- */

const CONDITIONS = [
    { value: 'New', color: '#059669' },
    { value: 'Good', color: '#0284c7' },
    { value: 'Fair', color: '#d97706' },
    { value: 'Damaged', color: '#e11d48' },
]
const conditionColor = (c) => CONDITIONS.find((x) => x.value === c)?.color || '#64748b'
const Condition = ({ value }) => value ? <span className="as-cond" style={{ '--c': conditionColor(value) }}>{value}</span> : null

export const AssetList = () => {
    const { pathname } = useLocation()
    const { can } = useAccess()
    const topLevel = can(['Admin', 'HR'], 'assets')
    if (!topLevel) return <MyAssets />
    return <AssetRegister startView={pathname.includes('assignments') ? 'people' : 'assets'} />
}

/* ================================ My assets (everyone) ================================ */
export const MyAssets = () => {
    const dispatch = useDispatch()
    const { mine, error } = useSelector((state) => state.assetReducer || {})
    useEffect(() => { dispatch({ type: assetActions.GET_MY_ASSETS }) }, [dispatch])
    const current = mine?.current || []
    const past = mine?.past || []

    return (
        <PeopleShell title="My assets" root={ASSET_ROOT} crumbs={[{ label: 'My assets' }]}>
            <ErrorBanner error={error} />
            <div className="mya-intro">
                <span className="mya-intro-ic"><i className="mdi mdi-briefcase-check-outline"></i></span>
                <div>
                    <b>{!mine ? 'Loading…' : current.length ? `${current.length} item${current.length === 1 ? '' : 's'} assigned to you` : 'Nothing is assigned to you right now'}</b>
                    <p>Company equipment in your care. Look after it — and tell HR straight away if something is lost or damaged.</p>
                </div>
                <Link to="/helpdesk" className="pp-btn"><i className="mdi mdi-lifebuoy"></i>Report a problem</Link>
            </div>

            {!mine ? <div className="as-loading"><i className="mdi mdi-loading mdi-spin"></i></div> : !current.length ? (
                <div className="pp-card"><EmptyState icon="mdi-laptop-off" title="No assets assigned" text="When HR hands you a laptop, phone, ID card or other equipment, it appears here." /></div>
            ) : (
                <div className="mya-grid">
                    {current.map((a) => {
                        const m = assetTypeMeta(a.assetType)
                        const last = (a.myHistory || []).filter((h) => !h.returnedAt).slice(-1)[0]
                        return (
                            <article key={a._id} className="mya-card" style={{ '--c': m.color }}>
                                <div className="mya-card-top">
                                    <span className="mya-big-ic"><i className={`mdi ${m.icon}`}></i></span>
                                    <span className="mya-tag">{a.assetTag}</span>
                                </div>
                                <h3>{a.assetName}</h3>
                                <p className="mya-sub">{[a.assetType, [a.brand, a.model].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}</p>
                                <dl className="mya-facts">
                                    {a.serialNumber && <div><dt>Serial no.</dt><dd className="as-mono">{a.serialNumber}</dd></div>}
                                    <div><dt>With you since</dt><dd>{fmtDate(a.assignedDate)} <small>· {since(a.assignedDate)}</small></dd></div>
                                    {last?.assignedBy && <div><dt>Handed over by</dt><dd>{fullName(last.assignedBy)}</dd></div>}
                                    <div><dt>Condition</dt><dd><Condition value={a.condition} /></dd></div>
                                    {a.warrantyUntil && <div><dt>Warranty</dt><dd>{new Date(a.warrantyUntil) < new Date() ? <span className="as-warn">Expired {fmtDate(a.warrantyUntil)}</span> : `Until ${fmtDate(a.warrantyUntil)}`}</dd></div>}
                                </dl>
                                {last?.assignNote && <p className="mya-note"><i className="mdi mdi-note-text-outline"></i>{last.assignNote}</p>}
                            </article>
                        )
                    })}
                </div>
            )}

            {past.length > 0 && (
                <section className="pp-card mya-past">
                    <h3><i className="mdi mdi-history"></i>Returned earlier</h3>
                    <ul>
                        {past.map((a) => {
                            const h = (a.myHistory || []).slice(-1)[0] || {}
                            return (
                                <li key={a._id}>
                                    <AssetIcon type={a.assetType} size={34} />
                                    <span className="mya-past-main"><b>{a.assetName}</b><small>{a.assetTag} · {fmtDate(h.assignedAt)} → {fmtDate(h.returnedAt)}</small></span>
                                    <Condition value={h.returnCondition} />
                                </li>
                            )
                        })}
                    </ul>
                </section>
            )}
        </PeopleShell>
    )
}

/* ================================ Register (top levels) ================================ */
const TABS = [
    ['all', 'All'],
    ['Assigned', 'With employees'],
    ['Available', 'Available'],
    ['Damaged', 'Damaged'],
    ['Retired', 'Retired'],
]

const AssetRegister = ({ startView }) => {
    const dispatch = useDispatch()
    const { list, listLoading, error } = useSelector((state) => state.assetReducer || {})
    const { list: employees } = useSelector((state) => state.employeeReducer || {})
    const [view, setView] = useState(startView)
    const [tab, setTab] = useState('all')
    const [q, setQ] = useState('')
    const [type, setType] = useState('')
    const [dialog, setDialog] = useState(null) // { kind: 'form'|'assign'|'return'|'history', asset }

    useEffect(() => {
        dispatch({ type: assetActions.GET_ASSETS })
        dispatch({ type: employeeActions.GET_EMPLOYEES })
    }, [dispatch])
    useEffect(() => { setView(startView) }, [startView])

    const people = useMemo(() => (employees || []).filter((e) => e.status === 'Active').sort((a, b) => fullName(a).localeCompare(fullName(b))), [employees])
    const assets = useMemo(() => list || [], [list])
    const count = (s) => assets.filter((a) => (s === 'Available' ? ['Available', 'Returned'].includes(a.status) : a.status === s)).length
    const filtered = assets.filter((a) => {
        if (tab !== 'all' && (tab === 'Available' ? !['Available', 'Returned'].includes(a.status) : a.status !== tab)) return false
        if (type && a.assetType !== type) return false
        if (!q) return true
        return [a.assetName, a.assetTag, a.serialNumber, a.brand, a.model, a.assetType, a.assignedTo && fullName(a.assignedTo), a.assignedTo?.employeeId].filter(Boolean).join(' ').toLowerCase().includes(q.toLowerCase())
    })
    const byPerson = useMemo(() => {
        const map = new Map()
        assets.filter((a) => a.status === 'Assigned' && a.assignedTo).forEach((a) => {
            const k = a.assignedTo._id
            if (!map.has(k)) map.set(k, { person: a.assignedTo, items: [] })
            map.get(k).items.push(a)
        })
        return [...map.values()]
            .filter((g) => !q || `${fullName(g.person)} ${g.person.employeeId} ${g.items.map((i) => i.assetName).join(' ')}`.toLowerCase().includes(q.toLowerCase()))
            .sort((a, b) => fullName(a.person).localeCompare(fullName(b.person)))
    }, [assets, q])

    const act = (type2, id, payload, after) => new Promise((resolve) => {
        dispatch({ type: type2, id, payload, onDone: (ok, msg) => { toast[ok ? 'success' : 'error'](msg); if (ok) { setDialog(null); after?.() } resolve(ok) } })
    })
    const setStatus = (a, status) => act(assetActions.UPDATE_ASSET, a._id, { status })
    const remove = (a) => { if (window.confirm(`Remove ${a.assetName} (${a.assetTag}) from the register?`)) act(assetActions.DELETE_ASSET, a._id) }

    return (
        <PeopleShell title="Asset register" root={ASSET_ROOT} crumbs={[{ label: view === 'people' ? 'Assignments' : 'Register' }]}
            actions={<button type="button" className="pp-btn primary" onClick={() => setDialog({ kind: 'form', asset: null })}><i className="mdi mdi-plus"></i>Add asset</button>}>
            <ErrorBanner error={error} />

            <div className="as-stats">
                {[
                    ['mdi-package-variant', 'Total assets', assets.length, '#334155', 'all'],
                    ['mdi-account-check-outline', 'With employees', count('Assigned'), '#0284c7', 'Assigned'],
                    ['mdi-check-circle-outline', 'Available', count('Available'), '#059669', 'Available'],
                    ['mdi-alert-octagon-outline', 'Damaged', count('Damaged'), '#e11d48', 'Damaged'],
                ].map(([icon, label, n, color, t]) => (
                    <button key={label} type="button" className={`as-stat ${view === 'assets' && tab === t ? 'on' : ''}`} style={{ '--c': color }} onClick={() => { setView('assets'); setTab(t) }}>
                        <span><i className={`mdi ${icon}`}></i></span><b>{n}</b><small>{label}</small>
                    </button>
                ))}
            </div>

            <section className="pp-card as-board">
                <div className="as-toolbar">
                    <div className="as-views" role="tablist">
                        <button type="button" role="tab" aria-selected={view === 'assets'} className={view === 'assets' ? 'on' : ''} onClick={() => setView('assets')}><i className="mdi mdi-view-list-outline"></i>All assets</button>
                        <button type="button" role="tab" aria-selected={view === 'people'} className={view === 'people' ? 'on' : ''} onClick={() => setView('people')}><i className="mdi mdi-account-group-outline"></i>Who has what</button>
                    </div>
                    <div className="pp-search as-search"><i className="mdi mdi-magnify"></i><input type="search" className="pp-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={view === 'people' ? 'Search people or assets…' : 'Search name, tag, serial, person…'} /></div>
                    {view === 'assets' && (
                        <select className="pp-select" value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
                            <option value="">All types</option>
                            {ASSET_TYPES.map((t) => <option key={t.value} value={t.value}>{t.value}</option>)}
                        </select>
                    )}
                </div>
                {view === 'assets' && (
                    <div className="as-tabs">
                        {TABS.map(([k, l]) => <button key={k} type="button" className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}<b>{k === 'all' ? assets.length : count(k)}</b></button>)}
                    </div>
                )}

                {listLoading && !assets.length ? <div className="as-loading"><i className="mdi mdi-loading mdi-spin"></i></div> : view === 'assets' ? (
                    !filtered.length ? <EmptyState icon="mdi-package-variant-closed" title={assets.length ? 'Nothing matches' : 'No assets yet'} text={assets.length ? 'Try another filter.' : 'Add laptops, phones, ID cards and other equipment to start assigning them.'} /> : (
                        <ul className="as-list">
                            {filtered.map((a) => (
                                <li key={a._id} className={`as-row ${a.status === 'Retired' ? 'muted' : ''}`}>
                                    <AssetIcon type={a.assetType} size={44} />
                                    <div className="as-main">
                                        <div className="as-top"><b>{a.assetName}</b><span className="mya-tag small">{a.assetTag}</span><AssetStatus status={a.status === 'Returned' ? 'Available' : a.status} /></div>
                                        <small>{[a.assetType, [a.brand, a.model].filter(Boolean).join(' '), a.serialNumber && `S/N ${a.serialNumber}`].filter(Boolean).join(' · ')}</small>
                                    </div>
                                    <div className="as-holder">
                                        {a.status === 'Assigned' && a.assignedTo ? (
                                            <><Avatar person={a.assignedTo} size={30} /><span><b>{fullName(a.assignedTo)}</b><small>since {fmtDate(a.assignedDate)}</small></span></>
                                        ) : <span className="as-free"><Condition value={a.condition} /></span>}
                                    </div>
                                    <div className="as-actions">
                                        {['Available', 'Returned'].includes(a.status) && <button type="button" className="as-act assign" onClick={() => setDialog({ kind: 'assign', asset: a })}><i className="mdi mdi-account-arrow-right-outline"></i>Assign</button>}
                                        {a.status === 'Assigned' && <button type="button" className="as-act return" onClick={() => setDialog({ kind: 'return', asset: a })}><i className="mdi mdi-keyboard-return"></i>Take back</button>}
                                        <RowMenu asset={a} onEdit={() => setDialog({ kind: 'form', asset: a })} onHistory={() => setDialog({ kind: 'history', asset: a })} onStatus={(s) => setStatus(a, s)} onDelete={() => remove(a)} />
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )
                ) : (
                    !byPerson.length ? <EmptyState icon="mdi-account-off-outline" title="No assets are with employees" text="Assign an asset from All assets." /> : (
                        <div className="as-people-grid">
                            {byPerson.map((g) => (
                                <article key={g.person._id} className="as-person">
                                    <header><Avatar person={g.person} size={40} /><span><Link to={`/employees/${g.person._id}`}>{fullName(g.person)}</Link><small>{[g.person.employeeId, g.person.designation].filter(Boolean).join(' · ')}</small></span><b className="as-count">{g.items.length}</b></header>
                                    <ul>
                                        {g.items.map((a) => (
                                            <li key={a._id}>
                                                <AssetIcon type={a.assetType} size={32} />
                                                <span><b>{a.assetName}</b><small>{a.assetTag} · {since(a.assignedDate)}</small></span>
                                                <button type="button" className="as-act return sm" onClick={() => setDialog({ kind: 'return', asset: a })}><i className="mdi mdi-keyboard-return"></i>Take back</button>
                                            </li>
                                        ))}
                                    </ul>
                                </article>
                            ))}
                        </div>
                    )
                )}
            </section>

            {dialog?.kind === 'form' && <AssetForm asset={dialog.asset} onClose={() => setDialog(null)} onSave={(data) => (dialog.asset ? act(assetActions.UPDATE_ASSET, dialog.asset._id, data) : act(assetActions.ADD_ASSET, null, data))} />}
            {dialog?.kind === 'assign' && <AssignDialog asset={dialog.asset} people={people} onClose={() => setDialog(null)} onAssign={(employeeId, note) => act(assetActions.ASSIGN_ASSET, dialog.asset._id, { employeeId, note })} />}
            {dialog?.kind === 'return' && <ReturnDialog asset={dialog.asset} onClose={() => setDialog(null)} onReturn={(condition, note) => act(assetActions.RETURN_ASSET, dialog.asset._id, { condition, note })} />}
            {dialog?.kind === 'history' && <HistoryDialog asset={dialog.asset} onClose={() => setDialog(null)} />}
        </PeopleShell>
    )
}

const RowMenu = ({ asset, onEdit, onHistory, onStatus, onDelete }) => {
    const [open, setOpen] = useState(false)
    const free = asset.status !== 'Assigned'
    const item = (icon, label, fn, cls = '') => <button type="button" className={cls} onClick={() => { setOpen(false); fn() }}><i className={`mdi ${icon}`}></i>{label}</button>
    return (
        <div className="as-menu-wrap" onMouseLeave={() => setOpen(false)}>
            <button type="button" className="as-act icon" aria-label="More actions" onClick={() => setOpen((v) => !v)}><i className="mdi mdi-dots-vertical"></i></button>
            {open && (
                <div className="as-menu">
                    {item('mdi-pencil-outline', 'Edit details', onEdit)}
                    {item('mdi-history', 'Hand-over history', onHistory)}
                    {free && asset.status !== 'Available' && asset.status !== 'Returned' && item('mdi-check-circle-outline', 'Mark available', () => onStatus('Available'))}
                    {free && asset.status !== 'Damaged' && item('mdi-alert-octagon-outline', 'Mark damaged', () => onStatus('Damaged'))}
                    {free && asset.status !== 'Retired' && item('mdi-archive-outline', 'Retire', () => onStatus('Retired'))}
                    {free && !asset.history?.length && item('mdi-delete-outline', 'Delete', onDelete, 'danger')}
                </div>
            )}
        </div>
    )
}

const Modal = ({ title, icon, sub, onClose, children, footer }) => {
    useEffect(() => {
        const k = (e) => e.key === 'Escape' && onClose()
        window.addEventListener('keydown', k)
        return () => window.removeEventListener('keydown', k)
    }, [onClose])
    return (
        <div className="as-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
            <div className="as-dialog pp" role="dialog" aria-modal="true" aria-label={title}>
                <header className="as-dialog-head">{icon}<div><b>{title}</b>{sub && <small>{sub}</small>}</div><button type="button" className="as-x" onClick={onClose} aria-label="Close"><i className="mdi mdi-close"></i></button></header>
                <div className="as-dialog-body">{children}</div>
                {footer && <footer className="as-dialog-foot">{footer}</footer>}
            </div>
        </div>
    )
}

const AssetForm = ({ asset, onClose, onSave }) => {
    const d = (v) => (v ? String(v).slice(0, 10) : '')
    const [f, setF] = useState({ assetName: asset?.assetName || '', assetType: asset?.assetType || 'Laptop', brand: asset?.brand || '', model: asset?.model || '', serialNumber: asset?.serialNumber || '', condition: asset?.condition || 'New', purchaseDate: d(asset?.purchaseDate), warrantyUntil: d(asset?.warrantyUntil), notes: asset?.notes || '' })
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState('')
    const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target ? e.target.value : e }))
    const submit = async () => {
        if (!f.assetName.trim()) { setErr('Give the asset a name, e.g. “Dell Latitude 5440”.'); return }
        setBusy(true); setErr('')
        const ok = await onSave(f)
        if (!ok) setBusy(false)
    }
    return (
        <Modal title={asset ? `Edit ${asset.assetTag}` : 'Add an asset'} sub={asset ? asset.assetName : 'It gets an asset tag automatically'} icon={<AssetIcon type={f.assetType} size={40} />} onClose={onClose}
            footer={<><span className="as-err">{err}</span><button type="button" className="pp-btn" onClick={onClose}>Cancel</button><button type="button" className="pp-btn primary" disabled={busy} onClick={submit}><i className="mdi mdi-check"></i>{busy ? 'Saving…' : asset ? 'Save' : 'Add asset'}</button></>}>
            <span className="as-label">Type</span>
            <div className="as-types">
                {ASSET_TYPES.map((t) => (
                    <button key={t.value} type="button" className={`as-type ${f.assetType === t.value ? 'on' : ''}`} style={{ '--c': t.color }} onClick={() => set('assetType')(t.value)}><i className={`mdi ${t.icon}`}></i>{t.value}</button>
                ))}
            </div>
            <div className="as-form-grid">
                <label className="as-field wide"><span className="as-label">Name *</span><input className="pp-input" value={f.assetName} onChange={set('assetName')} placeholder="e.g. Dell Latitude 5440" autoFocus /></label>
                <label className="as-field"><span className="as-label">Brand</span><input className="pp-input" value={f.brand} onChange={set('brand')} placeholder="Dell" /></label>
                <label className="as-field"><span className="as-label">Model</span><input className="pp-input" value={f.model} onChange={set('model')} placeholder="Latitude 5440" /></label>
                <label className="as-field"><span className="as-label">Serial number</span><input className="pp-input as-mono" value={f.serialNumber} onChange={set('serialNumber')} /></label>
                <label className="as-field"><span className="as-label">Condition</span>
                    <select className="pp-select" value={f.condition} onChange={set('condition')}>{CONDITIONS.map((c) => <option key={c.value}>{c.value}</option>)}</select>
                </label>
                <label className="as-field"><span className="as-label">Purchase date</span><input type="date" className="pp-input" value={f.purchaseDate} onChange={set('purchaseDate')} /></label>
                <label className="as-field"><span className="as-label">Warranty until</span><input type="date" className="pp-input" value={f.warrantyUntil} onChange={set('warrantyUntil')} /></label>
                <label className="as-field wide"><span className="as-label">Notes</span><input className="pp-input" value={f.notes} onChange={set('notes')} placeholder="Optional — accessories included, location…" /></label>
            </div>
        </Modal>
    )
}

const AssignDialog = ({ asset, people, onAssign, onClose }) => {
    const [q, setQ] = useState('')
    const [picked, setPicked] = useState(null)
    const [note, setNote] = useState('')
    const [busy, setBusy] = useState(false)
    const list = people.filter((p) => !q || `${fullName(p)} ${p.employeeId} ${p.department || ''} ${p.designation || ''}`.toLowerCase().includes(q.toLowerCase())).slice(0, 60)
    const go = async () => { setBusy(true); const ok = await onAssign(picked, note); if (!ok) setBusy(false) }
    return (
        <Modal title={`Assign ${asset.assetName}`} sub={`${asset.assetTag}${asset.serialNumber ? ` · S/N ${asset.serialNumber}` : ''}`} icon={<AssetIcon type={asset.assetType} size={40} />} onClose={onClose}
            footer={<><button type="button" className="pp-btn" onClick={onClose}>Cancel</button><button type="button" className="pp-btn primary" disabled={!picked || busy} onClick={go}><i className="mdi mdi-account-arrow-right-outline"></i>{busy ? 'Assigning…' : 'Assign'}</button></>}>
            <div className="pp-search"><i className="mdi mdi-account-search-outline"></i><input autoFocus type="search" className="pp-input" placeholder="Search by name, ID, department…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <ul className="as-pick">
                {list.map((p) => (
                    <li key={p._id}><button type="button" className={picked === p._id ? 'on' : ''} onClick={() => setPicked(p._id)}>
                        <Avatar person={p} size={32} /><span><b>{fullName(p)}</b><small>{[p.employeeId, p.designation, p.department].filter(Boolean).join(' · ')}</small></span>
                        <i className="mdi mdi-check-circle as-pick-ic"></i>
                    </button></li>
                ))}
                {!list.length && <li className="as-none">No one matches.</li>}
            </ul>
            <label className="as-field"><span className="as-label">Note for the hand-over <small>optional</small></span><input className="pp-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. With charger and bag, for client fieldwork" maxLength={300} /></label>
        </Modal>
    )
}

const ReturnDialog = ({ asset, onReturn, onClose }) => {
    const [cond, setCond] = useState(asset.condition === 'New' ? 'Good' : asset.condition || 'Good')
    const [note, setNote] = useState('')
    const [busy, setBusy] = useState(false)
    const go = async () => { setBusy(true); const ok = await onReturn(cond, note); if (!ok) setBusy(false) }
    return (
        <Modal title={`Take back ${asset.assetName}`} sub={asset.assignedTo ? `From ${fullName(asset.assignedTo)} · had it since ${fmtDate(asset.assignedDate)}` : asset.assetTag} icon={<AssetIcon type={asset.assetType} size={40} />} onClose={onClose}
            footer={<><button type="button" className="pp-btn" onClick={onClose}>Cancel</button><button type="button" className="pp-btn primary" disabled={busy} onClick={go}><i className="mdi mdi-keyboard-return"></i>{busy ? 'Saving…' : 'Mark returned'}</button></>}>
            <span className="as-label">Condition on return</span>
            <div className="as-conds">
                {CONDITIONS.map((c) => <button key={c.value} type="button" className={cond === c.value ? 'on' : ''} style={{ '--c': c.color }} onClick={() => setCond(c.value)}>{c.value}</button>)}
            </div>
            {cond === 'Damaged' && <p className="as-hint warn"><i className="mdi mdi-alert-outline"></i>It will be set aside as Damaged and can't be assigned until you mark it available.</p>}
            <label className="as-field"><span className="as-label">Note <small>optional</small></span><input className="pp-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Charger missing, screen scratched" maxLength={300} /></label>
        </Modal>
    )
}

const HistoryDialog = ({ asset, onClose }) => {
    const h = [...(asset.history || [])].reverse()
    return (
        <Modal title={`${asset.assetName} — history`} sub={`${asset.assetTag}${asset.purchaseDate ? ` · bought ${fmtDate(asset.purchaseDate)}` : ''}`} icon={<AssetIcon type={asset.assetType} size={40} />} onClose={onClose}>
            {!h.length ? <p className="as-hint">This asset hasn't been assigned to anyone yet.</p> : (
                <ol className="as-timeline">
                    {h.map((e, i) => (
                        <li key={e._id || i} className={e.returnedAt ? '' : 'open'}>
                            <Avatar person={e.employee} size={34} />
                            <div>
                                <b>{e.employee ? fullName(e.employee) : 'Someone'}</b>
                                <small>{fmtDate(e.assignedAt)} → {e.returnedAt ? fmtDate(e.returnedAt) : <span className="as-now">has it now</span>}{e.assignedBy ? ` · given by ${fullName(e.assignedBy)}` : ''}</small>
                                {e.assignNote && <p>“{e.assignNote}”</p>}
                                {e.returnedAt && <p className="as-ret"><Condition value={e.returnCondition} />{e.returnedBy ? ` taken back by ${fullName(e.returnedBy)}` : ''}{e.returnNote ? ` — ${e.returnNote}` : ''}</p>}
                            </div>
                        </li>
                    ))}
                </ol>
            )}
        </Modal>
    )
}
