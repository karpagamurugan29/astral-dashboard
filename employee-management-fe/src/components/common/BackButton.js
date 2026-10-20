import React from 'react'
import { useNavigate } from 'react-router-dom'
import './BackButton.css'

// Goes to the previous page in this tab. If the page was opened directly (no in-app
// history — new tab, bookmark, refresh-then-back), falls back to a sensible parent.
export const BackButton = ({ fallback = '/dashboard', label = 'Back', className = '', compact = true }) => {
    const navigate = useNavigate()

    const onBack = () => {
        const idx = window.history.state?.idx
        if (typeof idx === 'number' && idx > 0) navigate(-1)
        else navigate(fallback, { replace: true })
    }

    return (
        <button type="button" className={`hk-back ${compact ? 'compact' : ''} ${className}`} onClick={onBack} aria-label={label} title={label}>
            <i className="mdi mdi-arrow-left"></i>
            {!compact && <span>{label}</span>}
        </button>
    )
}
