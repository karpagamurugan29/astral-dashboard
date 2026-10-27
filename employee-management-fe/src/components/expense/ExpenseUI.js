import React, { useEffect, useState } from 'react'
import { API_URL } from '../../utils/Constants'
import { fileBlobUrl } from '../chat/chatApi'
import './expense.css'

/* -------------------------------------------------------------------------- */
/*  Shared bits for My expenses and Expense approvals.                        */
/* -------------------------------------------------------------------------- */

export const EXPENSE_ROOT = { label: 'Expenses', to: '/expenses' }

export const CATEGORIES = [
    { value: 'Travel', icon: 'mdi-airplane', color: '#0284c7' },
    { value: 'Food', icon: 'mdi-food', color: '#ea580c' },
    { value: 'Accommodation', icon: 'mdi-bed-outline', color: '#7c3aed' },
    { value: 'Transportation', icon: 'mdi-car-outline', color: '#2563eb' },
    { value: 'Office Supplies', icon: 'mdi-paperclip', color: '#0d9488' },
    { value: 'Software', icon: 'mdi-laptop', color: '#4f46e5' },
    { value: 'Client Entertainment', icon: 'mdi-glass-cocktail', color: '#db2777' },
    { value: 'Other', icon: 'mdi-dots-horizontal-circle-outline', color: '#64748b' },
]
export const categoryMeta = (c) => CATEGORIES.find((x) => x.value === c) || CATEGORIES[CATEGORIES.length - 1]

const STATUS = {
    Draft: { color: '#64748b', icon: 'mdi-pencil-outline' },
    Pending: { color: '#d97706', icon: 'mdi-timer-sand' },
    'Changes Requested': { color: '#ea580c', icon: 'mdi-pencil-circle-outline' },
    Approved: { color: '#0284c7', icon: 'mdi-check-circle-outline' },
    Processing: { color: '#7c3aed', icon: 'mdi-progress-clock' },
    Rejected: { color: '#e11d48', icon: 'mdi-close-circle-outline' },
    Reimbursed: { color: '#059669', icon: 'mdi-cash-check' },
}
export const expenseStatusMeta = (s) => STATUS[s] || { color: '#64748b', icon: 'mdi-circle-outline' }
export const EXPENSE_STATUSES = Object.keys(STATUS)

export const ExpenseStatus = ({ status }) => {
    const m = expenseStatusMeta(status)
    return <span className="ex-status" style={{ '--c': m.color }}><i className={`mdi ${m.icon}`}></i>{status}</span>
}

export const CategoryIcon = ({ category, size = 40 }) => {
    const m = categoryMeta(category)
    return (
        <span className="ex-cat-icon" style={{ '--c': m.color, width: size, height: size, fontSize: Math.round(size * 0.48) }} title={m.value}>
            <i className={`mdi ${m.icon}`}></i>
        </span>
    )
}

export const CategoryTag = ({ category }) => {
    const m = categoryMeta(category)
    return <span className="pp-tag" style={{ '--tag': m.color }}><i className={`mdi ${m.icon}`}></i>{m.value}</span>
}

const SERVER_ORIGIN = API_URL.replace(/\/api$/, '')
export const receiptHref = (url) => (url ? (/^https?:\/\//.test(url) ? url : `${SERVER_ORIGIN}${url}`) : null)
export const isImage = (url) => /\.(png|jpe?g|gif|webp)$/i.test(url || '')

// New bills are private (/expenses/:id/receipt/…): fetch them with the login token.
const isPrivate = (url) => /^\/expenses\//.test(url || '')
export const useReceiptSrc = (url) => {
    const [src, setSrc] = useState(isPrivate(url) ? null : receiptHref(url))
    useEffect(() => {
        if (!isPrivate(url)) { setSrc(receiptHref(url)); return undefined }
        let live = true
        fileBlobUrl(url).then((u) => live && setSrc(u)).catch(() => live && setSrc(null))
        return () => { live = false }
    }, [url])
    return src
}

export const ReceiptThumb = ({ url }) => {
    const src = useReceiptSrc(url)
    if (!src) return <span className="ea-thumb-link" title="Loading bill"><i className="mdi mdi-loading mdi-spin"></i></span>
    return isImage(url)
        ? <a href={src} target="_blank" rel="noreferrer" title="Open bill"><img className="ea-thumb" src={src} alt="Bill" /></a>
        : <a className="ea-thumb-link" href={src} target="_blank" rel="noreferrer" title="Open bill"><i className="mdi mdi-file-pdf-box"></i></a>
}

export const ReceiptLink = ({ url, compact = false }) => {
    const href = useReceiptSrc(url)
    if (!url) return <span className="ex-noreceipt" title="No bill attached"><i className="mdi mdi-receipt"></i>{!compact && 'No bill'}</span>
    return (
        <a className="ex-receipt" href={href || undefined} target="_blank" rel="noreferrer" title="Open bill in a new tab" onClick={(e) => { e.stopPropagation(); if (!href) e.preventDefault() }}>
            <i className={`mdi ${/\.pdf$/i.test(url) ? 'mdi-file-pdf-box' : 'mdi-image-outline'}`}></i>{!compact && 'View bill'}
        </a>
    )
}

// Claims for approvers come back for everyone; this tells mine apart.
export const ownerId = (ex) => ex.employeeId?._id || ex.employeeId
