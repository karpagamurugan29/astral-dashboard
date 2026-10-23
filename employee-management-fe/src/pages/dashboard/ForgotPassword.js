import React, { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import authActions from '../../redux/auth/Actions'
import { AuthShell } from './AuthShell'
import { RecoverySteps } from './RecoverySteps'

export const ForgotPassword = () => {
    const dispatch = useDispatch()
    const navigate = useNavigate()
    const { error } = useSelector((state) => state.authReducer || {})
    const { register, handleSubmit, formState: { errors } } = useForm()
    // the request runs in a saga after dispatch returns, so track it ourselves
    const [sending, setSending] = useState(false)

    useEffect(() => { dispatch({ type: authActions.CLEAR_AUTH_MESSAGES }) }, [dispatch])
    useEffect(() => { if (error) setSending(false) }, [error])

    const onSubmit = (data) => {
        setSending(true)
        dispatch({ type: authActions.CLEAR_AUTH_MESSAGES })
        dispatch({
            type: authActions.FORGOT_PASSWORD,
            payload: data,
            // With no email service set up the server returns the code directly (outside production);
            // the reset page shows it so the flow still works.
            onDone: (result) => navigate('/reset-password', { state: { email: data.email, otp: result?.otp } }),
        })
    }

    return (
        <AuthShell side={<RecoverySteps current={0} />}>
            <span className="lg-badge red"><i className="mdi mdi-lock-question"></i></span>
            <h2>Forgot password?</h2>
            <p className="lg-sub">Enter the email you sign in with and we’ll send you a one-time code to reset your password.</p>

            {error && (
                <div className="lg-alert" role="alert">
                    <i className="mdi mdi-alert-circle-outline"></i>
                    <span>{error}</span>
                </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} noValidate>
                <div className="lg-field">
                    <label className="lg-label" htmlFor="fp-email">Work email</label>
                    <div className={`lg-input ${errors.email ? 'is-invalid' : ''}`}>
                        <i className="mdi mdi-email-outline"></i>
                        <input id="fp-email" type="email" autoComplete="email" placeholder="you@company.com" autoFocus
                            {...register('email', { required: 'Enter your email', pattern: { value: /^\S+@\S+\.\S+$/, message: 'Enter a valid email address' } })} />
                    </div>
                    {errors.email && <div className="lg-error"><i className="mdi mdi-information-outline"></i>{errors.email.message}</div>}
                </div>

                <button type="submit" className="lg-submit" disabled={sending}>
                    {sending ? <><span className="lg-spinner"></span> Sending code…</> : <>Send reset code <i className="mdi mdi-arrow-right"></i></>}
                </button>
            </form>

            <Link to="/" className="lg-back"><i className="mdi mdi-arrow-left"></i>Back to sign in</Link>
        </AuthShell>
    )
}
