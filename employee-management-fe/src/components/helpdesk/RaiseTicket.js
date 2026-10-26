import React, { useRef, useState } from 'react'
import { Modal } from '../../pages/dashboard/projects/ProjectParts'
import { toast } from '../common/Toaster'
import { api, PRIORITY, checkFiles, fileSize } from './HelpdeskUI'

const PRIO_HINT = { Low: 'Whenever you can', Medium: 'Within a couple of days', High: 'Affecting my work', Critical: 'Urgent — pay, access or safety' }

// Raise a ticket: topic, subject, details, priority, attachments — validated here and on the server.
export const RaiseTicket = ({ meta, onClose, onCreated }) => {
    const [f, setF] = useState({ category: '', subject: '', description: '', priority: 'Medium' })
    const [files, setFiles] = useState([])
    const [errors, setErrors] = useState({})
    const [busy, setBusy] = useState(false)
    const input = useRef(null)
    const set = (k) => (e) => { setF((x) => ({ ...x, [k]: e.target ? e.target.value : e })); setErrors((x) => ({ ...x, [k]: '' })) }
    const rules = meta?.attachments
    const cats = (meta?.categories || []).filter((c) => c.active)

    const addFiles = (list) => {
        const next = [...files, ...list]
        const bad = checkFiles(next, rules)
        if (bad) { setErrors((x) => ({ ...x, files: bad })); return }
        setErrors((x) => ({ ...x, files: '' })); setFiles(next)
    }
    const submit = async (e) => {
        e.preventDefault()
        const err = {}
        if (!f.category) err.category = 'Pick a category.'
        if (f.subject.trim().length < 3) err.subject = 'Add a short subject (at least 3 characters).'
        if (f.description.trim().length < 10) err.description = 'Describe the issue (at least 10 characters).'
        if (Object.keys(err).length) { setErrors(err); return }
        const fd = new FormData()
        Object.entries(f).forEach(([k, v]) => fd.append(k, v))
        files.forEach((x) => fd.append('files', x))
        setBusy(true)
        try {
            const j = await api('POST', '/tickets', fd)
            toast.success(j.message)
            onCreated(j.data)
        } catch (ex) { toast.error(ex.message) } finally { setBusy(false) }
    }

    return (
        <Modal wide title="Raise an HR ticket" sub="HR will reply here — you'll get a notification at each step." icon={<span className="hd-modal-ic"><i className="mdi mdi-lifebuoy"></i></span>} onClose={onClose}
            footer={<><button type="button" className="pp-btn" onClick={onClose}>Cancel</button><button type="submit" form="hd-raise" className="pp-btn primary" disabled={busy}>{busy ? <i className="mdi mdi-loading mdi-spin"></i> : <i className="mdi mdi-send-outline"></i>}Raise ticket</button></>}>
            <form id="hd-raise" className="hd-form" onSubmit={submit} noValidate>
                <label className="pp-label">Category<span className="req">*</span></label>
                <div className={`hd-cats ${errors.category ? 'bad' : ''}`} role="radiogroup" aria-label="Category">
                    {cats.map((c) => (
                        <button key={c.name} type="button" role="radio" aria-checked={f.category === c.name} className={f.category === c.name ? 'on' : ''} style={{ '--c': c.color }} onClick={() => set('category')(c.name)}>
                            <i className={`mdi ${c.icon}`}></i><span><b>{c.name}</b><small>{c.hint}</small></span>
                            {c.confidential && <em title="Only HR sees tickets in this category"><i className="mdi mdi-shield-lock-outline"></i></em>}
                        </button>
                    ))}
                </div>
                {errors.category && <div className="pp-err">{errors.category}</div>}

                <div className="hd-row2">
                    <div className="pp-field">
                        <label className="pp-label" htmlFor="hd-subject">Subject<span className="req">*</span></label>
                        <input id="hd-subject" className={`pp-input ${errors.subject ? 'is-invalid' : ''}`} maxLength={150} value={f.subject} onChange={set('subject')} placeholder="e.g. September payslip not visible" />
                        {errors.subject && <div className="pp-err">{errors.subject}</div>}
                    </div>
                    <div className="pp-field">
                        <label className="pp-label">Priority</label>
                        <div className="hd-priopick" role="radiogroup" aria-label="Priority">
                            {(meta?.priorities || Object.keys(PRIORITY)).map((p) => (
                                <button key={p} type="button" role="radio" aria-checked={f.priority === p} className={f.priority === p ? 'on' : ''} style={{ '--c': PRIORITY[p].color }} onClick={() => set('priority')(p)} title={PRIO_HINT[p]}>
                                    <i className={`mdi ${PRIORITY[p].icon}`}></i>{p}
                                </button>
                            ))}
                        </div>
                        <small className="hd-help">{PRIO_HINT[f.priority]}{meta?.sla?.[f.priority] ? ` · HR aims to reply within ${meta.sla[f.priority].response}h` : ''}</small>
                    </div>
                </div>

                <div className="pp-field">
                    <label className="pp-label" htmlFor="hd-desc" style={{ display: 'flex', justifyContent: 'space-between' }}><span>Details<span className="req">*</span></span><small className="hd-help">{f.description.length}/5000</small></label>
                    <textarea id="hd-desc" rows={5} maxLength={5000} className={`pp-input ${errors.description ? 'is-invalid' : ''}`} value={f.description} onChange={set('description')} placeholder="What happened, since when, and what do you need from HR?"></textarea>
                    {errors.description && <div className="pp-err">{errors.description}</div>}
                </div>

                <div className="pp-field">
                    <label className="pp-label">Attachments <small className="hd-help">optional · up to {rules?.maxFiles || 5} files, {rules?.maxSizeMB || 5} MB each</small></label>
                    <div className="hd-drop" onClick={() => input.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles([...e.dataTransfer.files]) }} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && input.current?.click()}>
                        <i className="mdi mdi-paperclip"></i><span>Drop files here or <u>browse</u></span><small>{rules?.types?.join(', ')}</small>
                        <input ref={input} type="file" multiple hidden accept={rules?.types?.map((t) => `.${t}`).join(',')} onChange={(e) => { addFiles([...e.target.files]); e.target.value = '' }} />
                    </div>
                    {errors.files && <div className="pp-err">{errors.files}</div>}
                    {files.length > 0 && <ul className="hd-files">{files.map((x, i) => <li key={`${x.name}${i}`}><i className="mdi mdi-file-outline"></i>{x.name}<small>{fileSize(x.size)}</small><button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={`Remove ${x.name}`}><i className="mdi mdi-close"></i></button></li>)}</ul>}
                </div>
            </form>
        </Modal>
    )
}
