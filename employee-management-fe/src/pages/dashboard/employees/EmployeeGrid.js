import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import employeeActions from '../../../redux/employee/Actions'
import { PeopleShell, Avatar, StatusPill, TypeTag, DeptTag, deptColor, EmptyState, ErrorBanner, fullName, fmtDate, tenure } from '../../../components/people/PeopleUI'
import './EmployeeGrid.css'
import { useAccess } from '../../../hooks/useAccess'
import { confirmAction } from '../../../components/common/ConfirmDialog'

const FORMER = ['Resigned', 'Terminated']
const PAGE_SIZE = 12
const VIEW_KEY = 'hoook-directory-view'
const DAY = 24 * 60 * 60 * 1000

// Each comparator sorts ascending; `dir` flips it. `defaultDir` is what a first click uses.
const SORTS = {
    name: { label: 'Name', defaultDir: 'asc', fn: (a, b) => fullName(a).localeCompare(fullName(b)) },
    department: { label: 'Department', defaultDir: 'asc', fn: (a, b) => (a.department || '').localeCompare(b.department || '') || fullName(a).localeCompare(fullName(b)) },
    joined: { label: 'Joining date', defaultDir: 'desc', fn: (a, b) => new Date(a.joiningDate || 0) - new Date(b.joiningDate || 0) },
    status: { label: 'Status', defaultDir: 'asc', fn: (a, b) => (a.status || '').localeCompare(b.status || '') || fullName(a).localeCompare(fullName(b)) },
}
const SORT_PRESETS = [
    { value: 'name:asc', label: 'Name A–Z' },
    { value: 'name:desc', label: 'Name Z–A' },
    { value: 'joined:desc', label: 'Newest joiners' },
    { value: 'joined:asc', label: 'Longest serving' },
    { value: 'department:asc', label: 'Department' },
    { value: 'status:asc', label: 'Status' },
]

const readView = () => { try { return localStorage.getItem(VIEW_KEY) || 'table' } catch { return 'table' } }
const saveView = (v) => { try { localStorage.setItem(VIEW_KEY, v) } catch { /* private mode — fine */ } }

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`

const exportCsv = (rows) => {
    const header = ['Employee ID', 'First name', 'Last name', 'Email', 'Phone', 'Designation', 'Department', 'Employment type', 'Joining date', 'Status']
    const lines = rows.map((e) => [
        e.employeeId, e.firstName, e.lastName, e.email, e.phoneNumber, e.designation, e.department,
        e.employmentType, e.joiningDate ? e.joiningDate.substring(0, 10) : '', e.status,
    ].map(csvCell).join(','))
    const blob = new Blob([[header.map(csvCell).join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `employees-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
}

export const EmployeeGrid = () => {
    const dispatch = useDispatch()
    const navigate = useNavigate()
    const location = useLocation()
    const { list: employeeList, listLoading, error } = useSelector((state) => state.employeeReducer || {})
    const { isAuthenticated: user } = useSelector((state) => state.authReducer || {})
    const { can } = useAccess()
    const canEdit = can(['Admin', 'HR'], 'employees')
    const canDelete = user?.role === 'Admin'

    const [search, setSearch] = useState('')
    const [departmentFilter, setDepartmentFilter] = useState(() => location.state?.department || '')
    const [statusTab, setStatusTab] = useState('current')
    const [sort, setSort] = useState({ key: 'name', dir: 'asc' })
    const [view, setView] = useState(readView)
    const [page, setPage] = useState(1)
    const searchRef = useRef(null)

    useEffect(() => {
        dispatch({ type: employeeActions.GET_EMPLOYEES })
    }, [dispatch])

    // "/" jumps to search, like most modern directories.
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
                e.preventDefault()
                searchRef.current?.focus()
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [])

    useEffect(() => { setPage(1) }, [search, departmentFilter, statusTab, sort])

    const changeView = (v) => { setView(v); saveView(v) }

    const onEdit = (id) => navigate(`/employees/edit/${id}`)

    const onRemove = async (id, name) => {
        const emp = (employeeList || []).find((e) => e._id === id)
        if (await confirmAction({
            title: `Remove ${name || 'this employee'}?`,
            message: 'They are taken off the active roster and lose access.',
            details: ['Attendance, leave, payroll and audit history are kept', 'This can be reversed by editing their status'],
            confirmLabel: 'Remove employee',
            requireText: emp?.employeeId || name,
        })) {
            dispatch({ type: employeeActions.DELETE_EMPLOYEE, id })
        }
    }

    const all = useMemo(() => employeeList || [], [employeeList])

    const departments = useMemo(() => [...new Set(all.map((e) => e.department).filter(Boolean))].sort(), [all])

    const summary = useMemo(() => {
        const current = all.filter((e) => !FORMER.includes(e.status))
        return {
            active: all.filter((e) => e.status === 'Active').length,
            newJoiners: current.filter((e) => e.joiningDate && Date.now() - new Date(e.joiningDate).getTime() <= 30 * DAY).length,
            departments: new Set(current.map((e) => e.department).filter(Boolean)).size,
            nonPermanent: current.filter((e) => e.employmentType && e.employmentType !== 'Permanent').length,
        }
    }, [all])

    const statusCounts = useMemo(() => ({
        current: all.filter((e) => !FORMER.includes(e.status)).length,
        former: all.filter((e) => FORMER.includes(e.status)).length,
        all: all.length,
    }), [all])

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        return all
            .filter((e) => statusTab === 'all' || (statusTab === 'former') === FORMER.includes(e.status))
            .filter((e) => !departmentFilter || e.department === departmentFilter)
            .filter((e) => !q || `${e.firstName} ${e.lastName} ${e.employeeId} ${e.email} ${e.designation} ${e.department}`.toLowerCase().includes(q))
            .sort((a, b) => (sort.dir === 'asc' ? 1 : -1) * SORTS[sort.key].fn(a, b))
    }, [all, search, departmentFilter, statusTab, sort])

    const sortBy = (key) => setSort((cur) => (cur.key === key
        ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: SORTS[key].defaultDir }))

    const SortHead = ({ k, children, className }) => {
        const activeSort = sort.key === k
        return (
            <th className={className} aria-sort={activeSort ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                <button type="button" className={`ed-sort ${activeSort ? 'active' : ''}`} onClick={() => sortBy(k)}>
                    {children}
                    <i className={`mdi ${activeSort ? (sort.dir === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down') : 'mdi-swap-vertical'}`}></i>
                </button>
            </th>
        )
    }

    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
    const safePage = Math.min(page, pageCount)
    const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
    const isFiltering = search.trim() || departmentFilter
    const clearFilters = () => { setSearch(''); setDepartmentFilter('') }

    const rowKey = (e, el) => {
        if (e.key === 'Enter') navigate(`/employees/${el._id}`)
    }

    return (
        <PeopleShell
            title="People"
            subtitle="Everyone in your organisation, in one place."
            actions={<>
                <button type="button" className="pp-btn" onClick={() => exportCsv(filtered)} disabled={!filtered.length}>
                    <i className="mdi mdi-download-outline"></i> Export
                </button>
                {canEdit && (
                    <Link to="/employees/create" className="pp-btn primary"><i className="mdi mdi-plus"></i> Add employee</Link>
                )}
            </>}
        >
            <ErrorBanner error={error} />

            <section className="pp-card ed-summary" aria-label="Workforce summary">
                <div className="ed-sum" style={{ '--c': '#0ea5e9' }}>
                    <span className="ed-sum-icon"><i className="mdi mdi-account-check-outline"></i></span>
                    <div><b>{summary.active}</b><span>Active employees</span></div>
                </div>
                <div className="ed-sum" style={{ '--c': '#10b981' }}>
                    <span className="ed-sum-icon"><i className="mdi mdi-account-plus-outline"></i></span>
                    <div><b>{summary.newJoiners}</b><span>Joined in last 30 days</span></div>
                </div>
                <div className="ed-sum" style={{ '--c': '#0b0f19' }}>
                    <span className="ed-sum-icon"><i className="mdi mdi-office-building-outline"></i></span>
                    <div><b>{summary.departments}</b><span>Departments</span></div>
                </div>
                <div className="ed-sum" style={{ '--c': '#f59e0b' }}>
                    <span className="ed-sum-icon"><i className="mdi mdi-file-document-edit-outline"></i></span>
                    <div><b>{summary.nonPermanent}</b><span>Contract, intern & part-time</span></div>
                </div>
            </section>

            <div className="ed-toolbar">
                <div className="pp-search">
                    <i className="mdi mdi-magnify"></i>
                    <input
                        ref={searchRef}
                        type="search"
                        className="pp-input"
                        placeholder="Search name, ID, email, role…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        aria-label="Search employees"
                    />
                    {!search && <kbd className="pp-kbd">/</kbd>}
                </div>
                <select className="pp-select" value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)} aria-label="Department">
                    <option value="">All departments</option>
                    {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                <div className="pp-seg" role="tablist" aria-label="Employment status">
                    {[['current', 'Current'], ['former', 'Former'], ['all', 'All']].map(([k, label]) => (
                        <button key={k} type="button" role="tab" aria-selected={statusTab === k} className={statusTab === k ? 'active' : ''} onClick={() => setStatusTab(k)}>
                            {label} <b>{statusCounts[k]}</b>
                        </button>
                    ))}
                </div>
                <div className="ed-spacer"></div>
                <select
                    className="pp-select"
                    value={`${sort.key}:${sort.dir}`}
                    onChange={(e) => { const [key, dir] = e.target.value.split(':'); setSort({ key, dir }) }}
                    aria-label="Sort by"
                >
                    {!SORT_PRESETS.some((p) => p.value === `${sort.key}:${sort.dir}`) && (
                        <option value={`${sort.key}:${sort.dir}`}>Sort: {SORTS[sort.key].label} ({sort.dir === 'asc' ? 'A→Z' : 'Z→A'})</option>
                    )}
                    {SORT_PRESETS.map((p) => <option key={p.value} value={p.value}>Sort: {p.label}</option>)}
                </select>
                <div className="pp-seg" aria-label="Layout">
                    <button type="button" className={view === 'table' ? 'active' : ''} onClick={() => changeView('table')} aria-pressed={view === 'table'} title="Table view">
                        <i className="mdi mdi-format-list-bulleted"></i>
                    </button>
                    <button type="button" className={view === 'grid' ? 'active' : ''} onClick={() => changeView('grid')} aria-pressed={view === 'grid'} title="Card view">
                        <i className="mdi mdi-view-grid-outline"></i>
                    </button>
                </div>
            </div>

            {!listLoading && all.length > 0 && (
                <p className="ed-count">
                    Showing <b>{filtered.length}</b> of {all.length} people
                    {isFiltering && <button type="button" onClick={clearFilters}>Clear filters</button>}
                </p>
            )}

            {listLoading && !all.length ? (
                <div className="pp-card pp-card-body">
                    {[0, 1, 2, 3, 4].map((i) => <div key={i} className="pp-skel" style={{ height: 44, marginBottom: 12 }}></div>)}
                </div>
            ) : !all.length ? (
                <div className="pp-card">
                    <EmptyState
                        icon="mdi-account-group-outline"
                        title="No employees yet"
                        text="Add your first team member to start building your directory."
                        action={canEdit && <Link to="/employees/create" className="pp-btn primary"><i className="mdi mdi-plus"></i> Add employee</Link>}
                    />
                </div>
            ) : !filtered.length ? (
                <div className="pp-card">
                    <EmptyState
                        title="No one matches"
                        text="Try a different name, department or status."
                        action={isFiltering && <button type="button" className="pp-btn" onClick={clearFilters}>Clear filters</button>}
                    />
                </div>
            ) : view === 'table' ? (
                <div className="pp-card ed-table-wrap">
                    <table className="ed-table">
                        <thead>
                            <tr>
                                <SortHead k="name"><i className="mdi mdi-account-outline ed-th-icon"></i>Employee</SortHead>
                                <SortHead k="department" className="hide-sm"><i className="mdi mdi-office-building-outline ed-th-icon"></i>Department</SortHead>
                                <th className="hide-lg"><span className="ed-th"><i className="mdi mdi-briefcase-outline ed-th-icon"></i>Type</span></th>
                                <th className="hide-md"><span className="ed-th"><i className="mdi mdi-card-account-phone-outline ed-th-icon"></i>Contact</span></th>
                                <SortHead k="joined" className="hide-md"><i className="mdi mdi-calendar-outline ed-th-icon"></i>Joined</SortHead>
                                <SortHead k="status"><i className="mdi mdi-shield-check-outline ed-th-icon"></i>Status</SortHead>
                                <th className="text-end"><span className="ed-th justify-content-end">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {pageItems.map((el) => (
                                <tr
                                    key={el._id}
                                    tabIndex={0}
                                    className={FORMER.includes(el.status) ? 'is-former' : ''}
                                    onClick={() => navigate(`/employees/${el._id}`)}
                                    onKeyDown={(e) => rowKey(e, el)}
                                >
                                    <td>
                                        <div className="ed-person">
                                            <Avatar person={el} size={42} />
                                            <div style={{ minWidth: 0 }}>
                                                <div className="ed-person-name">{fullName(el)}</div>
                                                <div className="ed-person-sub">
                                                    {el.designation || 'No designation'}
                                                    <span className="ed-id">#{el.employeeId}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="hide-sm"><DeptTag name={el.department} /></td>
                                    <td className="hide-lg"><TypeTag type={el.employmentType} /></td>
                                    <td className="hide-md" onClick={(e) => e.stopPropagation()}>
                                        <div className="ed-contact">
                                            {el.email && (
                                                <a href={`mailto:${el.email}`} className="ed-contact-btn mail" title={el.email} aria-label={`Email ${fullName(el)}`}>
                                                    <i className="mdi mdi-email-outline"></i>
                                                </a>
                                            )}
                                            {el.phoneNumber && (
                                                <a href={`tel:${el.phoneNumber}`} className="ed-contact-btn call" title={el.phoneNumber} aria-label={`Call ${fullName(el)}`}>
                                                    <i className="mdi mdi-phone-outline"></i>
                                                </a>
                                            )}
                                            <span className="ed-contact-text hide-xl">{el.email}</span>
                                        </div>
                                    </td>
                                    <td className="hide-md">
                                        <div className="ed-joined">
                                            <span><i className="mdi mdi-calendar-check-outline"></i>{fmtDate(el.joiningDate)}</span>
                                            <small>{tenure(el.joiningDate)}</small>
                                        </div>
                                    </td>
                                    <td><StatusPill status={el.status} /></td>
                                    <td onClick={(e) => e.stopPropagation()}>
                                        <div className="ed-actions">
                                            <Link to={`/employees/${el._id}`} className="ed-act view" title="View profile" aria-label={`View ${fullName(el)}`}>
                                                <i className="mdi mdi-eye-outline"></i>
                                            </Link>
                                            {canEdit && (
                                                <button type="button" className="ed-act edit" onClick={() => onEdit(el._id)} title="Edit" aria-label={`Edit ${fullName(el)}`}>
                                                    <i className="mdi mdi-pencil-outline"></i>
                                                </button>
                                            )}
                                            {canDelete && !FORMER.includes(el.status) && (
                                                <button type="button" className="ed-act remove" onClick={() => onRemove(el._id, fullName(el))} title="Remove" aria-label={`Remove ${fullName(el)}`}>
                                                    <i className="mdi mdi-account-remove-outline"></i>
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="ed-grid">
                    {pageItems.map((el) => (
                        <div className="pp-card ed-card" key={el._id} style={{ '--dept': deptColor(el.department) }}>
                            <div className="ed-card-top">
                                <Avatar person={el} size={52} />
                                <StatusPill status={el.status} />
                            </div>
                            <Link to={`/employees/${el._id}`} className="stretched-link text-decoration-none"><h4>{fullName(el)}</h4></Link>
                            <p className="ed-card-title">{el.designation || '—'}</p>
                            <div className="ed-card-tags">
                                <DeptTag name={el.department} />
                                <TypeTag type={el.employmentType} />
                            </div>
                            <div className="ed-card-meta">
                                <div><i className="mdi mdi-email-outline" style={{ color: '#0284c7' }}></i><span>{el.email}</span></div>
                                <div><i className="mdi mdi-phone-outline" style={{ color: '#059669' }}></i><span>{el.phoneNumber || '—'}</span></div>
                                <div><i className="mdi mdi-calendar-check-outline" style={{ color: '#8b5cf6' }}></i><span>Joined {fmtDate(el.joiningDate)} · {tenure(el.joiningDate)}</span></div>
                            </div>
                            {(canEdit || canDelete) && (
                                <div className="ed-card-foot" style={{ position: 'relative', zIndex: 2 }}>
                                    {canEdit && <button type="button" className="pp-btn sm" onClick={() => onEdit(el._id)}><i className="mdi mdi-pencil-outline"></i> Edit</button>}
                                    {canDelete && !FORMER.includes(el.status) && (
                                        <button type="button" className="pp-btn sm danger" onClick={() => onRemove(el._id, fullName(el))}><i className="mdi mdi-account-remove-outline"></i> Remove</button>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {filtered.length > PAGE_SIZE && (
                <div className="ed-pager">
                    <span>Page {safePage} of {pageCount}</span>
                    <div className="ed-pages">
                        <button type="button" className="ed-page" disabled={safePage === 1} onClick={() => setPage(safePage - 1)} aria-label="Previous page"><i className="mdi mdi-chevron-left"></i></button>
                        {Array.from({ length: pageCount }, (_, i) => i + 1)
                            .filter((n) => n === 1 || n === pageCount || Math.abs(n - safePage) <= 1)
                            .map((n, i, arr) => (
                                <React.Fragment key={n}>
                                    {i > 0 && n - arr[i - 1] > 1 && <span className="px-1">…</span>}
                                    <button type="button" className={`ed-page ${n === safePage ? 'active' : ''}`} onClick={() => setPage(n)} aria-current={n === safePage ? 'page' : undefined}>{n}</button>
                                </React.Fragment>
                            ))}
                        <button type="button" className="ed-page" disabled={safePage === pageCount} onClick={() => setPage(safePage + 1)} aria-label="Next page"><i className="mdi mdi-chevron-right"></i></button>
                    </div>
                </div>
            )}
        </PeopleShell>
    )
}
