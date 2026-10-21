import React, { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import authActions from '../../../redux/auth/Actions';
import notificationActions from '../../../redux/notification/Actions';
import roleActions from '../../../redux/role/Actions';
import announcementActions from '../../../redux/announcement/Actions';
import { useChatUnread } from '../../../hooks/useChatUnread';
import '../../../pages/dashboard/chat/Chat.css';

// Header colour themes, picked from the palette menu and remembered per browser.
const HEADER_THEMES = [
    { key: 'ocean', label: 'Ocean', dark: true, swatch: 'linear-gradient(100deg, #0b4f8a, #0ea5e9)' },
    { key: 'royal', label: 'Royal', dark: true, swatch: 'linear-gradient(100deg, #1e1b4b, #2563eb)' },
    { key: 'midnight', label: 'Midnight', dark: true, swatch: 'linear-gradient(100deg, #0b0f19, #1f2937)' },
    { key: 'astral', label: 'Astral Red', dark: true, swatch: 'linear-gradient(100deg, #450a0a, #b91c1c)' },
    { key: 'lavender', label: 'Lavender', dark: false, swatch: 'linear-gradient(90deg, #f3f0ff, #e8f4ff)' },
    { key: 'clean', label: 'Clean', dark: false, swatch: '#ffffff' },
]
const THEME_KEY = 'headerThemeV2'
const readTheme = () => { try { return localStorage.getItem(THEME_KEY) || 'clean' } catch { return 'clean' } }

export const TopHeader = () => {
    const [headerTheme, setHeaderTheme] = useState(readTheme)
    useEffect(() => {
        const t = HEADER_THEMES.find((x) => x.key === headerTheme) || HEADER_THEMES.find((x) => x.key === 'clean')
        document.body.setAttribute('data-header-theme', t.key)
        document.body.setAttribute('data-topbar', t.dark ? 'dark' : 'light')
        document.body.classList.toggle('header-dark', t.dark)
        document.body.classList.toggle('header-light', !t.dark)
        try { localStorage.setItem(THEME_KEY, t.key) } catch { /* private mode: just not remembered */ }
    }, [headerTheme])

    const navigate = useNavigate()
    const dispatch = useDispatch()
    const hasSession = localStorage.getItem('session')
    const { list: notifications, unreadCount } = useSelector((state) => state.notificationReducer || {})
    const { list: announcements } = useSelector((state) => state.announcementReducer || {})
    // Announcements are "new" until this browser has opened the megaphone menu after they were posted.
    const [annSeenAt, setAnnSeenAt] = useState(() => { try { return Number(localStorage.getItem('announcementsSeenAt')) || 0 } catch { return 0 } })
    const newAnnouncements = (announcements || []).filter((a) => new Date(a.createdAt).getTime() > annSeenAt).length
    const markAnnouncementsSeen = () => {
        const t = Date.now()
        setAnnSeenAt(t)
        try { localStorage.setItem('announcementsSeenAt', String(t)) } catch { /* not remembered in private mode */ }
    }
    // The logged-in person, filled by the session check / login.
    const { isAuthenticated: user } = useSelector((state) => state.authReducer || {})
    const fullName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim()
    const shortName = [user?.firstName, user?.lastName ? `${user.lastName[0]}.` : ''].filter(Boolean).join(' ')
    const initials = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase()
    // Seed data points everyone at the same stock photo — treat that as "no photo".
    const hasPhoto = user?.profileImage && !/avatar-\d+\.jpg$/.test(user.profileImage)

    useEffect(() => {
        dispatch({ type: notificationActions.GET_NOTIFICATIONS })
        dispatch({ type: announcementActions.GET_ANNOUNCEMENTS })
        dispatch({ type: roleActions.GET_MY_PERMISSIONS })
        const interval = setInterval(() => {
            dispatch({ type: notificationActions.GET_NOTIFICATIONS })
            dispatch({ type: announcementActions.GET_ANNOUNCEMENTS })
        }, 60000)
        return () => clearInterval(interval)
    }, [dispatch])

    // feather swaps <i data-feather> for <svg> outside React. Whenever the header re-renders
    // (profile loaded, notifications refreshed) re-run it so no icon is left blank —
    // same approach the Sidebar uses.
    useEffect(() => {
        if (window.feather) window.feather.replace()
    }, [user, notifications, unreadCount])

    const onNotificationClick = (id) => {
        dispatch({ type: notificationActions.MARK_NOTIFICATION_READ, id })
    }

    const onMarkAllRead = () => {
        dispatch({ type: notificationActions.MARK_ALL_NOTIFICATIONS_READ })
    }

    function clearLmsCache() {
        Object.keys(localStorage)?.forEach(key => {
            if (key) {
                localStorage?.removeItem(key);
            }
        });
    }

    useEffect(() => {
        dispatch({
            type: authActions.CHECK_SESSION,
            navigate,
        });
    }, [dispatch, navigate]);

    useEffect(() => {
        if (hasSession === '') {
            clearLmsCache();
        }
    }, [hasSession]);

    // The theme's app.js (which used to wire this button) isn't loaded, so toggle here:
    // phones/tablets slide the menu in via body.sidebar-enable; desktops collapse it to icons.
    const chatUnread = useChatUnread()

    const toggleMenu = () => {
        if (window.innerWidth <= 992) {
            document.body.classList.toggle('sidebar-enable')
        } else {
            const collapsed = document.body.getAttribute('data-sidebar-size') === 'sm'
            document.body.setAttribute('data-sidebar-size', collapsed ? 'lg' : 'sm')
        }
    }

    const logOut = () => {
        localStorage?.removeItem("session");
        clearLmsCache();
        dispatch({ type: authActions.LOGOUT_DASH, navigate })
    };

    return (
        <div>
            <header id="page-topbar">
                <div className="navbar-header">
                    <div className="d-flex">
                        <button type="button" className="header-item hd-menu-btn" id="vertical-menu-btn" onClick={toggleMenu} aria-label="Toggle menu">
                            <span className="hd-burger" aria-hidden="true"><i></i><i></i><i></i></span>
                        </button>
                        <div className="navbar-brand-box">
                            <a href="/dashboard" onClick={(e) => { e.preventDefault(); navigate('/dashboard') }} className="logo hd-brand" aria-label="Astral Consulting Limited — dashboard">
                                <img src="assets/images/astral-mark.png" alt="" className="hd-brand-mark" />
                                <span className="hd-brand-text">
                                    <b>Astral</b>
                                    <small>Consulting Limited</small>
                                </span>
                            </a>
                        </div>

                    </div>

                    <div className="d-flex">

                        <div className="dropdown d-inline-block">
                            <button type="button" className="btn header-item" data-bs-toggle="dropdown" aria-haspopup="true" aria-expanded="false" aria-label="Header colour" title="Header colour">
                                <i className="mdi mdi-palette-outline" style={{ fontSize: 21 }}></i>
                            </button>
                            <div className="dropdown-menu dropdown-menu-end ht-menu">
                                <h6>Header colour</h6>
                                <div className="ht-grid">
                                    {HEADER_THEMES.map((t) => (
                                        <button key={t.key} type="button" className={`ht-swatch ${headerTheme === t.key ? 'on' : ''}`} onClick={() => setHeaderTheme(t.key)}>
                                            <span style={{ background: t.swatch }}></span>{t.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <button type="button" className="btn header-item noti-icon position-relative" aria-label={`Messages${chatUnread ? ` (${chatUnread} unread)` : ''}`} title="Messages" onClick={() => navigate('/messages')}>
                            <i className="mdi mdi-message-text-outline" style={{ fontSize: 21 }}></i>
                            {chatUnread > 0 && <span className="hd-chat-badge">{chatUnread > 99 ? '99+' : chatUnread}</span>}
                        </button>

                        <div className="dropdown d-inline-block">
                            <button type="button" className="btn header-item noti-icon position-relative" data-bs-toggle="dropdown" aria-haspopup="true" aria-expanded="false" aria-label="Announcements" title="Announcements" onClick={markAnnouncementsSeen}>
                                <i className="mdi mdi-bullhorn-outline" style={{ fontSize: 21 }}></i>
                                {newAnnouncements > 0 && <span className="badge bg-danger rounded-pill">{newAnnouncements}</span>}
                            </button>
                            <div className="dropdown-menu dropdown-menu-lg dropdown-menu-end p-0 hd-ann">
                                <div className="p-3 d-flex align-items-center">
                                    <h6 className="m-0 flex-grow-1">Announcements</h6>
                                    <small className="text-muted">{(announcements || []).length} total</small>
                                </div>
                                <div style={{ maxHeight: 380, overflowY: 'auto' }}>
                                    {!(announcements || []).length && <p className="text-center text-muted py-4 mb-0">Nothing posted yet.</p>}
                                    {(announcements || []).slice(0, 6).map((a) => {
                                        const fresh = new Date(a.createdAt).getTime() > annSeenAt - 1000 && Date.now() - new Date(a.createdAt).getTime() < 3 * 864e5
                                        return (
                                            <a key={a._id} href="/announcements" className="hd-ann-item" onClick={(e) => { e.preventDefault(); navigate('/announcements') }}>
                                                <span className="hd-ann-icon"><i className={`mdi ${a.pinned ? 'mdi-pin' : 'mdi-bullhorn-outline'}`}></i></span>
                                                <span className="hd-ann-main">
                                                    <b>{a.title}{fresh && <span className="badge bg-danger-subtle text-danger ms-2">New</span>}</b>
                                                    <small>{a.content}</small>
                                                    <em>{a.postedBy ? `${a.postedBy.firstName || ''} ${a.postedBy.lastName || ''}`.trim() : 'HR'} · {new Date(a.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</em>
                                                </span>
                                            </a>
                                        )
                                    })}
                                </div>
                                <div className="p-2 border-top d-grid">
                                    <a className="btn btn-sm btn-link font-size-14 text-center" href="/announcements" onClick={(e) => { e.preventDefault(); navigate('/announcements') }}>
                                        <i className="mdi mdi-arrow-right-circle me-1"></i> View all
                                    </a>
                                </div>
                            </div>
                        </div>

                        <div className="dropdown d-inline-block">
                            <button type="button" className="btn header-item noti-icon position-relative" id="page-header-notifications-dropdown" aria-label="Notifications"
                                data-bs-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                                <i data-feather="bell" className="icon-lg"></i>
                                {unreadCount > 0 && <span className="badge bg-success rounded-pill">{unreadCount}</span>}
                            </button>
                            <div className="dropdown-menu dropdown-menu-lg dropdown-menu-end p-0"
                                aria-labelledby="page-header-notifications-dropdown">
                                <div className="p-3">
                                    <div className="row align-items-center">
                                        <div className="col">
                                            <h6 className="m-0"> Notifications </h6>
                                        </div>
                                        <div className="col-auto">
                                            <a href="#!" className="small text-reset text-decoration-underline" onClick={onMarkAllRead}> Unread ({unreadCount})</a>
                                        </div>
                                    </div>
                                </div>
                                <div data-simplebar style={{ maxHeight: "400px" }}>
                                    {(!notifications || notifications.length === 0) && (
                                        <p className="text-center text-muted py-4 mb-0">No notifications yet.</p>
                                    )}
                                    {notifications?.map((n) => (
                                        <a href="#!" key={n._id} className="text-reset notification-item" onClick={() => onNotificationClick(n._id)}>
                                            <div className="d-flex">
                                                <div className="flex-shrink-0 avatar-sm me-3">
                                                    <span className={`avatar-title rounded-circle font-size-16 ${n.isRead ? 'bg-light text-dark' : 'bg-primary text-white'}`}>
                                                        <i className="bx bx-bell"></i>
                                                    </span>
                                                </div>
                                                <div className="flex-grow-1">
                                                    <h6 className="mb-1">{n.title}{!n.isRead && <span className="badge bg-success-subtle text-success ms-2">New</span>}</h6>
                                                    <div className="font-size-13 text-muted">
                                                        <p className="mb-1">{n.message}</p>
                                                        <p className="mb-0"><i className="mdi mdi-clock-outline"></i> <span>{new Date(n.createdAt).toLocaleString()}</span></p>
                                                    </div>
                                                </div>
                                            </div>
                                        </a>
                                    ))}
                                </div>
                                <div className="p-2 border-top d-grid">
                                    <a className="btn btn-sm btn-link font-size-14 text-center" href="/notifications" onClick={(e) => { e.preventDefault(); navigate('/notifications') }}>
                                        <i className="mdi mdi-arrow-right-circle me-1"></i> View all
                                    </a>
                                </div>
                            </div>
                        </div>

                        <div className="dropdown d-inline-block">
                            <button type="button" className="btn header-item bg-light-subtle border-start border-end" id="page-header-user-dropdown"
                                data-bs-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                                {hasPhoto ? (
                                    <img className="rounded-circle header-profile-user" src={user.profileImage} alt="" />
                                ) : (
                                    <span className="header-profile-user hk-initials" aria-hidden="true">{initials || <i className="mdi mdi-account"></i>}</span>
                                )}
                                <span className="d-none d-xl-inline-flex flex-column align-items-start ms-2 lh-sm text-start">
                                    <span className="fw-medium">{shortName || 'Account'}</span>
                                    {user?.role && <small className="text-muted" style={{ fontSize: 11 }}>{user.role}</small>}
                                </span>
                                <i className="mdi mdi-chevron-down d-none d-xl-inline-block ms-1"></i>
                            </button>
                            <div className="dropdown-menu dropdown-menu-end">
                                {user && (
                                    <div className="px-3 py-2">
                                        <div className="fw-semibold" style={{ color: 'var(--bs-emphasis-color)' }}>{fullName}</div>
                                        {user.email && <small className="text-muted d-block text-truncate" style={{ maxWidth: 220 }}>{user.email}</small>}
                                    </div>
                                )}
                                {user && <div className="dropdown-divider"></div>}
                                <a className="dropdown-item" href="/profile" onClick={(e) => { e.preventDefault(); navigate('/profile') }}><i className="mdi mdi-face-profile font-size-16 align-middle me-1"></i> Profile</a>
                                <a className="dropdown-item" href="/change-password" onClick={(e) => { e.preventDefault(); navigate('/change-password') }}><i className="mdi mdi-lock-reset font-size-16 align-middle me-1"></i> Change password</a>
                                <div className="dropdown-divider"></div>
                                <div onClick={logOut} className="dropdown-item" style={{ cursor: 'pointer' }}><i className="mdi mdi-logout font-size-16 align-middle me-1"></i> Logout</div>
                            </div>
                        </div>

                    </div>
                </div>
            </header>
        </div>
    )
}
