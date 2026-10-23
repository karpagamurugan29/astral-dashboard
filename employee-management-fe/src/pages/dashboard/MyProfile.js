import React, { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import authActions from '../../redux/auth/Actions'
import { PeopleShell, StatusPill, DeptTag, ErrorBanner, fullName, fmtDate, tenure } from '../../components/people/PeopleUI'
import { MyTeamCard } from '../../components/org/OrgUI'
import { PhotoPicker } from '../../components/people/PhotoPicker'
import './MyProfile.css'

const ACCOUNT_ROOT = { label: 'Account', to: '/profile' }

// Nested objects — dotted keys like 'address.city' don't prefill nested fields.
const toForm = (u) => ({
    firstName: u?.firstName || '',
    lastName: u?.lastName || '',
    phoneNumber: u?.phoneNumber || '',
    address: {
        street: u?.address?.street || '',
        city: u?.address?.city || '',
        state: u?.address?.state || '',
        country: u?.address?.country || '',
        pincode: u?.address?.pincode || '',
    },
    emergencyContact: {
        name: u?.emergencyContact?.name || '',
        relation: u?.emergencyContact?.relation || '',
        phone: u?.emergencyContact?.phone || '',
    },
})

// What counts towards "profile complete".
const CHECKS = [
    ['phoneNumber', 'phone number'],
    ['address.street', 'street'], ['address.city', 'city'], ['address.state', 'state'], ['address.pincode', 'pincode'],
    ['emergencyContact.name', 'emergency contact'], ['emergencyContact.phone', 'emergency phone'],
]
const get = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj)

export const MyProfile = () => {
    const dispatch = useDispatch()
    const { isAuthenticated: user, error, message } = useSelector((state) => state.authReducer || {})
    const { register, handleSubmit, reset, watch, formState: { isSubmitting, isDirty, errors } } = useForm({ defaultValues: toForm(user) })

    useEffect(() => {
        dispatch({ type: authActions.CLEAR_AUTH_MESSAGES })
    }, [dispatch])

    // Reload the form whenever the saved profile changes (first load and after a save).
    useEffect(() => {
        if (user) reset(toForm(user))
    }, [user, reset])

    const onSubmit = (data) => {
        dispatch({ type: authActions.CLEAR_AUTH_MESSAGES })
        dispatch({ type: authActions.UPDATE_PROFILE, payload: data })
    }

    const values = watch()
    const filled = CHECKS.filter(([p]) => String(get(values, p) || '').trim())
    const pct = Math.round((filled.length / CHECKS.length) * 100)
    const missing = CHECKS.filter(([p]) => !String(get(values, p) || '').trim()).map(([, label]) => label)
    const pctColor = pct === 100 ? '#10b981' : pct >= 60 ? '#0ea5e9' : '#f59e0b'

    return (
        <PeopleShell title="My profile" root={ACCOUNT_ROOT} crumbs={[{ label: 'Profile' }]}
            actions={<Link to="/change-password" className="pp-btn"><i className="mdi mdi-lock-reset"></i> Change password</Link>}>
            <ErrorBanner error={error} />
            {message && <div className="mp-alert" role="status"><i className="mdi mdi-check-circle"></i>{message}</div>}

            <div className="mp-layout">
                {/* ---------- identity ---------- */}
                <aside className="pp-card mp-id">
                    <div className="mp-id-top">
                        <PhotoPicker person={user} endpoint="/auth/profile/photo" onChange={(profileImage) => dispatch({ type: authActions.SET_AUTH, payload: { ...user, profileImage } })} />
                        <h2>{fullName(user)}</h2>
                        <p className="mp-id-title">{user?.designation || '—'}</p>
                        <div className="mp-pills">
                            {user?.status && <StatusPill status={user.status} />}
                            {user?.role && <span className="pp-chip"><i className="mdi mdi-shield-account-outline"></i>{user.role}</span>}
                        </div>
                    </div>

                    <div className="mp-complete">
                        <div className="mp-complete-head"><span>Profile complete</span><b>{pct}%</b></div>
                        <div className="mp-complete-track"><span style={{ width: `${pct}%`, background: pctColor }}></span></div>
                        <small>{missing.length ? `Add your ${missing.slice(0, 2).join(' and ')}${missing.length > 2 ? ` +${missing.length - 2} more` : ''}.` : 'Everything is filled in — thank you!'}</small>
                    </div>

                    <dl className="mp-facts">
                        <div className="mp-fact" style={{ '--c': '#0b0f19' }}><i className="mdi mdi-identifier"></i><dt>Employee ID</dt><dd>{user?.employeeId || '—'}</dd></div>
                        <div className="mp-fact" style={{ '--c': '#0284c7' }}><i className="mdi mdi-email-outline"></i><dt>Email</dt><dd>{user?.email || '—'}</dd></div>
                        <div className="mp-fact" style={{ '--c': '#7c3aed' }}><i className="mdi mdi-office-building-outline"></i><dt>Department</dt><dd>{user?.department ? <DeptTag name={user.department} /> : '—'}</dd></div>
                        <div className="mp-fact" style={{ '--c': '#059669' }}><i className="mdi mdi-calendar-start"></i><dt>Joined</dt><dd>{fmtDate(user?.joiningDate)}{user?.joiningDate ? ` · ${tenure(user.joiningDate)}` : ''}</dd></div>
                    </dl>

                    <nav className="mp-links" aria-label="Quick links">
                        <Link to="/attendance/today" className="mp-link" style={{ '--c': '#059669' }}><i className="mdi mdi-clock-check-outline"></i>My attendance<i className="mdi mdi-chevron-right"></i></Link>
                        <Link to="/leave" className="mp-link" style={{ '--c': '#7c3aed' }}><i className="mdi mdi-beach"></i>My leave<i className="mdi mdi-chevron-right"></i></Link>
                        <Link to="/payroll/payslips" className="mp-link" style={{ '--c': '#0b0f19' }}><i className="mdi mdi-receipt"></i>My payslips<i className="mdi mdi-chevron-right"></i></Link>
                        <Link to="/assets/mine" className="mp-link" style={{ '--c': '#0284c7' }}><i className="mdi mdi-laptop"></i>My assets<i className="mdi mdi-chevron-right"></i></Link>
                    </nav>
                </aside>

                <div className="mp-main">
                {/* ---------- team & reporting line ---------- */}
               

                {/* ---------- editable details ---------- */}
                <form onSubmit={handleSubmit(onSubmit)} noValidate>
                    <section className="pp-card mp-section">
                        <div className="pp-card-head">
                            <span className="mp-head-icon" style={{ '--c': '#0284c7' }}><i className="mdi mdi-account-outline"></i></span>
                            <div><h3>Personal details</h3><p>Your name and how to reach you.</p></div>
                        </div>
                        <div className="pp-card-body">
                            <div className="mp-fields">
                                <div className="pp-field">
                                    <label className="pp-label">First name<span className="req">*</span></label>
                                    <input type="text" className={`pp-input ${errors.firstName ? 'is-invalid' : ''}`} {...register('firstName', { required: 'First name is required' })} />
                                    {errors.firstName && <div className="pp-err">{errors.firstName.message}</div>}
                                </div>
                                <div className="pp-field">
                                    <label className="pp-label">Last name<span className="req">*</span></label>
                                    <input type="text" className={`pp-input ${errors.lastName ? 'is-invalid' : ''}`} {...register('lastName', { required: 'Last name is required' })} />
                                    {errors.lastName && <div className="pp-err">{errors.lastName.message}</div>}
                                </div>
                                <div className="pp-field">
                                    <label className="pp-label">Phone number<span className="req">*</span></label>
                                    <input type="tel" className={`pp-input ${errors.phoneNumber ? 'is-invalid' : ''}`} {...register('phoneNumber', { required: 'Phone number is required' })} />
                                    {errors.phoneNumber && <div className="pp-err">{errors.phoneNumber.message}</div>}
                                </div>
                                <div className="pp-field">
                                    <label className="pp-label">Email</label>
                                    <input type="email" className="pp-input" value={user?.email || ''} disabled readOnly />
                                    <div className="pp-help">Your login email — ask HR to change it.</div>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section className="pp-card mp-section">
                        <div className="pp-card-head">
                            <span className="mp-head-icon" style={{ '--c': '#059669' }}><i className="mdi mdi-home-outline"></i></span>
                            <div><h3>Address</h3><p>Used for letters, payslips and courier.</p></div>
                        </div>
                        <div className="pp-card-body">
                            <div className="mp-fields three">
                                <div className="pp-field span-2"><label className="pp-label">Street</label><input type="text" className="pp-input" {...register('address.street')} /></div>
                                <div className="pp-field"><label className="pp-label">City</label><input type="text" className="pp-input" {...register('address.city')} /></div>
                                <div className="pp-field"><label className="pp-label">State</label><input type="text" className="pp-input" {...register('address.state')} /></div>
                                <div className="pp-field"><label className="pp-label">Country</label><input type="text" className="pp-input" {...register('address.country')} /></div>
                                <div className="pp-field"><label className="pp-label">Pincode</label><input type="text" inputMode="numeric" className="pp-input" {...register('address.pincode')} /></div>
                            </div>
                        </div>
                    </section>

                    <section className="pp-card mp-section">
                        <div className="pp-card-head">
                            <span className="mp-head-icon" style={{ '--c': '#e11d48' }}><i className="mdi mdi-lifebuoy"></i></span>
                            <div><h3>Emergency contact</h3><p>Who we should call if something happens at work.</p></div>
                        </div>
                        <div className="pp-card-body">
                            <div className="mp-fields three">
                                <div className="pp-field"><label className="pp-label">Name</label><input type="text" className="pp-input" {...register('emergencyContact.name')} /></div>
                                <div className="pp-field"><label className="pp-label">Relation</label><input type="text" placeholder="e.g. Spouse" className="pp-input" {...register('emergencyContact.relation')} /></div>
                                <div className="pp-field"><label className="pp-label">Phone</label><input type="tel" className="pp-input" {...register('emergencyContact.phone')} /></div>
                            </div>
                        </div>
                    </section>

                    <section className="pp-card mp-section">
                        <div className="pp-card-head">
                            <span className="mp-head-icon" style={{ '--c': '#7c3aed' }}><i className="mdi mdi-briefcase-outline"></i></span>
                            <div><h3>Work details</h3><p>Managed by HR.</p></div>
                        </div>
                        <div className="pp-card-body">
                            <div className="mp-work">
                                <div><small>Designation</small><b>{user?.designation || '—'}</b></div>
                                <div><small>Employment type</small><b>{user?.employmentType || '—'}</b></div>
                                <div><small>Access role</small><b>{user?.role || '—'}</b></div>
                            </div>
                            <div className="mp-note"><i className="mdi mdi-information-outline"></i>Something wrong here? Raise a ticket with <Link to="/helpdesk" style={{ color: '#0284c7', fontWeight: 600 }}>HR Helpdesk</Link>.</div>
                        </div>
                    </section>

                    <div className={`mp-bar ${isDirty ? 'dirty' : ''}`}>
                        {isDirty
                            ? <span className="mp-bar-note dirty"><i className="mdi mdi-pencil-circle-outline"></i>Unsaved changes</span>
                            : <span className="mp-bar-note"><i className="mdi mdi-cloud-check-outline"></i>All changes saved</span>}
                        <div className="d-flex gap-2">
                            <button type="button" className="pp-btn" disabled={!isDirty} onClick={() => reset(toForm(user))}>Discard</button>
                            <button type="submit" className="pp-btn primary" disabled={!isDirty || isSubmitting}><i className="mdi mdi-content-save-outline"></i> Save changes</button>
                        </div>
                    </div>
                </form>
                 <MyTeamCard />
                </div>
            </div>
        </PeopleShell>
    )
}
