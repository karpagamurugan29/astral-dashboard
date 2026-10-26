import React, { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import payrollActions from '../../../redux/payroll/Actions'
import { PeopleShell, Avatar, EmptyState, ErrorBanner, fullName, fmtDate } from '../../../components/people/PeopleUI'
import { PAYROLL_ROOT, money, moneyShort, periodLabel, PayStatus, MonthTile, payStatusMeta } from '../../../components/payroll/PayrollUI'
import '../../../components/attendance/attendance.css'
import './PayrollProcess.css'
import { confirmAction } from '../../../components/common/ConfirmDialog'

const STAGES = ['Draft', 'Approved', 'Paid']

const Pipeline = ({ run }) => {
    const idx = STAGES.indexOf(run.status)
    const icons = { Draft: 'mdi-file-document-edit-outline', Approved: 'mdi-check', Paid: 'mdi-cash-check' }
    const note = run.status === 'Paid' && run.paidAt ? `Paid ${fmtDate(run.paidAt)}`
        : run.status === 'Approved' && run.approvedAt ? `Approved ${fmtDate(run.approvedAt)}`
            : run.createdAt ? `Generated ${fmtDate(run.createdAt)}` : ''
    return (
        <div className="pr-pipe" aria-label={`Status: ${run.status}`}>
            {STAGES.map((s, i) => (
                <React.Fragment key={s}>
                    {i > 0 && <span className={`pr-link ${i <= idx ? 'done' : ''}`}></span>}
                    <span className={`pr-stage ${i <= idx ? 'done' : ''} ${i === idx ? 'current' : ''}`} style={{ '--c': payStatusMeta(s).color }}>
                        <i className={`mdi ${icons[s]}`}></i>{s}
                    </span>
                </React.Fragment>
            ))}
            {note && <small>{note}</small>}
        </div>
    )
}

export const PayrollProcess = () => {
    const dispatch = useDispatch()
    const { runs, runDetail, error } = useSelector((state) => state.payrollReducer || {})
    const { isAuthenticated: user } = useSelector((state) => state.authReducer || {})
    const isAdmin = user?.role === 'Admin'
    const now = new Date()
    const [period, setPeriod] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
    const [openId, setOpenId] = useState(null)

    useEffect(() => {
        dispatch({ type: payrollActions.GET_PAYROLL_RUNS })
    }, [dispatch])

    const all = useMemo(() => [...(runs || [])].sort((a, b) => String(b.period).localeCompare(String(a.period))), [runs])
    const existing = all.find((r) => r.period === period)

    const onGenerate = async () => {
        if (existing && !(await confirmAction({ title: `Generate ${periodLabel(period)} again?`, message: `It already has a payroll run (${existing.status}). Generating replaces the draft figures.`, confirmLabel: 'Generate again', tone: 'warn' }))) return
        dispatch({ type: payrollActions.GENERATE_PAYROLL, payload: { period } })
    }

    const onApprove = async (r) => {
        if (await confirmAction({ title: `Approve payroll for ${periodLabel(r.period)}?`, message: `${r.employeeCount} payslips, net ${money(r.totalNet)}.`, confirmLabel: 'Approve payroll', tone: 'primary' })) {
            dispatch({ type: payrollActions.APPROVE_PAYROLL_RUN, id: r._id })
        }
    }

    const onMarkPaid = async (r) => {
        if (await confirmAction({ title: `Mark ${periodLabel(r.period)} as paid?`, message: `Only once salaries (${money(r.totalNet)}) have been transferred.`, confirmLabel: 'Mark paid', tone: 'warn' })) {
            dispatch({ type: payrollActions.MARK_PAYROLL_PAID, id: r._id })
        }
    }

    const onToggle = (id) => {
        if (openId === id) { setOpenId(null); return }
        setOpenId(id)
        dispatch({ type: payrollActions.GET_PAYROLL_RUN_DETAIL, id })
    }

    const year = String(now.getFullYear())
    const stats = useMemo(() => ({
        last: all[0],
        paidYtd: all.filter((r) => r.status === 'Paid' && String(r.period).startsWith(year)).reduce((s, r) => s + (Number(r.totalNet) || 0), 0),
        needsAction: all.filter((r) => r.status !== 'Paid').length,
    }), [all, year])

    const detailRows = openId && runDetail?.run?._id === openId ? (runDetail.payslips || []) : null

    return (
        <PeopleShell title="Payroll runs" root={PAYROLL_ROOT} crumbs={[{ label: 'Runs' }]}>
            <ErrorBanner error={error} />

            <div className="at-tiles">
                <div className="at-tile" style={{ '--c': '#0b0f19' }}>
                    <span className="at-tile-icon"><i className="mdi mdi-calendar-month-outline"></i></span>
                    <div><b>{stats.last ? periodLabel(stats.last.period, { month: 'short', year: 'numeric' }) : '—'}</b><span>Latest run</span></div>
                </div>
                <div className="at-tile" style={{ '--c': '#059669' }}>
                    <span className="at-tile-icon"><i className="mdi mdi-cash-multiple"></i></span>
                    <div><b>{stats.last ? moneyShort(stats.last.totalNet) : '—'}</b><span>Latest net payout</span></div>
                </div>
                <div className="at-tile" style={{ '--c': '#0284c7' }}>
                    <span className="at-tile-icon"><i className="mdi mdi-chart-line"></i></span>
                    <div><b>{moneyShort(stats.paidYtd)}</b><span>Paid in {year}</span></div>
                </div>
                <div className="at-tile" style={{ '--c': stats.needsAction ? '#d97706' : '#64748b' }}>
                    <span className="at-tile-icon"><i className="mdi mdi-progress-clock"></i></span>
                    <div><b>{stats.needsAction}</b><span>Runs not yet paid</span></div>
                </div>
            </div>

            {isAdmin && (
                <section className="pp-card pr-run">
                    <div>
                        <h3><i className="mdi mdi-play-circle-outline me-2" style={{ color: '#0284c7' }}></i>Run payroll</h3>
                        <p>Creates a payslip for every employee who has a <Link to="/payroll/salary-structure" style={{ color: '#0284c7', fontWeight: 600 }}>salary structure</Link>. You'll review and approve it before anyone is paid.</p>
                        {existing && <div className="pr-exists"><i className="mdi mdi-alert-outline"></i>{periodLabel(period)} already has a run ({existing.status}).</div>}
                    </div>
                    <div className="pr-run-ctrl">
                        <div className="pp-field">
                            <label className="pp-label">Pay period</label>
                            <input type="month" className="pp-input" value={period} onChange={(e) => setPeriod(e.target.value)} />
                        </div>
                        <button type="button" className="pp-btn primary" onClick={onGenerate} disabled={!period}>
                            <i className="mdi mdi-lightning-bolt-outline"></i> Generate
                        </button>
                    </div>
                </section>
            )}

            <section className="pp-card">
                <div className="pp-card-head"><h3>Payroll history</h3><small>{all.length} run{all.length === 1 ? '' : 's'}</small></div>
                {!all.length ? (
                    <EmptyState icon="mdi-history" title="No payroll runs yet" text={isAdmin ? 'Pick a month above and generate your first run.' : 'Runs will appear here once payroll is processed.'} />
                ) : all.map((r) => {
                    const open = openId === r._id
                    return (
                        <div key={r._id} className="pr-row">
                            <div className="pr-main">
                                <MonthTile period={r.period} color={payStatusMeta(r.status).color} />
                                <div className="pr-period">
                                    <b>{periodLabel(r.period)}</b>
                                    <small><i className="mdi mdi-account-group-outline"></i> {r.employeeCount} employee{r.employeeCount === 1 ? '' : 's'}</small>
                                </div>
                                <div className="pr-fig"><small>Gross</small><b>{money(r.totalGross)}</b></div>
                                <div className="pr-fig ded"><small>Deductions</small><b>− {money(r.totalDeductions)}</b></div>
                                <div className="pr-fig net"><small>Net pay</small><b>{money(r.totalNet)}</b></div>
                                <div className="pr-actions">
                                    <PayStatus status={r.status} />
                                    {isAdmin && r.status === 'Draft' && <button type="button" className="pr-btn approve" onClick={() => onApprove(r)}><i className="mdi mdi-check"></i> Approve</button>}
                                    {isAdmin && r.status === 'Approved' && <button type="button" className="pr-btn pay" onClick={() => onMarkPaid(r)}><i className="mdi mdi-cash-check"></i> Mark paid</button>}
                                    <button type="button" className={`pr-toggle ${open ? 'open' : ''}`} onClick={() => onToggle(r._id)} aria-expanded={open} title={open ? 'Hide payslips' : 'View payslips'} aria-label={open ? 'Hide payslips' : 'View payslips'}>
                                        <i className="mdi mdi-chevron-down"></i>
                                    </button>
                                </div>
                            </div>
                            <Pipeline run={r} />

                            {open && (
                                <div className="pr-detail">
                                    {!detailRows ? (
                                        <div className="p-3"><div className="pp-skel" style={{ height: 40 }}></div></div>
                                    ) : !detailRows.length ? (
                                        <p className="pp-muted-dash text-center py-3 mb-0">No payslips in this run.</p>
                                    ) : (
                                        <table className="at-table">
                                            <thead>
                                                <tr>
                                                    <th><i className="mdi mdi-account-outline"></i>Employee</th>
                                                    <th className="hide-md"><i className="mdi mdi-trending-up"></i>Gross</th>
                                                    <th className="hide-sm"><i className="mdi mdi-trending-down"></i>Deductions</th>
                                                    <th><i className="mdi mdi-cash"></i>Net pay</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {detailRows.map((p) => (
                                                    <tr key={p._id}>
                                                        <td>
                                                            <div className="at-person">
                                                                <Avatar person={p.employeeId} size={32} />
                                                                <div><b>{fullName(p.employeeId)}</b><small>{[p.employeeId?.employeeId, p.employeeId?.department].filter(Boolean).join(' · ')}</small></div>
                                                            </div>
                                                        </td>
                                                        <td className="hide-md"><span className="py-amount">{money(p.grossPay)}</span></td>
                                                        <td className="hide-sm"><span className="py-amount neg">− {money(p.totalDeductions)}</span></td>
                                                        <td><span className="py-amount net">{money(p.netPay)}</span></td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            )}
                        </div>
                    )
                })}
            </section>
        </PeopleShell>
    )
}
