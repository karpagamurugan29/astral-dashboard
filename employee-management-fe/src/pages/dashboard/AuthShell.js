import React, { useEffect } from 'react'
import { Link } from 'react-router-dom'
import './Login.css'

// Shared frame for the sign-in pages (login, forgot password, reset password).
// Laptop: one corporate card on a light grey page — brand panel with the animated Astral
// emblem and the welcome on the left, the form on the right.
// Phone: app-style — the animated emblem on top, the form in a bottom sheet.

const Brand = () => (
    <Link to="/" className="lg-brandmark" aria-label="Astral Consulting Limited">
        <span className="lg-mark"><img src="assets/images/astral-mark.png" alt="" /></span>
        <span className="lg-word"><b>Astral</b><small>Consulting Limited</small></span>
    </Link>
)

// The animated Astral emblem: the star in a tile with slowly turning orbit rings.
export const Emblem = ({ size = 'md' }) => (
    <div className={`lg-emblem ${size}`} aria-hidden="true">
        <span className="lg-glow"></span>
        <span className="lg-ring r1"><i></i></span>
        <span className="lg-ring r2"><i></i><i></i></span>
        <span className="lg-ring r3"><i></i></span>
        <span className="lg-emblem-core"><img src="assets/images/astral-mark.png" alt="" /></span>
    </div>
)

export const AuthShell = ({ side, children }) => {
    // phones: match the status bar to the light page
    useEffect(() => {
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#f4f6fa')
    }, [])

    return (
        <div className="lg-page">
            <div className="lg-bg" aria-hidden="true"><i></i><i></i></div>
            <div className="lg-frame">
                <aside className="lg-brand">
                    <div className="lg-brand-top">
                        <Brand />
                        <span className="lg-est">Est. 1982</span>
                    </div>
                    <div className="lg-brand-emblem"><Emblem size="lg" /></div>
                    <div className="lg-brand-body">{side}</div>
                    <div className="lg-brand-foot">
                        <span><i className="mdi mdi-lock-outline"></i>Private workspace for Astral staff</span>
                        <span><i className="mdi mdi-shield-check-outline"></i>Role-based access</span>
                    </div>
                </aside>

                <main className="lg-main">
                    <div className="lg-app-hero">
                        <Emblem />
                        <h1>Astral Workspace</h1>
                        <p>Audit · Assurance · Advisory</p>
                        <span className="lg-hero-tag"><i className="mdi mdi-check-decagram"></i>Chartered Accountants since 1982</span>
                    </div>
                    <div className="lg-card">
                        <span className="lg-grabber" aria-hidden="true"></span>
                        <span className="lg-secure-pill"><i className="mdi mdi-shield-lock-outline"></i>Secure staff sign-in</span>
                        {children}
                        <p className="lg-foot">© {new Date().getFullYear()} Astral Consulting Limited · Chartered Accountants &amp; Management Consultants</p>
                    </div>
                </main>
            </div>
        </div>
    )
}
