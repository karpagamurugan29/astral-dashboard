import { API_URL } from '../../utils/Constants'
import { TOKEN_KEY } from '../common/ApiCall'

// Chat talks to the API directly (it polls every few seconds, which doesn't fit the
// request/response sagas). Same auth as everywhere: cookie, or the Bearer token on phones.
const token = () => { try { return localStorage.getItem(TOKEN_KEY) } catch { return null } }
const auth = () => (token() ? { Authorization: `Bearer ${token()}` } : {})

export const chatApi = async (method, path, body) => {
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData
    const res = await fetch(`${API_URL}${path}`, {
        method,
        credentials: 'include',
        headers: { ...auth(), ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    })
    const json = await res.json().catch(() => ({ success: false, message: `Request failed (${res.status})` }))
    if (res.status === 401) { try { localStorage.removeItem('session'); localStorage.removeItem(TOKEN_KEY) } catch { /* ignore */ } window.location.assign('/?expired=1') }
    if (!json.success) throw new Error(json.message || 'Something went wrong')
    return json
}

// Files are private: fetch with the token and keep one object URL per file.
const blobs = new Map()
export const fileBlobUrl = async (url) => {
    if (blobs.has(url)) return blobs.get(url)
    const p = fetch(`${API_URL}${url}`, { credentials: 'include', headers: auth() }).then(async (r) => {
        if (!r.ok) throw new Error('File not available')
        return URL.createObjectURL(await r.blob())
    })
    blobs.set(url, p)
    p.catch(() => blobs.delete(url))
    return p
}

export const downloadFile = async (file) => {
    const href = await fileBlobUrl(file.url)
    const a = document.createElement('a')
    a.href = href
    a.download = file.name || 'file'
    document.body.appendChild(a)
    a.click()
    a.remove()
}

/* ---------------- formatting ---------------- */
const sameDay = (a, b) => a.toDateString() === b.toDateString()
export const timeShort = (d) => new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
export const listTime = (d) => {
    if (!d) return ''
    const t = new Date(d), now = new Date()
    if (sameDay(t, now)) return timeShort(t)
    const y = new Date(now); y.setDate(y.getDate() - 1)
    if (sameDay(t, y)) return 'Yesterday'
    if (now - t < 6 * 864e5) return t.toLocaleDateString([], { weekday: 'long' })
    return t.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: '2-digit' })
}
export const dayLabel = (d) => {
    const t = new Date(d), now = new Date()
    if (sameDay(t, now)) return 'Today'
    const y = new Date(now); y.setDate(y.getDate() - 1)
    if (sameDay(t, y)) return 'Yesterday'
    if (now - t < 6 * 864e5) return t.toLocaleDateString([], { weekday: 'long' })
    return t.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })
}
export const ONLINE_MS = 70 * 1000
export const isOnline = (seen) => !!seen && Date.now() - new Date(seen).getTime() < ONLINE_MS
export const lastSeenLabel = (seen) => {
    if (!seen) return ''
    if (isOnline(seen)) return 'online'
    const t = new Date(seen), now = new Date()
    if (sameDay(t, now)) return `last seen today at ${timeShort(t)}`
    const y = new Date(now); y.setDate(y.getDate() - 1)
    if (sameDay(t, y)) return `last seen yesterday at ${timeShort(t)}`
    return `last seen ${t.toLocaleDateString([], { day: 'numeric', month: 'short' })}`
}
export const sizeLabel = (b = 0) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)
export const personName = (p) => `${p?.firstName || ''} ${p?.lastName || ''}`.trim() || 'Unknown'

// sent → delivered → read, from the other members' read state
export const tickFor = (msg, reads, me) => {
    if (msg.pending) return msg.failed ? 'failed' : 'sending'
    const others = (reads || []).filter((r) => r.user !== me)
    if (!others.length) return 'read'
    const t = new Date(msg.createdAt).getTime()
    if (others.every((r) => r.lastReadAt && new Date(r.lastReadAt).getTime() >= t)) return 'read'
    if (others.every((r) => (r.lastFetchAt && new Date(r.lastFetchAt).getTime() >= t) || (r.lastReadAt && new Date(r.lastReadAt).getTime() >= t))) return 'delivered'
    return 'sent'
}

// stable colour per person for group sender names
const NAME_COLORS = ['#e11d48', '#7c3aed', '#0284c7', '#059669', '#d97706', '#db2777', '#4f46e5', '#0d9488', '#ea580c', '#65a30d']
export const nameColor = (id = '') => NAME_COLORS[[...String(id)].reduce((s, c) => s + c.charCodeAt(0), 0) % NAME_COLORS.length]

/* ---------------- unread badge shared by header + bottom bar (one poll for both) ---------------- */
let unread = 0, timer = null
const subs = new Set()
const poll = async () => {
    try { const j = await chatApi('GET', '/chat/unread'); setUnread(j.data.total) } catch { /* offline */ }
}
export const setUnread = (n) => {
    unread = n
    subs.forEach((f) => f(n))
}
export const subscribeUnread = (fn) => {
    subs.add(fn)
    fn(unread)
    if (!timer) { poll(); timer = setInterval(() => { if (document.visibilityState === 'visible') poll() }, 20000) }
    return () => { subs.delete(fn); if (!subs.size) { clearInterval(timer); timer = null } }
}
