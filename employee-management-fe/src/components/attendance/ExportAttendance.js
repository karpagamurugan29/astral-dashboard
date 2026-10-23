import React, { useEffect, useState } from 'react'
import { API_URL } from '../../utils/Constants'
import { TOKEN_KEY } from '../common/ApiCall'
import { chatApi as api } from '../chat/chatApi'
import { toast } from '../common/Toaster'
import { Modal } from '../../pages/dashboard/projects/ProjectParts'

/* Export every employee's attendance (the people you can see) for a month or a date range:
   an Excel workbook with a Summary sheet and a Daily detail sheet, or a CSV of the detail. */

const pad = (n) => String(n).padStart(2, '0')
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

// `range` / `department` pre-fill the dialog with what the page is showing
export const ExportAttendanceButton = ({ className = 'pp-btn', range, department, label = 'Export' }) => {
    const [open, setOpen] = useState(false)
    return <>
        <button type="button" className={className} onClick={() => setOpen(true)}><i className="mdi mdi-microsoft-excel"></i>{label}</button>
        {open && <ExportAttendance onClose={() => setOpen(false)} range={range} department={department} />}
    </>
}

export const ExportAttendance = ({ onClose, range, department }) => {
    const now = new Date()
    const [mode, setMode] = useState(range ? 'range' : 'month')
    const [month, setMonth] = useState(`${now.getFullYear()}-${pad(now.getMonth() + 1)}`)
    const [from, setFrom] = useState(range?.from || iso(new Date(now.getFullYear(), now.getMonth(), 1)))
    const [to, setTo] = useState(range?.to || iso(now))
    const [dept, setDept] = useState(department || '')
    const [format, setFormat] = useState('xlsx')
    const [depts, setDepts] = useState([])
    const [busy, setBusy] = useState(false)
    useEffect(() => { api('GET', '/departments').then((j) => setDepts((j.data || []).map((d) => d.name).filter(Boolean))).catch(() => {}) }, [])
    const lastMonth = () => { const d = new Date(now.getFullYear(), now.getMonth() - 1, 1); setMode('month'); setMonth(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`) }

    const download = async () => {
        if (mode === 'range' && (!from || !to || from > to)) return toast.error('Pick a valid date range.')
        setBusy(true)
        try {
            const q = new URLSearchParams({ format, ...(mode === 'month' ? { month } : { from, to }), ...(dept ? { department: dept } : {}) })
            const token = (() => { try { return localStorage.getItem(TOKEN_KEY) } catch { return null } })()
            const r = await fetch(`${API_URL}/reports/attendance/export?${q}`, { credentials: 'include', headers: token ? { Authorization: `Bearer ${token}` } : {} })
            if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'Export failed.')
            const name = (/filename="([^"]+)"/.exec(r.headers.get('content-disposition') || '') || [])[1] || `attendance.${format}`
            const url = URL.createObjectURL(await r.blob())
            const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove()
            setTimeout(() => URL.revokeObjectURL(url), 4000)
            toast.success(`${name} downloaded.`, { title: 'Attendance exported' })
            onClose()
        } catch (e) { toast.error(e.message, { title: 'Export failed' }) }
        setBusy(false)
    }
    return (
        <Modal title="Export attendance" sub="Every employee you can see — for a month or any date range" icon={<span className="pw-dicon" style={{ '--c': '#15803d' }}><i className="mdi mdi-microsoft-excel"></i></span>} onClose={onClose}
            footer={<><button type="button" className="pp-btn" onClick={onClose}>Cancel</button><button type="button" className="pp-btn primary" disabled={busy} onClick={download}><i className="mdi mdi-download"></i>{busy ? 'Preparing…' : 'Download'}</button></>}>
            <div className="xa">
                <div className="xa-tabs">
                    <button type="button" className={mode === 'month' ? 'on' : ''} onClick={() => setMode('month')}><i className="mdi mdi-calendar-month-outline"></i>A month</button>
                    <button type="button" className={mode === 'range' ? 'on' : ''} onClick={() => setMode('range')}><i className="mdi mdi-calendar-range"></i>Date range</button>
                </div>
                {mode === 'month' ? (
                    <div className="xa-row">
                        <label><span>Month</span><input type="month" className="pp-input" value={month} max={`${now.getFullYear()}-${pad(now.getMonth() + 1)}`} onChange={(e) => e.target.value && setMonth(e.target.value)} /></label>
                        <div className="xa-quick"><button type="button" onClick={() => setMonth(`${now.getFullYear()}-${pad(now.getMonth() + 1)}`)}>This month</button><button type="button" onClick={lastMonth}>Last month</button></div>
                    </div>
                ) : (
                    <div className="xa-row">
                        <label><span>From</span><input type="date" className="pp-input" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
                        <label><span>To</span><input type="date" className="pp-input" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
                    </div>
                )}
                <div className="xa-row">
                    <label className="grow"><span>Department</span><select className="pp-select" value={dept} onChange={(e) => setDept(e.target.value)}><option value="">All departments</option>{depts.map((d) => <option key={d}>{d}</option>)}</select></label>
                </div>
                <div className="xa-formats">
                    {[['xlsx', 'Excel workbook', 'Summary sheet + daily detail sheet', 'mdi-microsoft-excel'], ['csv', 'CSV', 'Daily detail, opens in any spreadsheet', 'mdi-file-delimited-outline']].map(([k, l, d, ic]) => (
                        <button key={k} type="button" className={format === k ? 'on' : ''} onClick={() => setFormat(k)}><i className={`mdi ${ic}`}></i><b>{l}</b><small>{d}</small></button>
                    ))}
                </div>
                <p className="xa-note"><i className="mdi mdi-information-outline"></i>Each day shows status (present, late, half day, work from home, field, leave type, holiday, weekend, absent), first in, last out, sessions, hours worked, minutes late and the check-in / check-out places.</p>
            </div>
        </Modal>
    )
}
