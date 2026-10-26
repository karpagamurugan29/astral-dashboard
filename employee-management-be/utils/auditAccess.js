import { scopeOf } from "./hierarchy.js";

/* ---------------------------------------------------------------------------
   Who may do what on an audit engagement — one place, used by every audit API.

   leader   full access to every engagement — view, manage, configure, review, approve time:
            Admin, Partners / Directors, Senior Managers, and the HR Head and Accounts / Finance Head
            (the firm wants its function heads to have full access).
   manager  the engagement's audit manager, and the project's manager / partner:
            manage that engagement (team, workflow, tasks, reviews, time approval).
   lead     someone whose reports are on the engagement: view it, review their reports' time.
   member   on the team: view, work assigned tasks, log time, comment, upload workpapers.
   finance  Accounts / Finance staff: engagement summary, economics, time for billing — never
            workpapers or review comments.
   HR staff (below HR Head) get nothing here unless they are on the team: attendance and leave
   live in HR screens; audit workpapers are not HR data.
   --------------------------------------------------------------------------- */

const HR_FUNCTION = ["HR Head", "HR Manager", "HR Executive", "HR"];
const FINANCE_FUNCTION = ["Accounts Head", "Finance Head", "Accounts", "Accounts Executive", "Accountant", "Finance Executive"];
export const idStr = (v) => (v?._id ?? v)?.toString?.() ?? null;
export const onTeam = (audit, userId) => [audit.auditManager, ...(audit.teamMembers || [])].some((m) => idStr(m) === String(userId));

// full access: Admin and every firm-wide role (Partners, Directors, Senior Managers, HR Head, Accounts Head)
export const isAuditLeader = async (req) => {
    if (req.user.role === "Admin") return true;
    return (await scopeOf(req)).firm;
};
export const isFinance = async (req) => {
    const s = await scopeOf(req);
    return s.finance || FINANCE_FUNCTION.includes(s.designation);
};

// { leader, manager, lead, member, finance, view, manage, workpapers }
export const auditAccess = async (req, audit, project = null) => {
    const s = await scopeOf(req);
    const me = s.me;
    const leader = await isAuditLeader(req);
    const manager = idStr(audit.auditManager) === me || (project && [project.manager, project.partner].some((p) => idStr(p) === me));
    const member = onTeam(audit, me);
    const lead = [audit.auditManager, ...(audit.teamMembers || [])].some((m) => s.team.has(idStr(m)));
    const finance = await isFinance(req);
    const view = leader || manager || member || lead || finance;
    return {
        me, leader, manager: !!manager, member, lead, finance,
        view,
        manage: leader || !!manager,
        // workpapers, review comments, evidence: the people doing / supervising the audit, not Finance or HR
        workpapers: leader || !!manager || member || lead,
    };
};

// Mongo filter for engagements someone may list (null = all)
export const visibleAuditFilter = async (req) => {
    if ((await isAuditLeader(req)) || (await isFinance(req))) return {};
    const s = await scopeOf(req);
    const ids = [s.me, ...s.team];
    return { $or: [{ auditManager: { $in: ids } }, { teamMembers: { $in: ids } }] };
};

// May create client companies, projects and engagements: leadership and managers (not team leads)
export const canCreateAudits = async (req) => {
    if (await isAuditLeader(req)) return true;
    const s = await scopeOf(req);
    return req.user.role === "Manager" && !HR_FUNCTION.includes(s.designation) && !FINANCE_FUNCTION.includes(s.designation);
};
