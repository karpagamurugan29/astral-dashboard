import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { DashNav } from '../dashboard/dash/DashNav'
import { hasRealPhoto, photoSrc } from '../../utils/photo'
import { BackButton } from '../common/BackButton'
import './people.css'

/* -------------------------------------------------------------------------- */
/*  Shared building blocks for every Employees-module screen (Directory,       */
/*  Profile, Add/Edit, Onboarding, Offboarding, Departments, Designations) so  */
/*  they look and behave as one workspace.                                     */
/* -------------------------------------------------------------------------- */

export const fullName = (p) => `${p?.firstName || ''} ${p?.lastName || ''}`.trim() || 'Unnamed'

const AVATAR_TONES = [
    ['#eef2ff', '#4f46e5'], ['#f5f3ff', '#7c3aed'], ['#e0f2fe', '#0369a1'], ['#ecfdf5', '#047857'],
    ['#fffbeb', '#b45309'], ['#fff1f2', '#be123c'], ['#ecfeff', '#0e7490'], ['#fdf4ff', '#a21caf'],
]
export const toneFor = (seed = '') => AVATAR_TONES[[...String(seed)].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_TONES.length]

// Initials when there's no photo, or when the photo can't be loaded.
export const Avatar = ({ person, size = 40, ring = false }) => {
    const name = fullName(person)
    const [bg, fg] = toneFor(name)
    const [broken, setBroken] = useState(false)
    const src = person?.profileImage
    useEffect(() => setBroken(false), [src])
    const style = { width: size, height: size, fontSize: Math.round(size * 0.38), background: bg, color: fg }
    return (
        <span className={`pp-avatar ${ring ? 'ring' : ''}`} style={style} aria-hidden="true">
            {hasRealPhoto(src) && !broken
                ? <img src={photoSrc(src)} alt="" onError={() => setBroken(true)} />
                : `${person?.firstName?.[0] || ''}${person?.lastName?.[0] || ''}`.toUpperCase() || '?'}
        </span>
    )
}

const STATUS_META = {
    Active: ['success', 'mdi-check-circle'],
    Inactive: ['muted', 'mdi-pause-circle'],
    Resigned: ['warning', 'mdi-logout-variant'],
    Terminated: ['danger', 'mdi-close-circle'],
    'In Progress': ['info', 'mdi-progress-clock'],
    Completed: ['success', 'mdi-check-circle'],
    'Not Started': ['muted', 'mdi-circle-outline'],
}
export const StatusPill = ({ status }) => {
    const [tone, icon] = STATUS_META[status] || ['muted', 'mdi-circle-outline']
    return <span className={`pp-pill ${tone}`}><i className={`mdi ${icon}`}></i>{status || '—'}</span>
}

// Employment type: each gets its own colour + icon so the column scans at a glance.
const TYPE_META = {
    Permanent: ['#059669', 'mdi-briefcase-check-outline'],
    Contract: ['#d97706', 'mdi-file-document-edit-outline'],
    Intern: ['#7c3aed', 'mdi-school-outline'],
    'Part-Time': ['#0284c7', 'mdi-clock-time-four-outline'],
}
export const TypeTag = ({ type }) => {
    if (!type) return <span className="pp-muted-dash">—</span>
    const [color, icon] = TYPE_META[type] || ['#475569', 'mdi-briefcase-outline']
    return <span className="pp-tag" style={{ '--tag': color }}><i className={`mdi ${icon}`}></i>{type}</span>
}

// Departments get a stable colour from their name.
const DEPT_COLORS = ['#0ea5e9', '#10b981', '#8b5cf6', '#f59e0b', '#f43f5e', '#14b8a6', '#f97316', '#6366f1', '#ec4899', '#84cc16']
export const deptColor = (name = '') => DEPT_COLORS[[...String(name)].reduce((s, c) => s + c.charCodeAt(0), 0) % DEPT_COLORS.length]
export const DeptTag = ({ name }) => (
    name
        ? <span className="pp-dept" style={{ '--tag': deptColor(name) }}><i></i>{name}</span>
        : <span className="pp-muted-dash">—</span>
)

export const EmptyState = ({ icon = 'mdi-account-search-outline', title, text, action }) => (
    <div className="pp-empty">
        <span className="pp-empty-icon"><i className={`mdi ${icon}`}></i></span>
        <h5>{title}</h5>
        {text && <p>{text}</p>}
        {action}
    </div>
)

export const ProgressRing = ({ value = 0, size = 52, stroke = 5, color = '#0ea5e9', children }) => {
    const r = (size - stroke) / 2
    const c = 2 * Math.PI * r
    const pct = Math.max(0, Math.min(100, value))
    return (
        <span className="pp-ring" style={{ width: size, height: size }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--pp-line)" strokeWidth={stroke} />
                <circle
                    cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
                    strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (pct / 100) * c}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dashoffset .6s ease' }}
                />
            </svg>
            <span className="pp-ring-label">{children ?? `${Math.round(pct)}%`}</span>
        </span>
    )
}

export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—')

export const tenure = (from) => {
    if (!from) return '—'
    const start = new Date(from)
    const now = new Date()
    let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth())
    if (now.getDate() < start.getDate()) months -= 1
    if (months < 1) return 'New joiner'
    const y = Math.floor(months / 12)
    const m = months % 12
    return [y && `${y}y`, m && `${m}m`].filter(Boolean).join(' ')
}

export const ErrorBanner = ({ error }) => error ? (
    <div className="pp-error" role="alert"><i className="mdi mdi-alert-circle-outline"></i>{error}</div>
) : null

/* Page frame: breadcrumb + title row with actions. */
export const PeopleShell = ({ title, subtitle, crumbs = [], actions, children, backTo = '/dashboard', root = { label: 'Employees', to: '/employees' } }) => (
    <DashNav>
        <div className="page-content pp">
            <div className="container-fluid">
                <header className="pp-header">
                    <div className="pp-head-main">
                        <BackButton fallback={backTo} compact />
                        <div className="pp-titles" title={subtitle}>
                            <nav className="pp-crumbs" aria-label="Breadcrumb">
                                <Link to={root.to}>{root.label}</Link>
                                {crumbs.slice(0, -1).map((c) => (
                                    <React.Fragment key={c.label}>
                                        <i className="mdi mdi-chevron-right"></i>
                                        {c.to ? <Link to={c.to}>{c.label}</Link> : <span>{c.label}</span>}
                                    </React.Fragment>
                                ))}
                                <i className="mdi mdi-chevron-right"></i>
                            </nav>
                            <h1>{title}</h1>
                        </div>
                    </div>
                    {actions && <div className="pp-header-actions">{actions}</div>}
                </header>

                {children}
            </div>
        </div>
    </DashNav>
)
