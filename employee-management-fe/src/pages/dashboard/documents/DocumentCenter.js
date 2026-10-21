import React, { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import documentActions from '../../../redux/document/Actions'
import employeeActions from '../../../redux/employee/Actions'
import { PeopleShell, Avatar, ErrorBanner, fullName } from '../../../components/people/PeopleUI'
import { DocUploadForm, DocList, DOC_CATEGORIES } from '../../../components/documents/EmployeeDocs'
import { useAccess } from '../../../hooks/useAccess'

// Employee documents, filed by employee ID. Everyone sees their own files and company-wide
// policies; managers also see the people in their reporting line; HR / Admin / Directors /
// Partners see everyone. The server enforces this on the list and on every file download.
export const DocumentCenter = () => {
    const dispatch = useDispatch()
    const { user } = useAccess()
    const { list, meta, uploading, error } = useSelector((state) => state.documentReducer || {})
    const { list: employees } = useSelector((state) => state.employeeReducer || {})
    const [owner, setOwner] = useState('')
    const [q, setQ] = useState('')
    const [cat, setCat] = useState('')
    const [who, setWho] = useState('')
    const [showForm, setShowForm] = useState(false)
    const forOthers = !!meta?.canUploadForOthers
    const me = user?._id

    useEffect(() => { dispatch({ type: documentActions.GET_DOCUMENTS }) }, [dispatch])
    useEffect(() => { if (forOthers && !employees?.length) dispatch({ type: employeeActions.GET_EMPLOYEES }) }, [forOthers, employees?.length, dispatch])

    const owners = useMemo(() => (employees || []).filter((e) => e.status !== 'Inactive').sort((a, b) => String(a.employeeId).localeCompare(String(b.employeeId), undefined, { numeric: true })), [employees])

    const filtered = useMemo(() => {
        const needle = q.trim().toLowerCase()
        return (list || []).filter((d) => {
            if (cat && d.category !== cat) return false
            const oid = d.employeeId?._id || ''
            if (who === 'company' ? d.employeeId : who && oid !== who) return false
            if (!needle) return true
            const o = d.employeeId || {}
            return [d.title, d.category, d.documentNumber, d.fileName, d.employeeCode, o.employeeId, o.firstName, o.lastName].some((v) => String(v || '').toLowerCase().includes(needle))
        })
    }, [list, q, cat, who])

    // group by owner (employee ID order), company-wide first
    const groups = useMemo(() => {
        const map = new Map()
        filtered.forEach((d) => {
            const k = d.employeeId?._id || 'company'
            if (!map.has(k)) map.set(k, { key: k, owner: d.employeeId || null, docs: [] })
            map.get(k).docs.push(d)
        })
        return [...map.values()].sort((a, b) => (a.key === 'company' ? -1 : b.key === 'company' ? 1 : a.key === me ? -1 : b.key === me ? 1 : String(a.owner?.employeeId).localeCompare(String(b.owner?.employeeId), undefined, { numeric: true })))
    }, [filtered, me])

    const peopleInList = useMemo(() => {
        const m = new Map()
        ;(list || []).forEach((d) => d.employeeId?._id && m.set(d.employeeId._id, d.employeeId))
        return [...m.values()].sort((a, b) => String(a.employeeId).localeCompare(String(b.employeeId), undefined, { numeric: true }))
    }, [list])

    const soon = (list || []).filter((d) => d.expiryDate && (new Date(d.expiryDate) - new Date()) / 864e5 <= 30).length
    const mine = (list || []).filter((d) => d.employeeId?._id === me).length

    const upload = (doc) => new Promise((resolve) => {
        dispatch({ type: documentActions.UPLOAD_DOCUMENT, payload: { doc, employeeId: forOthers ? owner : undefined }, onDone: (ok) => { resolve(ok); if (ok) setShowForm(false) } })
    })
    const canDelete = (d) => forOthers || (d.employeeId?._id === me && (d.uploadedBy?._id || d.uploadedBy) === me)
    const onDelete = (d) => { if (window.confirm(`Delete "${d.title}"? This can't be undone.`)) dispatch({ type: documentActions.DELETE_DOCUMENT, id: d._id }) }

    return (
        <PeopleShell title="Documents" crumbs={[{ label: 'Documents' }]}
            actions={<button type="button" className="pp-btn primary" onClick={() => setShowForm((s) => !s)}><i className={`mdi ${showForm ? 'mdi-close' : 'mdi-plus'}`}></i>{showForm ? 'Close' : 'Add document'}</button>}>
            <ErrorBanner error={error} />
            <div className="dc-page">
                <div className="dc-scope">
                    <i className="mdi mdi-shield-lock-outline"></i>
                    {meta?.seesAll
                        ? 'You can see every employee’s documents. Each file opens only for the employee, their reporting managers and HR.'
                        : 'You see your own documents, company policies and those of people who report to you. Files never open for anyone else.'}
                </div>

                <div className="dc-stats">
                    <div className="dc-stat"><i className="mdi mdi-file-document-multiple-outline" style={{ background: '#e0f2fe', color: '#0369a1' }}></i><div><b>{list?.length || 0}</b><small>Documents you can see</small></div></div>
                    <div className="dc-stat"><i className="mdi mdi-account-outline" style={{ background: '#f5f3ff', color: '#6d28d9' }}></i><div><b>{mine}</b><small>Your documents</small></div></div>
                    <div className="dc-stat"><i className="mdi mdi-account-group-outline" style={{ background: '#ecfdf5', color: '#047857' }}></i><div><b>{peopleInList.length}</b><small>Employees with files</small></div></div>
                    <div className="dc-stat"><i className="mdi mdi-calendar-alert" style={{ background: '#fffbeb', color: '#b45309' }}></i><div><b>{soon}</b><small>Expired / expiring in 30d</small></div></div>
                </div>

                {showForm && (
                    <section className="pp-card">
                        <div className="pp-card-head"><div><h3>Add a document</h3><p>{forOthers ? 'Pick the employee by ID — the file is saved to their record.' : 'Saved to your own record.'}</p></div></div>
                        <div className="pp-card-body">
                            <DocUploadForm owners={forOthers ? owners : null} ownerId={owner} onOwnerChange={setOwner} onSubmit={upload} busy={uploading} />
                        </div>
                    </section>
                )}

                <section className="pp-card">
                    <div className="pp-card-body">
                        <div className="dc-toolbar">
                            <input className="pp-input dc-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, number, employee ID or name…" />
                            <select className="pp-input" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Type">
                                <option value="">All types</option>
                                {DOC_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                            </select>
                            {peopleInList.length > 1 && (
                                <select className="pp-input" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Employee">
                                    <option value="">All employees</option>
                                    <option value="company">Company-wide</option>
                                    {peopleInList.map((p) => <option key={p._id} value={p._id}>{p.employeeId} · {fullName(p)}</option>)}
                                </select>
                            )}
                        </div>

                        {!groups.length ? (
                            <DocList docs={[]} empty={list?.length ? 'Nothing matches these filters.' : 'No documents yet. Use “Add document” to upload one.'} />
                        ) : groups.map((g) => (
                            <div key={g.key} className="dc-group">
                                <div className="dc-group-head">
                                    {g.owner ? (
                                        <Link to={`/employees/${g.owner._id}`} className="d-flex align-items-center gap-2">
                                            <Avatar person={g.owner} size={30} />
                                            <span><b>{g.owner.employeeId} · {fullName(g.owner)}{g.key === me ? ' (you)' : ''}</b><br /><small>{[g.owner.designation, g.owner.department].filter(Boolean).join(' · ')}</small></span>
                                        </Link>
                                    ) : (
                                        <span><b><i className="mdi mdi-domain me-1"></i>Company-wide</b><br /><small>Policies everyone can read</small></span>
                                    )}
                                    <span className="dc-count">{g.docs.length}</span>
                                </div>
                                <DocList docs={g.docs} canDelete={canDelete} onDelete={onDelete} />
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </PeopleShell>
    )
}
