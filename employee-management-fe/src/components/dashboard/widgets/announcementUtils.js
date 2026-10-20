// Shared by the Announcements page and the dashboard Announcements widget so both
// show authors, audiences and times the same way.

export const AUDIENCES = [
    { value: 'Everyone', icon: 'mdi-earth', color: '#0ea5e9' },
    { value: 'Managers', icon: 'mdi-account-tie-outline', color: '#f59e0b' },
    { value: 'Department', icon: 'mdi-office-building-outline', color: '#8b5cf6' },
]
export const audienceMeta = (value) => AUDIENCES.find((a) => a.value === value) || AUDIENCES[0]

const AVATAR_COLORS = ['#0b0f19', '#8b5cf6', '#0ea5e9', '#10b981', '#f59e0b', '#f43f5e', '#06b6d4']
export const avatarColor = (seed = '') => AVATAR_COLORS[[...seed].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % AVATAR_COLORS.length]
export const initials = (p) => `${p?.firstName?.[0] || ''}${p?.lastName?.[0] || ''}`.toUpperCase() || 'HR'
export const authorName = (p) => `${p?.firstName || ''} ${p?.lastName || ''}`.trim() || 'HR Team'

export const DAY = 24 * 60 * 60 * 1000

export const relativeTime = (value) => {
    const diff = Date.now() - new Date(value).getTime()
    const mins = Math.round(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.round(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.round(hours / 24)
    if (days < 7) return `${days}d ago`
    return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

// Pinned first, then newest first.
export const sortAnnouncements = (list) =>
    [...(list || [])].sort((a, b) => (b.pinned - a.pinned) || (new Date(b.createdAt) - new Date(a.createdAt)))
