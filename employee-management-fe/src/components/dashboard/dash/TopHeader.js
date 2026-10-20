import React, { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import authActions from '../../../redux/auth/Actions';
import notificationActions from '../../../redux/notification/Actions';
import roleActions from '../../../redux/role/Actions';

export const TopHeader = () => {
    const navigate = useNavigate()
    const dispatch = useDispatch()
    const hasSession = localStorage.getItem('session')
    const { list: notifications, unreadCount } = useSelector((state) => state.notificationReducer || {})
    // The logged-in person, filled by the session check / login.
    const { isAuthenticated: user } = useSelector((state) => state.authReducer || {})
    const fullName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim()
    const shortName = [user?.firstName, user?.lastName ? `${user.lastName[0]}.` : ''].filter(Boolean).join(' ')
    const initials = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase()
    // Seed data points everyone at the same stock photo — treat that as "no photo".
    const hasPhoto = user?.profileImage && !/avatar-\d+\.jpg$/.test(user.profileImage)

    useEffect(() => {
        dispatch({ type: notificationActions.GET_NOTIFICATIONS })
        dispatch({ type: roleActions.GET_MY_PERMISSIONS })
        const interval = setInterval(() => {
            dispatch({ type: notificationActions.GET_NOTIFICATIONS })
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
                        <div className="navbar-brand-box">
                            <a href="/dashboard" onClick={(e) => { e.preventDefault(); navigate('/dashboard') }} className="logo logo-dark">
                                <span className="logo-sm">
                                    <img src="assets/images/astral-mark.png" alt="Astral" height="30" />
                                </span>
                                <span className="logo-lg">
                                    <img src="assets/images/astral-logo.png" alt="Astral Consulting Limited" className="brand-logo" />
                                </span>
                            </a>

                            <a href="/dashboard" onClick={(e) => { e.preventDefault(); navigate('/dashboard') }} className="logo logo-light">
                                <span className="logo-sm">
                                    <img src="assets/images/astral-mark.png" alt="Astral" height="30" />
                                </span>
                                <span className="logo-lg">
                                    <img src="assets/images/astral-logo.png" alt="Astral Consulting Limited" className="brand-logo" />
                                </span>
                            </a>
                        </div>

                        <button type="button" className="btn btn-sm px-3 font-size-16 header-item" id="vertical-menu-btn" onClick={toggleMenu} aria-label="Toggle menu">
                            <i className="fa fa-fw fa-bars"></i>
                        </button>

                        <form className="app-search d-none d-lg-block">
                            <div className="position-relative">
                                <input type="search" className="form-control" placeholder="Search..." />
                                <button className="btn btn-primary" type="button"><i className="bx bx-search-alt align-middle"></i></button>
                            </div>
                        </form>
                    </div>

                    <div className="d-flex">

                        <div className="dropdown d-inline-block d-lg-none ms-2">
                            <button type="button" className="btn header-item" id="page-header-search-dropdown"
                                data-bs-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                                <i data-feather="search" className="icon-lg"></i>
                            </button>
                            <div className="dropdown-menu dropdown-menu-lg dropdown-menu-end p-0"
                                aria-labelledby="page-header-search-dropdown">

                                <form className="p-3">
                                    <div className="form-group m-0">
                                        <div className="input-group">
                                            <input type="text" className="form-control" placeholder="Search ..." aria-label="Search Result" />

                                            <button className="btn btn-primary" type="submit"><i className="mdi mdi-magnify"></i></button>
                                        </div>
                                    </div>
                                </form>
                            </div>
                        </div>

                        <div className="dropdown d-none d-sm-inline-block">
                            <button type="button" className="btn header-item"
                                data-bs-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                                <img id="header-lang-img" src="assets/images/flags/us.jpg" alt="Header Language" height="16" />
                            </button>
                            <div className="dropdown-menu dropdown-menu-end">

                                <a href="javascript:void(0);" className="dropdown-item notify-item language" data-lang="en">
                                    <img src="assets/images/flags/us.jpg" alt="user-image" className="me-1" height="12" /> <span className="align-middle">English</span>
                                </a>
                                <a href="javascript:void(0);" className="dropdown-item notify-item language" data-lang="sp">
                                    <img src="assets/images/flags/spain.jpg" alt="user-image" className="me-1" height="12" /> <span className="align-middle">Spanish</span>
                                </a>

                                <a href="javascript:void(0);" className="dropdown-item notify-item language" data-lang="gr">
                                    <img src="assets/images/flags/germany.jpg" alt="user-image" className="me-1" height="12" /> <span className="align-middle">German</span>
                                </a>

                                <a href="javascript:void(0);" className="dropdown-item notify-item language" data-lang="it">
                                    <img src="assets/images/flags/italy.jpg" alt="user-image" className="me-1" height="12" /> <span className="align-middle">Italian</span>
                                </a>

                                <a href="javascript:void(0);" className="dropdown-item notify-item language" data-lang="ru">
                                    <img src="assets/images/flags/russia.jpg" alt="user-image" className="me-1" height="12" /> <span className="align-middle">Russian</span>
                                </a>
                            </div>
                        </div>

                        <div className="dropdown d-none d-sm-inline-block">
                            <button type="button" className="btn header-item" id="mode-setting-btn">
                                <i data-feather="moon" className="icon-lg layout-mode-dark"></i>
                                <i data-feather="sun" className="icon-lg layout-mode-light"></i>
                            </button>
                        </div>

                        <div className="dropdown d-none d-lg-inline-block ms-1">
                            <button type="button" className="btn header-item"
                                data-bs-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                                <i data-feather="grid" className="icon-lg"></i>
                            </button>
                            <div className="dropdown-menu dropdown-menu-lg dropdown-menu-end">
                                <div className="p-2">
                                    <div className="row g-0">
                                        <div className="col">
                                            <a className="dropdown-icon-item" href="#">
                                                <img src="assets/images/brands/github.png" alt="Github" />
                                                <span>GitHub</span>
                                            </a>
                                        </div>
                                        <div className="col">
                                            <a className="dropdown-icon-item" href="#">
                                                <img src="assets/images/brands/bitbucket.png" alt="bitbucket" />
                                                <span>Bitbucket</span>
                                            </a>
                                        </div>
                                        <div className="col">
                                            <a className="dropdown-icon-item" href="#">
                                                <img src="assets/images/brands/dribbble.png" alt="dribbble" />
                                                <span>Dribbble</span>
                                            </a>
                                        </div>
                                    </div>

                                    <div className="row g-0">
                                        <div className="col">
                                            <a className="dropdown-icon-item" href="#">
                                                <img src="assets/images/brands/dropbox.png" alt="dropbox" />
                                                <span>Dropbox</span>
                                            </a>
                                        </div>
                                        <div className="col">
                                            <a className="dropdown-icon-item" href="#">
                                                <img src="assets/images/brands/mail_chimp.png" alt="mail_chimp" />
                                                <span>Mail Chimp</span>
                                            </a>
                                        </div>
                                        <div className="col">
                                            <a className="dropdown-icon-item" href="#">
                                                <img src="assets/images/brands/slack.png" alt="slack" />
                                                <span>Slack</span>
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="dropdown d-inline-block">
                            <button type="button" className="btn header-item noti-icon position-relative" id="page-header-notifications-dropdown"
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
                            </div>
                        </div>

                        <div className="dropdown d-inline-block">
                            <button type="button" className="btn header-item right-bar-toggle me-2">
                                <i data-feather="settings" className="icon-lg"></i>
                            </button>
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
