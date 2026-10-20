import React, { useEffect, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useForm } from 'react-hook-form'
import settingsActions from '../../../redux/settings/Actions'
import { PeopleShell, EmptyState, ErrorBanner } from '../../../components/people/PeopleUI'
import { LEAVE_TYPES } from '../../../components/leave/LeaveUI'
import './CompanySettings.css'

const SETTINGS_ROOT = { label: 'Settings', to: '/settings/company' }

const SECTIONS = [
    { id: 'cs-company', label: 'Company profile', icon: 'mdi-domain', color: '#0b0f19' },
    { id: 'cs-hours', label: 'Working hours', icon: 'mdi-clock-time-four-outline', color: '#0284c7' },
    { id: 'cs-attendance', label: 'Attendance rules', icon: 'mdi-fingerprint', color: '#7c3aed' },
    { id: 'cs-leave', label: 'Leave allowances', icon: 'mdi-beach', color: '#059669' },
    { id: 'cs-approval', label: 'Approval flow', icon: 'mdi-check-decagram', color: '#d97706' },
]

const ALLOWANCES = ['casual', 'sick', 'earned', 'optionalHoliday', 'workFromHome']
    .map((key) => LEAVE_TYPES.find((t) => t.balanceKey === key))

const toMinutes = (hhmm) => {
    if (!hhmm) return null
    const [h, m] = String(hhmm).split(':').map(Number)
    return (h || 0) * 60 + (m || 0)
}
const fmt = (mins) => `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
const pct = (mins) => `${(mins / 1440) * 100}%`
const companyInitials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'Co'

// Save-bar status: unsaved changes, saving, or a confirmed save.
const useSaveState = (data, error) => {
    const pending = useRef(false)
    const [saved, setSaved] = useState(false)
    useEffect(() => {
        if (pending.current) {
            pending.current = false
            setSaved(true)
            const t = setTimeout(() => setSaved(false), 4000)
            return () => clearTimeout(t)
        }
        return undefined
    }, [data])
    useEffect(() => { if (error) pending.current = false }, [error])
    return { saved, markPending: () => { pending.current = true; setSaved(false) } }
}

const SaveBar = ({ dirty, saved, onDiscard, label }) => (
    <div className={`cs-bar ${dirty ? 'dirty' : ''}`}>
        {dirty
            ? <span className="cs-bar-note dirty"><i className="mdi mdi-pencil-circle-outline"></i>Unsaved changes</span>
            : saved
                ? <span className="cs-bar-note saved"><i className="mdi mdi-check-circle"></i>Saved</span>
                : <span className="cs-bar-note"><i className="mdi mdi-cloud-check-outline"></i>All changes saved</span>}
        <div className="cs-bar-btns">
            <button type="button" className="pp-btn" onClick={onDiscard} disabled={!dirty}>Discard</button>
            <button type="submit" className="pp-btn primary" disabled={!dirty}><i className="mdi mdi-content-save-outline"></i> {label}</button>
        </div>
    </div>
)

const Toggle = ({ icon, color, title, text, checked, children }) => (
    <label className={`cs-toggle ${checked ? 'on' : ''}`} style={{ '--c': color }}>
        <i className={`mdi ${icon}`}></i>
        <span className="cs-toggle-text"><b>{title}</b><small>{text}</small></span>
        {children}
        <span className="cs-switch" aria-hidden="true"></span>
    </label>
)

export const CompanySettings = () => {
    const dispatch = useDispatch()
    const { company, leavePolicy, error } = useSelector((state) => state.settingsReducer || {})
    const { isAuthenticated: user } = useSelector((state) => state.authReducer || {})
    const isAdmin = user?.role === 'Admin'
    const companyForm = useForm()
    const leaveForm = useForm()
    const [active, setActive] = useState(SECTIONS[0].id)
    const companySave = useSaveState(company, error)
    const leaveSave = useSaveState(leavePolicy, error)

    useEffect(() => {
        dispatch({ type: settingsActions.GET_COMPANY_SETTINGS })
        dispatch({ type: settingsActions.GET_LEAVE_SETTINGS })
    }, [dispatch])

    const companyValues = (c) => ({
        companyName: c.companyName,
        requiredHours: c.workingHours?.requiredHours,
        checkInTime: c.workingHours?.checkInTime,
        checkOutTime: c.workingHours?.checkOutTime,
        gracePeriodMinutes: c.workingHours?.gracePeriodMinutes,
        allowWFH: c.attendanceSettings?.allowWFH,
        allowFieldVisit: c.attendanceSettings?.allowFieldVisit,
    })

    const leaveValues = (p) => ({
        casual: p.annualLeave?.casual,
        sick: p.annualLeave?.sick,
        earned: p.annualLeave?.earned,
        optionalHoliday: p.annualLeave?.optionalHoliday,
        workFromHome: p.annualLeave?.workFromHome,
        managerApproval: p.approvalFlow?.managerApproval,
        hrApproval: p.approvalFlow?.hrApproval,
    })

    const resetCompany = companyForm.reset
    const resetLeave = leaveForm.reset
    useEffect(() => { if (company) resetCompany(companyValues(company)) }, [company, resetCompany])
    useEffect(() => { if (leavePolicy) resetLeave(leaveValues(leavePolicy)) }, [leavePolicy, resetLeave])

    // Highlight the section in view in the left menu.
    useEffect(() => {
        if (!isAdmin) return undefined
        const io = new IntersectionObserver((entries) => {
            const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
            if (visible) setActive(visible.target.id)
        }, { rootMargin: '-90px 0px -55% 0px' })
        SECTIONS.forEach((s) => { const el = document.getElementById(s.id); if (el) io.observe(el) })
        return () => io.disconnect()
    }, [isAdmin, company, leavePolicy])

    const onSaveCompany = (data) => {
        companySave.markPending()
        dispatch({
            type: settingsActions.UPDATE_COMPANY_SETTINGS,
            payload: {
                companyName: data.companyName,
                workingHours: {
                    requiredHours: Number(data.requiredHours),
                    checkInTime: data.checkInTime,
                    checkOutTime: data.checkOutTime,
                    gracePeriodMinutes: Number(data.gracePeriodMinutes),
                },
                attendanceSettings: {
                    ...company?.attendanceSettings,
                    allowWFH: data.allowWFH,
                    allowFieldVisit: data.allowFieldVisit,
                },
            },
        })
    }

    const onSaveLeavePolicy = (data) => {
        leaveSave.markPending()
        dispatch({
            type: settingsActions.UPDATE_LEAVE_SETTINGS,
            payload: {
                annualLeave: {
                    casual: Number(data.casual),
                    sick: Number(data.sick),
                    earned: Number(data.earned),
                    optionalHoliday: Number(data.optionalHoliday),
                    workFromHome: Number(data.workFromHome),
                },
                approvalFlow: {
                    managerApproval: data.managerApproval,
                    hrApproval: data.hrApproval,
                },
            },
        })
    }

    const step = (name, delta) => {
        const v = Math.max(0, Math.min(365, (Number(leaveForm.getValues(name)) || 0) + delta))
        leaveForm.setValue(name, v, { shouldDirty: true })
    }

    const jump = (e, id) => {
        e.preventDefault()
        setActive(id)
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }

    const cw = companyForm.watch()
    const lw = leaveForm.watch()
    const inMin = toMinutes(cw.checkInTime)
    const outMin = toMinutes(cw.checkOutTime)
    const grace = Number(cw.gracePeriodMinutes) || 0
    const hasDay = inMin !== null && outMin !== null && outMin > inMin
    const totalAllowance = ALLOWANCES.reduce((s, t) => s + (Number(lw[t.balanceKey]) || 0), 0)

    if (!isAdmin) {
        return (
            <PeopleShell title="Company settings" root={SETTINGS_ROOT} crumbs={[{ label: 'Company' }]}>
                <div className="pp-card"><EmptyState icon="mdi-lock-outline" title="Admins only" text="Only Admin can view or change company settings." /></div>
            </PeopleShell>
        )
    }

    return (
        <PeopleShell title="Company settings" root={SETTINGS_ROOT} crumbs={[{ label: 'Company' }]}>
            <ErrorBanner error={error} />

            <div className="cs-layout">
                <nav className="pp-card cs-nav" aria-label="Settings sections">
                    <div className="cs-nav-label">On this page</div>
                    {SECTIONS.map((s) => (
                        <a key={s.id} href={`#${s.id}`} onClick={(e) => jump(e, s.id)} className={active === s.id ? 'active' : ''} style={{ '--c': s.color }}>
                            <i className={`mdi ${s.icon}`}></i>{s.label}
                        </a>
                    ))}
                </nav>

                <div>
                    {/* ================= company form ================= */}
                    <form className="cs-form" onSubmit={companyForm.handleSubmit(onSaveCompany)} noValidate>
                        <section id="cs-company" className="pp-card cs-section">
                            <div className="pp-card-head">
                                <span className="cs-head-icon" style={{ '--c': '#0b0f19' }}><i className="mdi mdi-domain"></i></span>
                                <div><h3>Company profile</h3><p>How your organisation appears across Astral.</p></div>
                            </div>
                            <div className="pp-card-body">
                                <div className="cs-company">
                                    <span className="cs-logo" aria-hidden="true">{companyInitials(cw.companyName)}<span>.</span></span>
                                    <div className="pp-field">
                                        <label className="pp-label">Company name<span className="req">*</span></label>
                                        <input type="text" className={`pp-input ${companyForm.formState.errors.companyName ? 'is-invalid' : ''}`}
                                            {...companyForm.register('companyName', { required: 'Company name is required' })} />
                                        {companyForm.formState.errors.companyName && <div className="pp-err">{companyForm.formState.errors.companyName.message}</div>}
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section id="cs-hours" className="pp-card cs-section">
                            <div className="pp-card-head">
                                <span className="cs-head-icon" style={{ '--c': '#0284c7' }}><i className="mdi mdi-clock-time-four-outline"></i></span>
                                <div><h3>Working hours</h3><p>The standard day used for late marks and worked-hour targets.</p></div>
                            </div>
                            <div className="pp-card-body">
                                <div className="cs-hours">
                                    <div className="pp-field">
                                        <label className="pp-label">Check-in time</label>
                                        <input type="time" className="pp-input" {...companyForm.register('checkInTime')} />
                                    </div>
                                    <div className="pp-field">
                                        <label className="pp-label">Check-out time</label>
                                        <input type="time" className="pp-input" {...companyForm.register('checkOutTime')} />
                                    </div>
                                    <div className="pp-field">
                                        <label className="pp-label">Required hours / day</label>
                                        <input type="number" min="0" max="24" step="0.5" className="pp-input" {...companyForm.register('requiredHours')} />
                                    </div>
                                    <div className="pp-field">
                                        <label className="pp-label">Grace period (min)</label>
                                        <input type="number" min="0" max="120" className="pp-input" {...companyForm.register('gracePeriodMinutes')} />
                                    </div>
                                </div>

                                <div className="cs-day">
                                    <div className="cs-day-title">
                                        <span>Standard day preview</span>
                                        <b>{hasDay ? `${cw.checkInTime} – ${cw.checkOutTime}` : 'Set check-in and check-out'}</b>
                                    </div>
                                    <div className="cs-track" aria-hidden="true">
                                        {hasDay && <span className="work" style={{ left: pct(inMin), width: pct(outMin - inMin) }}></span>}
                                        {hasDay && grace > 0 && <span className="grace" style={{ left: pct(inMin), width: pct(Math.min(grace, outMin - inMin)) }}></span>}
                                    </div>
                                    <div className="cs-ticks"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
                                    {hasDay && (
                                        <div className="cs-day-legend">
                                            <span><i style={{ background: '#0ea5e9' }}></i>Working day · <b>{((outMin - inMin) / 60).toFixed(1).replace(/\.0$/, '')}h</b></span>
                                            <span><i style={{ background: '#f59e0b' }}></i>Grace · marked late after <b>{fmt(inMin + grace)}</b></span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </section>

                        <section id="cs-attendance" className="pp-card cs-section">
                            <div className="pp-card-head">
                                <span className="cs-head-icon" style={{ '--c': '#7c3aed' }}><i className="mdi mdi-fingerprint"></i></span>
                                <div><h3>Attendance rules</h3><p>Which check-in modes people can choose.</p></div>
                            </div>
                            <div className="pp-card-body">
                                <div className="cs-toggles">
                                    <Toggle icon="mdi-home-outline" color="#7c3aed" title="Work from home" text="Allow checking in from home" checked={!!cw.allowWFH}>
                                        <input type="checkbox" {...companyForm.register('allowWFH')} />
                                    </Toggle>
                                    <Toggle icon="mdi-map-marker-outline" color="#0d9488" title="Field visits" text="Allow checking in from a client or site" checked={!!cw.allowFieldVisit}>
                                        <input type="checkbox" {...companyForm.register('allowFieldVisit')} />
                                    </Toggle>
                                </div>
                            </div>
                        </section>

                        <SaveBar dirty={companyForm.formState.isDirty} saved={companySave.saved} label="Save company settings"
                            onDiscard={() => company && resetCompany(companyValues(company))} />
                    </form>

                    {/* ================= leave policy form ================= */}
                    <form className="cs-form" onSubmit={leaveForm.handleSubmit(onSaveLeavePolicy)} noValidate>
                        <section id="cs-leave" className="pp-card cs-section">
                            <div className="pp-card-head">
                                <span className="cs-head-icon" style={{ '--c': '#059669' }}><i className="mdi mdi-beach"></i></span>
                                <div><h3>Leave allowances</h3><p>Days each employee gets per year, by leave type.</p></div>
                            </div>
                            <div className="pp-card-body">
                                <div className="cs-allow">
                                    {ALLOWANCES.map((t) => (
                                        <div key={t.balanceKey} className="cs-allow-row" style={{ '--c': t.color }}>
                                            <i className={`mdi ${t.icon}`}></i>
                                            <span>{t.value}<small>days per year</small></span>
                                            <div className="cs-stepper">
                                                <button type="button" onClick={() => step(t.balanceKey, -1)} aria-label={`Fewer ${t.value} days`}><i className="mdi mdi-minus"></i></button>
                                                <input type="number" min="0" max="365" aria-label={`${t.value} days per year`} {...leaveForm.register(t.balanceKey)} />
                                                <button type="button" onClick={() => step(t.balanceKey, 1)} aria-label={`More ${t.value} days`}><i className="mdi mdi-plus"></i></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="cs-total"><span>Total allowance per employee</span><b>{totalAllowance} days / year</b></div>
                            </div>
                        </section>

                        <section id="cs-approval" className="pp-card cs-section">
                            <div className="pp-card-head">
                                <span className="cs-head-icon" style={{ '--c': '#d97706' }}><i className="mdi mdi-check-decagram"></i></span>
                                <div><h3>Approval flow</h3><p>Who has to sign off before leave is approved.</p></div>
                            </div>
                            <div className="pp-card-body">
                                <div className="cs-toggles">
                                    <Toggle icon="mdi-account-tie-outline" color="#0284c7" title="Manager approval" text="Reporting manager reviews first" checked={!!lw.managerApproval}>
                                        <input type="checkbox" {...leaveForm.register('managerApproval')} />
                                    </Toggle>
                                    <Toggle icon="mdi-shield-account-outline" color="#7c3aed" title="HR approval" text="HR gives the final sign-off" checked={!!lw.hrApproval}>
                                        <input type="checkbox" {...leaveForm.register('hrApproval')} />
                                    </Toggle>
                                </div>
                                <div className="cs-flow" aria-label="Approval flow preview">
                                    <span className="cs-step" style={{ '--c': '#0b0f19' }}><i className="mdi mdi-account-outline"></i>Employee applies</span>
                                    {lw.managerApproval && <><i className="mdi mdi-chevron-right"></i><span className="cs-step" style={{ '--c': '#0284c7' }}><i className="mdi mdi-account-tie-outline"></i>Manager</span></>}
                                    {lw.hrApproval && <><i className="mdi mdi-chevron-right"></i><span className="cs-step" style={{ '--c': '#7c3aed' }}><i className="mdi mdi-shield-account-outline"></i>HR</span></>}
                                    <i className="mdi mdi-chevron-right"></i>
                                    <span className="cs-step done"><i className="mdi mdi-check-circle"></i>Approved</span>
                                    {!lw.managerApproval && !lw.hrApproval && <div className="cs-flow-note">With both off, requests don't need anyone's sign-off.</div>}
                                </div>
                            </div>
                        </section>

                        <SaveBar dirty={leaveForm.formState.isDirty} saved={leaveSave.saved} label="Save leave policy"
                            onDiscard={() => leavePolicy && resetLeave(leaveValues(leavePolicy))} />
                    </form>
                </div>
            </div>
        </PeopleShell>
    )
}
