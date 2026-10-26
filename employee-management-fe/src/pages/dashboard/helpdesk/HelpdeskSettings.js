import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PeopleShell, EmptyState, ErrorBanner } from '../../../components/people/PeopleUI'
import { toast } from '../../../components/common/Toaster'
import { api, HELPDESK_ROOT, PRIORITY, useTicketMeta, invalidateTicketMeta } from '../../../components/helpdesk/HelpdeskUI'

/* Helpdesk settings (HR / Admin): categories — add, rename, disable, reorder, confidential,
   default assignee, SLA overrides — plus SLA targets, attachments and closure rules. */

const PRIOS = Object.keys(PRIORITY)
const ICONS = ['mdi-cash-multiple', 'mdi-clock-outline', 'mdi-beach', 'mdi-heart-pulse', 'mdi-file-document-outline', 'mdi-account-switch-outline', 'mdi-account-alert-outline', 'mdi-laptop', 'mdi-book-open-variant', 'mdi-help-circle-outline', 'mdi-school-outline', 'mdi-car-outline', 'mdi-home-city-outline', 'mdi-shield-account-outline']

export const HelpdeskSettings = () => {
    const meta = useTicketMeta()
    const [s, setS] = useState(null)
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(false)
    const [openCat, setOpenCat] = useState(null)
    useEffect(() => { api('GET', '/helpdesk/settings').then((j) => setS(j.data)).catch((e) => setError(e.message)) }, [])

    if (error && !s) return <PeopleShell title="Helpdesk settings" root={HELPDESK_ROOT} crumbs={[{ label: 'HR tickets', to: '/helpdesk/all' }, { label: 'Settings' }]} backTo="/helpdesk/all"><div className="pp-card"><EmptyState icon="mdi-lock-outline" title="Can't open settings" text={error} action={<Link to="/helpdesk" className="pp-btn">Back</Link>} /></div></PeopleShell>
    if (!s) return <PeopleShell title="Helpdesk settings" root={HELPDESK_ROOT} crumbs={[{ label: 'Settings' }]} backTo="/helpdesk/all"><div className="pp-card"><div className="hd-loading"><div className="pp-skel"></div><div className="pp-skel"></div></div></div></PeopleShell>

    const cats = s.categories
    const setCat = (i, patch) => setS((x) => ({ ...x, categories: x.categories.map((c, j) => (j === i ? { ...c, ...patch } : c)) }))
    const moveCat = (i, d) => setS((x) => { const c = [...x.categories]; const [m] = c.splice(i, 1); c.splice(i + d, 0, m); return { ...x, categories: c } })
    const addCat = () => { setS((x) => ({ ...x, categories: [...x.categories, { key: '', name: '', icon: 'mdi-help-circle-outline', color: '#4f46e5', hint: '', active: true, confidential: false, sla: {} }] })); setOpenCat(cats.length) }
    const setSla = (p, k, v) => setS((x) => ({ ...x, sla: { ...x.sla, [p]: { ...x.sla[p], [k]: v } } }))
    const save = async () => {
        setBusy(true)
        try {
            const j = await api('PUT', '/helpdesk/settings', { ...s, attachments: { ...s.attachments, types: typeof s.attachments.types === 'string' ? s.attachments.types.split(/[\s,]+/) : s.attachments.types } })
            setS((x) => ({ ...x, ...j.data })); invalidateTicketMeta(); toast.success(j.message)
        } catch (e) { toast.error(e.message) } finally { setBusy(false) }
    }

    return (
        <PeopleShell title="Helpdesk settings" root={HELPDESK_ROOT} crumbs={[{ label: 'HR tickets', to: '/helpdesk/all' }, { label: 'Settings' }]} backTo="/helpdesk/all"
            actions={<button type="button" className="pp-btn primary" onClick={save} disabled={busy}>{busy ? <i className="mdi mdi-loading mdi-spin"></i> : <i className="mdi mdi-content-save-outline"></i>}Save settings</button>}>
            <ErrorBanner error={error} />
            <div className="hd-set">
                <section className="pp-card hd-setcard">
                    <header><div><h3>Categories</h3><small>Reorder with the arrows. Disabled categories stay on existing tickets but can't be picked for new ones.</small></div><button type="button" className="pp-btn sm" onClick={addCat}><i className="mdi mdi-plus"></i>Add category</button></header>
                    <ul className="hd-catlist">{cats.map((c, i) => (
                        <li key={c.key || `new${i}`} className={`${c.active ? '' : 'off'} ${openCat === i ? 'open' : ''}`}>
                            <div className="row1">
                                <span className="hd-caticon" style={{ '--c': c.color, width: 30, height: 30, fontSize: 16 }}><i className={`mdi ${c.icon}`}></i></span>
                                <input className="pp-input name" value={c.name} onChange={(e) => setCat(i, { name: e.target.value })} placeholder="Category name" aria-label="Category name" />
                                <small className="use">{s.usage?.[c.name] || 0} ticket{s.usage?.[c.name] === 1 ? '' : 's'}</small>
                                {c.confidential && <span className="hd-conf"><i className="mdi mdi-shield-lock-outline"></i>HR only</span>}
                                <label className="hd-switch" title={c.active ? 'Active' : 'Disabled'}><input type="checkbox" checked={c.active} onChange={(e) => setCat(i, { active: e.target.checked })} /><span></span></label>
                                <button type="button" className="ic" disabled={i === 0} onClick={() => moveCat(i, -1)} aria-label="Move up"><i className="mdi mdi-arrow-up"></i></button>
                                <button type="button" className="ic" disabled={i === cats.length - 1} onClick={() => moveCat(i, 1)} aria-label="Move down"><i className="mdi mdi-arrow-down"></i></button>
                                <button type="button" className="ic" onClick={() => setOpenCat(openCat === i ? null : i)} aria-label="More settings" aria-expanded={openCat === i}><i className={`mdi ${openCat === i ? 'mdi-chevron-up' : 'mdi-tune-variant'}`}></i></button>
                                {!c.key && !s.usage?.[c.name] && <button type="button" className="ic" onClick={() => setS((x) => ({ ...x, categories: x.categories.filter((_, j) => j !== i) }))} aria-label="Remove"><i className="mdi mdi-delete-outline"></i></button>}
                            </div>
                            {openCat === i && (
                                <div className="more">
                                    <label>Hint<input className="pp-input" value={c.hint || ''} maxLength={120} onChange={(e) => setCat(i, { hint: e.target.value })} placeholder="Shown under the name when raising a ticket" /></label>
                                    <label>Colour<input type="color" value={c.color} onChange={(e) => setCat(i, { color: e.target.value })} /></label>
                                    <div className="icons"><span>Icon</span>{ICONS.map((ic) => <button key={ic} type="button" className={c.icon === ic ? 'on' : ''} onClick={() => setCat(i, { icon: ic })} aria-label={ic}><i className={`mdi ${ic}`}></i></button>)}</div>
                                    <label className="chk"><input type="checkbox" checked={!!c.confidential} onChange={(e) => setCat(i, { confidential: e.target.checked })} />Confidential — only HR and the assignee see these (not managers)</label>
                                    <label>Assign new tickets to<select className="pp-select" value={c.defaultAssignee || ''} onChange={(e) => setCat(i, { defaultAssignee: e.target.value || null })}><option value="">Nobody — HR assigns</option>{(meta?.agents || []).map((a) => <option key={a._id} value={a._id}>{a.name} — {a.designation}</option>)}</select></label>
                                    <div className="slaover"><span>Resolution target override (hours)</span>{PRIOS.map((p) => <label key={p}>{p}<input type="number" min="0" className="pp-input" value={c.sla?.[p] || ''} placeholder={String(s.sla[p].resolution)} onChange={(e) => setCat(i, { sla: { ...c.sla, [p]: e.target.value } })} /></label>)}</div>
                                </div>
                            )}
                        </li>
                    ))}</ul>
                </section>

                <div className="hd-setside">
                    <section className="pp-card hd-setcard">
                        <header><div><h3>SLA targets</h3><small>Hours from when a ticket is raised. The clock pauses while waiting on the employee.</small></div></header>
                        <table className="hd-slat"><thead><tr><th>Priority</th><th>First response</th><th>Resolution</th></tr></thead>
                            <tbody>{PRIOS.map((p) => <tr key={p}><td><span className="hd-prio" style={{ '--c': PRIORITY[p].color }}><i className={`mdi ${PRIORITY[p].icon}`}></i>{p}</span></td><td><input type="number" min="0.25" step="0.25" className="pp-input" value={s.sla[p].response} onChange={(e) => setSla(p, 'response', e.target.value)} />h</td><td><input type="number" min="0.5" step="0.5" className="pp-input" value={s.sla[p].resolution} onChange={(e) => setSla(p, 'resolution', e.target.value)} />h</td></tr>)}</tbody>
                        </table>
                        <label className="hd-setrow">Remind the assignee when<span><input type="number" min="50" max="95" className="pp-input" value={Math.round(s.reminderAt * 100)} onChange={(e) => setS({ ...s, reminderAt: Number(e.target.value) / 100 })} />% of the time is used</span></label>
                        <label className="hd-setrow chk"><input type="checkbox" checked={!!s.autoEscalate} onChange={(e) => setS({ ...s, autoEscalate: e.target.checked })} />Escalate overdue tickets, and critical ones not answered in time</label>
                    </section>
                    <section className="pp-card hd-setcard">
                        <header><div><h3>Closure &amp; reopening</h3></div></header>
                        <label className="hd-setrow">Employees may reopen within<span><input type="number" min="0" max="90" className="pp-input" value={s.reopenDays} onChange={(e) => setS({ ...s, reopenDays: e.target.value })} />days, up to <input type="number" min="0" max="10" className="pp-input" value={s.maxReopens} onChange={(e) => setS({ ...s, maxReopens: e.target.value })} />times</span></label>
                        <label className="hd-setrow">Close resolved tickets automatically after<span><input type="number" min="0" max="60" className="pp-input" value={s.autoCloseDays} onChange={(e) => setS({ ...s, autoCloseDays: e.target.value })} />days (0 = never)</span></label>
                    </section>
                    <section className="pp-card hd-setcard">
                        <header><div><h3>Attachments</h3></div></header>
                        <label className="hd-setrow">Max size per file<span><input type="number" min="1" max="20" className="pp-input" value={s.attachments.maxSizeMB} onChange={(e) => setS({ ...s, attachments: { ...s.attachments, maxSizeMB: e.target.value } })} />MB, up to <input type="number" min="1" max="10" className="pp-input" value={s.attachments.maxFiles} onChange={(e) => setS({ ...s, attachments: { ...s.attachments, maxFiles: e.target.value } })} />files</span></label>
                        <label className="hd-setrow col">Allowed file types<input className="pp-input" value={Array.isArray(s.attachments.types) ? s.attachments.types.join(', ') : s.attachments.types} onChange={(e) => setS({ ...s, attachments: { ...s.attachments, types: e.target.value } })} /></label>
                    </section>
                </div>
            </div>
        </PeopleShell>
    )
}
