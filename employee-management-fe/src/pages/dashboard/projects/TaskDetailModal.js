import React, { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import taskActions from '../../../redux/task/Actions'
import { Avatar, fullName, fmtDate } from '../../../components/people/PeopleUI'
import { relativeTime } from '../../../components/dashboard/widgets/announcementUtils'
import { TASK_STATUS, PriorityTag, DueTag, priorityMeta } from '../../../components/projects/ProjectUI'
import '../../../components/people/people.css'
import '../../../components/projects/projects.css'
import './TaskDetailModal.css'

// Kept as TaskDetailModal so existing callers don't change — it now renders as a side drawer.
export const TaskDetailModal = ({ taskId, onClose, onDeleted }) => {
    const dispatch = useDispatch()
    const { detail } = useSelector((state) => state.taskReducer || {})
    const { isAuthenticated: user } = useSelector((state) => state.authReducer || {})
    const canDelete = ['Admin', 'HR', 'Manager', 'Team Lead'].includes(user?.role)
    const [comment, setComment] = useState('')
    const [status, setStatus] = useState(null)

    useEffect(() => {
        dispatch({ type: taskActions.GET_TASK_BY_ID, id: taskId })
        return () => dispatch({ type: taskActions.CLEAR_TASK_DETAIL })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [taskId])

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    const ready = detail && detail._id === taskId
    const current = status || detail?.status

    const onSendComment = (e) => {
        e.preventDefault()
        if (!comment.trim()) return
        dispatch({ type: taskActions.ADD_TASK_COMMENT, id: taskId, message: comment.trim() })
        setComment('')
    }

    const onStatus = (s) => {
        if (s === current) return
        setStatus(s)
        dispatch({ type: taskActions.UPDATE_TASK_STATUS, id: taskId, status: s })
    }

    const onDelete = () => {
        if (window.confirm('Delete this task? This cannot be undone.')) {
            dispatch({ type: taskActions.DELETE_TASK, id: taskId })
            onDeleted?.()
            onClose()
        }
    }

    return (
        <>
            <div className="td-overlay" onClick={onClose} aria-hidden="true"></div>
            <aside className="td-drawer" role="dialog" aria-modal="true" aria-label={ready ? detail.title : 'Task'} style={{ '--p': ready ? priorityMeta(detail.priority).color : '#e2e8f0' }}>
                {!ready ? (
                    <div className="td-body"><div className="pp-skel" style={{ height: 28, marginBottom: 16 }}></div><div className="pp-skel" style={{ height: 160 }}></div></div>
                ) : (
                    <>
                        <div className="td-head">
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <h3>{detail.title}</h3>
                                <div className="td-tags">
                                    <PriorityTag priority={detail.priority} />
                                    <DueTag date={detail.dueDate} done={current === 'Done'} />
                                </div>
                            </div>
                            <button type="button" className="td-close" onClick={onClose} aria-label="Close"><i className="mdi mdi-close"></i></button>
                        </div>

                        <div className="td-body">
                            <h4 className="td-label">Status</h4>
                            <div className="td-status" role="radiogroup" aria-label="Status">
                                {Object.entries(TASK_STATUS).map(([s, m]) => (
                                    <button key={s} type="button" role="radio" aria-checked={current === s} className={current === s ? 'active' : ''} style={{ '--c': m.color }} onClick={() => onStatus(s)}>
                                        <i className={`mdi ${m.icon}`}></i>{s}
                                    </button>
                                ))}
                            </div>

                            <div className="td-facts">
                                <div className="td-fact" style={{ '--c': '#0284c7' }}>
                                    <small><i className="mdi mdi-folder-outline"></i>Project</small>
                                    <div>{detail.projectId ? <Link to={`/projects/${detail.projectId._id}`} onClick={onClose}>{detail.projectId.projectName}</Link> : '—'}</div>
                                </div>
                                <div className="td-fact" style={{ '--c': '#7c3aed' }}>
                                    <small><i className="mdi mdi-account-outline"></i>Assignee</small>
                                    <div>{detail.assignedTo ? <><Avatar person={detail.assignedTo} size={24} />{fullName(detail.assignedTo)}</> : 'Unassigned'}</div>
                                </div>
                                <div className="td-fact" style={{ '--c': '#059669' }}>
                                    <small><i className="mdi mdi-calendar-start"></i>Start</small>
                                    <div>{fmtDate(detail.startDate)}</div>
                                </div>
                                <div className="td-fact" style={{ '--c': '#e11d48' }}>
                                    <small><i className="mdi mdi-calendar-end"></i>Due</small>
                                    <div>{fmtDate(detail.dueDate)}</div>
                                </div>
                            </div>

                            <h4 className="td-label">Description</h4>
                            <p className="td-desc">{detail.description || 'No description provided.'}</p>
                            <p className="td-meta">Created by {detail.createdBy ? fullName(detail.createdBy) : '—'} · {fmtDate(detail.createdAt)}</p>

                            <h4 className="td-label">Comments · {detail.comments?.length || 0}</h4>
                            {!detail.comments?.length ? (
                                <p className="pp-muted-dash" style={{ fontSize: 13 }}>No comments yet — start the conversation below.</p>
                            ) : (
                                <ul className="td-comments">
                                    {detail.comments.map((c, i) => (
                                        <li key={c._id || i} className={`td-comment ${c.employeeId?._id === user?._id ? 'mine' : ''}`}>
                                            <Avatar person={c.employeeId} size={32} />
                                            <div className="td-bubble">
                                                <div className="td-bubble-head"><b>{fullName(c.employeeId)}</b><span title={new Date(c.createdAt).toLocaleString()}>{relativeTime(c.createdAt)}</span></div>
                                                <p>{c.message}</p>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <form className="td-compose" onSubmit={onSendComment}>
                            <input type="text" className="pp-input" placeholder="Write a comment…" value={comment} onChange={(e) => setComment(e.target.value)} aria-label="Write a comment" />
                            <button type="submit" className="pp-btn primary" disabled={!comment.trim()}><i className="mdi mdi-send"></i></button>
                        </form>

                        <div className="td-foot">
                            {canDelete ? <button type="button" className="pp-btn danger" onClick={onDelete}><i className="mdi mdi-trash-can-outline"></i> Delete task</button> : <span></span>}
                            <button type="button" className="pp-btn" onClick={onClose}>Close</button>
                        </div>
                    </>
                )}
            </aside>
        </>
    )
}
