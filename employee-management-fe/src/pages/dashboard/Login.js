import React, { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import authActions from '../../redux/auth/Actions'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import './Login.css'

const Logo = ({ className = '' }) => (
    <Link to="/" className={`lg-logo ${className}`}>
        <span className="lg-logo-mark"><i className="mdi mdi-account-group"></i></span>
        <span>Ho<span className="lg-o">O</span>ok</span>
    </Link>
)

export const Login = () => {
    const dispatch = useDispatch()
    const navigate = useNavigate()
    const { error } = useSelector((state) => state.authReducer || {})
    const { register, reset, handleSubmit, formState: { errors }, } = useForm()
    const [showPassword, setShowPassword] = useState(false)
    const [capsLock, setCapsLock] = useState(false)
    // The saga runs after dispatch returns, so react-hook-form's isSubmitting is never
    // true long enough to show — track the request ourselves until an error comes back
    // (a successful login navigates away and unmounts this page).
    const [submitting, setSubmitting] = useState(false)

    const OnLogin = (data) => {
        setSubmitting(true)
        dispatch({ type: authActions.CLEAR_AUTH_MESSAGES })
        dispatch({ type: authActions.LOG_IN, payload: data, navigate })
    }

    useEffect(() => {
        if (error) setSubmitting(false)
    }, [error])

    useEffect(() => {
        dispatch({ type: authActions.CLEAR_AUTH_MESSAGES })
        reset({
            email: 'admin@hoook.com',
            password: 'Admin@2026'
        })
    }, [dispatch, reset])

    const onPasswordKey = (e) => setCapsLock(e.getModifierState?.('CapsLock') || false)

    return (
        <div className="lg-page">
            <aside className="lg-brand">
                <Logo />

                <div className="lg-pitch">
                    <h1>Your whole workforce, in one calm workspace.</h1>
                    <p>Attendance, leave, payroll and people data — organised, secure and always up to date.</p>
                    <ul className="lg-features">
                        <li><i className="mdi mdi-clock-check-outline"></i> Real-time attendance &amp; shifts</li>
                        <li><i className="mdi mdi-calendar-check-outline"></i> One-click leave approvals</li>
                        <li><i className="mdi mdi-cash-multiple"></i> Payroll &amp; payslips without spreadsheets</li>
                    </ul>

                    <div className="lg-glance" aria-hidden="true">
                        <div className="lg-glance-head">
                            <span>Today at a glance</span>
                            <span className="lg-live">Preview</span>
                        </div>
                        <div className="lg-stats">
                            <div className="lg-stat"><b>128</b><span>Present</span></div>
                            <div className="lg-stat"><b>6</b><span>On leave</span></div>
                            <div className="lg-stat"><b>3</b><span>Requests</span></div>
                        </div>
                        <div className="lg-bar"><span></span></div>
                    </div>
                </div>

                <div className="lg-brand-foot">HoOok Employee Management</div>
            </aside>

            <main className="lg-main">
                <Logo className="lg-mobile-logo" />

                <div className="lg-card">
                    <h2>Welcome back 👋</h2>
                    <p className="lg-sub">Sign in to continue to your HoOok workspace.</p>

                    {error && (
                        <div className="lg-alert" role="alert">
                            <i className="mdi mdi-alert-circle-outline"></i>
                            <span>{error}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit(OnLogin)} noValidate>
                        <div className="lg-field">
                            <label className="lg-label" htmlFor="login-email">Email address</label>
                            <div className={`lg-input ${errors.email ? 'is-invalid' : ''}`}>
                                <i className="mdi mdi-email-outline"></i>
                                <input
                                    id="login-email"
                                    type="email"
                                    autoComplete="email"
                                    placeholder="you@company.com"
                                    aria-invalid={!!errors.email}
                                    {...register('email', {
                                        required: 'Email is required',
                                        pattern: { value: /^\S+@\S+\.\S+$/, message: 'Enter a valid email address' },
                                    })}
                                />
                            </div>
                            {errors.email && <div className="lg-error"><i className="mdi mdi-information-outline"></i>{errors.email.message}</div>}
                        </div>

                        <div className="lg-field">
                            <label className="lg-label" htmlFor="login-password">
                                Password
                                <Link to="/forgot-password">Forgot password?</Link>
                            </label>
                            <div className={`lg-input ${errors.password ? 'is-invalid' : ''}`}>
                                <i className="mdi mdi-lock-outline"></i>
                                <input
                                    id="login-password"
                                    type={showPassword ? 'text' : 'password'}
                                    autoComplete="current-password"
                                    placeholder="Enter your password"
                                    aria-invalid={!!errors.password}
                                    onKeyUp={onPasswordKey}
                                    onKeyDown={onPasswordKey}
                                    {...register('password', { required: 'Password is required' })}
                                />
                                <button
                                    type="button"
                                    className="lg-eye"
                                    onClick={() => setShowPassword((v) => !v)}
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                >
                                    <i className={`mdi ${showPassword ? 'mdi-eye-off-outline' : 'mdi-eye-outline'}`}></i>
                                </button>
                            </div>
                            {errors.password && <div className="lg-error"><i className="mdi mdi-information-outline"></i>{errors.password.message}</div>}
                            {capsLock && <div className="lg-caps"><i className="mdi mdi-apple-keyboard-caps"></i>Caps Lock is on</div>}
                        </div>

                        <label className="lg-remember">
                            <input type="checkbox" /> Keep me signed in
                        </label>

                        <button type="submit" className="lg-submit" disabled={submitting}>
                            {submitting
                                ? <><span className="lg-spinner"></span> Signing in…</>
                                : <>Sign in <i className="mdi mdi-arrow-right"></i></>}
                        </button>
                    </form>

                    <div className="lg-secure">
                        <i className="mdi mdi-shield-check-outline"></i> Secured with encrypted, HTTP-only sessions
                    </div>
                </div>

                <p className="lg-foot">© {new Date().getFullYear()} HoOok. All rights reserved.</p>
            </main>
        </div>
    )
}
