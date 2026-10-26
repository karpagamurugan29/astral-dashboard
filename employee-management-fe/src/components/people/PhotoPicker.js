import React, { useRef, useState } from 'react'
import { Avatar } from './PeopleUI'
import { chatApi as api } from '../chat/chatApi'
import { squarePhoto, hasRealPhoto } from '../../utils/photo'
import { toast } from '../common/Toaster'
import { confirmAction } from '../common/ConfirmDialog'

// Avatar with a camera button: pick a photo, it's cropped square and shrunk in the browser,
// then uploaded. `endpoint` is /auth/profile/photo (yourself) or /employees/:id/photo (HR).
export const PhotoPicker = ({ person, endpoint, size = 88, onChange, canRemove = true }) => {
    const input = useRef(null)
    const [busy, setBusy] = useState(false)
    const [preview, setPreview] = useState(null)
    const pick = async (e) => {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (!file) return
        setBusy(true)
        try {
            const blob = await squarePhoto(file)
            setPreview(URL.createObjectURL(blob))
            const fd = new FormData()
            fd.append('photo', blob, 'photo.jpg')
            const j = await api('POST', endpoint, fd)
            toast.success(j.message, { title: 'Photo updated' })
            onChange?.(j.data.profileImage)
        } catch (err) { setPreview(null); toast.error(err.message, { title: 'Couldn’t update the photo' }) }
        setBusy(false)
    }
    const remove = async () => {
        if (!(await confirmAction({ title: 'Remove this photo?', message: 'Initials are shown instead.', confirmLabel: 'Remove photo' }))) return
        setBusy(true)
        try { const j = await api('DELETE', endpoint); setPreview(null); toast.success(j.message, { title: 'Photo removed' }); onChange?.('') } catch (err) { toast.error(err.message) }
        setBusy(false)
    }
    const shown = preview ? { ...person, profileImage: preview } : person
    return (
        <div className={`pp-photo ${busy ? 'busy' : ''}`} style={{ '--s': `${size}px` }}>
            {preview ? <span className="pp-avatar ring" style={{ width: size, height: size }}><img src={preview} alt="" /></span> : <Avatar person={shown} size={size} ring />}
            <button type="button" className="pp-photo-cam" onClick={() => input.current?.click()} disabled={busy} aria-label="Change photo" title="Change photo">
                <i className={`mdi ${busy ? 'mdi-loading mdi-spin' : 'mdi-camera'}`}></i>
            </button>
            {canRemove && endpoint === '/auth/profile/photo' && hasRealPhoto(person?.profileImage) && !busy && <button type="button" className="pp-photo-rm" onClick={remove}>Remove photo</button>}
            <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" capture="user" hidden onChange={pick} />
        </div>
    )
}
