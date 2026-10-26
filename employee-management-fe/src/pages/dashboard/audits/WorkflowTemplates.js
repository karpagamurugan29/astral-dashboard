import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PeopleShell, ErrorBanner, fmtDate } from '../../../components/people/PeopleUI'
import { chatApi as api } from '../../../components/chat/chatApi'
import { toast } from '../../../components/common/Toaster'
import { TaskRowsEditor, toRow, fromRow, DEFAULT_STAGES } from '../../../components/audits/WorkflowEditor'
import { AUDIT_TYPES } from '../../../components/audits/AuditUI'
import './AuditOps.css'
import { confirmAction } from '../../../components/common/ConfirmDialog'
import { FormModal } from '../../../components/common/FormModal'

/* Workflow template library. Audit leadership create, version, duplicate, activate and deactivate
   templates; managers browse them. An active version is read-only — changes go into a new version,
   so running engagements never change silently. */

const ST_C = { Active: '#059669', Draft: '#4f46e5', Inactive: '#94a3b8' }
// What each status means, in words people use.
const STATUS = {
    Active: { c: '#059669', icon: 'mdi-check-circle', label: 'In use', say: 'New audits get these steps' },
    Draft: { c: '#4f46e5', icon: 'mdi-pencil-circle', label: 'Draft', say: 'Not used yet — open it, finish the steps and switch it on' },
    Inactive: { c: '#94a3b8', icon: 'mdi-pause-circle', label: 'Switched off', say: 'Not used for new audits' },
}
const STAGE_C = { Planning: '#7c3aed', Fieldwork: '#0284c7', Review: '#d97706', Reporting: '#059669', Billing: '#db2777' }
const appliesTo = (t) => [t.auditType ? `${t.auditType} audits` : 'Any audit type', t.scope?.clientId && `only ${t.scope.clientId.name}`, t.scope?.projectId && `project ${t.scope.projectId.name}`].filter(Boolean).join(' · ')

export const WorkflowTemplates = () => {
    const nav = useNavigate()
    const [d, setD] = useState(null)
    const [canEdit, setCanEdit] = useState(false)
    const [error, setError] = useState('')
    const [copyOf, setCopyOf] = useState(null)
    const [copyName, setCopyName] = useState('')
    const [hist, setHist] = useState({})
    const load = useCallback(() => api('GET', '/workflow-templates').then((j) => { setD(j.data); setCanEdit(j.canEdit); setError('') }).catch((e) => setError(e.message)), [])
    useEffect(() => { load() }, [load])
    const run = async (fn, go) => { try { const j = await fn(); toast.success(j.message); if (go && j.data?._id) nav(`/audits/workflows/${j.data._id}`); else load() } catch (e) { toast.error(e.message) } }
    const create = () => run(() => api('POST', '/workflow-templates', { name: 'New audit checklist', tasks: [{ label: 'Engagement letter signed', stage: 'Planning' }] }), true)
    const inUse = (d || []).filter((f) => f.active).length
    return (
        <PeopleShell title="Audit checklists" root={{ label: 'Audits', to: '/audits' }} crumbs={[{ label: 'Audit checklists' }]} backTo="/audits"
            actions={canEdit && <button type="button" className="pp-btn primary" onClick={create}><i className="mdi mdi-plus"></i>New checklist</button>}>
            <div className="ao cl">
                <ErrorBanner error={error} />
                <div className="cl-how">
                    <div><span>1</span><b>Write the steps</b><small>The tasks an audit goes through, grouped by stage, with the hours each should take.</small></div>
                    <i className="mdi mdi-arrow-right"></i>
                    <div><span>2</span><b>Switch it on</b><small>Only checklists marked <em>In use</em> are picked for new audits.</small></div>
                    <i className="mdi mdi-arrow-right"></i>
                    <div><span>3</span><b>New audits copy it</b><small>Creating an engagement turns the steps into the team's tasks. Running audits never change.</small></div>
                </div>
                {d && <p className="cl-sum">{d.length} checklist{d.length === 1 ? '' : 's'} · {inUse} in use. When several fit an audit, the most specific wins: <b>project</b> → <b>company</b> → <b>audit type</b> → <b>firm standard</b>.</p>}
                {!d ? <div className="pp-skel" style={{ height: 200 }}></div> : !d.length ? (
                    <div className="ao-card ao-empty"><i className="mdi mdi-format-list-checks"></i>No checklists yet. {canEdit && <button type="button" className="atk-link" onClick={create}>Create the first one</button>}</div>
                ) : (
                    <div className="cl-list">{d.map((fam) => {
                        const t = fam.active || fam.latest
                        const st = STATUS[fam.active ? 'Active' : t.status] || STATUS.Inactive
                        const used = fam.versions.reduce((n, v) => n + v.engagements, 0)
                        const isDraft = !fam.active && t.status === 'Draft'
                        return (
                            <article key={fam.family} className="cl-card" style={{ '--c': st.c }}>
                                <div className="cl-top">
                                    <span className="cl-ic"><i className="mdi mdi-format-list-checks"></i></span>
                                    <div className="cl-title">
                                        <h4>{t.name}</h4>
                                        <p><span className="cl-status"><i className={`mdi ${st.icon}`}></i>{st.label}</span><span>{st.say}</span></p>
                                    </div>
                                    <div className="cl-acts">
                                        <button type="button" className="pp-btn sm primary" onClick={() => nav(`/audits/workflows/${t._id}`)}><i className={`mdi ${canEdit && isDraft ? 'mdi-pencil-outline' : 'mdi-eye-outline'}`}></i>{canEdit && isDraft ? 'Edit steps' : 'View steps'}</button>
                                        {canEdit && fam.active && <button type="button" className="pp-btn sm" title="Make a new draft version to change the steps; the current one stays in use until you switch the new one on" onClick={() => run(() => api('POST', `/workflow-templates/${t._id}/version`), true)}><i className="mdi mdi-pencil-outline"></i>Change steps</button>}
                                        {canEdit && <button type="button" className="pp-btn sm" title="Start a separate checklist from this one" onClick={() => { setCopyOf(t); setCopyName(`${t.name} (copy)`) }}><i className="mdi mdi-content-copy"></i>Make a copy</button>}
                                        {canEdit && fam.active && <button type="button" className="pp-btn sm ghost" title="Stop using it for new audits" onClick={async () => (await confirmAction({ title: `Switch off “${t.name}”?`, message: 'New audits stop using these steps. Audits already running keep their copy.', confirmLabel: 'Switch off', tone: 'warn' })) && run(() => api('POST', `/workflow-templates/${fam.active._id}/deactivate`))}><i className="mdi mdi-pause-circle-outline"></i>Switch off</button>}
                                    </div>
                                </div>
                                <div className="cl-facts">
                                    <span><i className="mdi mdi-target"></i>Used for: <b>{appliesTo(t)}</b></span>
                                    <span><i className="mdi mdi-format-list-numbered"></i><b>{t.taskCount}</b> step{t.taskCount === 1 ? '' : 's'}</span>
                                    <span><i className="mdi mdi-timer-outline"></i><b>{t.hours}h</b> planned</span>
                                    <span><i className="mdi mdi-briefcase-outline"></i>{used ? <><b>{used}</b> audit{used === 1 ? '' : 's'} used it</> : 'Not used by any audit yet'}</span>
                                </div>
                                {t.description && <p className="cl-desc">{t.description}</p>}
                                {t.stageSummary?.length > 0 && (
                                    <div className="cl-flow" aria-label="Stages">
                                        {t.stageSummary.map((x, i) => (
                                            <React.Fragment key={x.stage}>
                                                {i > 0 && <i className="mdi mdi-chevron-right cl-arrow"></i>}
                                                <span className="cl-stage" style={{ '--s': STAGE_C[x.stage] || '#64748b' }}><b>{x.stage}</b><small>{x.tasks} step{x.tasks === 1 ? '' : 's'}{x.hours ? ` · ${x.hours}h` : ''}</small></span>
                                            </React.Fragment>
                                        ))}
                                    </div>
                                )}
                                {fam.versions.length > 1 && (
                                    <div className="cl-hist">
                                        <button type="button" className="atk-link" onClick={() => setHist((h) => ({ ...h, [fam.family]: !h[fam.family] }))}><i className={`mdi ${hist[fam.family] ? 'mdi-chevron-up' : 'mdi-history'}`}></i>{hist[fam.family] ? 'Hide' : 'Show'} earlier versions ({fam.versions.length})</button>
                                        {hist[fam.family] && <div className="ao-versions">{fam.versions.map((v) => <button key={v._id} type="button" className={v.status} onClick={() => nav(`/audits/workflows/${v._id}`)} title={v.changeNote || ''}>Version {v.version} · {(STATUS[v.status] || STATUS.Inactive).label}{v.engagements ? ` · ${v.engagements} audit${v.engagements === 1 ? '' : 's'}` : ''}</button>)}</div>}
                                    </div>
                                )}
                            </article>
                        )
                    })}</div>
                )}
            </div>
            {copyOf && (
                <FormModal title="Make a copy" sub={`A new, separate checklist starting from “${copyOf.name}”. It starts as a draft.`} icon="mdi-content-copy" submitLabel="Create copy" disabled={!copyName.trim()}
                    onClose={() => setCopyOf(null)} onSubmit={(e) => { e.preventDefault(); if (!copyName.trim()) return; const src = copyOf; setCopyOf(null); run(() => api('POST', `/workflow-templates/${src._id}/duplicate`, { name: copyName.trim() }), true) }}>
                    <div className="pp-field"><label className="pp-label">Name of the new checklist</label><input className="pp-input" value={copyName} onChange={(e) => setCopyName(e.target.value)} autoFocus /></div>
                </FormModal>
            )}
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
    if (!t) return <PeopleShell title="Audit checklist" root={{ label: 'Audit checklists', to: '/audits/workflows' }} crumbs={[{ label: 'Checklist' }]} backTo="/audits/workflows"><ErrorBanner error={error} />{!error && <div className="pp-skel" style={{ height: 300 }}></div>}</PeopleShell>
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
        <PeopleShell title={`${t.name} · v${t.version}`} root={{ label: 'Audit checklists', to: '/audits/workflows' }} crumbs={[{ label: `${t.name} v${t.version}` }]} backTo="/audits/workflows"
            actions={<>
                <span className="ao-chip" style={{ '--c': ST_C[t.status], height: 30 }}>{(STATUS[t.status] || STATUS.Inactive).label}</span>
                {draft && <button type="button" className="pp-btn" onClick={() => save(false)} disabled={busy}><i className="mdi mdi-content-save-outline"></i>Save draft</button>}
                {draft && <button type="button" className="pp-btn primary" onClick={() => save(true)} disabled={busy}><i className="mdi mdi-check-decagram"></i>Save &amp; switch on</button>}
                {!draft && canEdit && <button type="button" className="pp-btn primary" onClick={newVersion}><i className="mdi mdi-pencil-outline"></i>Change steps</button>}
                {!draft && canEdit && t.status === 'Inactive' && <button type="button" className="pp-btn" onClick={async () => { try { const j = await api('POST', `/workflow-templates/${id}/activate`); toast.success(j.message); load() } catch (e) { toast.error(e.message) } }}><i className="mdi mdi-play-circle-outline"></i>Switch this version on</button>}
            </>}>
            <div className="ao">
                {!draft && <p className="ao-help" style={{ marginTop: 0, marginBottom: 12 }}>{t.status === 'Active' ? 'This checklist is in use, so it is locked. Press “Change steps” to make an editable draft — this one stays in use until you switch the new one on.' : t.status === 'Inactive' ? 'This checklist is switched off — new audits do not use it.' : `This version is ${t.status.toLowerCase()}.`}{t.changeNote ? ` Change note: “${t.changeNote}”.` : ''}{t.activatedAt ? ` Activated ${fmtDate(t.activatedAt)}.` : ''}</p>}
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
