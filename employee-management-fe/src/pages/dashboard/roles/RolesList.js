import React, { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import roleActions from '../../../redux/role/Actions'
import { PeopleShell, EmptyState, ErrorBanner } from '../../../components/people/PeopleUI'
import '../../../components/settings/settings.css'

const SETTINGS_ROOT = { label: 'Settings', to: '/settings/company' }

const ROLE_META = {
    Admin: { color: '#0b0f19', icon: 'mdi-shield-star-outline' },
    HR: { color: '#7c3aed', icon: 'mdi-account-heart-outline' },
    Manager: { color: '#0284c7', icon: 'mdi-account-tie-outline' },
    'Team Lead': { color: '#0d9488', icon: 'mdi-account-star-outline' },
    Employee: { color: '#d97706', icon: 'mdi-account-outline' },
}

// Friendly label + icon for each permission module the backend knows about.
const MODULE_META = {
    employees: ['Employees', 'mdi-account-group-outline', '#0284c7'],
    departments: ['Departments', 'mdi-office-building-outline', '#0284c7'],
    designations: ['Designations', 'mdi-badge-account-horizontal-outline', '#0284c7'],
    branches: ['Branches', 'mdi-office-building-marker-outline', '#0284c7'],
    attendance: ['Attendance', 'mdi-clock-check-outline', '#059669'],
    leave: ['Leave', 'mdi-beach', '#7c3aed'],
    projects: ['Projects', 'mdi-folder-outline', '#0d9488'],
    tasks: ['Tasks', 'mdi-format-list-checks', '#0d9488'],
    payroll: ['Payroll', 'mdi-cash-multiple', '#0b0f19'],
    expenses: ['Expenses', 'mdi-receipt', '#ea580c'],
    assets: ['Assets', 'mdi-laptop', '#2563eb'],
    helpdesk: ['HR Helpdesk', 'mdi-lifebuoy', '#e11d48'],
    announcements: ['Announcements', 'mdi-bullhorn-outline', '#d97706'],
    reports: ['Reports', 'mdi-chart-bar', '#db2777'],
    settings: ['Settings', 'mdi-cog-outline', '#475569'],
    roles: ['Roles', 'mdi-shield-key-outline', '#475569'],
    'audit-logs': ['Audit logs', 'mdi-history', '#475569'],
}
const moduleMeta = (m) => MODULE_META[m] || [m, 'mdi-puzzle-outline', '#64748b']
const sameSet = (a = [], b = []) => a.length === b.length && a.every((x) => b.includes(x))

export const RolesList = () => {
    const dispatch = useDispatch()
    const { list, allPermissions, error } = useSelector((state) => state.roleReducer || {})
    const { isAuthenticated: user } = useSelector((state) => state.authReducer || {})
    const isAdmin = user?.role === 'Admin'
    const [draft, setDraft] = useState({})

    useEffect(() => {
        dispatch({ type: roleActions.GET_ROLES })
    }, [dispatch])

    useEffect(() => {
        const next = {}
        list?.forEach((r) => { next[r.role] = r.permissions })
        setDraft(next)
    }, [list])

    const togglePermission = (role, perm) => {
        setDraft((prev) => {
            const current = prev[role] || []
            return { ...prev, [role]: current.includes(perm) ? current.filter((p) => p !== perm) : [...current, perm] }
        })
    }

    const setAll = (role, on) => setDraft((prev) => ({ ...prev, [role]: on ? [...(allPermissions || [])] : [] }))
    const onReset = (r) => setDraft((prev) => ({ ...prev, [r.role]: r.permissions }))
    const onSave = (role) => dispatch({ type: roleActions.UPDATE_ROLE_PERMISSIONS, role, permissions: draft[role] || [] })

    if (!isAdmin) {
        return (
            <PeopleShell title="Roles & permissions" root={SETTINGS_ROOT} crumbs={[{ label: 'Roles & permissions' }]}>
                <div className="pp-card"><EmptyState icon="mdi-lock-outline" title="Admins only" text="Only Admin can view or change role permissions." /></div>
            </PeopleShell>
        )
    }

    const total = allPermissions?.length || 0

    return (
        <PeopleShell title="Roles & permissions" root={SETTINGS_ROOT} crumbs={[{ label: 'Roles & permissions' }]}>
            <ErrorBanner error={error} />

            <div className="rl-note">
                <i className="mdi mdi-information-outline"></i>
                <span>Choose which areas each role can open. Changes apply within a few seconds of saving. Admin always keeps full access to manage the system.</span>
            </div>

            {!list?.length ? (
                <div className="pp-card pp-card-body"><div className="pp-skel" style={{ height: 200 }}></div></div>
            ) : (
                <div className="rl-grid">
                    {list.map((r) => {
                        const m = ROLE_META[r.role] || { color: '#64748b', icon: 'mdi-account-outline' }
                        const perms = draft[r.role] || []
                        const dirty = !sameSet(perms, r.permissions)
                        return (
                            <article key={r.role} className={`pp-card rl-card ${dirty ? 'dirty' : ''}`} style={{ '--c': m.color }}>
                                <div className="rl-head">
                                    <span className="st-icon" style={{ '--c': m.color, width: 42, height: 42, fontSize: 21 }}><i className={`mdi ${m.icon}`}></i></span>
                                    <div>
                                        <h3>{r.role}</h3>
                                        <small>{r.employeeCount} {r.employeeCount === 1 ? 'person' : 'people'}</small>
                                    </div>
                                    <span className="rl-count"><b>{perms.length}</b> / {total} areas</span>
                                </div>
                                <div className="rl-perms">
                                    {(allPermissions || []).map((perm) => {
                                        const [label, icon, color] = moduleMeta(perm)
                                        const on = perms.includes(perm)
                                        return (
                                            <label key={perm} className={`rl-perm ${on ? 'on' : ''}`} style={{ '--m': color }}>
                                                <input type="checkbox" checked={on} onChange={() => togglePermission(r.role, perm)} />
                                                <i className={`mdi ${icon}`}></i>
                                                <span>{label}</span>
                                                <span className="rl-switch" aria-hidden="true"></span>
                                            </label>
                                        )
                                    })}
                                </div>
                                <div className={`rl-foot ${dirty ? 'dirty' : ''}`}>
                                    <div className="rl-quick">
                                        <button type="button" className="pp-btn sm ghost" onClick={() => setAll(r.role, true)}>All</button>
                                        <button type="button" className="pp-btn sm ghost" onClick={() => setAll(r.role, false)}>None</button>
                                    </div>
                                    <span>{dirty ? 'Unsaved changes' : 'Saved'}</span>
                                    <div className="rl-quick">
                                        {dirty && <button type="button" className="pp-btn sm" onClick={() => onReset(r)}>Undo</button>}
                                        <button type="button" className="pp-btn sm primary" disabled={!dirty} onClick={() => onSave(r.role)}><i className="mdi mdi-content-save-outline"></i> Save</button>
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
