import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { DashNav } from '../../components/dashboard/dash/DashNav'
import notificationActions from '../../redux/notification/Actions'
import { relativeTime, DAY } from '../../components/dashboard/widgets/announcementUtils'
import { BackButton } from '../../components/common/BackButton'
import './NotificationCenter.css'

const TYPES = [
    { value: 'Leave', icon: 'mdi-calendar-account-outline', color: '#0ea5e9' },
    { value: 'Expense', icon: 'mdi-credit-card-outline', color: '#10b981' },
    { value: 'Asset', icon: 'mdi-laptop', color: '#f59e0b' },
    { value: 'Ticket', icon: 'mdi-lifebuoy', color: '#8b5cf6' },
    { value: 'Task', icon: 'mdi-checkbox-marked-circle-outline', color: '#1e40af' },
    { value: 'Project', icon: 'mdi-folder-outline', color: '#0891b2' },
    { value: 'General', icon: 'mdi-bell-outline', color: '#0ea5e9' },
]
const typeMeta = (type) => TYPES.find((t) => t.value === type) || TYPES[TYPES.length - 1]

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() }

// Only in-app paths are navigable; anything else just gets marked as read.
const isInternalLink = (link) => typeof link === 'string' && link.startsWith('/')

export const NotificationCenter = () => {
    const dispatch = useDispatch()
    const navigate = useNavigate()
    const { list, unreadCount, error } = useSelector((state) => state.notificationReducer || {})
    const [tab, setTab] = useState('all')
    const [typeFilter, setTypeFilter] = useState(null)

    // The reducer has no loading flag: treat the list as loaded once it changes after
    // mount (or if the header had already fetched it), so we don't flash "all caught up".
    const initialList = useRef(list)
    const loaded = (list?.length || 0) > 0 || list !== initialList.current || !!error

    useEffect(() => {
        dispatch({ type: notificationActions.GET_NOTIFICATIONS })
    }, [dispatch])

    const onRead = (id) => dispatch({ type: notificationActions.MARK_NOTIFICATION_READ, id })
    const onReadAll = () => dispatch({ type: notificationActions.MARK_ALL_NOTIFICATIONS_READ })

    const onOpen = (n) => {
        if (!n.isRead) onRead(n._id)
        if (isInternalLink(n.link)) navigate(n.link)
    }

    const all = useMemo(() => [...(list || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)), [list])

    const todayCount = useMemo(() => all.filter((n) => new Date(n.createdAt).getTime() >= startOfToday()).length, [all])

    const typeCounts = useMemo(() => {
        const base = tab === 'unread' ? all.filter((n) => !n.isRead) : all
        return TYPES.reduce((acc, t) => ({ ...acc, [t.value]: base.filter((n) => typeMeta(n.type).value === t.value).length }), {})
    }, [all, tab])

    const groups = useMemo(() => {
        const filtered = all
            .filter((n) => tab === 'all' || !n.isRead)
            .filter((n) => !typeFilter || typeMeta(n.type).value === typeFilter)

        const today = startOfToday()
        const buckets = [
            { title: 'Today', items: [] },
            { title: 'Yesterday', items: [] },
            { title: 'This week', items: [] },
            { title: 'Earlier', items: [] },
        ]
        filtered.forEach((n) => {
            const t = new Date(n.createdAt).getTime()
            if (t >= today) buckets[0].items.push(n)
            else if (t >= today - DAY) buckets[1].items.push(n)
            else if (t >= today - 6 * DAY) buckets[2].items.push(n)
            else buckets[3].items.push(n)
        })
        return buckets.filter((b) => b.items.length)
    }, [all, tab, typeFilter])

    const unread = unreadCount || 0

    return (
        <DashNav>
            <div className="page-content nt">
                <div className="container-fluid">
                    <BackButton className="mb-3" />


                    <section className="nt-hero">
                        <div>
                            <h1>
                                <span className="nt-bell">
                                    <i className="mdi mdi-bell-outline"></i>
                                    {unread > 0 && <b>{unread > 99 ? '99+' : unread}</b>}
                                </span>
                                Notifications
                            </h1>
                            <p>{unread ? `You have ${unread} unread notification${unread === 1 ? '' : 's'}.` : "You're all caught up. Nice!"}</p>
                        </div>
                        <div className="nt-hero-right">
                            <div className="nt-stat"><b>{unread}</b><span>Unread</span></div>
                            <div className="nt-stat"><b>{todayCount}</b><span>Today</span></div>
                            <div className="nt-stat"><b>{all.length}</b><span>Total</span></div>
                            <button type="button" className="nt-readall" onClick={onReadAll} disabled={!unread}>
                                <i className="mdi mdi-check-all"></i> Mark all as read
                            </button>
                        </div>
                    </section>

                    <div className="nt-toolbar">
                        <div className="nt-tabs" role="tablist" aria-label="Show">
                            <button type="button" role="tab" aria-selected={tab === 'all'} className={`nt-tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>
                                All <span>{all.length}</span>
                            </button>
                            <button type="button" role="tab" aria-selected={tab === 'unread'} className={`nt-tab ${tab === 'unread' ? 'active' : ''}`} onClick={() => setTab('unread')}>
                                Unread <span>{unread}</span>
                            </button>
                        </div>
                        <div className="nt-types" aria-label="Filter by type">
                            {TYPES.map((t) => (
                                <button
                                    key={t.value}
                                    type="button"
                                    aria-pressed={typeFilter === t.value}
                                    className={`nt-type ${typeFilter === t.value ? 'active' : ''}`}
                                    style={{ '--c': t.color }}
                                    onClick={() => setTypeFilter((cur) => (cur === t.value ? null : t.value))}
                                >
                                    <i className={`mdi ${t.icon}`}></i>{t.value}
                                    {typeCounts[t.value] > 0 && <b>{typeCounts[t.value]}</b>}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="nt-panel">
                        {!loaded ? (
                            [0, 1, 2, 3].map((i) => <div className="nt-skel" key={i}></div>)
                        ) : !groups.length ? (
                            <div className="nt-empty">
                                <i className="mdi mdi-bell-check-outline"></i>
                                <h5>{tab === 'unread' || typeFilter ? 'Nothing here' : "You're all caught up"}</h5>
                                <p>
                                    {typeFilter
                                        ? `No ${tab === 'unread' ? 'unread ' : ''}${typeFilter.toLowerCase()} notifications.`
                                        : tab === 'unread' ? 'No unread notifications — great job staying on top of things.' : 'New notifications will show up here.'}
                                </p>
                            </div>
                        ) : (
                            groups.map((g) => (
                                <section className="nt-group" key={g.title}>
                                    <div className="nt-group-title">{g.title}</div>
                                    <ul className="nt-list">
                                        {g.items.map((n) => {
                                            const meta = typeMeta(n.type)
                                            const clickable = isInternalLink(n.link) || !n.isRead
                                            return (
                                                <li key={n._id}>
                                                    <div
                                                        className={`nt-item ${n.isRead ? '' : 'is-unread'} ${clickable ? 'is-clickable' : ''}`}
                                                        style={{ '--c': meta.color }}
                                                        {...(clickable ? {
                                                            role: 'button',
                                                            tabIndex: 0,
                                                            onClick: () => onOpen(n),
                                                            onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(n) } },
                                                        } : {})}
                                                    >
                                                        <span className="nt-icon"><i className={`mdi ${meta.icon}`}></i></span>
                                                        <div className="nt-main">
                                                            <div className="nt-title-row">
                                                                <span className="nt-title">{n.title}</span>
                                                                {!n.isRead && <span className="nt-dot" aria-label="Unread"></span>}
                                                            </div>
                                                            {n.message && <p className="nt-msg">{n.message}</p>}
                                                            <div className="nt-meta">
                                                                <span className="nt-tag">{meta.value}</span>
                                                                <span title={new Date(n.createdAt).toLocaleString()}>{relativeTime(n.createdAt)}</span>
                                                                {isInternalLink(n.link) && <span className="nt-open">Open <i className="mdi mdi-chevron-right"></i></span>}
                                                            </div>
                                                        </div>
                                                        {!n.isRead && (
                                                            <button
                                                                type="button"
                                                                className="nt-mark"
                                                                onClick={(e) => { e.stopPropagation(); onRead(n._id) }}
                                                                title="Mark as read"
                                                            >
                                                                <i className="mdi mdi-check"></i><span>Mark read</span>
                                                            </button>
                                                        )}
                                                    </div>
                                                </li>
                                            )
                                        })}
                                    </ul>
                                </section>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </DashNav>
    )
}
