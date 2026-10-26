import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../people/people.css'
import './ConfirmDialog.css'

/* confirmAction(options) → Promise<boolean>
   The app's confirmation dialog (replaces window.confirm). Deletes and other irreversible actions
   ask first; important records can require the user to type a value (e.g. the employee ID).
     await confirmAction({ title, message, confirmLabel, tone: 'danger' | 'warn' | 'primary', requireText, details: [] })
   It mounts itself on demand, so no provider is needed. */

const ICON = { danger: 'mdi-delete-alert-outline', warn: 'mdi-alert-outline', primary: 'mdi-help-circle-outline' }

const Dialog = ({ title, message, details, confirmLabel, cancelLabel, tone, requireText, onDone }) => {
    const [typed, setTyped] = useState('')
    const cancelRef = useRef(null)
    const inputRef = useRef(null)
    const ok = !requireText || typed.trim().toLowerCase() === String(requireText).trim().toLowerCase()
    useEffect(() => {
        (requireText ? inputRef : cancelRef).current?.focus()
        const k = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onDone(false) } }
        window.addEventListener('keydown', k, true)
        return () => window.removeEventListener('keydown', k, true)
    }, [onDone, requireText])
    return (
        <div className="pp cf-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onDone(false) }}>
            <div className={`cf-dialog ${tone}`} role="alertdialog" aria-modal="true" aria-labelledby="cf-title" aria-describedby="cf-msg">
                <span className="cf-icon"><i className={`mdi ${ICON[tone] || ICON.danger}`}></i></span>
                <h3 id="cf-title">{title}</h3>
                {message && <p id="cf-msg">{message}</p>}
                {details?.length > 0 && <ul className="cf-details">{details.map((d) => <li key={d}>{d}</li>)}</ul>}
                {requireText && (
                    <label className="cf-type">
                        <span>Type <b>{requireText}</b> to confirm</span>
                        <input ref={inputRef} className="pp-input" value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && ok) onDone(true) }} autoComplete="off" spellCheck={false} />
                    </label>
                )}
                <div className="cf-actions">
                    <button ref={cancelRef} type="button" className="pp-btn" onClick={() => onDone(false)}>{cancelLabel}</button>
                    <button type="button" className={`pp-btn cf-go ${tone}`} disabled={!ok} onClick={() => onDone(true)}>{confirmLabel}</button>
                </div>
            </div>
        </div>
    )
}

export const confirmAction = ({ title = 'Are you sure?', message = '', details = [], confirmLabel = 'Delete', cancelLabel = 'Cancel', tone = 'danger', requireText = '' } = {}) =>
    new Promise((resolve) => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const root = createRoot(host)
        const done = (answer) => {
            root.unmount()
            host.remove()
            resolve(answer)
        }
        root.render(<Dialog title={title} message={message} details={details} confirmLabel={confirmLabel} cancelLabel={cancelLabel} tone={tone} requireText={requireText} onDone={done} />)
    })
