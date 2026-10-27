import React, { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { DashNav } from '../dashboard/dash/DashNav'
import expenseActions from '../../redux/expense/Actions'
import { ErrorBanner } from '../people/PeopleUI'
import { toast } from '../common/Toaster'
import { confirmAction } from '../common/ConfirmDialog'
import { ownerId } from './ExpenseUI'
import {
    ExpensesHeader, ExpenseSummary, ExpenseTabs, KpiStrip, ExpenseToolbar, ExpenseTable, ExpenseCard, ExpensePagination, EmptyExpenseState, RowMenu,
} from './ExpenseParts'
import { ExpenseDetailsDrawer, AddExpenseDrawer, ReasonDialog } from './ExpenseDrawers'
import { ExpenseReports } from './ExpenseReports'
import {
    useExpenseRole, applyFilters, EMPTY_FILTERS, SORTS, fmtMoney, fmtShort, sumAmount, personName, expenseTitle, submittedOn, daysSince, thisMonth, lastMonth,
    pctChange, approvedOn, rejectedOn, reimbursedOn, exportCsv, exportExcel,
} from './expenseUtils'
import './expenses.css'

/* -------------------------------------------------------------------------- */
/*  Expense Management: Create → Submit → Review → Approve/Reject → Reimburse  */
/*  → Report. One screen with lifecycle tabs; /expenses/approvals opens it on  */
/*  the Pending tab. Data, API calls and the approval rules are unchanged —    */
/*  this reads and writes through the existing expense redux store.            */
/* -------------------------------------------------------------------------- */

const PER_PAGE = 12
const APPROVED = ['Approved', 'Processing', 'Reimbursed']
const VIEW = {
    all: { label: 'All Expenses', icon: 'mdi-format-list-bulleted', match: () => true, cols: ['expense', 'employee', 'category', 'amount', 'expenseDate', 'payment', 'status', 'submitted'], optional: ['payment', 'submitted'], optional2: ['category'], statuses: ['Draft', 'Pending', 'Changes Requested', 'Approved', 'Processing', 'Rejected', 'Reimbursed'] },
    pending: { label: 'Pending', icon: 'mdi-timer-sand', match: (e) => e.status === 'Pending', cols: ['employee', 'expense', 'category', 'amount', 'submitted', 'daysPending', 'priority'], optional: ['submitted'], sort: 'waiting' },
    approved: { label: 'Approved', icon: 'mdi-check-circle-outline', match: (e) => APPROVED.includes(e.status), cols: ['expense', 'employee', 'category', 'amount', 'approvedBy', 'approvedOn', 'reimbStatus'], optional: ['category', 'approvedBy'], optional2: ['approvedOn'], reimbursement: true },
    rejected: { label: 'Rejected', icon: 'mdi-close-circle-outline', match: (e) => e.status === 'Rejected', cols: ['expense', 'employee', 'category', 'amount', 'rejectedBy', 'rejectedOn', 'reason'], optional: ['category'] },
    reimbursed: { label: 'Reimbursed', icon: 'mdi-cash-check', match: (e) => e.status === 'Reimbursed', cols: ['expense', 'employee', 'amount', 'approvedOn', 'reimbursedOn', 'payment', 'status'], optional2: ['payment'] },
}

const useNarrow = () => {
    const q = '(max-width: 1023.98px)' // phones and tablets get cards
    const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(q).matches)
    useEffect(() => { const m = window.matchMedia?.(q); if (!m) return undefined; const on = () => setNarrow(m.matches); m.addEventListener?.('change', on); return () => m.removeEventListener?.('change', on) }, [])
    return narrow
}

export const ExpenseModule = ({ defaultTab = 'all' }) => {
    const dispatch = useDispatch()
    const { list: raw, listLoading, error } = useSelector((s) => s.expenseReducer || {})
    const role = useExpenseRole()
    const narrow = useNarrow()
    const [tab, setTab] = useState(defaultTab)
    const [filters, setFilters] = useState(EMPTY_FILTERS)
    const [sort, setSort] = useState(VIEW[defaultTab]?.sort || 'newest')
    const [page, setPage] = useState(1)
    const [selected, setSelected] = useState(new Set())
    const [openId, setOpenId] = useState(null)
    const [adding, setAdding] = useState(null) // null | 'new' | expense (edit)
    const [busy, setBusy] = useState(false)
    const [reason, setReason] = useState(null) // { ids, status }

    useEffect(() => { dispatch({ type: expenseActions.GET_EXPENSES }) }, [dispatch])
    // reviewers and finance see their team's / everyone's claims plus their own; everyone else their own
    const list = useMemo(() => (raw || []).filter((e) => role.reviewer || role.finance || role.mine(e)), [raw, role])
    const claims = useMemo(() => list.filter((e) => e.status !== 'Draft'), [list])
    useEffect(() => { setPage(1); setSelected(new Set()) }, [tab, filters, sort])
    useEffect(() => { setSort(VIEW[tab]?.sort || 'newest') }, [tab])

    const employees = useMemo(() => { const m = new Map(); list.forEach((e) => m.set(String(ownerId(e)), personName(e.employeeId))); return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)) }, [list])
    const departments = useMemo(() => [...new Set(list.map((e) => e.employeeId?.department).filter(Boolean))].sort(), [list])
    const team = role.reviewer || role.finance

    /* ---------------- summary ---------------- */
    const by = (st) => claims.filter((e) => st.includes(e.status))
    // month-on-month, shown only when last month has something to compare with
    const trendOf = (rows) => { const before = rows.filter((e) => lastMonth(e.expenseDate)).length; return before ? pctChange(rows.filter((e) => thisMonth(e.expenseDate)).length, before) : null }
    const amountTrend = (rows) => { const before = sumAmount(rows.filter((e) => lastMonth(e.expenseDate))); return before ? pctChange(sumAmount(rows.filter((e) => thisMonth(e.expenseDate))), before) : null }
    const summary = [
        { key: 'total', label: 'Total expenses', value: claims.length, sub: 'claims', trend: trendOf(claims), icon: 'mdi-receipt', tone: '#4338ca' },
        { key: 'pending', label: 'Pending approval', value: fmtShort(sumAmount(by(['Pending']))), sub: `${by(['Pending']).length} claims`, trend: amountTrend(by(['Pending'])), icon: 'mdi-timer-sand', tone: '#d97706' },
        { key: 'approved', label: 'Approved', value: fmtShort(sumAmount(by(['Approved', 'Processing']))), sub: `${by(['Approved', 'Processing']).length} to pay`, trend: amountTrend(by(['Approved', 'Processing'])), icon: 'mdi-check-circle-outline', tone: '#0284c7' },
        { key: 'rejected', label: 'Rejected', value: fmtShort(sumAmount(by(['Rejected']))), sub: `${by(['Rejected']).length} claims`, trend: amountTrend(by(['Rejected'])), icon: 'mdi-close-circle-outline', tone: '#e11d48' },
        { key: 'reimbursed', label: 'Reimbursed', value: fmtShort(sumAmount(by(['Reimbursed']))), sub: `${by(['Reimbursed']).length} claims`, trend: amountTrend(by(['Reimbursed'])), icon: 'mdi-cash-check', tone: '#059669' },
        { key: 'amount', label: 'Total amount', value: fmtShort(sumAmount(claims)), sub: 'all claims', trend: amountTrend(claims), icon: 'mdi-wallet-outline', tone: '#475569' },
    ]

    const tabs = [
        ...Object.entries(VIEW).map(([key, v]) => ({ key, label: key === 'all' ? 'All' : v.label, icon: v.icon, count: list.filter(v.match).length })),
        ...(role.finance ? [{ key: 'reports', label: 'Reports', icon: 'mdi-chart-box-outline' }] : []),
    ]

    /* ---------------- current view rows ---------------- */
    const view = VIEW[tab]
    const rows = useMemo(() => (view ? applyFilters(list.filter(view.match), filters).sort(SORTS[sort]?.[1] || SORTS.newest[1]) : []), [list, view, filters, sort])
    const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE))
    const pageRows = rows.slice((page - 1) * PER_PAGE, page * PER_PAGE)
    const cols = view ? view.cols.filter((c) => team || c !== 'employee') : []

    const kpis = useMemo(() => {
        if (tab === 'pending') {
            const p = list.filter((e) => e.status === 'Pending')
            const oldest = p.reduce((o, e) => (!o || new Date(submittedOn(e) || e.createdAt) < new Date(submittedOn(o) || o.createdAt) ? e : o), null)
            const mineToDecide = p.filter((e) => role.canDecide(e))
            return [
                { label: 'Pending expenses', value: p.length },
                { label: 'Pending amount', value: fmtMoney(sumAmount(p)) },
                { label: 'Oldest pending', value: oldest ? `${daysSince(submittedOn(oldest) || oldest.createdAt)} days` : '—', sub: oldest ? `${personName(oldest.employeeId)} · ${expenseTitle(oldest)}` : null, warn: oldest && daysSince(submittedOn(oldest) || oldest.createdAt) >= 7 },
                ...(role.reviewer ? [{ label: 'Awaiting my approval', value: mineToDecide.length, sub: fmtMoney(sumAmount(mineToDecide)), warn: mineToDecide.length > 0 }] : []),
            ]
        }
        if (tab === 'approved') {
            const a = list.filter((e) => APPROVED.includes(e.status))
            const awaiting = a.filter((e) => e.status !== 'Reimbursed')
            return [
                { label: 'Total approved', value: a.length },
                { label: 'Approved amount', value: fmtMoney(sumAmount(a)) },
                { label: 'Approved this month', value: a.filter((e) => thisMonth(approvedOn(e))).length, sub: fmtMoney(sumAmount(a.filter((e) => thisMonth(approvedOn(e))))) },
                { label: 'Awaiting reimbursement', value: fmtMoney(sumAmount(awaiting)), sub: `${awaiting.length} claims`, warn: awaiting.length > 0 },
            ]
        }
        if (tab === 'rejected') {
            const r = list.filter((e) => e.status === 'Rejected')
            const reasons = new Map(); r.forEach((e) => { const k = (e.rejectionReason || 'No reason given').trim().toLowerCase(); reasons.set(k, (reasons.get(k) || 0) + 1) })
            const top = [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2)
            return [
                { label: 'Rejected', value: r.length },
                { label: 'Rejected amount', value: fmtMoney(sumAmount(r)) },
                { label: 'Rejected this month', value: r.filter((e) => thisMonth(rejectedOn(e))).length },
                { label: 'Common reasons', value: top.length ? top.map(([k, n]) => `${k.charAt(0).toUpperCase()}${k.slice(1)} (${n})`).join(' · ') : '—', title: top.map(([k]) => k).join('\n') },
            ]
        }
        if (tab === 'reimbursed') {
            const r = list.filter((e) => e.status === 'Reimbursed')
            const due = list.filter((e) => ['Approved', 'Processing'].includes(e.status))
            return [
                { label: 'Total reimbursed', value: r.length },
                { label: 'Reimbursed amount', value: fmtMoney(sumAmount(r)) },
                { label: 'Pending reimbursement', value: fmtMoney(sumAmount(due)), sub: `${due.length} claims`, warn: due.length > 0 },
                { label: 'Reimbursed this month', value: fmtMoney(sumAmount(r.filter((e) => thisMonth(reimbursedOn(e))))) },
            ]
        }
        return null
    }, [tab, list, role])

    /* ---------------- actions ---------------- */
    const after = (closeDrawer = false) => (ok, message) => { setBusy(false); ok ? toast.success(message) : toast.error(message); if (ok && closeDrawer) setOpenId(null) }
    const setStatus = (e, status, extra = {}) => { setBusy(true); dispatch({ type: expenseActions.UPDATE_EXPENSE_STATUS, id: e._id, payload: { status, ...extra }, onDone: after() }) }
    const approve = async (e) => {
        if (await confirmAction({ title: `Approve ${fmtMoney(e.amount, e.currency)}?`, message: `${expenseTitle(e)} — ${personName(e.employeeId)}`, confirmLabel: 'Approve', tone: 'primary' })) setStatus(e, 'Approved')
    }
    const processing = async (e) => {
        if (await confirmAction({ title: 'Start reimbursement?', message: `Marks ${fmtMoney(e.amount, e.currency)} to ${personName(e.employeeId)} as being processed by finance.`, confirmLabel: 'Mark processing', tone: 'primary' })) setStatus(e, 'Processing')
    }
    const reimburse = async (e) => {
        if (await confirmAction({ title: `Mark ${fmtMoney(e.amount, e.currency)} as reimbursed?`, message: `To ${personName(e.employeeId)}. Do this only once the money has been paid.`, confirmLabel: 'Mark reimbursed', tone: 'primary' })) setStatus(e, 'Reimbursed')
    }
    const remove = async (e) => {
        if (await confirmAction({ title: e.status === 'Draft' ? 'Delete this draft?' : 'Delete this claim?', message: `${expenseTitle(e)} · ${fmtMoney(e.amount, e.currency)}. This can't be undone.`, confirmLabel: 'Delete' })) {
            dispatch({ type: expenseActions.DELETE_EXPENSE, id: e._id, onDone: after(true) })
        }
    }
    const save = (data, file, submit) => {
        setBusy(true)
        const done = (ok, message) => { setBusy(false); if (ok) { toast.success(message); setAdding(null) } else toast.error(message) }
        if (adding && adding !== 'new') {
            dispatch({ type: expenseActions.UPDATE_EXPENSE, id: adding._id, payload: { ...data, submit }, receiptFile: file, onDone: done })
        } else {
            dispatch({ type: expenseActions.ADD_EXPENSE, payload: { ...data, draft: !submit }, receiptFile: file, onDone: done })
        }
    }
    const confirmReason = (text) => {
        const { ids, status } = reason
        setReason(null); setBusy(true)
        const payload = status === 'Rejected' ? { status, rejectionReason: text } : { status, comment: text }
        if (ids.length === 1) dispatch({ type: expenseActions.UPDATE_EXPENSE_STATUS, id: ids[0], payload, onDone: after() })
        else dispatch({ type: expenseActions.BULK_EXPENSE_STATUS, ids, payload, onDone: (ok, m) => { after()(ok, m); setSelected(new Set()) } })
    }

    // actions a person may take on a claim — never shown when they can't
    const actionItems = (e) => [
        { label: 'View details', icon: 'mdi-eye-outline', onClick: () => setOpenId(e._id) },
        role.canDecide(e) && { label: 'Approve', icon: 'mdi-check', onClick: () => approve(e) },
        role.canDecide(e) && { label: 'Request changes', icon: 'mdi-pencil-circle-outline', onClick: () => setReason({ ids: [e._id], status: 'Changes Requested' }) },
        role.canDecide(e) && { label: 'Reject', icon: 'mdi-close', tone: 'danger', onClick: () => setReason({ ids: [e._id], status: 'Rejected' }) },
        role.canPay(e) && e.status === 'Approved' && { label: 'Mark as processing', icon: 'mdi-progress-clock', onClick: () => processing(e) },
        role.canPay(e) && { label: 'Mark as reimbursed', icon: 'mdi-cash-check', onClick: () => reimburse(e) },
        role.canEdit(e) && { label: e.status === 'Draft' ? 'Edit draft' : 'Edit & resubmit', icon: 'mdi-pencil-outline', onClick: () => setAdding(e) },
        role.canDelete(e) && { label: 'Delete', icon: 'mdi-delete-outline', tone: 'danger', onClick: () => remove(e) },
    ]
    const primary = (e) => role.canDecide(e) ? <button type="button" className="xp-btn sm" onClick={() => setOpenId(e._id)}>Review</button>
        : role.canPay(e) ? <button type="button" className="xp-btn sm" onClick={() => reimburse(e)}>Reimburse</button>
            : role.canEdit(e) ? <button type="button" className="xp-btn sm" onClick={() => setAdding(e)}>{e.status === 'Draft' ? 'Continue' : 'Edit & resubmit'}</button> : null
    const rowActions = (e) => <span className="xp-row-acts">{primary(e)}<RowMenu items={actionItems(e)} /></span>

    /* ---------------- bulk ---------------- */
    const sel = rows.filter((e) => selected.has(e._id))
    const decidable = sel.filter((e) => role.canDecide(e))
    const payable = sel.filter((e) => role.canPay(e))
    const bulkApprove = async () => {
        if (await confirmAction({ title: `Approve ${decidable.length} claim${decidable.length === 1 ? '' : 's'}?`, message: `Total ${fmtMoney(sumAmount(decidable))}.${decidable.length < sel.length ? ` ${sel.length - decidable.length} selected claim(s) can't be approved by you and will be skipped.` : ''}`, confirmLabel: 'Approve all', tone: 'primary' })) {
            setBusy(true); dispatch({ type: expenseActions.BULK_EXPENSE_STATUS, ids: decidable.map((e) => e._id), payload: { status: 'Approved' }, onDone: (ok, m) => { after()(ok, m); setSelected(new Set()) } })
        }
    }
    const bulkReimburse = async () => {
        if (await confirmAction({ title: `Mark ${payable.length} claim${payable.length === 1 ? '' : 's'} as reimbursed?`, message: `Total ${fmtMoney(sumAmount(payable))}. Do this only once the money has been paid.`, confirmLabel: 'Mark reimbursed', tone: 'primary' })) {
            setBusy(true); dispatch({ type: expenseActions.BULK_EXPENSE_STATUS, ids: payable.map((e) => e._id), payload: { status: 'Reimbursed' }, onDone: (ok, m) => { after()(ok, m); setSelected(new Set()) } })
        }
    }
    const exportName = `expenses-${tab}-${new Date().toISOString().slice(0, 10)}`

    const open = openId ? list.find((e) => e._id === openId) : null
    const ownNeedsAction = list.filter((e) => role.mine(e) && ['Changes Requested', 'Draft'].includes(e.status))
    const selectable = team && tab !== 'reports'

    return (
        <DashNav>
            <div className="page-content pp xp">
                <div className="container-fluid">
                    <ExpensesHeader onAdd={() => setAdding('new')} actions={<>
                        {role.finance && tab !== 'reports' && <button type="button" className="xp-btn hide-sm" onClick={() => exportExcel(rows, exportName, VIEW[tab]?.label || 'Expenses')} disabled={!rows.length}><i className="mdi mdi-download"></i>Export</button>}
                        <RowMenu items={[
                            { label: 'Refresh', icon: 'mdi-refresh', onClick: () => dispatch({ type: expenseActions.GET_EXPENSES }) },
                            role.finance && tab !== 'reports' && { label: 'Export as CSV', icon: 'mdi-file-delimited-outline', onClick: () => exportCsv(rows, exportName) },
                            role.finance && tab !== 'reports' && { label: 'Export as Excel', icon: 'mdi-file-excel-outline', onClick: () => exportExcel(rows, exportName, VIEW[tab]?.label || 'Expenses') },
                            role.finance && { label: 'Open reports', icon: 'mdi-chart-box-outline', onClick: () => setTab('reports') },
                        ]} />
                    </>} />

                    <ErrorBanner error={error} />
                    <ExpenseSummary cards={summary} loading={listLoading && !raw?.length} />

                    {ownNeedsAction.length > 0 && tab !== 'reports' && (
                        <div className="xp-banner">
                            <i className="mdi mdi-information-outline"></i>
                            <span>{ownNeedsAction.filter((e) => e.status === 'Changes Requested').length > 0 && <><b>{ownNeedsAction.filter((e) => e.status === 'Changes Requested').length}</b> of your claims need changes. </>}{ownNeedsAction.filter((e) => e.status === 'Draft').length > 0 && <><b>{ownNeedsAction.filter((e) => e.status === 'Draft').length}</b> draft{ownNeedsAction.filter((e) => e.status === 'Draft').length === 1 ? '' : 's'} not submitted yet.</>}</span>
                            <button type="button" className="xp-link" onClick={() => { setTab('all'); setFilters({ ...EMPTY_FILTERS, status: ownNeedsAction[0].status }) }}>Show them</button>
                        </div>
                    )}

                    <ExpenseTabs tabs={tabs} active={tab} onChange={setTab} />

                    {tab === 'reports' ? <ExpenseReports list={list} employees={employees} departments={departments} /> : (
                        <div className="xp-view" key={tab}>
                            {kpis && <KpiStrip items={kpis} />}
                            <ExpenseToolbar filters={filters} setFilters={setFilters} sort={sort} setSort={setSort} employees={team ? employees : []} departments={team ? departments : []}
                                show={{ status: tab === 'all' ? VIEW.all.statuses : null, reimbursement: view?.reimbursement }} />

                            {selected.size > 0 && (
                                <div className="xp-bulk" role="region" aria-label="Bulk actions">
                                    <span><b>{selected.size}</b> selected · {fmtMoney(sumAmount(sel))}</span>
                                    <div>
                                        {decidable.length > 0 && <button type="button" className="xp-btn sm" onClick={bulkApprove} disabled={busy}><i className="mdi mdi-check"></i>Approve ({decidable.length})</button>}
                                        {decidable.length > 0 && <button type="button" className="xp-btn sm danger" onClick={() => setReason({ ids: decidable.map((e) => e._id), status: 'Rejected' })} disabled={busy}><i className="mdi mdi-close"></i>Reject ({decidable.length})</button>}
                                        {payable.length > 0 && <button type="button" className="xp-btn sm" onClick={bulkReimburse} disabled={busy}><i className="mdi mdi-cash-check"></i>Mark reimbursed ({payable.length})</button>}
                                        {role.finance && <button type="button" className="xp-btn sm" onClick={() => exportExcel(sel, `${exportName}-selected`)}><i className="mdi mdi-download"></i>Export</button>}
                                        <button type="button" className="xp-btn sm ghost" onClick={() => setSelected(new Set())}>Clear</button>
                                    </div>
                                </div>
                            )}

                            {!listLoading && !list.length ? (
                                <EmptyExpenseState title="No expenses yet" text="Spent money on client work? Add it with the bill and track it to reimbursement." action={<button type="button" className="xp-btn primary" onClick={() => setAdding('new')}><i className="mdi mdi-plus"></i>Add Expense</button>} />
                            ) : !listLoading && !rows.length ? (
                                <EmptyExpenseState icon="mdi-filter-remove-outline" title={list.filter(view.match).length ? 'No expenses match these filters' : `Nothing ${tab === 'all' ? 'here' : tab} yet`} text={list.filter(view.match).length ? 'Try a different search or clear some filters.' : null}
                                    action={list.filter(view.match).length ? <button type="button" className="xp-btn" onClick={() => setFilters(EMPTY_FILTERS)}>Clear filters</button> : null} />
                            ) : narrow ? (
                                <div className="xp-cards">
                                    {pageRows.map((e) => <ExpenseCard key={e._id} e={e} onOpen={(x) => setOpenId(x._id)} actions={rowActions} selectable={selectable} selected={selected.has(e._id)} onSelect={(id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })} />)}
                                </div>
                            ) : (
                                <ExpenseTable rows={pageRows} cols={cols} optional={view.optional || []} optional2={view.optional2 || []} selected={selected} setSelected={setSelected} selectable={selectable} onOpen={(e) => setOpenId(e._id)} actions={rowActions} loading={listLoading} />
                            )}
                            <ExpensePagination page={page} pages={pages} total={rows.length} perPage={PER_PAGE} onPage={setPage} />
                        </div>
                    )}
                </div>
            </div>

            <button type="button" className="xp-fab" onClick={() => setAdding('new')} aria-label="Add expense"><i className="mdi mdi-plus"></i></button>

            {open && (
                <ExpenseDetailsDrawer expense={open} onClose={() => setOpenId(null)} actions={(() => {
                    const items = actionItems(open).filter(Boolean).filter((a) => a.label !== 'View details')
                    if (!items.length) return null
                    return <>{items.map((a) => <button key={a.label} type="button" className={`xp-btn ${a.tone === 'danger' ? 'danger' : ''} ${['Approve', 'Mark as reimbursed', 'Edit & resubmit', 'Edit draft'].includes(a.label) ? 'primary' : ''}`} onClick={a.onClick} disabled={busy}><i className={`mdi ${a.icon}`}></i>{a.label}</button>)}</>
                })()} />
            )}
            {adding && <AddExpenseDrawer key={adding === 'new' ? 'new' : adding._id} me={role.user} editing={adding === 'new' ? null : adding} busy={busy} onClose={() => setAdding(null)} onSave={save} />}
            {reason && (
                <ReasonDialog
                    title={reason.status === 'Rejected' ? `Reject ${reason.ids.length > 1 ? `${reason.ids.length} claims` : 'this claim'}?` : 'Request changes'}
                    sub={reason.status === 'Rejected' ? 'The employee sees your reason and can edit and resubmit.' : 'The claim goes back to the employee to fix and resubmit.'}
                    label={reason.status === 'Rejected' ? 'Reason for rejection' : 'What needs to change?'}
                    confirmLabel={reason.status === 'Rejected' ? 'Reject' : 'Send back'}
                    tone={reason.status === 'Rejected' ? 'danger' : 'warn'}
                    onClose={() => setReason(null)} onConfirm={confirmReason} />
            )}
        </DashNav>
    )
}
