import { useSelector } from 'react-redux'

// can(roles, module) — the same rule the backend's authorize(module, ...roles) applies:
// Admin always; otherwise the role is listed AND has the module, or the module was granted
// to this person's department / to them personally in Access Control. A personal block is
// already removed from both `permissions` and `granted`, so it wins here too.
export const useAccess = () => {
    const { isAuthenticated: user, permissions, granted } = useSelector((state) => state.authReducer || {})
    const role = user?.role
    const can = (roles, module) => {
        if (role === 'Admin') return true
        if (!module) return !!roles?.includes(role)
        return (!!roles?.includes(role) && !!permissions?.includes(module)) || !!granted?.includes(module)
    }
    // Screens (menu + page): Admin always, otherwise only when granted.
    const canSee = (screen) => !screen || role === 'Admin' || !!permissions?.includes(screen)
    return { user, role, can, canSee }
}
