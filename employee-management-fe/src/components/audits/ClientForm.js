import React, { useEffect, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useForm } from 'react-hook-form'
import auditActions from '../../redux/audit/Actions'
import { ENTITY_TYPES } from './AuditUI'
import { FormModal } from '../common/FormModal'

const BLANK = { name: '', clientCode: '', entityType: 'Company', industry: '', pan: '', gstin: '', contactPerson: '', phone: '', email: '', city: '', address: '', notes: '', status: 'Active' }
const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/
const GSTIN = /^[0-9]{2}[A-Z0-9]{10}[0-9A-Z]{3}$/
// Only the form's own fields — never echo back ids, stats or engagements from the loaded client.
const pick = (c) => Object.fromEntries(Object.keys(BLANK).map((k) => [k, c?.[k] ?? BLANK[k]]))

/* Add / edit a client. Closes itself (onDone) once the save comes back successful. */
export const ClientForm = ({ client, onDone, onCancel }) => {
    const dispatch = useDispatch()
    const { clientSaved, error } = useSelector((state) => state.auditReducer || {})
    const [tried, setTried] = useState(false)
    const editing = !!client
    const { register, handleSubmit, formState: { errors } } = useForm({ defaultValues: editing ? pick(client) : BLANK })
    const submitted = useRef(false)

    useEffect(() => { dispatch({ type: auditActions.SET_AUDIT_CLIENT_SAVED, payload: null }); dispatch({ type: auditActions.SET_AUDIT_ERROR, payload: '' }) }, [dispatch])
    useEffect(() => {
        if (submitted.current && clientSaved) {
            submitted.current = false
            onDone?.(clientSaved)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clientSaved])

    const onSubmit = (data) => {
        submitted.current = true
        setTried(true)
        const payload = { ...pick(data), pan: data.pan.trim().toUpperCase(), gstin: data.gstin.trim().toUpperCase() }
        if (editing) {
            delete payload.clientCode
            dispatch({ type: auditActions.UPDATE_AUDIT_CLIENT, id: client._id, payload })
        } else {
            dispatch({ type: auditActions.ADD_AUDIT_CLIENT, payload })
        }
    }

    return (
        <FormModal size="wide" icon="mdi-domain-plus" title={editing ? `Edit ${client.name}` : 'New client'} sub={editing ? 'Company details used on engagements and invoices' : 'A client company — engagements and projects are added under it'}
            onClose={onCancel} onSubmit={handleSubmit(onSubmit)} submitLabel={editing ? 'Save changes' : 'Add client'}>
            <div className="pp-card-body">
                {tried && error && <div className="fm-error" role="alert"><i className="mdi mdi-alert-circle-outline"></i>{error}</div>}
                <div className="pj-form-grid">
                    <div className="pp-field span-2">
                        <label className="pp-label">Client name<span className="req">*</span></label>
                        <input type="text" autoFocus placeholder="e.g. Sunrise Textiles Pvt Ltd" className={`pp-input ${errors.name ? 'is-invalid' : ''}`} {...register('name', { required: 'Enter the client name' })} />
                        {errors.name && <div className="pp-err">{errors.name.message}</div>}
                    </div>
                    {editing ? (
                        <div className="pp-field">
                            <label className="pp-label">Status</label>
                            <select className="pp-select" {...register('status')}><option>Active</option><option>Inactive</option></select>
                        </div>
                    ) : (
                        <div className="pp-field">
                            <label className="pp-label">Client code</label>
                            <input type="text" placeholder="Auto (CL-0001)" className="pp-input" {...register('clientCode')} />
                        </div>
                    )}
                    <div className="pp-field">
                        <label className="pp-label">Entity type</label>
                        <select className="pp-select" {...register('entityType')}>{ENTITY_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
                    </div>
                    <div className="pp-field">
                        <label className="pp-label">PAN</label>
                        <input type="text" placeholder="ABCDE1234F" maxLength={10} className={`pp-input ${errors.pan ? 'is-invalid' : ''}`} style={{ textTransform: 'uppercase' }}
                            {...register('pan', { validate: (v) => !v || PAN.test(v.trim().toUpperCase()) || 'Not a valid PAN' })} />
                        {errors.pan && <div className="pp-err">{errors.pan.message}</div>}
                    </div>
                    <div className="pp-field">
                        <label className="pp-label">GSTIN</label>
                        <input type="text" placeholder="33ABCDE1234F1Z5" maxLength={15} className={`pp-input ${errors.gstin ? 'is-invalid' : ''}`} style={{ textTransform: 'uppercase' }}
                            {...register('gstin', { validate: (v) => !v || GSTIN.test(v.trim().toUpperCase()) || 'Not a valid GSTIN' })} />
                        {errors.gstin && <div className="pp-err">{errors.gstin.message}</div>}
                    </div>
                    <div className="pp-field">
                        <label className="pp-label">Industry</label>
                        <input type="text" placeholder="e.g. Manufacturing" className="pp-input" {...register('industry')} />
                    </div>
                    <div className="pp-field">
                        <label className="pp-label">City</label>
                        <input type="text" placeholder="e.g. Chennai" className="pp-input" {...register('city')} />
                    </div>
                    <div className="pp-field">
                        <label className="pp-label">Contact person</label>
                        <input type="text" placeholder="Name" className="pp-input" {...register('contactPerson')} />
                    </div>
                    <div className="pp-field">
                        <label className="pp-label">Phone</label>
                        <input type="tel" placeholder="+91 98765 43210" className="pp-input" {...register('phone')} />
                    </div>
                    <div className="pp-field span-2">
                        <label className="pp-label">Email</label>
                        <input type="email" placeholder="accounts@client.com" className={`pp-input ${errors.email ? 'is-invalid' : ''}`}
                            {...register('email', { validate: (v) => !v || /^\S+@\S+\.\S+$/.test(v) || 'Not a valid email' })} />
                        {errors.email && <div className="pp-err">{errors.email.message}</div>}
                    </div>
                    <div className="pp-field span-2">
                        <label className="pp-label">Address</label>
                        <input type="text" placeholder="Registered / site address" className="pp-input" {...register('address')} />
                    </div>
                    <div className="pp-field span-4">
                        <label className="pp-label">Notes</label>
                        <textarea rows={2} placeholder="Anything the team should know about this client" className="pp-input" {...register('notes')}></textarea>
                    </div>
                </div>
            </div>
        </FormModal>
    )
}
