import React, { useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { NavLink, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';

/* -------------------------------------------------------------------------- */
/*  Recursive menu item. The theme's CSS (metismenu convention) expects the   */
/*  "mm-active" class on the <li>, not the <a> — e.g. its rules are           */
/*  ".mm-active>a", "li.mm-active". Putting it on the <a> itself (as this     */
/*  component used to) means those selectors never match, so the active link */
/*  never highlights. Fixed below by toggling the class on the <li>.         */
/*                                                                            */
/*  Visibility is gated by `item.roles` (an allow-list of role names) and,    */
/*  where set, `item.module` against the role's live Roles & Permissions     */
/*  list — this is UI convenience only. The backend enforces the real        */
/*  authorization on every route regardless of what the sidebar shows.       */
/* -------------------------------------------------------------------------- */
// A module granted beyond the role (Access Control: department or personal) opens items
// whose role list would otherwise hide them.
// item.team — a team screen: shown to anyone who leads a team (any designation), HR and the
// firm-wide seniors; item.finance also opens it to Accounts. ('@team' / '@finance' are added to
// `granted` from the reporting-tree scope in the Sidebar below.)
// item.auditLead — audit management screens: Admin, Managers and the firm-wide roles (incl. HR /
// Accounts heads); item.finance also opens it to Accounts staff.
const roleOk = (menuItem, userRole, granted) => {
    if (menuItem.auditLead) return userRole === 'Admin' || userRole === 'Manager' || !!granted?.includes('@firm') || (!!menuItem.finance && !!granted?.includes('@finance'));
    if (menuItem.money) return userRole === 'Admin' || userRole === 'HR' || !!granted?.includes('@money');
    if (menuItem.team) return userRole === 'Admin' || !!granted?.includes('@team') || (!!menuItem.finance && !!granted?.includes('@finance'));
    return !menuItem.roles || menuItem.roles.includes(userRole) || (!!menuItem.module && !!granted?.includes(menuItem.module));
};

// item.screen — a screen permission (Access Control) needed to see this item at all.
const screenOk = (menuItem, userRole, permissions) => !menuItem.screen || userRole === 'Admin' || !!permissions?.includes(menuItem.screen);

const isAllowedFor = (menuItem, userRole, permissions, granted) => {
    if (!roleOk(menuItem, userRole, granted)) return false;
    if (!screenOk(menuItem, userRole, permissions)) return false;
    if (menuItem.module && userRole !== 'Admin' && !permissions?.includes(menuItem.module)) return false;
    return true;
};

const isVisibleFor = (menuItem, userRole, permissions, granted) => {
    if (!isAllowedFor(menuItem, userRole, permissions, granted)) return false;
    if (menuItem.link && !menuItem.children) return true;
    return (menuItem.children || []).some((c) => isVisibleFor(c, userRole, permissions, granted));
};

const MenuItem = ({ item, level = 0, openMenus, handleMenuClick, userRole, permissions, granted, activeLink }) => {
    const hasSubMenu = item.children && item.children.length > 0;
    const isOpen = !!openMenus[item.name];
    const isLink = item.link && !hasSubMenu;
    // `exclude` keeps a parent path (e.g. /audits) from lighting up on a sibling's pages (/audits/clients).
    // exactly one item is active: the menu link that best matches the page (worked out in Sidebar)
    const isActiveLink = isLink && item.link === activeLink;

    const isAllowed = (menuItem) => {
        if (!roleOk(menuItem, userRole, granted)) return false;
        if (!screenOk(menuItem, userRole, permissions)) return false;
        if (menuItem.module && userRole !== 'Admin' && !permissions?.includes(menuItem.module)) return false;
        return true;
    };

    const hasAccessibleChildren = (menuItem) => {
        if (!menuItem.children) return false;
        return menuItem.children.some((child) => {
            if (!isAllowed(child)) return false;
            if (child.link) return true;
            return hasAccessibleChildren(child);
        });
    };

    const shouldShowItem = () => {
        if (item.isTitle) return true;
        if (!isAllowed(item)) return false;
        if (isLink) return true;
        if (hasSubMenu) return hasAccessibleChildren(item);
        return false;
    };

    if (!shouldShowItem()) return null;

    if (item.isTitle) {
        return (
            <li className={level === 0 ? 'menu-title mt-2' : 'menu-title'} data-key={item.dataKey}>
                {item.label}
            </li>
        );
    }

    return (
        <li className={`${isActiveLink ? 'mm-active' : ''} ${hasSubMenu ? 'has-sub' : ''}`.trim() || undefined}>
            {isLink ? (
                <NavLink
                    to={item.link}
                    data-key={item.dataKey}
                >
                    {item.icon && <i data-feather={item.icon}></i>}
                    {item.badge && <span className={item.badge.className}>{item.badge.text}</span>}
                    <span data-key={item.dataKey}>{item.label}</span>
                </NavLink>
            ) : (
                <a
                    href="#!"
                    className={`has-arrow ${isOpen ? 'mm-active' : ''}`}
                    data-key={item.dataKey}
                    onClick={(e) => {
                        e.preventDefault();
                        handleMenuClick(item.name);
                    }}
                >
                    {item.icon && <i data-feather={item.icon}></i>}
                    {item.badge && <span className={item.badge.className}>{item.badge.text}</span>}
                    <span data-key={item.dataKey}>{item.label}</span>
                </a>
            )}

            {hasSubMenu && (
                <ul className="sub-menu" aria-expanded={isOpen} style={{ display: isOpen ? 'block' : 'none' }}>
                    {item.children.map((childItem) => (
                        <MenuItem
                            key={childItem.name}
                            item={childItem}
                            level={level + 1}
                            openMenus={openMenus}
                            handleMenuClick={handleMenuClick}
                            userRole={userRole}
                            permissions={permissions}
                            granted={granted}
                            activeLink={activeLink}
                        />
                    ))}
                </ul>
            )}
        </li>
    );
};

MenuItem.propTypes = {
    item: PropTypes.object.isRequired,
    level: PropTypes.number,
    openMenus: PropTypes.object.isRequired,
    handleMenuClick: PropTypes.func.isRequired,
    userRole: PropTypes.string,
    permissions: PropTypes.array,
    granted: PropTypes.array,
};

const ADMIN = ['Admin'];
const ADMIN_HR = ['Admin', 'HR'];
const ADMIN_HR_MANAGER = ['Admin', 'HR', 'Manager', 'Team Lead'];

export const Sidebar = () => {
    /* ---------------------------------------------------------------------- */
    /*  Consolidated menu — one group per real business area, capped so the   */
    /*  rail stays scannable instead of listing every module flat. Every      */
    /*  link here resolves to a real screen (see App.js) — nothing points to  */
    /*  a blank page. Recruitment/Performance/Org Chart were removed rather   */
    /*  than left as dead links: those are full modules of their own that     */
    /*  aren't built, not a missing screen or two.                            */
    /* ---------------------------------------------------------------------- */
    const { isAuthenticated: user, permissions, granted: grantedModules, team } = useSelector((state) => state.authReducer || {});
    const userRole = user?.role;
    // Until the reporting-tree scope arrives, fall back to the old role list for team screens.
    const granted = useMemo(() => [
        ...(grantedModules || []),
        ...((team ? team.leads || team.people : ADMIN_HR_MANAGER.includes(userRole)) ? ['@team'] : []),
        ...(team?.finance ? ['@finance'] : []),
        ...(team?.firm || team?.finance ? ['@money'] : []),
        ...(team?.firm ? ['@firm'] : []),
    ], [grantedModules, team, userRole]);

    // Grouped by purpose. Inside each module the person's own items come first,
    // team / admin items after. Section titles hide when nothing below them is visible.
    // The original layout, grouped by module; inside each module the person's own items come
    // first, team / admin items after. Section titles hide when nothing below them is visible.
    const menuItems = [
        { name: "main-title", isTitle: true, label: "Main" },
        { name: "dashboard", label: "Dashboard", icon: "home", link: "/dashboard" },
        { name: "calendar", label: "Calendar", icon: "calendar", link: "/calendar", match: "/calendar" }, // work and personal plans, reminders, deadlines
        { name: "messages", label: "Messages", icon: "message-circle", link: "/messages" },
        { name: "files", label: "Files", icon: "hard-drive", link: "/files" },
        { name: "notifications", label: "Notifications", icon: "bell", link: "/notifications" },
        { name: "announcements", label: "Announcements", icon: "volume-2", link: "/announcements", screen: "screen:announcements" },
        { name: "location-log", label: "Location Log", icon: "map-pin", link: "/location-log", team: true, module: "attendance" },

        { name: "people-title", isTitle: true, label: "People" },
        { name: "organisation", label: "Organisation", icon: "git-merge", link: "/organisation" },
        {
            name: "employees",
            label: "Employees",
            icon: "users",
            children: [
                { name: "employees-directory", label: "Employee Directory", link: "/employees", screen: "screen:directory" },
                { name: "employees-departments", label: "Departments", link: "/departments", screen: "screen:org" },
                { name: "employees-designations", label: "Designations", link: "/designations", screen: "screen:org" },
                { name: "employees-documents", label: "Employee Documents", link: "/documents", screen: "screen:documents" },
                { name: "employees-onboarding", label: "Onboarding", link: "/employees/onboarding", roles: ADMIN_HR, module: "employees" },
                { name: "employees-offboarding", label: "Offboarding", link: "/employees/offboarding", roles: ADMIN_HR, module: "employees" },
            ],
        },
        {
            name: "attendance",
            label: "Attendance",
            icon: "clock",
            children: [
                { name: "attendance-my", label: "My Attendance", link: "/attendance/today", screen: "screen:attendance" },
                { name: "attendance-regularization", label: "Regularization", link: "/attendance/regularization", screen: "screen:attendance" },
                { name: "attendance-holidays", label: "Holidays", link: "/attendance/holidays", screen: "screen:holidays" },
                { name: "attendance-shifts", label: "Shifts", link: "/attendance/shifts", screen: "screen:shifts" },
                { name: "attendance-team", label: "Team Attendance", link: "/attendance/team", team: true, module: "attendance" },
                { name: "attendance-subordinates", label: "Subordinate Attendance", link: "/attendance/subordinates", team: true, module: "attendance" },
            ],
        },
        {
            name: "leave",
            label: "Leave",
            icon: "calendar",
            children: [
                { name: "leave-my", label: "My Leave", link: "/leave", screen: "screen:leave" },
                { name: "leave-apply", label: "Apply Leave", link: "/leave/apply", screen: "screen:leave" },
                { name: "leave-team-calendar", label: "Team Calendar", link: "/leave/team-calendar", screen: "screen:leave" },
                { name: "leave-approvals", label: "Approvals", link: "/leave/approvals", team: true, module: "leave" },
            ],
        },
        {
            name: "helpdesk",
            label: "HR Helpdesk",
            icon: "life-buoy",
            children: [
                { name: "helpdesk-my", label: "My Tickets", link: "/helpdesk", screen: "screen:helpdesk" },
                { name: "helpdesk-all", label: "HR Tickets", link: "/helpdesk/all", roles: ADMIN_HR_MANAGER, module: "helpdesk" },
                { name: "helpdesk-settings", label: "Helpdesk Settings", link: "/helpdesk/settings", roles: ADMIN_HR, module: "helpdesk" },
            ],
        },

        { name: "work-title", isTitle: true, label: "Work" },
        {
            name: "audits",
            label: "Audits",
            icon: "briefcase",
            children: [
                { name: "audits-dashboard", label: "Audit Dashboard", link: "/audits/dashboard", auditLead: true, finance: true },
                { name: "audits-mywork", label: "My Work", link: "/my-work", screen: "screen:audits" },
                { name: "audits-timesheets", label: "Timesheets", link: "/timesheets", screen: "screen:audits" },
                { name: "audits-projects", label: "Engagements", link: "/audits", screen: "screen:audits" },
                { name: "audits-groups", label: "Projects", link: "/audits/projects", screen: "screen:audits" },
                { name: "audits-clients", label: "Clients", link: "/audits/clients", screen: "screen:audits" },
                { name: "audits-allocation", label: "Team Workload", link: "/audits/allocation", auditLead: true },
                { name: "audits-workflows", label: "Audit Checklists", link: "/audits/workflows", auditLead: true },
                { name: "audits-billing", label: "Billing & Invoices", link: "/audits/billing", money: true },
            ],
        },
        // Audits, Projects and To-do are separate kinds of work, so each gets its own menu.
        { name: "projects", label: "Projects", icon: "folder", link: "/projects", match: "/projects", screen: "screen:projects" },
        { name: "todo", label: "To-do", icon: "check-square", link: "/tasks", match: "/tasks" }, // personal list — everyone has one

        { name: "finance-title", isTitle: true, label: "Finance" },
        {
            name: "payroll",
            label: "Payroll",
            icon: "dollar-sign",
            children: [
                { name: "payroll-payslips", label: "My Payslips", link: "/payroll/payslips", screen: "screen:payslips" },
                { name: "payroll-loans", label: "Loans / Advances", link: "/payroll/loans", screen: "screen:loans" },
                { name: "payroll-salary-structure", label: "Salary Structure", link: "/payroll/salary-structure", roles: ADMIN_HR, module: "payroll" },
                { name: "payroll-runs", label: "Payroll Runs", link: "/payroll/process", roles: ADMIN, module: "payroll" },
            ],
        },
        {
            name: "expenses",
            label: "Expenses",
            icon: "credit-card",
            children: [
                { name: "expenses-my", label: "My Expenses", link: "/expenses", screen: "screen:expenses" },
                { name: "expenses-approvals", label: "Approvals", link: "/expenses/approvals", team: true, finance: true, module: "expenses" },
            ],
        },
        {
            name: "assets",
            label: "Assets",
            icon: "monitor",
            children: [
                { name: "assets-mine", label: "My Assets", link: "/assets/mine" },
                { name: "assets-list", label: "Asset Register", link: "/assets", roles: ADMIN_HR, module: "assets" },
                { name: "assets-assignments", label: "Who Has What", link: "/assets/assignments", roles: ADMIN_HR, module: "assets" },
            ],
        },

        { name: "insights-title", isTitle: true, label: "Insights" },
        { name: "reports", label: "Reports", icon: "bar-chart-2", link: "/reports/overview", match: "/reports", team: true, module: "reports" },

        { name: "admin-title", isTitle: true, label: "Administration" },
        {
            name: "settings",
            label: "Settings",
            icon: "settings",
            // Admin-only per item (not on the group), so a module granted in Access Control can open just that item.
            children: [
                { name: "settings-company", label: "Company Profile", link: "/settings/company", roles: ADMIN, module: "settings" },
                { name: "settings-branches", label: "Branches", link: "/settings/branches", roles: ADMIN, module: "branches" },
                { name: "settings-holidays", label: "Holidays", link: "/settings/holidays", roles: ADMIN, module: "settings" },
                { name: "settings-access", label: "Access Control", link: "/settings/access", roles: ADMIN, module: "roles" },
                { name: "settings-roles", label: "Roles & Permissions", link: "/roles", roles: ADMIN, module: "roles" },
            ],
        },
        // Top level (not inside Admin-only Settings) so HR with the permission can reach it.
        { name: "settings-audit", label: "Audit Logs", icon: "activity", link: "/settings/audit", roles: ADMIN_HR, module: "audit-logs" },

        { name: "account-title", isTitle: true, label: "Account" },
        { name: "profile", label: "My Profile", icon: "user", link: "/profile" },
        { name: "change-password", label: "Change Password", icon: "lock", link: "/change-password" },
    ];

    // Drop section titles that have nothing visible beneath them for this user.
    const visibleItems = menuItems.filter((item, i) => {
        if (!item.isTitle) return true;
        for (let j = i + 1; j < menuItems.length && !menuItems[j].isTitle; j += 1) {
            if (isVisibleFor(menuItems[j], userRole, permissions, granted)) return true;
        }
        return false;
    });
    const [openMenus, setOpenMenus] = useState({});
    const location = useLocation();
    const previousGroupRef = useRef(null);

    // The link that best matches the page: an exact match wins, otherwise the longest link the
    // path sits under (/audits/123 → Audit Projects, /leave/apply → Apply Leave, not My Leave).
    const flatLinks = (items) => items.flatMap((i) => (i.children ? flatLinks(i.children) : i.link ? [i] : []));
    const activeLink = (() => {
        const path = location.pathname;
        let best = null, score = -1;
        flatLinks(menuItems).forEach((i) => {
            const base = i.match || i.link;
            const sc = path === i.link ? 100000 : path === base || path.startsWith(`${base}/`) ? base.length : -1;
            if (sc > score) { score = sc; best = i.link; }
        });
        return best;
    })();

    const getTopLevelMenuName = (items, path) => {
        for (const item of items) {
            if (item.link === path) return item.name;
            if (item.children) {
                const found = getTopLevelMenuName(item.children, path);
                if (found) return item.name;
            }
        }
        return null;
    };

    const findMenuPath = (items, path, parents = []) => {
        for (const item of items) {
            const newPath = [...parents, item.name];
            if (item.link === path) return newPath;
            if (item.children) {
                const result = findMenuPath(item.children, path, newPath);
                if (result) return result;
            }
        }
        return null;
    };

    const handleMenuClick = (name) => {
        setOpenMenus((prev) => ({ ...prev, [name]: !prev[name] }));
    };

    // Auto-expand the branch that matches the current route (same behaviour as DashboardMenu)
    useEffect(() => {
        const pathSegments = findMenuPath(menuItems, activeLink || location.pathname);
        const currentGroup = getTopLevelMenuName(menuItems, activeLink || location.pathname);

        if (currentGroup && currentGroup !== previousGroupRef.current) {
            setOpenMenus((prev) => {
                const newOpen = { ...prev };
                if (pathSegments) {
                    pathSegments.forEach((seg) => {
                        newOpen[seg] = true;
                    });
                }
                return newOpen;
            });
            previousGroupRef.current = currentGroup;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.pathname]);

    // On phones the menu is an overlay: close it after navigating.
    useEffect(() => {
        document.body.classList.remove('sidebar-enable')
    }, [location.pathname]);

    // Re-render feather icons every time the menu tree changes (open/close, role loaded)
    useEffect(() => {
        if (window.feather) {
            window.feather.replace();
        }
    }, [openMenus, userRole]);

    // Collapsed (icons only): place the hover label / submenu next to the hovered icon,
    // nudged up if it would run off the bottom of the screen.
    useEffect(() => {
        const menu = document.getElementById('side-menu')
        if (!menu) return undefined
        const onOver = (e) => {
            if (document.body.getAttribute('data-sidebar-size') !== 'sm') return
            const li = e.target.closest('#side-menu > li')
            if (!li) return
            const top = li.getBoundingClientRect().top
            const sub = li.querySelector(':scope > ul')
            const flyH = 44 + (sub ? sub.children.length * 37 + 12 : 0)
            li.style.setProperty('--fly-top', `${Math.max(76, Math.min(top, window.innerHeight - flyH - 8))}px`)
        }
        menu.addEventListener('mouseover', onOver)
        return () => menu.removeEventListener('mouseover', onOver)
    }, [])

    return (
        <div>
            <div className="sidebar-backdrop" onClick={() => document.body.classList.remove('sidebar-enable')} aria-hidden="true"></div>
            <div className="vertical-menu">
                <div data-simplebar className="h-100">
                    <div id="sidebar-menu">
                        <ul className="metismenu list-unstyled" id="side-menu">
                            {visibleItems.map((item) => (
                                <MenuItem
                                    key={item.name}
                                    item={item}
                                    level={0}
                                    openMenus={openMenus}
                                    handleMenuClick={handleMenuClick}
                                    userRole={userRole}
                                    permissions={permissions}
                                    granted={granted}
                                    activeLink={activeLink}
                                />
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
};
