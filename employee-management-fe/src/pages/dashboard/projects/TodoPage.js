import React, { useCallback, useEffect, useState } from 'react'
import { PeopleShell, ErrorBanner } from '../../../components/people/PeopleUI'
import { toast } from '../../../components/common/Toaster'
import { api } from './ProjectParts'
import { TODO_ROOT, QuickAdd, TodayView, TodoModal } from './TodoParts'

/* To-do — the person's own list, separate from projects. Personal to-dos only: add them in one
   line, see them by when they're due, tick them off. Nobody else can see them. Project tasks
   live under Projects › My tasks. */
export const TodoPage = () => {
    const [list, setList] = useState(null)
    const [error, setError] = useState('')
    const [open, setOpen] = useState(null) // the to-do window: {} for a new one

    const load = useCallback(() => api('GET', '/todos').then((j) => { setList(j.data); setError('') }).catch((e) => setError(e.message)), [])
    useEffect(() => { load() }, [load])

    const upsert = (t) => setList((l) => (l || []).some((x) => x._id === t._id) ? l.map((x) => (x._id === t._id ? { ...x, ...t, personal: true } : x)) : [{ ...t, personal: true }, ...(l || [])])

    const tick = async (t, markDone) => {
        const to = markDone ? 'Done' : 'To Do'
        const prev = { status: t.status, completedAt: t.completedAt }
        const patch = (p) => setList((l) => l.map((x) => (x._id === t._id ? { ...x, ...p } : x)))
        patch({ status: to, completedAt: to === 'Done' ? new Date().toISOString() : null })
        try {
            await api('PUT', `/tasks/${t._id}/move`, { status: to })
            toast.success(`“${t.title}”`, { title: to === 'Done' ? 'Done' : 'Back on your list', action: { label: 'Undo', onClick: async () => { patch(prev); try { await api('PUT', `/tasks/${t._id}/move`, { status: prev.status }) } catch (e) { toast.error(e.message); load() } } } })
        } catch (e) { patch(prev); toast.error(e.message) }
    }

    return (
        <PeopleShell title="To-do" root={TODO_ROOT} crumbs={[{ label: 'My list' }]}
            actions={<button type="button" className="pp-btn primary" onClick={() => setOpen({})}><i className="mdi mdi-plus"></i>Add to-do</button>}>
            <ErrorBanner error={error} />
            <QuickAdd onAdded={(t) => { upsert(t); toast.success(`“${t.title}”`, { title: 'Added to your list' }) }} />
            {!list ? <div className="pp-card"><div className="pw-loading"><i className="mdi mdi-loading mdi-spin"></i></div></div>
                : <TodayView tasks={list} onTick={tick} onOpen={(t) => setOpen(t)} />}
            {open && <TodoModal todo={open._id ? open : null} onClose={() => setOpen(null)}
                onSaved={(t, isNew, status) => { setOpen(null); upsert(t); toast.success(`“${t.title}”`, { title: isNew ? 'Added to your list' : status === 'Done' ? 'Done' : status ? 'Back on your list' : 'Saved' }) }}
                onDeleted={(id) => { setOpen(null); setList((l) => l.filter((x) => x._id !== id)); toast.success('Removed from your list.', { title: 'To-do deleted' }) }} />}
        </PeopleShell>
    )
}
