import React, { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import employeeActions from '../../redux/employee/Actions'
import departmentActions from '../../redux/department/Actions'
import { PeopleShell, Avatar, StatusPill, DeptTag, EmptyState, ErrorBanner, deptColor, fullName } from './PeopleUI'
import './OrgUnitList.css'

/* -------------------------------------------------------------------------- */
/*  One screen, two configs: Departments and Designations share the same      */
/*  table, headcount, search and add/edit panel — only the fields differ.     */
/* -------------------------------------------------------------------------- */

const FORMER = ['Resigned', 'Terminated']

export const OrgUnitList = ({ config }) => {
    const dispatch = useDispatch()
    const { list, listLoading, error } = useSelector((state) => state[config.reducer] || {})
    const { list: employees } = useSelector((state) => state.employeeReducer || {})
    const { list: departments } = useSelector((state) => state.departmentReducer || {})
    const { isAuthenticated: user } = useSelector((state) => state.authReducer || {})
    const isAdmin = user?.role === 'Admin'
    const [editingId, setEditingId] = useState(null)
    const [formOpen, setFormOpen] = useState(false)
    const [search, setSearch] = useState('')
    const { register, handleSubmit, reset, formState: { errors } } = useForm()

    useEffect(() => {
        dispatch({ type: config.actions.GET })
        dispatch({ type: employeeActions.GET_EMPLOYEES })
        if (config.needsDepartments) dispatch({ type: departmentActions.GET_DEPARTMENTS })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dispatch])

    const blank = config.blank

    const onSubmit = (data) => {
        if (editingId) dispatch({ type: config.actions.UPDATE, id: editingId, payload: data })
        else dispatch({ type: config.actions.ADD, payload: data })
        reset(blank)
        setEditingId(null)
        setFormOpen(false)
    }

    const onAdd = () => { setEditingId(null); reset(blank); setFormOpen(true) }

    const onEdit = (item) => {
        setEditingId(item._id)
        reset(config.toForm(item))
        setFormOpen(true)
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    const onCancel = () => { setEditingId(null); reset(blank); setFormOpen(false) }

    const onRemove = (item) => {
        const count = membersOf(item).length
        const warn = count ? ` ${count} employee${count === 1 ? ' is' : 's are'} still assigned to it.` : ''
        if (window.confirm(`Delete ${config.singular.toLowerCase()} "${item.name}"?${warn}`)) {
            dispatch({ type: config.actions.DELETE, id: item._id })
        }
    }

    // Current (not former) employees in each unit, matched by name like the employee record stores it.
    const active = useMemo(() => (employees || []).filter((e) => !FORMER.includes(e.status)), [employees])
    const membersOf = (item) => active.filter((e) => e[config.employeeField] === item.name)

    const rows = useMemo(() => {
        const q = search.trim().toLowerCase()
        return (list || [])
            .map((item) => ({ item, members: active.filter((e) => e[config.employeeField] === item.name) }))
            .filter(({ item }) => !q || `${item.name} ${item.code || ''} ${item.department || ''} ${item.description || ''}`.toLowerCase().includes(q))
            .sort((a, b) => b.members.length - a.members.length || a.item.name.localeCompare(b.item.name))
    }, [list, active, search, config.employeeField])

    const maxHead = Math.max(1, ...rows.map((r) => r.members.length))

    const stats = useMemo(() => {
        const all = (list || []).map((item) => ({ item, n: active.filter((e) => e[config.employeeField] === item.name).length }))
        const largest = [...all].sort((a, b) => b.n - a.n)[0]
        return {
            total: all.length,
            activeUnits: (list || []).filter((i) => i.status !== 'Inactive').length,
            assigned: all.reduce((s, r) => s + r.n, 0),
            unassigned: active.filter((e) => !e[config.employeeField]).length,
            largest: largest && largest.n ? largest.item.name : '—',
        }
    }, [list, active, config.employeeField])

    return (
        <PeopleShell
            title={config.title}
            subtitle={config.subtitle}
            crumbs={[{ label: config.title }]}
            backTo="/employees"
            actions={isAdmin && !formOpen && (
                <button type="button" className="pp-btn primary" onClick={onAdd}><i className="mdi mdi-plus"></i> Add {config.singular.toLowerCase()}</button>
            )}
        >
            <ErrorBanner error={error} />

            <section className="pp-card ou-strip" aria-label="Summary">
                <div className="ou-stat" style={{ '--c': config.color }}>
                    <span className="ou-stat-icon"><i className={`mdi ${config.icon}`}></i></span>
                    <div><b>{stats.total}</b><span>{config.title}</span></div>
                </div>
                <div className="ou-stat" style={{ '--c': '#10b981' }}>
                    <span className="ou-stat-icon"><i className="mdi mdi-account-group-outline"></i></span>
                    <div><b>{stats.assigned}</b><span>People assigned</span></div>
                </div>
                <div className="ou-stat" style={{ '--c': '#f59e0b' }}>
                    <span className="ou-stat-icon"><i className="mdi mdi-trophy-outline"></i></span>
                    <div><b title={stats.largest}>{stats.largest}</b><span>Largest</span></div>
                </div>
                <div className="ou-stat" style={{ '--c': '#f43f5e' }}>
                    <span className="ou-stat-icon"><i className="mdi mdi-account-question-outline"></i></span>
                    <div><b>{stats.unassigned}</b><span>People without one</span></div>
                </div>
            </section>

            {isAdmin && formOpen && (
                <form className="pp-card ou-form" onSubmit={handleSubmit(onSubmit)} noValidate>
                    <div className="pp-card-head">
                        <h3><i className={`mdi ${editingId ? 'mdi-pencil-outline' : 'mdi-plus-circle-outline'}`}></i>{editingId ? `Edit ${config.singular.toLowerCase()}` : `New ${config.singular.toLowerCase()}`}</h3>
                        <button type="button" className="pp-btn icon ghost" onClick={onCancel} aria-label="Close"><i className="mdi mdi-close"></i></button>
                    </div>
                    <div className="pp-card-body">
                        <div className="ou-form-fields">
                            <div className="pp-field">
                                <label className="pp-label">Name<span className="req">*</span></label>
                                <input type="text" autoFocus placeholder={config.namePlaceholder} className={`pp-input ${errors.name ? 'is-invalid' : ''}`} {...register('name', { required: 'Name is required' })} />
                                {errors.name && <div className="pp-err">{errors.name.message}</div>}
                            </div>
                            {config.secondField === 'code' ? (
                                <div className="pp-field">
                                    <label className="pp-label">Code</label>
                                    <input type="text" placeholder="e.g. ENG" className="pp-input" {...register('code')} />
                                </div>
                            ) : (
                                <div className="pp-field">
                                    <label className="pp-label">Department</label>
                                    <select className="pp-select" {...register('department')}>
                                        <option value="">Any department</option>
                                        {departments?.map((d) => <option key={d._id} value={d.name}>{d.name}</option>)}
                                    </select>
                                </div>
                            )}
                            <div className="pp-field">
                                <label className="pp-label">Description</label>
                                <input type="text" placeholder="What does this cover?" className="pp-input" {...register('description')} />
                            </div>
                        </div>
                        <div className="ou-form-foot">
                            <button type="button" className="pp-btn" onClick={onCancel}>Cancel</button>
                            <button type="submit" className="pp-btn primary"><i className="mdi mdi-check"></i> {editingId ? 'Save changes' : `Add ${config.singular.toLowerCase()}`}</button>
                        </div>
                    </div>
                </form>
            )}

            <div className="ou-toolbar">
                <div className="pp-search">
                    <i className="mdi mdi-magnify"></i>
                    <input type="search" className="pp-input" placeholder={`Search ${config.title.toLowerCase()}…`} value={search} onChange={(e) => setSearch(e.target.value)} aria-label={`Search ${config.title.toLowerCase()}`} />
                </div>
            </div>

            {listLoading && !(list || []).length ? (
                <div className="pp-card pp-card-body">
                    {[0, 1, 2, 3].map((i) => <div key={i} className="pp-skel" style={{ height: 44, marginBottom: 12 }}></div>)}
                </div>
            ) : !(list || []).length ? (
                <div className="pp-card">
                    <EmptyState icon={config.icon} title={`No ${config.title.toLowerCase()} yet`} text={config.emptyText}
                        action={isAdmin && <button type="button" className="pp-btn primary" onClick={onAdd}><i className="mdi mdi-plus"></i> Add {config.singular.toLowerCase()}</button>} />
                </div>
            ) : !rows.length ? (
                <div className="pp-card"><EmptyState title="No matches" text="Try a different search." action={<button type="button" className="pp-btn" onClick={() => setSearch('')}>Clear search</button>} /></div>
            ) : (
                <div className="pp-card ou-table-wrap">
                    <table className="ou-table">
                        <thead>
                            <tr>
                                <th><i className={`mdi ${config.icon}`}></i>{config.singular}</th>
                                {config.secondField === 'department' && <th className="hide-md"><i className="mdi mdi-office-building-outline"></i>Department</th>}
                                <th className="hide-lg"><i className="mdi mdi-text-box-outline"></i>Description</th>
                                <th><i className="mdi mdi-account-group-outline"></i>Headcount</th>
                                <th className="hide-sm"><i className="mdi mdi-shield-check-outline"></i>Status</th>
                                {isAdmin && <th className="text-end">Actions</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(({ item, members }) => {
                                const color = deptColor(config.secondField === 'department' ? item.department || item.name : item.name)
                                return (
                                    <tr key={item._id} className={editingId === item._id ? 'is-editing' : ''} style={{ '--tag': color }}>
                                        <td>
                                            <div className="ou-name">
                                                <span className="ou-icon"><i className={`mdi ${config.icon}`}></i></span>
                                                <div>
                                                    <b>{item.name}</b>
                                                    {item.code && <span className="ou-code">{item.code}</span>}
                                                </div>
                                            </div>
                                        </td>
                                        {config.secondField === 'department' && <td className="hide-md"><DeptTag name={item.department} /></td>}
                                        <td className="hide-lg"><span className="ou-desc">{item.description || <span className="pp-muted-dash">No description</span>}</span></td>
                                        <td>
                                            <div className="ou-head" title={members.map(fullName).join(', ')}>
                                                <span className="ou-head-num">{members.length}</span>
                                                <span className="ou-head-bar"><span style={{ width: `${(members.length / maxHead) * 100}%` }}></span></span>
                                                {members.length > 0 && (
                                                    <span className="ou-stack">
                                                        {members.slice(0, 4).map((m) => <Avatar key={m._id} person={m} size={28} />)}
                                                        {members.length > 4 && <span className="ou-more">+{members.length - 4}</span>}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="hide-sm"><StatusPill status={item.status || 'Active'} /></td>
                                        {isAdmin && (
                                            <td>
                                                <div className="ou-actions">
                                                    {config.secondField === 'code' && members.length > 0 && (
                                                        <Link to="/employees" state={{ department: item.name }} className="ou-act view" title="View people" aria-label={`View people in ${item.name}`}>
                                                            <i className="mdi mdi-account-search-outline"></i>
                                                        </Link>
                                                    )}
                                                    <button type="button" className="ou-act edit" onClick={() => onEdit(item)} title="Edit" aria-label={`Edit ${item.name}`}><i className="mdi mdi-pencil-outline"></i></button>
                                                    <button type="button" className="ou-act remove" onClick={() => onRemove(item)} title="Delete" aria-label={`Delete ${item.name}`}><i className="mdi mdi-trash-can-outline"></i></button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </PeopleShell>
    )
}
