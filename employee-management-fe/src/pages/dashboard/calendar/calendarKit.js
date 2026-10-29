// Shared helpers for the Calendar screens: categories and colours, date maths on the viewer's
// clock, and the reminder choices offered when planning an event.

export const DAY = 864e5
export const TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata' } catch { return 'Asia/Kolkata' } })()

// What a calendar item is, for filters and colours.
export const CATS = {
    Meeting: { label: 'Meetings', color: '#2563eb', icon: 'mdi-account-group-outline' },
    Reminder: { label: 'Reminders', color: '#d97706', icon: 'mdi-bell-ring-outline' },
    Deadline: { label: 'Deadlines', color: '#dc2626', icon: 'mdi-flag-checkered' },
    'Project event': { label: 'Project events', color: '#7c3aed', icon: 'mdi-folder-star-outline' },
    Personal: { label: 'Personal plans', color: '#db2777', icon: 'mdi-heart-outline' },
    todo: { label: 'To-dos', color: '#0ea5e9', icon: 'mdi-checkbox-marked-circle-outline' },
    holiday: { label: 'Holidays', color: '#e11d48', icon: 'mdi-party-popper' },
    leave: { label: 'Leave', color: '#059669', icon: 'mdi-beach' },
}
// Plans for life outside work. They're private (only you and anyone you invite) and never on a project.
export const PERSONAL = {
    'Personal meeting': { color: '#0891b2', icon: 'mdi-account-multiple-outline', hint: 'Catch-up, appointment' },
    Family: { color: '#db2777', icon: 'mdi-home-heart', hint: 'Family time, school, functions' },
    Health: { color: '#16a34a', icon: 'mdi-stethoscope', hint: 'Doctor, medicines, check-ups' },
    Travel: { color: '#0284c7', icon: 'mdi-airplane', hint: 'Trips, tickets, packing' },
    Birthday: { color: '#e11d48', icon: 'mdi-cake-variant', hint: 'Repeats every year', repeat: 'yearly', reminders: [1440, 0], allDay: true },
    Fitness: { color: '#ea580c', icon: 'mdi-run', hint: 'Gym, walk, yoga' },
    Bills: { color: '#ca8a04', icon: 'mdi-cash-multiple', hint: 'Rent, EMI, insurance — repeats monthly', repeat: 'monthly', reminders: [2880, 0], allDay: true },
    Study: { color: '#7c3aed', icon: 'mdi-book-open-variant', hint: 'Courses, exams, reading' },
    Other: { color: '#475569', icon: 'mdi-star-outline', hint: 'Anything else you want to plan' },
}
export const PERSONAL_TYPES = Object.keys(PERSONAL)
export const isPersonalType = (t) => t === 'Personal' || PERSONAL_TYPES.includes(t)
export const catOf = (i) => (i.kind === 'event' ? (isPersonalType(i.eventType) ? 'Personal' : i.eventType) : i.kind === 'task' ? 'Deadline' : i.kind)
export const colorOf = (i) => (i.kind === 'task' && i.overdue ? '#b91c1c' : (i.kind === 'event' && PERSONAL[i.eventType]?.color) || (CATS[catOf(i)] || CATS.Meeting).color)
export const iconOf = (i) => (i.kind === 'event' && PERSONAL[i.eventType]?.icon) || (CATS[catOf(i)] || CATS.Meeting).icon
export const typeMeta = (t) => PERSONAL[t] || CATS[t] || CATS.Meeting
export const EVENT_TYPES = ['Meeting', 'Reminder', 'Deadline', 'Project event']
// Work / personal side of the calendar: personal plans and to-dos are "personal"; the rest is work
export const sideOf = (i) => (i.personal || i.kind === 'todo' ? 'personal' : 'work')
export const PRIORITIES = [['Low', '#64748b'], ['Medium', '#0284c7'], ['High', '#d97706'], ['Critical', '#dc2626']]
export const REMINDER_OPTIONS = [[0, 'At the time'], [5, '5 min before'], [15, '15 min before'], [30, '30 min before'], [60, '1 hour before'], [1440, '1 day before'], [2880, '2 days before']]
export const reminderLabel = (m) => (REMINDER_OPTIONS.find((o) => o[0] === m)?.[1]) || (m < 60 ? `${m} min before` : m < 1440 ? `${Math.round(m / 60)} h before` : `${Math.round(m / 1440)} days before`)
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
export const startOfWeek = (d) => { const x = startOfDay(d); const wd = (x.getDay() + 6) % 7; return addDays(x, -wd) } // weeks start on Monday
export const sameDay = (a, b) => startOfDay(a).getTime() === startOfDay(b).getTime()
export const dayKey = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` }
export const timeText = (d) => new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
export const toLocalInput = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16) }
export const fromParts = (date, time) => new Date(`${date}T${time || '00:00'}`)

// Every day (local) an item touches, so multi-day items show on each day.
export const daysOf = (i) => {
    const out = []
    let d = startOfDay(i.start)
    const last = startOfDay(i.allDay ? i.end || i.start : new Date(new Date(i.end || i.start).getTime() - 1))
    for (let n = 0; n < 40 && d <= last; n++) { out.push(dayKey(d)); d = addDays(d, 1) }
    return out.length ? out : [dayKey(i.start)]
}
