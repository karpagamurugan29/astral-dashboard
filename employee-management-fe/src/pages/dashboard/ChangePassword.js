import React, { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useForm } from 'react-hook-form'
import authActions from '../../redux/auth/Actions'
import { PeopleShell, ErrorBanner } from '../../components/people/PeopleUI'
import '../../components/settings/settings.css'

const ACCOUNT_ROOT = { label: 'Account', to: '/profile' }

const RULES = [
    ['At least 8 characters', (v) => v.length >= 8],
    ['An uppercase letter', (v) => /[A-Z]/.test(v)],
    ['A number', (v) => /\d/.test(v)],
    ['A symbol (!@#…)', (v) => /[^A-Za-z0-9]/.test(v)],
]
const LEVELS = [
    { label: 'Too weak', color: '#e11d48' },
    { label: 'Weak', color: '#ea580c' },
    { label: 'Fair', color: '#d97706' },
    { label: 'Good', color: '#0284c7' },
    { label: 'Strong', color: '#059669' },
]

const PasswordInput = ({ id, show, onToggle, error, inputProps }) => (
    <div className="pw-input">
        <input id={id} type={show ? 'text' : 'password'} className={`pp-input ${error ? 'is-invalid' : ''}`} {...inputProps} />
        <button type="button" onClick={onToggle} aria-label={show ? 'Hide password' : 'Show password'}><i className={`mdi ${show ? 'mdi-eye-off-outline' : 'mdi-eye-outline'}`}></i></button>
    </div>
)

export const ChangePassword = () => {
    const dispatch = useDispatch()
    const { error, message } = useSelector((state) => state.authReducer || {})
    const { register, handleSubmit, watch, reset, formState: { errors, isSubmitting } } = useForm()
    const [show, setShow] = useState({})
    const newPassword = watch('newPassword') || ''
    const confirm = watch('confirmPassword') || ''

    useEffect(() => { dispatch({ type: authActions.CLEAR_AUTH_MESSAGES }) }, [dispatch])

    const onSubmit = (data) => {
        dispatch({ type: authActions.CLEAR_AUTH_MESSAGES })
        dispatch({
            type: authActions.CHANGE_PASSWORD,
            payload: { currentPassword: data.currentPassword, newPassword: data.newPassword },
            onDone: () => reset({ currentPassword: '', newPassword: '', confirmPassword: '' }),
        })
    }

    const passed = RULES.filter(([, test]) => test(newPassword)).length
    const level = newPassword ? LEVELS[passed] : null
    const toggle = (k) => setShow((s) => ({ ...s, [k]: !s[k] }))

    return (
        <PeopleShell title="Change password" root={ACCOUNT_ROOT} crumbs={[{ label: 'Password' }]} backTo="/profile">
            <ErrorBanner error={error} />
            {message && <div className="mp-alert" role="status" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', marginBottom: 16, borderRadius: 12, color: '#065f46', background: '#ecfdf5', border: '1px solid #a7f3d0' }}><i className="mdi mdi-check-circle" style={{ fontSize: 20, color: '#059669' }}></i>{message}</div>}

            <div className="pw-wrap">
                <form className="pp-card" onSubmit={handleSubmit(onSubmit)} noValidate>
                    <div className="pp-card-head"><h3><i className="mdi mdi-lock-reset me-2" style={{ color: '#0284c7' }}></i>Update your password</h3></div>
                    <div className="pp-card-body">
                        <div className="pp-field">
                            <label className="pp-label" htmlFor="pw-current">Current password<span className="req">*</span></label>
                            <PasswordInput id="pw-current" show={show.current} onToggle={() => toggle('current')} error={errors.currentPassword}
                                inputProps={{ autoComplete: 'current-password', ...register('currentPassword', { required: 'Enter your current password' }) }} />
                            {errors.currentPassword && <div className="pp-err">{errors.currentPassword.message}</div>}
                        </div>
                        <div className="pp-field">
                            <label className="pp-label" htmlFor="pw-new">New password<span className="req">*</span></label>
                            <PasswordInput id="pw-new" show={show.next} onToggle={() => toggle('next')} error={errors.newPassword}
                                inputProps={{ autoComplete: 'new-password', ...register('newPassword', { required: 'Choose a new password', minLength: { value: 8, message: 'Use at least 8 characters' } }) }} />
                            <div className="pw-meter" aria-hidden="true">
                                {[0, 1, 2, 3].map((i) => <span key={i} style={{ background: level && i < passed ? level.color : undefined }}></span>)}
                            </div>
                            <div className="pw-strength" style={{ '--c': level?.color }}><span>Strength</span><b>{level ? level.label : '—'}</b></div>
                            {errors.newPassword && <div className="pp-err">{errors.newPassword.message}</div>}
                        </div>
                        <div className="pp-field">
                            <label className="pp-label" htmlFor="pw-confirm">Confirm new password<span className="req">*</span></label>
                            <PasswordInput id="pw-confirm" show={show.confirm} onToggle={() => toggle('confirm')} error={errors.confirmPassword}
                                inputProps={{ autoComplete: 'new-password', ...register('confirmPassword', { required: 'Type it again', validate: (v) => v === newPassword || 'Passwords don’t match' }) }} />
                            {errors.confirmPassword
                                ? <div className="pp-err">{errors.confirmPassword.message}</div>
                                : confirm && confirm === newPassword && <div className="pp-help" style={{ color: '#059669', fontWeight: 600 }}><i className="mdi mdi-check"></i> Passwords match</div>}
                        </div>
                        <button type="submit" className="pp-btn primary w-100" disabled={isSubmitting}><i className="mdi mdi-shield-check-outline"></i> {isSubmitting ? 'Saving…' : 'Change password'}</button>
                    </div>
                </form>

                <aside className="pp-card pp-card-body">
                    <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: 'var(--pp-ink)' }}>A strong password has</h3>
                    <ul className="pw-checks">
                        {RULES.map(([label, test]) => {
                            const ok = test(newPassword)
                            return <li key={label} className={ok ? 'ok' : ''}><i className={`mdi ${ok ? 'mdi-check' : 'mdi-minus'}`}></i>{label}</li>
                        })}
                    </ul>
                    <div className="pw-tip"><i className="mdi mdi-lightbulb-on-outline me-1"></i>Tip: a short phrase like <b>Coffee-at-9am!</b> is easier to remember and harder to guess than a random word.</div>
                </aside>
            </div>
        </PeopleShell>
    )
}
