import React, { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useForm } from 'react-hook-form'
import { Link, useLocation } from 'react-router-dom'
import assetActions from '../../../redux/asset/Actions'
import employeeActions from '../../../redux/employee/Actions'
import { PeopleShell, Avatar, DeptTag, EmptyState, ErrorBanner, fullName, fmtDate } from '../../../components/people/PeopleUI'
import { ASSET_ROOT, ASSET_TYPES, ASSET_STATUS, AssetStatus, AssetIcon, assetTypeMeta, since } from '../../../components/asset/AssetUI'
import '../../../components/attendance/attendance.css'
import './AssetList.css'

const FORMER = ['Resigned', 'Terminated']
const BLANK = { assetName: '', assetType: '', serialNumber: '', notes: '' }

/* Pick who gets the asset — replaces typing a raw database ID into a prompt. */
const AssignDialog = ({ asset, people, onAssign, onClose }) => {
    const [q, setQ] = useState('')
    const [picked, setPicked] = useState(null)
    const list = people.filter((p) => !q || `${fullName(p)} ${p.employeeId} ${p.department || ''}`.toLowerCase().includes(q.toLowerCase())).slice(0, 50)
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])
    return (
        <div className="as-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
            <div className="pp-card as-dialog pp" role="dialog" aria-modal="true" aria-label={`Assign ${asset.assetName}`}>
                <div className="as-dialog-head">
                    <AssetIcon type={asset.assetType} size={40} />
                    <div><b>Assign {asset.assetName}</b><small>{asset.assetType}{asset.serialNumber ? ` · ${asset.serialNumber}` : ''}</small></div>
                </div>
                <div className="pp-card-body" style={{ paddingBottom: 8 }}>
                    <div className="pp-search">
                        <i className="mdi mdi-account-search-outline"></i>
                        <input autoFocus type="search" className="pp-input" placeholder="Search by name, ID or department…" value={q} onChange={(e) => setQ(e.target.value)} />
                    </div>
                    <ul className="as-people">
                        {list.map((p) => (
                            <li key={p._id}>
                                <button type="button" className={picked === p._id ? 'active' : ''} onClick={() => setPicked(p._id)} onDoubleClick={() => onAssign(p._id)}>
                                    <Avatar person={p} size={32} />
                                    <span><b>{fullName(p)}</b><small>{[p.employeeId, p.designation, p.department].filter(Boolean).join(' · ')}</small></span>
                                </button>
                            </li>
                        ))}
                        {!list.length && <li className="pp-muted-dash text-center py-3" style={{ fontSize: 13 }}>No one matches.</li>}
                    </ul>
                </div>
                <div className="as-dialog-foot">
                    <button type="button" className="pp-btn" onClick={onClose}>Cancel</button>
                    <button type="button" className="pp-btn primary" disabled={!picked} onClick={() => onAssign(picked)}><i className="mdi mdi-account-arrow-right-outline"></i> Assign</button>
                </div>
            </div>
        </div>
    )
}

export const AssetList = () => {
    const dispatch = useDispatch()
    const location = useLocation()
    const isAssignments = location.pathname.includes('assignments')
    const { list, listLoading, error } = useSelector((state) => state.assetReducer || {})
    const { list: employees } = useSelector((state) => state.employeeReducer || {})
    const { isAuthenticated: user } = useSelector((state) => state.authReducer || {})
    const isAdmin = ['Admin', 'HR'].includes(user?.role)
    const { register, handleSubmit, reset, formState: { errors } } = useForm({ defaultValues: BLANK })
    const [adding, setAdding] = useState(false)
    const [assigning, setAssigning] = useState(null)
    const [search, setSearch] = useState('')
    const [typeFilter, setTypeFilter] = useState('')
    const [statusFilter, setStatusFilter] = useState('')

    useEffect(() => {
        dispatch({ type: assetActions.GET_ASSETS })
        if (isAdmin) dispatch({ type: employeeActions.GET_EMPLOYEES })
    }, [dispatch, isAdmin])

    const onSubmit = (data) => {
        dispatch({ type: assetActions.ADD_ASSET, payload: data })
        reset(BLANK)
        setAdding(false)
    }

    const onAssign = (employeeId) => {
        dispatch({ type: assetActions.ASSIGN_ASSET, id: assigning._id, payload: { employeeId } })
        setAssigning(null)
    }
    const onReturn = (a) => {
        if (window.confirm(`Mark "${a.assetName}" as returned by ${fullName(a.assignedTo)}?`)) dispatch({ type: assetActions.RETURN_ASSET, id: a._id })
    }
    const onDelete = (a) => {
        if (window.confirm(`Remove "${a.assetName}" from the asset register? This can't be undone.`)) dispatch({ type: assetActions.DELETE_ASSET, id: a._id })
    }

    const all = useMemo(() => list || [], [list])
    const people = useMemo(() => (employees || []).filter((e) => !FORMER.includes(e.status)).sort((a, b) => fullName(a).localeCompare(fullName(b))), [employees])
    const counts = useMemo(() => Object.fromEntries(Object.keys(ASSET_STATUS).map((s) => [s, all.filter((a) => a.status === s).length])), [all])

    const rows = useMemo(() => {
        const q = search.trim().toLowerCase()
        return all
            .filter((a) => !typeFilter || a.assetType === typeFilter)
            .filter((a) => !statusFilter || a.status === statusFilter)
            .filter((a) => !q || `${a.assetName} ${a.serialNumber || ''} ${fullName(a.assignedTo)} ${a.notes || ''}`.toLowerCase().includes(q))
            .sort((a, b) => a.assetName.localeCompare(b.assetName))
    }, [all, typeFilter, statusFilter, search])

    // Assignments: admins see everyone grouped by holder; everyone else sees only their own.
    const holders = useMemo(() => {
        const map = new Map()
        all.filter((a) => a.status === 'Assigned' && a.assignedTo).forEach((a) => {
            const id = a.assignedTo._id || a.assignedTo
            if (!isAdmin && id !== user?._id) return
            if (!map.has(id)) map.set(id, { person: a.assignedTo, items: [] })
            map.get(id).items.push(a)
        })
        return [...map.values()].sort((x, y) => y.items.length - x.items.length || fullName(x.person).localeCompare(fullName(y.person)))
    }, [all, isAdmin, user])

    /* ======================== Assignments view ======================== */
    if (isAssignments) {
        const myView = !isAdmin
        const total = holders.reduce((s, h) => s + h.items.length, 0)
        return (
            <PeopleShell title={myView ? 'My assets' : 'Assignments'} root={ASSET_ROOT} crumbs={[{ label: myView ? 'My assets' : 'Assignments' }]} backTo="/assets"
                actions={<Link to="/assets" className="pp-btn"><i className="mdi mdi-format-list-bulleted"></i> Asset register</Link>}>
                <ErrorBanner error={error} />
                {!myView && (
                    <div className="at-tiles">
                        <div className="at-tile" style={{ '--c': '#0284c7' }}><span className="at-tile-icon"><i className="mdi mdi-account-check-outline"></i></span><div><b>{total}</b><span>Assets out with people</span></div></div>
                        <div className="at-tile" style={{ '--c': '#7c3aed' }}><span className="at-tile-icon"><i className="mdi mdi-account-group-outline"></i></span><div><b>{holders.length}</b><span>People holding assets</span></div></div>
                        <div className="at-tile" style={{ '--c': '#059669' }}><span className="at-tile-icon"><i className="mdi mdi-check-circle-outline"></i></span><div><b>{counts.Available}</b><span>Available to assign</span></div></div>
                    </div>
                )}
                {listLoading && !all.length ? (
                    <div className="pp-card pp-card-body"><div className="pp-skel" style={{ height: 120 }}></div></div>
                ) : !holders.length ? (
                    <div className="pp-card"><EmptyState icon="mdi-laptop" title={myView ? 'No assets assigned to you' : 'Nothing is assigned right now'}
                        text={myView ? 'Laptops, ID cards and other company items assigned to you will show here.' : 'Assign assets from the register.'}
                        action={!myView && <Link to="/assets" className="pp-btn primary">Open the register</Link>} /></div>
                ) : (
                    <div className="ag-grid">
                        {holders.map(({ person, items }) => (
                            <article key={person._id || fullName(person)} className="pp-card ag-card">
                                <div className="ag-head">
                                    <Avatar person={person} size={42} />
                                    <div>
                                        <Link to={`/employees/${person._id}`}>{fullName(person)}</Link>
                                        <small>{person.department ? <DeptTag name={person.department} /> : person.employeeId}</small>
                                    </div>
                                    <span className="ag-count">{items.length}</span>
                                </div>
                                {items.map((a) => (
                                    <div key={a._id} className="ag-item">
                                        <AssetIcon type={a.assetType} size={34} />
                                        <div className="ag-item-main">
                                            <b>{a.assetName}</b>
                                            <small>{a.serialNumber ? `${a.serialNumber} · ` : ''}since {fmtDate(a.assignedDate)} ({since(a.assignedDate)})</small>
                                        </div>
                                        {isAdmin && <button type="button" className="as-act return" onClick={() => onReturn(a)} title="Mark returned"><i className="mdi mdi-keyboard-return"></i></button>}
                                    </div>
                                ))}
                            </article>
                        ))}
                    </div>
                )}
            </PeopleShell>
        )
    }

    /* ======================== Register view ======================== */
    return (
        <PeopleShell title="Asset register" root={ASSET_ROOT} crumbs={[{ label: 'Register' }]}
            actions={<>
                <Link to="/assets/assignments" className="pp-btn"><i className="mdi mdi-account-group-outline"></i> {isAdmin ? 'Assignments' : 'My assets'}</Link>
                {isAdmin && !adding && <button type="button" className="pp-btn primary" onClick={() => setAdding(true)}><i className="mdi mdi-plus"></i> Add asset</button>}
            </>}>
            <ErrorBanner error={error} />

            <div className="at-tiles">
                <div className="at-tile" style={{ '--c': '#0b0f19' }}><span className="at-tile-icon"><i className="mdi mdi-package-variant-closed"></i></span><div><b>{all.length}</b><span>Total assets</span></div></div>
                {['Available', 'Assigned', 'Damaged'].map((s) => (
                    <button key={s} type="button" className={`at-tile ${statusFilter === s ? 'active' : ''}`} style={{ '--c': ASSET_STATUS[s].color }} onClick={() => setStatusFilter(statusFilter === s ? '' : s)} aria-pressed={statusFilter === s}>
                        <span className="at-tile-icon"><i className={`mdi ${ASSET_STATUS[s].icon}`}></i></span>
                        <div><b>{counts[s]}</b><span>{s}</span></div>
                    </button>
                ))}
            </div>

            {isAdmin && adding && (
                <form className="pp-card as-panel" onSubmit={handleSubmit(onSubmit)} noValidate>
                    <div className="pp-card-head">
                        <h3><i className="mdi mdi-plus-circle-outline me-2" style={{ color: '#0284c7' }}></i>Add asset</h3>
                        <button type="button" className="pp-btn icon ghost" onClick={() => { reset(BLANK); setAdding(false) }} aria-label="Close"><i className="mdi mdi-close"></i></button>
                    </div>
                    <div className="pp-card-body">
                        <label className="pp-label">Type<span className="req">*</span></label>
                        <div className="as-types" role="radiogroup" aria-label="Asset type">
                            {ASSET_TYPES.map((t) => (
                                <label key={t.value} style={{ '--c': t.color }}>
                                    <input type="radio" value={t.value} {...register('assetType', { required: 'Pick a type' })} />
                                    <span className="as-type"><i className={`mdi ${t.icon}`}></i>{t.value}</span>
                                </label>
                            ))}
                        </div>
                        {errors.assetType && <div className="pp-err" style={{ marginTop: -10, marginBottom: 12 }}>{errors.assetType.message}</div>}
                        <div className="as-fields">
                            <div className="pp-field">
                                <label className="pp-label">Name<span className="req">*</span></label>
                                <input type="text" placeholder="e.g. MacBook Air M3" className={`pp-input ${errors.assetName ? 'is-invalid' : ''}`} {...register('assetName', { required: 'Give it a name' })} />
                                {errors.assetName && <div className="pp-err">{errors.assetName.message}</div>}
                            </div>
                            <div className="pp-field">
                                <label className="pp-label">Serial number</label>
                                <input type="text" placeholder="Must be unique" className="pp-input" {...register('serialNumber')} />
                            </div>
                            <div className="pp-field">
                                <label className="pp-label">Notes</label>
                                <input type="text" placeholder="Condition, accessories…" className="pp-input" {...register('notes')} />
                            </div>
                        </div>
                        <div className="pj-form-foot">
                            <button type="button" className="pp-btn" onClick={() => { reset(BLANK); setAdding(false) }}>Cancel</button>
                            <button type="submit" className="pp-btn primary"><i className="mdi mdi-check"></i> Add asset</button>
                        </div>
                    </div>
                </form>
            )}

            <div className="as-toolbar">
                <div className="pp-search">
                    <i className="mdi mdi-magnify"></i>
                    <input type="search" className="pp-input" placeholder="Search name, serial, holder…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search assets" />
                </div>
                <div className="pj-filters">
                    {ASSET_TYPES.filter((t) => all.some((a) => a.assetType === t.value)).map((t) => (
                        <button key={t.value} type="button" className={`pj-filter ${typeFilter === t.value ? 'active' : ''}`} style={{ '--c': t.color }} onClick={() => setTypeFilter(typeFilter === t.value ? '' : t.value)}>
                            <i className={`mdi ${t.icon}`}></i>{t.value}
                        </button>
                    ))}
                </div>
                <div className="at-spacer"></div>
                <select className="pp-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status">
                    <option value="">All statuses</option>
                    {Object.keys(ASSET_STATUS).map((s) => <option key={s} value={s}>{s} ({counts[s]})</option>)}
                </select>
            </div>

            {listLoading && !all.length ? (
                <div className="pp-card pp-card-body">{[0, 1, 2].map((i) => <div key={i} className="pp-skel" style={{ height: 44, marginBottom: 12 }}></div>)}</div>
            ) : !rows.length ? (
                <div className="pp-card"><EmptyState icon="mdi-package-variant-closed" title={all.length ? 'No assets match' : 'No assets registered yet'}
                    text={all.length ? 'Try a different search, type or status.' : 'Add laptops, phones, ID cards and other company items to track who has what.'}
                    action={isAdmin && !all.length && <button type="button" className="pp-btn primary" onClick={() => setAdding(true)}><i className="mdi mdi-plus"></i> Add asset</button>} /></div>
            ) : (
                <div className="pp-card at-table-wrap">
                    <table className="at-table">
                        <thead>
                            <tr>
                                <th><i className="mdi mdi-package-variant-closed"></i>Asset</th>
                                <th className="hide-md"><i className="mdi mdi-barcode"></i>Serial</th>
                                <th><i className="mdi mdi-account-outline"></i>With</th>
                                <th className="hide-sm"><i className="mdi mdi-shield-check-outline"></i>Status</th>
                                {isAdmin && <th className="text-end">Actions</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((a) => (
                                <tr key={a._id}>
                                    <td>
                                        <div className="at-person">
                                            <AssetIcon type={a.assetType} size={38} />
                                            <div className="as-name"><b>{a.assetName}</b><small style={{ color: assetTypeMeta(a.assetType).color, fontWeight: 600, fontSize: 12 }}>{a.assetType}</small></div>
                                        </div>
                                    </td>
                                    <td className="hide-md"><span className="as-serial">{a.serialNumber || '—'}</span></td>
                                    <td>
                                        {a.assignedTo ? (
                                            <div className="as-holder"><Avatar person={a.assignedTo} size={28} /><div><b>{fullName(a.assignedTo)}</b><small>{a.assignedDate ? `for ${since(a.assignedDate)}` : ''}</small></div></div>
                                        ) : <span className="pp-muted-dash">{a.notes || 'In stock'}</span>}
                                    </td>
                                    <td className="hide-sm"><AssetStatus status={a.status} /></td>
                                    {isAdmin && (
                                        <td>
                                            <div className="as-actions">
                                                {a.status === 'Assigned'
                                                    ? <button type="button" className="as-act return" onClick={() => onReturn(a)}><i className="mdi mdi-keyboard-return"></i><span className="hide-md">Return</span></button>
                                                    : !['Retired', 'Damaged'].includes(a.status) && <button type="button" className="as-act assign" onClick={() => setAssigning(a)}><i className="mdi mdi-account-arrow-right-outline"></i><span className="hide-md">Assign</span></button>}
                                                <button type="button" className="as-act del" onClick={() => onDelete(a)} title="Delete" aria-label={`Delete ${a.assetName}`}><i className="mdi mdi-trash-can-outline"></i></button>
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {assigning && <AssignDialog asset={assigning} people={people} onAssign={onAssign} onClose={() => setAssigning(null)} />}
        </PeopleShell>
    )
}
