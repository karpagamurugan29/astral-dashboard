// Friendly label, icon and colour for each permission module the backend knows about
// (ALL_PERMISSION_MODULES in role.controller.js). Shared by Roles and Access Control.
export const MODULE_META = {
    employees: ['Employees', 'mdi-account-group-outline', '#0284c7'],
    departments: ['Departments', 'mdi-office-building-outline', '#0284c7'],
    designations: ['Designations', 'mdi-badge-account-horizontal-outline', '#0284c7'],
    branches: ['Branches', 'mdi-office-building-marker-outline', '#0284c7'],
    attendance: ['Attendance', 'mdi-clock-check-outline', '#059669'],
    leave: ['Leave', 'mdi-beach', '#7c3aed'],
    projects: ['Projects & Audits', 'mdi-folder-outline', '#0d9488'],
    tasks: ['Tasks', 'mdi-format-list-checks', '#0d9488'],
    payroll: ['Payroll', 'mdi-cash-multiple', '#0b0f19'],
    expenses: ['Expenses', 'mdi-receipt', '#ea580c'],
    assets: ['Assets', 'mdi-laptop', '#2563eb'],
    helpdesk: ['HR Helpdesk', 'mdi-lifebuoy', '#e11d48'],
    announcements: ['Announcements', 'mdi-bullhorn-outline', '#d97706'],
    reports: ['Reports', 'mdi-chart-bar', '#db2777'],
    settings: ['Settings', 'mdi-cog-outline', '#475569'],
    roles: ['Roles & Access', 'mdi-shield-key-outline', '#475569'],
    'audit-logs': ['Audit logs', 'mdi-history', '#475569'],
}

// What turning a module on actually opens, shown as help text.
export const MODULE_HELP = {
    employees: 'Add / edit employees, onboarding, offboarding',
    departments: 'Manage departments',
    designations: 'Manage designations',
    branches: 'Manage branches',
    attendance: 'Team attendance, approve corrections, Location Log',
    leave: 'Approve leave for others',
    projects: 'Create & manage projects, audit clients and audit projects',
    tasks: 'Manage tasks for others',
    payroll: 'Salary structures and payroll runs',
    expenses: 'Approve expenses',
    assets: 'Manage the asset register',
    helpdesk: 'Handle HR tickets',
    announcements: 'Post announcements',
    reports: 'All reports',
    settings: 'Company settings, holidays',
    roles: 'Change who can access what (this screen)',
    'audit-logs': 'View the audit trail',
}

// Modules that let someone change money or access — the screen asks before granting these.
export const SENSITIVE_MODULES = ['payroll', 'roles', 'settings']

export const moduleMeta = (m) => MODULE_META[m] || [m, 'mdi-puzzle-outline', '#64748b']

// Screens someone can open (sidebar + page). Dashboard, Notifications, My Profile and
// Change Password are always available and aren't listed.
export const SCREEN_META = {
    'screen:announcements': ['Announcements', 'mdi-bullhorn-outline', '#d97706', 'Read company announcements'],
    'screen:attendance': ['My Attendance', 'mdi-clock-check-outline', '#059669', 'Check in / out, history, corrections'],
    'screen:holidays': ['Holidays', 'mdi-calendar-star', '#e11d48', 'Holiday calendar'],
    'screen:shifts': ['Shifts', 'mdi-calendar-clock', '#0284c7', 'Shift timings'],
    'screen:leave': ['My Leave', 'mdi-beach', '#7c3aed', 'Apply for leave, balance, team calendar'],
    'screen:helpdesk': ['HR Helpdesk', 'mdi-lifebuoy', '#e11d48', 'Raise and track own tickets'],
    'screen:directory': ['Employee Directory', 'mdi-account-group-outline', '#0284c7', 'Browse colleagues and profiles'],
    'screen:org': ['Departments & Designations', 'mdi-office-building-outline', '#0284c7', 'View the org structure lists'],
    'screen:documents': ['Employee Documents', 'mdi-file-document-multiple-outline', '#475569', 'Document centre'],
    'screen:audits': ['Audits', 'mdi-briefcase-search-outline', '#0d9488', 'Clients and audit projects they work on, with the timer'],
    'screen:projects': ['Projects & Tasks', 'mdi-folder-outline', '#0d9488', 'Projects and the task board'],
    'screen:payslips': ['My Payslips', 'mdi-file-document-outline', '#0b0f19', 'Own salary slips'],
    'screen:loans': ['Loans / Advances', 'mdi-hand-coin-outline', '#0b0f19', 'Request and track loans'],
    'screen:expenses': ['My Expenses', 'mdi-receipt', '#ea580c', 'Submit and track expense claims'],
    'screen:assets': ['My Assets', 'mdi-laptop', '#2563eb', 'Assets assigned to them'],
}

export const isScreen = (k) => String(k).startsWith('screen:')
export const keyMeta = (k) => (isScreen(k) ? (SCREEN_META[k] || [k, 'mdi-monitor', '#64748b', '']) : [...moduleMeta(k), MODULE_HELP[k] || ''])
