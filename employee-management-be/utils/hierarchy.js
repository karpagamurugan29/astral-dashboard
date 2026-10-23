import employeeModel from "../models/employeeModel.js";

/* --------------------------------------------------------------------------
   The firm's reporting ladder — one place for levels, responsibilities and
   "who is in my team".

   - Partners, Directors, Senior Managers, HR Head and Accounts / Finance Head see the whole firm.
   - HR staff see everyone's HR records (attendance, leave); Accounts staff see
     everyone's money records (expenses, loans, payroll).
   - Managers and below work in separate teams: they see themselves plus everyone who
     reports to them (directly or further down), and in the directory / org chart also
     the officials above them and their own team mates — never other teams.
   -------------------------------------------------------------------------- */
export const LADDER = [
    { tier: 1, key: "leadership", title: "Partners & Directors", designations: ["Company Partner", "Partner", "Director", "Managing Director"], role: "Admin", reach: "firm",
        duty: "Lead the firm and its practices. See and approve everything." },
    { tier: 1, key: "heads", title: "Function heads", designations: ["HR Head", "Accounts Head", "Finance Head"], role: "Manager", reach: "firm",
        duty: "Run HR or Finance for the whole firm. See every team's records." },
    { tier: 2, key: "senior-manager", title: "Senior Manager", designations: ["Senior Manager"], role: "Manager", reach: "firm",
        duty: "Runs several teams through their managers. Sees every team, project and record." },
    { tier: 3, key: "manager", title: "Manager", designations: ["Manager"], role: "Manager", reach: "team",
        duty: "Runs one team and its projects through team leads; approves the team’s leave and time." },
    { tier: 4, key: "hr", title: "HR", designations: ["HR", "HR Executive", "HR Manager"], role: "HR", reach: "people",
        duty: "Day-to-day HR: attendance, leave, onboarding and records for everyone." },
    { tier: 4, key: "accounts", title: "Accounts", designations: ["Accounts", "Accounts Executive", "Accountant", "Finance Executive"], role: "Employee", reach: "finance",
        duty: "Expenses, loans and payroll processing for everyone." },
    { tier: 5, key: "senior-consultant", title: "Team Lead · Senior Consultant", designations: ["Senior Consultant", "Team Lead"], role: "Team Lead", reach: "team",
        duty: "Leads a squad day to day — assigns work, reviews it and approves their leave first." },
    { tier: 6, key: "consultant", title: "Consultant", designations: ["Consultant"], role: "Employee", reach: "team",
        duty: "Delivers audit and advisory work and guides the juniors and associates under them." },
    { tier: 7, key: "junior-consultant", title: "Junior Consultant", designations: ["Junior Consultant"], role: "Employee", reach: "team",
        duty: "Carries out assigned audit procedures and working papers." },
    { tier: 7, key: "associate", title: "Associate", designations: ["Associate", "Article Assistant", "Trainee"], role: "Employee", reach: "team",
        duty: "Supports the engagement team and learns the work." },
]
// HR Head runs HR, so give that designation the HR role by default.
const ROLE_OVERRIDE = { "HR Head": "HR" };

const norm = (s) => String(s || "").trim().toLowerCase();
const STEP_BY_DESIGNATION = new Map(LADDER.flatMap((s) => s.designations.map((d) => [norm(d), s])));
export const stepOf = (designation) => STEP_BY_DESIGNATION.get(norm(designation)) || null;
export const tierOf = (designation) => stepOf(designation)?.tier ?? 9;
export const defaultRoleFor = (designation) => ROLE_OVERRIDE[String(designation || "").trim()] || stepOf(designation)?.role || null;

// Short cache of the whole active roster (small firm) so every request doesn't walk the tree in the DB.
const CACHE_MS = 15000;
let roster = null;
export const invalidateHierarchy = () => { roster = null; };
const loadRoster = async () => {
    if (roster && roster.expiresAt > Date.now()) return roster;
    const people = await employeeModel.find({ status: "Active" }).select("_id role designation manager").lean();
    const byId = new Map(people.map((p) => [String(p._id), p]));
    const kids = new Map();
    people.forEach((p) => {
        const m = p.manager ? String(p.manager) : null;
        if (m && byId.has(m)) { if (!kids.has(m)) kids.set(m, []); kids.get(m).push(String(p._id)); }
    });
    roster = { byId, kids, expiresAt: Date.now() + CACHE_MS };
    return roster;
};

// Everyone below `id` in the reporting line (not including `id`).
export const teamUnder = async (id) => {
    const { kids } = await loadRoster();
    const out = new Set();
    const stack = [...(kids.get(String(id)) || [])];
    while (stack.length) {
        const cur = stack.pop();
        if (out.has(cur) || cur === String(id)) continue;
        out.add(cur);
        (kids.get(cur) || []).forEach((k) => stack.push(k));
    }
    return out;
};

// Managers above `id`, nearest first.
export const chainAbove = async (id) => {
    const { byId } = await loadRoster();
    const out = [];
    let cur = byId.get(String(id))?.manager ? String(byId.get(String(id)).manager) : null;
    while (cur && byId.has(cur) && !out.includes(cur) && out.length < 15) {
        out.push(cur);
        cur = byId.get(cur).manager ? String(byId.get(cur).manager) : null;
    }
    return out;
};

// What the signed-in user may see.
//   firm    — everything, everyone
//   people  — everyone's HR records (attendance, leave, location)
//   finance — everyone's money records (expenses, loans, payroll)
//   team    — ids of everyone below them; direct — ids of direct reports
export const scopeOf = async (req) => {
    if (req._scope) return req._scope;
    const { byId } = await loadRoster();
    const meId = String(req.user.id);
    const me = byId.get(meId) || (await employeeModel.findById(meId).select("role designation manager").lean()) || {};
    const role = me.role || req.user.role;
    const reach = stepOf(me.designation)?.reach;
    const firm = role === "Admin" || reach === "firm";
    const team = await teamUnder(meId);
    const { kids } = await loadRoster();
    req._scope = {
        me: meId,
        role,
        designation: me.designation || "",
        firm,
        people: firm || role === "HR" || reach === "people",
        finance: firm || reach === "finance",
        team,
        direct: new Set(kids.get(meId) || []),
        leads: team.size > 0,
    };
    return req._scope;
};

// ids the user may see for a kind of record, or null for "everyone".
// kind: "people" (attendance, leave, location), "finance" (expenses, loans), "work" (tasks, projects, audits)
export const visibleIds = (scope, kind = "work") => {
    if (scope.firm || (kind === "people" && scope.people) || (kind === "finance" && scope.finance)) return null;
    return [scope.me, ...scope.team];
};

export const canSee = (scope, ownerId, kind = "work") => {
    const ids = visibleIds(scope, kind);
    return !ids || ids.includes(String(ownerId));
};

// Would making `managerId` the manager of `employeeId` create a loop?
export const wouldLoop = async (employeeId, managerId) => {
    if (!managerId) return false;
    if (String(employeeId) === String(managerId)) return true;
    return (await teamUnder(employeeId)).has(String(managerId));
};

// Projects / audits the user may see: firm-wide seniors see all; everyone else sees the ones
// they or anyone in their team leads or works on. Pass the field names for the record type.
export const workFilter = async (req, leadField = "projectManager", membersField = "teamMembers") => {
    const ids = visibleIds(await scopeOf(req), "work");
    if (!ids) return {};
    return { $or: [{ [leadField]: { $in: ids } }, { [membersField]: { $in: ids } }] };
};

// People someone may see in the directory and org chart. Firm-wide seniors, HR and Accounts see
// everyone; everyone else sees only their own team: the leads above them, themselves, everyone
// below them, and team mates under the same lead who don't run a team of their own. Other leads'
// teams (e.g. a fellow manager's) are never shown. null = everyone.
export const circleOf = async (scope) => {
    if (scope.firm || scope.people || scope.finance) return null;
    const { byId, kids } = await loadRoster();
    const out = new Set([scope.me, ...scope.team, ...(await chainAbove(scope.me))]);
    const m = byId.get(scope.me)?.manager ? String(byId.get(scope.me).manager) : null;
    if (m) (kids.get(m) || []).filter((id) => !(kids.get(id) || []).length).forEach((id) => out.add(id));
    return out;
};
