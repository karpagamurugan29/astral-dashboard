import React from 'react'
import '../projects/projects.css'

/* Shared bits for the Asset register and Assignments screens. */

export const ASSET_ROOT = { label: 'Assets', to: '/assets' }

export const ASSET_TYPES = [
    { value: 'Laptop', icon: 'mdi-laptop', color: '#0284c7' },
    { value: 'Desktop', icon: 'mdi-desktop-tower-monitor', color: '#7c3aed' },
    { value: 'Monitor', icon: 'mdi-monitor', color: '#0d9488' },
    { value: 'Phone', icon: 'mdi-cellphone', color: '#2563eb' },
    { value: 'ID Card', icon: 'mdi-card-account-details-outline', color: '#d97706' },
    { value: 'SIM Card', icon: 'mdi-sim-outline', color: '#db2777' },
    { value: 'Accessory', icon: 'mdi-headphones', color: '#ea580c' },
    { value: 'Other', icon: 'mdi-package-variant-closed', color: '#64748b' },
]
export const assetTypeMeta = (t) => ASSET_TYPES.find((x) => x.value === t) || ASSET_TYPES[ASSET_TYPES.length - 1]

export const ASSET_STATUS = {
    Available: { color: '#059669', icon: 'mdi-check-circle-outline' },
    Assigned: { color: '#0284c7', icon: 'mdi-account-check-outline' },
    Returned: { color: '#64748b', icon: 'mdi-keyboard-return' },
    Damaged: { color: '#e11d48', icon: 'mdi-alert-octagon-outline' },
    Retired: { color: '#334155', icon: 'mdi-archive-outline' },
}

export const AssetStatus = ({ status }) => {
    const m = ASSET_STATUS[status] || { color: '#64748b', icon: 'mdi-circle-outline' }
    return <span className="pj-pill" style={{ '--c': m.color }}><i className={`mdi ${m.icon}`}></i>{status}</span>
}

export const AssetIcon = ({ type, size = 40 }) => {
    const m = assetTypeMeta(type)
    return (
        <span className="as-icon" style={{ '--c': m.color, width: size, height: size, fontSize: Math.round(size * 0.5) }} title={m.value}>
            <i className={`mdi ${m.icon}`}></i>
        </span>
    )
}

export const since = (d) => {
    if (!d) return ''
    const days = Math.floor((Date.now() - new Date(d).getTime()) / 864e5)
    if (days < 1) return 'today'
    if (days < 30) return `${days}d`
    if (days < 365) return `${Math.floor(days / 30)}mo`
    return `${Math.floor(days / 365)}y ${Math.floor((days % 365) / 30)}mo`
}
