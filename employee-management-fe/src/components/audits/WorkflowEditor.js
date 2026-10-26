import React, { useState } from 'react'
import { Modal } from '../../pages/dashboard/projects/ProjectParts'
import { chatApi as api } from '../chat/chatApi'
import { toast } from '../common/Toaster'
import { fullName } from '../people/PeopleUI'
import './WorkflowEditor.css'
import { confirmAction } from '../common/ConfirmDialog'

/* Workflow editing, shared by:
   - WorkflowEditor   one engagement's tasks (people, due dates) — engagement manager / audit leadership
   - TaskRowsEditor   also used by the template library (roles, day offsets)
   Tasks can be dragged within / between stages (or moved with the arrows), and each row expands for
   reviewer, prerequisites, review / evidence rules, instructions, deliverables and checklist. */

export const STAGE_ICONS = { Planning: 'mdi-pencil-ruler', Fieldwork: 'mdi-briefcase-search-outline', Review: 'mdi-file-eye-outline', Reporting: 'mdi-file-document-edit-outline', Billing: 'mdi-cash-multiple' }
export const DEFAULT_STAGES = ['Planning', 'Fieldwork', 'Review', 'Reporting', 'Billing']
export const DESIGNATIONS = ['Company Partner', 'Director', 'Senior Manager', 'Manager', 'Senior Consultant', 'Consultant', 'Junior Consultant', 'Associate', 'Accounts']
const LOCKED = ['invoice', 'payment']
const d10 = (v) => (v ? String(v).slice(0, 10) : '')
const idOf = (p) => p?._id || p || ''
const lines = (v) => String(v || '').split('\n').map((s) => s.trim()).filter(Boolean)

export const toRow = (m) => ({
    key: m.key || '', label: m.label || '', stage: m.stage, assignee: idOf(m.assignee), reviewer: idOf(m.reviewer),
    estimatedHours: m.estimatedHours || '', dueDate: d10(m.dueDate), offsetDays: m.offsetDays ?? '', priority: m.priority || 'Medium',
    responsibleRole: m.responsibleRole || '', reviewerRole: m.reviewerRole || '', dependsOn: m.dependsOn || [],
    requiresReview: !!m.requiresReview, requiresEvidence: !!m.requiresEvidence, mandatory: m.mandatory !== false, optional: !!m.optional, condition: m.condition || '',
    description: m.description || '', instructions: m.instructions || '', location: m.location || '',
    deliverables: (m.deliverables || []).join('\n'), checklist: (m.checklist || []).map((c) => (typeof c === 'string' ? c : c.text)).join('\n'),
    done: !!m.done, status: m.status,
})
export const fromRow = (x, mode) => ({
    key: x.key || undefined, label: x.label.trim(), stage: x.stage, estimatedHours: Number(x.estimatedHours) || 0, priority: x.priority,
    responsibleRole: x.responsibleRole, reviewerRole: x.reviewerRole, dependsOn: x.dependsOn, requiresReview: x.requiresReview, requiresEvidence: x.requiresEvidence,
    mandatory: x.mandatory, optional: x.optional, condition: x.condition, description: x.description, instructions: x.instructions,
    deliverables: lines(x.deliverables), checklist: lines(x.checklist),
    ...(mode === 'template' ? { offsetDays: Number(x.offsetDays) || 0 } : { assignee: x.assignee || null, reviewer: x.reviewer || null, dueDate: x.dueDate || null, location: x.location }),
})

export const TaskRowsEditor = ({ rows, setRows, stages, mode = 'engagement', people = [], hoursByStep = {} }) => {
    const [open, setOpen] = useState(null)
    const [drag, setDrag] = useState(null)
    const set = (i, patch) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)))
    const move = (i, dir) => setRows((r) => {
        const same = r.map((x, j) => [x, j]).filter(([x]) => x.stage === r[i].stage).map(([, j]) => j)
        const to = same[same.indexOf(i) + dir]
        if (to === undefined) return r
        const n = [...r]; [n[i], n[to]] = [n[to], n[i]]; return n
    })
    const dropOn = (targetIdx, stage) => setRows((r) => {
        if (drag === null || drag === targetIdx || LOCKED.includes(r[drag].key)) return r
        const n = [...r]; const [item] = n.splice(drag, 1)
        item.stage = stage
        const at = targetIdx === null ? (n.map((x) => x.stage).lastIndexOf(stage) + 1 || n.length) : targetIdx > drag ? targetIdx - 1 : targetIdx
        n.splice(at, 0, item)
        return n
    })
    const add = (stage) => setRows((r) => {
        const last = r.map((x) => x.stage).lastIndexOf(stage)
        const n = [...r]; n.splice(last + 1, 0, { ...toRow({ stage }), isNew: true }); return n
    })
    const remove = async (i) => {
        const x = rows[i]
        if (hoursByStep[x.key] && !(await confirmAction({ title: `Remove “${x.label}”?`, message: `It has ${Math.round(hoursByStep[x.key] / 6) / 10}h logged. The logged time keeps its name.`, confirmLabel: 'Remove task' }))) return
        setRows((r) => r.filter((_, j) => j !== i).map((y) => ({ ...y, dependsOn: (y.dependsOn || []).filter((k) => k !== x.key) })))
    }
    const keyed = rows.filter((x) => x.key)

    return stages.map((stage) => {
        const list = rows.map((x, i) => [x, i]).filter(([x]) => x.stage === stage)
        return (
            <section key={stage} className="wf-stage" onDragOver={(e) => e.preventDefault()} onDrop={() => { dropOn(null, stage); setDrag(null) }}>
                <header>
                    <span className="wf-stage-toggle"><i className={`mdi ${STAGE_ICONS[stage] || 'mdi-flag-outline'}`}></i><b>{stage}</b><small>{list.length} task{list.length === 1 ? '' : 's'} · {list.reduce((t, [x]) => t + (Number(x.estimatedHours) || 0), 0)}h</small></span>
                    <button type="button" className="pp-btn sm" onClick={() => add(stage)}><i className="mdi mdi-plus"></i>Add task</button>
                </header>
                <div className="wf-rows">
                    {list.length > 0 && <div className={`wf-head ${mode}`}><span></span><span>Task</span><span>{mode === 'template' ? 'Responsible role' : 'Owner'}</span><span>Hours</span><span>{mode === 'template' ? 'Day' : 'Due'}</span><span>Stage</span><span></span></div>}
                    {list.map(([x, i], pos) => {
                        const locked = LOCKED.includes(x.key)
                        const isOpen = open === i
                        return (
                            <div key={x.key || `new-${i}`} className={`wf-item ${isOpen ? 'open' : ''} ${drag === i ? 'dragging' : ''}`}
                                draggable={!locked} onDragStart={() => setDrag(i)} onDragEnd={() => setDrag(null)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.stopPropagation(); dropOn(i, stage); setDrag(null) }}>
                                <div className={`wf-row ${mode}`}>
                                    <span className="wf-order">
                                        <i className="mdi mdi-drag-vertical wf-grip" aria-hidden="true"></i>
                                        <span><button type="button" disabled={pos === 0} onClick={() => move(i, -1)} aria-label="Move up"><i className="mdi mdi-chevron-up"></i></button>
                                            <button type="button" disabled={pos === list.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><i className="mdi mdi-chevron-down"></i></button></span>
                                    </span>
                                    <span className="wf-name">
                                        {x.done && <i className="mdi mdi-check-circle" title="Done"></i>}
                                        <input className="pp-input" value={x.label} maxLength={140} autoFocus={x.isNew} disabled={locked} onChange={(e) => set(i, { label: e.target.value })} placeholder="e.g. Inventory observation" aria-label="Task name" />
                                        {hoursByStep[x.key] > 0 && <small>{Math.round(hoursByStep[x.key] / 6) / 10}h logged</small>}
                                    </span>
                                    {mode === 'template'
                                        ? <input className="pp-input" list="wf-roles" value={x.responsibleRole} onChange={(e) => set(i, { responsibleRole: e.target.value })} placeholder="Role" aria-label="Responsible role" disabled={locked} />
                                        : <select className="pp-select" value={x.assignee} onChange={(e) => set(i, { assignee: e.target.value })} aria-label="Owner" disabled={locked}><option value="">No owner</option>{people.map((p) => <option key={p._id} value={p._id}>{fullName(p)}</option>)}</select>}
                                    <input type="number" min="0" step="0.5" className="pp-input" value={x.estimatedHours} onChange={(e) => set(i, { estimatedHours: e.target.value })} placeholder="0" aria-label="Estimated hours" disabled={locked} />
                                    {mode === 'template'
                                        ? <input type="number" min="0" className="pp-input" value={x.offsetDays} onChange={(e) => set(i, { offsetDays: e.target.value })} placeholder="0" aria-label="Target day after start" title="Target: days after the engagement starts" />
                                        : <input type="date" className="pp-input" value={x.dueDate} onChange={(e) => set(i, { dueDate: e.target.value })} aria-label="Due date" />}
                                    <select className="pp-select" value={x.stage} disabled={locked} onChange={(e) => set(i, { stage: e.target.value })} aria-label="Stage">{stages.map((s) => <option key={s}>{s}</option>)}</select>
                                    <span className="wf-rowact">
                                        <button type="button" className={`wf-more ${isOpen ? 'on' : ''} ${x.requiresReview || x.dependsOn.length || x.checklist ? 'has' : ''}`} onClick={() => setOpen(isOpen ? null : i)} aria-expanded={isOpen} title="Reviewer, prerequisites, rules, instructions" aria-label="More settings"><i className="mdi mdi-tune-variant"></i></button>
                                        {locked ? <span className="wf-lock" title="Recorded automatically by billing"><i className="mdi mdi-lock-outline"></i></span>
                                            : <button type="button" className="wf-del" onClick={() => remove(i)} aria-label={`Remove ${x.label || 'task'}`}><i className="mdi mdi-delete-outline"></i></button>}
                                    </span>
                                </div>
                                {(x.requiresReview || x.dependsOn.length > 0 || x.requiresEvidence || x.optional) && !isOpen && (
                                    <div className="wf-badges">
                                        {x.requiresReview && <span><i className="mdi mdi-account-check-outline"></i>Review{x.reviewerRole ? ` · ${x.reviewerRole}` : ''}</span>}
                                        {x.requiresEvidence && <span><i className="mdi mdi-paperclip"></i>Evidence</span>}
                                        {x.dependsOn.length > 0 && <span><i className="mdi mdi-source-branch"></i>After {x.dependsOn.map((k) => rows.find((r) => r.key === k)?.label).filter(Boolean).join(', ')}</span>}
                                        {x.optional && <span>Optional{x.condition ? ` — ${x.condition}` : ''}</span>}
                                    </div>
                                )}
                                {isOpen && (
                                    <div className="wf-adv">
                                        <div className="wf-adv-grid">
                                            {mode === 'engagement' && <label>Reviewer<select className="pp-select" value={x.reviewer} onChange={(e) => set(i, { reviewer: e.target.value })}><option value="">{x.requiresReview ? 'Engagement manager' : 'No reviewer'}</option>{people.filter((p) => p._id !== x.assignee).map((p) => <option key={p._id} value={p._id}>{fullName(p)}</option>)}</select></label>}
                                            {mode === 'engagement' && <label>Responsible role<input className="pp-input" list="wf-roles" value={x.responsibleRole} onChange={(e) => set(i, { responsibleRole: e.target.value })} /></label>}
                                            <label>Reviewer role<input className="pp-input" list="wf-roles" value={x.reviewerRole} onChange={(e) => set(i, { reviewerRole: e.target.value })} placeholder="e.g. Manager" /></label>
                                            <label>Priority<select className="pp-select" value={x.priority} onChange={(e) => set(i, { priority: e.target.value })}>{['Low', 'Medium', 'High', 'Critical'].map((p) => <option key={p}>{p}</option>)}</select></label>
                                            {mode === 'engagement' && <label>Work location<input className="pp-input" value={x.location} onChange={(e) => set(i, { location: e.target.value })} placeholder="Office / client site" /></label>}
                                        </div>
                                        <div className="wf-flags">
                                            <label><input type="checkbox" checked={x.requiresReview} onChange={(e) => set(i, { requiresReview: e.target.checked })} />Needs reviewer approval</label>
                                            <label><input type="checkbox" checked={x.requiresEvidence} onChange={(e) => set(i, { requiresEvidence: e.target.checked })} />Evidence / workpaper required</label>
                                            <label><input type="checkbox" checked={x.optional} onChange={(e) => set(i, { optional: e.target.checked, mandatory: !e.target.checked })} />Optional (not needed to complete the engagement)</label>
                                        </div>
                                        {x.optional && <label className="wf-wide">Applies when<input className="pp-input" value={x.condition} onChange={(e) => set(i, { condition: e.target.value })} placeholder="e.g. client holds inventory" /></label>}
                                        <div className="wf-deps"><span>Can start after</span>
                                            {keyed.filter((y) => y.key !== x.key).map((y) => (
                                                <label key={y.key} className={x.dependsOn.includes(y.key) ? 'on' : ''}><input type="checkbox" checked={x.dependsOn.includes(y.key)} onChange={(e) => set(i, { dependsOn: e.target.checked ? [...x.dependsOn, y.key] : x.dependsOn.filter((k) => k !== y.key) })} />{y.label}</label>
                                            ))}
                                            {!keyed.length && <small>Save once to link tasks.</small>}
                                        </div>
                                        <label className="wf-wide">Description<textarea rows={2} className="pp-input" value={x.description} onChange={(e) => set(i, { description: e.target.value })}></textarea></label>
                                        <label className="wf-wide">Instructions<textarea rows={3} className="pp-input" value={x.instructions} onChange={(e) => set(i, { instructions: e.target.value })} placeholder="How to do it, what to test, where to save"></textarea></label>
                                        <div className="wf-adv-grid two">
                                            <label>Deliverables <small>one per line</small><textarea rows={3} className="pp-input" value={x.deliverables} onChange={(e) => set(i, { deliverables: e.target.value })} placeholder="Lead schedule&#10;Sample selection"></textarea></label>
                                            <label>Checklist <small>one per line — all ticked before submitting</small><textarea rows={3} className="pp-input" value={x.checklist} onChange={(e) => set(i, { checklist: e.target.value })} placeholder="Agree to TB&#10;Cross-reference"></textarea></label>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                    {!list.length && <p className="wf-empty">No tasks in {stage} — drag one here or <button type="button" className="wk-link" onClick={() => add(stage)}>add one</button>.</p>}
                </div>
                <datalist id="wf-roles">{DESIGNATIONS.map((d) => <option key={d} value={d} />)}</datalist>
            </section>
        )
    })
}

// One engagement's workflow (modal)
export const WorkflowEditor = ({ audit, people, hoursByStep = {}, canStandard, onClose, onSaved }) => {
    const [rows, setRows] = useState(() => (audit.milestones || []).map(toRow))
    const [standard, setStandard] = useState(false)
    const [note, setNote] = useState('')
    const [busy, setBusy] = useState(false)
    const stages = audit.stages?.length ? audit.stages : DEFAULT_STAGES
    const loadStandard = async () => {
        try {
            const j = await api('GET', `/audits/workflow-template?type=${encodeURIComponent(audit.auditType)}&clientId=${audit.clientId?._id || audit.clientId || ''}&projectId=${audit.projectId || ''}`)
            if (!(await confirmAction({ tone: 'warn', confirmLabel: 'Replace tasks', title: 'Load this template?', message: `Replace the tasks with “${j.template?.name}” v${j.template?.version}? Tasks with the same key keep their progress, owner and dates. (To move to a newer version with a preview, use “Update workflow” instead.)` }))) return
            const byKey = new Map(rows.map((x) => [x.key, x]))
            setRows(j.data.map((m) => ({ ...toRow(m), ...(byKey.has(m.key) ? { done: byKey.get(m.key).done, assignee: byKey.get(m.key).assignee, reviewer: byKey.get(m.key).reviewer, dueDate: byKey.get(m.key).dueDate } : {}) })))
        } catch (e) { toast.error(e.message) }
    }
    const save = async () => {
        if (rows.some((x) => !x.label.trim())) { toast.error('Every task needs a name.'); return }
        setBusy(true)
        try {
            const j = await api('PUT', `/audits/${audit._id}/workflow`, { milestones: rows.map((x) => fromRow(x, 'engagement')), saveAsStandard: standard, changeNote: note })
            toast.success(j.message, { title: 'Workflow' })
            onSaved()
        } catch (e) { toast.error(e.message) } finally { setBusy(false) }
    }
    const budget = rows.reduce((t, x) => t + (Number(x.estimatedHours) || 0), 0)
    return (
        <Modal wide title="Configure workflow" sub={`${audit.clientName} · ${audit.auditCode}${audit.workflowTemplate?.name ? ` — from “${audit.workflowTemplate.name}” v${audit.workflowTemplate.version}` : ''}`} icon={<span className="wf-ic"><i className="mdi mdi-sitemap"></i></span>} onClose={onClose}
            footer={<>
                <button type="button" className="pp-btn ghost" onClick={loadStandard}><i className="mdi mdi-file-replace-outline"></i>Load checklist</button>
                {canStandard && <label className="wf-std"><input type="checkbox" checked={standard} onChange={(e) => setStandard(e.target.checked)} />Publish as the standard for <b>{audit.auditType}</b> audits</label>}
                <span className="wf-spacer"></span>
                <button type="button" className="pp-btn" onClick={onClose}>Cancel</button>
                <button type="button" className="pp-btn primary" onClick={save} disabled={busy}>{busy ? <i className="mdi mdi-loading mdi-spin"></i> : <i className="mdi mdi-content-save-outline"></i>}Save workflow</button>
            </>}>
            <div className="wf-summary"><span><b>{rows.length}</b> tasks</span><span><b>{budget}h</b> estimated{audit.estimatedHours ? ` of ${audit.estimatedHours}h budget` : ''}</span><span><b>{rows.filter((x) => x.assignee).length}</b> with an owner</span><span><b>{rows.filter((x) => x.requiresReview).length}</b> reviewed</span></div>
            <TaskRowsEditor rows={rows} setRows={setRows} stages={stages} mode="engagement" people={people} hoursByStep={hoursByStep} />
            <label className="wf-wide wf-note">What changed (for the history)<input className="pp-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Added inventory observation for the year-end count" /></label>
        </Modal>
    )
}
