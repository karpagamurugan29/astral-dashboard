import React, { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { audienceMeta, avatarColor, initials, authorName, relativeTime, sortAnnouncements, DAY } from './announcementUtils'
import './AnnouncementsWidget.css'

// Compact announcement feed for the dashboard: pinned first, newest next, with a
// "New" marker on anything from the last 48 hours so fresh updates stand out.
export const AnnouncementsWidget = ({ announcements, loading, limit = 5 }) => {
    const items = useMemo(() => sortAnnouncements(announcements).slice(0, limit), [announcements, limit])
    const total = announcements?.length || 0

    return (
        <div className="card card-h-100 aw">
            <div className="aw-head">
                <span className="aw-icon"><i className="mdi mdi-bullhorn-outline"></i></span>
                <div className="aw-head-text">
                    <h5>Announcements</h5>
                    <span>{total ? `${total} posted · latest first` : 'Company updates'}</span>
                </div>
                <Link to="/announcements" className="aw-all">View all <i className="mdi mdi-chevron-right"></i></Link>
            </div>

            <div className="aw-body">
                {loading && !total ? (
                    [0, 1, 2].map((i) => <div className="aw-skel" key={i}></div>)
                ) : !items.length ? (
                    <div className="aw-empty">
                        <i className="mdi mdi-bullhorn-outline"></i>
                        <p>Nothing posted yet.</p>
                    </div>
                ) : (
                    <ul className="aw-list">
                        {items.map((a) => {
                            const author = authorName(a.postedBy)
                            const audience = audienceMeta(a.audience)
                            const isNew = Date.now() - new Date(a.createdAt).getTime() < 2 * DAY
                            return (
                                <li key={a._id}>
                                    <Link to="/announcements" className={`aw-item ${a.pinned ? 'is-pinned' : ''}`}>
                                        <span className="aw-avatar" style={{ '--av': avatarColor(author) }}>{initials(a.postedBy)}</span>
                                        <div className="aw-main">
                                            <div className="aw-title-row">
                                                {a.pinned && <i className="mdi mdi-pin aw-pin" title="Pinned"></i>}
                                                <span className="aw-title">{a.title}</span>
                                                {isNew && <span className="aw-new">New</span>}
                                            </div>
                                            <p className="aw-snippet">{a.content}</p>
                                            <div className="aw-meta">
                                                <span>{author}</span>
                                                <span className="aw-dot"></span>
                                                <span title={new Date(a.createdAt).toLocaleString()}>{relativeTime(a.createdAt)}</span>
                                                <span className="aw-tag" style={{ '--tag': audience.color }}>
                                                    <i className={`mdi ${audience.icon}`}></i>{a.audience}
                                                </span>
                                            </div>
                                        </div>
                                    </Link>
                                </li>
                            )
                        })}
                    </ul>
                )}
            </div>
        </div>
    )
}
