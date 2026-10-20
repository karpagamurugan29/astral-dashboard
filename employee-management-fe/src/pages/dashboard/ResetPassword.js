import React from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import authActions from '../../redux/auth/Actions'

export const ResetPassword = () => {
    const dispatch = useDispatch()
    const navigate = useNavigate()
    const location = useLocation()
    const { error } = useSelector((state) => state.authReducer || {})
    const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm({
        defaultValues: { email: location.state?.email || '', otp: location.state?.otp || '' },
    })
    const newPassword = watch('newPassword')

    const onSubmit = (data) => {
        dispatch({ type: authActions.RESET_PASSWORD, payload: data, navigate })
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
                                            <h5 className="mb-0">Reset Password</h5>
                                            <p className="text-muted mt-2">Enter the OTP sent to your email and choose a new password.</p>
                                        </div>

                                        {error && <div className="alert alert-danger mt-4 mb-0">{error}</div>}

                                        <form className="mt-4 pt-2" onSubmit={handleSubmit(onSubmit)}>
                                            <div className="form-floating form-floating-custom mb-4">
                                                <input type="email" className={`form-control ${errors.email ? 'is-invalid' : ''}`} {...register('email', { required: 'Required' })} placeholder="Email" />
                                                <label>Email</label>
                                                <div className="form-floating-icon"><i data-feather="mail"></i></div>
                                            </div>
                                            <div className="form-floating form-floating-custom mb-4">
                                                <input type="text" className={`form-control ${errors.otp ? 'is-invalid' : ''}`} {...register('otp', { required: 'Required' })} placeholder="OTP" />
                                                <label>OTP</label>
                                                <div className="form-floating-icon"><i data-feather="key"></i></div>
                                            </div>
                                            <div className="form-floating form-floating-custom mb-4">
                                                <input type="password" className={`form-control ${errors.newPassword ? 'is-invalid' : ''}`} {...register('newPassword', { required: 'Required', minLength: { value: 8, message: 'Min 8 characters' } })} placeholder="New Password" />
                                                <label>New Password</label>
                                                <div className="form-floating-icon"><i data-feather="lock"></i></div>
                                                {errors.newPassword && <div className="invalid-feedback d-block">{errors.newPassword.message}</div>}
                                            </div>
                                            <div className="form-floating form-floating-custom mb-4">
                                                <input type="password" className={`form-control ${errors.confirmPassword ? 'is-invalid' : ''}`} {...register('confirmPassword', { required: 'Required', validate: (v) => v === newPassword || 'Passwords do not match' })} placeholder="Confirm Password" />
                                                <label>Confirm Password</label>
                                                <div className="form-floating-icon"><i data-feather="lock"></i></div>
                                                {errors.confirmPassword && <div className="invalid-feedback d-block">{errors.confirmPassword.message}</div>}
                                            </div>
                                            <button type="submit" className="btn btn-primary w-100" disabled={isSubmitting}>
                                                {isSubmitting ? 'Resetting…' : 'Reset Password'}
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
