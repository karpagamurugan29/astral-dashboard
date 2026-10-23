import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PeopleShell, EmptyState, ErrorBanner } from '../../../components/people/PeopleUI'
import { AUDITS_ROOT } from '../../../components/audits/AuditUI'
import { moneyShort } from '../../../components/payroll/PayrollUI'
import { toast } from '../../../components/common/Toaster'
import { api, money, InvStatus, InvoiceDrawer, InvoiceEditor, BillingSettings, fmtD } from './InvoiceParts'

/* Billing & collections for the firm's leadership and Accounts: what's been billed this
   financial year, what's collected, what's outstanding and how old it is, fees still to bill
   on open engagements, and the invoice register. */

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
// billing runs month by month; the presets cover the usual periods
export const PRESETS = (() => {
    const n = new Date(), y = n.getFullYear(), m = n.getMonth()
    const q = Math.floor(m / 3) * 3, fy = m >= 3 ? y : y - 1
    return [
        ['month', 'This month', iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))],
        ['last', 'Last month', iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))],
        ['quarter', 'This quarter', iso(new Date(y, q, 1)), iso(new Date(y, q + 3, 0))],
        ['fy', `FY ${fy}-${String((fy + 1) % 100).padStart(2, '0')}`, iso(new Date(fy, 3, 1)), iso(new Date(fy + 1, 2, 31))],
    ]
})()
export const rangeLabel = (from, to) => { const p = PRESETS.find((x) => x[2] === from && x[3] === to); return p ? p[1] : `${new Date(from).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${new Date(to).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` }
const STATUSES = ['', 'Draft', 'Issued', 'Partly paid', 'Paid', 'Cancelled']

export const Billing = () => {
    const [d, setD] = useState(null)
    const [error, setError] = useState('')
    const [range, setRange] = useState({ from: PRESETS[0][2], to: PRESETS[0][3] })
    const [status, setStatus] = useState('')
    const [q, setQ] = useState('')
    const [openId, setOpenId] = useState(null)
    const [editing, setEditing] = useState(null)
    const [settings, setSettings] = useState(false)
    const [busy, setBusy] = useState('')

    const load = useCallback(() => api('GET', `/invoices?from=${range.from}&to=${range.to}${status ? `&status=${encodeURIComponent(status)}` : ''}`).then((j) => { setD(j); setError('') }).catch((e) => setError(e.message)), [range, status])
    useEffect(() => { load() }, [load])

    const raise = async (a) => {
        setBusy(a._id)
        try {
            const j = await api('POST', '/invoices/prepare', { auditId: a._id, from: range.from, to: range.to })
            toast.success(j.message, { title: 'Draft bill' })
            ;(j.warnings || []).forEach((w) => toast.warning(w, { title: 'Not billed yet' }))
            setEditing(j.data); load()
        } catch (e) { toast.error(e.message) }
        setBusy('')
    }

    if (error) return <PeopleShell title="Billing" root={AUDITS_ROOT} crumbs={[{ label: 'Billing' }]}><ErrorBanner error={error} /></PeopleShell>
    const s = d?.stats
    const list = (d?.data || []).filter((i) => !q || `${i.invoiceNo || 'draft'} ${i.billTo?.name} ${i.auditId?.auditCode || ''}`.toLowerCase().includes(q.toLowerCase()))
    const agingMax = s ? Math.max(1, ...Object.values(s.aging)) : 1
    const collected = s && s.billed ? Math.round((s.received / s.billed) * 100) : 0

    return (
        <PeopleShell title="Billing & collections" root={AUDITS_ROOT} crumbs={[{ label: 'Billing' }]}
            actions={<>
                {d?.canBill && <button type="button" className="pp-btn" onClick={() => setSettings(true)}><i className="mdi mdi-cog-outline"></i>Billing details</button>}
            </>}>
            <div className="bl-range">
                <div className="bl-chips">{PRESETS.map(([k, label, f, t]) => <button key={k} type="button" className={range.from === f && range.to === t ? 'on' : ''} onClick={() => setRange({ from: f, to: t })}>{label}</button>)}</div>
                <label><span>From</span><input type="date" className="pp-input" value={range.from} max={range.to} onChange={(e) => e.target.value && setRange((r) => ({ ...r, from: e.target.value }))} /></label>
                <label><span>To</span><input type="date" className="pp-input" value={range.to} min={range.from} onChange={(e) => e.target.value && setRange((r) => ({ ...r, to: e.target.value }))} /></label>
            </div>
            {!d ? <div className="pp-card"><div className="pw-loading"><i className="mdi mdi-loading mdi-spin"></i></div></div> : <>
                <div className="bl-kpis">
                    <div className="bl-kpi" style={{ '--c': '#1e40af' }}><small>Billed · {rangeLabel(range.from, range.to)}</small><b>{money(s.billed)}</b><span>incl. GST {moneyShort(s.gst)}</span></div>
                    <div className="bl-kpi" style={{ '--c': '#059669' }}><small>Collected</small><b>{money(s.received)}</b><span><em style={{ width: `${collected}%` }}></em>{collected}% of billed</span></div>
                    <div className="bl-kpi" style={{ '--c': '#d97706' }}><small>Outstanding</small><b>{money(s.outstanding)}</b><span>{s.overdue ? <><i className="mdi mdi-clock-alert-outline"></i>{money(s.overdue)} overdue</> : 'Nothing overdue'}</span></div>
                    <div className="bl-kpi" style={{ '--c': '#7c3aed' }}><small>Billable in this period</small><b>{money(s.unbilledTotal)}</b><span>{d.unbilled.length} open engagement{d.unbilled.length === 1 ? '' : 's'}{s.drafts ? ` · ${s.drafts} draft${s.drafts === 1 ? '' : 's'}` : ''}</span></div>
                </div>

                <div className="bl-two">
                    <section className="pp-card bl-panel">
                        <header><i className="mdi mdi-chart-donut"></i><b>Receivables ageing</b><small>days past due</small></header>
                        <div className="bl-aging">{Object.entries(s.aging).map(([k, v], i) => (
                            <div key={k} style={{ '--c': ['#059669', '#d97706', '#ea580c', '#e11d48'][i] }}><span>{k}</span><div><i style={{ width: `${(v / agingMax) * 100}%` }}></i></div><b>{moneyShort(v)}</b></div>
                        ))}</div>
                        <header className="mt"><i className="mdi mdi-domain"></i><b>Top clients</b><small>billed · balance</small></header>
                        {s.topClients.length ? <ul className="bl-clients">{s.topClients.map((c) => <li key={c.name}><span>{c.name}</span><b>{moneyShort(c.billed)}</b><em className={c.balance > 0 ? 'due' : ''}>{c.balance > 0 ? moneyShort(c.balance) : 'Settled'}</em></li>)}</ul> : <p className="it-muted">No invoices this year yet.</p>}
                    </section>
                    <section className="pp-card bl-panel">
                        <header><i className="mdi mdi-cash-multiple"></i><b>Ready to bill · {rangeLabel(range.from, range.to)}</b><small>from each engagement’s charges</small></header>
                        {d.unbilled.length ? <ul className="bl-unbilled">{d.unbilled.map((a) => (
                            <li key={a._id}>
                                <div>
                                    <Link to={`/audits/${a._id}`}><b>{a.auditCode}</b> {a.clientName}</Link>
                                    <small>{a.engagementName || a.status}{a.charges ? ` · ${a.charges} charge${a.charges === 1 ? '' : 's'}` : ' · fixed fee'}</small>
                                    {(a.lines || []).length > 0 && <ul className="bl-mini">{a.lines.map((l, i) => <li key={i}><span>{l.description}</span><b>{moneyShort(l.amount)}</b></li>)}</ul>}
                                    {(a.warnings || []).map((w, i) => <em key={i} className="bl-warn"><i className="mdi mdi-alert-outline"></i>{w}</em>)}
                                </div>
                                <b className="amt">{money(a.unbilled)}</b>
                                {d.canBill && a.unbilled > 0 && <button type="button" className="pp-btn sm primary" disabled={busy === a._id} onClick={() => raise(a)}><i className="mdi mdi-receipt"></i>Bill</button>}
                            </li>
                        ))}</ul> : <p className="it-muted">Nothing left to bill in this period.</p>}
                    </section>
                </div>

                <section className="pp-card bl-register">
                    <div className="bl-reg-head">
                        <b>Invoice register</b>
                        <div className="bl-chips">{STATUSES.map((x) => <button key={x || 'all'} type="button" className={status === x ? 'on' : ''} onClick={() => setStatus(x)}>{x || 'All'}</button>)}</div>
                        <div className="pp-search"><i className="mdi mdi-magnify"></i><input type="search" className="pp-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Invoice no., client, audit…" /></div>
                    </div>
                    {!list.length ? <EmptyState icon="mdi-receipt" title="No invoices" text={d.canBill ? 'Bill an engagement from “Ready to bill”, or from the audit itself.' : 'Invoices raised by Accounts appear here.'} /> : (
                        <div className="tk-table-wrap"><table className="bl-table">
                            <thead><tr><th>Invoice</th><th>Date</th><th>Client</th><th>Audit</th><th className="n">Amount</th><th className="n">Balance</th><th>Status</th><th>Due</th></tr></thead>
                            <tbody>{list.map((i) => (
                                <tr key={i._id} onClick={() => setOpenId(i._id)} className={i.status === 'Cancelled' ? 'cx' : ''}>
                                    <td className="no">{i.invoiceNo || <em>Draft</em>}</td>
                                    <td>{fmtD(i.invoiceDate)}</td>
                                    <td><b>{i.billTo?.name}</b></td>
                                    <td>{i.auditId?.auditCode || '—'}</td>
                                    <td className="n">{money(i.total)}</td>
                                    <td className={`n ${i.balance > 0 ? 'due' : ''}`}>{i.status === 'Draft' || i.status === 'Cancelled' ? '—' : money(i.balance)}</td>
                                    <td><InvStatus s={i.status} overdue={i.overdueDays} /></td>
                                    <td>{i.status === 'Paid' || i.status === 'Cancelled' ? '—' : fmtD(i.dueDate)}</td>
                                </tr>
                            ))}</tbody>
                        </table></div>
                    )}
                </section>
            </>}
            {openId && <InvoiceDrawer id={openId} onClose={() => setOpenId(null)} onChanged={load} />}
            {editing && <InvoiceEditor invoice={editing} onClose={() => setEditing(null)} onSaved={(inv) => { setEditing(null); load(); if (inv?._id) setOpenId(inv._id) }} />}
            {settings && <BillingSettings onClose={() => setSettings(false)} />}
        </PeopleShell>
    )
}
