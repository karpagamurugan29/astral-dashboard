import React, { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import payrollActions from '../../../redux/payroll/Actions'
import { PeopleShell, EmptyState, ErrorBanner, fullName } from '../../../components/people/PeopleUI'
import { PAYROLL_ROOT, EARNINGS, DEDUCTIONS, money, moneyShort, periodLabel, MonthTile, BreakdownBar } from '../../../components/payroll/PayrollUI'
import '../../../components/attendance/attendance.css'
import './Payslips.css'

const Lines = ({ data, parts }) => (
    <div className="py-legend">
        {parts.map((p) => (
            <div key={p.key} className="py-line" style={{ '--c': p.color }}>
                <i className={`mdi ${p.icon}`}></i><span>{p.label}</span><b>{money(data?.[p.key])}</b>
            </div>
        ))}
    </div>
)

export const Payslips = () => {
    const dispatch = useDispatch()
    const { myPayslips, payslipDetail, error } = useSelector((state) => state.payrollReducer || {})
    const { isAuthenticated: user } = useSelector((state) => state.authReducer || {})
    const [openId, setOpenId] = useState(null)

    useEffect(() => {
        dispatch({ type: payrollActions.GET_MY_PAYSLIPS })
    }, [dispatch])

    const slips = useMemo(() => [...(myPayslips || [])].sort((a, b) => String(b.period).localeCompare(String(a.period))), [myPayslips])

    // Open the latest payslip by default.
    useEffect(() => {
        if (!openId && slips.length) setOpenId(slips[0]._id)
    }, [slips, openId])

    useEffect(() => {
        if (openId) dispatch({ type: payrollActions.GET_PAYSLIP_BY_ID, id: openId })
    }, [dispatch, openId])

    const year = String(new Date().getFullYear())
    const stats = useMemo(() => {
        const ytd = slips.filter((p) => String(p.period).startsWith(year))
        return {
            latest: slips[0],
            ytd: ytd.reduce((s, p) => s + (Number(p.netPay) || 0), 0),
            avg: slips.length ? slips.reduce((s, p) => s + (Number(p.netPay) || 0), 0) / slips.length : 0,
        }
    }, [slips, year])

    const trend = [...slips].slice(0, 12).reverse()
    const maxNet = Math.max(1, ...trend.map((p) => Number(p.netPay) || 0))
    const detail = payslipDetail && payslipDetail._id === openId ? payslipDetail : null
    const listItem = slips.find((p) => p._id === openId)

    return (
        <PeopleShell title="My payslips" root={PAYROLL_ROOT} crumbs={[{ label: 'Payslips' }]}>
            <ErrorBanner error={error} />

            {!slips.length ? (
                <div className="pp-card"><EmptyState icon="mdi-receipt" title="No payslips yet" text="Your payslips will appear here after payroll is processed each month." /></div>
            ) : (
                <>
                    <div className="at-tiles">
                        <div className="at-tile" style={{ '--c': '#059669' }}>
                            <span className="at-tile-icon"><i className="mdi mdi-cash"></i></span>
                            <div><b>{money(stats.latest?.netPay)}</b><span>Latest · {periodLabel(stats.latest?.period, { month: 'short', year: 'numeric' })}</span></div>
                        </div>
                        <div className="at-tile" style={{ '--c': '#0284c7' }}>
                            <span className="at-tile-icon"><i className="mdi mdi-chart-line"></i></span>
                            <div><b>{moneyShort(stats.ytd)}</b><span>Take-home in {year}</span></div>
                        </div>
                        <div className="at-tile" style={{ '--c': '#7c3aed' }}>
                            <span className="at-tile-icon"><i className="mdi mdi-scale-balance"></i></span>
                            <div><b>{money(stats.avg)}</b><span>Average per month</span></div>
                        </div>
                        <div className="at-tile" style={{ '--c': '#0b0f19' }}>
                            <span className="at-tile-icon"><i className="mdi mdi-receipt"></i></span>
                            <div><b>{slips.length}</b><span>Payslips</span></div>
                        </div>
                    </div>

                    <div className="ps-layout">
                        <div>
                            {trend.length > 1 && (
                                <section className="pp-card ps-trend mb-3">
                                    <div className="ps-trend-head"><b>Net pay trend</b><small>Last {trend.length} months</small></div>
                                    <div className="ps-bars">
                                        {trend.map((p) => (
                                            <button key={p._id} type="button" className={`ps-bar ${p._id === openId ? 'active' : ''}`} onClick={() => setOpenId(p._id)}
                                                title={`${periodLabel(p.period)}: ${money(p.netPay)}`} aria-label={`${periodLabel(p.period)} net ${money(p.netPay)}`}>
                                                <span style={{ height: `${Math.max(6, ((Number(p.netPay) || 0) / maxNet) * 100)}%` }}></span>
                                                <small>{periodLabel(p.period, { month: 'narrow' })}</small>
                                            </button>
                                        ))}
                                    </div>
                                </section>
                            )}

                            <section className="pp-card">
                                <div className="pp-card-head"><h3>All payslips</h3><small>{slips.length}</small></div>
                                <ul className="ps-list">
                                    {slips.map((p) => (
                                        <li key={p._id}>
                                            <button type="button" className={`ps-item ${p._id === openId ? 'active' : ''}`} onClick={() => setOpenId(p._id)} aria-pressed={p._id === openId}>
                                                <MonthTile period={p.period} color={p._id === openId ? '#0ea5e9' : '#0b0f19'} />
                                                <span className="ps-item-main">
                                                    <b>{periodLabel(p.period)}</b>
                                                    <small>Gross {money(p.grossPay)} · − {money(p.totalDeductions)}</small>
                                                </span>
                                                <span className="py-amount">{money(p.netPay)}</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        </div>

                        {/* ---------- payslip document ---------- */}
                        <article className="pp-card ps-doc" aria-label="Payslip">
                            <div className="ps-doc-head">
                                <div className="ps-brand">
                                    <span className="ps-brand-mark"><img src="assets/images/astral-mark.png" alt="" /></span>
                                    <div><b>Astral Consulting Limited</b><small>Salary slip</small></div>
                                </div>
                                <div className="ps-doc-period"><small>Pay period</small><b>{periodLabel(listItem?.period)}</b></div>
                            </div>

                            <div className="ps-emp">
                                <div><small>Employee</small><b>{fullName(user)}</b></div>
                                <div><small>Employee ID</small><b>{user?.employeeId || '—'}</b></div>
                                <div><small>Designation</small><b>{user?.designation || '—'}</b></div>
                                <div><small>Department</small><b>{user?.department || '—'}</b></div>
                            </div>

                            {!detail ? (
                                <div className="p-4"><div className="pp-skel" style={{ height: 180 }}></div></div>
                            ) : (
                                <>
                                    <div className="ps-cols">
                                        <div className="ps-col" style={{ '--c': '#047857' }}>
                                            <h4><i className="mdi mdi-trending-up"></i>Earnings</h4>
                                            <Lines data={detail} parts={EARNINGS} />
                                            <div className="py-line total"><span>Gross pay</span><b>{money(detail.grossPay)}</b></div>
                                        </div>
                                        <div className="ps-col" style={{ '--c': '#be123c' }}>
                                            <h4><i className="mdi mdi-trending-down"></i>Deductions</h4>
                                            <Lines data={detail} parts={DEDUCTIONS} />
                                            <div className="py-line total"><span>Total deductions</span><b>− {money(detail.totalDeductions)}</b></div>
                                        </div>
                                    </div>

                                    <div className="ps-net">
                                        <div><small>Net pay</small><b>{money(detail.netPay)}</b></div>
                                        <BreakdownBar data={detail} parts={EARNINGS} total={detail.grossPay} />
                                    </div>
                                </>
                            )}

                            <div className="ps-doc-foot">
                                <span>This is a system-generated payslip and doesn't need a signature.</span>
                                <button type="button" className="pp-btn sm ps-no-print" onClick={() => window.print()} disabled={!detail}>
                                    <i className="mdi mdi-printer"></i> Print / save PDF
                                </button>
                            </div>
                        </article>
                    </div>
                </>
            )}
        </PeopleShell>
    )
}
