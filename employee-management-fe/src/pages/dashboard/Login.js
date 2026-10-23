import React, { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import authActions from '../../redux/auth/Actions'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AuthShell } from './AuthShell'

// TEST ONLY: one-click sign-in for test accounts. Shown in development, or in a build made with
// REACT_APP_DEMO_LOGINS=true. The condition must stay inline in the ternary (and the variable must be
// defined — see .env.production) so webpack can resolve it at build time and leave the account list,
// with its passwords, out of production bundles. Remove before going live.
const DEMO_ACCOUNTS = (process.env.NODE_ENV === 'development' || process.env.REACT_APP_DEMO_LOGINS === 'true')
    ? require('./demoAccounts').DEMO_ACCOUNTS
    : []
const SHOW_DEMO_LOGINS = DEMO_ACCOUNTS.length > 0

const DemoAccounts = ({ onPick, disabled }) => {
    const [open, setOpen] = useState(false)
    const [q, setQ] = useState('')
    const groups = DEMO_ACCOUNTS
        .filter((a) => !q || `${a.name} ${a.designation} ${a.department} ${a.email}`.toLowerCase().includes(q.toLowerCase()))
        .reduce((acc, a) => ({ ...acc, [a.designation]: [...(acc[a.designation] || []), a] }), {})
    return (
        <div className={`lg-demo ${open ? 'open' : ''}`}>
            <button type="button" className="lg-demo-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
                <i className="mdi mdi-flask-outline"></i>
                <span>Test accounts <small>{DEMO_ACCOUNTS.length} users · testing only</small></span>
                <i className={`mdi ${open ? 'mdi-chevron-up' : 'mdi-chevron-down'}`}></i>
            </button>
            {open && (
                <div className="lg-demo-body">
                    <input type="search" className="lg-demo-search" placeholder="Search name or designation…" value={q} onChange={(e) => setQ(e.target.value)} />
                    {Object.entries(groups).map(([designation, list]) => (
                        <div key={designation} className="lg-demo-group">
                            <div className="lg-demo-head">{designation}</div>
                            {list.map((a) => (
                                <button key={a.email} type="button" className="lg-demo-user" disabled={disabled} onClick={() => onPick(a)} title={`Sign in as ${a.name}`}>
                                    <span className="lg-demo-main"><b>{a.name}</b><small>{a.email} · {a.department}</small></span>
                                    <code>{a.password}</code>
                                    <i className="mdi mdi-login"></i>
                                </button>
                            ))}
                        </div>
                    ))}
                    {!Object.keys(groups).length && <p className="lg-demo-none">No match</p>}
                </div>
            )}
        </div>
    )
}

// Left panel: who Astral is and what this workspace is for.
const YEARS = new Date().getFullYear() - 1982
const PRACTICES = [
    ['mdi-magnify-scan', 'Internal Audit'],
    ['mdi-chart-line', 'Business Performance'],
    ['mdi-laptop', 'Technology Advisory'],
    ['mdi-finance', 'Strategic Finance'],
    ['mdi-calculator-variant-outline', 'Managed Finance & Accounting'],
]

const WorkspaceWelcome = () => (
    <div className="lg-welcome">
        <span className="lg-eyebrow">Audit · Assurance · Advisory</span>
        <h1>Stronger governance.<br /><em>Sustainable growth.</em></h1>
        <p>The private workspace for Astral’s Chartered Accountants and Management Consultants — your engagements, clients and team in one place.</p>
        <div className="lg-wp" aria-label="Our practices">
            <header><i className="mdi mdi-file-document-check-outline"></i><b>Engagement checklist</b><small>Director-led</small></header>
            <ol>
                {PRACTICES.map(([icon, label], i) => (
                    <li key={label} style={{ '--d': `${0.6 + i * 0.32}s` }}>
                        <span className="lg-wp-ref">{String(i + 1).padStart(2, '0')}</span>
                        <i className={`mdi ${icon}`}></i>
                        <span className="lg-wp-label">{label}</span>
                        <svg className="lg-tick" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12.5l4.8 4.8L19.5 7" /></svg>
                    </li>
                ))}
            </ol>
            <span className="lg-stamp" aria-hidden="true"><b>Reviewed</b><small>Astral · Est. 1982</small></span>
        </div>
        <dl className="lg-stats">
            <div><dt>{YEARS}+</dt><dd>Years of trust</dd></div>
            <div><dt>5</dt><dd>Integrated practices</dd></div>
            <div><dt>CA</dt><dd>Led teams</dd></div>
        </dl>
    </div>
)

export const Login = () => {
    const dispatch = useDispatch()
    const navigate = useNavigate()
    const location = useLocation()
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
        reset({ email: '', password: '', remember: true })
    }, [dispatch, reset])

    const onPasswordKey = (e) => setCapsLock(e.getModifierState?.('CapsLock') || false)

    return (
        <AuthShell side={<WorkspaceWelcome />}>
                    <h2>Welcome back</h2>
                    <p className="lg-sub">Sign in with your Astral work email to continue to your workspace.</p>

                    {/\bexpired=1\b/.test(window.location.search) && !error && (
                        <div className="lg-alert info" role="status">
                            <i className="mdi mdi-information-outline"></i>
                            <span>Your session ended. Please sign in again.</span>
                        </div>
                    )}
                    {location.state?.passwordReset && !error && (
                        <div className="lg-alert success" role="status">
                            <i className="mdi mdi-check-circle-outline"></i>
                            <span>Password changed. Sign in with your new password.</span>
                        </div>
                    )}
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
                            <input type="checkbox" {...register('remember')} /><span className="lg-check" aria-hidden="true"><i className="mdi mdi-check"></i></span> Keep me signed in for 30 days
                        </label>

                        <button type="submit" className="lg-submit" disabled={submitting}>
                            {submitting
                                ? <><span className="lg-spinner"></span> Signing in…</>
                                : <>Sign in <i className="mdi mdi-arrow-right"></i></>}
                        </button>
                    </form>

                    {SHOW_DEMO_LOGINS && DEMO_ACCOUNTS.length > 0 && (
                        <DemoAccounts disabled={submitting} onPick={(a) => { reset({ email: a.email, password: a.password, remember: true }); OnLogin({ email: a.email, password: a.password, remember: true }) }} />
                    )}

                    <ul className="lg-trust">
                        <li><i className="mdi mdi-lock-check-outline"></i>Encrypted</li>
                        <li><i className="mdi mdi-account-key-outline"></i>Role-based access</li>
                        <li><i className="mdi mdi-eye-off-outline"></i>Private to Astral</li>
                    </ul>
        </AuthShell>
    )
}
