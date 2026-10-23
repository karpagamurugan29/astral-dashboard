import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { chatApi as api } from '../../../components/chat/chatApi'
import { money } from '../../../components/payroll/PayrollUI'
import { toast } from '../../../components/common/Toaster'
import { Modal } from '../projects/ProjectParts'
import '../projects/MyTasks.css'
import './Billing.css'

/* Shared billing pieces: status chips, the invoice editor (drafts), the invoice drawer
   (issue, record payment, cancel, print), and the firm's billing settings. */

export { api, money }
export const INV_STATUS = {
    Draft: ['#64748b', 'mdi-file-document-edit-outline'],
    Issued: ['#1e40af', 'mdi-file-send-outline'],
    'Partly paid': ['#d97706', 'mdi-cash-clock'],
    Paid: ['#059669', 'mdi-cash-check'],
    Cancelled: ['#e11d48', 'mdi-cancel'],
}
export const InvStatus = ({ s, overdue }) => {
    const [c, ic] = INV_STATUS[s] || INV_STATUS.Draft
    return <span className="bl-st" style={{ '--c': overdue ? '#e11d48' : c }}><i className={`mdi ${ic === 'mdi-cash-clock' ? 'mdi-cash-multiple' : ic}`}></i>{overdue ? `Overdue ${overdue}d` : s}</span>
}
export const fmtD = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '')
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

// live totals while editing (the server recalculates on save)
const totalsOf = (lines, gstRate, interState) => {
    const amt = (l) => r2(l.kind === 'Fee' && !Number(l.qty) ? Number(l.rate) || 0 : (Number(l.qty) || 0) * (Number(l.rate) || 0))
    const subtotal = r2(lines.reduce((s, l) => s + amt(l), 0))
    const taxable = r2(lines.filter((l) => l.taxable !== false).reduce((s, l) => s + amt(l), 0))
    const tax = r2((taxable * (Number(gstRate) || 0)) / 100)
    const raw = subtotal + tax
    return { subtotal, taxable, tax, cgst: interState ? 0 : r2(tax / 2), sgst: interState ? 0 : r2(tax - r2(tax / 2)), igst: interState ? tax : 0, total: Math.round(raw), amt }
}

/* ---------------- editor (draft invoices) ---------------- */
export const InvoiceEditor = ({ invoice, onClose, onSaved }) => {
    const [f, setF] = useState(() => ({
        invoiceDate: iso(invoice.invoiceDate), dueDate: iso(invoice.dueDate), interState: !!invoice.interState, gstRate: invoice.gstRate ?? 18, notes: invoice.notes || '',
        billTo: { ...invoice.billTo }, lines: (invoice.lines || []).map((l) => ({ ...l })),
    }))
    const [busy, setBusy] = useState('')
    const t = useMemo(() => totalsOf(f.lines, f.gstRate, f.interState), [f])
    const setLine = (i, k, v) => setF((x) => ({ ...x, lines: x.lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)) }))
    const addLine = (kind) => setF((x) => ({ ...x, lines: [...x.lines, kind === 'Expense' ? { description: 'Out-of-pocket expenses (travel, conveyance)', kind: 'Expense', qty: 1, rate: 0, taxable: true, sac: '998221' } : kind === 'Hours' ? { description: 'Additional professional time', kind: 'Hours', qty: 1, rate: 2500, taxable: true, sac: '998221' } : { description: '', kind: 'Other', qty: 1, rate: 0, taxable: true, sac: '998221' }] }))
    const save = async (andIssue) => {
        setBusy(andIssue ? 'issue' : 'save')
        try {
            let j = await api('PUT', `/invoices/${invoice._id}`, f)
            if (andIssue) j = await api('POST', `/invoices/${invoice._id}/issue`, {})
            toast.success(j.message, { title: andIssue ? 'Invoice issued' : 'Draft saved' })
            onSaved(j.data)
        } catch (e) { toast.error(e.message, { title: 'Couldn’t save the invoice' }) }
        setBusy('')
    }
    const bt = (k) => (e) => setF((x) => ({ ...x, billTo: { ...x.billTo, [k]: e.target.value } }))
    return (
        <Modal wide title="Draft invoice" sub={`${invoice.billTo?.name || ''}${invoice.auditId?.auditCode ? ` · ${invoice.auditId.auditCode}` : ''}`} icon={<span className="pw-dicon" style={{ '--c': '#1e40af' }}><i className="mdi mdi-receipt"></i></span>} onClose={onClose}
            footer={<>
                <span className="bl-ed-total">Total <b>{money(t.total)}</b></span>
                <button type="button" className="pp-btn" onClick={onClose}>Close</button>
                <button type="button" className="pp-btn" disabled={!!busy} onClick={() => save(false)}><i className="mdi mdi-content-save-outline"></i>{busy === 'save' ? 'Saving…' : 'Save draft'}</button>
                <button type="button" className="pp-btn primary" disabled={!!busy || !t.total} onClick={() => save(true)}><i className="mdi mdi-file-send-outline"></i>{busy === 'issue' ? 'Issuing…' : 'Save & issue'}</button>
            </>}>
            <div className="bl-ed">
                <div className="bl-ed-grid">
                    <label className="pw-field"><span>Invoice date</span><input type="date" className="pp-input" value={f.invoiceDate} onChange={(e) => setF((x) => ({ ...x, invoiceDate: e.target.value }))} /></label>
                    <label className="pw-field"><span>Due date</span><input type="date" className="pp-input" value={f.dueDate} onChange={(e) => setF((x) => ({ ...x, dueDate: e.target.value }))} /></label>
                    <label className="pw-field"><span>GST rate %</span><input type="number" className="pp-input" min="0" max="28" value={f.gstRate} onChange={(e) => setF((x) => ({ ...x, gstRate: e.target.value }))} /></label>
                    <label className="pw-field"><span>Tax type</span><select className="pp-select" value={f.interState ? 'igst' : 'cgst'} onChange={(e) => setF((x) => ({ ...x, interState: e.target.value === 'igst' }))}><option value="cgst">CGST + SGST (same state)</option><option value="igst">IGST (other state)</option></select></label>
                </div>
                <details className="bl-ed-billto">
                    <summary><i className="mdi mdi-domain"></i>Bill to: <b>{f.billTo.name}</b>{f.billTo.gstin ? ` · GSTIN ${f.billTo.gstin}` : ' · no GSTIN'}<i className="mdi mdi-chevron-down"></i></summary>
                    <div className="bl-ed-grid">
                        <label className="pw-field wide"><span>Name</span><input className="pp-input" value={f.billTo.name || ''} onChange={bt('name')} /></label>
                        <label className="pw-field wide"><span>Address</span><input className="pp-input" value={f.billTo.address || ''} onChange={bt('address')} /></label>
                        <label className="pw-field"><span>City</span><input className="pp-input" value={f.billTo.city || ''} onChange={bt('city')} /></label>
                        <label className="pw-field"><span>State</span><input className="pp-input" value={f.billTo.state || ''} onChange={bt('state')} /></label>
                        <label className="pw-field"><span>GSTIN</span><input className="pp-input" value={f.billTo.gstin || ''} onChange={bt('gstin')} /></label>
                        <label className="pw-field"><span>PAN</span><input className="pp-input" value={f.billTo.pan || ''} onChange={bt('pan')} /></label>
                    </div>
                </details>
                <table className="bl-lines">
                    <thead><tr><th>Description</th><th>SAC</th><th className="n">Qty / hrs</th><th className="n">Rate</th><th className="n">Amount</th><th></th></tr></thead>
                    <tbody>{f.lines.map((l, i) => (
                        <tr key={i}>
                            <td><input className="pp-input" value={l.description} onChange={(e) => setLine(i, 'description', e.target.value)} placeholder="What is being billed" /><small>{l.kind}{l.taxable === false ? ' · no GST' : ''}</small></td>
                            <td><input className="pp-input sac" value={l.sac || ''} onChange={(e) => setLine(i, 'sac', e.target.value)} /></td>
                            <td><input type="number" className="pp-input n" min="0" step="0.5" value={l.qty} onChange={(e) => setLine(i, 'qty', e.target.value)} /></td>
                            <td><input type="number" className="pp-input n" min="0" value={l.rate} onChange={(e) => setLine(i, 'rate', e.target.value)} /></td>
                            <td className="n"><b>{money(t.amt(l))}</b></td>
                            <td><button type="button" className="pw-rm" onClick={() => setF((x) => ({ ...x, lines: x.lines.filter((_, j) => j !== i) }))} aria-label="Remove line"><i className="mdi mdi-close"></i></button></td>
                        </tr>
                    ))}</tbody>
                </table>
                <div className="bl-ed-add">
                    <button type="button" onClick={() => addLine('Hours')}><i className="mdi mdi-timer-outline"></i>Add hours</button>
                    <button type="button" onClick={() => addLine('Expense')}><i className="mdi mdi-cash-refund"></i>Add expenses</button>
                    <button type="button" onClick={() => addLine('Other')}><i className="mdi mdi-plus"></i>Add line</button>
                </div>
                <div className="bl-ed-sum">
                    <label className="pw-field"><span>Notes on the invoice</span><textarea className="pp-input" rows={3} value={f.notes} onChange={(e) => setF((x) => ({ ...x, notes: e.target.value }))} placeholder="e.g. 2nd instalment as per engagement letter dated 1 Oct" /></label>
                    <dl>
                        <div><dt>Subtotal</dt><dd>{money(t.subtotal, { decimals: 2 })}</dd></div>
                        {f.interState ? <div><dt>IGST {f.gstRate}%</dt><dd>{money(t.igst, { decimals: 2 })}</dd></div> : <>
                            <div><dt>CGST {Number(f.gstRate) / 2}%</dt><dd>{money(t.cgst, { decimals: 2 })}</dd></div>
                            <div><dt>SGST {Number(f.gstRate) / 2}%</dt><dd>{money(t.sgst, { decimals: 2 })}</dd></div>
                        </>}
                        <div className="tot"><dt>Total</dt><dd>{money(t.total)}</dd></div>
                    </dl>
                </div>
            </div>
        </Modal>
    )
}

/* ---------------- record a payment ---------------- */
export const PaymentModal = ({ invoice, onClose, onSaved }) => {
    const [f, setF] = useState({ amount: invoice.balance, tds: '', date: iso(new Date()), mode: 'Bank transfer', reference: '' })
    const [busy, setBusy] = useState(false)
    const tds10 = () => { const net = Math.round((invoice.taxableValue || invoice.subtotal) * 0.1); setF((x) => ({ ...x, tds: net, amount: Math.max(0, r2(invoice.balance - net)) })) }
    const save = async () => {
        setBusy(true)
        try { const j = await api('POST', `/invoices/${invoice._id}/payments`, f); toast.success(j.message, { title: 'Payment recorded' }); onSaved(j.data) } catch (e) { toast.error(e.message) }
        setBusy(false)
    }
    return (
        <Modal title={`Record payment · ${invoice.invoiceNo}`} sub={`Balance due ${money(invoice.balance)}`} icon={<span className="pw-dicon" style={{ '--c': '#059669' }}><i className="mdi mdi-cash-plus"></i></span>} onClose={onClose}
            footer={<><button type="button" className="pp-btn" onClick={onClose}>Cancel</button><button type="button" className="pp-btn primary" disabled={busy} onClick={save}><i className="mdi mdi-check"></i>{busy ? 'Saving…' : 'Record'}</button></>}>
            <div className="pw-form">
                <label className="pw-field"><span>Amount received (₹)</span><input type="number" className="pp-input" min="0" value={f.amount} onChange={(e) => setF((x) => ({ ...x, amount: e.target.value }))} /></label>
                <label className="pw-field"><span>TDS deducted (₹)</span><input type="number" className="pp-input" min="0" value={f.tds} onChange={(e) => setF((x) => ({ ...x, tds: e.target.value }))} placeholder="0" /></label>
                <label className="pw-field"><span>Date received</span><input type="date" className="pp-input" value={f.date} onChange={(e) => setF((x) => ({ ...x, date: e.target.value }))} /></label>
                <label className="pw-field"><span>Mode</span><select className="pp-select" value={f.mode} onChange={(e) => setF((x) => ({ ...x, mode: e.target.value }))}>{['Bank transfer', 'Cheque', 'UPI', 'Cash', 'Other'].map((m) => <option key={m}>{m}</option>)}</select></label>
                <label className="pw-field wide"><span>Reference (UTR / cheque no.)</span><input className="pp-input" value={f.reference} onChange={(e) => setF((x) => ({ ...x, reference: e.target.value }))} /></label>
            </div>
            <button type="button" className="bl-tds" onClick={tds10}><i className="mdi mdi-calculator-variant-outline"></i>Client deducted TDS @10% (194J)? Fill it in</button>
        </Modal>
    )
}

/* ---------------- invoice drawer ---------------- */
export const InvoiceDrawer = ({ id, onClose, onChanged }) => {
    const [d, setD] = useState(null)
    const [pane, setPane] = useState(null) // 'edit' | 'pay'
    const [cancelling, setCancelling] = useState(false)
    const [reason, setReason] = useState('')
    const load = () => api('GET', `/invoices/${id}`).then(setD).catch((e) => { toast.error(e.message); onClose() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { load() }, [id])
    useEffect(() => { const k = (e) => e.key === 'Escape' && !pane && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose, pane])
    if (!d) return createPortal(<div className="pp it-overlay"><aside className="it-drawer"><div className="pw-loading"><i className="mdi mdi-loading mdi-spin"></i></div></aside></div>, document.body)
    const inv = d.data
    const changed = (x) => { setPane(null); if (x?.deleted) { onChanged?.(); onClose(); return } load(); onChanged?.() }
    const issue = async () => { try { const j = await api('POST', `/invoices/${inv._id}/issue`, {}); toast.success(j.message, { title: 'Invoice issued' }); changed() } catch (e) { toast.error(e.message) } }
    const cancel = async () => {
        try { const j = await api('POST', `/invoices/${inv._id}/cancel`, { reason }); toast.success(j.message, { title: inv.status === 'Draft' ? 'Draft discarded' : 'Invoice cancelled' }); setCancelling(false); changed(j.data) } catch (e) { toast.error(e.message) }
    }
    const [c] = INV_STATUS[inv.status] || INV_STATUS.Draft
    return createPortal(
        <div className="pp it-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <aside className="it-drawer bl-drawer" style={{ '--c': c }}>
                <header className="it-head">
                    <div className="it-head-top">
                        <span className="it-no">{inv.invoiceNo || 'Draft'}</span>
                        <InvStatus s={inv.status} overdue={inv.overdueDays} />
                        <button type="button" className="it-x" onClick={onClose} aria-label="Close"><i className="mdi mdi-close"></i></button>
                    </div>
                    <h2>{inv.billTo?.name}</h2>
                    {inv.auditId && <Link to={`/audits/${inv.auditId._id}`} className="it-proj"><i className="mdi mdi-briefcase-search-outline"></i>{inv.auditId.auditCode} · {inv.auditId.engagementName || `${inv.auditId.auditType} audit`}<i className="mdi mdi-chevron-right"></i></Link>}
                    <div className="bl-amounts">
                        <div><small>Total</small><b>{money(inv.total)}</b></div>
                        <div><small>Received{inv.payments?.some((p) => p.tds) ? ' + TDS' : ''}</small><b className="ok">{money(inv.paid)}</b></div>
                        <div><small>Balance</small><b className={inv.balance > 0 ? 'due' : ''}>{money(inv.balance)}</b></div>
                    </div>
                    {d.canBill && (
                        <div className="it-tools">
                            {inv.status === 'Draft' && <><button type="button" className="it-tool" onClick={() => setPane('edit')}><i className="mdi mdi-pencil-outline"></i>Edit draft</button><button type="button" className="it-tool close" onClick={issue}><i className="mdi mdi-file-send-outline"></i>Issue</button></>}
                            {['Issued', 'Partly paid'].includes(inv.status) && <button type="button" className="it-tool close" onClick={() => setPane('pay')}><i className="mdi mdi-cash-plus"></i>Record payment</button>}
                            {inv.status !== 'Draft' && <a className="it-tool" href={`/audits/invoices/${inv._id}/print`} target="_blank" rel="noreferrer"><i className="mdi mdi-printer"></i>Print / PDF</a>}
                            {inv.status !== 'Cancelled' && !(inv.payments || []).length && <button type="button" className="it-tool danger" onClick={() => setCancelling(true)}><i className="mdi mdi-cancel"></i>{inv.status === 'Draft' ? 'Discard' : 'Cancel'}</button>}
                        </div>
                    )}
                </header>
                <div className="it-body">
                    {inv.status === 'Cancelled' && <div className="it-closed"><i className="mdi mdi-cancel"></i><div><b>Cancelled {fmtD(inv.cancelledAt)}</b><p>{inv.cancelReason}</p></div></div>}
                    <dl className="it-grid">
                        <div><dt>Invoice date</dt><dd>{fmtD(inv.invoiceDate)}</dd></div>
                        <div><dt>Due</dt><dd>{fmtD(inv.dueDate)}{inv.overdueDays ? <em className="bl-od"> · {inv.overdueDays} days overdue</em> : null}</dd></div>
                        <div><dt>Client GSTIN</dt><dd>{inv.billTo?.gstin || '—'}</dd></div>
                        <div><dt>Place of supply</dt><dd>{inv.billTo?.state || '—'} · {inv.interState ? 'IGST' : 'CGST + SGST'}</dd></div>
                        <div><dt>Issued by</dt><dd>{inv.issuedBy ? `${inv.issuedBy.firstName} ${inv.issuedBy.lastName}` : '—'}</dd></div>
                        <div><dt>Created by</dt><dd>{inv.createdBy ? `${inv.createdBy.firstName} ${inv.createdBy.lastName}` : '—'}</dd></div>
                    </dl>
                    <section className="it-sec">
                        <h4>Lines</h4>
                        <table className="bl-lines view"><tbody>
                            {inv.lines.map((l, i) => <tr key={i}><td>{l.description}<small>SAC {l.sac}{l.kind === 'Hours' ? ` · ${l.qty}h × ${money(l.rate)}` : l.qty > 1 ? ` · ${l.qty} × ${money(l.rate)}` : ''}</small></td><td className="n">{money(l.amount, { decimals: 2 })}</td></tr>)}
                            <tr className="sub"><td>Subtotal</td><td className="n">{money(inv.subtotal, { decimals: 2 })}</td></tr>
                            {inv.interState ? <tr className="sub"><td>IGST {inv.gstRate}%</td><td className="n">{money(inv.igst, { decimals: 2 })}</td></tr> : <>
                                <tr className="sub"><td>CGST {inv.gstRate / 2}%</td><td className="n">{money(inv.cgst, { decimals: 2 })}</td></tr>
                                <tr className="sub"><td>SGST {inv.gstRate / 2}%</td><td className="n">{money(inv.sgst, { decimals: 2 })}</td></tr>
                            </>}
                            {inv.roundOff ? <tr className="sub"><td>Round off</td><td className="n">{money(inv.roundOff, { decimals: 2 })}</td></tr> : null}
                            <tr className="tot"><td>Total</td><td className="n">{money(inv.total)}</td></tr>
                        </tbody></table>
                        <p className="bl-words">{inv.amountInWords}</p>
                    </section>
                    <section className="it-sec">
                        <h4>Payments <span>{(inv.payments || []).length}</span></h4>
                        {(inv.payments || []).length ? <ul className="bl-pays">{inv.payments.map((p, i) => (
                            <li key={p._id || i}><i className="mdi mdi-cash-check"></i><div><b>{money(p.amount)}{p.tds ? ` + TDS ${money(p.tds)}` : ''}</b><small>{fmtD(p.date)} · {p.mode}{p.reference ? ` · ${p.reference}` : ''}{p.recordedBy ? ` · by ${p.recordedBy.firstName}` : ''}</small></div></li>
                        ))}</ul> : <p className="it-muted">{inv.status === 'Draft' ? 'Issue the invoice to start collecting.' : 'No payment yet.'}</p>}
                    </section>
                    {inv.notes && <section className="it-sec"><h4>Notes</h4><p className="it-desc">{inv.notes}</p></section>}
                    {cancelling && (
                        <section className="it-sec it-change">
                            <h4>{inv.status === 'Draft' ? 'Discard this draft?' : 'Cancel this invoice'}</h4>
                            {inv.status !== 'Draft' && <textarea className="pp-input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (kept on record)" />}
                            <div className="it-change-foot"><button type="button" className="pp-btn" onClick={() => setCancelling(false)}>Keep it</button>&nbsp;<button type="button" className="pp-btn danger" onClick={cancel}>{inv.status === 'Draft' ? 'Discard draft' : 'Cancel invoice'}</button></div>
                        </section>
                    )}
                </div>
            </aside>
            {pane === 'edit' && <InvoiceEditor invoice={inv} onClose={() => setPane(null)} onSaved={changed} />}
            {pane === 'pay' && <PaymentModal invoice={inv} onClose={() => setPane(null)} onSaved={changed} />}
        </div>,
        document.body
    )
}

/* ---------------- billing settings ---------------- */
export const BillingSettings = ({ onClose, onSaved }) => {
    const [f, setF] = useState(null)
    const [busy, setBusy] = useState(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { api('GET', '/billing/settings').then((j) => setF({ ...j.data, bank: { ...(j.data.bank || {}) } })).catch((e) => { toast.error(e.message); onClose() }) }, [])
    if (!f) return null
    const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
    const setB = (k) => (e) => setF((x) => ({ ...x, bank: { ...x.bank, [k]: e.target.value } }))
    const save = async () => { setBusy(true); try { const j = await api('PUT', '/billing/settings', f); toast.success(j.message, { title: 'Billing details' }); onSaved?.() ; onClose() } catch (e) { toast.error(e.message) } setBusy(false) }
    return (
        <Modal wide title="Billing details" sub="What prints on every invoice" icon={<span className="pw-dicon"><i className="mdi mdi-cog-outline"></i></span>} onClose={onClose}
            footer={<><button type="button" className="pp-btn" onClick={onClose}>Cancel</button><button type="button" className="pp-btn primary" disabled={busy} onClick={save}><i className="mdi mdi-content-save-outline"></i>{busy ? 'Saving…' : 'Save'}</button></>}>
            <div className="pw-form">
                <label className="pw-field wide"><span>Legal name</span><input className="pp-input" value={f.legalName || ''} onChange={set('legalName')} /></label>
                <label className="pw-field wide"><span>Address</span><input className="pp-input" value={f.address || ''} onChange={set('address')} /></label>
                <label className="pw-field"><span>State</span><input className="pp-input" value={f.state || ''} onChange={set('state')} /></label>
                <label className="pw-field"><span>State code</span><input className="pp-input" value={f.stateCode || ''} onChange={set('stateCode')} /></label>
                <label className="pw-field"><span>GSTIN</span><input className="pp-input" value={f.gstin || ''} onChange={set('gstin')} /></label>
                <label className="pw-field"><span>PAN</span><input className="pp-input" value={f.pan || ''} onChange={set('pan')} /></label>
                <label className="pw-field"><span>Email</span><input className="pp-input" value={f.email || ''} onChange={set('email')} /></label>
                <label className="pw-field"><span>Phone</span><input className="pp-input" value={f.phone || ''} onChange={set('phone')} /></label>
                <label className="pw-field"><span>Invoice prefix</span><input className="pp-input" value={f.invoicePrefix || ''} onChange={set('invoicePrefix')} /></label>
                <label className="pw-field"><span>SAC code</span><input className="pp-input" value={f.sacCode || ''} onChange={set('sacCode')} /></label>
                <label className="pw-field"><span>GST rate %</span><input type="number" className="pp-input" value={f.gstRate ?? 18} onChange={set('gstRate')} /></label>
                <label className="pw-field"><span>Credit period (days)</span><input type="number" className="pp-input" value={f.paymentTermsDays ?? 15} onChange={set('paymentTermsDays')} /></label>
                <label className="pw-field"><span>Bank</span><input className="pp-input" value={f.bank.name || ''} onChange={setB('name')} /></label>
                <label className="pw-field"><span>Account name</span><input className="pp-input" value={f.bank.accountName || ''} onChange={setB('accountName')} /></label>
                <label className="pw-field"><span>Account number</span><input className="pp-input" value={f.bank.accountNo || ''} onChange={setB('accountNo')} /></label>
                <label className="pw-field"><span>IFSC</span><input className="pp-input" value={f.bank.ifsc || ''} onChange={setB('ifsc')} /></label>
                <label className="pw-field wide"><span>Terms printed on the invoice</span><textarea className="pp-input" rows={3} value={f.terms || ''} onChange={set('terms')} /></label>
            </div>
        </Modal>
    )
}

/* ---------------- charges declared on an engagement ---------------- */
// One engagement can carry several kinds of charge; monthly bills are prepared from these.
export const CHARGE_TYPES = {
    'Fixed fee': ['mdi-cash', 'Amount', null],
    Hourly: ['mdi-timer-outline', 'Rate / hour', 'Est. hours'],
    'Monthly retainer': ['mdi-calendar-month-outline', 'Per month', 'Months'],
    'Per visit': ['mdi-map-marker-outline', 'Per visit', 'Est. visits'],
    Milestone: ['mdi-flag-checkered', 'Amount', null],
    Expenses: ['mdi-cash-refund', 'Amount', null],
}
const chargeValue = (c) => (Number(c.rate) || 0) * (CHARGE_TYPES[c.type]?.[2] ? Number(c.quantity) || 0 : 1)
export const ChargesEditor = ({ audit, canEdit, onSaved }) => {
    const [rows, setRows] = useState(() => (audit.charges || []).map((c) => ({ ...c })))
    const [busy, setBusy] = useState(false)
    const dirty = JSON.stringify(rows) !== JSON.stringify(audit.charges || [])
    useEffect(() => { setRows((audit.charges || []).map((c) => ({ ...c }))) }, [audit.charges])
    const set = (i, k, v) => setRows((l) => l.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
    const add = (type) => setRows((l) => [...l, { type, label: { 'Fixed fee': 'Professional fees', Hourly: 'Professional time', 'Monthly retainer': 'Monthly retainer', 'Per visit': 'Site visits', Milestone: 'Milestone', Expenses: 'Out-of-pocket expenses' }[type], rate: 0, quantity: CHARGE_TYPES[type][2] ? 1 : 1, active: true }])
    const total = rows.filter((r) => r.active !== false && r.type !== 'Expenses').reduce((t, r) => t + chargeValue(r), 0)
    const save = async () => {
        setBusy(true)
        try { const j = await api('PUT', `/audits/${audit._id}/charges`, { charges: rows }); toast.success(j.message, { title: 'Charges saved' }); onSaved?.() } catch (e) { toast.error(e.message) }
        setBusy(false)
    }
    return (
        <section className="bl-charges">
            <header><i className="mdi mdi-tag-multiple-outline"></i><div><b>What the client is charged</b><small>Declare every kind of charge for this work — bills for any period are prepared from these.</small></div><span>Contract value <b>{money(total)}</b></span></header>
            {rows.length ? (
                <div className="tk-table-wrap"><table className="bl-ctable">
                    <thead><tr><th>Type</th><th>Description</th><th className="n">Rate</th><th className="n">Quantity</th><th className="n">Value</th><th></th></tr></thead>
                    <tbody>{rows.map((r, i) => {
                        const [ic, rateLabel, qtyLabel] = CHARGE_TYPES[r.type] || CHARGE_TYPES['Fixed fee']
                        return (
                            <tr key={r._id || i} className={r.active === false ? 'off' : ''}>
                                <td><span className="bl-ctype"><i className={`mdi ${ic}`}></i>{canEdit ? <select className="pp-select" value={r.type} onChange={(e) => set(i, 'type', e.target.value)}>{Object.keys(CHARGE_TYPES).map((t) => <option key={t}>{t}</option>)}</select> : r.type}</span></td>
                                <td>{canEdit ? <input className="pp-input" value={r.label || ''} onChange={(e) => set(i, 'label', e.target.value)} /> : r.label}</td>
                                <td className="n">{canEdit ? <input type="number" min="0" className="pp-input n" value={r.rate} onChange={(e) => set(i, 'rate', e.target.value)} title={rateLabel} /> : money(r.rate)}<small>{rateLabel}</small></td>
                                <td className="n">{qtyLabel ? (canEdit ? <input type="number" min="0" step="0.5" className="pp-input n" value={r.quantity} onChange={(e) => set(i, 'quantity', e.target.value)} /> : r.quantity) : '—'}<small>{qtyLabel || ''}</small></td>
                                <td className="n"><b>{r.type === 'Expenses' ? 'at cost' : money(chargeValue(r))}</b></td>
                                <td>{canEdit && <span className="bl-cact"><button type="button" title={r.active === false ? 'Turn on' : 'Pause'} onClick={() => set(i, 'active', r.active === false)}><i className={`mdi ${r.active === false ? 'mdi-play' : 'mdi-pause'}`}></i></button><button type="button" title="Remove" onClick={() => setRows((l) => l.filter((_, j) => j !== i))}><i className="mdi mdi-close"></i></button></span>}</td>
                            </tr>
                        )
                    })}</tbody>
                </table></div>
            ) : <p className="it-muted">{canEdit ? 'No charges yet — add the fixed fee, hourly rate, retainer, visits or milestones agreed with the client.' : 'No charges declared yet.'}</p>}
            {canEdit && (
                <div className="bl-cfoot">
                    <div className="bl-ed-add">{Object.entries(CHARGE_TYPES).map(([t, [ic]]) => <button key={t} type="button" onClick={() => add(t)}><i className={`mdi ${ic}`}></i>{t}</button>)}</div>
                    <button type="button" className="pp-btn primary sm" disabled={busy || !dirty} onClick={save}><i className="mdi mdi-content-save-outline"></i>{busy ? 'Saving…' : 'Save charges'}</button>
                </div>
            )}
        </section>
    )
}
