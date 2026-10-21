import React, { useEffect, useRef, useState } from 'react'
import { Avatar } from '../../../components/people/PeopleUI'
import { fileBlobUrl, downloadFile, timeShort, sizeLabel, personName, nameColor, isOnline } from '../../../components/chat/chatApi'

/* Small building blocks for the chat screen. */

export const EMOJI_GROUPS = [
    ['Smileys', '😀 😃 😄 😁 😆 😅 😂 🤣 😊 🙂 😉 😍 🥰 😘 😋 😎 🤩 🥳 🤔 🤨 😐 😑 🙄 😏 😴 😌 😜 🤪 😇 🤗 🤭 🤫 😬 😮 😯 😲 😳 🥺 😢 😭 😤 😠 😡 🤯 😱 😓 🤒 🤕 🤧 😷'],
    ['Gestures', '👍 👎 👏 🙌 🙏 🤝 👌 ✌️ 🤞 🤟 👊 ✊ 💪 👋 🤙 👉 👈 👆 👇 ☝️ ✋ 🖐️ 🫡'],
    ['Work', '✅ ☑️ ❌ ⚠️ ❗ ❓ 💯 🔥 ⭐ 🌟 ✨ 🎉 🎊 🏆 🥇 📌 📎 📝 📄 📊 📈 📉 🗂️ 📁 📅 ⏰ ⌛ 💼 🧾 💰 💳 🏦 🧮 🔍 🔒 🔑 💡 📞 📧 💻 🖨️ 🚗 ✈️ ☕ 🍵 🍕 🎂'],
    ['Hearts', '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💔 💕 💖 💗 💓 💞'],
]
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏']

export const GroupAvatar = ({ name = '', size = 40 }) => {
    const initials = (name.match(/[A-Za-z0-9]+/g) || []).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'G'
    return <span className="ch-gavatar" style={{ width: size, height: size, fontSize: size * 0.36, background: `${nameColor(name)}1f`, color: nameColor(name) }}><i className="mdi mdi-account-group"></i><b>{initials}</b></span>
}

export const ConvAvatar = ({ conv, peopleById, presence, size = 46 }) => {
    if (conv.type === 'group') return <GroupAvatar name={conv.name} size={size} />
    const other = peopleById[conv.others?.[0]] || {}
    return (
        <span className="ch-avatar-wrap">
            <Avatar person={other} size={size} />
            {isOnline(presence[other._id] ?? other.lastSeenAt) && <i className="ch-online" aria-label="online"></i>}
        </span>
    )
}

export const Ticks = ({ status }) => {
    if (!status) return null
    if (status === 'sending') return <i className="mdi mdi-clock-outline ch-tick" title="Sending"></i>
    if (status === 'failed') return <i className="mdi mdi-alert-circle ch-tick failed" title="Not sent"></i>
    if (status === 'sent') return <i className="mdi mdi-check ch-tick" title="Sent"></i>
    return <i className={`mdi mdi-check-all ch-tick ${status === 'read' ? 'read' : ''}`} title={status === 'read' ? 'Read' : 'Delivered'}></i>
}

// Links become clickable; everything else is plain text (React escapes it).
const URL_RX = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g
export const RichText = ({ text, highlight }) => {
    const parts = String(text || '').split(URL_RX)
    const mark = (s, k) => {
        if (!highlight || highlight.length < 2) return <React.Fragment key={k}>{s}</React.Fragment>
        const rx = new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig')
        return <React.Fragment key={k}>{s.split(rx).map((x, i) => (i % 2 ? <mark key={i}>{x}</mark> : x))}</React.Fragment>
    }
    return parts.map((p, i) => (i % 2 ? <a key={i} href={p} target="_blank" rel="noreferrer noopener">{p}</a> : mark(p, i)))
}

export const AuthImage = ({ file, onOpen, className = '' }) => {
    const [src, setSrc] = useState(null)
    const [err, setErr] = useState(false)
    useEffect(() => {
        let live = true
        fileBlobUrl(file.url).then((u) => live && setSrc(u)).catch(() => live && setErr(true))
        return () => { live = false }
    }, [file.url])
    if (err) return <div className={`ch-img-missing ${className}`}><i className="mdi mdi-image-off-outline"></i>Image unavailable</div>
    if (!src) return <div className={`ch-img-loading ${className}`}><i className="mdi mdi-loading mdi-spin"></i></div>
    return <img src={src} alt={file.name} className={className} onClick={() => onOpen?.(src)} loading="lazy" />
}

const fileIcon = (mime = '', name = '') => {
    if (/pdf/.test(mime) || /\.pdf$/i.test(name)) return ['mdi-file-pdf-box', '#dc2626']
    if (/word/.test(mime) || /\.docx?$/i.test(name)) return ['mdi-file-word', '#2563eb']
    if (/sheet|excel|csv/.test(mime) || /\.(xlsx?|csv)$/i.test(name)) return ['mdi-file-excel', '#059669']
    if (/presentation|powerpoint/.test(mime) || /\.pptx?$/i.test(name)) return ['mdi-file-powerpoint', '#ea580c']
    if (/zip/.test(mime)) return ['mdi-folder-zip', '#7c3aed']
    return ['mdi-file-document', '#475569']
}

export const FileCard = ({ file }) => {
    const [ic, col] = fileIcon(file.mime, file.name)
    const [busy, setBusy] = useState(false)
    return (
        <button type="button" className="ch-file" onClick={async () => { setBusy(true); try { await downloadFile(file) } catch { window.alert('This file is no longer available.') } setBusy(false) }}>
            <i className={`mdi ${ic}`} style={{ color: col }}></i>
            <span><b>{file.name}</b><small>{sizeLabel(file.size)} · {String(file.name.split('.').pop() || '').toUpperCase()}</small></span>
            <i className={`mdi ${busy ? 'mdi-loading mdi-spin' : 'mdi-download-circle-outline'} ch-file-dl`}></i>
        </button>
    )
}

export const EmojiPanel = ({ onPick, onClose }) => {
    const ref = useRef()
    useEffect(() => {
        const off = (e) => { if (ref.current && !ref.current.contains(e.target) && !e.target.closest('.ch-emoji-btn')) onClose() }
        document.addEventListener('mousedown', off)
        return () => document.removeEventListener('mousedown', off)
    }, [onClose])
    return (
        <div className="ch-emoji-panel" ref={ref}>
            {EMOJI_GROUPS.map(([label, list]) => (
                <div key={label}>
                    <h6>{label}</h6>
                    <div className="ch-emoji-grid">{list.split(' ').map((e) => <button key={e} type="button" onClick={() => onPick(e)}>{e}</button>)}</div>
                </div>
            ))}
        </div>
    )
}

export const Lightbox = ({ src, name, onClose }) => {
    useEffect(() => {
        const k = (e) => e.key === 'Escape' && onClose()
        window.addEventListener('keydown', k)
        return () => window.removeEventListener('keydown', k)
    }, [onClose])
    return (
        <div className="ch-lightbox" onClick={onClose} role="dialog" aria-label="Image preview">
            <div className="ch-lightbox-bar" onClick={(e) => e.stopPropagation()}>
                <span>{name}</span>
                <a href={src} download={name} className="ch-icon-btn light" aria-label="Download"><i className="mdi mdi-download"></i></a>
                <button type="button" className="ch-icon-btn light" onClick={onClose} aria-label="Close"><i className="mdi mdi-close"></i></button>
            </div>
            <img src={src} alt={name} onClick={(e) => e.stopPropagation()} />
        </div>
    )
}

export const SenderName = ({ sender }) => <span className="ch-sender" style={{ color: nameColor(sender?._id) }}>{personName(sender)}</span>

export const ReplyQuote = ({ reply, me, onClick }) => (
    <button type="button" className="ch-quote" style={{ '--q': nameColor(reply.sender?._id) }} onClick={onClick}>
        <b>{reply.sender?._id === me ? 'You' : personName(reply.sender)}</b>
        <span>{reply.text}</span>
    </button>
)

export const MsgTime = ({ msg }) => <span className="ch-time">{msg.editedAt && <em>edited</em>}{timeShort(msg.createdAt)}</span>
