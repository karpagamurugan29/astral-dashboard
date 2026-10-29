import React, { useEffect, useState } from 'react'
import { api, Modal } from '../projects/ProjectParts'
import { toast } from '../../../components/common/Toaster'
import { REMINDER_OPTIONS, TZ } from './calendarKit'

/* Notification settings: channels, quiet hours, time zone and defaults. Saved per person on the
   server; desktop alerts also need the browser's permission, which is asked for here. */

const ZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Australia/Sydney', 'UTC']
const CATEGORIES = [['Reminder', 'Event reminders'], ['Task', 'Task updates'], ['Project', 'Project updates'], ['Calendar', 'Invitations & changes']]
const browserState = () => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)

export const NotificationSettings = ({ onClose }) => {
    const [f, setF] = useState(null)
    const [emailAvailable, setEmailAvailable] = useState(false)
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState('')
    const [perm, setPerm] = useState(browserState)
    useEffect(() => { api('GET', '/notification-prefs').then((j) => { setF(j.data); setEmailAvailable(!!j.emailAvailable) }).catch((e) => setErr(e.message)) }, [])
    const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }))

    const askBrowser = async () => {
        try { const p = await Notification.requestPermission(); setPerm(p); if (p === 'granted') new Notification('Desktop alerts are on', { body: 'Reminders will pop up here while the app is open in a tab.' }) } catch { setPerm(browserState()) }
    }
    const save = async () => {
        if ((f.quietStart && !f.quietEnd) || (!f.quietStart && f.quietEnd)) return setErr('Set both a start and an end for quiet hours, or neither.')
        setBusy(true); setErr('')
        try {
            await api('PUT', '/notification-prefs', { inApp: f.inApp, email: f.email, timezone: f.timezone, defaultReminder: Number(f.defaultReminder), snoozeDefault: Number(f.snoozeDefault), quietStart: f.quietStart, quietEnd: f.quietEnd, dailySummary: f.dailySummary, muted: f.muted })
            toast.success('Your notification settings are saved.', { title: 'Saved' }); onClose()
        } catch (e) { setErr(e.message); setBusy(false) }
    }
    const zones = f && !ZONES.includes(f.timezone) ? [f.timezone, ...ZONES] : ZONES

    return (
        <Modal title="Notification settings" sub="How and when you’re reminded" onClose={onClose}
            icon={<span className="pw-dicon" style={{ '--c': '#0284c7' }}><i className="mdi mdi-bell-outline"></i></span>}
            footer={<><span className="pw-err">{err}</span><button type="button" className="pp-btn" onClick={onClose}>Cancel</button><button type="button" className="pp-btn primary" disabled={!f || busy} onClick={save}><i className="mdi mdi-content-save-outline"></i>{busy ? 'Saving…' : 'Save'}</button></>}>
            {!f ? <div className="pw-loading"><i className="mdi mdi-loading mdi-spin"></i></div> : (
                <div className="ns">
                    <section>
                        <h4>Where you’re told</h4>
                        <label className="ns-row"><span><b>Reminders in the app</b><small>Event reminders in the bell and the pop-up when something is due.</small></span><input type="checkbox" className="ns-toggle" checked={f.inApp} onChange={set('inApp')} /></label>
                        <label className="ns-row"><span><b>Email</b><small>{emailAvailable ? 'For events where “also send by email” is ticked.' : 'Email isn’t set up on the server yet — ask your administrator. Nothing is emailed until it is.'}</small></span><input type="checkbox" className="ns-toggle" checked={f.email} onChange={set('email')} disabled={!emailAvailable} /></label>
                        <div className="ns-row"><span><b>Desktop alerts</b><small>{perm === 'granted' ? 'On for this browser. Alerts appear while the app is open in a tab.' : perm === 'denied' ? 'Blocked in this browser. Allow notifications for this site in the browser’s site settings (the lock icon by the address), then reload.' : perm === 'unsupported' ? 'This browser doesn’t support desktop alerts.' : 'Get a pop-up from your computer when a reminder is due, even in another tab.'}</small></span>
                            {perm === 'default' && <button type="button" className="pp-btn" onClick={askBrowser}><i className="mdi mdi-bell-ring-outline"></i>Turn on</button>}
                            {perm === 'granted' && <span className="ns-ok"><i className="mdi mdi-check-circle"></i>On</span>}
                        </div>
                        <p className="ns-note"><i className="mdi mdi-information-outline"></i><span>A pop-up can’t appear when the app is fully closed. For those times, turn on email.</span></p>
                    </section>
                    <section>
                        <h4>Timing</h4>
                        <div className="ns-grid">
                            <label className="pw-field"><span>Time zone</span><select className="pp-select" value={f.timezone} onChange={set('timezone')}>{zones.map((z) => <option key={z} value={z}>{z}{z === TZ ? ' (this device)' : ''}</option>)}</select></label>
                            <label className="pw-field"><span>Default reminder</span><select className="pp-select" value={f.defaultReminder} onChange={set('defaultReminder')}>{REMINDER_OPTIONS.map(([m, l]) => <option key={m} value={m}>{l}</option>)}</select></label>
                            <label className="pw-field"><span>Default snooze</span><select className="pp-select" value={f.snoozeDefault} onChange={set('snoozeDefault')}>{[5, 10, 30, 60].map((m) => <option key={m} value={m}>{m < 60 ? `${m} minutes` : '1 hour'}</option>)}</select></label>
                            <div className="pw-field"><span>Quiet hours</span><div className="ns-quiet"><input type="time" className="pp-input" value={f.quietStart} onChange={set('quietStart')} aria-label="Quiet hours start" /><span>to</span><input type="time" className="pp-input" value={f.quietEnd} onChange={set('quietEnd')} aria-label="Quiet hours end" /></div></div>
                        </div>
                        <p className="ns-note"><i className="mdi mdi-moon-waning-crescent"></i><span>During quiet hours no emails are sent, except for <b>Critical</b> reminders. In-app notifications still collect in the bell.</span></p>
                        <label className="ns-row"><span><b>Daily summary</b><small>When you first open the app each day, show what’s on today.</small></span><input type="checkbox" className="ns-toggle" checked={f.dailySummary} onChange={set('dailySummary')} /></label>
                    </section>
                    <section>
                        <h4>What you’re told about</h4>
                        <div className="ns-cats">{CATEGORIES.map(([k, l]) => { const on = !(f.muted || []).includes(k); return <label key={k} className={on ? 'on' : ''}><input type="checkbox" checked={on} onChange={() => setF((x) => ({ ...x, muted: on ? [...(x.muted || []), k] : (x.muted || []).filter((m) => m !== k) }))} />{l}</label> })}</div>
                    </section>
                </div>
            )}
        </Modal>
    )
}
