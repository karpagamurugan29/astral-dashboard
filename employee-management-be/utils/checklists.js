export const DEFAULT_ONBOARDING_TASKS = [
    "Send welcome email",
    "Collect ID proof & documents",
    "Set up system access (email, login)",
    "Assign workstation / asset",
    "HR orientation session",
    "Policy acknowledgement signed",
].map((title) => ({ title, completed: false, completedAt: null }));

export const DEFAULT_OFFBOARDING_TASKS = [
    "Resignation / exit letter received",
    "Knowledge transfer completed",
    "Company assets returned",
    "System access revoked",
    "Exit interview conducted",
    "Full & final settlement processed",
].map((title) => ({ title, completed: false, completedAt: null }));
