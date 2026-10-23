import React, { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import authActions from '../../redux/auth/Actions'
import { AuthShell } from './AuthShell'
import { RecoverySteps } from './RecoverySteps'

// 0–4 from length and character variety; shown as a meter under the new password
const strengthOf = (p = '') => {
    let s = 0
    if (p.length >= 8) s++
    if (p.length >= 12) s++
    if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++
    if (/\d/.test(p) && /[^A-Za-z0-9]/.test(p)) s++
    return Math.min(4, s)
}
const STRENGTH = [['Too short', '#e11d48'], ['Weak', '#f97316'], ['Fair', '#eab308'], ['Good', '#22c55e'], ['Strong', '#059669']]

export const ResetPassword = () => {
    const dispatch = useDispatch()
    const navigate = useNavigate()
    const location = useLocation()
    const { error } = useSelector((state) => state.authReducer || {})
    const devOtp = location.state?.otp || ''
    const { register, handleSubmit, watch, formState: { errors } } = useForm({
        defaultValues: { email: location.state?.email || '', otp: devOtp },
    })
    const [show, setShow] = useState(false)
    const [saving, setSaving] = useState(false)
    const newPassword = watch('newPassword') || ''
    const otp = watch('otp') || ''
    const strength = newPassword ? strengthOf(newPassword) : null

    useEffect(() => { dispatch({ type: authActions.CLEAR_AUTH_MESSAGES }) }, [dispatch])
    useEffect(() => { if (error) setSaving(false) }, [error])

    const onSubmit = (data) => {
        setSaving(true)
        dispatch({ type: authActions.CLEAR_AUTH_MESSAGES })
        // on success the saga sends us to sign in; tell the login page so it can confirm
        dispatch({ type: authActions.RESET_PASSWORD, payload: data, navigate: (to) => navigate(to, { state: { passwordReset: true } }) })
    }

    return (
        <AuthShell side={<RecoverySteps current={otp ? 2 : 1} />}>
            <span className="lg-badge blue"><i className="mdi mdi-shield-key-outline"></i></span>
            <h2>Reset password</h2>
            <p className="lg-sub">Enter the code we sent{location.state?.email ? <> to <b>{location.state.email}</b></> : ' to your email'} and choose a new password.</p>

            {devOtp && (
                <div className="lg-alert info" role="status">
                    <i className="mdi mdi-information-outline"></i>
                    <span>Email isn’t set up yet, so your code is filled in below: <b>{devOtp}</b></span>
                </div>
            )}
            {error && (
                <div className="lg-alert" role="alert">
                    <i className="mdi mdi-alert-circle-outline"></i>
                    <span>{error}</span>
                </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} noValidate>
                {!location.state?.email && (
                    <div className="lg-field">
                        <label className="lg-label" htmlFor="rp-email">Work email</label>
                        <div className={`lg-input ${errors.email ? 'is-invalid' : ''}`}>
                            <i className="mdi mdi-email-outline"></i>
                            <input id="rp-email" type="email" autoComplete="email" placeholder="you@company.com" {...register('email', { required: 'Enter your email' })} />
                        </div>
                        {errors.email && <div className="lg-error"><i className="mdi mdi-information-outline"></i>{errors.email.message}</div>}
                    </div>
                )}

                <div className="lg-field">
                    <label className="lg-label" htmlFor="rp-otp">One-time code<Link to="/forgot-password">Send a new code</Link></label>
                    <div className={`lg-input lg-otp ${errors.otp ? 'is-invalid' : ''}`}>
                        <i className="mdi mdi-numeric"></i>
                        <input id="rp-otp" inputMode="numeric" autoComplete="one-time-code" placeholder="••••••" maxLength={8}
                            {...register('otp', { required: 'Enter the code from your email' })} />
                    </div>
                    {errors.otp && <div className="lg-error"><i className="mdi mdi-information-outline"></i>{errors.otp.message}</div>}
                </div>

                <div className="lg-field">
                    <label className="lg-label" htmlFor="rp-new">New password</label>
                    <div className={`lg-input ${errors.newPassword ? 'is-invalid' : ''}`}>
                        <i className="mdi mdi-lock-outline"></i>
                        <input id="rp-new" type={show ? 'text' : 'password'} autoComplete="new-password" placeholder="At least 8 characters"
                            {...register('newPassword', { required: 'Choose a new password', minLength: { value: 8, message: 'Use at least 8 characters' } })} />
                        <button type="button" className="lg-eye" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'}><i className={`mdi ${show ? 'mdi-eye-off-outline' : 'mdi-eye-outline'}`}></i></button>
                    </div>
                    {strength !== null && (
                        <div className="lg-strength" style={{ '--c': STRENGTH[strength][1] }}>
                            <span className="lg-strength-bar">{[0, 1, 2, 3].map((i) => <i key={i} className={i < strength ? 'on' : ''}></i>)}</span>
                            <small>{STRENGTH[strength][0]}</small>
                        </div>
                    )}
                    {errors.newPassword && <div className="lg-error"><i className="mdi mdi-information-outline"></i>{errors.newPassword.message}</div>}
                </div>

                <div className="lg-field">
                    <label className="lg-label" htmlFor="rp-confirm">Confirm new password</label>
                    <div className={`lg-input ${errors.confirmPassword ? 'is-invalid' : ''}`}>
                        <i className="mdi mdi-lock-check-outline"></i>
                        <input id="rp-confirm" type={show ? 'text' : 'password'} autoComplete="new-password" placeholder="Type it again"
                            {...register('confirmPassword', { required: 'Type the new password again', validate: (v) => v === newPassword || 'Passwords don’t match' })} />
                    </div>
                    {errors.confirmPassword && <div className="lg-error"><i className="mdi mdi-information-outline"></i>{errors.confirmPassword.message}</div>}
                </div>

                <button type="submit" className="lg-submit" disabled={saving}>
                    {saving ? <><span className="lg-spinner"></span> Saving…</> : <>Reset password <i className="mdi mdi-check"></i></>}
                </button>
            </form>

            <Link to="/" className="lg-back"><i className="mdi mdi-arrow-left"></i>Back to sign in</Link>
        </AuthShell>
    )
}
