import React, { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useForm } from 'react-hook-form'
import branchActions from '../../../redux/branch/Actions'
import employeeActions from '../../../redux/employee/Actions'
import { PeopleShell, StatusPill, EmptyState, ErrorBanner, deptColor } from '../../../components/people/PeopleUI'
import { AvatarStack } from '../../../components/projects/ProjectUI'
import '../../../components/attendance/attendance.css'
import '../../../components/settings/settings.css'

const SETTINGS_ROOT = { label: 'Settings', to: '/settings/company' }
const BLANK = { name: '', address: '', city: '', country: '' }
const FORMER = ['Resigned', 'Terminated']

export const BranchList = () => {
    const dispatch = useDispatch()
    const { list, error } = useSelector((state) => state.branchReducer || {})
    const { list: employees } = useSelector((state) => state.employeeReducer || {})
    const { isAuthenticated: user } = useSelector((state) => state.authReducer || {})
    const isAdmin = user?.role === 'Admin'
    const [editingId, setEditingId] = useState(null)
    const [open, setOpen] = useState(false)
    const { register, handleSubmit, reset, formState: { errors } } = useForm({ defaultValues: BLANK })

    useEffect(() => {
        dispatch({ type: branchActions.GET_BRANCHES })
        dispatch({ type: employeeActions.GET_EMPLOYEES })
    }, [dispatch])

    const onSubmit = (data) => {
        if (editingId) dispatch({ type: branchActions.UPDATE_BRANCH, id: editingId, payload: data })
        else dispatch({ type: branchActions.ADD_BRANCH, payload: data })
        reset(BLANK)
        setEditingId(null)
        setOpen(false)
    }

    const onEdit = (b) => {
        setEditingId(b._id)
        reset({ name: b.name, address: b.address, city: b.city, country: b.country })
        setOpen(true)
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    const onCancel = () => { setEditingId(null); reset(BLANK); setOpen(false) }

    const membersOf = (b) => (employees || []).filter((e) => !FORMER.includes(e.status) && (e.branch?._id || e.branch) === b._id)

    const onRemove = (b) => {
        const n = membersOf(b).length
        if (window.confirm(`Delete branch "${b.name}"?${n ? ` ${n} employee${n === 1 ? ' is' : 's are'} still linked to it.` : ''}`)) {
            dispatch({ type: branchActions.DELETE_BRANCH, id: b._id })
        }
    }

    const all = useMemo(() => list || [], [list])
    const cities = new Set(all.map((b) => b.city).filter(Boolean)).size
    const countries = new Set(all.map((b) => b.country).filter(Boolean)).size
    const placed = (employees || []).filter((e) => !FORMER.includes(e.status) && e.branch).length

    return (
        <PeopleShell title="Branches" root={SETTINGS_ROOT} crumbs={[{ label: 'Branches' }]}
            actions={isAdmin && !open && <button type="button" className="pp-btn primary" onClick={() => setOpen(true)}><i className="mdi mdi-plus"></i> Add branch</button>}>
            <ErrorBanner error={error} />

            <div className="at-tiles">
                <div className="at-tile" style={{ '--c': '#0284c7' }}><span className="at-tile-icon"><i className="mdi mdi-office-building-marker-outline"></i></span><div><b>{all.length}</b><span>Branches</span></div></div>
                <div className="at-tile" style={{ '--c': '#7c3aed' }}><span className="at-tile-icon"><i className="mdi mdi-city-variant-outline"></i></span><div><b>{cities}</b><span>Cities</span></div></div>
                <div className="at-tile" style={{ '--c': '#059669' }}><span className="at-tile-icon"><i className="mdi mdi-earth"></i></span><div><b>{countries}</b><span>Countries</span></div></div>
                <div className="at-tile" style={{ '--c': '#d97706' }}><span className="at-tile-icon"><i className="mdi mdi-account-group-outline"></i></span><div><b>{placed}</b><span>People with a branch</span></div></div>
            </div>

            {isAdmin && open && (
                <form className="pp-card st-panel" onSubmit={handleSubmit(onSubmit)} noValidate>
                    <div className="pp-card-head">
                        <h3><i className={`mdi ${editingId ? 'mdi-pencil-outline' : 'mdi-map-marker-plus-outline'} me-2`} style={{ color: '#0284c7' }}></i>{editingId ? 'Edit branch' : 'New branch'}</h3>
                        <button type="button" className="pp-btn icon ghost" onClick={onCancel} aria-label="Close"><i className="mdi mdi-close"></i></button>
                    </div>
                    <div className="pp-card-body">
                        <div className="st-fields">
                            <div className="pp-field">
                                <label className="pp-label">Name<span className="req">*</span></label>
                                <input type="text" autoFocus placeholder="e.g. Chennai HQ" className={`pp-input ${errors.name ? 'is-invalid' : ''}`} {...register('name', { required: 'Give the branch a name' })} />
                                {errors.name && <div className="pp-err">{errors.name.message}</div>}
                            </div>
                            <div className="pp-field"><label className="pp-label">Address</label><input type="text" placeholder="Street, area" className="pp-input" {...register('address')} /></div>
                            <div className="pp-field"><label className="pp-label">City</label><input type="text" className="pp-input" {...register('city')} /></div>
                            <div className="pp-field"><label className="pp-label">Country</label><input type="text" className="pp-input" {...register('country')} /></div>
                        </div>
                        <div className="st-foot">
                            <button type="button" className="pp-btn" onClick={onCancel}>Cancel</button>
                            <button type="submit" className="pp-btn primary"><i className="mdi mdi-check"></i> {editingId ? 'Save changes' : 'Add branch'}</button>
                        </div>
                    </div>
                </form>
            )}

            {!all.length ? (
                <div className="pp-card"><EmptyState icon="mdi-office-building-marker-outline" title="No branches yet" text="Add your offices and locations so people can be assigned to them."
                    action={isAdmin && !open && <button type="button" className="pp-btn primary" onClick={() => setOpen(true)}><i className="mdi mdi-plus"></i> Add branch</button>} /></div>
            ) : (
                <div className="br-grid">
                    {all.map((b) => {
                        const color = deptColor(b.name)
                        const members = membersOf(b)
                        const mapQuery = [b.address, b.city, b.country].filter(Boolean).join(', ')
                        return (
                            <article key={b._id} className={`pp-card br-card ${editingId === b._id ? 'editing' : ''}`} style={{ '--c': color }}>
                                <div className="br-top">
                                    <span className="st-icon" style={{ '--c': color, width: 44, height: 44, fontSize: 22 }}><i className="mdi mdi-office-building-marker-outline"></i></span>
                                    <div style={{ minWidth: 0 }}>
                                        <h3>{b.name}</h3>
                                        <div className="br-addr">{b.address || 'No street address'}</div>
                                    </div>
                                </div>
                                <div className="br-tags">
                                    {b.city && <span className="pp-chip"><i className="mdi mdi-city-variant-outline"></i>{b.city}</span>}
                                    {b.country && <span className="pp-chip"><i className="mdi mdi-earth"></i>{b.country}</span>}
                                    <StatusPill status={b.status || 'Active'} />
                                </div>
                                <div className="br-foot">
                                    {members.length ? <AvatarStack people={members} max={4} size={26} /> : null}
                                    <span><b>{members.length}</b> {members.length === 1 ? 'person' : 'people'}</span>
                                    <div className="actions">
                                        {mapQuery && <a className="st-act map" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`} target="_blank" rel="noreferrer" title="Open in Maps" aria-label={`Open ${b.name} in Maps`}><i className="mdi mdi-map-outline"></i></a>}
                                        {isAdmin && <button type="button" className="st-act edit" onClick={() => onEdit(b)} title="Edit" aria-label={`Edit ${b.name}`}><i className="mdi mdi-pencil-outline"></i></button>}
                                        {isAdmin && <button type="button" className="st-act del" onClick={() => onRemove(b)} title="Delete" aria-label={`Delete ${b.name}`}><i className="mdi mdi-trash-can-outline"></i></button>}
                                    </div>
                                </div>
                            </article>
                        )
                    })}
                </div>
            )}
        </PeopleShell>
    )
}
