import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import './Toaster.css'

/* One app-wide toaster. Use it only for results the person needs to know about
   (saved, deleted, started, failed) — not for every request.
   toast.success('Task added') · toast.error(err.message) · toast.info('…', { title, duration })
   Add { action: { label: 'Undo', onClick } } for a button that reverses what just happened. */

let listeners = []
let seq = 0
const emit = (kind, text, opts = {}) => {
    if (!text) return
    const t = { id: ++seq, kind, text: String(text), title: opts.title, action: opts.action, duration: opts.duration ?? (opts.action ? 6500 : kind === 'error' ? 6000 : 3800) }
    listeners.forEach((l) => l(t))
}
export const toast = {
    success: (text, opts) => emit('success', text, opts),
    error: (text, opts) => emit('error', text, opts),
    info: (text, opts) => emit('info', text, opts),
    warning: (text, opts) => emit('warning', text, opts),
}

const ICON = { success: 'mdi-check-circle', error: 'mdi-alert-circle', info: 'mdi-information', warning: 'mdi-alert' }
const TITLE = { success: 'Done', error: 'Something went wrong', info: 'Heads up', warning: 'Please check' }

const Toast = ({ t, onClose }) => {
    const [leaving, setLeaving] = useState(false)
    const [paused, setPaused] = useState(false)
    useEffect(() => {
        if (paused) return undefined
        const h = setTimeout(() => setLeaving(true), t.duration)
        return () => clearTimeout(h)
    }, [paused, t.duration])
    useEffect(() => { if (!leaving) return undefined; const h = setTimeout(onClose, 220); return () => clearTimeout(h) }, [leaving, onClose])
    return (
        <div className={`tst tst-${t.kind}${leaving ? ' out' : ''}${paused ? ' paused' : ''}`} role={t.kind === 'error' ? 'alert' : 'status'}
            onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} style={{ '--d': `${t.duration}ms` }}>
            <span className="tst-ic"><i className={`mdi ${ICON[t.kind]}`}></i></span>
            <div className="tst-body"><b>{t.title || TITLE[t.kind]}</b><p>{t.text}</p></div>
            {t.action && <button type="button" className="tst-action" onClick={() => { t.action.onClick(); setLeaving(true) }}>{t.action.label}</button>}
            <button type="button" className="tst-x" onClick={() => setLeaving(true)} aria-label="Dismiss"><i className="mdi mdi-close"></i></button>
            <i className="tst-bar"></i>
        </div>
    )
}

export const Toaster = () => {
    const [items, setItems] = useState([])
    useEffect(() => {
        const add = (t) => setItems((list) => [...list.filter((x) => x.text !== t.text), t].slice(-4))
        listeners.push(add)
        return () => { listeners = listeners.filter((l) => l !== add) }
    }, [])
    if (!items.length) return null
    return createPortal(
        <div className="tst-stack" aria-live="polite">
            {items.map((t) => <Toast key={t.id} t={t} onClose={() => setItems((list) => list.filter((x) => x.id !== t.id))} />)}
        </div>,
        document.body
    )
}
