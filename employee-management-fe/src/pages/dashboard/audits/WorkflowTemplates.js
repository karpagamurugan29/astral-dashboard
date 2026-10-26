import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PeopleShell, ErrorBanner, fmtDate } from '../../../components/people/PeopleUI'
import { chatApi as api } from '../../../components/chat/chatApi'
import { toast } from '../../../components/common/Toaster'
import { TaskRowsEditor, toRow, fromRow, DEFAULT_STAGES } from '../../../components/audits/WorkflowEditor'
import { AUDIT_TYPES } from '../../../components/audits/AuditUI'
import './AuditOps.css'
import { confirmAction } from '../../../components/common/ConfirmDialog'

/* Workflow template library. Audit leadership create, version, duplicate, activate and deactivate
   templates; managers browse them. An active version is read-only — changes go into a new version,
   so running engagements never change silently. */

const ST_C = { Active: '#059669', Draft: '#4f46e5', Inactive: '#94a3b8' }

export const WorkflowTemplates = () => {
    const nav = useNavigate()
    const [d, setD] = useState(null)
    const [canEdit, setCanEdit] = useState(false)
    const [error, setError] = useState('')
    const load = useCallback(() => api('GET', '/workflow-templates').then((j) => { setD(j.data); setCanEdit(j.canEdit); setError('') }).catch((e) => setError(e.message)), [])
    useEffect(() => { load() }, [load])
    const run = async (fn, go) => { try { const j = await fn(); toast.success(j.message); if (go && j.data?._id) nav(`/audits/workflows/${j.data._id}`); else load() } catch (e) { toast.error(e.message) } }
    const create = () => run(() => api('POST', '/workflow-templates', { name: 'New audit workflow', tasks: [{ label: 'Engagement letter signed', stage: 'Planning' }] }), true)
    return (
        <PeopleShell title="Workflow templates" root={{ label: 'Audits', to: '/audits' }} crumbs={[{ label: 'Workflow templates' }]} backTo="/audits"
            actions={canEdit && <button type="button" className="pp-btn primary" onClick={create}><i className="mdi mdi-plus"></i>New template</button>}>
            <div className="ao">
                <ErrorBanner error={error} />
                <p className="ao-help" style={{ marginTop: 0, marginBottom: 12 }}>New engagements use the most specific <b>active</b> template: one for the project, then the company, then the audit type, then the firm standard. Editing a template never changes running engagements — their manager can preview and apply a newer version from the engagement's Workflow tab.</p>
                {!d ? <div className="pp-skel" style={{ height: 200 }}></div> : (
                    <div className="ao-grid">{d.map((fam) => {
                        const t = fam.active || fam.latest
                        return (
                            <div key={fam.family} className="ao-tpl">
                                <div>
                                    <h4>{t.name} {fam.active ? <span className="ao-chip" style={{ '--c': ST_C.Active }}>Active v{fam.active.version}</span> : <span className="ao-chip" style={{ '--c': ST_C.Inactive }}>Not active</span>}</h4>
                                    <div className="meta"><span>{t.auditType ? `${t.auditType} audits` : 'Any audit type'}</span>{t.scope?.clientId && <span>Company: {t.scope.clientId.name}</span>}{t.scope?.projectId && <span>Project: {t.scope.projectId.name}</span>}<span>{t.taskCount} tasks · {t.hours}h</span><span>{fam.versions.reduce((n, v) => n + v.engagements, 0)} engagements</span>{t.description && <span>{t.description}</span>}</div>
                                </div>
                                <div className="acts">
                                    <button type="button" className="pp-btn sm" onClick={() => nav(`/audits/workflows/${t._id}`)}><i className="mdi mdi-eye-outline"></i>{canEdit ? 'Open' : 'View'}</button>
                                    {canEdit && <button type="button" className="pp-btn sm" onClick={() => run(() => api('POST', `/workflow-templates/${t._id}/version`), true)}><i className="mdi mdi-source-branch"></i>New version</button>}
                                    {canEdit && <button type="button" className="pp-btn sm" onClick={() => { const name = window.prompt('Name for the copy:', `${t.name} (copy)`); if (name) run(() => api('POST', `/workflow-templates/${t._id}/duplicate`, { name }), true) }}><i className="mdi mdi-content-copy"></i>Duplicate</button>}
                                    {canEdit && fam.active && <button type="button" className="pp-btn sm" onClick={async () => (await confirmAction({ title: `Deactivate “${t.name}”?`, message: 'New engagements stop using it; running ones keep their copy.', confirmLabel: 'Deactivate', tone: 'warn' })) && run(() => api('POST', `/workflow-templates/${fam.active._id}/deactivate`))}>Deactivate</button>}
                                </div>
                                <div className="ao-versions">{fam.versions.map((v) => <button key={v._id} type="button" className={v.status} onClick={() => nav(`/audits/workflows/${v._id}`)} title={v.changeNote || ''}>v{v.version} · {v.status}{v.engagements ? ` · ${v.engagements} eng.` : ''}</button>)}</div>
                            </div>
                        )
                    })}</div>
                )}
            </div>
        </PeopleShell>
    )
}

export const WorkflowTemplateEditor = () => {
    const { id } = useParams()
    const nav = useNavigate()
    const [t, setT] = useState(null)
    const [canEdit, setCanEdit] = useState(false)
    const [rows, setRows] = useState([])
    const [stages, setStages] = useState(DEFAULT_STAGES)
    const [head, setHead] = useState({})
    const [clients, setClients] = useState([])
    const [projects, setProjects] = useState([])
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const load = useCallback(() => api('GET', `/workflow-templates/${id}`).then((j) => {
        setT(j.data); setCanEdit(j.canEdit); setRows(j.data.tasks.map(toRow)); setStages(j.data.stages?.length ? j.data.stages : DEFAULT_STAGES)
        setHead({ name: j.data.name, description: j.data.description || '', auditType: j.data.auditType || '', clientId: j.data.scope?.clientId?._id || '', projectId: j.data.scope?.projectId?._id || '', changeNote: j.data.changeNote || '', ...j.data.escalation })
    }).catch((e) => setError(e.message)), [id])
    useEffect(() => { load(); api('GET', '/audit-clients').then((j) => setClients(j.data || [])).catch(() => {}); api('GET', '/audit-projects').then((j) => setProjects(j.data || [])).catch(() => {}) }, [load])
    if (!t) return <PeopleShell title="Workflow template" root={{ label: 'Workflow templates', to: '/audits/workflows' }} crumbs={[{ label: 'Template' }]} backTo="/audits/workflows"><ErrorBanner error={error} />{!error && <div className="pp-skel" style={{ height: 300 }}></div>}</PeopleShell>
    const draft = t.status === 'Draft' && canEdit
    const set = (k) => (e) => setHead((x) => ({ ...x, [k]: e.target.value }))
    const save = async (andActivate) => {
        if (rows.some((x) => !x.label.trim())) { toast.error('Every task needs a name.'); return }
        setBusy(true)
        try {
            const j = await api('PUT', `/workflow-templates/${id}`, { name: head.name, description: head.description, auditType: head.auditType, scope: { clientId: head.clientId || null, projectId: head.projectId || null }, stages, tasks: rows.map((x) => fromRow(x, 'template')), escalation: { remindBeforeDays: head.remindBeforeDays, escalateAfterDays: head.escalateAfterDays, escalateTo: head.escalateTo }, changeNote: head.changeNote })
            if (andActivate) { const a = await api('POST', `/workflow-templates/${id}/activate`, { changeNote: head.changeNote }); toast.success(a.message) } else toast.success(j.message)
            load()
        } catch (e) { toast.error(e.message) } finally { setBusy(false) }
    }
    const newVersion = async () => { try { const j = await api('POST', `/workflow-templates/${id}/version`); toast.success(j.message); nav(`/audits/workflows/${j.data._id}`) } catch (e) { toast.error(e.message) } }
    const hours = rows.reduce((s, x) => s + (Number(x.estimatedHours) || 0), 0)
    return (
        <PeopleShell title={`${t.name} · v${t.version}`} root={{ label: 'Workflow templates', to: '/audits/workflows' }} crumbs={[{ label: `${t.name} v${t.version}` }]} backTo="/audits/workflows"
            actions={<>
                <span className="ao-chip" style={{ '--c': ST_C[t.status], height: 30 }}>{t.status}</span>
                {draft && <button type="button" className="pp-btn" onClick={() => save(false)} disabled={busy}><i className="mdi mdi-content-save-outline"></i>Save draft</button>}
                {draft && <button type="button" className="pp-btn primary" onClick={() => save(true)} disabled={busy}><i className="mdi mdi-check-decagram"></i>Save &amp; activate</button>}
                {!draft && canEdit && <button type="button" className="pp-btn primary" onClick={newVersion}><i className="mdi mdi-source-branch"></i>New version to edit</button>}
                {!draft && canEdit && t.status === 'Inactive' && <button type="button" className="pp-btn" onClick={async () => { try { const j = await api('POST', `/workflow-templates/${id}/activate`); toast.success(j.message); load() } catch (e) { toast.error(e.message) } }}>Activate this version</button>}
            </>}>
            <div className="ao">
                {!draft && <p className="ao-help" style={{ marginTop: 0, marginBottom: 12 }}>{t.status === 'Active' ? 'This version is active, so it is read-only — create a new version to change it.' : `This version is ${t.status.toLowerCase()}.`}{t.changeNote ? ` Change note: “${t.changeNote}”.` : ''}{t.activatedAt ? ` Activated ${fmtDate(t.activatedAt)}.` : ''}</p>}
                <fieldset disabled={!draft} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
                    <section className="ao-card" style={{ marginBottom: 12 }}>
                        <div className="ao-head-form">
                            <label>Name<input className="pp-input" value={head.name} onChange={set('name')} /></label>
                            <label>Audit type<select className="pp-select" value={head.auditType} onChange={set('auditType')}><option value="">Any type</option>{AUDIT_TYPES.map((x) => <option key={x}>{x}</option>)}</select></label>
                            <label>Only for company<select className="pp-select" value={head.clientId} onChange={set('clientId')}><option value="">All companies</option>{clients.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</select></label>
                            <label>Only for project<select className="pp-select" value={head.projectId} onChange={set('projectId')}><option value="">All projects</option>{projects.filter((p) => !head.clientId || (p.clientId?._id || p.clientId) === head.clientId).map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}</select></label>
                            <label>Remind before due (days)<input type="number" min="0" className="pp-input" value={head.remindBeforeDays ?? 1} onChange={set('remindBeforeDays')} /></label>
                            <label>Escalate when overdue (days)<input type="number" min="0" className="pp-input" value={head.escalateAfterDays ?? 2} onChange={set('escalateAfterDays')} /></label>
                            <label>Escalate to<select className="pp-select" value={head.escalateTo || 'manager'} onChange={set('escalateTo')}><option value="manager">Engagement manager</option><option value="partner">Project partner</option></select></label>
                            <label className="wide">Description<input className="pp-input" value={head.description} onChange={set('description')} placeholder="When to use this workflow" /></label>
                            <label className="wide">Stages (in order)
                                <div className="ao-stages">{stages.map((s, i) => <span key={s}>{s}{draft && <><button type="button" disabled={i === 0} onClick={() => setStages((x) => { const n = [...x]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n })} aria-label="Move left"><i className="mdi mdi-chevron-left"></i></button>{!rows.some((r) => r.stage === s) && stages.length > 1 && <button type="button" onClick={() => setStages((x) => x.filter((y) => y !== s))} aria-label={`Remove ${s}`}><i className="mdi mdi-close"></i></button>}</>}</span>)}
                                    {draft && <button type="button" className="pp-btn sm" onClick={() => { const n = window.prompt('New stage name:'); if (n && !stages.includes(n.trim())) setStages((x) => [...x.slice(0, -1), n.trim(), x[x.length - 1]]) }}><i className="mdi mdi-plus"></i>Stage</button>}
                                </div>
                            </label>
                            {draft && <label className="wide">Change note<input className="pp-input" value={head.changeNote} onChange={set('changeNote')} placeholder="What changed in this version" /></label>}
                        </div>
                    </section>
                    <div className="wf-summary"><span><b>{rows.length}</b> tasks</span><span><b>{hours}h</b> estimated</span><span><b>{rows.filter((x) => x.requiresReview).length}</b> reviewed</span><span><b>{rows.filter((x) => x.dependsOn.length).length}</b> with prerequisites</span></div>
                    <TaskRowsEditor rows={rows} setRows={draft ? setRows : () => {}} stages={stages} mode="template" />
                </fieldset>
            </div>
        </PeopleShell>
    )
}
