import React, { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import accessActions from '../../../redux/access/Actions'
import { PeopleShell, Avatar, EmptyState, ErrorBanner, fullName } from '../../../components/people/PeopleUI'
import { SENSITIVE_MODULES, keyMeta } from '../../../components/settings/modules'
import '../../../components/settings/settings.css'
import './AccessControl.css'
import { confirmAction } from '../../../components/common/ConfirmDialog'

const SETTINGS_ROOT = { label: 'Settings', to: '/settings/company' }
const ROLES = ['HR', 'Manager', 'Team Lead', 'Employee']
const sameSet = (a = [], b = []) => a.length === b.length && a.every((x) => b.includes(x))
const label = (m) => keyMeta(m)[0]
const help = (m) => keyMeta(m)[3]
// Screens first (what someone can open), then manage/approve modules (what they can change).
const sectionsOf = (data) => [
    { title: 'Screens they can open', hint: 'Shows the menu item and page', keys: data.screens || [] },
    { title: 'Manage & approve', hint: 'Lets them add, change or approve', keys: data.modules },
]

// granting pay / access modules is sensitive: ask before saving (resolves true when nothing risky is added)
const confirmSensitive = async (mods, who) => {
    const risky = mods.filter((m) => SENSITIVE_MODULES.includes(m))
    return !risky.length || confirmAction({ title: 'Grant sensitive access?', message: `${who} will be able to use these — including changing pay or access:`, details: risky.map(label), confirmLabel: 'Grant access', tone: 'warn' })
}

const ModuleIcon = ({ m }) => {
    const [, icon, color] = keyMeta(m)
    return <span className="ac-mod-icon" style={{ '--m': color }}><i className={`mdi ${icon}`}></i></span>
}

/* ------------------------------- by role ------------------------------- */
const RolesTab = ({ data, saving }) => {
    const dispatch = useDispatch()
    const [draft, setDraft] = useState({})
    useEffect(() => { setDraft(Object.fromEntries(ROLES.map((r) => [r, data.roles[r] || []]))) }, [data])
    const changed = ROLES.filter((r) => !sameSet(draft[r], data.roles[r] || []))
    const toggle = (r, m) => setDraft((d) => ({ ...d, [r]: d[r]?.includes(m) ? d[r].filter((x) => x !== m) : [...(d[r] || []), m] }))
    const save = async () => {
        const added = changed.flatMap((r) => (draft[r] || []).filter((m) => !(data.roles[r] || []).includes(m)))
        if (!(await confirmSensitive([...new Set(added)], 'These roles'))) return
        dispatch({ type: accessActions.SAVE_ROLE_ACCESS, roles: Object.fromEntries(changed.map((r) => [r, draft[r]])) })
    }

    return (
        <>
            <p className="ac-intro">The base access for everyone with that role. Admin always has everything.</p>
            <div className="ac-matrix-wrap">
                <table className="ac-matrix">
                    <thead>
                        <tr><th>Screen / module</th><th className="ac-col">Admin</th>{ROLES.map((r) => <th key={r} className="ac-col">{r}</th>)}</tr>
                    </thead>
                    <tbody>
                        {sectionsOf(data).flatMap((sec) => [
                            <tr key={sec.title} className="ac-section-row"><td colSpan={ROLES.length + 2}>{sec.title}<small>{sec.hint}</small></td></tr>,
                            ...sec.keys.map((m) => (
                            <tr key={m}>
                                <td><div className="ac-mod"><ModuleIcon m={m} /><span><b>{label(m)}</b><small>{help(m)}</small></span></div></td>
                                <td className="ac-col"><i className="mdi mdi-check-bold ac-locked" title="Admin always has access"></i></td>
                                {ROLES.map((r) => (
                                    <td key={r} className="ac-col">
                                        <label className={`ac-check ${draft[r]?.includes(m) ? 'on' : ''}`}>
                                            <input type="checkbox" checked={!!draft[r]?.includes(m)} onChange={() => toggle(r, m)} aria-label={`${r}: ${label(m)}`} />
                                            <i className="mdi mdi-check-bold"></i>
                                        </label>
                                    </td>
                                ))}
                            </tr>
                            )),
                        ])}
                    </tbody>
                </table>
            </div>
            <SaveBar dirty={changed.length > 0} saving={saving} text={changed.length ? `Unsaved changes for ${changed.join(', ')}` : 'All saved'}
                onUndo={() => setDraft(Object.fromEntries(ROLES.map((r) => [r, data.roles[r] || []])))} onSave={save} />
        </>
    )
}

/* ---------------------- by department / designation ---------------------- */
const GROUPS = {
    department: { key: 'departments', action: accessActions.SAVE_DEPARTMENT_ACCESS, icon: 'mdi-office-building-outline', noun: 'department', empty: 'Add departments (and assign employees to them) to give a whole department extra access.' },
    designation: { key: 'designations', action: accessActions.SAVE_DESIGNATION_ACCESS, icon: 'mdi-badge-account-horizontal-outline', noun: 'designation', empty: 'Add designations (and assign them to employees) to give everyone with that designation extra access.' },
}

const GroupTab = ({ data, saving, kind }) => {
    const dispatch = useDispatch()
    const g = GROUPS[kind]
    const groups = data[g.key] || []
    const [selected, setSelected] = useState(groups.find((x) => x.employeeCount)?.name || groups[0]?.name || '')
    const dept = groups.find((d) => d.name === selected)
    const [draft, setDraft] = useState([])
    useEffect(() => { setDraft(dept?.allow || []) }, [dept])
    const dirty = dept && !sameSet(draft, dept.allow)
    const save = async () => {
        const added = draft.filter((m) => !dept.allow.includes(m))
        if (!(await confirmSensitive(added, kind === 'department' ? `Everyone in ${dept.name}` : `Every ${dept.name}`))) return
        dispatch({ type: g.action, name: dept.name, allow: draft })
    }

    if (!groups.length) return <EmptyState icon={g.icon} title={`No ${g.key} yet`} text={g.empty} />

    return (
        <div className="ac-split">
            <ul className="ac-list" aria-label={g.key}>
                {groups.map((d) => (
                    <li key={d.name}>
                        <button type="button" className={selected === d.name ? 'active' : ''} onClick={() => setSelected(d.name)}>
                            <span className="ac-list-icon"><i className={`mdi ${g.icon}`}></i></span>
                            <span className="ac-list-main"><b>{d.name}</b><small>{d.employeeCount} {d.employeeCount === 1 ? 'person' : 'people'}</small></span>
                            {d.allow.length > 0 && <span className="ac-badge">+{d.allow.length}</span>}
                        </button>
                    </li>
                ))}
            </ul>
            {dept && (
                <div className="ac-panel">
                    <div className="ac-panel-head">
                        <div><h3>{dept.name}</h3><small>Screens and permissions for everyone with this {g.noun}, on top of their role.</small></div>
                    </div>
                    {sectionsOf(data).map((sec) => (
                    <React.Fragment key={sec.title}>
                    <h4 className="ac-section">{sec.title}<small>{sec.hint}</small></h4>
                    <div className="ac-toggles">
                        {sec.keys.map((m) => {
                            const on = draft.includes(m)
                            return (
                                <label key={m} className={`ac-toggle ${on ? 'on' : ''}`}>
                                    <input type="checkbox" checked={on} onChange={() => setDraft(on ? draft.filter((x) => x !== m) : [...draft, m])} />
                                    <ModuleIcon m={m} />
                                    <span className="ac-toggle-main"><b>{label(m)}</b><small>{help(m)}</small></span>
                                    <span className="rl-switch" aria-hidden="true"></span>
                                </label>
                            )
                        })}
                    </div>
                    </React.Fragment>
                    ))}
                    <SaveBar dirty={dirty} saving={saving} text={dirty ? 'Unsaved changes' : `${dept.allow.length} granted`}
                        onUndo={() => setDraft(dept.allow)} onSave={save} />
                </div>
            )}
        </div>
    )
}

/* ----------------------------- by employee ----------------------------- */
const EmployeesTab = ({ data, saving }) => {
    const dispatch = useDispatch()
    const [search, setSearch] = useState('')
    const [roleFilter, setRoleFilter] = useState('')
    const [deptFilter, setDeptFilter] = useState('')
    const [selectedId, setSelectedId] = useState(null)
    const people = useMemo(() => {
        const q = search.trim().toLowerCase()
        return data.employees
            .filter((e) => !roleFilter || e.role === roleFilter)
            .filter((e) => !deptFilter || e.department === deptFilter)
            .filter((e) => !q || `${fullName(e)} ${e.employeeId} ${e.designation} ${e.department}`.toLowerCase().includes(q))
    }, [data.employees, search, roleFilter, deptFilter])
    const person = data.employees.find((e) => e._id === selectedId) || people[0]
    const [allow, setAllow] = useState([])
    const [deny, setDeny] = useState([])
    useEffect(() => { setAllow(person?.allow || []); setDeny(person?.deny || []) }, [person])

    const deptAllow = data.departments.find((d) => d.name === person?.department)?.allow || []
    const desigAllow = (data.designations || []).find((d) => d.name === person?.designation)?.allow || []
    const roleAllow = data.roles[person?.role] || []
    const dirty = person && (!sameSet(allow, person.allow) || !sameSet(deny, person.deny))
    const setMode = (m, mode) => {
        setAllow((a) => (mode === 'allow' ? [...new Set([...a, m])] : a.filter((x) => x !== m)))
        setDeny((d) => (mode === 'block' ? [...new Set([...d, m])] : d.filter((x) => x !== m)))
    }
    const save = async () => {
        const added = allow.filter((m) => !person.allow.includes(m))
        if (!(await confirmSensitive(added, fullName(person)))) return
        dispatch({ type: accessActions.SAVE_EMPLOYEE_ACCESS, id: person._id, allow, deny, label: fullName(person) })
    }
    const departments = [...new Set(data.employees.map((e) => e.department).filter(Boolean))].sort()
    const customised = (e) => e.allow.length + e.deny.length

    return (
        <div className="ac-split">
            <div className="ac-side">
                <div className="pp-search"><i className="mdi mdi-magnify"></i><input type="search" className="pp-input" placeholder="Search people…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search people" /></div>
                <div className="ac-side-filters">
                    <select className="pp-select" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Role"><option value="">All roles</option>{['Admin', ...ROLES].map((r) => <option key={r}>{r}</option>)}</select>
                    <select className="pp-select" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} aria-label="Department"><option value="">All departments</option>{departments.map((d) => <option key={d}>{d}</option>)}</select>
                </div>
                <ul className="ac-list" aria-label="Employees">
                    {people.map((e) => (
                        <li key={e._id}>
                            <button type="button" className={person?._id === e._id ? 'active' : ''} onClick={() => setSelectedId(e._id)}>
                                <Avatar person={e} size={32} />
                                <span className="ac-list-main"><b>{fullName(e)}</b><small>{e.role} · {e.department || 'No department'}</small></span>
                                {customised(e) > 0 && <span className="ac-badge" title="Has personal settings">{customised(e)}</span>}
                            </button>
                        </li>
                    ))}
                    {!people.length && <li className="ac-none">No one matches</li>}
                </ul>
            </div>

            {person && (
                <div className="ac-panel">
                    <div className="ac-panel-head">
                        <Avatar person={person} size={44} />
                        <div>
                            <h3>{fullName(person)}</h3>
                            <small>{[person.employeeId, person.designation, person.role, person.department].filter(Boolean).join(' · ')}</small>
                        </div>
                        <span className="ac-total"><b>{person.effective.filter((k) => k.startsWith('screen:')).length}</b> screens · <b>{person.effective.filter((k) => !k.startsWith('screen:')).length}</b> permissions</span>
                    </div>

                    {person.role === 'Admin' ? (
                        <div className="rl-note"><i className="mdi mdi-shield-star-outline"></i><span>Admins always have full access. Change their role to restrict them.</span></div>
                    ) : (
                        <>
                            <div className="ac-legend"><span><i className="mdi mdi-shield-account-outline"></i>Role</span><span><i className="mdi mdi-badge-account-horizontal-outline"></i>Designation</span><span><i className="mdi mdi-office-building-outline"></i>Department</span><span><b>Inherit</b> follows role + designation + department · <b>Allow</b> / <b>Block</b> override for this person</span></div>
                            {sectionsOf(data).map((sec) => (
                            <React.Fragment key={sec.title}>
                            <h4 className="ac-section">{sec.title}<small>{sec.hint}</small></h4>
                            <div className="ac-rows">
                                {sec.keys.map((m) => {
                                    const fromRole = roleAllow.includes(m)
                                    const fromDept = deptAllow.includes(m)
                                    const fromDesig = desigAllow.includes(m)
                                    const mode = deny.includes(m) ? 'block' : allow.includes(m) ? 'allow' : 'inherit'
                                    const result = mode === 'block' ? false : mode === 'allow' ? true : fromRole || fromDesig || fromDept
                                    const why = mode === 'block' ? 'Blocked for this person' : mode === 'allow' ? 'Allowed for this person' : fromRole ? 'From role' : fromDesig ? 'From designation' : fromDept ? 'From department' : 'No access'
                                    return (
                                        <div key={m} className={`ac-row ${result ? 'yes' : 'no'}`}>
                                            <div className="ac-mod"><ModuleIcon m={m} /><span><b>{label(m)}</b><small>{help(m)}</small></span></div>
                                            <span className="ac-src">
                                                <i className={`mdi mdi-shield-account-outline ${fromRole ? 'on' : ''}`} title={fromRole ? 'Role gives access' : 'Role does not'}></i>
                                                <i className={`mdi mdi-badge-account-horizontal-outline ${fromDesig ? 'on' : ''}`} title={fromDesig ? 'Designation gives access' : 'Designation does not'}></i>
                                                <i className={`mdi mdi-office-building-outline ${fromDept ? 'on' : ''}`} title={fromDept ? 'Department gives access' : 'Department does not'}></i>
                                            </span>
                                            <div className="ac-seg" role="radiogroup" aria-label={`${label(m)} for ${fullName(person)}`}>
                                                {['inherit', 'allow', 'block'].map((k) => (
                                                    <button key={k} type="button" role="radio" aria-checked={mode === k} className={`${k} ${mode === k ? 'active' : ''}`} onClick={() => setMode(m, k)}>
                                                        {k === 'inherit' ? 'Inherit' : k === 'allow' ? 'Allow' : 'Block'}
                                                    </button>
                                                ))}
                                            </div>
                                            <span className="ac-result" title={why}><i className={`mdi ${result ? 'mdi-check-circle' : 'mdi-close-circle-outline'}`}></i><small>{why}</small></span>
                                        </div>
                                    )
                                })}
                            </div>
                            </React.Fragment>
                            ))}
                            <SaveBar dirty={dirty} saving={saving} text={dirty ? 'Unsaved changes' : customised(person) ? `${customised(person)} personal setting${customised(person) === 1 ? '' : 's'}` : 'Follows role, designation and department'}
                                onUndo={() => { setAllow(person.allow); setDeny(person.deny) }} onSave={save}
                                extra={customised(person) > 0 && !dirty && <button type="button" className="pp-btn sm ghost" onClick={() => { setAllow([]); setDeny([]) }}>Reset to inherit</button>} />
                        </>
                    )}
                </div>
            )}
        </div>
    )
}

const SaveBar = ({ dirty, saving, text, onUndo, onSave, extra }) => (
    <div className={`rl-foot ac-save ${dirty ? 'dirty' : ''}`}>
        <span>{text}</span>
        <div className="rl-quick">
            {extra}
            {dirty && <button type="button" className="pp-btn sm" onClick={onUndo} disabled={saving}>Undo</button>}
            <button type="button" className="pp-btn sm primary" disabled={!dirty || saving} onClick={onSave}><i className="mdi mdi-content-save-outline"></i> {saving ? 'Saving…' : 'Save'}</button>
        </div>
    </div>
)

export const AccessControl = () => {
    const dispatch = useDispatch()
    const { data, saving, error, notice } = useSelector((state) => state.accessReducer || {})
    const { isAuthenticated: user, permissions } = useSelector((state) => state.authReducer || {})
    const allowed = user?.role === 'Admin' || !!permissions?.includes('roles')
    const [tab, setTab] = useState('employees')

    useEffect(() => { if (allowed) dispatch({ type: accessActions.GET_ACCESS }) }, [dispatch, allowed])
    useEffect(() => {
        if (!notice) return undefined
        const t = setTimeout(() => dispatch({ type: accessActions.SET_ACCESS_NOTICE, payload: '' }), 3000)
        return () => clearTimeout(t)
    }, [notice, dispatch])

    if (!allowed) {
        return (
            <PeopleShell title="Access Control" root={SETTINGS_ROOT} crumbs={[{ label: 'Access Control' }]}>
                <div className="pp-card"><EmptyState icon="mdi-lock-outline" title="Admins only" text="Only Admin (or someone given Roles & Access) can change who can access what." /></div>
            </PeopleShell>
        )
    }

    return (
        <PeopleShell title="Access Control" subtitle="Who can open which part of the app — by role, by department, and per person." root={SETTINGS_ROOT} crumbs={[{ label: 'Access Control' }]}>
            <ErrorBanner error={error} />
            {notice && <div className="ac-notice" role="status"><i className="mdi mdi-check-circle-outline"></i>{notice}</div>}

            <div className="rl-note">
                <i className="mdi mdi-information-outline"></i>
                <span>Access = <b>role</b> + extra modules for their <b>designation</b> and <b>department</b> + <b>personal</b> allow, minus personal <b>block</b>. A person's own setting always wins. Changes apply immediately.</span>
            </div>

            <section className="pp-card">
                <div className="pd-tabs ac-tabs" role="tablist">
                    {[
                        { k: 'employees', label: 'By employee', icon: 'mdi-account-key-outline', n: data?.employees.length },
                        { k: 'designations', label: 'By designation', icon: 'mdi-badge-account-horizontal-outline', n: data?.designations?.length },
                        { k: 'departments', label: 'By department', icon: 'mdi-office-building-cog-outline', n: data?.departments.length },
                        { k: 'roles', label: 'By role', icon: 'mdi-shield-account-outline', n: ROLES.length + 1 },
                    ].map((t) => (
                        <button key={t.k} type="button" role="tab" aria-selected={tab === t.k} className={`pd-tab ${tab === t.k ? 'active' : ''}`} onClick={() => setTab(t.k)}>
                            <i className={`mdi ${t.icon}`}></i>{t.label}{t.n !== undefined && <b>{t.n}</b>}
                        </button>
                    ))}
                </div>
                <div className="pd-panel">
                    {!data ? <div className="pp-skel" style={{ height: 260 }}></div>
                        : tab === 'roles' ? <RolesTab data={data} saving={saving} />
                            : tab === 'departments' ? <GroupTab key="department" kind="department" data={data} saving={saving} />
                                : tab === 'designations' ? <GroupTab key="designation" kind="designation" data={data} saving={saving} />
                                : <EmployeesTab data={data} saving={saving} />}
                </div>
            </section>
        </PeopleShell>
    )
}
