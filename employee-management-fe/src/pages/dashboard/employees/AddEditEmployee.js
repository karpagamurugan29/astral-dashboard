import React, { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
import employeeActions from '../../../redux/employee/Actions'
import departmentActions from '../../../redux/department/Actions'
import designationActions from '../../../redux/designation/Actions'
import branchActions from '../../../redux/branch/Actions'
import { PeopleShell, Avatar, EmptyState, ErrorBanner, fullName } from '../../../components/people/PeopleUI'
import './AddEditEmployee.css'
import { useAccess } from '../../../hooks/useAccess'

const ROLES = ['Employee', 'Team Lead', 'Manager', 'HR', 'Admin']

const SECTIONS = [
    { id: 'ae-personal', label: 'Personal details', required: ['employeeId', 'userName', 'firstName', 'lastName', 'gender', 'dateOfBirth', 'email', 'phoneNumber'] },
    { id: 'ae-job', label: 'Job details', required: ['role', 'designation', 'department', 'joiningDate', 'employmentType', 'salary'] },
    { id: 'ae-address', label: 'Address', optional: true },
    { id: 'ae-emergency', label: 'Emergency contact', optional: true },
]

// Small helper so every field renders label, control and error the same way.
const Field = ({ label, required, error, help, className = '', children }) => (
    <div className={`pp-field ${className}`}>
        <label className="pp-label">{label}{required && <span className="req">*</span>}</label>
        {children}
        {error && <div className="pp-err">{error.message}</div>}
        {!error && help && <div className="pp-help">{help}</div>}
    </div>
)

export const AddEditEmployee = () => {
    const dispatch = useDispatch()
    const navigate = useNavigate()
    const { id } = useParams()
    const isEdit = Boolean(id)

    const { current, loading, error, list: employees } = useSelector((state) => state.employeeReducer || {})
    const { list: departments } = useSelector((state) => state.departmentReducer || {})
    const { list: designations } = useSelector((state) => state.designationReducer || {})
    const { list: branches } = useSelector((state) => state.branchReducer || {})
    const { can } = useAccess()
    const canEdit = can(['Admin', 'HR'], 'employees')
    const { register, handleSubmit, reset, watch, formState: { errors } } = useForm()
    const [showPassword, setShowPassword] = useState(false)

    useEffect(() => {
        dispatch({ type: departmentActions.GET_DEPARTMENTS })
        dispatch({ type: designationActions.GET_DESIGNATIONS })
        dispatch({ type: branchActions.GET_BRANCHES })
        dispatch({ type: employeeActions.GET_EMPLOYEES })
        if (isEdit) {
            dispatch({ type: employeeActions.GET_EMPLOYEE_BY_ID, id })
        }
        return () => {
            dispatch({ type: employeeActions.CLEAR_EMPLOYEE })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id])

    useEffect(() => {
        if (isEdit && current) {
            reset({
                employeeId: current.employeeId,
                userName: current.userName,
                firstName: current.firstName,
                lastName: current.lastName,
                gender: current.gender,
                dateOfBirth: current.dateOfBirth ? current.dateOfBirth.substring(0, 10) : '',
                email: current.email,
                phoneNumber: current.phoneNumber,
                role: current.role,
                designation: current.designation,
                department: current.department,
                joiningDate: current.joiningDate ? current.joiningDate.substring(0, 10) : '',
                employmentType: current.employmentType,
                salary: current.salary,
                status: current.status,
                manager: current.manager?._id || current.manager || '',
                branch: current.branch?._id || current.branch || '',
                address: {
                    street: current.address?.street,
                    city: current.address?.city,
                    state: current.address?.state,
                    country: current.address?.country,
                    pincode: current.address?.pincode,
                },
                emergencyContact: {
                    name: current.emergencyContact?.name,
                    relation: current.emergencyContact?.relation,
                    phone: current.emergencyContact?.phone,
                },
            })
        }
    }, [isEdit, current, reset])

    const onSubmit = (rawData) => {
        // Empty-string selects would fail ObjectId validation server-side — send null instead.
        const data = { ...rawData, manager: rawData.manager || null, branch: rawData.branch || null }
        if (isEdit) {
            dispatch({ type: employeeActions.UPDATE_EMPLOYEE, id, payload: data, navigate })
        } else {
            dispatch({ type: employeeActions.ADD_EMPLOYEE, payload: data, navigate })
        }
    }

    const values = watch()
    const filled = (name) => {
        const v = values?.[name]
        return v !== undefined && v !== null && String(v).trim() !== '' && !(typeof v === 'number' && Number.isNaN(v))
    }
    const sectionDone = (s) => !s.optional && s.required.every(filled) && (s.id !== 'ae-personal' || isEdit || filled('password'))
    const requiredSections = SECTIONS.filter((s) => !s.optional)
    const doneCount = requiredSections.filter(sectionDone).length
    const errorCount = Object.keys(errors).length

    const jumpTo = (e, sectionId) => {
        e.preventDefault()
        document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }

    const crumbs = [{ label: 'Directory', to: '/employees' }, { label: isEdit ? 'Edit' : 'Add employee' }]

    if (!canEdit) {
        return (
            <PeopleShell backTo="/employees" title={isEdit ? 'Edit employee' : 'Add employee'} crumbs={crumbs}>
                <div className="pp-card">
                    <EmptyState icon="mdi-lock-outline" title="You don't have access" text={`Only Admin and HR can ${isEdit ? 'edit' : 'add'} employees.`}
                        action={<Link to="/employees" className="pp-btn">Back to directory</Link>} />
                </div>
            </PeopleShell>
        )
    }

    const previewPerson = { firstName: values?.firstName, lastName: values?.lastName, profileImage: current?.profileImage }

    return (
        <PeopleShell backTo="/employees"
            title={isEdit ? `Edit ${current ? fullName(current) : 'employee'}` : 'Add employee'}
            subtitle={isEdit ? 'Update this person’s details. Changes are saved to their record.' : 'Create a record and login for a new team member.'}
            crumbs={crumbs}
        >
            <ErrorBanner error={error} />

            <form onSubmit={handleSubmit(onSubmit)} noValidate className="ae-layout">
                <div>
                    {/* ---------- 1. Personal ---------- */}
                    <section id="ae-personal" className="pp-card ae-section">
                        <div className="pp-card-head">
                            <span className="ae-step">1</span>
                            <div><h3>Personal details</h3><p>Identity and how to reach them.</p></div>
                        </div>
                        <div className="pp-card-body">
                            <div className="ae-fields">
                                <Field label="First name" required error={errors.firstName}>
                                    <input type="text" className={`pp-input ${errors.firstName ? 'is-invalid' : ''}`} {...register('firstName', { required: 'First name is required' })} />
                                </Field>
                                <Field label="Last name" required error={errors.lastName}>
                                    <input type="text" className={`pp-input ${errors.lastName ? 'is-invalid' : ''}`} {...register('lastName', { required: 'Last name is required' })} />
                                </Field>
                                <Field label="Work email" required error={errors.email}>
                                    <input type="email" placeholder="name@company.com" className={`pp-input ${errors.email ? 'is-invalid' : ''}`}
                                        {...register('email', { required: 'Email is required', pattern: { value: /^\S+@\S+\.\S+$/, message: 'Enter a valid email' } })} />
                                </Field>
                                <Field label="Phone number" required error={errors.phoneNumber}>
                                    <input type="tel" className={`pp-input ${errors.phoneNumber ? 'is-invalid' : ''}`} {...register('phoneNumber', { required: 'Phone number is required' })} />
                                </Field>
                                <Field label="Gender" required error={errors.gender}>
                                    <select className={`pp-select ${errors.gender ? 'is-invalid' : ''}`} {...register('gender', { required: 'Select a gender' })}>
                                        <option value="">Select</option>
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </Field>
                                <Field label="Date of birth" required error={errors.dateOfBirth}>
                                    <input type="date" className={`pp-input ${errors.dateOfBirth ? 'is-invalid' : ''}`} {...register('dateOfBirth', { required: 'Date of birth is required' })} />
                                </Field>
                                <Field label="Employee ID" required error={errors.employeeId} help={isEdit ? 'Employee ID can’t be changed.' : 'e.g. EMP-1042'}>
                                    <input type="text" className={`pp-input ${errors.employeeId ? 'is-invalid' : ''}`} {...register('employeeId', { required: 'Employee ID is required' })} disabled={isEdit} />
                                </Field>
                                <Field label="Username" required error={errors.userName}>
                                    <input type="text" autoComplete="off" className={`pp-input ${errors.userName ? 'is-invalid' : ''}`} {...register('userName', { required: 'Username is required' })} />
                                </Field>
                                {!isEdit && (
                                    <Field label="Temporary password" required error={errors.password} help="At least 8 characters. They can change it after signing in.">
                                        <div className="ae-pass">
                                            <input type={showPassword ? 'text' : 'password'} autoComplete="new-password" className={`pp-input ${errors.password ? 'is-invalid' : ''}`}
                                                {...register('password', { required: 'Password is required', minLength: { value: 8, message: 'Use at least 8 characters' } })} />
                                            <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                                                <i className={`mdi ${showPassword ? 'mdi-eye-off-outline' : 'mdi-eye-outline'}`}></i>
                                            </button>
                                        </div>
                                    </Field>
                                )}
                            </div>
                        </div>
                    </section>

                    {/* ---------- 2. Job ---------- */}
                    <section id="ae-job" className="pp-card ae-section">
                        <div className="pp-card-head">
                            <span className="ae-step">2</span>
                            <div><h3>Job details</h3><p>Position, reporting line and pay.</p></div>
                        </div>
                        <div className="pp-card-body">
                            <Field label="Access role" required error={errors.role} help="Controls what they can see and do in Astral.">
                                <div className={`ae-roles ${errors.role ? 'is-invalid' : ''}`} role="radiogroup">
                                    {ROLES.map((r) => (
                                        <label key={r}>
                                            <input type="radio" value={r} {...register('role', { required: 'Choose an access role' })} />
                                            <span>{r}</span>
                                        </label>
                                    ))}
                                </div>
                            </Field>
                            <div className="ae-fields">
                                <Field label="Designation" required error={errors.designation}
                                    help={designations?.length === 0 ? <>No designations yet — <Link to="/designations">add one</Link> first.</> : null}>
                                    <select className={`pp-select ${errors.designation ? 'is-invalid' : ''}`} {...register('designation', { required: 'Select a designation' })}>
                                        <option value="">Select</option>
                                        {designations?.map((d) => <option key={d._id} value={d.name}>{d.name}</option>)}
                                    </select>
                                </Field>
                                <Field label="Department" required error={errors.department}
                                    help={departments?.length === 0 ? <>No departments yet — <Link to="/departments">add one</Link> first.</> : null}>
                                    <select className={`pp-select ${errors.department ? 'is-invalid' : ''}`} {...register('department', { required: 'Select a department' })}>
                                        <option value="">Select</option>
                                        {departments?.map((d) => <option key={d._id} value={d.name}>{d.name}</option>)}
                                    </select>
                                </Field>
                                <Field label="Employment type" required error={errors.employmentType}>
                                    <select className={`pp-select ${errors.employmentType ? 'is-invalid' : ''}`} {...register('employmentType', { required: 'Select an employment type' })}>
                                        <option value="">Select</option>
                                        <option value="Permanent">Permanent</option>
                                        <option value="Contract">Contract</option>
                                        <option value="Intern">Intern</option>
                                        <option value="Part-Time">Part-Time</option>
                                    </select>
                                </Field>
                                <Field label="Joining date" required error={errors.joiningDate}>
                                    <input type="date" className={`pp-input ${errors.joiningDate ? 'is-invalid' : ''}`} {...register('joiningDate', { required: 'Joining date is required' })} />
                                </Field>
                                <Field label="Salary (monthly)" required error={errors.salary}>
                                    <input type="number" min="0" className={`pp-input ${errors.salary ? 'is-invalid' : ''}`}
                                        {...register('salary', { required: 'Salary is required', valueAsNumber: true, min: { value: 0, message: 'Must be positive' } })} />
                                </Field>
                                <Field label="Branch">
                                    <select className="pp-select" {...register('branch')}>
                                        <option value="">None</option>
                                        {branches?.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
                                    </select>
                                </Field>
                                <Field label="Reporting manager">
                                    <select className="pp-select" {...register('manager')}>
                                        <option value="">None</option>
                                        {employees?.filter((e) => e._id !== current?._id).map((e) => <option key={e._id} value={e._id}>{e.firstName} {e.lastName}</option>)}
                                    </select>
                                </Field>
                                {isEdit && (
                                    <Field label="Status" help="Resigned and Terminated people move to “Former” in the directory.">
                                        <select className="pp-select" {...register('status')}>
                                            <option value="Active">Active</option>
                                            <option value="Inactive">Inactive</option>
                                            <option value="Resigned">Resigned</option>
                                            <option value="Terminated">Terminated</option>
                                        </select>
                                    </Field>
                                )}
                            </div>
                        </div>
                    </section>

                    {/* ---------- 3. Address ---------- */}
                    <section id="ae-address" className="pp-card ae-section">
                        <div className="pp-card-head">
                            <span className="ae-step">3</span>
                            <div><h3>Address</h3><p>Optional — used for letters and payslips.</p></div>
                        </div>
                        <div className="pp-card-body">
                            <div className="ae-fields three">
                                <Field label="Street" className="span-2"><input type="text" className="pp-input" {...register('address.street')} /></Field>
                                <Field label="City"><input type="text" className="pp-input" {...register('address.city')} /></Field>
                                <Field label="State"><input type="text" className="pp-input" {...register('address.state')} /></Field>
                                <Field label="Country"><input type="text" className="pp-input" {...register('address.country')} /></Field>
                                <Field label="Pincode"><input type="text" className="pp-input" {...register('address.pincode')} /></Field>
                            </div>
                        </div>
                    </section>

                    {/* ---------- 4. Emergency ---------- */}
                    <section id="ae-emergency" className="pp-card ae-section">
                        <div className="pp-card-head">
                            <span className="ae-step">4</span>
                            <div><h3>Emergency contact</h3><p>Optional — who to call if something happens at work.</p></div>
                        </div>
                        <div className="pp-card-body">
                            <div className="ae-fields three">
                                <Field label="Name"><input type="text" className="pp-input" {...register('emergencyContact.name')} /></Field>
                                <Field label="Relation"><input type="text" placeholder="e.g. Spouse" className="pp-input" {...register('emergencyContact.relation')} /></Field>
                                <Field label="Phone"><input type="tel" className="pp-input" {...register('emergencyContact.phone')} /></Field>
                            </div>
                        </div>
                    </section>

                    <div className="ae-bar">
                        <span className="ae-bar-note">
                            {errorCount
                                ? <><b style={{ color: '#e11d48' }}>{errorCount} field{errorCount === 1 ? '' : 's'}</b> need attention</>
                                : <><b>{doneCount} of {requiredSections.length}</b> required sections complete</>}
                        </span>
                        <div className="ae-bar-btns">
                            <Link to={isEdit ? `/employees/${id}` : '/employees'} className="pp-btn">Cancel</Link>
                            <button type="submit" className="pp-btn primary" disabled={loading}>
                                {loading ? <><span className="ae-spinner"></span> Saving…</> : <><i className="mdi mdi-check"></i> {isEdit ? 'Save changes' : 'Add employee'}</>}
                            </button>
                        </div>
                    </div>
                </div>

                {/* ---------- side rail ---------- */}
                <aside className="ae-rail">
                    <div className="pp-card ae-preview">
                        <div className="ae-preview-label">Preview</div>
                        <Avatar person={previewPerson} size={72} ring />
                        <h4>{fullName(previewPerson) === 'Unnamed' ? 'New employee' : fullName(previewPerson)}</h4>
                        <p>{values?.designation || 'Designation'}</p>
                        {values?.department && <span className="pp-chip">{values.department}</span>}
                        {values?.role && <span className="pp-chip">{values.role}</span>}
                    </div>
                    <nav className="pp-card ae-nav" aria-label="Form sections">
                        {SECTIONS.map((s, i) => {
                            const done = sectionDone(s)
                            return (
                                <a key={s.id} href={`#${s.id}`} onClick={(e) => jumpTo(e, s.id)} className={done ? 'done' : ''}>
                                    <span className="ae-nav-dot">{done ? <i className="mdi mdi-check"></i> : i + 1}</span>
                                    {s.label}
                                    {s.optional && <small>Optional</small>}
                                </a>
                            )
                        })}
                    </nav>
                </aside>
            </form>
        </PeopleShell>
    )
}
