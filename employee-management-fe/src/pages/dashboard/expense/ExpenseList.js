import React, { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useForm } from 'react-hook-form'
import expenseActions from '../../../redux/expense/Actions'
import { PeopleShell, EmptyState, ErrorBanner } from '../../../components/people/PeopleUI'
import { CURRENCY, money, moneyShort } from '../../../components/payroll/PayrollUI'
import { ymd } from '../../../components/attendance/AttendanceUI'
import {
    EXPENSE_ROOT, CATEGORIES, EXPENSE_STATUSES, ExpenseStatus, expenseStatusMeta, CategoryIcon, CategoryTag, ReceiptLink, ownerId,
} from '../../../components/expense/ExpenseUI'
import '../../../components/attendance/attendance.css'
import '../../../components/payroll/payroll.css'
import './ExpenseList.css'
import { FormModal } from '../../../components/common/FormModal'
import { confirmAction } from '../../../components/common/ConfirmDialog'

const BLANK = { category: '', amount: '', expenseDate: '', description: '', receiptFile: null }
const monthKey = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}` }
const monthName = (k) => { const [y, m] = k.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) }

export const ExpenseList = () => {
    const dispatch = useDispatch()
    const { list, listLoading, error } = useSelector((state) => state.expenseReducer || {})
    const { isAuthenticated: user } = useSelector((state) => state.authReducer || {})
    const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm({ defaultValues: BLANK })
    const [open, setOpen] = useState(false)
    const [statusFilter, setStatusFilter] = useState('')
    const [categoryFilter, setCategoryFilter] = useState('')
    const [dragOver, setDragOver] = useState(false)

    useEffect(() => {
        dispatch({ type: expenseActions.GET_EXPENSES })
    }, [dispatch])

    const onSubmit = (data) => {
        const { receiptFile, ...payload } = data
        dispatch({ type: expenseActions.ADD_EXPENSE, payload, receiptFile: receiptFile?.[0] || null })
        reset(BLANK)
        setOpen(false)
    }

    const onNew = () => { reset(BLANK); setOpen(true) }
    const onClose = () => { reset(BLANK); setOpen(false) }
    const onDelete = async (ex) => {
        if (await confirmAction({ title: 'Delete this claim?', message: `Your ${ex.category.toLowerCase()} claim of ${money(ex.amount)}. This can't be undone.`, confirmLabel: 'Delete claim' })) {
            dispatch({ type: expenseActions.DELETE_EXPENSE, id: ex._id })
        }
    }

    // Approvers get everyone's claims from the API — this page is only ever "mine".
    const mine = useMemo(
        () => (list || []).filter((ex) => !ex.employeeId || ownerId(ex) === user?._id)
            .sort((a, b) => new Date(b.expenseDate) - new Date(a.expenseDate)),
        [list, user]
    )

    const year = new Date().getFullYear()
    const thisMonth = monthKey(new Date())
    const sum = (arr) => arr.reduce((s, e) => s + (Number(e.amount) || 0), 0)
    const pending = mine.filter((e) => e.status === 'Pending')
    const toReimburse = mine.filter((e) => e.status === 'Approved')
    const reimbursedYear = mine.filter((e) => e.status === 'Reimbursed' && new Date(e.expenseDate).getFullYear() === year)
    const claimedMonth = mine.filter((e) => monthKey(e.expenseDate) === thisMonth && e.status !== 'Rejected')

    const counts = Object.fromEntries(EXPENSE_STATUSES.map((s) => [s, mine.filter((e) => e.status === s).length]))
    const rows = mine.filter((e) => (!statusFilter || e.status === statusFilter) && (!categoryFilter || e.category === categoryFilter))

    const groups = useMemo(() => {
        const map = new Map()
        rows.forEach((e) => {
            const k = monthKey(e.expenseDate)
            if (!map.has(k)) map.set(k, [])
            map.get(k).push(e)
        })
        return [...map.entries()]
    }, [rows])

    const file = watch('receiptFile')?.[0]
    const preview = useMemo(() => (file && file.type?.startsWith('image/') ? URL.createObjectURL(file) : null), [file])
    useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

    return (
        <PeopleShell
            title="My expenses"
            root={EXPENSE_ROOT}
            crumbs={[{ label: 'My expenses' }]}
            actions={<button type="button" className="pp-btn primary" onClick={onNew}><i className="mdi mdi-plus"></i> New claim</button>}
        >
            <ErrorBanner error={error} />

            <div className="at-tiles">
                <div className="at-tile" style={{ '--c': '#0284c7' }}>
                    <span className="at-tile-icon"><i className="mdi mdi-cash-refund"></i></span>
                    <div><b>{money(sum(toReimburse))}</b><span>Approved · to be paid</span></div>
                </div>
                <div className="at-tile" style={{ '--c': '#d97706' }}>
                    <span className="at-tile-icon"><i className="mdi mdi-timer-sand"></i></span>
                    <div><b>{money(sum(pending))}</b><span>{pending.length} awaiting approval</span></div>
                </div>
                <div className="at-tile" style={{ '--c': '#059669' }}>
                    <span className="at-tile-icon"><i className="mdi mdi-cash-check"></i></span>
                    <div><b>{moneyShort(sum(reimbursedYear))}</b><span>Reimbursed in {year}</span></div>
                </div>
                <div className="at-tile" style={{ '--c': '#7c3aed' }}>
                    <span className="at-tile-icon"><i className="mdi mdi-calendar-month-outline"></i></span>
                    <div><b>{money(sum(claimedMonth))}</b><span>Claimed this month</span></div>
                </div>
            </div>

            {open && (
                <FormModal icon="mdi-receipt" title={"New expense claim"} onClose={onClose} onSubmit={handleSubmit(onSubmit)} submitLabel={"Submit claim"} submitIcon="mdi-send-outline" size="wide">
                    <div className="pp-card-body">
                        <div className="ec-grid">
                            <div>
                                <label className="pp-label">What was it for?<span className="req">*</span></label>
                                <div className="ec-cats" role="radiogroup" aria-label="Category">
                                    {CATEGORIES.map((c) => (
                                        <label key={c.value} style={{ '--c': c.color }}>
                                            <input type="radio" value={c.value} {...register('category', { required: 'Pick a category' })} />
                                            <span className="ec-cat"><i className={`mdi ${c.icon}`}></i>{c.value}</span>
                                        </label>
                                    ))}
                                </div>
                                {errors.category && <div className="pp-err" style={{ marginTop: -10, marginBottom: 12 }}>{errors.category.message}</div>}

                                <div className="ec-fields">
                                    <div className="pp-field">
                                        <label className="pp-label">Amount<span className="req">*</span></label>
                                        <div className="ec-money"><span>{CURRENCY}</span>
                                            <input type="number" step="0.01" min="0" placeholder="0" className={`pp-input ${errors.amount ? 'is-invalid' : ''}`}
                                                {...register('amount', { required: 'Enter the amount', valueAsNumber: true, min: { value: 0.01, message: 'Must be more than 0' } })} />
                                        </div>
                                        {errors.amount && <div className="pp-err">{errors.amount.message}</div>}
                                    </div>
                                    <div className="pp-field">
                                        <label className="pp-label">Date spent<span className="req">*</span></label>
                                        <input type="date" max={ymd(new Date())} className={`pp-input ${errors.expenseDate ? 'is-invalid' : ''}`} {...register('expenseDate', { required: 'Pick the date' })} />
                                        {errors.expenseDate && <div className="pp-err">{errors.expenseDate.message}</div>}
                                    </div>
                                    <div className="pp-field span-2">
                                        <label className="pp-label">Description</label>
                                        <input type="text" placeholder="e.g. Cab to client office — Chennai" className="pp-input" {...register('description')} />
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="pp-label">Bill / receipt</label>
                                <label className={`ec-drop ${dragOver ? 'over' : ''}`} onDragOver={() => setDragOver(true)} onDragLeave={() => setDragOver(false)} onDrop={() => setDragOver(false)}>
                                    <input type="file" accept="image/*,.pdf" {...register('receiptFile')} aria-label="Attach bill or receipt" />
                                    {!file ? (
                                        <>
                                            <i className="mdi mdi-cloud-upload-outline"></i>
                                            <b>Drop your bill here or click to browse</b>
                                            <small>Photo or PDF — speeds up approval</small>
                                        </>
                                    ) : (
                                        <>
                                            {preview ? <img className="ec-preview" src={preview} alt="Receipt preview" /> : <i className="mdi mdi-file-pdf-box"></i>}
                                            <span className="ec-file"><i className="mdi mdi-paperclip"></i><span>{file.name}</span></span>
                                            <button type="button" className="ec-clear" onClick={(e) => { e.preventDefault(); setValue('receiptFile', null) }}>Remove</button>
                                        </>
                                    )}
                                </label>
                            </div>
                        </div>
                    </div>
                </FormModal>
            )}

            <section className="pp-card">
                <div className="pp-card-head ex-toolbar">
                    <div className="pj-filters" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        <button type="button" className={`lv-chip ${!statusFilter ? 'active' : ''}`} style={{ '--c': '#0b0f19' }} onClick={() => setStatusFilter('')}>All <b>{mine.length}</b></button>
                        {EXPENSE_STATUSES.map((s) => counts[s] > 0 && (
                            <button key={s} type="button" className={`lv-chip ${statusFilter === s ? 'active' : ''}`} style={{ '--c': expenseStatusMeta(s).color }} onClick={() => setStatusFilter(statusFilter === s ? '' : s)}>
                                <i className={`mdi ${expenseStatusMeta(s).icon}`}></i>{s} <b>{counts[s]}</b>
                            </button>
                        ))}
                    </div>
                    <select className="pp-select" style={{ width: 'auto' }} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} aria-label="Category">
                        <option value="">All categories</option>
                        {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.value}</option>)}
                    </select>
                </div>

                {listLoading && !mine.length ? (
                    <div className="pp-card-body">{[0, 1, 2].map((i) => <div key={i} className="pp-skel" style={{ height: 52, marginBottom: 12 }}></div>)}</div>
                ) : !rows.length ? (
                    <EmptyState icon="mdi-receipt" title={mine.length ? 'Nothing matches' : 'No expense claims yet'}
                        text={mine.length ? 'Try a different status or category.' : 'Spent money on work? Submit a claim with the bill and get reimbursed.'}
                        action={!mine.length && !open && <button type="button" className="pp-btn primary" onClick={onNew}><i className="mdi mdi-plus"></i> New claim</button>} />
                ) : groups.map(([k, items]) => (
                    <div key={k}>
                        <div className="ex-month"><span>{monthName(k)}</span><b>{money(sum(items.filter((e) => e.status !== 'Rejected')))}</b></div>
                        {items.map((ex) => (
                            <div key={ex._id} className="ex-row">
                                <CategoryIcon category={ex.category} />
                                <div className="ex-row-main">
                                    <div className="ex-row-title">{ex.description || ex.category}</div>
                                    <div className="ex-row-sub">
                                        <CategoryTag category={ex.category} />
                                        <span><i className="mdi mdi-calendar-outline"></i> {new Date(ex.expenseDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                        <ReceiptLink url={ex.receiptUrl} />
                                        {ex.status === 'Rejected' && ex.rejectionReason && <span className="reject">Rejected: {ex.rejectionReason}</span>}
                                    </div>
                                </div>
                                <span className="ex-amt">{money(ex.amount, { decimals: Number(ex.amount) % 1 ? 2 : 0 })}</span>
                                <ExpenseStatus status={ex.status} />
                                {ex.status === 'Pending' && (
                                    <button type="button" className="ex-del" onClick={() => onDelete(ex)} title="Delete claim" aria-label="Delete claim"><i className="mdi mdi-trash-can-outline"></i></button>
                                )}
                            </div>
                        ))}
                    </div>
                ))}
            </section>
        </PeopleShell>
    )
}
