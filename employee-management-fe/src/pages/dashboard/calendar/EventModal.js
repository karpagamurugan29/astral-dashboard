import React, { useEffect, useMemo, useState } from 'react'
import { api, Modal } from '../projects/ProjectParts'
import { PeoplePicker } from '../../../components/projects/ProjectUI'
import { fullName } from '../../../components/people/PeopleUI'
import { toast } from '../../../components/common/Toaster'
import { confirmAction } from '../../../components/common/ConfirmDialog'
import { EVENT_TYPES, PRIORITIES, REMINDER_OPTIONS, reminderLabel, WEEKDAYS, TZ, dayKey, fromParts, PERSONAL, PERSONAL_TYPES, isPersonalType, typeMeta } from './calendarKit'

/* Create / edit an event — for work or for your own life. Personal plans (family, health, travel,
   birthdays, bills…) are private to you and anyone you invite, and never sit on a project.
   For a repeating event, changes and deletes ask whether they apply to
   this occurrence, this and later ones, or the whole series. `seed` pre-fills a new event
   (date clicked on the calendar); `id` + `occurrence` opens an existing one. */

const blank = (seed = {}, defaultReminder = 15) => {
    const s = seed.start ? new Date(seed.start) : (() => { const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1); return d })()
    const e = seed.end ? new Date(seed.end) : new Date(s.getTime() + 3600000)
    return {
        title: '', description: '', eventType: seed.personal ? 'Personal meeting' : 'Meeting', priority: 'Medium', allDay: !!seed.allDay, location: '', link: '',
        date: dayKey(s), startTime: s.toTimeString().slice(0, 5), endDate: dayKey(e), endTime: e.toTimeString().slice(0, 5),
        projectId: '', taskId: '', assignee: '', participants: [], reminders: [defaultReminder], emailReminders: false,
        freq: 'none', interval: 1, byWeekday: [], ends: 'never', until: '', count: 5,
    }
}
const fromEvent = (ev, occurrence) => {
    const len = new Date(ev.end) - new Date(ev.start)
    const s = occurrence ? new Date(occurrence) : new Date(ev.start)
    const e = new Date(s.getTime() + len)
    const r = ev.recurrence || {}
    return {
        title: ev.title, description: ev.description || '', eventType: ev.eventType, priority: ev.priority, allDay: ev.allDay, location: ev.location || '', link: ev.link || '',
        date: dayKey(s), startTime: s.toTimeString().slice(0, 5), endDate: dayKey(e), endTime: e.toTimeString().slice(0, 5),
        projectId: ev.projectId?._id || '', taskId: ev.taskId?._id || '', assignee: ev.assignee?._id || '', participants: (ev.participants || []).map((p) => p._id),
        reminders: ev.reminders || [], emailReminders: !!ev.emailReminders,
        freq: r.freq || 'none', interval: r.interval || 1, byWeekday: r.byWeekday || [], ends: r.until ? 'on' : r.count ? 'after' : 'never', until: r.until ? dayKey(r.until) : '', count: r.count || 5,
    }
}

// "Which ones?" for repeating events.
const ScopeModal = ({ verb, onPick, onClose }) => {
    const [scope, setScope] = useState('one')
    return (
        <Modal title={`${verb} a repeating event`} sub="Choose which occurrences this applies to" onClose={onClose}
            icon={<span className="pw-dicon" style={{ '--c': '#7c3aed' }}><i className="mdi mdi-repeat"></i></span>}
            footer={<><button type="button" className="pp-btn" onClick={onClose}>Cancel</button><button type="button" className="pp-btn primary" onClick={() => onPick(scope)}><i className="mdi mdi-check"></i>{verb}</button></>}>
            <div className="cal-scope" role="radiogroup">
                {[['one', 'This event only'], ['future', 'This and following events'], ['all', 'All events in the series']].map(([k, l]) => (
                    <label key={k} className={scope === k ? 'on' : ''}><input type="radio" name="scope" checked={scope === k} onChange={() => setScope(k)} />{l}</label>
                ))}
            </div>
        </Modal>
    )
}

export const EventModal = ({ id, occurrence, seed, onClose, onChanged }) => {
    const isNew = !id
    const [ev, setEv] = useState(null)
    const [canEdit, setCanEdit] = useState(isNew)
    const [f, setF] = useState(() => blank(seed))
    const [initial, setInitial] = useState(null)
    const [people, setPeople] = useState([])
    const [projects, setProjects] = useState([])
    const [tasks, setTasks] = useState([])
    const [emailAvailable, setEmailAvailable] = useState(false)
    const [custom, setCustom] = useState('')
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState('')
    const [scopeFor, setScopeFor] = useState(null) // { verb, run }
    const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }))

    useEffect(() => {
        api('GET', '/chat/contacts').then((j) => setPeople(j.data || [])).catch(() => {})
        api('GET', '/projects').then((j) => setProjects((j.data || []).filter((p) => !['Completed', 'Cancelled'].includes(p.status)))).catch(() => {})
        api('GET', '/tasks/mine').then((j) => setTasks((j.data || []).filter((t) => t.status !== 'Done'))).catch(() => {})
        api('GET', '/notification-prefs').then((j) => {
            setEmailAvailable(!!j.emailAvailable)
            if (isNew) setF((x) => { const n = { ...x, reminders: [j.data?.defaultReminder ?? 15] }; setInitial(JSON.stringify(n)); return n })
        }).catch(() => { if (isNew) setInitial(JSON.stringify(blank(seed))) })
        if (!isNew) api('GET', `/calendar/events/${id}`).then((j) => { setEv(j.data); setCanEdit(!!j.canEdit); const v = fromEvent(j.data, occurrence); setF(v); setInitial(JSON.stringify(v)) })
            .catch((e) => { toast.error(e.message, { title: 'Couldn’t open the event' }); onClose() })
    }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

    const recurring = !!ev && ev.recurrence?.freq && ev.recurrence.freq !== 'none'
    const dirty = initial !== null && JSON.stringify(f) !== initial
    const projectTasks = useMemo(() => tasks.filter((t) => !f.projectId || (t.projectId?._id || t.projectId) === f.projectId), [tasks, f.projectId])
    const done = ev && occurrence && (ev.completed || []).some((d) => new Date(d).getTime() === new Date(occurrence).getTime())

    const closeSafe = async () => {
        if (canEdit && dirty && !(await confirmAction({ title: 'Discard your changes?', message: 'This event has changes that aren’t saved yet.', confirmLabel: 'Discard', cancelLabel: 'Keep editing', tone: 'warn' }))) return
        onClose()
    }

    const payload = () => {
        const start = f.allDay ? fromParts(f.date, '00:00') : fromParts(f.date, f.startTime)
        const end = f.allDay ? fromParts(f.endDate || f.date, '23:59') : fromParts(f.endDate || f.date, f.endTime)
        return {
            title: f.title.trim(), description: f.description, eventType: f.eventType, priority: f.priority, allDay: f.allDay, location: f.location, link: f.link.trim(),
            start: start.toISOString(), end: end.toISOString(), timezone: TZ, projectId: f.projectId || null, taskId: f.taskId || null, assignee: f.assignee || null,
            participants: f.participants, reminders: f.reminders, emailReminders: f.emailReminders,
            recurrence: f.freq === 'none' ? { freq: 'none' } : { freq: f.freq, interval: Number(f.interval) || 1, byWeekday: f.freq === 'weekly' ? f.byWeekday : [], until: f.ends === 'on' && f.until ? fromParts(f.until, '23:59').toISOString() : null, count: f.ends === 'after' ? Number(f.count) : null },
        }
    }
    const check = () => {
        if (!f.title.trim()) return 'Give the event a title.'
        const p = payload()
        if (isNaN(new Date(p.start)) || isNaN(new Date(p.end))) return 'Pick a valid date and time.'
        if (new Date(p.end) < new Date(p.start)) return 'The event can’t end before it starts.'
        if (f.link && !/^https?:\/\//i.test(f.link.trim())) return 'Links must start with http:// or https://'
        if (f.freq === 'weekly' && !f.byWeekday.length) return null
        if (f.ends === 'on' && f.until && fromParts(f.until, '23:59') < new Date(p.start)) return 'The repeat can’t end before the event starts.'
        return null
    }

    const save = async (another = false, scope) => {
        const problem = check()
        if (problem) return setErr(problem)
        if (recurring && !scope) return setScopeFor({ verb: 'Save', run: (s) => save(another, s) })
        setBusy(true); setErr('')
        try {
            const body = payload()
            const j = isNew ? await api('POST', '/calendar/events', body) : await api('PUT', `/calendar/events/${id}`, { ...body, scope: scope || 'all', occurrence })
            ;(j.warnings || []).forEach((w) => toast.warning(w.replace(/ at \S+$/, ''), { title: 'Heads up: time clash' }))
            toast.success(`“${body.title}”`, { title: isNew ? 'Event saved' : 'Event updated' })
            onChanged?.()
            if (another) { const n = { ...blank({ start: fromParts(f.date, f.startTime) }), reminders: f.reminders }; setF(n); setInitial(JSON.stringify(n)); setBusy(false) }
            else onClose()
        } catch (e) { setErr(e.message); setBusy(false) }
    }
    const remove = async (scope) => {
        if (recurring && !scope) return setScopeFor({ verb: 'Delete', run: (s) => remove(s) })
        if (!recurring && !(await confirmAction({ title: `Cancel “${ev.title}”?`, message: 'Everyone invited is told it was cancelled.', confirmLabel: 'Cancel event', cancelLabel: 'Keep it' }))) return
        try {
            const j = await api('DELETE', `/calendar/events/${id}?scope=${scope || 'all'}${occurrence ? `&occurrence=${encodeURIComponent(new Date(occurrence).toISOString())}` : ''}`)
            toast.success(j.message, { title: 'Event removed' }); onChanged?.(); onClose()
        } catch (e) { setErr(e.message) }
    }
    const duplicate = async () => {
        try { await api('POST', `/calendar/events/${id}/duplicate`); toast.success('A copy was added to your calendar.', { title: 'Event duplicated' }); onChanged?.(); onClose() } catch (e) { setErr(e.message) }
    }
    const markDone = async () => {
        try { await api('POST', `/calendar/events/${id}/complete`, { occurrence: occurrence || ev.start, done: !done }); toast.success(done ? 'Marked not done.' : 'Marked done.', { title: ev.title }); onChanged?.(); onClose() } catch (e) { setErr(e.message) }
    }
    const toggleReminder = (m) => setF((x) => ({ ...x, reminders: x.reminders.includes(m) ? x.reminders.filter((r) => r !== m) : [...x.reminders, m].sort((a, b) => b - a) }))
    const addCustom = () => {
        if (!custom) return
        const start = f.allDay ? fromParts(f.date, '00:00') : fromParts(f.date, f.startTime)
        const mins = Math.round((start - new Date(custom)) / 60000)
        if (mins < 0) return setErr('A custom reminder has to be before the event starts.')
        if (mins > 60 * 24 * 60) return setErr('Reminders can be at most 60 days before.')
        setErr(''); setCustom('')
        if (!f.reminders.includes(mins)) setF((x) => ({ ...x, reminders: [...x.reminders, mins].sort((a, b) => b - a) }))
    }
    const ro = !canEdit
    const personal = isPersonalType(f.eventType)
    const cat = typeMeta(f.eventType)
    // switching side or type: personal plans drop the project; birthdays and bills bring sensible repeats
    const setSide = (side) => setF((x) => (side === 'personal' ? { ...x, eventType: 'Personal meeting', projectId: '', taskId: '', assignee: '' } : { ...x, eventType: 'Meeting' }))
    const pickType = (t) => setF((x) => {
        const p = PERSONAL[t] || {}
        return { ...x, eventType: t, ...(p.repeat && x.freq === 'none' ? { freq: p.repeat } : {}), ...(p.reminders && isNew ? { reminders: p.reminders } : {}), ...(p.allDay && isNew ? { allDay: true } : {}) }
    })

    if (!isNew && !ev) return <Modal title="Event" onClose={onClose}><div className="pw-loading"><i className="mdi mdi-loading mdi-spin"></i></div></Modal>

    return (
        <>
            <Modal wide title={isNew ? (personal ? 'New personal plan' : 'New event') : ro ? ev.title : personal ? 'Edit plan' : 'Edit event'} sub={isNew ? `Times in ${TZ}` : `${ev.eventType}${ev.projectId ? ` · ${ev.projectId.projectCode}` : ''}${recurring ? ' · repeats' : ''} · by ${fullName(ev.createdBy)}`} onClose={closeSafe}
                icon={<span className="pw-dicon" style={{ '--c': cat.color }}><i className={`mdi ${cat.icon}`}></i></span>}
                footer={<>
                    {!isNew && canEdit && <button type="button" className="pw-del" onClick={() => remove()}><i className="mdi mdi-delete-outline"></i>Delete</button>}
                    {!isNew && <button type="button" className="pp-btn" onClick={duplicate} title="Make a copy"><i className="mdi mdi-content-copy"></i><span className="hide-sm">Duplicate</span></button>}
                    {!isNew && <button type="button" className={`pp-btn ${done ? '' : 'cal-done-btn'}`} onClick={markDone}><i className={`mdi ${done ? 'mdi-restore' : 'mdi-check'}`}></i>{done ? 'Not done' : 'Mark done'}</button>}
                    <span className="pw-err">{err}</span>
                    <button type="button" className="pp-btn" onClick={closeSafe}>{ro ? 'Close' : 'Cancel'}</button>
                    {isNew && <button type="button" className="pp-btn" disabled={busy} onClick={() => save(true)}><i className="mdi mdi-plus"></i><span className="hide-sm">Save &amp; add another</span></button>}
                    {canEdit && <button type="button" className="pp-btn primary" disabled={busy || (!isNew && !dirty)} onClick={() => save(false)}><i className="mdi mdi-content-save-outline"></i>{busy ? 'Saving…' : personal ? 'Save plan' : 'Save event'}</button>}
                </>}>
                <fieldset disabled={ro} className="cal-form">
                    <input className="pw-title-input" value={f.title} onChange={set('title')} placeholder={personal ? 'What are you planning? e.g. Dinner with family' : 'Event or reminder title'} autoFocus={isNew} maxLength={160} aria-label="Title" />
                    <div className="cal-side" role="tablist" aria-label="Work or personal">
                        <button type="button" role="tab" aria-selected={!personal} className={!personal ? 'on work' : ''} onClick={() => setSide('work')}><i className="mdi mdi-briefcase-outline"></i>Work</button>
                        <button type="button" role="tab" aria-selected={personal} className={personal ? 'on personal' : ''} onClick={() => setSide('personal')}><i className="mdi mdi-heart-outline"></i>Personal</button>
                    </div>
                    <div className="cal-types" role="radiogroup" aria-label="Type">
                        {(personal ? PERSONAL_TYPES : EVENT_TYPES).map((t) => { const m = typeMeta(t); return <button key={t} type="button" role="radio" aria-checked={f.eventType === t} className={f.eventType === t ? 'on' : ''} style={{ '--c': m.color }} onClick={() => pickType(t)}><i className={`mdi ${m.icon}`}></i>{t}</button> })}
                    </div>
                    {personal && PERSONAL[f.eventType]?.hint && <p className="cal-hint"><i className={`mdi ${cat.icon}`} style={{ color: cat.color }}></i>{PERSONAL[f.eventType].hint}</p>}

                    <div className="cal-grid">
                        <div className="cal-col">
                            <div className="cal-when">
                                <label className="cal-switch"><input type="checkbox" checked={f.allDay} onChange={set('allDay')} /><span></span>All day</label>
                                <div className="cal-row">
                                    <label className="pw-field"><span>Starts</span><input type="date" className="pp-input" value={f.date} onChange={(e) => setF((x) => ({ ...x, date: e.target.value, endDate: x.endDate < e.target.value ? e.target.value : x.endDate }))} /></label>
                                    {!f.allDay && <label className="pw-field"><span>&nbsp;</span><input type="time" className="pp-input" value={f.startTime} onChange={set('startTime')} /></label>}
                                </div>
                                <div className="cal-row">
                                    <label className="pw-field"><span>Ends</span><input type="date" className="pp-input" value={f.endDate} min={f.date} onChange={set('endDate')} /></label>
                                    {!f.allDay && <label className="pw-field"><span>&nbsp;</span><input type="time" className="pp-input" value={f.endTime} onChange={set('endTime')} /></label>}
                                </div>
                            </div>

                            <div className="pw-field"><span>Priority</span>
                                <div className="cal-seg">{PRIORITIES.map(([p, c]) => <button key={p} type="button" className={f.priority === p ? 'on' : ''} style={{ '--c': c }} onClick={() => set('priority')(p)}>{p}</button>)}</div>
                            </div>

                            <div className="pw-field"><span>Repeat</span>
                                <div className="cal-row">
                                    <select className="pp-select" value={f.freq} onChange={set('freq')}>{[['none', 'Doesn’t repeat'], ['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['yearly', 'Yearly']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                                    {f.freq !== 'none' && <label className="cal-every">every<input type="number" min="1" max="99" className="pp-input" value={f.interval} onChange={set('interval')} />{({ daily: 'day(s)', weekly: 'week(s)', monthly: 'month(s)', yearly: 'year(s)' })[f.freq]}</label>}
                                </div>
                                {f.freq === 'weekly' && <div className="cal-wd">{WEEKDAYS.map((d, i) => <button key={d} type="button" className={f.byWeekday.includes(i) ? 'on' : ''} onClick={() => setF((x) => ({ ...x, byWeekday: x.byWeekday.includes(i) ? x.byWeekday.filter((n) => n !== i) : [...x.byWeekday, i] }))} aria-pressed={f.byWeekday.includes(i)}>{d[0]}</button>)}<small>{f.byWeekday.length ? '' : 'Same weekday as the start'}</small></div>}
                                {f.freq !== 'none' && (
                                    <div className="cal-row cal-ends">
                                        <select className="pp-select" value={f.ends} onChange={set('ends')}><option value="never">Never ends</option><option value="on">Ends on</option><option value="after">Ends after</option></select>
                                        {f.ends === 'on' && <input type="date" className="pp-input" value={f.until} min={f.date} onChange={set('until')} />}
                                        {f.ends === 'after' && <label className="cal-every"><input type="number" min="1" max="500" className="pp-input" value={f.count} onChange={set('count')} />times</label>}
                                    </div>
                                )}
                            </div>

                            <div className="pw-field"><span>Reminders</span>
                                <div className="cal-chips">{REMINDER_OPTIONS.map(([m, l]) => <button key={m} type="button" className={f.reminders.includes(m) ? 'on' : ''} onClick={() => toggleReminder(m)} aria-pressed={f.reminders.includes(m)}><i className="mdi mdi-bell-outline"></i>{l}</button>)}
                                    {f.reminders.filter((m) => !REMINDER_OPTIONS.some((o) => o[0] === m)).map((m) => <button key={m} type="button" className="on" onClick={() => toggleReminder(m)}><i className="mdi mdi-bell-outline"></i>{reminderLabel(m)}<i className="mdi mdi-close"></i></button>)}
                                </div>
                                {!ro && <div className="cal-row cal-custom"><input type="datetime-local" className="pp-input" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Custom reminder time" /><button type="button" className="pp-btn" onClick={addCustom}><i className="mdi mdi-plus"></i>Custom time</button></div>}
                                <label className="cal-check"><input type="checkbox" checked={f.emailReminders} onChange={set('emailReminders')} disabled={ro} />Also send reminders by email{!emailAvailable && <em> — email isn’t set up on the server yet, so only in-app reminders will go out</em>}</label>
                            </div>
                        </div>

                        <div className="cal-col">
                            {personal ? (
                                <div className="cal-private"><i className="mdi mdi-lock-outline"></i><div><b>Private plan</b><span>Only you can see it — plus anyone you invite below. It never shows on project calendars or reports.</span></div></div>
                            ) : <>
                            <label className="pw-field"><span>Project</span>
                                <select className="pp-select" value={f.projectId} onChange={(e) => setF((x) => ({ ...x, projectId: e.target.value, taskId: '' }))}><option value="">Personal (no project)</option>{projects.map((p) => <option key={p._id} value={p._id}>{p.projectCode} · {p.projectName}</option>)}</select>
                            </label>
                            <label className="pw-field"><span>Related task</span>
                                <select className="pp-select" value={f.taskId} onChange={set('taskId')}><option value="">None</option>{projectTasks.map((t) => <option key={t._id} value={t._id}>{t.title}</option>)}</select>
                            </label>
                            <label className="pw-field"><span>Responsible person</span>
                                <select className="pp-select" value={f.assignee} onChange={set('assignee')}><option value="">Me</option>{people.map((p) => <option key={p._id} value={p._id}>{fullName(p)}{p.designation ? ` — ${p.designation}` : ''}</option>)}</select>
                            </label>
                            </>}
                            <div className="pw-field"><span>{personal ? 'Invite' : 'Participants'} <small className="cal-muted">— {personal ? 'optional; they’ll see this plan and get its reminders' : 'they’re invited and get the reminders'}</small></span>
                                {ro ? <p className="cal-people">{(ev?.participants || []).map(fullName).join(', ') || 'Nobody else'}</p>
                                    : <PeoplePicker people={people} value={f.participants} onChange={set('participants')} placeholder="Invite people…" />}
                            </div>
                            <label className="pw-field"><span>{personal ? 'Where' : 'Location'}</span><input className="pp-input" value={f.location} onChange={set('location')} placeholder={personal ? 'Place, clinic, restaurant, airport…' : 'Room, office or address'} maxLength={200} /></label>
                            <label className="pw-field"><span>{personal ? 'Link' : 'Meeting link'}</span><input className="pp-input" value={f.link} onChange={set('link')} placeholder="https://…" maxLength={500} /></label>
                            {ro && f.link && <a className="cal-join" href={f.link} target="_blank" rel="noreferrer"><i className="mdi mdi-video-outline"></i>Join / open link</a>}
                            <label className="pw-field"><span>Notes</span><textarea className="pp-input" rows={3} value={f.description} onChange={set('description')} placeholder="Agenda, details, anything to remember" /></label>
                        </div>
                    </div>
                    {ro && <p className="cal-ro"><i className="mdi mdi-lock-outline"></i>Only the organiser or the project lead can change this event.</p>}
                </fieldset>
            </Modal>
            {scopeFor && <ScopeModal verb={scopeFor.verb} onClose={() => setScopeFor(null)} onPick={(s) => { const run = scopeFor.run; setScopeFor(null); run(s) }} />}
        </>
    )
}
