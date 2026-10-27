import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Avatar } from '../people/PeopleUI'
import { FormModal } from '../common/FormModal'
import { CATEGORIES, categoryMeta, expenseStatusMeta, useReceiptSrc, isImage } from './ExpenseUI'
import { StatusBadge, CategoryChip } from './ExpenseParts'
import {
    fmtMoney, fmtDate, fmtDateTime, isoDay, personName, expenseTitle, expenseRef, submittedOn, timelineOf, nextSteps, CURRENCIES, PAYMENT_METHODS,
} from './expenseUtils'

/* ---------------- drawer shell (right side, Esc / backdrop close, focus kept inside) ---------------- */
export const Drawer = ({ title, sub, onClose, children, footer, wide }) => {
    const panel = useRef(null)
    const closeRef = useRef(onClose)
    closeRef.current = onClose
    useEffect(() => {
        const prev = document.activeElement
        const t = setTimeout(() => panel.current?.querySelector('input, select, textarea, button')?.focus(), 60)
        const esc = (e) => { if (e.key === 'Escape' && !(Number(document.body.dataset.fmOpen) > 0)) closeRef.current() }
        document.addEventListener('keydown', esc)
        document.body.classList.add('xp-lock')
        return () => { clearTimeout(t); document.removeEventListener('keydown', esc); document.body.classList.remove('xp-lock'); prev?.focus?.() }
    }, [])
    return createPortal(
        <div className="pp xp-drawer-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
            <aside ref={panel} className={`xp-drawer ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
                <header className="xp-drawer-head">
                    <div><h2>{title}</h2>{sub && <p>{sub}</p>}</div>
                    <button type="button" className="xp-icon-btn" onClick={onClose} aria-label="Close"><i className="mdi mdi-close"></i></button>
                </header>
                <div className="xp-drawer-body">{children}</div>
                {footer && <footer className="xp-drawer-foot">{footer}</footer>}
            </aside>
        </div>, document.body)
}

/* ---------------- receipt preview ---------------- */
export const ReceiptPreview = ({ url }) => {
    const src = useReceiptSrc(url)
    if (!url) return <div className="xp-receipt none"><i className="mdi mdi-receipt"></i><span>No receipt attached</span></div>
    const pdf = /\.pdf$/i.test(url)
    return (
        <div className="xp-receipt">
            <div className="xp-receipt-view">
                {!src ? <span className="xp-skel" style={{ height: 180 }}></span>
                    : isImage(url) ? <img src={src} alt="Receipt" />
                        : pdf ? <object data={src} type="application/pdf" aria-label="Receipt PDF"><a href={src} target="_blank" rel="noreferrer">Open the PDF</a></object>
                            : <a href={src} target="_blank" rel="noreferrer">Open the file</a>}
            </div>
            <div className="xp-receipt-actions">
                <a className={`xp-btn sm ${src ? '' : 'disabled'}`} href={src || undefined} download={decodeURIComponent(url.split('/').pop() || 'receipt')}><i className="mdi mdi-download"></i>Download</a>
                <a className={`xp-btn sm ${src ? '' : 'disabled'}`} href={src || undefined} target="_blank" rel="noreferrer"><i className="mdi mdi-arrow-expand"></i>Open full screen</a>
            </div>
        </div>
    )
}

/* ---------------- approval timeline ---------------- */
export const ApprovalTimeline = ({ expense }) => {
    const done = timelineOf(expense)
    const ahead = expense.status === 'Rejected' || expense.status === 'Reimbursed' ? [] : nextSteps(expense)
    return (
        <ol className="xp-timeline">
            {done.map((s, i) => {
                const m = expenseStatusMeta(s.status)
                return (
                    <li key={i} style={{ '--c': m.color }}>
                        <span className="dot"><i className={`mdi ${m.icon}`}></i></span>
                        <div>
                            <b>{s.label}</b>
                            <small>{s.by ? personName(s.by) : 'System'} · {fmtDateTime(s.at)}</small>
                            {s.comment && <p>“{s.comment}”</p>}
                        </div>
                    </li>
                )
            })}
            {ahead.map((label) => (
                <li key={label} className="ahead"><span className="dot"></span><div><b>{label}</b><small>Waiting</small></div></li>
            ))}
        </ol>
    )
}

/* ---------------- details drawer ---------------- */
const Field = ({ label, children }) => <div className="xp-field"><span>{label}</span><b>{children || <em className="xp-muted">—</em>}</b></div>

export const ExpenseDetailsDrawer = ({ expense: e, onClose, actions }) => {
    const m = categoryMeta(e.category)
    const activity = [...timelineOf(e)].reverse()
    return (
        <Drawer title={expenseTitle(e)} sub={`${expenseRef(e)} · ${e.category}`} onClose={onClose} footer={actions}>
            <section className="xp-hero" style={{ '--c': m.color }}>
                <div><span>Amount</span><b>{fmtMoney(e.amount, e.currency || 'INR', 2)}</b></div>
                <StatusBadge status={e.status} />
            </section>
            {e.status === 'Rejected' && e.rejectionReason && <div className="xp-note bad"><i className="mdi mdi-close-circle-outline"></i><div><b>Why it was rejected</b><p>{e.rejectionReason}</p></div></div>}
            {e.status === 'Changes Requested' && e.reviewComment && <div className="xp-note warn"><i className="mdi mdi-pencil-circle-outline"></i><div><b>Changes requested</b><p>{e.reviewComment}</p></div></div>}

            <h3 className="xp-sec">Expense information</h3>
            <div className="xp-fields">
                <Field label="Category"><CategoryChip category={e.category} /></Field>
                <Field label="Expense date">{fmtDate(e.expenseDate)}</Field>
                <Field label="Payment method">{e.paymentMethod}</Field>
                <Field label="Currency">{e.currency || 'INR'}</Field>
                <Field label="Submitted">{submittedOn(e) ? fmtDateTime(submittedOn(e)) : 'Not submitted yet'}</Field>
                <Field label="Reference">{expenseRef(e)}</Field>
            </div>
            {e.description && <div className="xp-text"><span>Description</span><p>{e.description}</p></div>}
            {e.notes && <div className="xp-text"><span>Notes</span><p>{e.notes}</p></div>}

            <h3 className="xp-sec">Employee</h3>
            <div className="xp-emp">
                <Avatar person={e.employeeId} size={40} />
                <div><b>{personName(e.employeeId)}</b><small>{[e.employeeId?.employeeId, e.employeeId?.designation, e.employeeId?.department].filter(Boolean).join(' · ')}</small></div>
            </div>

            <h3 className="xp-sec">Receipt</h3>
            <ReceiptPreview url={e.receiptUrl} />

            <h3 className="xp-sec">Approval timeline</h3>
            <ApprovalTimeline expense={e} />

            <h3 className="xp-sec">Activity</h3>
            <ul className="xp-activity">
                {activity.map((a, i) => (
                    <li key={i}><b>{a.by ? personName(a.by) : 'System'}</b> {a.label.toLowerCase()}{a.comment ? <>: <em>“{a.comment}”</em></> : null}<small>{fmtDateTime(a.at)}</small></li>
                ))}
            </ul>
        </Drawer>
    )
}

/* ---------------- add / edit expense ---------------- */
const blank = () => ({ title: '', amount: '', currency: 'INR', category: '', expenseDate: isoDay(new Date()), paymentMethod: '', description: '', notes: '' })
const MAX_MB = 10

export const AddExpenseDrawer = ({ me, editing, onClose, onSave, busy }) => {
    // fresh form every time it opens; editing a claim pre-fills it
    const [f, setF] = useState(() => editing ? { title: editing.title || '', amount: String(editing.amount ?? ''), currency: editing.currency || 'INR', category: editing.category || '', expenseDate: isoDay(editing.expenseDate), paymentMethod: editing.paymentMethod || '', description: editing.description || '', notes: editing.notes || '' } : blank())
    const [file, setFile] = useState(null)
    const [preview, setPreview] = useState(null)
    const [errors, setErrors] = useState({})
    const [over, setOver] = useState(false)
    const input = useRef(null)
    const existing = useReceiptSrc(!file && editing?.receiptUrl ? editing.receiptUrl : null)
    useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
    const set = (k) => (e) => { setF((x) => ({ ...x, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: '' })) }
    const pick = (fl) => {
        if (!fl) return
        if (!/^(image\/|application\/pdf)/.test(fl.type)) { setErrors((x) => ({ ...x, receipt: 'Attach a photo or a PDF.' })); return }
        if (fl.size > MAX_MB * 1048576) { setErrors((x) => ({ ...x, receipt: `Keep the file under ${MAX_MB} MB.` })); return }
        setFile(fl); setErrors((x) => ({ ...x, receipt: '' }))
        setPreview(fl.type.startsWith('image/') ? URL.createObjectURL(fl) : null)
    }
    const validate = () => {
        const e = {}
        if (!f.category) e.category = 'Choose a category.'
        if (!(Number(f.amount) > 0)) e.amount = 'Enter an amount above zero.'
        if (!f.expenseDate) e.expenseDate = 'Pick the date.'
        else if (new Date(f.expenseDate) > new Date()) e.expenseDate = "Can't be in the future."
        setErrors(e)
        return !Object.keys(e).length
    }
    const save = (submit) => { if (validate()) onSave({ ...f, amount: Number(f.amount) }, file, submit) }
    const err = (k) => errors[k] && <small className="xp-err">{errors[k]}</small>
    const canDraft = !editing || editing.status === 'Draft'
    return (
        <Drawer title={editing ? 'Edit expense' : 'Add expense'} sub={editing ? (editing.status === 'Draft' ? 'Finish your draft and submit it' : 'Make the changes and resubmit') : 'Add a business expense for reimbursement'} onClose={onClose}
            footer={<>
                <button type="button" className="xp-btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
                <span className="xp-grow"></span>
                {canDraft && <button type="button" className="xp-btn" onClick={() => save(false)} disabled={busy}><i className="mdi mdi-content-save-outline"></i>Save draft</button>}
                {!canDraft && <button type="button" className="xp-btn" onClick={() => save(false)} disabled={busy}><i className="mdi mdi-content-save-outline"></i>Save changes</button>}
                <button type="button" className="xp-btn primary" onClick={() => save(true)} disabled={busy}><i className={`mdi ${busy ? 'mdi-loading mdi-spin' : 'mdi-send'}`}></i>{editing && editing.status !== 'Draft' ? 'Resubmit' : 'Submit expense'}</button>
            </>}>
            {editing?.status === 'Changes Requested' && editing.reviewComment && <div className="xp-note warn"><i className="mdi mdi-pencil-circle-outline"></i><div><b>What your reviewer asked for</b><p>{editing.reviewComment}</p></div></div>}
            {editing?.status === 'Rejected' && editing.rejectionReason && <div className="xp-note bad"><i className="mdi mdi-close-circle-outline"></i><div><b>Why it was rejected</b><p>{editing.rejectionReason}</p></div></div>}
            <div className="xp-form">
                <label className="span2">Expense title<input className="xp-input" value={f.title} onChange={set('title')} placeholder="e.g. Cab to client office" maxLength={120} /></label>
                <label>Amount *<input className={`xp-input ${errors.amount ? 'bad' : ''}`} type="number" min="0" step="0.01" inputMode="decimal" value={f.amount} onChange={set('amount')} placeholder="0.00" />{err('amount')}</label>
                <label>Currency<select className="xp-input" value={f.currency} onChange={set('currency')}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></label>
                <label>Category *<select className={`xp-input ${errors.category ? 'bad' : ''}`} value={f.category} onChange={set('category')}><option value="">Choose…</option>{CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.value}</option>)}</select>{err('category')}</label>
                <label>Expense date *<input className={`xp-input ${errors.expenseDate ? 'bad' : ''}`} type="date" max={isoDay(new Date())} value={f.expenseDate} onChange={set('expenseDate')} />{err('expenseDate')}</label>
                <label>Payment method<select className="xp-input" value={f.paymentMethod} onChange={set('paymentMethod')}><option value="">Choose…</option>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</select></label>
                <label>Employee<input className="xp-input" value={personName(me)} readOnly /></label>
                <label>Department<input className="xp-input" value={me?.department || '—'} readOnly /></label>
                <label className="span2">Description<textarea className="xp-input" rows={3} value={f.description} onChange={set('description')} placeholder="What was it for? Client, purpose, people…" maxLength={1000} /></label>
                <div className="span2">
                    <span className="xp-label">Receipt</span>
                    {file || existing ? (
                        <div className="xp-upload has">
                            {preview || (existing && editing && isImage(editing.receiptUrl)) ? <img src={preview || existing} alt="Receipt preview" /> : <span className="xp-file-ic"><i className="mdi mdi-file-pdf-box"></i></span>}
                            <div><b>{file ? file.name : decodeURIComponent((editing?.receiptUrl || '').split('/').pop())}</b><small>{file ? `${(file.size / 1024).toFixed(0)} KB` : 'Current receipt'}</small></div>
                            <button type="button" className="xp-btn sm" onClick={() => input.current?.click()}>Replace</button>
                            {file && <button type="button" className="xp-icon-btn" onClick={() => { setFile(null); setPreview(null) }} aria-label="Remove file"><i className="mdi mdi-close"></i></button>}
                        </div>
                    ) : (
                        <button type="button" className={`xp-upload ${over ? 'over' : ''}`} onClick={() => input.current?.click()}
                            onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files?.[0]) }}>
                            <i className="mdi mdi-cloud-upload-outline"></i><b>Drop the receipt here or browse</b><small>Photo or PDF, up to {MAX_MB} MB</small>
                        </button>
                    )}
                    <input ref={input} type="file" accept="image/*,application/pdf" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
                    {err('receipt')}
                </div>
                <label className="span2">Notes<textarea className="xp-input" rows={2} value={f.notes} onChange={set('notes')} placeholder="Anything the approver should know" maxLength={1000} /></label>
            </div>
        </Drawer>
    )
}

/* ---------------- reason dialog (reject / request changes) ---------------- */
export const ReasonDialog = ({ title, sub, label, confirmLabel, tone, onClose, onConfirm }) => {
    const [text, setText] = useState('')
    return (
        <FormModal title={title} sub={sub} icon={tone === 'danger' ? 'mdi-close-circle-outline' : 'mdi-pencil-circle-outline'} submitLabel={confirmLabel} disabled={text.trim().length < 3}
            onClose={onClose} onSubmit={(e) => { e.preventDefault(); if (text.trim().length >= 3) onConfirm(text.trim()) }}>
            <div className="pp-field">
                <label className="pp-label">{label}</label>
                <textarea className="pp-input" rows={4} value={text} onChange={(e) => setText(e.target.value)} autoFocus placeholder="This is shared with the employee" />
            </div>
        </FormModal>
    )
}
