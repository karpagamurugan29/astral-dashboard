import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Avatar } from '../people/PeopleUI'
import { CATEGORIES, categoryMeta, expenseStatusMeta, ownerId } from './ExpenseUI'
import {
    fmtMoney, fmtShort, fmtDate, personName, expenseTitle, expenseRef, submittedOn, daysSince, approvedOn, rejectedOn, reimbursedOn, rejectedBy,
    EMPTY_FILTERS, FILTER_LABELS, PAYMENT_METHODS, SORTS,
} from './expenseUtils'

/* -------------------------------------------------------------------------- */
/*  Expense list building blocks: header, summary, tabs, toolbar, table,      */
/*  mobile cards, pagination, empty states.                                    */
/* -------------------------------------------------------------------------- */

export const StatusBadge = ({ status }) => {
    const m = expenseStatusMeta(status)
    return <span className="xp-badge" style={{ '--c': m.color }}><i></i>{status}</span>
}

export const CategoryChip = ({ category }) => {
    const m = categoryMeta(category)
    return <span className="xp-cat" style={{ '--c': m.color }}><i className={`mdi ${m.icon}`}></i>{category === 'Client Entertainment' ? 'Entertainment' : category}</span>
}

/* ---------------- header ---------------- */
export const ExpensesHeader = ({ onAdd, actions }) => (
    <header className="xp-header">
        <div>
            <h1>Expenses</h1>
            <p>Track, review and manage business expenses</p>
        </div>
        <div className="xp-header-actions">
            {actions}
            <button type="button" className="xp-btn primary" onClick={onAdd}><i className="mdi mdi-plus"></i>Add Expense</button>
        </div>
    </header>
)

/* ---------------- summary cards ---------------- */
// cards: [{ key, label, value, sub, trend, icon, tone }]
export const ExpenseSummary = ({ cards, loading }) => (
    <div className="xp-summary">
        {cards.map((c) => (
            <div key={c.key} className="xp-stat" style={{ '--c': c.tone }}>
                <div className="xp-stat-top"><span>{c.label}</span><i className={`mdi ${c.icon}`}></i></div>
                {loading ? <span className="xp-skel" style={{ height: 22, width: '60%' }}></span> : <b>{c.value}</b>}
                <div className="xp-stat-foot">
                    {c.sub && <small>{c.sub}</small>}
                    {c.trend !== undefined && c.trend !== null && (
                        <em className={c.trend > 0 ? 'up' : c.trend < 0 ? 'down' : ''} title="Compared with last month">
                            <i className={`mdi ${c.trend > 0 ? 'mdi-arrow-up' : c.trend < 0 ? 'mdi-arrow-down' : 'mdi-minus'}`}></i>{Math.abs(Math.round(c.trend))}%
                        </em>
                    )}
                </div>
            </div>
        ))}
    </div>
)

/* ---------------- tabs ---------------- */
export const ExpenseTabs = ({ tabs, active, onChange }) => (
    <nav className="xp-tabs" role="tablist" aria-label="Expense views">
        {tabs.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={active === t.key} className={active === t.key ? 'on' : ''} onClick={() => onChange(t.key)}>
                {t.icon && <i className={`mdi ${t.icon}`}></i>}{t.label}{t.count !== undefined && <span>{t.count}</span>}
            </button>
        ))}
    </nav>
)

/* ---------------- per-view KPI strip ---------------- */
export const KpiStrip = ({ items }) => (
    <div className="xp-kpis">
        {items.map((k) => (
            <div key={k.label} className={k.warn ? 'warn' : ''}>
                <span>{k.label}</span>
                <b title={k.title || undefined}>{k.value}</b>
                {k.sub && <small>{k.sub}</small>}
            </div>
        ))}
    </div>
)

/* ---------------- toolbar + advanced filters ---------------- */
export const ExpenseFilters = ({ filters, onApply, employees, departments, show = {}, onClose }) => {
    const [draft, setDraft] = useState(filters)
    useEffect(() => { setDraft(filters) }, [filters])
    const set = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }))
    return (
        <div className="xp-filter-panel" role="dialog" aria-label="Filters">
            <div className="xp-filter-grid">
                <label>From<input type="date" className="xp-input" value={draft.from} onChange={set('from')} /></label>
                <label>To<input type="date" className="xp-input" value={draft.to} onChange={set('to')} /></label>
                {employees.length > 1 && <label>Employee<select className="xp-input" value={draft.employee} onChange={set('employee')}><option value="">All employees</option>{employees.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
                {departments.length > 1 && <label>Department<select className="xp-input" value={draft.department} onChange={set('department')}><option value="">All departments</option>{departments.map((d) => <option key={d}>{d}</option>)}</select></label>}
                <label>Category<select className="xp-input" value={draft.category} onChange={set('category')}><option value="">All categories</option>{CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.value}</option>)}</select></label>
                {show.status && <label>Status<select className="xp-input" value={draft.status} onChange={set('status')}><option value="">Any status</option>{show.status.map((s) => <option key={s}>{s}</option>)}</select></label>}
                {show.reimbursement && <label>Reimbursement<select className="xp-input" value={draft.reimbursement} onChange={set('reimbursement')}><option value="">Any</option>{['Approved', 'Processing', 'Reimbursed'].map((s) => <option key={s}>{s}</option>)}</select></label>}
                <label>Payment method<select className="xp-input" value={draft.payment} onChange={set('payment')}><option value="">Any method</option>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</select></label>
                <label>Amount from<input type="number" min="0" className="xp-input" value={draft.min} onChange={set('min')} placeholder="0" /></label>
                <label>Amount to<input type="number" min="0" className="xp-input" value={draft.max} onChange={set('max')} placeholder="Any" /></label>
            </div>
            <div className="xp-filter-foot">
                <button type="button" className="xp-btn ghost" onClick={() => { onApply({ ...EMPTY_FILTERS, q: filters.q }); onClose() }}>Clear all</button>
                <button type="button" className="xp-btn primary" onClick={() => { onApply(draft); onClose() }}>Apply filters</button>
            </div>
        </div>
    )
}

export const ExpenseToolbar = ({ filters, setFilters, sort, setSort, sorts = SORTS, employees, departments, show, right }) => {
    const [open, setOpen] = useState(false)
    const wrap = useRef(null)
    useEffect(() => {
        if (!open) return undefined
        const off = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false) }
        const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
        document.addEventListener('mousedown', off); document.addEventListener('keydown', esc)
        return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc) }
    }, [open])
    const applied = Object.keys(FILTER_LABELS).filter((k) => filters[k] !== '' && filters[k] !== undefined)
    const chipValue = (k) => k === 'employee' ? (employees.find((p) => p.id === filters.employee)?.name || 'Employee') : (k === 'min' || k === 'max') ? fmtMoney(filters[k]) : (k === 'from' || k === 'to') ? fmtDate(filters[k]) : filters[k]
    return (
        <div className="xp-toolbar-wrap">
            <div className="xp-toolbar">
                <label className="xp-search"><i className="mdi mdi-magnify"></i><input type="search" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="Search expenses, people, references…" aria-label="Search expenses" /></label>
                <div className="xp-filter-anchor" ref={wrap}>
                    <button type="button" className={`xp-btn ${applied.length ? 'active' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
                        <i className="mdi mdi-filter-variant"></i>Filters{applied.length > 0 && <span className="xp-count">{applied.length}</span>}
                    </button>
                    {open && <ExpenseFilters filters={filters} onApply={setFilters} employees={employees} departments={departments} show={show} onClose={() => setOpen(false)} />}
                </div>
                <select className="xp-input xp-sort" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">{Object.entries(sorts).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
                {right}
            </div>
            {applied.length > 0 && (
                <div className="xp-chips">
                    {applied.map((k) => <button key={k} type="button" className="xp-chip" onClick={() => setFilters({ ...filters, [k]: '' })} aria-label={`Remove ${FILTER_LABELS[k]} filter`}>{FILTER_LABELS[k]}: <b>{chipValue(k)}</b><i className="mdi mdi-close"></i></button>)}
                    <button type="button" className="xp-link" onClick={() => setFilters({ ...EMPTY_FILTERS, q: filters.q })}>Clear all</button>
                </div>
            )}
        </div>
    )
}

/* ---------------- row action menu (fixed, so table scrolling never clips it) ---------------- */
export const RowMenu = ({ items }) => {
    const [pos, setPos] = useState(null)
    const btn = useRef(null)
    const menu = useRef(null)
    useLayoutEffect(() => {
        if (!pos || !menu.current) return
        const r = menu.current.getBoundingClientRect()
        if (r.bottom > window.innerHeight - 8) setPos((p) => ({ ...p, top: Math.max(8, p.top - r.height - 40) }))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pos?.open])
    useEffect(() => {
        if (!pos) return undefined
        const close = (e) => { if (!menu.current?.contains(e.target) && !btn.current?.contains(e.target)) setPos(null) }
        const esc = (e) => { if (e.key === 'Escape') setPos(null) }
        // a scroll (the page, or the table nudging sideways to show the button) moves the menu with its
        // button; it only closes once the button has scrolled out of view
        const follow = () => {
            const r = btn.current?.getBoundingClientRect()
            if (!r || r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) { setPos(null); return }
            setPos((p) => (p ? { ...p, top: r.bottom + 4, left: Math.min(window.innerWidth - 216, r.right - 208) } : p))
        }
        const away = () => setPos(null)
        document.addEventListener('mousedown', close); document.addEventListener('keydown', esc); window.addEventListener('scroll', follow, true); window.addEventListener('resize', away)
        return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); window.removeEventListener('scroll', follow, true); window.removeEventListener('resize', away) }
    }, [!!pos]) // eslint-disable-line react-hooks/exhaustive-deps
    const shown = items.filter(Boolean)
    if (!shown.length) return null
    return (
        <>
            <button ref={btn} type="button" className="xp-icon-btn" aria-label="More actions" aria-haspopup="menu" aria-expanded={!!pos}
                onClick={(e) => { e.stopPropagation(); const r = btn.current.getBoundingClientRect(); setPos(pos ? null : { top: r.bottom + 4, left: Math.min(window.innerWidth - 216, r.right - 208), open: Date.now() }) }}>
                <i className="mdi mdi-dots-vertical"></i>
            </button>
            {pos && createPortal(
                <div ref={menu} className="pp xp-menu" role="menu" style={{ top: pos.top, left: Math.max(8, pos.left) }} onClick={(e) => e.stopPropagation()}>
                    {shown.map((it) => (
                        <button key={it.label} type="button" role="menuitem" className={it.tone || ''} onClick={() => { setPos(null); it.onClick() }}>
                            <i className={`mdi ${it.icon}`}></i>{it.label}
                        </button>
                    ))}
                </div>, document.body)}
        </>
    )
}

/* ---------------- table ---------------- */
// Column definitions by key; each view picks the ones it needs.
const PersonCell = ({ e }) => (
    <span className="xp-person"><Avatar person={e.employeeId} size={28} /><span><b>{personName(e.employeeId)}</b><small>{e.employeeId?.department || e.employeeId?.employeeId || ''}</small></span></span>
)
export const COLUMNS = {
    expense: { label: 'Expense', cell: (e) => (
        <span className="xp-exp"><b title={expenseTitle(e)}>{expenseTitle(e)}</b><small>{expenseRef(e)}{e.receiptUrl ? <i className="mdi mdi-paperclip" title="Receipt attached"></i> : null}{e.currency && e.currency !== 'INR' ? <em>{e.currency}</em> : null}</small></span>
    ) },
    employee: { label: 'Employee', cell: (e) => <PersonCell e={e} /> },
    category: { label: 'Category', cell: (e) => <CategoryChip category={e.category} /> },
    amount: { label: 'Amount', num: true, cell: (e) => <b className="xp-amt">{fmtMoney(e.amount, e.currency || 'INR', Number(e.amount) % 1 ? 2 : 0)}</b> },
    expenseDate: { label: 'Expense date', cell: (e) => fmtDate(e.expenseDate) },
    payment: { label: 'Payment', cell: (e) => e.paymentMethod || <span className="xp-muted">—</span> },
    status: { label: 'Status', cell: (e) => <StatusBadge status={e.status} /> },
    submitted: { label: 'Submitted', cell: (e) => (submittedOn(e) ? fmtDate(submittedOn(e)) : <span className="xp-muted">Not yet</span>) },
    daysPending: { label: 'Days pending', num: true, cell: (e) => { const d = daysSince(submittedOn(e) || e.createdAt); return <span className={`xp-days ${d >= 7 ? 'late' : d >= 3 ? 'soon' : ''}`}>{d}d</span> } },
    priority: { label: 'Priority', cell: (e) => { const d = daysSince(submittedOn(e) || e.createdAt); const p = d >= 7 || Number(e.amount) >= 25000 ? 'High' : d >= 3 || Number(e.amount) >= 10000 ? 'Medium' : 'Normal'; return <span className={`xp-prio ${p.toLowerCase()}`}>{p}</span> } },
    approvedBy: { label: 'Approved by', cell: (e) => (e.approvedBy ? personName(e.approvedBy) : <span className="xp-muted">—</span>) },
    approvedOn: { label: 'Approval date', cell: (e) => fmtDate(approvedOn(e)) },
    reimbStatus: { label: 'Reimbursement', cell: (e) => <StatusBadge status={e.status} /> },
    rejectedBy: { label: 'Rejected by', cell: (e) => (rejectedBy(e) ? personName(rejectedBy(e)) : <span className="xp-muted">—</span>) },
    rejectedOn: { label: 'Rejected', cell: (e) => fmtDate(rejectedOn(e)) },
    reason: { label: 'Reason', cell: (e) => <span className="xp-reason" title={e.rejectionReason || ''}>{e.rejectionReason || <span className="xp-muted">No reason given</span>}</span> },
    reimbursedOn: { label: 'Reimbursed', cell: (e) => fmtDate(reimbursedOn(e)) },
}

const colClass = (k, optional, optional2) => `${COLUMNS[k].num ? 'num' : ''} ${optional.includes(k) ? 'opt' : ''} ${optional2.includes(k) ? 'opt2' : ''}`
export const ExpenseRow = ({ e, cols, optional = [], optional2 = [], selected, onSelect, selectable, onOpen, actions }) => (
    <tr className={selected ? 'sel' : ''} onClick={() => onOpen(e)} tabIndex={0} onKeyDown={(ev) => { if (ev.key === 'Enter') onOpen(e) }}>
        {selectable && <td className="xp-check" onClick={(ev) => ev.stopPropagation()}><input type="checkbox" checked={selected} onChange={() => onSelect(e._id)} aria-label={`Select ${expenseTitle(e)}`} /></td>}
        {cols.map((k) => <td key={k} className={colClass(k, optional, optional2)}>{COLUMNS[k].cell(e)}</td>)}
        <td className="xp-actions" onClick={(ev) => ev.stopPropagation()}>{actions(e)}</td>
    </tr>
)

// `optional` columns step aside on narrower desktops so the table never needs a sideways scroll there
export const ExpenseTable = ({ rows, cols, optional = [], optional2 = [], selected, setSelected, selectable, onOpen, actions, loading }) => {
    const all = rows.length > 0 && rows.every((e) => selected.has(e._id))
    const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
    return (
        <div className="xp-table-wrap">
            <table className="xp-table">
                <thead>
                    <tr>
                        {selectable && <th className="xp-check"><input type="checkbox" checked={all} onChange={() => setSelected(all ? new Set() : new Set(rows.map((e) => e._id)))} aria-label="Select all on this page" /></th>}
                        {cols.map((k) => <th key={k} className={colClass(k, optional, optional2)}>{COLUMNS[k].label}</th>)}
                        <th className="xp-actions"><span className="sr-only">Actions</span></th>
                    </tr>
                </thead>
                <tbody>
                    {loading && !rows.length ? [0, 1, 2, 3, 4].map((i) => <tr key={i} className="skel"><td colSpan={cols.length + 2}><span className="xp-skel"></span></td></tr>)
                        : rows.map((e) => <ExpenseRow key={e._id} e={e} cols={cols} optional={optional} optional2={optional2} selected={selected.has(e._id)} onSelect={toggle} selectable={selectable} onOpen={onOpen} actions={actions} />)}
                </tbody>
            </table>
        </div>
    )
}

/* ---------------- mobile card ---------------- */
export const ExpenseCard = ({ e, onOpen, actions, selected, onSelect, selectable, extra }) => {
    const m = categoryMeta(e.category)
    return (
        <article className={`xp-card ${selected ? 'sel' : ''}`} onClick={() => onOpen(e)}>
            <div className="xp-card-top">
                {selectable && <input type="checkbox" checked={selected} onClick={(ev) => ev.stopPropagation()} onChange={() => onSelect(e._id)} aria-label={`Select ${expenseTitle(e)}`} />}
                <span className="xp-card-ic" style={{ '--c': m.color }}><i className={`mdi ${m.icon}`}></i></span>
                <div className="xp-card-main">
                    <b>{expenseTitle(e)}</b>
                    <small>{personName(e.employeeId)} · {fmtDate(e.expenseDate)}</small>
                </div>
                <b className="xp-amt">{fmtMoney(e.amount, e.currency || 'INR', Number(e.amount) % 1 ? 2 : 0)}</b>
            </div>
            <div className="xp-card-foot">
                <StatusBadge status={e.status} />
                <CategoryChip category={e.category} />
                {extra && extra(e)}
                <span className="xp-card-act" onClick={(ev) => ev.stopPropagation()}>{actions(e)}</span>
            </div>
        </article>
    )
}

/* ---------------- pagination ---------------- */
export const ExpensePagination = ({ page, pages, total, perPage, onPage }) => {
    if (total <= perPage) return total ? <div className="xp-pager"><span>{total} expense{total === 1 ? '' : 's'}</span></div> : null
    const from = (page - 1) * perPage + 1
    const to = Math.min(total, page * perPage)
    return (
        <div className="xp-pager">
            <span>{from}–{to} of {total}</span>
            <div>
                <button type="button" className="xp-icon-btn" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><i className="mdi mdi-chevron-left"></i></button>
                <b>{page} / {pages}</b>
                <button type="button" className="xp-icon-btn" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><i className="mdi mdi-chevron-right"></i></button>
            </div>
        </div>
    )
}

/* ---------------- empty / no results ---------------- */
export const EmptyExpenseState = ({ icon = 'mdi-receipt', title, text, action }) => (
    <div className="xp-empty">
        <span><i className={`mdi ${icon}`}></i></span>
        <b>{title}</b>
        {text && <p>{text}</p>}
        {action}
    </div>
)

export { ownerId, fmtShort }
