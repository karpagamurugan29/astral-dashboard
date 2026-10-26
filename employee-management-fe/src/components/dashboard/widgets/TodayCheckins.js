import React, { useMemo, useState } from 'react'
import { useDispatch } from 'react-redux'
import dashboardActions from '../../../redux/dashboard/Actions'
import { Link } from 'react-router-dom'
import { Avatar, fullName } from '../../people/PeopleUI'
import { ModeTag } from '../../attendance/AttendanceUI'
import { mapsLink } from '../../../utils/geo'
import { useTick } from '../../audits/AuditUI'
import { Panel, EmptyState, LivePill } from './PremiumUI'
import { LocationMap } from '../../../pages/dashboard/locationLog/LocationMap'
import '../../../pages/dashboard/locationLog/LocationLog.css'

const time = (d) => (d ? new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '--:--')
const ago = (d, now) => {
    const m = Math.max(0, Math.round((now - new Date(d)) / 60000))
    if (m < 1) return 'just now'
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    return `${h}h ${m % 60 ? `${m % 60}m ` : ''}ago`
}

const Place = ({ place }) => place ? (
    <a className="tc-place" href={mapsLink(place.latitude, place.longitude)} target="_blank" rel="noreferrer" title="Open in Google Maps">
        <i className="mdi mdi-map-marker-outline"></i>{place.address || `${place.latitude.toFixed(4)}, ${place.longitude.toFixed(4)}`}
    </a>
) : <span className="tc-place none"><i className="mdi mdi-map-marker-off-outline"></i>No location</span>

/* Map of one person's check-in (and check-out) for today, in a modal. */
const PlaceModal = ({ row, onClose }) => {
    const points = [
        row.place && { id: 'in', lat: row.place.latitude, lng: row.place.longitude, color: '#16a34a', title: `${fullName(row.employee)} · checked in ${time(row.lastIn)}`, subtitle: row.place.address || '' },
        row.outPlace && { id: 'out', lat: row.outPlace.latitude, lng: row.outPlace.longitude, color: '#e11d48', title: `${fullName(row.employee)} · checked out ${time(row.lastOut)}`, subtitle: row.outPlace.address || '' },
    ].filter(Boolean)
    return (
        <div className="tc-modal" role="dialog" aria-modal="true" aria-label={`Location of ${fullName(row.employee)}`} onClick={onClose}>
            <div className="tc-modal-card" onClick={(e) => e.stopPropagation()}>
                <header>
                    <Avatar person={row.employee} size={34} />
                    <div><b>{fullName(row.employee)}</b><small>{row.employee?.designation || ''} · today</small></div>
                    <button type="button" className="tc-modal-x" onClick={onClose} aria-label="Close"><i className="mdi mdi-close"></i></button>
                </header>
                <div className="tc-modal-map"><LocationMap points={points} selectedId={points[0]?.id} /></div>
                <div className="tc-modal-rows">
                    {[['in', 'Checked in', row.lastIn, row.place, '#16a34a'], ['out', 'Checked out', row.lastOut, row.outPlace, '#e11d48']].map(([k, label, when, pl, c]) => (when || pl) && (
                        <div key={k} className="tc-modal-row" style={{ '--c': c }}>
                            <i className="mdi mdi-map-marker"></i>
                            <div><b>{label} {time(when)}</b><small>{pl?.address || (pl ? `${pl.latitude.toFixed(5)}, ${pl.longitude.toFixed(5)}` : 'No location recorded')}{pl?.accuracy ? ` · ±${pl.accuracy} m` : ''}</small></div>
                            {pl && <a className="pdb-btn" href={mapsLink(pl.latitude, pl.longitude)} target="_blank" rel="noreferrer"><i className="mdi mdi-google-maps"></i>Google Maps</a>}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

/* Today's check-ins, latest first, like a notification feed: who, when, how, where, in now or out. */
export const TodayCheckins = ({ data }) => {
    const dispatch = useDispatch()
    const [filter, setFilter] = useState('all')
    const [person, setPerson] = useState('')
    const [mapRow, setMapRow] = useState(null)
    const [reminded, setReminded] = useState({})   // id → 'sending' | 'sent' | 'failed'
    const [note, setNote] = useState('')
    const now = useTick(true, 30000)
    const rows = useMemo(() => (data?.rows || []).filter((r) => (filter === 'all' || (filter === 'in' ? r.inNow : !r.inNow)) && (!person || r.employee?._id === person)), [data, filter, person])
    const everyone = useMemo(() => [...(data?.rows || []), ...(data?.notIn || [])].map((r) => r.employee).filter(Boolean).sort((a, b) => fullName(a).localeCompare(fullName(b))), [data])
    const missing = useMemo(() => (data?.notIn || []).filter((n) => !person || n.employee?._id === person), [data, person])
    const remind = (ids) => {
        setReminded((m) => ({ ...m, ...Object.fromEntries(ids.map((id) => [id, 'sending'])) }))
        dispatch({ type: dashboardActions.REMIND_CHECKIN, payload: { employeeIds: ids }, onDone: (ok, msg) => {
            setReminded((m) => ({ ...m, ...Object.fromEntries(ids.map((id) => [id, ok ? 'sent' : 'failed'])) }))
            setNote(msg)
        } })
    }
    // Never leave a hole in the layout: show loading, or what went wrong with a retry.
    if (!data || data.error) {
        return (
            <Panel icon="mdi-account-check-outline" color="#16a34a" title="Who's in today" className="tc-card">
                    {!data ? (
                        <div className="tc-skel">{[0, 1, 2, 3].map((i) => <span key={i}></span>)}</div>
                    ) : (
                        <EmptyState icon="mdi-cloud-alert-outline" tone="#e11d48" title="Couldn't load check-ins" hint={data.error}
                            action={<button type="button" className="pdb-btn" onClick={() => dispatch({ type: dashboardActions.GET_TODAY_CHECKINS })}><i className="mdi mdi-refresh"></i>Retry</button>} />
                    )}
            </Panel>
        )
    }
    const notInList = data.notIn || []
    const notIn = notInList.filter((n) => !n.onLeave).length
    const toRemind = missing.filter((n) => !n.onLeave && !reminded[n.employee._id]).map((n) => n.employee._id)

    return (
        <Panel icon="mdi-account-check-outline" color="#16a34a" title="Who's in today" className="tc-card"
            subtitle={`${data.rows.length} of ${data.teamSize || data.rows.length + notInList.length} checked in · ${data.inNow} in now`}
            actions={<>{data.inNow > 0 && <LivePill>{data.inNow} in</LivePill>}<Link to="/location-log" className="pp-link">Location log <i className="mdi mdi-chevron-right"></i></Link></>}>
                <div className="tc-tabs" role="tablist">
                    {[['all', 'Checked in today', data.rows.length], ['in', 'In now', data.inNow], ['out', 'Checked out', data.checkedOut], ['missing', 'Not in yet', notInList.length]].map(([k, label, n]) => (
                        <button key={k} type="button" role="tab" aria-selected={filter === k} className={`tc-tab ${filter === k ? 'on' : ''} ${k}`} onClick={() => setFilter(k)}>
                            {k === 'in' && <span className="au-pulse"></span>}{label} <b>{n}</b>
                        </button>
                    ))}
                    <select className="tc-person" value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Show one person">
                        <option value="">All employees</option>
                        {everyone.map((e) => <option key={e._id} value={e._id}>{fullName(e)}</option>)}
                    </select>
                    {notIn > 0 && filter !== 'missing' && <button type="button" className="tc-notin" onClick={() => setFilter('missing')}>{notIn} not in yet <i className="mdi mdi-chevron-right"></i></button>}
                </div>

                {filter === 'missing' ? (
                    !missing.length ? (
                        <EmptyState icon="mdi-party-popper" tone="#16a34a" title={notInList.length ? 'This person has checked in' : 'Everyone has checked in today'} />
                    ) : (
                        <>
                            <div className="tc-miss-bar">
                                <span>{missing.filter((n) => !n.onLeave).length} haven't checked in{missing.some((n) => n.onLeave) ? ` · ${missing.filter((n) => n.onLeave).length} on leave` : ''}</span>
                                {note && <small className="tc-miss-note">{note}</small>}
                                <button type="button" className="pdb-btn" disabled={!toRemind.length} onClick={() => remind(toRemind)}>
                                    <i className="mdi mdi-bell-ring-outline"></i>{toRemind.length ? `Remind all (${toRemind.length})` : 'All reminded'}
                                </button>
                            </div>
                            <ul className="tc-list tc-miss">
                                {missing.map((n) => {
                                    const st = reminded[n.employee._id]
                                    return (
                                        <li key={n.employee._id} className={n.onLeave ? 'leave' : 'miss'}>
                                            <Avatar person={n.employee} size={38} />
                                            <div className="tc-main">
                                                <div className="tc-top">
                                                    <Link to={`/employees/${n.employee._id}`} className="tc-name">{fullName(n.employee)}</Link>
                                                    {n.onLeave
                                                        ? <span className="tc-leave"><i className="mdi mdi-beach"></i>On leave{n.leaveType ? ` · ${n.leaveType}` : ''}</span>
                                                        : <span className="tc-late"><i className="mdi mdi-account-clock-outline"></i>Not checked in</span>}
                                                </div>
                                                <div className="tc-line"><span className="tc-time">{[n.employee.designation, n.employee.department].filter(Boolean).join(' · ')}</span></div>
                                            </div>
                                            {!n.onLeave && (
                                                <div className="tc-side tc-miss-act">
                                                    {n.employee.phoneNumber && <a className="tc-loc" href={`tel:${n.employee.phoneNumber}`}><i className="mdi mdi-phone-outline"></i>Call</a>}
                                                    <button type="button" className={`tc-loc ${st || ''}`} disabled={!!st && st !== 'failed'} onClick={() => remind([n.employee._id])}>
                                                        <i className={`mdi ${st === 'sent' ? 'mdi-check' : st === 'sending' ? 'mdi-loading mdi-spin' : 'mdi-bell-ring-outline'}`}></i>
                                                        {st === 'sent' ? 'Reminded' : st === 'sending' ? 'Sending' : st === 'failed' ? 'Retry' : 'Remind'}
                                                    </button>
                                                </div>
                                            )}
                                        </li>
                                    )
                                })}
                            </ul>
                        </>
                    )
                ) : !rows.length ? (
                    <EmptyState icon="mdi-account-clock-outline" tone="#16a34a" title={data.rows.length ? 'Nobody in this group' : 'No one has checked in yet today'} hint={data.rows.length ? 'Try another tab or person.' : 'Check-ins appear here live as people arrive.'} />
                ) : (
                    <ul className="tc-list">
                        {rows.map((r) => (
                            <li key={r.employee._id} className={r.inNow ? 'in' : 'out'}>
                                <Avatar person={r.employee} size={38} />
                                <div className="tc-main">
                                    <div className="tc-top">
                                        <Link to={`/employees/${r.employee._id}`} className="tc-name">{fullName(r.employee)}</Link>
                                        <ModeTag mode={r.mode} />
                                        {r.lateByMinutes > 0 && <span className="tc-late"><i className="mdi mdi-clock-alert-outline"></i>Late {r.lateByMinutes}m</span>}
                                    </div>
                                    <div className="tc-line">
                                        <span className="tc-time"><i className="mdi mdi-login-variant"></i>In {time(r.lastIn)}</span>
                                        <Place place={r.place} />
                                    </div>
                                    {!r.inNow && (
                                        <div className="tc-line">
                                            <span className="tc-time out"><i className="mdi mdi-logout-variant"></i>Out {time(r.lastOut)}{r.autoCheckedOut ? ' (auto)' : ''}</span>
                                            <Place place={r.outPlace} />
                                        </div>
                                    )}
                                    {r.remarks && <div className="tc-note">“{r.remarks}”</div>}
                                </div>
                                <div className="tc-side">
                                    <button type="button" className="tc-loc" onClick={() => setMapRow(r)} disabled={!r.place && !r.outPlace} title={r.place || r.outPlace ? 'Show on map' : 'No location recorded'}>
                                        <i className="mdi mdi-map-marker-radius-outline"></i>Location
                                    </button>
                                    {r.inNow
                                        ? <span className="tc-state in"><span className="au-pulse"></span>In now</span>
                                        : <span className="tc-state out"><i className="mdi mdi-check"></i>Checked out</span>}
                                    <small>{ago(r.lastActivity, now)}{r.sessions > 1 ? ` · ${r.sessions} sessions` : ''}</small>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            {mapRow && <PlaceModal row={mapRow} onClose={() => setMapRow(null)} />}
        </Panel>
    )
}
