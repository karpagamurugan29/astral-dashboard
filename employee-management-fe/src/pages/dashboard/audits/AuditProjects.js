import React, { useCallback, useEffect, useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { Link, useNavigate, useParams } from 'react-router-dom'
import employeeActions from '../../../redux/employee/Actions'
import { PeopleShell, Avatar, ErrorBanner, fullName, fmtDate } from '../../../components/people/PeopleUI'
import { chatApi as api } from '../../../components/chat/chatApi'
import { money } from '../../../components/payroll/PayrollUI'
import { toast } from '../../../components/common/Toaster'
import { Modal } from '../projects/ProjectParts'
import './AuditOps.css'

/* Audit projects: Company → Project → Engagements. List + detail with roll-ups. */

const STATUS_C = { Planning: '#64748b', Active: '#2563eb', 'On Hold': '#d97706', Completed: '#059669', Cancelled: '#94a3b8' }
const d10 = (v) => (v ? String(v).slice(0, 10) : '')
const PROJECT_BLANK = { name: '', financialYear: '', budgetHours: '', budgetFee: '', status: 'Active', description: '' }

export const ProjectForm = ({ initial = {}, onClose, onSaved }) => {
    const dispatch = useDispatch()
    const { list: employees } = useSelector((s) => s.employeeReducer || {})
    const [clients, setClients] = useState([])
    const [f, setF] = useState({ ...PROJECT_BLANK, ...initial, clientId: initial.clientId?._id || initial.clientId || '', manager: initial.manager?._id || initial.manager || '', partner: initial.partner?._id || initial.partner || '', startDate: d10(initial.startDate), endDate: d10(initial.endDate) })
    const [busy, setBusy] = useState(false)
    useEffect(() => { dispatch({ type: employeeActions.GET_EMPLOYEES }); api('GET', '/audit-clients').then((j) => setClients(j.data || [])).catch(() => {}) }, [dispatch])
    const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
    const active = (employees || []).filter((e) => e.status === 'Active')
    const save = async () => {
        setBusy(true)
        try {
            const j = initial._id ? await api('PUT', `/audit-projects/${initial._id}`, f) : await api('POST', '/audit-projects', f)
            toast.success(j.message); onSaved(j.data)
        } catch (e) { toast.error(e.message) } finally { setBusy(false) }
    }
    return (
        <Modal title={initial._id ? 'Edit project' : 'New audit project'} sub="Groups a company's engagements under one budget, deadline, manager and partner." onClose={onClose}
            footer={<><button type="button" className="pp-btn" onClick={onClose}>Cancel</button><button type="button" className="pp-btn primary" onClick={save} disabled={busy}>Save</button></>}>
            <div className="ao-form">
                <label className="wide">Project name<input className="pp-input" value={f.name} onChange={set('name')} placeholder="e.g. FY 2026-27 statutory & tax" /></label>
                <label>Company<select className="pp-select" value={f.clientId} onChange={set('clientId')}><option value="">Choose…</option>{clients.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</select></label>
                <label>Financial year<input className="pp-input" value={f.financialYear} onChange={set('financialYear')} placeholder="2026-27" /></label>
                <label>Project manager<select className="pp-select" value={f.manager} onChange={set('manager')}><option value="">Choose…</option>{active.map((e) => <option key={e._id} value={e._id}>{fullName(e)} — {e.designation}</option>)}</select></label>
                <label>Partner<select className="pp-select" value={f.partner} onChange={set('partner')}><option value="">None</option>{active.filter((e) => /Partner|Director|Senior Manager/.test(e.designation || '')).map((e) => <option key={e._id} value={e._id}>{fullName(e)} — {e.designation}</option>)}</select></label>
                <label>Start<input type="date" className="pp-input" value={f.startDate} onChange={set('startDate')} /></label>
                <label>Deadline<input type="date" className="pp-input" value={f.endDate} onChange={set('endDate')} /></label>
                <label>Budget hours<input type="number" min="0" className="pp-input" value={f.budgetHours} onChange={set('budgetHours')} /></label>
                <label>Budget fee (₹)<input type="number" min="0" className="pp-input" value={f.budgetFee} onChange={set('budgetFee')} /></label>
                {initial._id && <label>Status<select className="pp-select" value={f.status} onChange={set('status')}>{Object.keys(STATUS_C).map((s) => <option key={s}>{s}</option>)}</select></label>}
                <label className="wide">Notes<textarea rows={2} className="pp-input" value={f.description} onChange={set('description')}></textarea></label>
            </div>
        </Modal>
    )
}

export const AuditProjects = () => {
    const nav = useNavigate()
    const [d, setD] = useState(null)
    const [canCreate, setCanCreate] = useState(false)
    const [error, setError] = useState('')
    const [q, setQ] = useState('')
    const [form, setForm] = useState(false)
    const load = useCallback(() => api('GET', '/audit-projects').then((j) => { setD(j.data); setCanCreate(j.canCreate); setError('') }).catch((e) => setError(e.message)), [])
    useEffect(() => { load() }, [load])
    const rows = (d || []).filter((p) => !q || `${p.name} ${p.projectCode} ${p.clientId?.name}`.toLowerCase().includes(q.toLowerCase()))
    return (
        <PeopleShell title="Audit projects" root={{ label: 'Audits', to: '/audits' }} crumbs={[{ label: 'Projects' }]} backTo="/audits"
            actions={canCreate && <button type="button" className="pp-btn primary" onClick={() => setForm(true)}><i className="mdi mdi-plus"></i>New project</button>}>
            <div className="ao">
                <ErrorBanner error={error} />
                <div className="ao-tools"><div className="pp-search grow" style={{ maxWidth: 360 }}><i className="mdi mdi-magnify"></i><input className="pp-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search project or company…" /></div></div>
                {!d ? <div className="pp-skel" style={{ height: 200 }}></div> : !rows.length ? <div className="ao-card ao-empty"><i className="mdi mdi-folder-multiple-outline"></i>{d.length ? 'No match.' : 'No projects yet — group a company\'s engagements into a project to track budget and progress together.'}</div> : (
                    <div className="ao-tablewrap"><table className="ao-table">
                        <thead><tr><th>Project</th><th>Company</th><th>Manager</th><th>Status</th><th>Tasks</th><th className="n">Hours / budget</th>{rows[0].budgetFee !== undefined && <th className="n">Budget fee</th>}<th className="n">Overdue</th><th>Deadline</th></tr></thead>
                        <tbody>{rows.map((p) => {
                            const s = p.summary || {}, hrs = Math.round((s.minutes || 0) / 6) / 10
                            return (
                                <tr key={p._id} className="click" onClick={() => nav(`/audits/projects/${p._id}`)}>
                                    <td><b>{p.name}</b><br /><small className="ao-muted">{p.projectCode}{p.financialYear ? ` · FY ${p.financialYear}` : ''} · {s.engagements || 0} engagement{s.engagements === 1 ? '' : 's'}</small></td>
                                    <td>{p.clientId?.name}</td>
                                    <td><span className="ao-person"><Avatar person={p.manager} size={22} /><div><b>{fullName(p.manager)}</b></div></span></td>
                                    <td><span className="ao-chip" style={{ '--c': STATUS_C[p.status] }}>{p.status}</span></td>
                                    <td><span className="ao-bar"><span><i style={{ width: `${s.tasks ? (s.done / s.tasks) * 100 : 0}%` }}></i></span>{s.done || 0}/{s.tasks || 0}</span></td>
                                    <td className={`n ${p.budgetHours && hrs > p.budgetHours ? 'bad' : ''}`}>{hrs}h{p.budgetHours ? ` / ${p.budgetHours}h` : ''}</td>
                                    {p.budgetFee !== undefined && <td className="n">{p.budgetFee ? money(p.budgetFee) : '—'}</td>}
                                    <td className={`n ${s.overdue ? 'bad' : ''}`}>{s.overdue || 0}</td>
                                    <td>{p.endDate ? fmtDate(p.endDate) : '—'}</td>
                                </tr>
                            )
                        })}</tbody>
                    </table></div>
                )}
            </div>
            {form && <ProjectForm onClose={() => setForm(false)} onSaved={(p) => { setForm(false); nav(`/audits/projects/${p._id}`) }} />}
        </PeopleShell>
    )
}

export const AuditProjectDetail = () => {
    const { id } = useParams()
    const nav = useNavigate()
    const [p, setP] = useState(null)
    const [error, setError] = useState('')
    const [edit, setEdit] = useState(false)
    const load = useCallback(() => api('GET', `/audit-projects/${id}`).then((j) => { setP(j.data); setError('') }).catch((e) => setError(e.message)), [id])
    useEffect(() => { load() }, [load])
    if (!p) return <PeopleShell title="Project" root={{ label: 'Projects', to: '/audits/projects' }} crumbs={[{ label: 'Project' }]} backTo="/audits/projects"><ErrorBanner error={error} />{!error && <div className="pp-skel" style={{ height: 200 }}></div>}</PeopleShell>
    const s = p.summary || {}, hrs = Math.round((s.minutes || 0) / 6) / 10
    return (
        <PeopleShell title={p.name} root={{ label: 'Projects', to: '/audits/projects' }} crumbs={[{ label: p.clientId?.name, to: `/audits/clients/${p.clientId?._id}` }, { label: p.name }]} backTo="/audits/projects"
            actions={<>{p.canEdit && <button type="button" className="pp-btn" onClick={() => setEdit(true)}><i className="mdi mdi-pencil-outline"></i>Edit</button>}<Link to="/audits/dashboard" className="pp-btn"><i className="mdi mdi-chart-box-outline"></i>Dashboard</Link></>}>
            <div className="ao">
                <div className="ao-tiles">
                    <div className="ao-tile" style={{ '--c': STATUS_C[p.status] }}><i className="mdi mdi-flag-outline"></i><b>{p.status}</b><small>{p.projectCode}</small></div>
                    <div className="ao-tile" style={{ '--c': '#0284c7' }}><i className="mdi mdi-clipboard-text-outline"></i><b>{s.active || 0}<em>/{s.engagements || 0}</em></b><small>Active engagements</small></div>
                    <div className="ao-tile" style={{ '--c': '#059669' }}><i className="mdi mdi-format-list-checks"></i><b>{s.done || 0}<em>/{s.tasks || 0}</em></b><small>Tasks done</small></div>
                    <div className="ao-tile" style={{ '--c': p.budgetHours && hrs > p.budgetHours ? '#dc2626' : '#7c3aed' }}><i className="mdi mdi-timer-outline"></i><b>{hrs}h{p.budgetHours ? <em>/{p.budgetHours}h</em> : null}</b><small>Hours vs budget</small></div>
                    <div className={`ao-tile ${s.overdue ? 'alert' : ''}`} style={{ '--c': '#ea580c' }}><i className="mdi mdi-alarm"></i><b>{s.overdue || 0}</b><small>Overdue tasks</small></div>
                    {p.budgetFee !== undefined && <div className="ao-tile" style={{ '--c': '#0f766e' }}><i className="mdi mdi-cash-multiple"></i><b>{p.budgetFee ? money(p.budgetFee) : '—'}</b><small>Budget fee</small></div>}
                </div>
                <div className="ao-grid main">
                    <section className="ao-card">
                        <header><b>Engagements</b><Link to="/audits" className="atk-link">New engagement in this project <i className="mdi mdi-arrow-right"></i></Link></header>
                        {!p.engagements.length ? <p className="ao-muted">No engagements yet. When creating an engagement, pick this project.</p> : (
                            <div className="ao-tablewrap"><table className="ao-table"><thead><tr><th>Engagement</th><th>Manager</th><th>Status</th><th>Dates</th><th className="n">Est. hours</th></tr></thead>
                                <tbody>{p.engagements.map((e) => <tr key={e._id} className="click" onClick={() => nav(`/audits/${e._id}`)}><td><b>{e.engagementName || `${e.auditType} audit`}</b><br /><small className="ao-muted">{e.auditCode}</small></td><td>{fullName(e.auditManager)}</td><td>{e.status}</td><td>{fmtDate(e.startDate)} → {fmtDate(e.endDate)}</td><td className="n">{e.estimatedHours || 0}h</td></tr>)}</tbody></table></div>
                        )}
                    </section>
                    <aside className="ao-card">
                        <header><b>Project</b></header>
                        <dl className="ao-dl">
                            {[['Company', p.clientId?.name], ['Manager', fullName(p.manager)], ['Partner', p.partner ? fullName(p.partner) : '—'], ['Financial year', p.financialYear || '—'], ['Dates', `${p.startDate ? fmtDate(p.startDate) : '—'} → ${p.endDate ? fmtDate(p.endDate) : '—'}`]].map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
                            {p.description && <div><dt>Notes</dt><dd className="pre">{p.description}</dd></div>}
                        </dl>
                    </aside>
                </div>
            </div>
            {edit && <ProjectForm initial={p} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); load() }} />}
        </PeopleShell>
    )
}
