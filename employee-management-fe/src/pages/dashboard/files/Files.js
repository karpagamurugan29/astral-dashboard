import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { PeopleShell, Avatar, EmptyState, ErrorBanner, fullName } from '../../../components/people/PeopleUI'
import { chatApi as api } from '../../../components/chat/chatApi'
import { TOKEN_KEY } from '../../../components/common/ApiCall'
import { API_URL } from '../../../utils/Constants'
import { useAccess } from '../../../hooks/useAccess'
import { toast } from '../../../components/common/Toaster'
import { Modal } from '../projects/ProjectParts'
import '../projects/MyTasks.css'
import './Files.css'
import { confirmAction } from '../../../components/common/ConfirmDialog'

/* Files: keep work files, organise them in folders and share them — one to one with people,
   or one to many with a chat group. Shares follow the same rule as chat (your team and the
   officials above you). Previews for images and PDFs, versions, activity, trash. */

const ROOT = { label: 'Files', to: '/files' }
const VIEWS = [['mine', 'My files', 'mdi-folder-account'], ['shared', 'Shared with me', 'mdi-account-group-outline'], ['recent', 'Recent', 'mdi-clock-outline'], ['starred', 'Starred', 'mdi-star-outline'], ['trash', 'Trash', 'mdi-trash-can-outline']]
const COLORS = ['#1e40af', '#c8102e', '#059669', '#d97706', '#7c3aed', '#0891b2', '#475569']
export const sizeText = (b = 0) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : b < 1073741824 ? `${(b / 1048576).toFixed(1)} MB` : `${(b / 1073741824).toFixed(2)} GB`)
const ago = (d) => { const m = Math.round((Date.now() - new Date(d)) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : m < 10080 ? `${Math.round(m / 1440)}d ago` : new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) }
export const typeOf = (f) => {
    const n = (f.name || '').toLowerCase(), m = f.mime || ''
    if (m.includes('pdf') || n.endsWith('.pdf')) return ['PDF', 'mdi-file-pdf-box', '#e11d48']
    if (m.startsWith('image/')) return ['Image', 'mdi-file-image', '#059669']
    if (/\.(xlsx?|csv)$/.test(n) || m.includes('sheet') || m.includes('excel')) return ['Spreadsheet', 'mdi-file-excel', '#15803d']
    if (/\.(docx?|rtf)$/.test(n) || m.includes('word')) return ['Document', 'mdi-file-word', '#1d4ed8']
    if (/\.(pptx?)$/.test(n) || m.includes('presentation')) return ['Slides', 'mdi-file-powerpoint', '#ea580c']
    if (/\.(zip|rar|7z)$/.test(n)) return ['Archive', 'mdi-folder-zip', '#7c3aed']
    if (m.startsWith('text/')) return ['Text', 'mdi-file-document-outline', '#475569']
    return ['File', 'mdi-file-outline', '#64748b']
}
const token = () => { try { return localStorage.getItem(TOKEN_KEY) } catch { return null } }
const authHeaders = () => (token() ? { Authorization: `Bearer ${token()}` } : {})
const blobOf = async (id, inline = true) => {
    const r = await fetch(`${API_URL}/files/${id}/download${inline ? '?inline=1' : ''}`, { credentials: 'include', headers: authHeaders() })
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'Couldn’t open the file.')
    return r.blob()
}
const download = async (f) => {
    try {
        const b = await blobOf(f._id, false)
        const url = URL.createObjectURL(b)
        const a = document.createElement('a'); a.href = url; a.download = f.name; document.body.appendChild(a); a.click(); a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 4000)
    } catch (e) { toast.error(e.message, { title: 'Download failed' }) }
}
// upload with a progress bar (fetch can't report upload progress)
const uploadWithProgress = (files, extra, onProgress) => new Promise((resolve, reject) => {
    const fd = new FormData()
    files.forEach((f) => fd.append('files', f))
    Object.entries(extra).forEach(([k, v]) => v != null && fd.append(k, v))
    const x = new XMLHttpRequest()
    x.open('POST', `${API_URL}/files`)
    x.withCredentials = true
    if (token()) x.setRequestHeader('Authorization', `Bearer ${token()}`)
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100))
    x.onload = () => { let j = {}; try { j = JSON.parse(x.responseText) } catch { /* not JSON */ } x.status < 300 && j.success ? resolve(j) : reject(new Error(j.message || `Upload failed (${x.status})`)) }
    x.onerror = () => reject(new Error('Upload failed — check your connection.'))
    x.send(fd)
})

const Thumb = ({ f, size = 'md' }) => {
    const [src, setSrc] = useState(null)
    const [, ic, c] = typeOf(f)
    useEffect(() => {
        let url = null, alive = true
        if ((f.mime || '').startsWith('image/') && f.size < 6e6 && !f.trashedAt) blobOf(f._id).then((b) => { if (alive) { url = URL.createObjectURL(b); setSrc(url) } }).catch(() => {})
        return () => { alive = false; if (url) URL.revokeObjectURL(url) }
    }, [f._id, f.mime, f.size, f.trashedAt])
    return src ? <span className={`fs-thumb ${size} img`}><img src={src} alt="" /></span> : <span className={`fs-thumb ${size}`} style={{ '--c': c }}><i className={`mdi ${ic}`}></i></span>
}
const SharedStack = ({ f }) => {
    const people = (f.shares || []).map((s) => s.employee).filter(Boolean)
    const groups = (f.groups || []).filter((g) => g.group)
    if (!people.length && !groups.length) return null
    return (
        <span className="fs-stack" title={[...people.map(fullName), ...groups.map((g) => g.group.name)].join(', ')}>
            {people.slice(0, 3).map((p) => <Avatar key={p._id} person={p} size={20} />)}
            {groups.length > 0 && <span className="fs-grp"><i className="mdi mdi-account-group-outline"></i>{groups.length}</span>}
            {people.length > 3 && <em>+{people.length - 3}</em>}
        </span>
    )
}

/* ---------------- share dialog ---------------- */
// `upload` turns it into the upload dialog: the files, where they go, and (optionally) who gets them.
const ShareDialog = ({ target, kind, onClose, onDone, upload }) => {
    const [t, setT] = useState(null)
    const [people, setPeople] = useState([])
    const [groups, setGroups] = useState([])
    const [perm, setPerm] = useState('view')
    const [msg, setMsg] = useState('')
    const [q, setQ] = useState('')
    const [busy, setBusy] = useState(false)
    useEffect(() => { api('GET', '/files/share-targets').then((j) => setT(j.data)).catch((e) => toast.error(e.message)) }, [])
    const already = new Set(((target && target.shares) || []).map((s) => s.employee?._id || s.employee))
    const toggle = (set, v) => set((l) => (l.includes(v) ? l.filter((x) => x !== v) : [...l, v]))
    const send = async () => {
        if (upload) { upload.onUpload({ shareWith: people, groups, permission: perm, message: msg }); return }
        setBusy(true)
        try { const j = await api('POST', kind === 'folder' ? `/files/folders/${target._id}/share` : `/files/${target._id}/share`, { people, groups, permission: perm, message: msg }); toast.success(j.message, { title: 'Shared' }); onDone() } catch (e) { toast.error(e.message) }
        setBusy(false)
    }
    const shownPeople = (t?.people || []).filter((p) => !q || `${fullName(p)} ${p.designation}`.toLowerCase().includes(q.toLowerCase()))
    return (
        <Modal title={upload ? `Upload ${upload.files.length} file${upload.files.length === 1 ? '' : 's'}` : `Share “${target.name}”`} sub={upload ? `To ${upload.folderName} · share with people or a group now, or later` : 'One to one with people, or one to many with a group'} icon={<span className="pw-dicon" style={{ '--c': '#1e40af' }}><i className={`mdi ${upload ? 'mdi-cloud-upload-outline' : 'mdi-share-variant'}`}></i></span>} onClose={onClose} wide
            footer={<><span className="fs-share-sum">{people.length + groups.length ? `Sharing with ${people.length} people · ${groups.length} groups` : upload ? 'Only you will see them (share later any time)' : 'Pick who to share with'}</span><button type="button" className="pp-btn" onClick={onClose}>Cancel</button>
                <button type="button" className="pp-btn primary" disabled={busy || (!upload && !(people.length + groups.length))} onClick={send}><i className={`mdi ${upload ? 'mdi-cloud-upload-outline' : 'mdi-share-variant'}`}></i>{upload ? (people.length + groups.length ? 'Upload & share' : 'Upload') : busy ? 'Sharing…' : 'Share'}</button></>}>
            {!t ? <div className="pw-loading"><i className="mdi mdi-loading mdi-spin"></i></div> : (
                <div className="fs-share">
                    {upload && <ul className="fs-uplist">{upload.files.map((f, i) => { const [, ic, c] = typeOf({ name: f.name, mime: f.type }); return <li key={i}><i className={`mdi ${ic}`} style={{ color: c }}></i><span>{f.name}</span><small>{sizeText(f.size)}</small></li> })}</ul>}
                    <div className="fs-perm">{[['view', 'Can view', 'Open and download', 'mdi-eye-outline'], ['edit', 'Can edit', 'Also upload new versions and share', 'mdi-pencil-outline']].map(([k, l, d, ic]) => <button key={k} type="button" className={perm === k ? 'on' : ''} onClick={() => setPerm(k)}><i className={`mdi ${ic}`}></i><b>{l}</b><small>{d}</small></button>)}</div>
                    {t.groups.length > 0 && <>
                        <h5><i className="mdi mdi-account-group-outline"></i>Groups <small>one to many</small></h5>
                        <div className="fs-chips">{t.groups.map((g) => <button key={g._id} type="button" className={groups.includes(g._id) ? 'on' : ''} onClick={() => toggle(setGroups, g._id)}><i className="mdi mdi-account-group-outline"></i>{g.name}<small>{g.members}</small></button>)}</div>
                    </>}
                    <h5><i className="mdi mdi-account-outline"></i>People <small>your team and higher officials</small></h5>
                    <div className="pp-search"><i className="mdi mdi-magnify"></i><input type="search" className="pp-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a person…" /></div>
                    <ul className="fs-people">{shownPeople.map((p) => (
                        <li key={p._id}><button type="button" className={people.includes(p._id) ? 'on' : ''} onClick={() => toggle(setPeople, p._id)} disabled={already.has(p._id)}>
                            <Avatar person={p} size={30} /><span><b>{fullName(p)}</b><small>{p.designation}</small></span>
                            {already.has(p._id) ? <em>Has access</em> : <i className={`mdi ${people.includes(p._id) ? 'mdi-checkbox-marked-circle' : 'mdi-checkbox-blank-circle-outline'}`}></i>}
                        </button></li>
                    ))}</ul>
                    <textarea className="pp-input" rows={2} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Add a message (optional) — they’ll get a notification" />
                </div>
            )}
        </Modal>
    )
}

/* ---------------- file details drawer ---------------- */
const FileDrawer = ({ id, me, folders, onClose, onChanged }) => {
    const [d, setD] = useState(null)
    const [preview, setPreview] = useState(null)
    const [tab, setTab] = useState('access')
    const [sharing, setSharing] = useState(false)
    const [rename, setRename] = useState(null)
    const verInput = useRef(null)
    const load = useCallback(() => api('GET', `/files/${id}`).then((j) => setD(j.data)).catch((e) => { toast.error(e.message); onClose() }), [id, onClose])
    useEffect(() => { load() }, [load])
    useEffect(() => {
        let url = null
        if (d && !d.trashedAt && ((d.mime || '').startsWith('image/') || (d.mime || '').includes('pdf')) && d.size < 15e6) blobOf(d._id).then((b) => { url = URL.createObjectURL(b); setPreview({ url, pdf: (d.mime || '').includes('pdf') }) }).catch(() => {})
        return () => { if (url) URL.revokeObjectURL(url) }
    }, [d?._id, d?.mime, d?.size, d?.trashedAt]) // eslint-disable-line react-hooks/exhaustive-deps
    if (!d) return createPortal(<div className="pp it-overlay"><aside className="it-drawer"><div className="pw-loading"><i className="mdi mdi-loading mdi-spin"></i></div></aside></div>, document.body)
    const owner = d.access === 'owner', canEdit = owner || d.access === 'edit'
    const [label, ic, c] = typeOf(d)
    const act = async (method, path, body, after) => { try { const j = await api(method, path, body); toast.success(j.message); after ? after(j) : load(); onChanged() } catch (e) { toast.error(e.message) } }
    const newVersion = async (e) => {
        const file = e.target.files?.[0]; e.target.value = ''
        if (!file) return
        const fd = new FormData(); fd.append('file', file)
        act('POST', `/files/${d._id}/version`, fd)
    }
    return createPortal(
        <div className="pp it-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <aside className="it-drawer fs-drawer" style={{ '--c': c }}>
                <header className="it-head">
                    <div className="it-head-top">
                        <span className="it-type" style={{ '--c': c }}><i className={`mdi ${ic}`}></i>{label}</span>
                        <span className="fs-meta">{sizeText(d.size)}{d.versions ? ` · v${d.versions + 1}` : ''}</span>
                        <button type="button" className="it-x" onClick={onClose} aria-label="Close"><i className="mdi mdi-close"></i></button>
                    </div>
                    {rename !== null ? (
                        <div className="fs-rename"><input className="pp-input" autoFocus value={rename} onChange={(e) => setRename(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && act('PUT', `/files/${d._id}`, { name: rename }, () => { setRename(null); load() })} /><button type="button" className="pp-btn primary sm" onClick={() => act('PUT', `/files/${d._id}`, { name: rename }, () => { setRename(null); load() })}>Save</button></div>
                    ) : <h2>{d.name}</h2>}
                    <p className="fs-owner"><Avatar person={d.owner} size={20} />{d.owner?._id === me ? 'You own this' : `Owned by ${fullName(d.owner)}`} · updated {ago(d.updatedAt)}</p>
                    <div className="it-tools">
                        {!d.trashedAt && <button type="button" className="it-tool close" onClick={() => download(d)}><i className="mdi mdi-download"></i>Download</button>}
                        {!d.trashedAt && canEdit && <button type="button" className="it-tool" onClick={() => setSharing(true)}><i className="mdi mdi-share-variant"></i>Share</button>}
                        {!d.trashedAt && <button type="button" className={`it-tool ${d.starred ? 'on' : ''}`} onClick={() => act('POST', `/files/${d._id}/star`)}><i className={`mdi ${d.starred ? 'mdi-star' : 'mdi-star-outline'}`}></i>{d.starred ? 'Starred' : 'Star'}</button>}
                        {!d.trashedAt && canEdit && <button type="button" className="it-tool" onClick={() => setRename(d.name)}><i className="mdi mdi-pencil-outline"></i>Rename</button>}
                        {!d.trashedAt && canEdit && <button type="button" className="it-tool" onClick={() => verInput.current?.click()}><i className="mdi mdi-file-replace-outline"></i>New version</button>}
                        {owner && !d.trashedAt && <button type="button" className="it-tool danger" onClick={async () => (await confirmAction({ title: `Move “${d.name}” to Trash?`, message: 'People it is shared with lose access. You can restore it from Trash.', confirmLabel: 'Move to Trash', tone: 'warn' })) && act('DELETE', `/files/${d._id}`, undefined, () => { onClose() })}><i className="mdi mdi-trash-can-outline"></i>Delete</button>}
                        {owner && d.trashedAt && <><button type="button" className="it-tool close" onClick={() => act('POST', `/files/${d._id}/restore`)}><i className="mdi mdi-delete-restore"></i>Restore</button><button type="button" className="it-tool danger" onClick={async () => (await confirmAction({ title: `Delete “${d.name}” for good?`, message: 'All its versions are removed. This can\'t be undone.', confirmLabel: 'Delete forever' })) && act('DELETE', `/files/${d._id}?permanent=1`, undefined, () => onClose())}><i className="mdi mdi-delete-outline"></i>Delete forever</button></>}
                        {!owner && <button type="button" className="it-tool" onClick={() => act('POST', `/files/${d._id}/unshare`, { employee: me }, () => onClose())}><i className="mdi mdi-close"></i>Remove from my list</button>}
                        <input ref={verInput} type="file" hidden onChange={newVersion} />
                    </div>
                </header>
                <div className="it-body">
                    {preview && (preview.pdf ? <iframe className="fs-preview pdf" src={preview.url} title={d.name} /> : <div className="fs-preview"><img src={preview.url} alt={d.name} /></div>)}
                    {owner && !d.trashedAt && folders.length > 0 && (
                        <label className="fs-move"><i className="mdi mdi-folder-move-outline"></i>Folder
                            <select className="pp-select" value={d.folder || ''} onChange={(e) => act('PUT', `/files/${d._id}`, { folder: e.target.value || null })}><option value="">My files (top)</option>{folders.map((f) => <option key={f._id} value={f._id}>{f.name}</option>)}</select>
                        </label>
                    )}
                    <div className="it-tabs">
                        <button type="button" className={tab === 'access' ? 'on' : ''} onClick={() => setTab('access')}><i className="mdi mdi-account-multiple-plus-outline"></i>Who has access <b>{(d.shares || []).length + (d.groups || []).length}</b></button>
                        <button type="button" className={tab === 'activity' ? 'on' : ''} onClick={() => setTab('activity')}><i className="mdi mdi-history"></i>Activity <b>{d.downloads}</b></button>
                        <button type="button" className={tab === 'versions' ? 'on' : ''} onClick={() => setTab('versions')}><i className="mdi mdi-file-replace-outline"></i>Versions <b>{d.versions + 1}</b></button>
                    </div>
                    {tab === 'access' && (
                        <ul className="fs-access">
                            <li><Avatar person={d.owner} size={30} /><span><b>{fullName(d.owner)}{d.owner?._id === me && <em>You</em>}</b><small>Owner</small></span></li>
                            {(d.groups || []).filter((g) => g.group).map((g) => (
                                <li key={g.group._id}><span className="fs-gic"><i className="mdi mdi-account-group-outline"></i></span><span><b>{g.group.name}</b><small>Group · {g.group.participants?.length || 0} people · {g.permission === 'edit' ? 'can edit' : 'can view'}</small></span>{owner && <button type="button" onClick={() => act('POST', `/files/${d._id}/unshare`, { group: g.group._id })} aria-label="Remove"><i className="mdi mdi-close"></i></button>}</li>
                            ))}
                            {(d.shares || []).filter((s) => s.employee).map((s) => (
                                <li key={s.employee._id}><Avatar person={s.employee} size={30} /><span><b>{fullName(s.employee)}{s.employee._id === me && <em>You</em>}</b><small>{s.employee.designation} · {s.permission === 'edit' ? 'can edit' : 'can view'}</small></span>{owner && <button type="button" onClick={() => act('POST', `/files/${d._id}/unshare`, { employee: s.employee._id })} aria-label="Remove access"><i className="mdi mdi-close"></i></button>}</li>
                            ))}
                            {!(d.shares || []).length && !(d.groups || []).length && <p className="it-muted">Only you can see this file{canEdit ? ' — use Share to give others access.' : '.'}</p>}
                        </ul>
                    )}
                    {tab === 'activity' && (d.activity?.length ? <ol className="it-history">{d.activity.map((a, i) => <li key={a._id || i}><span className="it-hdot"></span><div><p><b>{a.by ? fullName(a.by) : 'Someone'}</b> {a.action}{a.detail ? ` · ${a.detail}` : ''}</p><small>{ago(a.at)}</small></div></li>)}</ol> : <p className="it-muted">No activity yet.</p>)}
                    {tab === 'versions' && (
                        <ul className="fs-versions">
                            <li className="cur"><i className="mdi mdi-check-circle"></i><span><b>Current version</b><small>{sizeText(d.size)} · {ago(d.updatedAt)}</small></span></li>
                            {(d.versionList || []).map((v, i) => <li key={v._id || i}><i className="mdi mdi-history"></i><span><b>{v.name}</b><small>{sizeText(v.size)} · {ago(v.at)}{v.by ? ` · ${v.by.firstName}` : ''}</small></span></li>)}
                        </ul>
                    )}
                </div>
            </aside>
            {sharing && <ShareDialog target={d} kind="file" onClose={() => setSharing(false)} onDone={() => { setSharing(false); load(); onChanged() }} />}
        </div>,
        document.body
    )
}

export const Files = () => {
    const { user } = useAccess()
    const me = user?._id
    const location = useLocation()
    const navigate = useNavigate()
    const params = new URLSearchParams(location.search)
    const view = params.get('view') || 'mine'
    const folderId = params.get('folder') || ''
    const [d, setD] = useState(null)
    const [error, setError] = useState('')
    const [q, setQ] = useState('')
    const [layout, setLayout] = useState(() => { try { return localStorage.getItem('fs-layout') || 'grid' } catch { return 'grid' } })
    const [openId, setOpenId] = useState(null)
    const [newFolder, setNewFolder] = useState(null)
    const [shareFolder, setShareFolder] = useState(null)
    const [uploading, setUploading] = useState(null) // { names, pct }
    const [drag, setDrag] = useState(false)
    const [myFolders, setMyFolders] = useState([])
    const [pending, setPending] = useState(null) // files waiting in the upload dialog
    const [quickShare, setQuickShare] = useState(null)
    const input = useRef(null)

    const go = (v, folder) => navigate(`/files?view=${v}${folder ? `&folder=${folder}` : ''}`)
    const load = useCallback(() => api('GET', `/files?view=${view}${folderId ? `&folder=${folderId}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`).then((j) => { setD(j.data); setError('') }).catch((e) => setError(e.message)), [view, folderId, q])
    useEffect(() => { const t = setTimeout(load, q ? 250 : 0); return () => clearTimeout(t) }, [load, q])
    useEffect(() => { api('GET', '/files?view=mine').then((j) => setMyFolders(j.data.folders)).catch(() => {}) }, [d])
    useEffect(() => { try { localStorage.setItem('fs-layout', layout) } catch { /* private mode */ } }, [layout])

    // choosing or dropping files opens the upload dialog (destination + who to share with)
    const upload = (list) => {
        const files = [...list]
        if (!files.length) return
        const big = files.find((f) => f.size > 25 * 1024 * 1024)
        if (big) return toast.error(`“${big.name}” is over 25 MB.`, { title: 'File too large' })
        setPending(files)
    }
    const doUpload = async (files, share = {}) => {
        setPending(null)
        setUploading({ names: files.map((f) => f.name), pct: 0 })
        try {
            const canAdd = !d?.folder || ['owner', 'edit'].includes(d.folder.access)
            const j = await uploadWithProgress(files, { folder: canAdd ? folderId || null : null, shareWith: JSON.stringify(share.shareWith || []), groups: JSON.stringify(share.groups || []), permission: share.permission || 'view', message: share.message || '' }, (pct) => setUploading((u) => u && { ...u, pct }))
            toast.success(j.message, { title: 'Uploaded' })
            if (view !== 'mine' && !folderId) go('mine'); else load()
        } catch (e) { toast.error(e.message, { title: 'Upload failed' }) }
        setUploading(null)
    }
    const createFolder = async () => {
        try { const j = await api('POST', '/files/folders', { name: newFolder.name, color: newFolder.color, parent: folderId || null }); toast.success(j.message); setNewFolder(null); load() } catch (e) { toast.error(e.message) }
    }
    const folderAct = async (method, path, msg) => { try { const j = await api(method, path); toast.success(msg || j.message); load() } catch (e) { toast.error(e.message) } }

    const files = d?.files || [], folders = d?.folders || []
    const storagePct = d ? Math.min(100, Math.round((d.storage.used / d.storage.quota) * 100)) : 0
    const counts = { files: files.length, size: files.reduce((s, f) => s + (f.size || 0), 0) }
    const title = folderId ? d?.folder?.name || 'Folder' : VIEWS.find(([k]) => k === view)?.[1]
    const canUploadHere = view === 'mine' || (folderId && ['owner', 'edit'].includes(d?.folder?.access))

    return (
        <PeopleShell title="Files" root={ROOT} crumbs={[{ label: 'Files' }]}
            actions={<>
                {(view === 'mine' || (folderId && d?.folder?.access === 'owner')) && <button type="button" className="pp-btn" onClick={() => setNewFolder({ name: '', color: COLORS[0] })}><i className="mdi mdi-folder-plus-outline"></i>New folder</button>}
                <button type="button" className="pp-btn primary" onClick={() => input.current?.click()}><i className="mdi mdi-cloud-upload-outline"></i>Upload</button>
                <input ref={input} type="file" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = '' }} />
            </>}>
            <ErrorBanner error={error} />
            <div className={`fs-layout ${drag ? 'drag' : ''}`}
                onDragOver={(e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); setDrag(true) } }}
                onDragLeave={(e) => { if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget)) setDrag(false) }}
                onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files?.length) upload(e.dataTransfer.files) }}>
                <nav className="fs-nav pp-card">
                    {VIEWS.map(([k, label, ic]) => <button key={k} type="button" className={view === k && !folderId ? 'on' : ''} onClick={() => go(k)}><i className={`mdi ${ic}`}></i>{label}</button>)}
                    {myFolders.length > 0 && <><h6>My folders</h6>{myFolders.slice(0, 8).map((f) => <button key={f._id} type="button" className={`fold ${folderId === f._id ? 'on' : ''}`} onClick={() => go('mine', f._id)}><i className="mdi mdi-folder" style={{ color: f.color }}></i>{f.name}<small>{f.files}</small></button>)}</>}
                    {d && <div className="fs-storage"><span><i className="mdi mdi-harddisk"></i>{sizeText(d.storage.used)} of {sizeText(d.storage.quota)}</span><div><i style={{ width: `${Math.max(2, storagePct)}%` }}></i></div></div>}
                </nav>

                <section className="fs-main pp-card">
                    <div className="fs-bar">
                        <div className="fs-crumbs">
                            <button type="button" onClick={() => go(folderId ? (d?.folder?.owner?._id === me ? 'mine' : 'shared') : view)}>{folderId ? (d?.folder?.owner?._id === me ? 'My files' : 'Shared with me') : title}</button>
                            {(d?.crumbs || []).map((c) => <React.Fragment key={c._id}><i className="mdi mdi-chevron-right"></i><button type="button" onClick={() => go(view, c._id)}>{c.name}</button></React.Fragment>)}
                        </div>
                        <div className="pp-search fs-search"><i className="mdi mdi-magnify"></i><input type="search" className="pp-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search files, tags…" /></div>
                        <div className="fs-layouts"><button type="button" className={layout === 'grid' ? 'on' : ''} onClick={() => setLayout('grid')} aria-label="Grid"><i className="mdi mdi-view-grid-outline"></i></button><button type="button" className={layout === 'list' ? 'on' : ''} onClick={() => setLayout('list')} aria-label="List"><i className="mdi mdi-view-list-outline"></i></button></div>
                    </div>
                    {folderId && d?.folder && (
                        <div className="fs-folderbar" style={{ '--c': d.folder.color }}>
                            <i className="mdi mdi-folder"></i><b>{d.folder.name}</b><small>{d.folder.owner?._id === me ? 'Your folder' : `${fullName(d.folder.owner)}’s folder · you ${d.folder.access === 'edit' ? 'can edit' : 'can view'}`}</small>
                            {d.folder.access === 'owner' && <><button type="button" className="pp-btn sm" onClick={() => setShareFolder(d.folder)}><i className="mdi mdi-share-variant"></i>Share folder</button><button type="button" className="pp-btn sm" onClick={async () => (await confirmAction({ title: `Move “${d.folder.name}” to Trash?`, message: 'Its files go with it. You can restore it from Trash.', confirmLabel: 'Move to Trash', tone: 'warn' })) && folderAct('DELETE', `/files/folders/${d.folder._id}`).then(() => go('mine'))}><i className="mdi mdi-trash-can-outline"></i></button></>}
                        </div>
                    )}
                    {uploading && <div className="fs-upload"><i className="mdi mdi-cloud-upload-outline"></i><span>Uploading {uploading.names.length === 1 ? uploading.names[0] : `${uploading.names.length} files`}…</span><div><i style={{ width: `${uploading.pct}%` }}></i></div><b>{uploading.pct}%</b></div>}

                    {!d ? <div className="pw-loading"><i className="mdi mdi-loading mdi-spin"></i></div> : !files.length && !folders.length ? (
                        <div className="fs-empty">
                            <EmptyState icon={view === 'trash' ? 'mdi-trash-can-outline' : view === 'shared' ? 'mdi-account-group-outline' : 'mdi-cloud-upload-outline'}
                                title={q ? 'Nothing matches' : view === 'trash' ? 'Trash is empty' : view === 'shared' ? 'Nothing shared with you yet' : view === 'starred' ? 'No starred files' : 'Drop files here'}
                                text={q ? 'Try another word.' : view === 'shared' ? 'Files your team shares with you appear here.' : view === 'mine' || folderId ? 'Drag files onto this page, or use Upload. Up to 25 MB each.' : ''}
                                action={canUploadHere && !q ? <button type="button" className="pp-btn primary" onClick={() => input.current?.click()}><i className="mdi mdi-cloud-upload-outline"></i>Upload files</button> : null} />
                        </div>
                    ) : (
                        <>
                            {folders.length > 0 && (
                                <div className="fs-folders">{folders.map((f) => (
                                    <div key={f._id} className="fs-folder" style={{ '--c': f.color }} onDoubleClick={() => !f.trashedAt && go(view === 'trash' ? 'mine' : view, f._id)} onClick={() => !f.trashedAt && go(view === 'shared' ? 'shared' : 'mine', f._id)} role="button" tabIndex={0}>
                                        <i className="mdi mdi-folder"></i>
                                        <span><b>{f.name}</b><small>{f.files} file{f.files === 1 ? '' : 's'}{f.owner?._id !== me ? ` · ${fullName(f.owner)}` : ''}</small></span>
                                        {(f.shares?.length || f.groups?.length) ? <i className="mdi mdi-account-multiple-plus-outline fs-fshared" title="Shared"></i> : null}
                                        {f.trashedAt && <span className="fs-factions" onClick={(e) => e.stopPropagation()}><button type="button" onClick={() => folderAct('POST', `/files/folders/${f._id}/restore`)}><i className="mdi mdi-delete-restore"></i></button><button type="button" onClick={async () => (await confirmAction({ title: `Delete “${f.name}” for good?`, message: 'The folder and all its files are removed. This can\'t be undone.', confirmLabel: 'Delete forever', requireText: f.name })) && folderAct('DELETE', `/files/folders/${f._id}?permanent=1`)}><i className="mdi mdi-delete-outline"></i></button></span>}
                                    </div>
                                ))}</div>
                            )}
                            {files.length > 0 && (layout === 'grid' ? (
                                <div className="fs-grid">{files.map((f) => (
                                    <div key={f._id} role="button" tabIndex={0} className="fs-card" onClick={() => setOpenId(f._id)} onKeyDown={(e) => e.key === 'Enter' && setOpenId(f._id)}>
                                        <Thumb f={f} />
                                        {!f.trashedAt && <span className="fs-quick" onClick={(e) => e.stopPropagation()}>
                                            {['owner', 'edit'].includes(f.access) && <button type="button" title="Share" aria-label="Share" onClick={() => setQuickShare(f)}><i className="mdi mdi-share-variant"></i></button>}
                                            <button type="button" title="Download" aria-label="Download" onClick={() => download(f)}><i className="mdi mdi-download"></i></button>
                                            <button type="button" title={f.starred ? 'Unstar' : 'Star'} aria-label="Star" onClick={() => folderAct('POST', `/files/${f._id}/star`)}><i className={`mdi ${f.starred ? 'mdi-star' : 'mdi-star-outline'}`}></i></button>
                                        </span>}
                                        {f.starred && <i className="mdi mdi-star fs-star"></i>}
                                        <b title={f.name}>{f.name}</b>
                                        <small>{sizeText(f.size)} · {ago(f.updatedAt)}</small>
                                        <span className="fs-card-foot">{f.owner?._id !== me ? <span className="fs-by"><Avatar person={f.owner} size={18} />{f.owner?.firstName}</span> : <span className="fs-by mine">You</span>}<SharedStack f={f} /></span>
                                    </div>
                                ))}</div>
                            ) : (
                                <div className="tk-table-wrap"><table className="fs-table"><thead><tr><th>Name</th><th>Owner</th><th>Shared with</th><th>Size</th><th>Updated</th><th></th></tr></thead>
                                    <tbody>{files.map((f) => (
                                        <tr key={f._id} onClick={() => setOpenId(f._id)}>
                                            <td><span className="fs-name"><Thumb f={f} size="sm" /><b>{f.name}</b>{f.starred && <i className="mdi mdi-star fs-star-inline"></i>}</span></td>
                                            <td>{f.owner?._id === me ? 'You' : fullName(f.owner)}</td>
                                            <td><SharedStack f={f} />{!(f.shares?.length || f.groups?.length) && <span className="fs-private">Only {f.owner?._id === me ? 'you' : 'owner'}</span>}</td>
                                            <td>{sizeText(f.size)}</td><td>{ago(f.updatedAt)}</td>
                                            <td onClick={(e) => e.stopPropagation()}>{!f.trashedAt && <span className="fs-row-acts">{['owner', 'edit'].includes(f.access) && <button type="button" className="fs-dl" onClick={() => setQuickShare(f)} aria-label="Share"><i className="mdi mdi-share-variant"></i></button>}<button type="button" className="fs-dl" onClick={() => download(f)} aria-label="Download"><i className="mdi mdi-download"></i></button></span>}</td>
                                        </tr>
                                    ))}</tbody></table></div>
                            ))}
                            <p className="tk-foot">{folders.length ? `${folders.length} folder${folders.length === 1 ? '' : 's'} · ` : ''}{counts.files} file{counts.files === 1 ? '' : 's'} · {sizeText(counts.size)}{view === 'trash' ? ' · files in Trash can be restored' : ''}</p>
                        </>
                    )}
                    {drag && <div className="fs-drop"><i className="mdi mdi-cloud-upload-outline"></i><b>Drop to upload{d?.folder ? ` to “${d.folder.name}”` : ''}</b></div>}
                </section>
            </div>

            {openId && <FileDrawer id={openId} me={me} folders={myFolders} onClose={() => setOpenId(null)} onChanged={load} />}
            {newFolder && (
                <Modal title="New folder" icon={<span className="pw-dicon"><i className="mdi mdi-folder-plus-outline"></i></span>} onClose={() => setNewFolder(null)}
                    footer={<><button type="button" className="pp-btn" onClick={() => setNewFolder(null)}>Cancel</button><button type="button" className="pp-btn primary" disabled={!newFolder.name.trim()} onClick={createFolder}>Create</button></>}>
                    <input className="pp-input" autoFocus value={newFolder.name} onChange={(e) => setNewFolder((x) => ({ ...x, name: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && newFolder.name.trim() && createFolder()} placeholder="e.g. Sunrise Textiles — FY26 working papers" />
                    <div className="fs-colors">{COLORS.map((c) => <button key={c} type="button" className={newFolder.color === c ? 'on' : ''} style={{ background: c }} onClick={() => setNewFolder((x) => ({ ...x, color: c }))} aria-label="Colour"></button>)}</div>
                </Modal>
            )}
            {pending && <ShareDialog upload={{ files: pending, folderName: d?.folder && ['owner', 'edit'].includes(d.folder.access) ? `“${d.folder.name}”` : 'My files', onUpload: (share) => doUpload(pending, share) }} onClose={() => setPending(null)} />}
            {quickShare && <ShareDialog target={quickShare} kind="file" onClose={() => setQuickShare(null)} onDone={() => { setQuickShare(null); load() }} />}
            {shareFolder && <ShareDialog target={shareFolder} kind="folder" onClose={() => setShareFolder(null)} onDone={() => { setShareFolder(null); load() }} />}
        </PeopleShell>
    )
}
