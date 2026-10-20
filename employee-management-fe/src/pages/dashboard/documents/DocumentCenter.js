import React, { useEffect, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { DashNav } from '../../../components/dashboard/dash/DashNav'
import documentActions from '../../../redux/document/Actions'
import { API_URL } from '../../../utils/Constants'
import { BackButton } from '../../../components/common/BackButton'

const categories = ['ID Proof', 'Contract', 'Certificate', 'Policy', 'Payslip', 'Other']
const SERVER_ORIGIN = API_URL.replace(/\/api$/, '')

export const DocumentCenter = () => {
    const dispatch = useDispatch()
    const { list, error } = useSelector((state) => state.documentReducer || {})
    const fileRef = useRef()
    const [title, setTitle] = useState('')
    const [category, setCategory] = useState('Other')

    useEffect(() => {
        dispatch({ type: documentActions.GET_DOCUMENTS })
    }, [dispatch])

    const onUpload = (e) => {
        e.preventDefault()
        const file = fileRef.current?.files?.[0]
        if (!file) return

        const formData = new FormData()
        formData.append('file', file)
        formData.append('title', title || file.name)
        formData.append('category', category)

        dispatch({ type: documentActions.UPLOAD_DOCUMENT, formData })
        setTitle('')
        if (fileRef.current) fileRef.current.value = ''
    }

    const onDelete = (id, title2) => {
        if (window.confirm(`Delete "${title2}"?`)) {
            dispatch({ type: documentActions.DELETE_DOCUMENT, id })
        }
    }

    return (
        <DashNav>
            <div className="page-content">
                <div className="container-fluid">
                    <div className="row">
                        <div className="col-12">
                            <div className="page-title-box d-sm-flex align-items-center justify-content-between">
                                <div className="d-flex align-items-center gap-3"><BackButton compact /><h4 className="mb-sm-0 font-size-18">Documents</h4></div>
                                <div className="page-title-right">
                                    <ol className="breadcrumb m-0">
                                        <li className="breadcrumb-item"><a href="javascript: void(0);">Organization</a></li>
                                        <li className="breadcrumb-item active">Documents</li>
                                    </ol>
                                </div>
                            </div>
                        </div>
                    </div>

                    {error && <div className="alert alert-danger">{error}</div>}

                    <div className="card">
                        <div className="card-body">
                            <h5 className="card-title mb-3">Upload Document</h5>
                            <form onSubmit={onUpload}>
                                <div className="row align-items-end">
                                    <div className="col-md-4 mb-3">
                                        <label className="form-label">Title</label>
                                        <input type="text" className="form-control" value={title} onChange={(e) => setTitle(e.target.value)} />
                                    </div>
                                    <div className="col-md-3 mb-3">
                                        <label className="form-label">Category</label>
                                        <select className="form-select" value={category} onChange={(e) => setCategory(e.target.value)}>
                                            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    <div className="col-md-3 mb-3">
                                        <label className="form-label">File</label>
                                        <input type="file" className="form-control" ref={fileRef} required />
                                    </div>
                                    <div className="col-md-2 mb-3">
                                        <button type="submit" className="btn btn-primary w-100">Upload</button>
                                    </div>
                                </div>
                            </form>
                        </div>
                    </div>

                    <div className="card">
                        <div className="card-body">
                            <h5 className="card-title mb-3">All Documents <span className="text-muted fw-normal">({list?.length || 0})</span></h5>
                            <div className="table-responsive">
                                <table className="table align-middle table-nowrap mb-0">
                                    <thead className="table-light">
                                        <tr><th>Title</th><th>Category</th><th>Owner</th><th>Uploaded</th><th></th></tr>
                                    </thead>
                                    <tbody>
                                        {list?.length === 0 && <tr><td colSpan={5} className="text-center text-muted py-4">No documents uploaded yet.</td></tr>}
                                        {list?.map((d) => (
                                            <tr key={d._id}>
                                                <td>{d.title}</td>
                                                <td><span className="badge bg-light text-dark">{d.category}</span></td>
                                                <td>{d.employeeId ? `${d.employeeId.firstName} ${d.employeeId.lastName}` : 'Company-wide'}</td>
                                                <td>{new Date(d.createdAt).toLocaleDateString()}</td>
                                                <td>
                                                    <a className="btn btn-sm btn-outline-light me-1" href={`${SERVER_ORIGIN}${d.fileUrl}`} target="_blank" rel="noreferrer">Download</a>
                                                    <button className="btn btn-sm btn-outline-danger" onClick={() => onDelete(d._id, d.title)}>Delete</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </DashNav>
    )
}
