import React, { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useForm } from 'react-hook-form'
import { Link, useLocation } from 'react-router-dom'
import payrollActions from '../../../redux/payroll/Actions'
import employeeActions from '../../../redux/employee/Actions'
import { PeopleShell, Avatar, DeptTag, EmptyState, ErrorBanner, fullName } from '../../../components/people/PeopleUI'
import { PAYROLL_ROOT, CURRENCY, EARNINGS, DEDUCTIONS, money, sumOf, BreakdownBar } from '../../../components/payroll/PayrollUI'
import './SalaryStructure.css'
import { useAccess } from '../../../hooks/useAccess'

const FIELDS = [...EARNINGS, ...DEDUCTIONS].map((p) => p.key)
const FORMER = ['Resigned', 'Terminated']

const MoneyRow = ({ part, register, required }) => (
    <label className="ss-row" style={{ '--c': part.color }}>
        <i className={`mdi ${part.icon}`}></i>
        <span className="ss-row-label"><b>{part.label}{required && <span style={{ color: '#e11d48' }}> *</span>}</b><small>{part.hint}</small></span>
        <span className="ss-money">
            <span>{CURRENCY}</span>
            <input type="number" min="0" step="1" placeholder="0" className="pp-input" aria-label={`${part.label} per month`}
                {...register(part.key, { valueAsNumber: true, ...(required ? { required: true } : {}) })} />
        </span>
    </label>
)

export const SalaryStructure = () => {
    const dispatch = useDispatch()
    const location = useLocation()
    const { structure, error } = useSelector((state) => state.payrollReducer || {})
    const { list: employees } = useSelector((state) => state.employeeReducer || {})
    const { can } = useAccess()
    const canEdit = can(['Admin', 'HR'], 'payroll')
    const [employeeId, setEmployeeId] = useState(location.state?.employeeId || '')
    const [search, setSearch] = useState('')
    const { register, handleSubmit, reset, watch, formState: { isDirty, errors } } = useForm()

    useEffect(() => {
        dispatch({ type: employeeActions.GET_EMPLOYEES })
    }, [dispatch])

    useEffect(() => {
        if (employeeId) {
            // Clear the previous person's numbers so they never flash under a new name.
            dispatch({ type: payrollActions.SET_SALARY_STRUCTURE, payload: null })
            dispatch({ type: payrollActions.GET_SALARY_STRUCTURE, employeeId })
        }
    }, [dispatch, employeeId])

    const toForm = (s) => Object.fromEntries(FIELDS.map((k) => [k, s?.[k] || '']))

    useEffect(() => {
        reset(toForm(structure))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [structure, reset])

    const onSubmit = (data) => {
        dispatch({ type: payrollActions.SAVE_SALARY_STRUCTURE, payload: { employeeId, ...data } })
    }

    const people = useMemo(() => {
        const q = search.trim().toLowerCase()
        return (employees || [])
            .filter((e) => !FORMER.includes(e.status))
            .filter((e) => !q || `${fullName(e)} ${e.employeeId} ${e.department || ''}`.toLowerCase().includes(q))
            .sort((a, b) => fullName(a).localeCompare(fullName(b)))
    }, [employees, search])

    const selected = (employees || []).find((e) => e._id === employeeId)
    const values = watch()
    const gross = sumOf(values, EARNINGS)
    const deductions = sumOf(values, DEDUCTIONS)
    const net = gross - deductions

    if (!canEdit) {
        return (
            <PeopleShell title="Salary structure" root={PAYROLL_ROOT} crumbs={[{ label: 'Salary structure' }]}>
                <div className="pp-card">
                    <EmptyState icon="mdi-lock-outline" title="Admin and HR only" text="Salary structures are private. Your own pay details are on the Payslips page."
                        action={<Link to="/payroll/payslips" className="pp-btn">Go to my payslips</Link>} />
                </div>
            </PeopleShell>
        )
    }

    return (
        <PeopleShell title="Salary structure" root={PAYROLL_ROOT} crumbs={[{ label: 'Salary structure' }]}>
            <ErrorBanner error={error} />

            <div className="ss-layout">
                {/* ---------- people ---------- */}
                <aside className="pp-card ss-people">
                    <div className="pp-search">
                        <i className="mdi mdi-magnify" style={{ left: 24 }}></i>
                        <input type="search" className="pp-input" placeholder="Find an employee…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Find an employee" />
                    </div>
                    <ul className="ss-list">
                        {people.map((e) => (
                            <li key={e._id}>
                                <button type="button" className={`ss-person ${employeeId === e._id ? 'active' : ''}`} onClick={() => setEmployeeId(e._id)} aria-pressed={employeeId === e._id}>
                                    <Avatar person={e} size={34} />
                                    <span style={{ minWidth: 0 }}><b>{fullName(e)}</b><small>{e.designation || e.employeeId}</small></span>
                                </button>
                            </li>
                        ))}
                        {!people.length && <li className="pp-muted-dash text-center py-3" style={{ fontSize: 13 }}>No one matches.</li>}
                    </ul>
                </aside>

                {/* ---------- editor ---------- */}
                {!selected ? (
                    <div className="pp-card" style={{ gridColumn: 'span 2' }}>
                        <EmptyState icon="mdi-cash-multiple" title="Pick an employee" text="Choose someone on the left to view or set their monthly salary structure." />
                    </div>
                ) : (
                    <>
                        <form className="pp-card" onSubmit={handleSubmit(onSubmit)} noValidate>
                            <div className="ss-editor-head">
                                <Avatar person={selected} size={46} />
                                <div style={{ minWidth: 0 }}>
                                    <h3>{fullName(selected)}</h3>
                                    <small>{[selected.designation, selected.employeeId].filter(Boolean).join(' · ')}</small>
                                </div>
                                <span className="ms-auto"><DeptTag name={selected.department} /></span>
                            </div>

                            <div className="ss-group">
                                <div className="ss-group-title"><span>Earnings · monthly</span><b style={{ color: '#047857' }}>{money(gross)}</b></div>
                                <div className="ss-rows">
                                    {EARNINGS.map((p) => <MoneyRow key={p.key} part={p} register={register} required={p.key === 'basic'} />)}
                                </div>
                                {errors.basic && <div className="pp-err mb-2">Basic pay is required.</div>}
                            </div>

                            <div className="ss-group">
                                <div className="ss-group-title"><span>Deductions · monthly</span><b style={{ color: '#be123c' }}>− {money(deductions)}</b></div>
                                <div className="ss-rows">
                                    {DEDUCTIONS.map((p) => <MoneyRow key={p.key} part={p} register={register} />)}
                                </div>
                            </div>

                            <div className="ss-foot">
                                {isDirty
                                    ? <span className="ss-foot-note dirty"><i className="mdi mdi-pencil-circle-outline"></i>Unsaved changes</span>
                                    : <span className="ss-foot-note"><i className="mdi mdi-information-outline"></i>{structure ? 'Saved structure loaded' : 'No structure saved yet'}</span>}
                                <div className="d-flex gap-2">
                                    <button type="button" className="pp-btn" disabled={!isDirty} onClick={() => reset(toForm(structure))}>Discard</button>
                                    <button type="submit" className="pp-btn primary" disabled={!isDirty}><i className="mdi mdi-content-save-outline"></i> Save structure</button>
                                </div>
                            </div>
                        </form>

                        {/* ---------- summary ---------- */}
                        <aside className="pp-card ss-summary">
                            <div className="ss-net">
                                <small>Net take-home</small>
                                <b>{money(net)}</b>
                                <span>per month · {money(net * 12)} per year</span>
                            </div>
                            <div className="ss-sum-body">
                                <div className="ss-sum-block">
                                    <div className="ss-sum-head"><span>Gross earnings</span><b>{money(gross)}</b></div>
                                    <BreakdownBar data={values} parts={EARNINGS} total={gross} />
                                    <div className="py-legend">
                                        {EARNINGS.filter((p) => Number(values?.[p.key]) > 0).map((p) => (
                                            <div key={p.key} className="py-line" style={{ '--c': p.color }}><i className={`mdi ${p.icon}`}></i><span>{p.label}</span><b>{money(values[p.key])}</b></div>
                                        ))}
                                    </div>
                                </div>
                                <div className="ss-sum-block">
                                    <div className="ss-sum-head"><span>Deductions</span><b style={{ color: '#be123c' }}>− {money(deductions)}</b></div>
                                    <BreakdownBar data={values} parts={DEDUCTIONS} total={deductions} />
                                </div>
                                <div className="ss-pct">
                                    Annual CTC <b>{money(gross * 12)}</b>
                                    {gross > 0 && <> · take-home <b>{Math.round((net / gross) * 100)}%</b> of gross</>}
                                </div>
                            </div>
                        </aside>
                    </>
                )}
            </div>
        </PeopleShell>
    )
}
