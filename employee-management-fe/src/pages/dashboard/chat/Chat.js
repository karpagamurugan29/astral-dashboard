import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { DashNav } from '../../../components/dashboard/dash/DashNav'
import { Avatar } from '../../../components/people/PeopleUI'
import { useAccess } from '../../../hooks/useAccess'
import { chatApi, listTime, dayLabel, lastSeenLabel, isOnline, personName, tickFor, setUnread, timeShort } from '../../../components/chat/chatApi'
import { ConvAvatar, GroupAvatar, Ticks, RichText, AuthImage, FileCard, EmojiPanel, Lightbox, SenderName, ReplyQuote, MsgTime, QUICK_REACTIONS } from './ChatParts'
import './Chat.css'
import { confirmAction } from '../../../components/common/ConfirmDialog'

/* -------------------------------------------------------------------------- */
/*  Team chat, WhatsApp-style: chat list on the left, the conversation on the */
/*  right (one pane at a time on phones). Polls /chat/updates every 3s while  */
/*  the tab is visible; sends are optimistic.                                 */
/* -------------------------------------------------------------------------- */

const POLL_MS = 3000
const POLL_OPEN_MS = 1500   // faster while a conversation is open
const isTouch = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
const FIRM_ADMIN = ['Admin', 'HR']
const sortConvs = (list) => [...list].sort((a, b) => (b.pinned - a.pinned) || new Date(b.lastMessage?.at || b.updatedAt) - new Date(a.lastMessage?.at || a.updatedAt))

export const Chat = () => {
    const { user } = useAccess()
    const me = user?._id
    const [params, setParams] = useSearchParams()
    const [convs, setConvs] = useState([])
    const [loaded, setLoaded] = useState(false)
    const [people, setPeople] = useState({})          // id → person (from contacts + participants)
    const [contacts, setContacts] = useState([])
    const [presence, setPresence] = useState({})
    const [typing, setTyping] = useState({})          // convId → [userId]
    const [activeId, setActiveId] = useState(params.get('c') || null)
    const [threads, setThreads] = useState({})        // convId → { messages, hasMore, reads, loading }
    const [panel, setPanel] = useState(null)          // 'new' | 'group' | 'manage' | null (left side overlays)
    const firmAdmin = FIRM_ADMIN.includes(user?.role)
    const [info, setInfo] = useState(false)
    const [filter, setFilter] = useState('all')
    const [q, setQ] = useState('')
    const [found, setFound] = useState([])
    const [showArchived, setShowArchived] = useState(false)
    const [error, setError] = useState('')
    const sinceRef = useRef(null)
    const activeRef = useRef(activeId)
    activeRef.current = activeId

    const remember = useCallback((list) => setPeople((p) => { const n = { ...p }; list.forEach((x) => { if (x?._id) n[x._id] = { ...n[x._id], ...x } }); return n }), [])

    const applyConvs = useCallback((list, replace = false) => {
        list.forEach((c) => remember(c.participants || []))
        setConvs((prev) => {
            const map = new Map(replace ? [] : prev.map((c) => [c._id, c]))
            list.forEach((c) => map.set(c._id, { ...c, participants: undefined, others: (c.others || []).map((o) => o._id || o) }))
            return sortConvs([...map.values()])
        })
    }, [remember])

    /* ---------- initial load ---------- */
    useEffect(() => {
        (async () => {
            try {
                const [list, cts] = await Promise.all([chatApi('GET', '/chat/conversations'), chatApi('GET', '/chat/contacts')])
                applyConvs(list.data, true)
                setContacts(cts.data); remember(cts.data)
                sinceRef.current = list.serverTime
            } catch (e) { setError(e.message) }
            setLoaded(true)
        })()
    }, [applyConvs, remember])

    useEffect(() => { setUnread(convs.filter((c) => !c.muted).reduce((t, c) => t + (c._id === activeId ? 0 : c.unread || 0), 0)) }, [convs, activeId])

    /* ---------- open a conversation ---------- */
    const loadThread = useCallback(async (id, before) => {
        setThreads((t) => ({ ...t, [id]: { ...(t[id] || { messages: [] }), loading: true } }))
        try {
            const j = await chatApi('GET', `/chat/conversations/${id}/messages${before ? `?before=${encodeURIComponent(before)}` : ''}`)
            setThreads((t) => {
                const cur = t[id] || { messages: [] }
                // older page: prepend; first page: server copy plus anything still sending
                const messages = before ? mergeMsgs(cur.messages, j.data.messages) : mergeMsgs(j.data.messages, cur.messages.filter((m) => m.pending))
                return { ...t, [id]: { ...cur, messages, hasMore: j.data.hasMore, reads: j.data.reads, loading: false } }
            })
            setConvs((cs) => cs.map((c) => (c._id === id ? { ...c, unread: 0 } : c)))
        } catch (e) {
            setThreads((t) => ({ ...t, [id]: { ...(t[id] || { messages: [] }), loading: false, error: e.message } }))
        }
    }, [])

    const open = useCallback((id) => {
        setActiveId(id); setInfo(false); setPanel(null)
        setParams(id ? { c: id } : {}, { replace: true })
        if (id) {
            const conv = convs.find((c) => c._id === id)
            setThreads((t) => ({ ...t, [id]: { ...(t[id] || { messages: [] }), unreadCount: conv?.unread || 0, newCount: 0 } }))
            loadThread(id)
        }
    }, [convs, loadThread, setParams])

    useEffect(() => { if (activeId && loaded && !threads[activeId]) open(activeId) }, [loaded]) // eslint-disable-line react-hooks/exhaustive-deps

    /* ---------- polling ---------- */
    useEffect(() => {
        let stop = false, t
        const tick = async () => {
            if (document.visibilityState === 'visible' && sinceRef.current) {
                try {
                    const id = activeRef.current
                    const j = await chatApi('GET', `/chat/updates?counts=0&since=${encodeURIComponent(sinceRef.current)}${id ? `&open=${id}&visible=1` : ''}`)
                    sinceRef.current = j.serverTime
                    const d = j.data
                    if (d.conversations.length) {
                        // notify for new messages in other chats while the tab is in the background
                        d.conversations.forEach((c) => {
                            if (c._id !== id && !c.muted && c.lastMessage && !c.lastMessage.mine && c.unread && document.hidden && window.Notification?.permission === 'granted') {
                                try { new window.Notification(c.type === 'group' ? c.name : personName((c.participants || []).find((p) => p._id !== me)), { body: c.lastMessage.text, tag: c._id }) } catch { /* not allowed */ }
                            }
                        })
                        applyConvs(d.conversations.map((c) => (c._id === id ? { ...c, unread: 0 } : c)))
                    }
                    setPresence((p) => ({ ...p, ...d.presence }))
                    setTyping({ ...d.typing, ...(d.open ? { [d.open._id]: d.open.typing } : {}) })
                    if (d.open) {
                        setThreads((ts) => {
                            const cur = ts[d.open._id] || { messages: [] }
                            const hidden = new Set((d.open.hidden || []).map(String))
                            return { ...ts, [d.open._id]: { ...cur, reads: d.open.reads, messages: mergeMsgs(cur.messages, d.open.messages).filter((m) => !hidden.has(String(m._id))), newCount: (cur.newCount || 0) + d.open.messages.filter((m) => !m.mine && !cur.messages.some((x) => x._id === m._id)).length } }
                        })
                    }
                } catch { /* offline: try again next tick */ }
            }
            if (!stop) t = setTimeout(tick, activeRef.current ? POLL_OPEN_MS : POLL_MS)
        }
        t = setTimeout(tick, POLL_MS)
        return () => { stop = true; clearTimeout(t) }
    }, [applyConvs, me])

    /* ---------- message search across chats ---------- */
    useEffect(() => {
        if (q.trim().length < 2) { setFound([]); return undefined }
        const t = setTimeout(() => chatApi('GET', `/chat/search?q=${encodeURIComponent(q.trim())}`).then((j) => setFound(j.data)).catch(() => setFound([])), 350)
        return () => clearTimeout(t)
    }, [q])

    const startDirect = async (personId) => {
        try {
            const j = await chatApi('POST', '/chat/conversations', { participantId: personId })
            applyConvs([j.data]); open(j.data._id)
        } catch (e) { window.alert(e.message) }
    }
    const createGroup = async (name, ids, description) => {
        const j = await chatApi('POST', '/chat/conversations', { name, participantIds: ids, description })
        applyConvs([j.data]); open(j.data._id)
    }
    const deleteGroup = async (id) => {
        await chatApi('DELETE', `/chat/conversations/${id}`)
        setConvs((cs) => cs.filter((c) => c._id !== id))
        if (activeId === id) open(null)
    }
    const updateConv = async (id, body) => {
        const j = await chatApi('PUT', `/chat/conversations/${id}`, body)
        if (j.data?.left) { setConvs((cs) => cs.filter((c) => c._id !== id)); if (activeId === id) open(null); return }
        applyConvs([j.data])
        if (body.clear) setThreads((t) => ({ ...t, [id]: { ...t[id], messages: [] } }))
        return j.data
    }

    /* ---------- list filtering ---------- */
    const titleOf = useCallback((c) => (c.type === 'group' ? c.name : personName(people[c.others?.[0]])), [people])
    const needle = q.trim().toLowerCase()
    const visible = convs.filter((c) => !!c.archived === showArchived)
        .filter((c) => filter === 'all' || (filter === 'unread' ? c.unread > 0 : filter === 'groups' ? c.type === 'group' : c.pinned))
        .filter((c) => !needle || titleOf(c).toLowerCase().includes(needle))
    const archivedCount = convs.filter((c) => c.archived).length
    const newContacts = needle ? contacts.filter((p) => personName(p).toLowerCase().includes(needle) && !convs.some((c) => c.type === 'direct' && c.others?.[0] === p._id)).slice(0, 6) : []
    const active = convs.find((c) => c._id === activeId)

    useEffect(() => { document.body.classList.add('chat-page-open'); return () => document.body.classList.remove('chat-page-open') }, [])

    return (
        <DashNav>
            <div className={`ch-page ${activeId ? 'has-active' : ''}`}>
                {/* ===================== left: chats ===================== */}
                <aside className="ch-side">
                    {panel === 'new' && <NewChatPanel contacts={contacts} presence={presence} onBack={() => setPanel(null)} onPick={startDirect} onGroup={() => setPanel('group')} />}
                    {panel === 'group' && <NewGroupPanel contacts={contacts} onBack={() => setPanel(null)} onCreate={createGroup} />}
                    {panel === 'manage' && <ManageGroupsPanel contacts={contacts} onBack={() => setPanel(null)} onNew={() => setPanel('group')}
                        onDeleted={(id) => { setConvs((cs) => cs.filter((c) => c._id !== id)); if (activeId === id) open(null) }}
                        onOpen={(id) => { if (convs.some((c) => c._id === id)) open(id) }} />}
                    <header className="ch-side-head">
                        <h2>Chats</h2>
                        <div className="ch-side-actions">
                            <button type="button" className="ch-icon-btn" title="New chat" aria-label="New chat" onClick={() => setPanel('new')}><i className="mdi mdi-message-plus-outline"></i></button>
                            <button type="button" className="ch-icon-btn" title="New group" aria-label="New group" onClick={() => setPanel('group')}><i className="mdi mdi-account-multiple-plus-outline"></i></button>
                            {firmAdmin && <button type="button" className="ch-icon-btn" title="Manage all groups" aria-label="Manage all groups" onClick={() => setPanel('manage')}><i className="mdi mdi-account-cog-outline"></i></button>}
                        </div>
                    </header>
                    <div className="ch-search">
                        <i className="mdi mdi-magnify"></i>
                        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats, people or messages" />
                    </div>
                    <div className="ch-filters">
                        {[['all', 'All'], ['unread', 'Unread'], ['groups', 'Groups'], ['pinned', 'Pinned']].map(([k, l]) => (
                            <button key={k} type="button" className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}{k === 'unread' && convs.some((c) => c.unread) ? ` ${convs.filter((c) => c.unread).length}` : ''}</button>
                        ))}
                    </div>
                    <div className="ch-list">
                        {archivedCount > 0 && (
                            <button type="button" className="ch-archived" onClick={() => setShowArchived((v) => !v)}>
                                <i className={`mdi ${showArchived ? 'mdi-arrow-left' : 'mdi-archive-outline'}`}></i>{showArchived ? 'Back to chats' : 'Archived'}<span>{showArchived ? '' : archivedCount}</span>
                            </button>
                        )}
                        {error && <div className="ch-error">{error}</div>}
                        {!loaded && [0, 1, 2, 3, 4].map((i) => <div key={i} className="ch-skel"><span></span><div><i></i><i></i></div></div>)}
                        {loaded && !visible.length && !newContacts.length && !found.length && (
                            <div className="ch-list-empty">
                                <i className="mdi mdi-message-text-outline"></i>
                                <p>{needle ? 'No chats match your search.' : filter === 'all' ? 'No chats yet. Start one with a colleague.' : 'Nothing here.'}</p>
                                {!needle && filter === 'all' && <button type="button" className="ch-primary" onClick={() => setPanel('new')}><i className="mdi mdi-message-plus-outline"></i>Start a chat</button>}
                            </div>
                        )}
                        {visible.map((c) => (
                            <ConvRow key={c._id} conv={c} title={titleOf(c)} me={me} active={c._id === activeId} people={people} presence={presence} typing={typing[c._id]}
                                onOpen={() => open(c._id)} onAction={(body) => updateConv(c._id, body).catch((e) => window.alert(e.message))} />
                        ))}
                        {newContacts.length > 0 && (
                            <>
                                <div className="ch-list-label">People</div>
                                {newContacts.map((p) => (
                                    <button key={p._id} type="button" className="ch-row" onClick={() => startDirect(p._id)}>
                                        <span className="ch-avatar-wrap"><Avatar person={p} size={46} />{isOnline(presence[p._id] ?? p.lastSeenAt) && <i className="ch-online"></i>}</span>
                                        <span className="ch-row-main"><span className="ch-row-top"><b>{personName(p)}</b></span><span className="ch-row-sub">{p.designation || ''}{p.department ? ` · ${p.department}` : ''}</span></span>
                                    </button>
                                ))}
                            </>
                        )}
                        {found.length > 0 && (
                            <>
                                <div className="ch-list-label">Messages</div>
                                {found.map((m) => {
                                    const c = convs.find((x) => x._id === m.conversationId)
                                    if (!c) return null
                                    return (
                                        <button key={m._id} type="button" className="ch-row" onClick={() => { open(c._id); setTimeout(() => window.dispatchEvent(new CustomEvent('chat:jump', { detail: m._id })), 600) }}>
                                            <ConvAvatar conv={c} peopleById={people} presence={presence} />
                                            <span className="ch-row-main">
                                                <span className="ch-row-top"><b>{titleOf(c)}</b><small>{listTime(m.createdAt)}</small></span>
                                                <span className="ch-row-sub"><RichText text={`${m.mine ? 'You: ' : c.type === 'group' ? `${m.sender?.firstName}: ` : ''}${m.text || m.file?.name || ''}`} highlight={q.trim()} /></span>
                                            </span>
                                        </button>
                                    )
                                })}
                            </>
                        )}
                    </div>
                </aside>

                {/* ===================== right: conversation ===================== */}
                <main className="ch-main">
                    {!active ? (
                        <div className="ch-welcome">
                            <div className="ch-welcome-art"><i className="mdi mdi-forum-outline"></i></div>
                            <h2>Astral Chat</h2>
                            <p>Message colleagues one-to-one or in groups — share files, reply, react, and see when your message is read.</p>
                            <p className="ch-private"><i className="mdi mdi-lock-outline"></i>Only the people in a chat can read it.</p>
                            {window.Notification && window.Notification.permission === 'default' && (
                                <button type="button" className="ch-primary ghost" onClick={() => window.Notification.requestPermission()}><i className="mdi mdi-bell-ring-outline"></i>Turn on desktop notifications</button>
                            )}
                        </div>
                    ) : (
                        <Thread key={active._id} conv={active} title={titleOf(active)} me={me} meUser={user} people={people} presence={presence} typing={typing[active._id] || []}
                            thread={threads[active._id] || { messages: [], loading: true }} setThreads={setThreads} convs={convs} titleOf={titleOf}
                            onBack={() => open(null)} onLoadOlder={(before) => loadThread(active._id, before)} onUpdate={(body) => updateConv(active._id, body)}
                            onConvTouched={(msg) => setConvs((cs) => sortConvs(cs.map((c) => (c._id === active._id ? { ...c, lastMessage: { text: msg.type === 'image' ? `📷 ${msg.text || 'Photo'}` : msg.type === 'file' ? `📎 ${msg.file?.name}` : msg.text, type: msg.type, sender: me, at: msg.createdAt, mine: true, status: 'sent' }, archived: false } : c))))}
                            info={info} setInfo={setInfo} contacts={contacts} firmAdmin={firmAdmin} onDeleteGroup={() => deleteGroup(active._id)} />
                    )}
                </main>
            </div>
        </DashNav>
    )
}

const mergeMsgs = (base, incoming) => {
    const map = new Map(base.map((m) => [String(m._id), m]))
    incoming.forEach((m) => map.set(String(m._id), { ...map.get(String(m._id)), ...m }))
    return [...map.values()].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
}

/* ---------------- one row in the chat list ---------------- */
const ConvRow = ({ conv, title, me, active, people, presence, typing, onOpen, onAction }) => {
    const [menu, setMenu] = useState(false)
    const lm = conv.lastMessage
    const typers = (typing || []).map((id) => people[id]?.firstName).filter(Boolean)
    let preview = lm ? lm.text : conv.type === 'group' ? 'Group created' : 'Say hello 👋'
    if (lm && conv.type === 'group' && lm.type !== 'system' && !lm.mine) preview = `${people[lm.sender]?.firstName || ''}: ${lm.text}`
    return (
        <div className={`ch-row ${active ? 'active' : ''} ${conv.unread ? 'unread' : ''}`} role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
            <ConvAvatar conv={conv} peopleById={people} presence={presence} />
            <span className="ch-row-main">
                <span className="ch-row-top"><b>{title}</b><small className={conv.unread ? 'hot' : ''}>{listTime(lm?.at || conv.updatedAt)}</small></span>
                <span className="ch-row-sub">
                    {typers.length ? <em className="ch-typing-txt">{conv.type === 'group' ? `${typers[0]} is typing…` : 'typing…'}</em> : (
                        <>
                            {lm?.mine && lm.type !== 'system' && <Ticks status={lm.status} />}
                            <span className="ch-preview">{preview}</span>
                        </>
                    )}
                    <span className="ch-row-flags">
                        {conv.muted && <i className="mdi mdi-bell-off-outline" title="Muted"></i>}
                        {conv.pinned && <i className="mdi mdi-pin" title="Pinned"></i>}
                        {conv.unread > 0 && <span className={`ch-badge ${conv.muted ? 'muted' : ''}`}>{conv.unread > 99 ? '99+' : conv.unread}</span>}
                        <button type="button" className="ch-row-menu" aria-label="Chat options" onClick={(e) => { e.stopPropagation(); setMenu((v) => !v) }}><i className="mdi mdi-chevron-down"></i></button>
                    </span>
                </span>
            </span>
            {menu && (
                <div className="ch-menu" onClick={(e) => e.stopPropagation()} onMouseLeave={() => setMenu(false)}>
                    <button type="button" onClick={() => { onAction({ pinned: !conv.pinned }); setMenu(false) }}><i className="mdi mdi-pin-outline"></i>{conv.pinned ? 'Unpin chat' : 'Pin chat'}</button>
                    <button type="button" onClick={() => { onAction({ muted: !conv.muted }); setMenu(false) }}><i className="mdi mdi-bell-off-outline"></i>{conv.muted ? 'Unmute' : 'Mute notifications'}</button>
                    <button type="button" onClick={() => { onAction({ archived: !conv.archived }); setMenu(false) }}><i className="mdi mdi-archive-outline"></i>{conv.archived ? 'Unarchive' : 'Archive chat'}</button>
                </div>
            )}
        </div>
    )
}

/* ---------------- the open conversation ---------------- */
const Thread = ({ conv, title, me, meUser, people, presence, typing, thread, setThreads, onBack, onLoadOlder, onUpdate, onConvTouched, info, setInfo, contacts, convs, titleOf, firmAdmin, onDeleteGroup }) => {
    const scroller = useRef()
    const bottom = useRef(true)
    const prevHeight = useRef(0)
    const [text, setText] = useState('')
    const [reply, setReply] = useState(null)
    const [editing, setEditing] = useState(null)
    const [attach, setAttach] = useState(null)      // { file, preview }
    const [emoji, setEmoji] = useState(false)
    const [menuFor, setMenuFor] = useState(null)
    const [menuUp, setMenuUp] = useState(false)
    const [reactFor, setReactFor] = useState(null)
    const [light, setLight] = useState(null)
    const [find, setFind] = useState(null)          // in-chat search text (null = closed)
    const [forward, setForward] = useState(null)
    const [dragging, setDragging] = useState(false)
    const [atBottom, setAtBottom] = useState(true)
    const [flash, setFlash] = useState(null)
    const input = useRef()
    const fileRef = useRef()
    const typingSent = useRef(0)
    const other = conv.type === 'direct' ? people[conv.others?.[0]] || {} : null
    const msgs = thread.messages || []

    const subtitle = (() => {
        const names = typing.map((id) => people[id]?.firstName).filter(Boolean)
        if (names.length) return <em className="ch-typing-txt">{conv.type === 'group' ? `${names.join(', ')} ${names.length > 1 ? 'are' : 'is'} typing…` : 'typing…'}</em>
        if (other) return lastSeenLabel(presence[other._id] ?? other.lastSeenAt) || other.designation || ''
        const members = (conv.others || []).map((id) => people[id]?.firstName).filter(Boolean)
        return ['You', ...members].join(', ')
    })()

    /* scrolling: stick to bottom on new messages unless the reader scrolled up */
    useLayoutEffect(() => {
        const el = scroller.current
        if (!el) return
        if (prevHeight.current && el.scrollTop < 40 && el.scrollHeight > prevHeight.current && !bottom.current) {
            el.scrollTop = el.scrollHeight - prevHeight.current // older page loaded: keep the view where it was
        } else if (bottom.current) {
            el.scrollTop = el.scrollHeight
        }
        prevHeight.current = el.scrollHeight
    }, [msgs.length, typing.length])

    // new messages while already at the bottom don't need the "↓ N" badge
    useEffect(() => { if (bottom.current && thread.newCount) setThreads((t) => ({ ...t, [conv._id]: { ...t[conv._id], newCount: 0 } })) }, [thread.newCount]) // eslint-disable-line react-hooks/exhaustive-deps

    // full-screen conversation on phones (bottom tab bar hidden while a chat is open)
    useEffect(() => { document.body.classList.add('chat-thread-open'); return () => document.body.classList.remove('chat-thread-open') }, [])

    useEffect(() => {
        const jump = (e) => scrollToMsg(e.detail)
        window.addEventListener('chat:jump', jump)
        return () => window.removeEventListener('chat:jump', jump)
    })

    const onScroll = () => {
        const el = scroller.current
        const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80
        bottom.current = near
        setAtBottom(near)
        if (near && thread.newCount) setThreads((t) => ({ ...t, [conv._id]: { ...t[conv._id], newCount: 0 } }))
        if (el.scrollTop < 60 && thread.hasMore && !thread.loading && msgs.length) { prevHeight.current = el.scrollHeight; onLoadOlder(msgs.find((m) => !m.pending)?.createdAt) }
    }
    const toBottom = () => { const el = scroller.current; el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); setThreads((t) => ({ ...t, [conv._id]: { ...t[conv._id], newCount: 0 } })) }
    const scrollToMsg = (id) => {
        const el = document.getElementById(`m-${id}`)
        const box = scroller.current
        if (el && box) {
            box.scrollTo({ top: el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2, behavior: 'smooth' })
            setFlash(id); setTimeout(() => setFlash(null), 1600)
        }
    }

    useEffect(() => { if (!isTouch()) input.current?.focus() }, [conv._id, reply, editing])

    /* typing signal, at most every 3s */
    const onType = (v) => {
        setText(v)
        if (v && Date.now() - typingSent.current > 3000) { typingSent.current = Date.now(); chatApi('POST', `/chat/conversations/${conv._id}/typing`, { typing: true }).catch(() => {}) }
    }

    const patchMsgs = (fn) => setThreads((t) => ({ ...t, [conv._id]: { ...t[conv._id], messages: fn(t[conv._id]?.messages || []) } }))

    const send = async () => {
        const body = text.trim()
        if (editing) {
            if (!body) return
            const id = editing._id
            setEditing(null); setText('')
            try { const j = await chatApi('PUT', `/chat/messages/${id}`, { text: body }); patchMsgs((ms) => ms.map((m) => (m._id === id ? { ...m, ...j.data } : m))) } catch (e) { window.alert(e.message) }
            return
        }
        if (!body && !attach) return
        const tempId = `tmp-${Date.now()}`
        const optimistic = { _id: tempId, pending: true, mine: true, sender: { _id: me, firstName: meUser?.firstName, lastName: meUser?.lastName }, type: attach ? (attach.file.type.startsWith('image/') ? 'image' : 'file') : 'text', text: body, createdAt: new Date().toISOString(), reactions: [], replyTo: reply ? { _id: reply._id, sender: reply.sender, text: reply.text || reply.file?.name || '' } : null, localPreview: attach?.preview, localFile: attach ? { name: attach.file.name, size: attach.file.size, mime: attach.file.type } : null }
        bottom.current = true
        patchMsgs((ms) => [...ms, optimistic])
        const payload = attach ? (() => { const fd = new FormData(); fd.append('file', attach.file); if (body) fd.append('text', body); if (reply) fd.append('replyTo', reply._id); return fd })() : { text: body, replyTo: reply?._id }
        const retry = { payload, tempId }
        setText(''); setReply(null); setAttach(null); setEmoji(false)
        typingSent.current = 0
        await deliver(retry)
    }
    const deliver = async ({ payload, tempId }) => {
        patchMsgs((ms) => ms.map((m) => (m._id === tempId ? { ...m, failed: false } : m)))
        try {
            const j = await chatApi('POST', `/chat/conversations/${conv._id}/messages`, payload)
            setThreads((t) => ({ ...t, [conv._id]: { ...t[conv._id], reads: j.data.reads, messages: mergeMsgs((t[conv._id]?.messages || []).filter((m) => m._id !== tempId), [j.data.message]) } }))
            onConvTouched(j.data.message)
        } catch (e) {
            patchMsgs((ms) => ms.map((m) => (m._id === tempId ? { ...m, failed: true, retry: { payload, tempId }, error: e.message } : m)))
        }
    }

    const onKey = (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !isTouch()) { e.preventDefault(); send() }
        if (e.key === 'Escape') { setReply(null); setEditing(null); if (editing) setText('') }
    }
    const pickFile = (file) => {
        if (!file) return
        if (file.size > 10 * 1024 * 1024) { window.alert('Files can be up to 10 MB.'); return }
        setAttach({ file, preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null })
    }
    const onPaste = (e) => { const f = [...(e.clipboardData?.files || [])][0]; if (f) { e.preventDefault(); pickFile(f) } }

    const react = async (m, emojiChar) => {
        setReactFor(null); setMenuFor(null)
        try { const j = await chatApi('POST', `/chat/messages/${m._id}/react`, { emoji: emojiChar }); patchMsgs((ms) => ms.map((x) => (x._id === m._id ? { ...x, ...j.data } : x))) } catch (e) { window.alert(e.message) }
    }
    const remove = async (m, scope) => {
        setMenuFor(null)
        if (!(await confirmAction({ title: scope === 'everyone' ? 'Delete for everyone?' : 'Delete for you?', message: scope === 'everyone' ? 'Everyone in the chat sees “message deleted”.' : 'Others keep their copy.', confirmLabel: 'Delete message' }))) return
        try {
            await chatApi('DELETE', `/chat/messages/${m._id}?scope=${scope}`)
            patchMsgs((ms) => (scope === 'everyone' ? ms.map((x) => (x._id === m._id ? { ...x, deleted: true, text: '', file: null, reactions: [] } : x)) : ms.filter((x) => x._id !== m._id)))
        } catch (e) { window.alert(e.message) }
    }
    const star = async (m) => {
        setMenuFor(null)
        try { const j = await chatApi('POST', `/chat/messages/${m._id}/star`); patchMsgs((ms) => ms.map((x) => (x._id === m._id ? { ...x, starred: j.data.starred } : x))) } catch (e) { window.alert(e.message) }
    }

    /* first unread divider: decided once when the chat opens */
    const unreadDividerAt = useMemo(() => {
        if (!thread.unreadCount) return null
        const theirs = msgs.filter((m) => !m.mine && m.type !== 'system')
        return theirs.length >= thread.unreadCount ? theirs[theirs.length - thread.unreadCount]?._id : null
    }, [thread.unreadCount, msgs.length > 0]) // eslint-disable-line react-hooks/exhaustive-deps

    const findHits = find && find.length >= 2 ? msgs.filter((m) => (m.text || '').toLowerCase().includes(find.toLowerCase())) : []

    return (
        <div className={`ch-thread ${info ? 'with-info' : ''}`}
            onDragOver={(e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); setDragging(true) } }}
            onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false) }}
            onDrop={(e) => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files?.[0]) }}>
            <div className="ch-thread-col">
                <header className="ch-thread-head">
                    <button type="button" className="ch-icon-btn ch-back" onClick={onBack} aria-label="Back to chats"><i className="mdi mdi-arrow-left"></i></button>
                    <button type="button" className="ch-head-who" onClick={() => setInfo(!info)}>
                        <ConvAvatar conv={conv} peopleById={people} presence={presence} size={40} />
                        <span><b>{title}</b><small>{subtitle}</small></span>
                    </button>
                    <div className="ch-head-actions">
                        <button type="button" className="ch-icon-btn" aria-label="Search in chat" onClick={() => setFind(find === null ? '' : null)}><i className="mdi mdi-magnify"></i></button>
                        <button type="button" className="ch-icon-btn" aria-label="Chat info" onClick={() => setInfo(!info)}><i className="mdi mdi-information-outline"></i></button>
                    </div>
                </header>
                {find !== null && (
                    <div className="ch-find">
                        <i className="mdi mdi-magnify"></i>
                        <input autoFocus value={find} onChange={(e) => setFind(e.target.value)} placeholder="Search this chat" />
                        <span>{find.length >= 2 ? `${findHits.length} found` : ''}</span>
                        {findHits.length > 0 && <button type="button" className="ch-icon-btn" onClick={() => scrollToMsg(findHits[findHits.length - 1]._id)} aria-label="Go to latest match"><i className="mdi mdi-chevron-up"></i></button>}
                        <button type="button" className="ch-icon-btn" onClick={() => setFind(null)} aria-label="Close search"><i className="mdi mdi-close"></i></button>
                    </div>
                )}

                <div className="ch-messages" ref={scroller} onScroll={onScroll} onClick={() => { setMenuFor(null); setReactFor(null) }}>
                    {thread.loading && !msgs.length && <div className="ch-loading"><i className="mdi mdi-loading mdi-spin"></i></div>}
                    {thread.hasMore && msgs.length > 0 && <div className="ch-older">{thread.loading ? <i className="mdi mdi-loading mdi-spin"></i> : 'Scroll up for older messages'}</div>}
                    {!thread.loading && !msgs.length && (
                        <div className="ch-thread-empty"><span><i className="mdi mdi-lock-outline"></i>Messages here are only visible to the people in this chat. Say hello 👋</span></div>
                    )}
                    {msgs.map((m, i) => {
                        const prev = msgs[i - 1]
                        const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString()
                        const firstOfRun = newDay || !prev || prev.type === 'system' || String(prev.sender?._id) !== String(m.sender?._id) || new Date(m.createdAt) - new Date(prev.createdAt) > 5 * 60000
                        return (
                            <React.Fragment key={m._id}>
                                {newDay && <div className="ch-day"><span>{dayLabel(m.createdAt)}</span></div>}
                                {m._id === unreadDividerAt && <div className="ch-unread-div"><span>{thread.unreadCount} unread message{thread.unreadCount === 1 ? '' : 's'}</span></div>}
                                {m.type === 'system' ? <div className="ch-system"><span>{m.text}</span></div> : (
                                    <Bubble m={m} me={me} conv={conv} first={firstOfRun} reads={thread.reads} flash={flash === m._id} highlight={find}
                                        menuOpen={menuFor === m._id} reactOpen={reactFor === m._id}
                                        menuUp={menuUp}
                                        onMenu={(e) => {
                                            e.stopPropagation(); setReactFor(null)
                                            const box = scroller.current?.getBoundingClientRect()
                                            const row = document.getElementById(`m-${m._id}`)?.getBoundingClientRect()
                                            setMenuUp(!!(box && row && row.top - box.top > box.height * 0.5))
                                            setMenuFor(menuFor === m._id ? null : m._id)
                                        }}
                                        onReactOpen={(e) => { e.stopPropagation(); setMenuFor(null); setReactFor(reactFor === m._id ? null : m._id) }}
                                        onReply={() => { setReply(m); setEditing(null); setMenuFor(null) }}
                                        onReact={(x) => react(m, x)}
                                        onCopy={() => { navigator.clipboard?.writeText(m.text || ''); setMenuFor(null) }}
                                        onEdit={() => { setEditing(m); setReply(null); setText(m.text); setMenuFor(null) }}
                                        onDelete={(scope) => remove(m, scope)}
                                        onStar={() => star(m)}
                                        onForward={() => { setForward(m); setMenuFor(null) }}
                                        onRetry={() => deliver(m.retry)}
                                        onQuote={() => m.replyTo && scrollToMsg(m.replyTo._id)}
                                        onImage={(src) => setLight({ src, name: m.file?.name || 'image' })} />
                                )}
                            </React.Fragment>
                        )
                    })}
                    {typing.length > 0 && <div className="ch-bubble-row in"><div className="ch-typing"><i></i><i></i><i></i></div></div>}
                </div>
                {!atBottom && (
                    <button type="button" className="ch-jump" onClick={toBottom} aria-label="Scroll to latest">
                        <i className="mdi mdi-chevron-down"></i>{thread.newCount > 0 && <span>{thread.newCount}</span>}
                    </button>
                )}

                {/* composer */}
                <footer className="ch-composer">
                    {(reply || editing) && (
                        <div className="ch-context">
                            <i className={`mdi ${editing ? 'mdi-pencil' : 'mdi-reply'}`}></i>
                            <div><b>{editing ? 'Edit message' : reply.mine ? 'Replying to yourself' : `Replying to ${personName(reply.sender)}`}</b><span>{(editing || reply).text || (editing || reply).file?.name}</span></div>
                            <button type="button" className="ch-icon-btn" onClick={() => { setReply(null); if (editing) { setEditing(null); setText('') } }} aria-label="Cancel"><i className="mdi mdi-close"></i></button>
                        </div>
                    )}
                    {attach && (
                        <div className="ch-attach">
                            {attach.preview ? <img src={attach.preview} alt="" /> : <i className="mdi mdi-file-document-outline"></i>}
                            <div><b>{attach.file.name}</b><span>{Math.max(1, Math.round(attach.file.size / 1024))} KB · add a caption below</span></div>
                            <button type="button" className="ch-icon-btn" onClick={() => setAttach(null)} aria-label="Remove attachment"><i className="mdi mdi-close"></i></button>
                        </div>
                    )}
                    {emoji && <EmojiPanel onPick={(e) => { setText((t) => t + e); input.current?.focus() }} onClose={() => setEmoji(false)} />}
                    <div className="ch-compose-row">
                        <button type="button" className="ch-icon-btn ch-emoji-btn" onClick={() => setEmoji((v) => !v)} aria-label="Emoji"><i className="mdi mdi-emoticon-happy-outline"></i></button>
                        {!editing && <button type="button" className="ch-icon-btn" onClick={() => fileRef.current?.click()} aria-label="Attach a file"><i className="mdi mdi-paperclip"></i></button>}
                        <input ref={fileRef} type="file" hidden accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.zip" onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = '' }} />
                        <AutoTextarea inputRef={input} value={text} onChange={onType} onKeyDown={onKey} onPaste={onPaste} placeholder={attach ? 'Add a caption…' : 'Type a message'} />
                        <button type="button" className="ch-send" onClick={send} disabled={!text.trim() && !attach} aria-label={editing ? 'Save' : 'Send'}><i className={`mdi ${editing ? 'mdi-check' : 'mdi-send'}`}></i></button>
                    </div>
                </footer>
                {dragging && <div className="ch-drop"><i className="mdi mdi-tray-arrow-down"></i>Drop to send</div>}
            </div>

            {info && <InfoPanel conv={conv} title={title} me={me} people={people} presence={presence} contacts={contacts} onClose={() => setInfo(false)} onUpdate={onUpdate} onJump={scrollToMsg} onImage={(src, name) => setLight({ src, name })} firmAdmin={firmAdmin} onDeleteGroup={onDeleteGroup} />}
            {light && <Lightbox src={light.src} name={light.name} onClose={() => setLight(null)} />}
            {forward && <ForwardDialog msg={forward} convs={convs} titleOf={titleOf} onClose={() => setForward(null)} />}
        </div>
    )
}

const AutoTextarea = ({ inputRef, value, onChange, ...rest }) => {
    useLayoutEffect(() => {
        const el = inputRef.current
        if (!el) return
        el.style.height = 'auto'
        el.style.height = `${Math.min(el.scrollHeight, 140)}px`
    }, [value, inputRef])
    return <textarea ref={inputRef} rows={1} className="ch-input" value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
}

/* ---------------- one message bubble ---------------- */
const Bubble = ({ m, me, conv, first, reads, flash, highlight, menuOpen, menuUp, reactOpen, onMenu, onReactOpen, onReply, onReact, onCopy, onEdit, onDelete, onStar, onForward, onRetry, onQuote, onImage }) => {
    const canEdit = m.mine && !m.deleted && m.type === 'text' && !m.pending && Date.now() - new Date(m.createdAt) < 60 * 60 * 1000
    const canDeleteAll = m.mine && !m.deleted && !m.pending && Date.now() - new Date(m.createdAt) < 24 * 60 * 60 * 1000
    const status = m.mine ? tickFor(m, reads, me) : null
    const touchTimer = useRef()
    const longPress = {
        onTouchStart: () => { touchTimer.current = setTimeout(() => onMenu({ stopPropagation() {} }), 450) },
        onTouchEnd: () => clearTimeout(touchTimer.current),
        onTouchMove: () => clearTimeout(touchTimer.current),
    }
    return (
        <div id={`m-${m._id}`} className={`ch-bubble-row ${m.mine ? 'out' : 'in'} ${first ? 'first' : ''} ${flash ? 'flash' : ''}`}>
            <div className={`ch-bubble ${m.deleted ? 'deleted' : ''} ${m.type}`} onDoubleClick={() => !m.deleted && !m.pending && onReact('👍')} onContextMenu={(e) => { if (!m.pending && !m.deleted) { e.preventDefault(); onMenu(e) } }} {...longPress}>
                {!m.deleted && !m.pending && (
                    <div className="ch-bubble-tools">
                        <button type="button" onClick={onReactOpen} aria-label="React"><i className="mdi mdi-emoticon-outline"></i></button>
                        <button type="button" onClick={onMenu} aria-label="Message options"><i className="mdi mdi-chevron-down"></i></button>
                    </div>
                )}
                {first && conv.type === 'group' && !m.mine && <SenderName sender={m.sender} />}
                {m.forwarded && !m.deleted && <span className="ch-fwd"><i className="mdi mdi-share"></i>Forwarded</span>}
                {m.replyTo && !m.deleted && <ReplyQuote reply={m.replyTo} me={me} onClick={onQuote} />}
                {m.deleted ? (
                    <span className="ch-deleted"><i className="mdi mdi-cancel"></i>{m.mine ? 'You deleted this message' : 'This message was deleted'}<MsgTime msg={m} /></span>
                ) : (
                    <>
                        {m.type === 'image' && (m.localPreview ? <img src={m.localPreview} alt="" className="ch-img" /> : m.file && <AuthImage file={m.file} className="ch-img" onOpen={onImage} />)}
                        {m.type === 'file' && (m.localFile ? <div className="ch-file pending"><i className="mdi mdi-loading mdi-spin"></i><span><b>{m.localFile.name}</b><small>Uploading…</small></span></div> : m.file && <FileCard file={m.file} />)}
                        {m.text && <span className="ch-text"><RichText text={m.text} highlight={highlight} /></span>}
                        <span className="ch-meta">{m.starred && <i className="mdi mdi-star ch-star"></i>}<MsgTime msg={m} />{m.mine && <Ticks status={status} />}</span>
                    </>
                )}
                {m.failed && <button type="button" className="ch-retry" onClick={onRetry}><i className="mdi mdi-refresh"></i>Not sent{m.error ? ` — ${m.error}` : ''}. Tap to retry</button>}
                {reactOpen && (
                    <div className="ch-react-bar" onClick={(e) => e.stopPropagation()}>
                        {QUICK_REACTIONS.map((x) => <button key={x} type="button" className={m.reactions?.some((r) => r.emoji === x && r.mine) ? 'on' : ''} onClick={() => onReact(x)}>{x}</button>)}
                    </div>
                )}
                {menuOpen && (
                    <div className={`ch-menu ch-msg-menu ${menuUp ? 'up' : ''}`} onClick={(e) => e.stopPropagation()}>
                        <div className="ch-menu-react">{QUICK_REACTIONS.map((x) => <button key={x} type="button" onClick={() => onReact(x)}>{x}</button>)}</div>
                        <button type="button" onClick={onReply}><i className="mdi mdi-reply"></i>Reply</button>
                        {m.text && <button type="button" onClick={onCopy}><i className="mdi mdi-content-copy"></i>Copy</button>}
                        <button type="button" onClick={onForward}><i className="mdi mdi-share"></i>Forward</button>
                        <button type="button" onClick={onStar}><i className={`mdi ${m.starred ? 'mdi-star-off-outline' : 'mdi-star-outline'}`}></i>{m.starred ? 'Unstar' : 'Star'}</button>
                        {canEdit && <button type="button" onClick={onEdit}><i className="mdi mdi-pencil-outline"></i>Edit</button>}
                        <button type="button" onClick={() => onDelete('me')}><i className="mdi mdi-delete-outline"></i>Delete for me</button>
                        {canDeleteAll && <button type="button" className="danger" onClick={() => onDelete('everyone')}><i className="mdi mdi-delete-forever-outline"></i>Delete for everyone</button>}
                    </div>
                )}
            </div>
            {m.reactions?.length > 0 && (
                <div className="ch-reactions">
                    {m.reactions.map((r) => <button key={r.emoji} type="button" className={r.mine ? 'mine' : ''} onClick={() => onReact(r.emoji)} title={r.mine ? 'Tap to remove' : ''}>{r.emoji}{r.count > 1 && <b>{r.count}</b>}</button>)}
                </div>
            )}
        </div>
    )
}

/* ---------------- right drawer: contact / group info ---------------- */
const InfoPanel = ({ conv, title, me, people, presence, contacts, onClose, onUpdate, onJump, onImage, firmAdmin, onDeleteGroup }) => {
    const [data, setData] = useState(null)
    const [tab, setTab] = useState('media')
    const [adding, setAdding] = useState(false)
    const [rename, setRename] = useState(null)
    const isGroup = conv.type === 'group'
    const other = !isGroup ? people[conv.others?.[0]] || {} : null
    const load = useCallback(() => chatApi('GET', `/chat/conversations/${conv._id}`).then((j) => setData(j.data)).catch(() => setData({ media: [], starred: [] })), [conv._id])
    useEffect(() => { load() }, [load, conv.updatedAt])
    const act = async (body, confirmText) => {
        if (confirmText && !(await confirmAction({ title: confirmText, confirmLabel: 'Continue', tone: 'warn' }))) return
        try { await onUpdate(body); load() } catch (e) { window.alert(e.message) }
    }
    const members = isGroup ? [me, ...(conv.others || [])] : []
    const images = (data?.media || []).filter((m) => m.type === 'image')
    const docs = (data?.media || []).filter((m) => m.type === 'file')

    return (
        <aside className="ch-info">
            <header className="ch-info-head">
                <button type="button" className="ch-icon-btn" onClick={onClose} aria-label="Close"><i className="mdi mdi-close"></i></button>
                <b>{isGroup ? 'Group info' : 'Contact info'}</b>
            </header>
            <div className="ch-info-body">
                <section className="ch-info-hero">
                    {isGroup ? <GroupAvatar name={conv.name} size={96} /> : <Avatar person={other} size={96} />}
                    {rename !== null ? (
                        <div className="ch-rename">
                            <input autoFocus value={rename} maxLength={80} onChange={(e) => setRename(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { act({ name: rename }); setRename(null) } }} />
                            <button type="button" className="ch-icon-btn" onClick={() => { act({ name: rename }); setRename(null) }} aria-label="Save name"><i className="mdi mdi-check"></i></button>
                        </div>
                    ) : (
                        <h3>{title}{isGroup && conv.isAdmin && <button type="button" className="ch-icon-btn sm" onClick={() => setRename(conv.name)} aria-label="Rename group"><i className="mdi mdi-pencil-outline"></i></button>}</h3>
                    )}
                    {isGroup ? <p>Group · {members.length} members</p> : (
                        <>
                            <p>{[other.designation, other.department].filter(Boolean).join(' · ')}</p>
                            <p className="ch-seen">{lastSeenLabel(presence[other._id] ?? other.lastSeenAt)}</p>
                            {other._id && <Link to={`/employees/${other._id}`} className="ch-link"><i className="mdi mdi-account-outline"></i>View profile {other.employeeId ? `· ${other.employeeId}` : ''}</Link>}
                        </>
                    )}
                    {isGroup && conv.description && <p className="ch-desc">{conv.description}</p>}
                </section>

                <section className="ch-info-sec">
                    <div className="ch-tabs">
                        {[['media', `Media ${images.length}`], ['docs', `Docs ${docs.length}`], ['starred', `Starred ${(data?.starred || []).length}`]].map(([k, l]) => <button key={k} type="button" className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
                    </div>
                    {!data ? <div className="ch-loading sm"><i className="mdi mdi-loading mdi-spin"></i></div> : tab === 'media' ? (
                        images.length ? <div className="ch-media-grid">{images.map((m) => <AuthImage key={m._id} file={m.file} className="ch-media" onOpen={(src) => onImage(src, m.file.name)} />)}</div> : <p className="ch-muted">No photos shared yet.</p>
                    ) : tab === 'docs' ? (
                        docs.length ? <div className="ch-doc-list">{docs.map((m) => <FileCard key={m._id} file={m.file} />)}</div> : <p className="ch-muted">No documents shared yet.</p>
                    ) : (
                        (data.starred || []).length ? (
                            <ul className="ch-starred">{data.starred.map((m) => <li key={m._id}><button type="button" onClick={() => onJump(m._id)}><b>{m.mine ? 'You' : personName(m.sender)}</b><span>{m.text || m.file?.name}</span><small>{timeShort(m.createdAt)}</small></button></li>)}</ul>
                        ) : <p className="ch-muted">Long-press or use the arrow on a message and choose Star to keep it here.</p>
                    )}
                </section>

                {isGroup && (
                    <section className="ch-info-sec">
                        <h4>{members.length} members</h4>
                        {conv.isAdmin && (
                            adding ? <AddMembers contacts={contacts.filter((c) => !members.includes(c._id))} onDone={(ids) => { setAdding(false); if (ids.length) act({ addIds: ids }) }} />
                                : <button type="button" className="ch-member add" onClick={() => setAdding(true)}><span className="ch-add-ic"><i className="mdi mdi-account-plus"></i></span><b>Add members</b></button>
                        )}
                        {members.map((id) => {
                            const p = id === me ? { _id: me, firstName: 'You', lastName: '' } : people[id] || { _id: id }
                            const admin = conv.admins?.includes(id)
                            return (
                                <div key={id} className="ch-member">
                                    <Avatar person={people[id] || p} size={38} />
                                    <span><b>{id === me ? 'You' : personName(p)}</b><small>{id === me ? '' : people[id]?.designation || ''}</small></span>
                                    {admin && <em>Admin</em>}
                                    {conv.isAdmin && id !== me && (
                                        <span className="ch-member-act">
                                            {!admin ? <button type="button" onClick={() => act({ makeAdmin: id })}>Make admin</button> : conv.admins.length > 1 && <button type="button" onClick={() => act({ removeAdmin: id })}>Dismiss admin</button>}
                                            <button type="button" className="danger" onClick={() => act({ removeId: id }, `Remove ${personName(p)} from the group?`)}>Remove</button>
                                        </span>
                                    )}
                                </div>
                            )
                        })}
                    </section>
                )}

                <section className="ch-info-sec ch-info-actions">
                    <button type="button" onClick={() => act({ muted: !conv.muted })}><i className={`mdi ${conv.muted ? 'mdi-bell-outline' : 'mdi-bell-off-outline'}`}></i>{conv.muted ? 'Unmute notifications' : 'Mute notifications'}</button>
                    <button type="button" onClick={() => act({ pinned: !conv.pinned })}><i className="mdi mdi-pin-outline"></i>{conv.pinned ? 'Unpin chat' : 'Pin chat'}</button>
                    <button type="button" onClick={() => act({ clear: true }, 'Clear all messages in this chat for you? Others keep their copy.')}><i className="mdi mdi-broom"></i>Clear chat</button>
                    {isGroup && <button type="button" className="danger" onClick={() => act({ leave: true }, `Leave “${conv.name}”?`)}><i className="mdi mdi-exit-to-app"></i>Exit group</button>}
                    {isGroup && (conv.isAdmin || firmAdmin) && (
                        <button type="button" className="danger" onClick={async () => { if (await confirmAction({ title: `Delete “${conv.name}” for everyone?`, message: 'All its messages and files will be removed. This can\'t be undone.', confirmLabel: 'Delete group', requireText: conv.name })) { try { await onDeleteGroup() } catch (e) { window.alert(e.message) } } }}><i className="mdi mdi-delete-outline"></i>Delete group</button>
                    )}
                </section>
            </div>
        </aside>
    )
}

const AddMembers = ({ contacts, onDone }) => {
    const [pick, setPick] = useState([])
    const [q, setQ] = useState('')
    const list = contacts.filter((c) => personName(c).toLowerCase().includes(q.toLowerCase())).slice(0, 30)
    return (
        <div className="ch-addm">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" autoFocus />
            <div className="ch-addm-list">
                {list.map((c) => (
                    <label key={c._id}><input type="checkbox" checked={pick.includes(c._id)} onChange={(e) => setPick((p) => (e.target.checked ? [...p, c._id] : p.filter((x) => x !== c._id)))} /><Avatar person={c} size={28} /><span>{personName(c)}<small>{c.designation}</small></span></label>
                ))}
            </div>
            <div className="ch-addm-foot"><button type="button" onClick={() => onDone([])}>Cancel</button><button type="button" className="ch-primary sm" onClick={() => onDone(pick)} disabled={!pick.length}>Add {pick.length || ''}</button></div>
        </div>
    )
}

/* ---------------- forward a message to other chats ---------------- */
const ForwardDialog = ({ msg, convs, titleOf, onClose }) => {
    const [pick, setPick] = useState([])
    const [busy, setBusy] = useState(false)
    const go = async () => {
        setBusy(true)
        try { for (const id of pick) await chatApi('POST', `/chat/conversations/${id}/messages`, { forwardOf: msg._id }) } catch (e) { window.alert(e.message) }
        setBusy(false); onClose()
    }
    return (
        <div className="ch-modal" onClick={onClose}>
            <div className="ch-modal-card" onClick={(e) => e.stopPropagation()}>
                <header><b>Forward message</b><button type="button" className="ch-icon-btn" onClick={onClose} aria-label="Close"><i className="mdi mdi-close"></i></button></header>
                <p className="ch-fwd-preview">{msg.text || msg.file?.name}</p>
                <div className="ch-addm-list">
                    {convs.filter((c) => !c.archived).map((c) => (
                        <label key={c._id}><input type="checkbox" checked={pick.includes(c._id)} onChange={(e) => setPick((p) => (e.target.checked ? [...p, c._id] : p.filter((x) => x !== c._id)))} /><span>{titleOf(c)}<small>{c.type === 'group' ? 'Group' : ''}</small></span></label>
                    ))}
                </div>
                <footer><button type="button" className="ch-primary" disabled={!pick.length || busy} onClick={go}><i className="mdi mdi-send"></i>{busy ? 'Sending…' : `Send${pick.length ? ` to ${pick.length}` : ''}`}</button></footer>
            </div>
        </div>
    )
}

/* ---------------- left overlays: new chat / new group ---------------- */
const NewChatPanel = ({ contacts, presence, onBack, onPick, onGroup }) => {
    const [q, setQ] = useState('')
    const list = contacts.filter((c) => [personName(c), c.designation, c.department, c.employeeId].join(' ').toLowerCase().includes(q.toLowerCase()))
    let letter = ''
    return (
        <div className="ch-overlay">
            <header className="ch-overlay-head"><button type="button" className="ch-icon-btn" onClick={onBack} aria-label="Back"><i className="mdi mdi-arrow-left"></i></button><b>New chat</b></header>
            <div className="ch-search"><i className="mdi mdi-magnify"></i><input autoFocus type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, role or employee ID" /></div>
            <div className="ch-list">
                <button type="button" className="ch-row" onClick={onGroup}><span className="ch-add-ic big"><i className="mdi mdi-account-group"></i></span><span className="ch-row-main"><span className="ch-row-top"><b>New group</b></span></span></button>
                <div className="ch-list-label">Your team &amp; officials</div>
                <p className="ch-scope-note"><i className="mdi mdi-shield-account-outline"></i>You can message your reporting line, people who report to you, teammates on your audits, and HR / Directors / Partners.</p>
                {list.map((p) => {
                    const l = (p.firstName || '?')[0].toUpperCase()
                    const head = l !== letter ? (letter = l) : null
                    return (
                        <React.Fragment key={p._id}>
                            {head && <div className="ch-letter">{head}</div>}
                            <button type="button" className="ch-row" onClick={() => onPick(p._id)}>
                                <span className="ch-avatar-wrap"><Avatar person={p} size={44} />{isOnline(presence[p._id] ?? p.lastSeenAt) && <i className="ch-online"></i>}</span>
                                <span className="ch-row-main"><span className="ch-row-top"><b>{personName(p)}</b></span><span className="ch-row-sub">{[p.designation, p.department].filter(Boolean).join(' · ')}</span></span>
                            </button>
                        </React.Fragment>
                    )
                })}
            </div>
        </div>
    )
}

const NewGroupPanel = ({ contacts, onBack, onCreate }) => {
    const [step, setStep] = useState(1)
    const [pick, setPick] = useState([])
    const [q, setQ] = useState('')
    const [name, setName] = useState('')
    const [desc, setDesc] = useState('')
    const [busy, setBusy] = useState(false)
    const chosen = contacts.filter((c) => pick.includes(c._id))
    const list = contacts.filter((c) => [personName(c), c.designation, c.department].join(' ').toLowerCase().includes(q.toLowerCase()))
    const create = async () => {
        setBusy(true)
        try { await onCreate(name.trim(), pick, desc.trim()) } catch (e) { window.alert(e.message); setBusy(false) }
    }
    return (
        <div className="ch-overlay">
            <header className="ch-overlay-head"><button type="button" className="ch-icon-btn" onClick={step === 1 ? onBack : () => setStep(1)} aria-label="Back"><i className="mdi mdi-arrow-left"></i></button><b>{step === 1 ? 'Add group members' : 'New group'}</b></header>
            {step === 1 ? (
                <>
                    {chosen.length > 0 && <div className="ch-chips">{chosen.map((c) => <button key={c._id} type="button" onClick={() => setPick((p) => p.filter((x) => x !== c._id))}><Avatar person={c} size={22} />{c.firstName}<i className="mdi mdi-close"></i></button>)}</div>}
                    <div className="ch-search"><i className="mdi mdi-magnify"></i><input autoFocus type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" /></div>
                    <div className="ch-list">
                        {list.map((p) => (
                            <label key={p._id} className={`ch-row pick ${pick.includes(p._id) ? 'on' : ''}`}>
                                <input type="checkbox" checked={pick.includes(p._id)} onChange={(e) => setPick((x) => (e.target.checked ? [...x, p._id] : x.filter((y) => y !== p._id)))} />
                                <Avatar person={p} size={42} />
                                <span className="ch-row-main"><span className="ch-row-top"><b>{personName(p)}</b></span><span className="ch-row-sub">{[p.designation, p.department].filter(Boolean).join(' · ')}</span></span>
                                <i className="mdi mdi-check-circle ch-pick-ic"></i>
                            </label>
                        ))}
                    </div>
                    {pick.length > 0 && <button type="button" className="ch-fab" onClick={() => setStep(2)} aria-label="Next"><i className="mdi mdi-arrow-right"></i></button>}
                </>
            ) : (
                <div className="ch-group-form">
                    <GroupAvatar name={name || 'Group'} size={96} />
                    <label>Group name<input autoFocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sunrise Textiles — Statutory FY25" /></label>
                    <label>Description <small>(optional)</small><input value={desc} maxLength={300} onChange={(e) => setDesc(e.target.value)} placeholder="What's this group for?" /></label>
                    <p className="ch-muted">{pick.length} member{pick.length === 1 ? '' : 's'} + you. You'll be the group admin.</p>
                    <button type="button" className="ch-primary" disabled={!name.trim() || busy} onClick={create}><i className="mdi mdi-check"></i>{busy ? 'Creating…' : 'Create group'}</button>
                </div>
            )}
        </div>
    )
}

/* ---------------- firm admins: every group in one place ---------------- */
const ManageGroupsPanel = ({ contacts, onBack, onNew, onDeleted, onOpen }) => {
    const [groups, setGroups] = useState(null)
    const [openId, setOpenId] = useState(null)
    const [adding, setAdding] = useState(null)
    const [rename, setRename] = useState(null)
    const [q, setQ] = useState('')
    const [err, setErr] = useState('')
    const load = useCallback(() => chatApi('GET', '/chat/admin/groups').then((j) => setGroups(j.data)).catch((e) => { setErr(e.message); setGroups([]) }), [])
    useEffect(() => { load() }, [load])
    const update = async (id, body) => {
        try { const j = await chatApi('PUT', `/chat/admin/groups/${id}`, body); setGroups((gs) => gs.map((g) => (g._id === id ? j.data : g))) } catch (e) { window.alert(e.message) }
    }
    const remove = async (g) => {
        if (!(await confirmAction({ title: `Delete “${g.name}” for everyone?`, message: 'All its messages and files will be removed. This can\'t be undone.', confirmLabel: 'Delete group', requireText: g.name }))) return
        try { await chatApi('DELETE', `/chat/conversations/${g._id}`); setGroups((gs) => gs.filter((x) => x._id !== g._id)); onDeleted(g._id) } catch (e) { window.alert(e.message) }
    }
    const list = (groups || []).filter((g) => !q || g.name.toLowerCase().includes(q.toLowerCase()) || g.participants.some((p) => personName(p).toLowerCase().includes(q.toLowerCase())))
    return (
        <div className="ch-overlay">
            <header className="ch-overlay-head"><button type="button" className="ch-icon-btn" onClick={onBack} aria-label="Back"><i className="mdi mdi-arrow-left"></i></button><b>Manage groups</b></header>
            <div className="ch-manage-top">
                <p><i className="mdi mdi-shield-account-outline"></i>As HR / Admin you can rename any group, add or remove members, change group admins and delete groups.</p>
                <button type="button" className="ch-primary sm" onClick={onNew}><i className="mdi mdi-account-multiple-plus-outline"></i>New group</button>
            </div>
            <div className="ch-search"><i className="mdi mdi-magnify"></i><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search groups or members" /></div>
            <div className="ch-list">
                {err && <div className="ch-error">{err}</div>}
                {!groups && <div className="ch-loading sm"><i className="mdi mdi-loading mdi-spin"></i></div>}
                {groups && !list.length && <div className="ch-list-empty"><i className="mdi mdi-account-group-outline"></i><p>{groups.length ? 'No groups match.' : 'No groups yet.'}</p></div>}
                {list.map((g) => {
                    const isOpen = openId === g._id
                    return (
                        <div key={g._id} className={`ch-mg ${isOpen ? 'open' : ''}`}>
                            <button type="button" className="ch-row" onClick={() => setOpenId(isOpen ? null : g._id)}>
                                <GroupAvatar name={g.name} size={44} />
                                <span className="ch-row-main">
                                    <span className="ch-row-top"><b>{g.name}</b><small>{listTime(g.lastActivity)}</small></span>
                                    <span className="ch-row-sub"><span className="ch-preview">{g.participants.length} members · {g.messages} messages{g.createdBy?.firstName ? ` · by ${personName(g.createdBy)}` : ''}</span><i className={`mdi ${isOpen ? 'mdi-chevron-up' : 'mdi-chevron-down'}`}></i></span>
                                </span>
                            </button>
                            {isOpen && (
                                <div className="ch-mg-body">
                                    {rename && rename.id === g._id ? (
                                        <div className="ch-rename left">
                                            <input autoFocus value={rename.name} maxLength={80} onChange={(e) => setRename({ ...rename, name: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { update(g._id, { name: rename.name }); setRename(null) } }} />
                                            <button type="button" className="ch-icon-btn sm" onClick={() => { update(g._id, { name: rename.name }); setRename(null) }} aria-label="Save name"><i className="mdi mdi-check"></i></button>
                                        </div>
                                    ) : null}
                                    <div className="ch-mg-actions">
                                        <button type="button" onClick={() => setRename({ id: g._id, name: g.name })}><i className="mdi mdi-pencil-outline"></i>Rename</button>
                                        <button type="button" onClick={() => setAdding(adding === g._id ? null : g._id)}><i className="mdi mdi-account-plus-outline"></i>Add members</button>
                                        <button type="button" onClick={() => onOpen(g._id)}><i className="mdi mdi-message-text-outline"></i>Open</button>
                                        <button type="button" className="danger" onClick={() => remove(g)}><i className="mdi mdi-delete-outline"></i>Delete</button>
                                    </div>
                                    {adding === g._id && <AddMembers contacts={contacts.filter((c) => !g.participants.some((p) => p._id === c._id))} onDone={(ids) => { setAdding(null); if (ids.length) update(g._id, { addIds: ids }) }} />}
                                    {g.participants.map((p) => {
                                        const admin = g.admins.includes(p._id)
                                        return (
                                            <div key={p._id} className="ch-member">
                                                <Avatar person={p} size={34} />
                                                <span><b>{personName(p)}</b><small>{p.designation || ''}</small></span>
                                                {admin && <em>Admin</em>}
                                                <span className="ch-member-act">
                                                    {!admin ? <button type="button" onClick={() => update(g._id, { makeAdmin: p._id })}>Make admin</button> : g.admins.length > 1 && <button type="button" onClick={() => update(g._id, { removeAdmin: p._id })}>Dismiss</button>}
                                                    <button type="button" className="danger" onClick={async () => { if (await confirmAction({ title: `Remove ${personName(p)} from “${g.name}”?`, confirmLabel: 'Remove' })) update(g._id, { removeId: p._id }) }}>Remove</button>
                                                </span>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
