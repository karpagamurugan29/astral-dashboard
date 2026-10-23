import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { chatApi as api } from '../../../components/chat/chatApi'
import { money } from '../../../components/payroll/PayrollUI'
import './InvoicePrint.css'

/* A4 tax invoice, ready to print or save as PDF from the browser. Opens in its own tab. */
const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
const m2 = (n) => money(n, { decimals: 2 })

export const InvoicePrint = () => {
    const { id } = useParams()
    const [d, setD] = useState(null)
    const [err, setErr] = useState('')
    useEffect(() => { api('GET', `/invoices/${id}`).then(setD).catch((e) => setErr(e.message)) }, [id])
    useEffect(() => { if (d) document.title = `${d.data.invoiceNo || 'Draft invoice'} · ${d.data.billTo?.name || ''}` }, [d])
    if (err) return <div className="ip-msg">{err}</div>
    if (!d) return <div className="ip-msg">Preparing the invoice…</div>
    const inv = d.data, firm = d.firm || {}
    const draft = inv.status === 'Draft', cancelled = inv.status === 'Cancelled'
    return (
        <div className="ip-page">
            <div className="ip-bar">
                <span>{inv.invoiceNo || 'Draft'} · {inv.billTo?.name}</span>
                <button type="button" onClick={() => window.print()}><i className="mdi mdi-printer"></i>Print / Save as PDF</button>
            </div>
            <article className="ip-sheet">
                {(draft || cancelled) && <div className="ip-stamp">{draft ? 'DRAFT' : 'CANCELLED'}</div>}
                {inv.status === 'Paid' && <div className="ip-stamp paid">PAID</div>}
                <header className="ip-head">
                    <div className="ip-firm">
                        <img src="/assets/images/astral-mark.png" alt="" />
                        <div>
                            <h1>{firm.legalName || 'Astral Consulting Limited'}</h1>
                            <p>{firm.address || 'Coimbatore, Tamil Nadu'}</p>
                            <p>{[firm.gstin && `GSTIN ${firm.gstin}`, firm.pan && `PAN ${firm.pan}`].filter(Boolean).join(' · ')}</p>
                            <p>{[firm.email, firm.phone].filter(Boolean).join(' · ')}</p>
                        </div>
                    </div>
                    <div className="ip-title">
                        <h2>Tax Invoice</h2>
                        <dl>
                            <dt>Invoice no.</dt><dd>{inv.invoiceNo || '—'}</dd>
                            <dt>Date</dt><dd>{fmt(inv.invoiceDate)}</dd>
                            <dt>Due date</dt><dd>{fmt(inv.dueDate)}</dd>
                            {inv.auditId && <><dt>Engagement</dt><dd>{inv.auditId.auditCode}</dd></>}
                        </dl>
                    </div>
                </header>
                <section className="ip-parties">
                    <div>
                        <h3>Bill to</h3>
                        <b>{inv.billTo?.name}</b>
                        {inv.billTo?.address && <p>{inv.billTo.address}</p>}
                        <p>{[inv.billTo?.city, inv.billTo?.state].filter(Boolean).join(', ')}</p>
                        {inv.billTo?.gstin && <p>GSTIN {inv.billTo.gstin}</p>}
                        {inv.billTo?.pan && <p>PAN {inv.billTo.pan}</p>}
                        {inv.billTo?.contactPerson && <p>Attn: {inv.billTo.contactPerson}</p>}
                    </div>
                    <div>
                        <h3>Place of supply</h3>
                        <b>{inv.billTo?.state || firm.state || '—'}</b>
                        <p>{inv.interState ? 'Inter-state supply · IGST' : 'Intra-state supply · CGST + SGST'}</p>
                        {inv.auditId && <><h3 style={{ marginTop: 10 }}>Engagement</h3><p>{inv.auditId.engagementName || `${inv.auditId.auditType} audit`}{inv.auditId.financialYear ? ` · FY ${inv.auditId.financialYear}` : ''}</p></>}
                    </div>
                </section>
                <table className="ip-lines">
                    <thead><tr><th>#</th><th>Description of service</th><th>SAC</th><th className="n">Qty</th><th className="n">Rate</th><th className="n">Amount (₹)</th></tr></thead>
                    <tbody>{inv.lines.map((l, i) => <tr key={i}><td>{i + 1}</td><td>{l.description}</td><td>{l.sac}</td><td className="n">{l.kind === 'Fee' && l.qty <= 1 ? '1' : l.qty}</td><td className="n">{m2(l.rate)}</td><td className="n">{m2(l.amount)}</td></tr>)}</tbody>
                </table>
                <section className="ip-foot">
                    <div className="ip-words">
                        <h3>Amount in words</h3>
                        <p>{inv.amountInWords}</p>
                        {firm.bank?.accountNo && <>
                            <h3>Bank details</h3>
                            <p>{firm.bank.accountName || firm.legalName}<br />{firm.bank.name}{firm.bank.branch ? `, ${firm.bank.branch}` : ''}<br />A/c {firm.bank.accountNo} · IFSC {firm.bank.ifsc}</p>
                        </>}
                        {inv.notes && <><h3>Notes</h3><p>{inv.notes}</p></>}
                    </div>
                    <table className="ip-totals"><tbody>
                        <tr><td>Taxable value</td><td>{m2(inv.taxableValue)}</td></tr>
                        {inv.subtotal !== inv.taxableValue && <tr><td>Non-taxable</td><td>{m2(inv.subtotal - inv.taxableValue)}</td></tr>}
                        {inv.interState ? <tr><td>IGST @ {inv.gstRate}%</td><td>{m2(inv.igst)}</td></tr> : <>
                            <tr><td>CGST @ {inv.gstRate / 2}%</td><td>{m2(inv.cgst)}</td></tr>
                            <tr><td>SGST @ {inv.gstRate / 2}%</td><td>{m2(inv.sgst)}</td></tr>
                        </>}
                        {inv.roundOff ? <tr><td>Round off</td><td>{m2(inv.roundOff)}</td></tr> : null}
                        <tr className="tot"><td>Total</td><td>{money(inv.total)}</td></tr>
                        {inv.paid > 0 && <tr><td>Received</td><td>− {m2(inv.paid)}</td></tr>}
                        {inv.paid > 0 && <tr className="bal"><td>Balance due</td><td>{money(inv.balance)}</td></tr>}
                    </tbody></table>
                </section>
                <footer className="ip-sign">
                    <p className="ip-terms">{firm.terms}</p>
                    <div><span>For {firm.legalName || 'Astral Consulting Limited'}</span><i></i><b>Authorised signatory</b></div>
                </footer>
                <p className="ip-gen">This is a computer-generated invoice.</p>
            </article>
        </div>
    )
}
