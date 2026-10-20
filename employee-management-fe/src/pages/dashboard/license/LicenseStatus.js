import React, { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useForm } from 'react-hook-form'
import licenseActions from '../../../redux/license/Actions'
import { PeopleShell, ProgressRing, EmptyState, ErrorBanner, fmtDate } from '../../../components/people/PeopleUI'
import '../../../components/settings/settings.css'

const SETTINGS_ROOT = { label: 'Settings', to: '/settings/company' }

const TIERS = [
    { value: 'Core', icon: 'mdi-cube-outline', color: '#64748b', text: 'People, attendance and leave' },
    { value: 'Standard', icon: 'mdi-star-outline', color: '#0284c7', text: 'Adds payroll, projects and assets' },
    { value: 'Premium', icon: 'mdi-crown-outline', color: '#d97706', text: 'Everything, plus reports and audit' },
]

export const LicenseStatus = () => {
    const dispatch = useDispatch()
    const { license, error } = useSelector((state) => state.licenseReducer || {})
    const { isAuthenticated: user } = useSelector((state) => state.authReducer || {})
    const isAdmin = user?.role === 'Admin'
    const { register, handleSubmit, setValue, getValues, formState: { errors } } = useForm({ defaultValues: { tier: 'Core', seats: 10 } })

    useEffect(() => {
        dispatch({ type: licenseActions.GET_LICENSE_STATUS })
    }, [dispatch])

    // Pre-select the current plan when renewing.
    useEffect(() => {
        if (license) {
            setValue('tier', license.tier || 'Core')
            setValue('seats', license.seats || 10)
        }
    }, [license, setValue])

    const onActivate = (data) => dispatch({ type: licenseActions.ACTIVATE_LICENSE, payload: data })
    const step = (d) => setValue('seats', Math.max(1, (Number(getValues('seats')) || 0) + d))

    if (!isAdmin) {
        return (
            <PeopleShell title="License" root={SETTINGS_ROOT} crumbs={[{ label: 'License' }]}>
                <div className="pp-card"><EmptyState icon="mdi-lock-outline" title="Admins only" text="Only Admin can view or manage the license." /></div>
            </PeopleShell>
        )
    }

    const days = license?.expiresAt ? Math.ceil((new Date(license.expiresAt) - Date.now()) / 864e5) : null
    const expiryColor = days === null ? '#64748b' : days < 0 ? '#e11d48' : days <= 30 ? '#d97706' : '#059669'
    const seatPct = license?.seats ? Math.min(100, (license.seatsUsed / license.seats) * 100) : 0
    const seatColor = seatPct >= 100 ? '#e11d48' : seatPct >= 85 ? '#d97706' : '#0ea5e9'
    const tier = TIERS.find((t) => t.value === license?.tier) || TIERS[0]
    const active = license?.status === 'Active'

    return (
        <PeopleShell title="License" root={SETTINGS_ROOT} crumbs={[{ label: 'License' }]}>
            <ErrorBanner error={error} />

            {license && (
                <div className="lc-status">
                    <section className="pp-card lc-main" style={{ '--c': active ? '#34d399' : '#fb7185' }}>
                        <span className="lc-badge"><i className={`mdi ${active ? 'mdi-shield-check' : 'mdi-shield-alert-outline'}`}></i></span>
                        <div>
                            <small>{tier.value} plan</small>
                            <b>{active ? 'License active' : `License ${String(license.status || 'inactive').toLowerCase()}`}</b>
                            <span>{tier.text}</span>
                        </div>
                    </section>
                    <section className="pp-card lc-box" style={{ '--c': seatColor }}>
                        <ProgressRing value={seatPct} size={64} stroke={7} color={seatColor}>{Math.round(seatPct)}%</ProgressRing>
                        <div><h4>Seats used</h4><b>{license.seatsUsed} / {license.seats}</b><small>{license.seats - license.seatsUsed > 0 ? `${license.seats - license.seatsUsed} free` : 'No free seats'}</small></div>
                    </section>
                    <section className="pp-card lc-box" style={{ '--c': expiryColor }}>
                        <span className="st-icon" style={{ '--c': expiryColor, width: 56, height: 56, fontSize: 26 }}><i className="mdi mdi-calendar-clock"></i></span>
                        <div><h4>Expires</h4><b>{fmtDate(license.expiresAt)}</b><small>{days === null ? '' : days < 0 ? `Expired ${-days} days ago` : days === 0 ? 'Expires today' : `${days} days left`}</small></div>
                    </section>
                </div>
            )}

            <form className="pp-card" onSubmit={handleSubmit(onActivate)} noValidate>
                <div className="pp-card-head"><h3><i className="mdi mdi-key-variant me-2" style={{ color: '#0284c7' }}></i>{license ? 'Renew or change plan' : 'Activate your license'}</h3></div>
                <div className="pp-card-body">
                    <label className="pp-label">Plan</label>
                    <div className="lc-tiers" role="radiogroup" aria-label="Plan">
                        {TIERS.map((t) => (
                            <label key={t.value} style={{ '--c': t.color }}>
                                <input type="radio" value={t.value} {...register('tier')} />
                                <span className="lc-tier"><i className={`mdi ${t.icon}`}></i><b>{t.value}</b><small>{t.text}</small></span>
                            </label>
                        ))}
                    </div>
                    <div className="lc-form-row">
                        <div className="pp-field">
                            <label className="pp-label">License key<span className="req">*</span></label>
                            <input type="text" autoComplete="off" spellCheck={false} placeholder="XXXX-XXXX-XXXX-XXXX" className={`pp-input ${errors.licenseKey ? 'is-invalid' : ''}`}
                                style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', letterSpacing: '.04em' }}
                                {...register('licenseKey', { required: 'Enter your license key', minLength: { value: 8, message: 'That key looks too short' } })} />
                            {errors.licenseKey && <div className="pp-err">{errors.licenseKey.message}</div>}
                        </div>
                        <div className="pp-field">
                            <label className="pp-label">Seats</label>
                            <div className="d-flex gap-2">
                                <button type="button" className="pp-btn icon" onClick={() => step(-1)} aria-label="Fewer seats"><i className="mdi mdi-minus"></i></button>
                                <input type="number" min="1" className="pp-input text-center" {...register('seats', { valueAsNumber: true, min: 1 })} />
                                <button type="button" className="pp-btn icon" onClick={() => step(1)} aria-label="More seats"><i className="mdi mdi-plus"></i></button>
                            </div>
                        </div>
                    </div>
                    <div className="st-foot">
                        <button type="submit" className="pp-btn primary"><i className="mdi mdi-check-decagram"></i> {license ? 'Apply' : 'Activate'}</button>
                    </div>
                </div>
            </form>
        </PeopleShell>
    )
}
