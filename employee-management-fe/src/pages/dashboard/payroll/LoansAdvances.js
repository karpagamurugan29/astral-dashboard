import React, { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useForm } from 'react-hook-form'
import payrollActions from '../../../redux/payroll/Actions'
import { PeopleShell, Avatar, EmptyState, ErrorBanner, fullName, fmtDate } from '../../../components/people/PeopleUI'
import { PAYROLL_ROOT, CURRENCY, money, moneyShort, PayStatus, payStatusMeta } from '../../../components/payroll/PayrollUI'
import '../../../components/attendance/attendance.css'
import './LoansAdvances.css'
import { useAccess } from '../../../hooks/useAccess'
import { FormModal } from '../../../components/common/FormModal'
import { confirmAction } from '../../../components/common/ConfirmDialog'

const monthsToRepay = (amount, monthly) => (amount > 0 && monthly > 0 ? Math.ceil(amount / monthly) : 0)
const lastDeductionMonth = (months) => {
    const d = new Date()
    d.setMonth(d.getMonth() + months)
    return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

// Remaining balance falls back to the full amount until it's been disbursed.
const remainingOf = (l) => (l.remainingBalance ?? (['Disbursed', 'Closed'].includes(l.status) ? 0 : l.amount))

const LoanCard = ({ loan, showWho, children }) => {
    const m = payStatusMeta(loan.status)
    const remaining = l => remainingOf(l)
    const left = remaining(loan)
    const repaid = Math.max(0, (Number(loan.amount) || 0) - left)
    const pct = loan.amount ? (repaid / loan.amount) * 100 : 0
    const tracking = ['Disbursed', 'Closed'].includes(loan.status)
    return (
        <article className="pp-card ln-card" style={{ '--c': m.color }}>
            {showWho && (
                <div className="ln-who">
                    <Avatar person={loan.employeeId} size={36} />
                    <div><b>{fullName(loan.employeeId)}</b><small>{[loan.employeeId?.designation, loan.employeeId?.department].filter(Boolean).join(' · ') || 'Requested ' + fmtDate(loan.createdAt)}</small></div>
                </div>
            )}
            <div className="ln-card-head">
                <div><b>{money(loan.amount)}</b><small>{money(loan.monthlyDeduction)} / month · {monthsToRepay(loan.amount, loan.monthlyDeduction)} months</small></div>
                <PayStatus status={loan.status} />
            </div>
            {loan.reason && <div className="ln-reason">{loan.reason}</div>}
            {tracking && (
                <div className="ln-progress">
                    <div className="ln-progress-head"><span>Repaid <b>{money(repaid)}</b></span><span><b>{money(left)}</b> left</span></div>
                    <div className="ln-track"><span style={{ width: `${pct}%` }}></span></div>
                </div>
            )}
            {children}
        </article>
    )
}

export const LoansAdvances = () => {
    const dispatch = useDispatch()
    const { myLoans, allLoans, error } = useSelector((state) => state.payrollReducer || {})
    const { can } = useAccess()
    const canManage = can(['Admin', 'HR'], 'payroll')
    const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm({ defaultValues: { amount: '', monthlyDeduction: '', reason: '' } })
    const [asking, setAsking] = useState(false)
    const openAsk = () => { reset({ amount: '', monthlyDeduction: '', reason: '' }); setAsking(true) }
    const closeAsk = () => { reset({ amount: '', monthlyDeduction: '', reason: '' }); setAsking(false) }

    useEffect(() => {
        dispatch({ type: payrollActions.GET_MY_LOANS })
        if (canManage) {
            dispatch({ type: payrollActions.GET_ALL_LOANS })
        }
    }, [dispatch, canManage])

    const onSubmit = (data) => {
        dispatch({ type: payrollActions.REQUEST_LOAN, payload: data })
        reset({ amount: '', monthlyDeduction: '', reason: '' })
        setAsking(false)
    }

    const onDecide = async (l, status) => {
        if (status === 'Rejected' && !(await confirmAction({ title: 'Reject this request?', message: `${fullName(l.employeeId)} asked for ${money(l.amount)}.`, confirmLabel: 'Reject' }))) return
        dispatch({ type: payrollActions.DECIDE_LOAN, id: l._id, status })
    }
    const onDisburse = async (l) => {
        if (await confirmAction({ title: `Mark ${money(l.amount)} as paid out?`, message: `To ${fullName(l.employeeId)}. Monthly deductions of ${money(l.monthlyDeduction)} start from the next payroll.`, confirmLabel: 'Mark paid out', tone: 'primary' })) {
            dispatch({ type: payrollActions.DISBURSE_LOAN, id: l._id })
        }
    }

    const mine = useMemo(() => [...(myLoans || [])].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)), [myLoans])
    const everyone = allLoans || []
    const toReview = everyone.filter((l) => l.status === 'Pending')
    const toDisburse = everyone.filter((l) => l.status === 'Approved')
    const others = everyone.filter((l) => !['Pending', 'Approved'].includes(l.status))

    const outstanding = mine.filter((l) => l.status === 'Disbursed').reduce((s, l) => s + (Number(remainingOf(l)) || 0), 0)
    const monthlyCut = mine.filter((l) => l.status === 'Disbursed' && remainingOf(l) > 0).reduce((s, l) => s + (Number(l.monthlyDeduction) || 0), 0)

    const amount = Number(watch('amount')) || 0
    const monthly = Number(watch('monthlyDeduction')) || 0
    const months = monthsToRepay(amount, monthly)

    return (
        <PeopleShell title="Loans & advances" root={PAYROLL_ROOT} crumbs={[{ label: 'Loans & advances' }]}>
            <ErrorBanner error={error} />

            <div className="at-tiles">
                <div className="at-tile" style={{ '--c': '#e11d48' }}>
                    <span className="at-tile-icon"><i className="mdi mdi-cash-minus"></i></span>
                    <div><b>{money(outstanding)}</b><span>My outstanding balance</span></div>
                </div>
                <div className="at-tile" style={{ '--c': '#d97706' }}>
                    <span className="at-tile-icon"><i className="mdi mdi-calendar-sync-outline"></i></span>
                    <div><b>{money(monthlyCut)}</b><span>Deducted each month</span></div>
                </div>
                <div className="at-tile" style={{ '--c': '#0284c7' }}>
                    <span className="at-tile-icon"><i className="mdi mdi-timer-sand"></i></span>
                    <div><b>{mine.filter((l) => l.status === 'Pending').length}</b><span>My pending requests</span></div>
                </div>
                {canManage && (
                    <div className="at-tile" style={{ '--c': toReview.length ? '#7c3aed' : '#64748b' }}>
                        <span className="at-tile-icon"><i className="mdi mdi-inbox-arrow-down-outline"></i></span>
                        <div><b>{toReview.length + toDisburse.length}</b><span>Need your action</span></div>
                    </div>
                )}
            </div>

            {/* ================= Admin / HR: review ================= */}
            {canManage && (
                <>
                    <h2 className="ln-section-title"><i className="mdi mdi-shield-account-outline" style={{ color: '#7c3aed' }}></i>Review requests</h2>
                    {!toReview.length && !toDisburse.length ? (
                        <div className="pp-card mb-4"><EmptyState icon="mdi-check-all" title="Nothing to review" text="New advance requests and approved advances waiting to be paid out will appear here." /></div>
                    ) : (
                        <div className="ln-cards grid mb-4">
                            {toReview.map((l) => (
                                <LoanCard key={l._id} loan={l} showWho>
                                    <div className="ln-actions">
                                        <button type="button" className="ln-btn reject" onClick={() => onDecide(l, 'Rejected')}><i className="mdi mdi-close"></i> Reject</button>
                                        <button type="button" className="ln-btn approve" onClick={() => onDecide(l, 'Approved')}><i className="mdi mdi-check"></i> Approve</button>
                                    </div>
                                </LoanCard>
                            ))}
                            {toDisburse.map((l) => (
                                <LoanCard key={l._id} loan={l} showWho>
                                    <div className="ln-actions single">
                                        <button type="button" className="ln-btn disburse" onClick={() => onDisburse(l)}><i className="mdi mdi-bank-transfer-out"></i> Mark as paid out</button>
                                    </div>
                                </LoanCard>
                            ))}
                        </div>
                    )}

                    {others.length > 0 && (
                        <section className="pp-card mb-4">
                            <div className="pp-card-head"><h3>All advances</h3><small>{others.length} closed, active or rejected</small></div>
                            <div className="at-table-wrap">
                                <table className="at-table">
                                    <thead>
                                        <tr>
                                            <th><i className="mdi mdi-account-outline"></i>Employee</th>
                                            <th><i className="mdi mdi-cash"></i>Amount</th>
                                            <th className="hide-md"><i className="mdi mdi-calendar-sync-outline"></i>Monthly</th>
                                            <th className="hide-sm"><i className="mdi mdi-progress-check"></i>Repaid</th>
                                            <th><i className="mdi mdi-shield-check-outline"></i>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {others.map((l) => {
                                            const left = remainingOf(l)
                                            const pct = l.amount ? ((l.amount - left) / l.amount) * 100 : 0
                                            return (
                                                <tr key={l._id}>
                                                    <td><div className="at-person"><Avatar person={l.employeeId} size={32} /><div><b>{fullName(l.employeeId)}</b><small>{l.reason}</small></div></div></td>
                                                    <td><span className="py-amount">{money(l.amount)}</span></td>
                                                    <td className="hide-md"><span className="py-amount">{money(l.monthlyDeduction)}</span></td>
                                                    <td className="hide-sm">
                                                        {l.status === 'Rejected' ? <span className="pp-muted-dash">—</span> : (
                                                            <div className="at-hours" style={{ '--c': '#10b981' }}>
                                                                <span className="at-hours-num">{Math.round(pct)}%</span>
                                                                <span className="at-hours-bar"><span style={{ width: `${pct}%` }}></span></span>
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td><PayStatus status={l.status} /></td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    )}
                </>
            )}

            {/* ================= Me ================= */}
            <h2 className="ln-section-title"><i className="mdi mdi-account-cash-outline" style={{ color: '#0284c7' }}></i>My advances
                <button type="button" className="pp-btn primary sm" style={{ marginLeft: 'auto' }} onClick={openAsk}><i className="mdi mdi-cash-plus"></i> Request an advance</button>
            </h2>
            {asking && (
                <FormModal icon="mdi-cash-plus" title="Request a salary advance" sub="Repaid from your salary each month" onClose={closeAsk} onSubmit={handleSubmit(onSubmit)} submitLabel="Submit request" submitIcon="mdi-send-outline" busy={isSubmitting}>
                    <div className="pp-card-body">
                        <div className="ln-form-grid">
                            <div className="pp-field">
                                <label className="pp-label">Amount<span className="req">*</span></label>
                                <div className="ln-money"><span>{CURRENCY}</span>
                                    <input type="number" min="1" placeholder="0" className={`pp-input ${errors.amount ? 'is-invalid' : ''}`}
                                        {...register('amount', { required: 'Enter an amount', valueAsNumber: true, min: { value: 1, message: 'Must be more than 0' } })} />
                                </div>
                                {errors.amount && <div className="pp-err">{errors.amount.message}</div>}
                            </div>
                            <div className="pp-field">
                                <label className="pp-label">Repay per month<span className="req">*</span></label>
                                <div className="ln-money"><span>{CURRENCY}</span>
                                    <input type="number" min="1" placeholder="0" className={`pp-input ${errors.monthlyDeduction ? 'is-invalid' : ''}`}
                                        {...register('monthlyDeduction', {
                                            required: 'Enter a monthly amount', valueAsNumber: true, min: { value: 1, message: 'Must be more than 0' },
                                            validate: (v) => !amount || v <= amount || 'Can’t be more than the amount',
                                        })} />
                                </div>
                                {errors.monthlyDeduction && <div className="pp-err">{errors.monthlyDeduction.message}</div>}
                            </div>
                            <div className="pp-field span-2">
                                <label className="pp-label">Reason<span className="req">*</span></label>
                                <input type="text" placeholder="e.g. Medical expenses for a family member" className={`pp-input ${errors.reason ? 'is-invalid' : ''}`} {...register('reason', { required: 'Add a reason' })} />
                                {errors.reason && <div className="pp-err">{errors.reason.message}</div>}
                            </div>
                        </div>

                        {months > 0 && (
                            <div className={`ln-estimate ${months > 24 ? 'warn' : ''}`}>
                                <i className={`mdi ${months > 24 ? 'mdi-alert-outline' : 'mdi-calendar-check-outline'}`}></i>
                                <span>Repaid in <b>{months} month{months === 1 ? '' : 's'}</b> · last deduction around <b>{lastDeductionMonth(months)}</b>{months > 24 ? ' — that’s a long time; consider a higher monthly amount.' : ''}</span>
                            </div>
                        )}

                    </div>
                </FormModal>
            )}
            <div>
                <section>
                    {!mine.length ? (
                        <div className="pp-card"><EmptyState icon="mdi-cash-plus" title="No advances yet" text="Request a salary advance and track its repayment here." action={<button type="button" className="pp-btn primary" onClick={openAsk}><i className="mdi mdi-plus"></i> Request an advance</button>} /></div>
                    ) : (
                        <div className="ln-cards">
                            {mine.map((l) => <LoanCard key={l._id} loan={l} />)}
                        </div>
                    )}
                </section>
            </div>

            {canManage && everyone.length > 0 && (
                <p className="pp-muted-dash text-center" style={{ fontSize: 12.5 }}>Total advanced across the company: <b>{moneyShort(everyone.filter((l) => ['Disbursed', 'Closed'].includes(l.status)).reduce((s, l) => s + (Number(l.amount) || 0), 0))}</b></p>
            )}
        </PeopleShell>
    )
}
