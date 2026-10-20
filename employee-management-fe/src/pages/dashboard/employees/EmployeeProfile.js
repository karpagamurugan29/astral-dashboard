import React, { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link, useParams } from 'react-router-dom'
import employeeActions from '../../../redux/employee/Actions'
import payrollActions from '../../../redux/payroll/Actions'
import documentActions from '../../../redux/document/Actions'
import projectActions from '../../../redux/project/Actions'
import taskActions from '../../../redux/task/Actions'
import { PeopleShell, Avatar, StatusPill, ErrorBanner, fullName, fmtDate, tenure } from '../../../components/people/PeopleUI'
import './EmployeeProfile.css'

const TASK_TONE = { 'To Do': '#64748b', 'In Progress': '#0ea5e9', 'In Review': '#f59e0b', Blocked: '#f43f5e', Done: '#10b981' }
const LEAVE_TONE = { Approved: '#10b981', Pending: '#f59e0b', Rejected: '#f43f5e', Cancelled: '#64748b' }
const ATTENDANCE_TONE = { Present: '#10b981', Absent: '#f43f5e', 'Half Day': '#f59e0b', Leave: '#0ea5e9' }
const SALARY_PARTS = [
    { key: 'basic', label: 'Basic', color: '#0b0f19' },
    { key: 'hra', label: 'HRA', color: '#0ea5e9' },
    { key: 'conveyance', label: 'Conveyance', color: '#7dd3fc' },
    { key: 'specialAllowance', label: 'Special allowance', color: '#10b981' },
]

const money = (n) => (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })

const Tag = ({ children, color }) => (
    <span className="pp-pill" style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}>{children}</span>
)

export const EmployeeProfile = () => {
    const { id } = useParams()
    const dispatch = useDispatch()
    const { current: emp, history, error, loading } = useSelector((state) => state.employeeReducer || {})
    const { structure } = useSelector((state) => state.payrollReducer || {})
    const { list: documents } = useSelector((state) => state.documentReducer || {})
    const { list: projects } = useSelector((state) => state.projectReducer || {})
    const { list: tasks } = useSelector((state) => state.taskReducer || {})
    const { isAuthenticated: user } = useSelector((state) => state.authReducer || {})
    const canSeeSalary = ['Admin', 'HR'].includes(user?.role)
    const canEdit = ['Admin', 'HR'].includes(user?.role)
    const [tab, setTab] = useState('overview')

    useEffect(() => {
        dispatch({ type: employeeActions.GET_EMPLOYEE_BY_ID, id })
        dispatch({ type: employeeActions.GET_EMPLOYEE_HISTORY, id })
        dispatch({ type: documentActions.GET_DOCUMENTS })
        dispatch({ type: projectActions.GET_PROJECTS })
        dispatch({ type: taskActions.GET_TASKS })
        if (canSeeSalary) {
            dispatch({ type: payrollActions.GET_SALARY_STRUCTURE, employeeId: id })
        }
        setTab('overview')
        return () => dispatch({ type: employeeActions.CLEAR_EMPLOYEE })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id])

    const employeeDocs = documents?.filter((d) => d.employeeId?._id === id || d.employeeId === id) || []
    const employeeProjects = projects?.filter((p) => p.teamMembers?.some((m) => m._id === id) || p.projectManager?._id === id) || []
    const employeeTasks = tasks?.filter((t) => t.assignedTo?._id === id) || []
    const openTasks = employeeTasks.filter((t) => t.status !== 'Done').length

    const tabs = [
        { key: 'overview', label: 'Overview' },
        { key: 'job', label: 'Job' },
        canSeeSalary && { key: 'salary', label: 'Salary' },
        { key: 'documents', label: 'Documents', count: employeeDocs.length },
        { key: 'work', label: 'Projects & tasks', count: employeeProjects.length + employeeTasks.length },
        { key: 'history', label: 'History' },
    ].filter(Boolean)

    const salaryTotal = structure ? SALARY_PARTS.reduce((s, p) => s + (Number(structure[p.key]) || 0), 0) : 0
    const address = emp ? [emp.address?.street, emp.address?.city, emp.address?.state, emp.address?.country, emp.address?.pincode].filter(Boolean).join(', ') : ''

    return (
        <PeopleShell backTo="/employees"
            title={emp ? fullName(emp) : 'Employee profile'}
            crumbs={[{ label: 'Directory', to: '/employees' }, { label: emp ? fullName(emp) : 'Profile' }]}
            actions={<>
                {emp && canEdit && <Link to={`/employees/edit/${emp._id}`} className="pp-btn primary"><i className="mdi mdi-pencil-outline"></i> Edit profile</Link>}
            </>}
        >
            <ErrorBanner error={error} />

            {!emp ? (
                (loading || !error) && (
                    <div className="ep-layout">
                        <div className="pp-card pp-card-body"><div className="pp-skel" style={{ height: 320 }}></div></div>
                        <div className="pp-card pp-card-body"><div className="pp-skel" style={{ height: 320 }}></div></div>
                    </div>
                )
            ) : (
                <div className="ep-layout">
                    {/* ---------- identity ---------- */}
                    <aside className="pp-card ep-id">
                        <div className="ep-id-top">
                            <Avatar person={emp} size={88} ring />
                            <h2>{fullName(emp)}</h2>
                            <p className="ep-id-title">{emp.designation || '—'}</p>
                            <div className="ep-id-pills">
                                <StatusPill status={emp.status} />
                                {emp.role && <span className="pp-chip">{emp.role}</span>}
                            </div>
                        </div>

                        <div className="ep-quick">
                            <a href={`mailto:${emp.email}`} className="pp-btn sm"><i className="mdi mdi-email-outline"></i> Email</a>
                            {emp.phoneNumber
                                ? <a href={`tel:${emp.phoneNumber}`} className="pp-btn sm"><i className="mdi mdi-phone-outline"></i> Call</a>
                                : <button type="button" className="pp-btn sm" disabled><i className="mdi mdi-phone-outline"></i> Call</button>}
                        </div>

                        <dl className="ep-facts">
                            <div className="ep-fact"><i className="mdi mdi-identifier"></i><dt>Employee ID</dt><dd>{emp.employeeId}</dd></div>
                            <div className="ep-fact"><i className="mdi mdi-office-building-outline"></i><dt>Department</dt><dd>{emp.department || '—'}</dd></div>
                            <div className="ep-fact">
                                <i className="mdi mdi-account-tie-outline"></i><dt>Manager</dt>
                                <dd>{emp.manager ? <Link to={`/employees/${emp.manager._id || emp.manager}`}>{fullName(emp.manager)}</Link> : '—'}</dd>
                            </div>
                            <div className="ep-fact"><i className="mdi mdi-map-marker-outline"></i><dt>Branch</dt><dd>{emp.branch?.name || '—'}</dd></div>
                            <div className="ep-fact"><i className="mdi mdi-email-outline"></i><dt>Email</dt><dd>{emp.email}</dd></div>
                            <div className="ep-fact"><i className="mdi mdi-phone-outline"></i><dt>Phone</dt><dd>{emp.phoneNumber || '—'}</dd></div>
                        </dl>
                    </aside>

                    {/* ---------- details ---------- */}
                    <section className="pp-card">
                        <div className="ep-tabs" role="tablist">
                            {tabs.map((t) => (
                                <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`ep-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
                                    {t.label}{t.count !== undefined && <b>{t.count}</b>}
                                </button>
                            ))}
                        </div>

                        <div className="ep-panel">
                            {tab === 'overview' && (
                                <>
                                    <div className="ep-section">
                                        <div className="ep-glance">
                                            <div><b>{tenure(emp.joiningDate)}</b><span>With the company</span></div>
                                            <div><b>{employeeProjects.length}</b><span>Projects</span></div>
                                            <div><b>{openTasks}</b><span>Open tasks</span></div>
                                            <div><b>{employeeDocs.length}</b><span>Documents</span></div>
                                        </div>
                                    </div>
                                    <div className="ep-section">
                                        <h3 className="ep-section-title">Personal</h3>
                                        <dl className="ep-grid">
                                            <div><dt>Full name</dt><dd>{fullName(emp)}</dd></div>
                                            <div><dt>Gender</dt><dd>{emp.gender || '—'}</dd></div>
                                            <div><dt>Date of birth</dt><dd>{fmtDate(emp.dateOfBirth)}</dd></div>
                                            <div><dt>Username</dt><dd>{emp.userName || '—'}</dd></div>
                                            <div><dt>Joined</dt><dd>{fmtDate(emp.joiningDate)}</dd></div>
                                            <div><dt>Employment type</dt><dd>{emp.employmentType || '—'}</dd></div>
                                        </dl>
                                    </div>
                                    <div className="ep-section ep-two">
                                        <div className="ep-box">
                                            <i className="mdi mdi-home-outline"></i>
                                            <div><h6>Address</h6><p>{address || 'Not added yet'}</p></div>
                                        </div>
                                        <div className="ep-box">
                                            <i className="mdi mdi-lifebuoy"></i>
                                            <div>
                                                <h6>Emergency contact</h6>
                                                <p>
                                                    {emp.emergencyContact?.name
                                                        ? <>{emp.emergencyContact.name}{emp.emergencyContact.relation && ` (${emp.emergencyContact.relation})`}<br />{emp.emergencyContact.phone}</>
                                                        : 'Not added yet'}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}

                            {tab === 'job' && (
                                <div className="ep-section">
                                    <h3 className="ep-section-title">Position</h3>
                                    <dl className="ep-grid">
                                        <div><dt>Designation</dt><dd>{emp.designation || '—'}</dd></div>
                                        <div><dt>Department</dt><dd>{emp.department || '—'}</dd></div>
                                        <div><dt>Access role</dt><dd>{emp.role || '—'}</dd></div>
                                        <div><dt>Employment type</dt><dd>{emp.employmentType || '—'}</dd></div>
                                        <div><dt>Reporting manager</dt><dd>{emp.manager ? fullName(emp.manager) : '—'}</dd></div>
                                        <div><dt>Branch</dt><dd>{emp.branch?.name || '—'}</dd></div>
                                        <div><dt>Joining date</dt><dd>{fmtDate(emp.joiningDate)}</dd></div>
                                        <div><dt>Tenure</dt><dd>{tenure(emp.joiningDate)}</dd></div>
                                        <div><dt>Status</dt><dd><StatusPill status={emp.status} /></dd></div>
                                    </dl>
                                </div>
                            )}

                            {tab === 'salary' && canSeeSalary && (
                                <div className="ep-section">
                                    <h3 className="ep-section-title">Monthly salary structure</h3>
                                    {!structure ? (
                                        <p className="ep-muted">No salary structure configured yet. <Link to="/payroll/salary-structure">Set one up</Link>.</p>
                                    ) : (
                                        <>
                                            <div className="ep-salary-total"><b>{money(salaryTotal)}</b><span>gross per month · {money(salaryTotal * 12)} per year</span></div>
                                            <div className="ep-bar" aria-hidden="true">
                                                {SALARY_PARTS.map((p) => (
                                                    <span key={p.key} style={{ width: `${salaryTotal ? ((Number(structure[p.key]) || 0) / salaryTotal) * 100 : 0}%`, background: p.color }}></span>
                                                ))}
                                            </div>
                                            <div className="ep-legend">
                                                {SALARY_PARTS.map((p) => (
                                                    <div key={p.key}><i style={{ background: p.color }}></i><span>{p.label}</span><b>{money(structure[p.key])}</b></div>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {tab === 'documents' && (
                                <div className="ep-section">
                                    {!employeeDocs.length ? (
                                        <p className="ep-muted">No documents uploaded for this employee yet. <Link to="/documents">Go to documents</Link>.</p>
                                    ) : (
                                        <ul className="ep-rows">
                                            {employeeDocs.map((d) => (
                                                <li key={d._id} className="ep-row">
                                                    <span className="ep-row-icon"><i className="mdi mdi-file-document-outline"></i></span>
                                                    <div className="ep-row-main">
                                                        <div className="ep-row-title">{d.title}</div>
                                                        <div className="ep-row-sub">Uploaded {fmtDate(d.createdAt)}</div>
                                                    </div>
                                                    {d.category && <span className="pp-chip">{d.category}</span>}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}

                            {tab === 'work' && (
                                <>
                                    <div className="ep-section">
                                        <h3 className="ep-section-title">Projects · {employeeProjects.length}</h3>
                                        {!employeeProjects.length ? <p className="ep-muted">Not on any project yet.</p> : (
                                            <ul className="ep-rows">
                                                {employeeProjects.map((p) => (
                                                    <li key={p._id} className="ep-row">
                                                        <span className="ep-row-icon"><i className="mdi mdi-briefcase-outline"></i></span>
                                                        <div className="ep-row-main">
                                                            <div className="ep-row-title"><Link to={`/projects/${p._id}`}>{p.projectName}</Link></div>
                                                            <div className="ep-row-sub">{p.projectManager?._id === id ? 'Project manager' : 'Team member'}</div>
                                                        </div>
                                                        <span className="pp-chip">{p.status}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                    <div className="ep-section">
                                        <h3 className="ep-section-title">Tasks · {employeeTasks.length}</h3>
                                        {!employeeTasks.length ? <p className="ep-muted">No tasks assigned.</p> : (
                                            <ul className="ep-rows">
                                                {employeeTasks.map((t) => (
                                                    <li key={t._id} className="ep-row" style={{ '--c': TASK_TONE[t.status] || '#64748b' }}>
                                                        <span className="ep-row-icon"><i className={`mdi ${t.status === 'Done' ? 'mdi-check-circle-outline' : 'mdi-checkbox-blank-circle-outline'}`}></i></span>
                                                        <div className="ep-row-main">
                                                            <div className="ep-row-title">{t.title}</div>
                                                            {t.projectId && <div className="ep-row-sub">{t.projectId.projectName}</div>}
                                                        </div>
                                                        <Tag color={TASK_TONE[t.status] || '#64748b'}>{t.status}</Tag>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                </>
                            )}

                            {tab === 'history' && (
                                <>
                                    <div className="ep-section">
                                        <h3 className="ep-section-title">Recent leave</h3>
                                        {!history?.leaves?.length ? <p className="ep-muted">No leave history.</p> : (
                                            <ul className="ep-timeline">
                                                {history.leaves.map((l) => (
                                                    <li key={l._id} className="ep-tl" style={{ '--c': LEAVE_TONE[l.status] || '#64748b' }}>
                                                        <div className="ep-tl-head">{l.leaveType} leave <Tag color={LEAVE_TONE[l.status] || '#64748b'}>{l.status}</Tag></div>
                                                        <div className="ep-tl-sub">{fmtDate(l.fromDate)} → {fmtDate(l.toDate)}</div>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                    <div className="ep-section">
                                        <h3 className="ep-section-title">Recent attendance</h3>
                                        {!history?.attendance?.length ? <p className="ep-muted">No attendance history.</p> : (
                                            <ul className="ep-timeline">
                                                {history.attendance.map((a) => (
                                                    <li key={a._id} className="ep-tl" style={{ '--c': ATTENDANCE_TONE[a.status] || '#64748b' }}>
                                                        <div className="ep-tl-head">{fmtDate(a.attendanceDate)} <Tag color={ATTENDANCE_TONE[a.status] || '#64748b'}>{a.status}</Tag></div>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                    {history?.auditTrail?.length > 0 && (
                                        <div className="ep-section">
                                            <h3 className="ep-section-title">Record changes</h3>
                                            <ul className="ep-timeline">
                                                {history.auditTrail.map((a) => (
                                                    <li key={a._id} className="ep-tl" style={{ '--c': '#0b0f19' }}>
                                                        <div className="ep-tl-head" style={{ fontWeight: 500 }}>{a.description}</div>
                                                        <div className="ep-tl-sub">{fmtDate(a.createdAt)}</div>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </section>
                </div>
            )}
        </PeopleShell>
    )
}
