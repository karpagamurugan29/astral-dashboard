import React, { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import expenseActions from '../../../redux/expense/Actions'
import { PeopleShell, Avatar, EmptyState, ErrorBanner, fullName } from '../../../components/people/PeopleUI'
import { money, moneyShort } from '../../../components/payroll/PayrollUI'
import {
    EXPENSE_ROOT, CATEGORIES, ExpenseStatus, categoryMeta, CategoryIcon, CategoryTag, ReceiptLink, receiptHref, isImage, ownerId,
} from '../../../components/expense/ExpenseUI'
import '../../../components/attendance/attendance.css'
import '../../../components/payroll/payroll.css'

const DAY = 24 * 60 * 60 * 1000
const fmt = (d) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
const sum = (arr) => arr.reduce((s, e) => s + (Number(e.amount) || 0), 0)

export const ExpenseApprovals = () => {
    const dispatch = useDispatch()
    const { list, error } = useSelector((state) => state.expenseReducer || {})
    const { isAuthenticated: user, permissions } = useSelector((state) => state.authReducer || {})
    // Same rule as the sidebar's Expenses → Approvals entry.
    const canApprove = ['Admin', 'HR', 'Manager', 'Team Lead'].includes(user?.role) &&
        (user?.role === 'Admin' || permissions?.includes('expenses'))
    const [rejecting, setRejecting] = useState(null)
    const [reason, setReason] = useState('')
    const [categoryFilter, setCategoryFilter] = useState('')

    useEffect(() => {
        if (canApprove) dispatch({ type: expenseActions.GET_EXPENSES })
    }, [dispatch, canApprove])

    const onApprove = (ex) => dispatch({ type: expenseActions.UPDATE_EXPENSE_STATUS, id: ex._id, payload: { status: 'Approved' } })
    const onReject = (ex) => {
        dispatch({ type: expenseActions.UPDATE_EXPENSE_STATUS, id: ex._id, payload: { status: 'Rejected', rejectionReason: reason.trim() } })
        setRejecting(null)
        setReason('')
    }
    const onReimburse = (ex) => {
        if (window.confirm(`Mark ${money(ex.amount)} as reimbursed to ${fullName(ex.employeeId)}? Do this once the money has been paid.`)) {
            dispatch({ type: expenseActions.UPDATE_EXPENSE_STATUS, id: ex._id, payload: { status: 'Reimbursed' } })
        }
    }

    // Other people's claims only — your own live on My expenses.
    const others = useMemo(() => (list || []).filter((ex) => ownerId(ex) !== user?._id), [list, user])
    const byCat = (arr) => (categoryFilter ? arr.filter((e) => e.category === categoryFilter) : arr)
    const pending = byCat(others.filter((e) => e.status === 'Pending')).sort((a, b) => new Date(a.createdAt || a.expenseDate) - new Date(b.createdAt || b.expenseDate))
    const approved = byCat(others.filter((e) => e.status === 'Approved'))
    const history = byCat(others.filter((e) => ['Reimbursed', 'Rejected'].includes(e.status))).sort((a, b) => new Date(b.expenseDate) - new Date(a.expenseDate))
    const thisMonth = new Date().getMonth()
    const paidThisMonth = others.filter((e) => e.status === 'Reimbursed' && new Date(e.updatedAt || e.expenseDate).getMonth() === thisMonth)

    if (!canApprove) {
        return (
            <PeopleShell title="Expense approvals" root={EXPENSE_ROOT} crumbs={[{ label: 'Approvals' }]} backTo="/expenses">
                <div className="pp-card"><EmptyState icon="mdi-lock-outline" title="You don't have access" text="Only managers, team leads, HR and admins can review expense claims."
                    action={<Link to="/expenses" className="pp-btn">Go to my expenses</Link>} /></div>
            </PeopleShell>
        )
    }

    return (
        <PeopleShell title="Expense approvals" root={EXPENSE_ROOT} crumbs={[{ label: 'Approvals' }]} backTo="/expenses"
            actions={(
                <select className="pp-select" style={{ width: 'auto' }} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} aria-label="Category">
                    <option value="">All categories</option>
                    {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.value}</option>)}
                </select>
            )}>
            <ErrorBanner error={error} />

            <div className="at-tiles">
                <div className="at-tile" style={{ '--c': '#d97706' }}>
                    <span className="at-tile-icon"><i className="mdi mdi-inbox-arrow-down-outline"></i></span>
                    <div><b>{pending.length}</b><span>{money(sum(pending))} waiting</span></div>
                </div>
                <div className="at-tile" style={{ '--c': '#0284c7' }}>
                    <span className="at-tile-icon"><i className="mdi mdi-cash-refund"></i></span>
                    <div><b>{money(sum(approved))}</b><span>Approved · to pay</span></div>
                </div>
                <div className="at-tile" style={{ '--c': '#059669' }}>
                    <span className="at-tile-icon"><i className="mdi mdi-cash-check"></i></span>
                    <div><b>{moneyShort(sum(paidThisMonth))}</b><span>Reimbursed this month</span></div>
                </div>
                <div className="at-tile" style={{ '--c': '#7c3aed' }}>
                    <span className="at-tile-icon"><i className="mdi mdi-account-group-outline"></i></span>
                    <div><b>{new Set(pending.map(ownerId)).size}</b><span>People waiting</span></div>
                </div>
            </div>

            {/* ---------- waiting for approval ---------- */}
            <h2 className="ea-section" style={{ '--c': '#d97706' }}><i className="mdi mdi-inbox-arrow-down-outline" style={{ color: '#d97706' }}></i>Waiting for approval <span className="ea-count">{pending.length}</span></h2>
            {!pending.length ? (
                <div className="pp-card mb-4"><EmptyState icon="mdi-check-all" title="All caught up" text="No expense claims are waiting for your review." /></div>
            ) : (
                <div className="ea-grid">
                    {pending.map((ex) => {
                        const m = categoryMeta(ex.category)
                        const href = receiptHref(ex.receiptUrl)
                        const waited = Math.floor((Date.now() - new Date(ex.createdAt || ex.expenseDate).getTime()) / DAY)
                        const isRejecting = rejecting === ex._id
                        return (
                            <article key={ex._id} className="pp-card ea-card" style={{ '--c': m.color }}>
                                <div className="ea-head">
                                    <Avatar person={ex.employeeId} size={40} />
                                    <div className="ea-who">
                                        <Link to={`/employees/${ownerId(ex)}`}>{fullName(ex.employeeId)}</Link>
                                        <small>{waited <= 0 ? 'Submitted today' : `Waiting ${waited} day${waited === 1 ? '' : 's'}`}</small>
                                    </div>
                                    <span className="ea-amount">{money(ex.amount)}</span>
                                </div>
                                <div className="ea-body">
                                    <div className="ea-body-main">
                                        <div className="ea-meta">
                                            <CategoryTag category={ex.category} />
                                            <span><i className="mdi mdi-calendar-outline"></i> {fmt(ex.expenseDate)}</span>
                                            {!href && <span className="ea-nobill"><i className="mdi mdi-alert-outline"></i>No bill attached</span>}
                                        </div>
                                        {ex.description && <p className="ea-desc">{ex.description}</p>}
                                    </div>
                                    {href && (isImage(ex.receiptUrl)
                                        ? <a href={href} target="_blank" rel="noreferrer" title="Open bill"><img className="ea-thumb" src={href} alt="Bill" /></a>
                                        : <a className="ea-thumb-link" href={href} target="_blank" rel="noreferrer" title="Open bill"><i className="mdi mdi-file-pdf-box"></i></a>)}
                                </div>

                                {isRejecting && (
                                    <div className="ea-reject">
                                        <textarea autoFocus rows={2} className="pp-input" placeholder={`Tell ${ex.employeeId?.firstName || 'them'} why (optional)`} value={reason} onChange={(e) => setReason(e.target.value)}></textarea>
                                    </div>
                                )}
                                <div className="ea-actions">
                                    {isRejecting ? (
                                        <>
                                            <button type="button" className="pp-btn" onClick={() => { setRejecting(null); setReason('') }}>Back</button>
                                            <button type="button" className="ea-btn reject solid" onClick={() => onReject(ex)}><i className="mdi mdi-close"></i> Confirm reject</button>
                                        </>
                                    ) : (
                                        <>
                                            <button type="button" className="ea-btn reject" onClick={() => { setRejecting(ex._id); setReason('') }}><i className="mdi mdi-close"></i> Reject</button>
                                            <button type="button" className="ea-btn approve" onClick={() => onApprove(ex)}><i className="mdi mdi-check"></i> Approve {money(ex.amount)}</button>
                                        </>
                                    )}
                                </div>
                            </article>
                        )
                    })}
                </div>
            )}

            {/* ---------- ready to reimburse ---------- */}
            <h2 className="ea-section" style={{ '--c': '#0284c7' }}><i className="mdi mdi-cash-refund" style={{ color: '#0284c7' }}></i>Ready to reimburse <span className="ea-count">{approved.length}</span></h2>
            <section className="pp-card mb-4">
                {!approved.length ? (
                    <EmptyState icon="mdi-cash-check" title="Nothing to pay out" text="Approved claims will wait here until you mark them reimbursed." />
                ) : approved.map((ex) => (
                    <div key={ex._id} className="ex-row">
                        <CategoryIcon category={ex.category} />
                        <div className="ex-row-main">
                            <div className="ex-row-title">{fullName(ex.employeeId)} · {ex.description || ex.category}</div>
                            <div className="ex-row-sub"><CategoryTag category={ex.category} /><span>{fmt(ex.expenseDate)}</span><ReceiptLink url={ex.receiptUrl} /></div>
                        </div>
                        <span className="ex-amt">{money(ex.amount)}</span>
                        <button type="button" className="ea-btn pay" onClick={() => onReimburse(ex)}><i className="mdi mdi-bank-transfer-out"></i> Mark paid</button>
                    </div>
                ))}
            </section>

            {/* ---------- history ---------- */}
            {history.length > 0 && (
                <section className="pp-card">
                    <div className="pp-card-head"><h3>Decided claims</h3><small>{history.length}</small></div>
                    <div className="at-table-wrap">
                        <table className="at-table">
                            <thead>
                                <tr>
                                    <th><i className="mdi mdi-account-outline"></i>Employee</th>
                                    <th className="hide-md"><i className="mdi mdi-shape-outline"></i>Category</th>
                                    <th className="hide-sm"><i className="mdi mdi-calendar-outline"></i>Date</th>
                                    <th><i className="mdi mdi-cash"></i>Amount</th>
                                    <th><i className="mdi mdi-shield-check-outline"></i>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {history.map((ex) => (
                                    <tr key={ex._id}>
                                        <td><div className="at-person"><Avatar person={ex.employeeId} size={32} /><div><b>{fullName(ex.employeeId)}</b><small>{ex.status === 'Rejected' && ex.rejectionReason ? `Rejected: ${ex.rejectionReason}` : ex.description}</small></div></div></td>
                                        <td className="hide-md"><CategoryTag category={ex.category} /></td>
                                        <td className="hide-sm">{fmt(ex.expenseDate)}</td>
                                        <td><span className="py-amount">{money(ex.amount)}</span></td>
                                        <td><ExpenseStatus status={ex.status} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}
        </PeopleShell>
    )
}
