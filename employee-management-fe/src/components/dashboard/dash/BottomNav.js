import React, { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAccess } from '../../../hooks/useAccess'

// Phone-only tab bar, like a native app: the four most used screens this person can open, plus
// "More", which slides the full sidebar menu in. Hidden above 768px (CSS), where the sidebar is.
const TABS = [
    { to: '/dashboard', label: 'Home', icon: 'mdi-home-variant-outline', on: 'mdi-home-variant' },
    { to: '/attendance/today', label: 'Attendance', icon: 'mdi-calendar-check-outline', on: 'mdi-calendar-check', screen: 'screen:attendance', match: '/attendance' },
    { to: '/audits', label: 'Audits', icon: 'mdi-briefcase-outline', on: 'mdi-briefcase', screen: 'screen:audits' },
    { to: '/leave', label: 'Leave', icon: 'mdi-beach', on: 'mdi-beach', screen: 'screen:leave' },
    { to: '/expenses', label: 'Expenses', icon: 'mdi-receipt-text-outline', on: 'mdi-receipt-text', screen: 'screen:expenses' },
    { to: '/helpdesk', label: 'Helpdesk', icon: 'mdi-lifebuoy', on: 'mdi-lifebuoy', screen: 'screen:helpdesk' },
    { to: '/profile', label: 'Profile', icon: 'mdi-account-circle-outline', on: 'mdi-account-circle' },
]

export const BottomNav = () => {
    const { canSee } = useAccess()
    const { pathname } = useLocation()
    const [menuOpen, setMenuOpen] = useState(false)
    const tabs = TABS.filter((t) => canSee(t.screen)).slice(0, 4)

    // mirror body.sidebar-enable (toggled here, by the header button and by the backdrop)
    useEffect(() => {
        const sync = () => setMenuOpen(document.body.classList.contains('sidebar-enable'))
        const obs = new MutationObserver(sync)
        obs.observe(document.body, { attributes: true, attributeFilter: ['class'] })
        sync()
        return () => obs.disconnect()
    }, [])

    useEffect(() => { document.body.classList.add('has-bottom-nav'); return () => document.body.classList.remove('has-bottom-nav') }, [])

    const active = (t) => (t.match ? pathname.startsWith(t.match) : t.to === '/audits' ? pathname.startsWith('/audits') : pathname === t.to || pathname.startsWith(`${t.to}/`))

    return (
        <nav className="bnav" aria-label="Main">
            {tabs.map((t) => {
                const on = !menuOpen && active(t)
                return (
                    <NavLink key={t.to} to={t.to} className={`bnav-tab ${on ? 'on' : ''}`} aria-current={on ? 'page' : undefined} onClick={() => document.body.classList.remove('sidebar-enable')}>
                        <i className={`mdi ${on ? t.on : t.icon}`}></i>
                        <span>{t.label}</span>
                    </NavLink>
                )
            })}
            <button type="button" className={`bnav-tab ${menuOpen ? 'on' : ''}`} aria-expanded={menuOpen} onClick={() => document.body.classList.toggle('sidebar-enable')}>
                <i className={`mdi ${menuOpen ? 'mdi-close' : 'mdi-view-grid-outline'}`}></i>
                <span>{menuOpen ? 'Close' : 'More'}</span>
            </button>
        </nav>
    )
}
