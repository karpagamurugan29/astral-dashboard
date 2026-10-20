import React from 'react'
import { useSelector } from 'react-redux'
import { useAccess } from '../../hooks/useAccess'
import { PeopleShell, EmptyState } from '../people/PeopleUI'

/* Shows the page only if this person has the screen permission (Access Control).
   Until the permission list has loaded the page renders as normal, so there's no "No access" flash. */
export const ScreenGuard = ({ screen, children }) => {
    const { user, canSee } = useAccess()
    const { permissionsLoaded } = useSelector((state) => state.authReducer || {})
    if (!user || !permissionsLoaded || canSee(screen)) return children
    return (
        <PeopleShell title="No access" root={{ label: 'Dashboard', to: '/dashboard' }} crumbs={[{ label: 'No access' }]}>
            <div className="pp-card">
                <EmptyState icon="mdi-lock-outline" title="You don't have access to this screen"
                    text="Ask your administrator to give you access in Settings → Access Control." />
            </div>
        </PeopleShell>
    )
}
