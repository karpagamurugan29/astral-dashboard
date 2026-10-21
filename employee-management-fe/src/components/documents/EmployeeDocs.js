import React, { useRef, useState } from 'react'
import { API_URL } from '../../utils/Constants'
import { TOKEN_KEY } from '../common/ApiCall'
import { Avatar, fullName, fmtDate } from '../people/PeopleUI'
import './EmployeeDocs.css'

// Same list as the server (models/documentModel.js).
export const DOC_CATEGORIES = [
    'ID Proof', 'Address Proof', 'PAN / Tax', 'Bank Details', 'Education', 'Professional Certificate',
    'Experience / Relieving', 'Offer Letter', 'Contract', 'Certificate', 'Policy', 'Payslip', 'Other',
]
const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.heic,.doc,.docx,.xls,.xlsx'
const MAX_MB = 10

const fileIcon = (mime = '', name = '') => {
    if (/pdf/.test(mime) || /\.pdf$/i.test(name)) return ['mdi-file-pdf-box', '#dc2626']
    if (/image/.test(mime)) return ['mdi-file-image-outline', '#7c3aed']
    if (/word/.test(mime) || /\.docx?$/i.test(name)) return ['mdi-file-word-outline', '#2563eb']
    if (/sheet|excel/.test(mime) || /\.xlsx?$/i.test(name)) return ['mdi-file-excel-outline', '#059669']
    return ['mdi-file-document-outline', '#475569']
}
const sizeLabel = (b = 0) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)
const expiryOf = (d) => {
    if (!d) return null
    const days = Math.ceil((new Date(d) - new Date()) / 864e5)
    if (days < 0) return { tone: 'bad', text: `Expired ${fmtDate(d)}` }
    if (days <= 30) return { tone: 'warn', text: `Expires in ${days}d` }
    return { tone: 'ok', text: `Valid till ${fmtDate(d)}` }
}

// Files are private: fetch with the login token, then show or save the blob. A plain link would
// not carry the token (phones block the cookie) and must not work for anyone else anyway.
export const openDocument = async (doc, download = false) => {
    const win = !download ? window.open('', '_blank') : null
    try {
        let token = null
        try { token = localStorage.getItem(TOKEN_KEY) } catch { /* private mode */ }
        const res = await fetch(`${API_URL}/documents/${doc._id}/file`, { credentials: 'include', headers: token ? { Authorization: `Bearer ${token}` } : {} })
        if (!res.ok) {
            const msg = (await res.json().catch(() => null))?.message || `Couldn't open the file (${res.status})`
            if (win) win.close()
            window.alert(msg)
            return
        }
        const url = URL.createObjectURL(await res.blob())
        if (win) win.location.href = url
        else {
            const a = document.createElement('a')
            a.href = url
            a.download = doc.fileName || doc.title
            document.body.appendChild(a)
            a.click()
            a.remove()
        }
        setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch {
        if (win) win.close()
        window.alert("Couldn't reach the server")
    }
}

/* ------------------------------------------------------------------ */
/* Upload form — used on the Documents screen, the profile and when    */
/* adding an employee (where it queues files instead of uploading).    */
/* ------------------------------------------------------------------ */
const blank = { category: 'ID Proof', title: '', documentNumber: '', expiryDate: '', notes: '', file: null }

export const DocUploadForm = ({ owners, ownerId, onOwnerChange, onSubmit, busy, submitLabel = 'Upload', ownerLocked }) => {
    const [form, setForm] = useState(blank)
    const [err, setErr] = useState('')
    const [drag, setDrag] = useState(false)
    const fileRef = useRef()
    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

    const pick = (file) => {
        if (!file) return
        if (file.size > MAX_MB * 1048576) { setErr(`That file is over ${MAX_MB} MB.`); return }
        setErr('')
        setForm((f) => ({ ...f, file, title: f.title || file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ') }))
    }

    const submit = async (e) => {
        e?.preventDefault()
        if (!form.file) { setErr('Choose a file first.'); return }
        if (owners && !ownerId) { setErr('Choose whose document this is.'); return }
        const ok = await onSubmit({ ...form, title: form.title.trim() || form.file.name })
        if (ok !== false) {
            setForm((f) => ({ ...blank, category: f.category }))
            if (fileRef.current) fileRef.current.value = ''
        }
    }

    const [ic, col] = form.file ? fileIcon(form.file.type, form.file.name) : []

    return (
        // a <div>, not a <form>: this also sits inside the Add employee form, and forms can't nest
        <div className="dc-form" onKeyDown={(e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); submit() } }}>
            {owners && (
                <label className="dc-f dc-owner">
                    <span>Employee <b>*</b></span>
                    <select className="pp-input" value={ownerId || ''} onChange={(e) => onOwnerChange?.(e.target.value)} disabled={ownerLocked}>
                        <option value="">Select employee…</option>
                        <option value="company">Company-wide (policy for everyone)</option>
                        {owners.map((o) => <option key={o._id} value={o._id}>{o.employeeId} · {fullName(o)}{o.designation ? ` — ${o.designation}` : ''}</option>)}
                    </select>
                </label>
            )}
            <label className={`dc-drop ${drag ? 'drag' : ''} ${form.file ? 'has' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]) }}>
                <input ref={fileRef} type="file" accept={ACCEPT} onChange={(e) => pick(e.target.files?.[0])} />
                {form.file ? (
                    <>
                        <i className={`mdi ${ic}`} style={{ color: col }}></i>
                        <span className="dc-drop-main"><b>{form.file.name}</b><small>{sizeLabel(form.file.size)} · tap to change</small></span>
                    </>
                ) : (
                    <>
                        <i className="mdi mdi-cloud-upload-outline"></i>
                        <span className="dc-drop-main"><b>Choose a file or drop it here</b><small>PDF, image, Word or Excel · up to {MAX_MB} MB</small></span>
                    </>
                )}
            </label>
            <div className="dc-grid">
                <label className="dc-f">
                    <span>Type</span>
                    <select className="pp-input" value={form.category} onChange={set('category')}>
                        {DOC_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                </label>
                <label className="dc-f">
                    <span>Title</span>
                    <input className="pp-input" value={form.title} onChange={set('title')} placeholder="e.g. Aadhaar card" maxLength={160} />
                </label>
                <label className="dc-f">
                    <span>Document number</span>
                    <input className="pp-input" value={form.documentNumber} onChange={set('documentNumber')} placeholder="Optional" maxLength={60} />
                </label>
                <label className="dc-f">
                    <span>Valid till</span>
                    <input className="pp-input" type="date" value={form.expiryDate} onChange={set('expiryDate')} />
                </label>
            </div>
            <label className="dc-f">
                <span>Notes</span>
                <input className="pp-input" value={form.notes} onChange={set('notes')} placeholder="Optional" maxLength={300} />
            </label>
            {err && <div className="dc-err"><i className="mdi mdi-alert-circle-outline"></i>{err}</div>}
            <div className="dc-actions">
                <span className="dc-private"><i className="mdi mdi-shield-lock-outline"></i>Only the employee, their reporting managers and HR can open it.</span>
                <button type="button" className="pp-btn primary" disabled={busy} onClick={submit}>
                    {busy ? <><span className="ae-spinner"></span> Uploading…</> : <><i className="mdi mdi-upload"></i>{submitLabel}</>}
                </button>
            </div>
        </div>
    )
}

/* ------------------------------------------------------------------ */
/* List                                                                */
/* ------------------------------------------------------------------ */
export const DocList = ({ docs, showOwner, canDelete, onDelete, empty = 'No documents yet.' }) => {
    if (!docs?.length) return <div className="dc-empty"><i className="mdi mdi-folder-open-outline"></i><span>{empty}</span></div>
    return (
        <ul className="dc-list">
            {docs.map((d) => {
                const [ic, col] = fileIcon(d.mimeType, d.fileName)
                const exp = expiryOf(d.expiryDate)
                const owner = d.employeeId && typeof d.employeeId === 'object' ? d.employeeId : null
                return (
                    <li key={d._id} className="dc-item">
                        <span className="dc-ic" style={{ color: col, background: `color-mix(in srgb, ${col} 10%, transparent)` }}><i className={`mdi ${ic}`}></i></span>
                        <div className="dc-main">
                            <div className="dc-top">
                                <b className="dc-title">{d.title}</b>
                                <span className="dc-cat">{d.category}</span>
                                {exp && <span className={`dc-exp ${exp.tone}`}>{exp.text}</span>}
                            </div>
                            <div className="dc-sub">
                                {showOwner && (owner
                                    ? <span className="dc-owner-tag"><Avatar person={owner} size={18} />{owner.employeeId} · {fullName(owner)}</span>
                                    : <span className="dc-owner-tag company"><i className="mdi mdi-domain"></i>Company-wide</span>)}
                                {d.documentNumber && <span>No. {d.documentNumber}</span>}
                                <span>{sizeLabel(d.size)}</span>
                                <span>Added {fmtDate(d.createdAt)}{d.uploadedBy?.firstName ? ` by ${fullName(d.uploadedBy)}` : ''}</span>
                            </div>
                            {d.notes && <div className="dc-note">{d.notes}</div>}
                        </div>
                        <div className="dc-btns">
                            <button type="button" className="dc-btn" onClick={() => openDocument(d)} title="View"><i className="mdi mdi-eye-outline"></i><span>View</span></button>
                            <button type="button" className="dc-btn" onClick={() => openDocument(d, true)} title="Download"><i className="mdi mdi-download-outline"></i><span>Download</span></button>
                            {canDelete?.(d) && <button type="button" className="dc-btn danger" onClick={() => onDelete(d)} title="Delete" aria-label={`Delete ${d.title}`}><i className="mdi mdi-trash-can-outline"></i></button>}
                        </div>
                    </li>
                )
            })}
        </ul>
    )
}

/* ------------------------------------------------------------------ */
/* Add employee: files are queued and uploaded right after the record  */
/* is created (it needs the new employee's id).                        */
/* ------------------------------------------------------------------ */
export const PendingDocs = ({ value = [], onChange }) => (
    <div className="dc-pending">
        <DocUploadForm submitLabel="Add to list" onSubmit={(doc) => { onChange([...value, { ...doc, key: `${Date.now()}-${Math.random()}` }]); return true }} />
        {value.length > 0 && (
            <ul className="dc-list compact">
                {value.map((d) => {
                    const [ic, col] = fileIcon(d.file.type, d.file.name)
                    return (
                        <li key={d.key} className="dc-item">
                            <span className="dc-ic" style={{ color: col, background: `color-mix(in srgb, ${col} 10%, transparent)` }}><i className={`mdi ${ic}`}></i></span>
                            <div className="dc-main">
                                <div className="dc-top"><b className="dc-title">{d.title}</b><span className="dc-cat">{d.category}</span></div>
                                <div className="dc-sub"><span>{d.file.name}</span><span>{sizeLabel(d.file.size)}</span>{d.documentNumber && <span>No. {d.documentNumber}</span>}</div>
                            </div>
                            <div className="dc-btns">
                                <button type="button" className="dc-btn danger" onClick={() => onChange(value.filter((x) => x.key !== d.key))} aria-label={`Remove ${d.title}`}><i className="mdi mdi-close"></i></button>
                            </div>
                        </li>
                    )
                })}
            </ul>
        )}
    </div>
)
