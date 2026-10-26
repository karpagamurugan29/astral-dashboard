import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import '../../pages/dashboard/projects/ProjectWorkspace.css'
import './FormModal.css'

/* Add / edit forms open in a dialog: title at the top, the fields scroll, Cancel / Save stay visible
   at the bottom. The dialog itself is the <form>, so Enter submits and the footer buttons belong to it.
   Same look as the app's other dialogs (pw-dialog); on phones it slides up from the bottom. */
export const FormModal = ({ title, sub, icon, onClose, onSubmit, children, submitLabel = 'Save', submitIcon = 'mdi-check', busy = false, disabled = false, size = '', footerExtra = null, hideSubmit = false }) => {
    // pages often pass an inline onClose; keep the latest in a ref so the listener is set up once
    const closeRef = useRef(onClose)
    closeRef.current = onClose
    useEffect(() => {
        const depth = (Number(document.body.dataset.fmOpen) || 0) + 1
        const k = (e) => { if (e.key === 'Escape' && (Number(document.body.dataset.fmOpen) || 0) === depth) closeRef.current() }
        window.addEventListener('keydown', k)
        // count open dialogs so closing a nested one doesn't unlock scrolling under the outer one
        const b = document.body
        b.dataset.fmOpen = String((Number(b.dataset.fmOpen) || 0) + 1)
        b.classList.add('fm-open')
        return () => {
            window.removeEventListener('keydown', k)
            const n = Math.max(0, (Number(b.dataset.fmOpen) || 1) - 1)
            b.dataset.fmOpen = String(n)
            if (!n) b.classList.remove('fm-open')
        }
    }, [])
    return createPortal(
        <div className="pp pw-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
            <form className={`pw-dialog fm-dialog ${size}`} onSubmit={onSubmit} noValidate role="dialog" aria-modal="true" aria-label={title}>
                <header className="pw-dialog-head">
                    {icon && <span className="fm-icon"><i className={`mdi ${icon}`}></i></span>}
                    <div><b>{title}</b>{sub && <small>{sub}</small>}</div>
                    <button type="button" className="pw-x" onClick={onClose} aria-label="Close"><i className="mdi mdi-close"></i></button>
                </header>
                <div className="pw-dialog-body fm-body">{children}</div>
                <footer className="pw-dialog-foot">
                    {footerExtra}
                    <span className="fm-spacer"></span>
                    <button type="button" className="pp-btn" onClick={onClose}>Cancel</button>
                    {!hideSubmit && <button type="submit" className="pp-btn primary" disabled={busy || disabled}>{busy ? <i className="mdi mdi-loading mdi-spin"></i> : <i className={`mdi ${submitIcon}`}></i>}{submitLabel}</button>}
                </footer>
            </form>
        </div>,
        document.body
    )
}
