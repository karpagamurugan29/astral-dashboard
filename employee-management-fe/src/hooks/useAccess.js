import { useSelector } from 'react-redux'

// can(roles, module) — the same rule the backend's authorize(module, ...roles) applies:
// Admin always; otherwise the role is listed AND has the module, or the module was granted
// to this person's department / to them personally in Access Control. A personal block is
// already removed from both `permissions` and `granted`, so it wins here too.
export const useAccess = () => {
    const { isAuthenticated: user, permissions, granted, team } = useSelector((state) => state.authReducer || {})
    const role = user?.role
    // the reporting tree counts like on the server: leading a team opens Team Lead screens,
    // HR / firm-wide reach opens the HR ones
    const listed = (roles) => !!roles?.includes(role)
        || (!!roles?.includes('Team Lead') && !!team?.leads)
        || (!!roles?.includes('HR') && !!(team?.people || team?.firm))
        || (!!roles?.includes('Manager') && !!team?.firm)
    const can = (roles, module) => {
        if (role === 'Admin') return true
        if (!module) return listed(roles)
        return (listed(roles) && !!permissions?.includes(module)) || !!granted?.includes(module)
    }
    // Screens (menu + page): Admin always, otherwise only when granted.
    // Firm-wide seniors (Partners, Directors, Senior Managers, HR / Accounts heads) see every screen;
    // Accounts staff also see the audit screens they bill from.
    const canSee = (screen) => !screen || role === 'Admin' || !!team?.firm || (screen === 'screen:audits' && !!team?.finance) || !!permissions?.includes(screen)
    return { user, role, can, canSee }
}
