import React, { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useForm } from 'react-hook-form'
import { DashNav } from '../../../components/dashboard/dash/DashNav'
import announcementActions from '../../../redux/announcement/Actions'
import { AUDIENCES, audienceMeta, avatarColor, initials, authorName, relativeTime, DAY } from '../../../components/dashboard/widgets/announcementUtils'
import { BackButton } from '../../../components/common/BackButton'
import './AnnouncementFeed.css'
import { useAccess } from '../../../hooks/useAccess'

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() }

const LONG_POST = 280

const AnnouncementCard = ({ a, canPost, onDelete }) => {
    const [expanded, setExpanded] = useState(false)
    const audience = audienceMeta(a.audience)
    const author = authorName(a.postedBy)
    const isLong = (a.content || '').length > LONG_POST

    return (
        <article className={`an-card ${a.pinned ? 'is-pinned' : ''}`}>
            <span className="an-avatar" style={{ '--av': avatarColor(author) }}>{initials(a.postedBy)}</span>
            <div className="an-body">
                <div className="an-meta">
                    <strong>{author}</strong>
                    <span className="an-dot"></span>
                    <span title={new Date(a.createdAt).toLocaleString()}>{relativeTime(a.createdAt)}</span>
                    <span className="an-tag" style={{ '--tag': audience.color }}>
                        <i className={`mdi ${audience.icon}`}></i>{a.audience}
                    </span>
                    {a.pinned && <span className="an-tag" style={{ '--tag': '#d97706' }}><i className="mdi mdi-pin"></i>Pinned</span>}
                </div>
                <h3 className="an-title">{a.title}</h3>
                <p className="an-text">
                    {isLong && !expanded ? `${a.content.slice(0, LONG_POST).trimEnd()}…` : a.content}
                </p>
                {isLong && (
                    <button type="button" className="an-more" onClick={() => setExpanded((v) => !v)}>
                        {expanded ? 'Show less' : 'Read more'}
                    </button>
                )}
            </div>
            {canPost && (
                <button type="button" className="an-del" onClick={() => onDelete(a._id)} title="Delete announcement" aria-label={`Delete "${a.title}"`}>
                    <i className="mdi mdi-trash-can-outline"></i>
                </button>
            )}
        </article>
    )
}

export const AnnouncementFeed = () => {
    const dispatch = useDispatch()
    const { list, listLoading, error } = useSelector((state) => state.announcementReducer || {})
    const { can } = useAccess()
    const canPost = can(['Admin', 'HR'], 'announcements')
    const { register, handleSubmit, reset, watch, formState: { errors } } = useForm({ defaultValues: { audience: 'Everyone', pinned: false } })
    const [composerOpen, setComposerOpen] = useState(false)
    const [query, setQuery] = useState('')
    const [audienceFilter, setAudienceFilter] = useState('All')

    useEffect(() => {
        dispatch({ type: announcementActions.GET_ANNOUNCEMENTS })
    }, [dispatch])

    const onSubmit = (data) => {
        dispatch({ type: announcementActions.ADD_ANNOUNCEMENT, payload: data })
        reset({ title: '', content: '', audience: 'Everyone', pinned: false })
        setComposerOpen(false)
    }

    const onCancel = () => {
        reset({ title: '', content: '', audience: 'Everyone', pinned: false })
        setComposerOpen(false)
    }

    const onDelete = (id) => {
        if (window.confirm('Remove this announcement?')) {
            dispatch({ type: announcementActions.DELETE_ANNOUNCEMENT, id })
        }
    }

    const all = useMemo(() => list || [], [list])

    const stats = useMemo(() => ({
        total: all.length,
        pinned: all.filter((a) => a.pinned).length,
        week: all.filter((a) => Date.now() - new Date(a.createdAt).getTime() < 7 * DAY).length,
    }), [all])

    const counts = useMemo(() => {
        const c = { All: all.length }
        AUDIENCES.forEach(({ value }) => { c[value] = all.filter((a) => a.audience === value).length })
        return c
    }, [all])

    // Pinned first, then newest first, bucketed so the feed reads like a timeline.
    const groups = useMemo(() => {
        const q = query.trim().toLowerCase()
        const filtered = all
            .filter((a) => audienceFilter === 'All' || a.audience === audienceFilter)
            .filter((a) => !q || `${a.title} ${a.content} ${a.postedBy?.firstName || ''} ${a.postedBy?.lastName || ''}`.toLowerCase().includes(q))
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

        const today = startOfToday()
        const buckets = [
            { title: 'Pinned', items: filtered.filter((a) => a.pinned) },
            { title: 'Today', items: [] },
            { title: 'This week', items: [] },
            { title: 'Earlier', items: [] },
        ]
        filtered.filter((a) => !a.pinned).forEach((a) => {
            const t = new Date(a.createdAt).getTime()
            if (t >= today) buckets[1].items.push(a)
            else if (t >= today - 6 * DAY) buckets[2].items.push(a)
            else buckets[3].items.push(a)
        })
        return buckets.filter((b) => b.items.length)
    }, [all, query, audienceFilter])

    const contentLength = (watch('content') || '').length
    const isFiltering = query.trim() || audienceFilter !== 'All'

    return (
        <DashNav>
            <div className="page-content an">
                <div className="container-fluid">
                    <BackButton className="mb-3" />


                    <section className="an-hero">
                        <div>
                            <h1><i className="mdi mdi-bullhorn-outline"></i>Announcements</h1>
                            <p>Company news, policy updates and everything your team should know.</p>
                        </div>
                        <div className="an-hero-right">
                            <div className="an-stat"><b>{stats.total}</b><span>Total</span></div>
                            <div className="an-stat"><b>{stats.pinned}</b><span>Pinned</span></div>
                            <div className="an-stat"><b>{stats.week}</b><span>This week</span></div>
                            {canPost && !composerOpen && (
                                <button type="button" className="an-new" onClick={() => setComposerOpen(true)}>
                                    <i className="mdi mdi-plus"></i> New announcement
                                </button>
                            )}
                        </div>
                    </section>

                    {error && (
                        <div className="an-alert" role="alert"><i className="mdi mdi-alert-circle-outline"></i>{error}</div>
                    )}

                    {canPost && composerOpen && (
                        <form className="an-composer" onSubmit={handleSubmit(onSubmit)} noValidate>
                            <div className="an-composer-head">
                                <h5>New announcement</h5>
                                <button type="button" className="an-close" onClick={onCancel} aria-label="Close composer">
                                    <i className="mdi mdi-close"></i>
                                </button>
                            </div>

                            <div className="an-field">
                                <label className="an-label" htmlFor="an-title">Title</label>
                                <input
                                    id="an-title"
                                    type="text"
                                    autoFocus
                                    placeholder="e.g. Office closed on Friday for Diwali"
                                    className={`an-input ${errors.title ? 'is-invalid' : ''}`}
                                    {...register('title', { required: 'Give your announcement a title' })}
                                />
                                {errors.title && <div className="an-err">{errors.title.message}</div>}
                            </div>

                            <div className="an-field">
                                <label className="an-label" htmlFor="an-content">
                                    Message <small>{contentLength} characters</small>
                                </label>
                                <textarea
                                    id="an-content"
                                    rows={4}
                                    placeholder="Write the details your team needs to know…"
                                    className={`an-input ${errors.content ? 'is-invalid' : ''}`}
                                    {...register('content', { required: 'Write a message' })}
                                ></textarea>
                                {errors.content && <div className="an-err">{errors.content.message}</div>}
                            </div>

                            <div className="an-composer-foot">
                                <div className="an-seg" role="radiogroup" aria-label="Audience">
                                    {AUDIENCES.map((a) => (
                                        <label key={a.value}>
                                            <input type="radio" value={a.value} {...register('audience')} />
                                            <span><i className={`mdi ${a.icon}`}></i>{a.value}</span>
                                        </label>
                                    ))}
                                </div>
                                <label className="an-pin">
                                    <input type="checkbox" {...register('pinned')} /> <i className="mdi mdi-pin-outline"></i> Pin to top
                                </label>
                                <div className="an-btns">
                                    <button type="button" className="an-btn" onClick={onCancel}>Cancel</button>
                                    <button type="submit" className="an-btn primary"><i className="mdi mdi-send-outline"></i> Post</button>
                                </div>
                            </div>
                        </form>
                    )}

                    <div className="an-toolbar">
                        <div className="an-search">
                            <i className="mdi mdi-magnify"></i>
                            <input
                                type="search"
                                className="an-input"
                                placeholder="Search announcements…"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                aria-label="Search announcements"
                            />
                        </div>
                        <div className="an-filters" role="tablist" aria-label="Filter by audience">
                            {['All', ...AUDIENCES.map((a) => a.value)].map((f) => (
                                <button
                                    key={f}
                                    type="button"
                                    role="tab"
                                    aria-selected={audienceFilter === f}
                                    className={`an-filter ${audienceFilter === f ? 'active' : ''}`}
                                    onClick={() => setAudienceFilter(f)}
                                >
                                    {f}<b>{counts[f] || 0}</b>
                                </button>
                            ))}
                        </div>
                    </div>

                    {listLoading && !all.length ? (
                        <>
                            <div className="an-skel"></div>
                            <div className="an-skel"></div>
                            <div className="an-skel"></div>
                        </>
                    ) : !groups.length ? (
                        <div className="an-empty">
                            <i className={`mdi ${isFiltering ? 'mdi-text-search' : 'mdi-bullhorn-outline'}`}></i>
                            <h5>{isFiltering ? 'No matching announcements' : 'No announcements yet'}</h5>
                            <p>
                                {isFiltering
                                    ? 'Try a different search or audience filter.'
                                    : canPost ? 'Share your first update with the team.' : 'Company updates will show up here.'}
                            </p>
                            {!isFiltering && canPost && !composerOpen && (
                                <button type="button" className="an-btn primary mt-3" onClick={() => setComposerOpen(true)}>
                                    <i className="mdi mdi-plus"></i> New announcement
                                </button>
                            )}
                        </div>
                    ) : (
                        groups.map((g) => (
                            <section key={g.title}>
                                <div className="an-group-title">{g.title}</div>
                                {g.items.map((a) => (
                                    <AnnouncementCard key={a._id} a={a} canPost={canPost} onDelete={onDelete} />
                                ))}
                            </section>
                        ))
                    )}
                </div>
            </div>
        </DashNav>
    )
}
