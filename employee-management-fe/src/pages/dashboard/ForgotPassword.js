import React, { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import authActions from '../../redux/auth/Actions'

export const ForgotPassword = () => {
    const dispatch = useDispatch()
    const navigate = useNavigate()
    const { error } = useSelector((state) => state.authReducer || {})
    const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm()
    const [sentEmail, setSentEmail] = useState('')
    const [devOtp, setDevOtp] = useState('')

    const onSubmit = (data) => {
        dispatch({
            type: authActions.FORGOT_PASSWORD,
            payload: data,
            onDone: (result) => {
                setSentEmail(data.email)
                // The backend has no email service wired up yet, so it returns the OTP
                // directly for now — surface it here so the reset flow is usable end to end.
                setDevOtp(result?.otp)
                navigate('/reset-password', { state: { email: data.email, otp: result?.otp } })
            },
        })
    }

    return (
        <div className="auth-page">
            <div className="container-fluid p-0">
                <div className="row g-0 justify-content-center">
                    <div className="col-xxl-3 col-lg-4 col-md-5">
                        <div className="auth-full-page-content d-flex p-sm-5 p-4">
                            <div className="w-100">
                                <div className="d-flex flex-column h-100">
                                    <div className="mb-4 mb-md-5 text-center">
                                        <Link to="/" className="d-block auth-logo">
                                            <span className="logo-txt">Ho<span className='clr-blue'>O</span>ok</span>
                                        </Link>
                                    </div>
                                    <div className="auth-content my-auto">
                                        <div className="text-center">
                                            <h5 className="mb-0">Forgot Password</h5>
                                            <p className="text-muted mt-2">Enter your email and we'll send you a one-time code to reset your password.</p>
                                        </div>

                                        {error && <div className="alert alert-danger mt-4 mb-0">{error}</div>}
                                        {sentEmail && (
                                            <div className="alert alert-success mt-4 mb-0">
                                                OTP sent to {sentEmail}.
                                                {devOtp && <><br /><strong>Dev mode:</strong> no email service is configured yet, so here's the code directly: <strong>{devOtp}</strong></>}
                                            </div>
                                        )}

                                        <form className="mt-4 pt-2" onSubmit={handleSubmit(onSubmit)}>
                                            <div className="form-floating form-floating-custom mb-4">
                                                <input type="email" className={`form-control ${errors.email ? 'is-invalid' : ''}`} {...register('email', { required: 'Email is required' })} placeholder="Enter Email" />
                                                <label>Email</label>
                                                <div className="form-floating-icon"><i data-feather="mail"></i></div>
                                                {errors.email && <div className="invalid-feedback">{errors.email.message}</div>}
                                            </div>
                                            <button type="submit" className="btn btn-primary w-100" disabled={isSubmitting}>
                                                {isSubmitting ? 'Sending…' : 'Send OTP'}
                                            </button>
                                        </form>

                                        <div className="mt-4 text-center">
                                            <Link to="/" className="text-muted">Back to login</Link>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
