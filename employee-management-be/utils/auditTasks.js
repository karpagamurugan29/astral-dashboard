/* ---------------------------------------------------------------------------
   Audit task lifecycle — pure rules, no database access (unit-tested in tests/).

   Not Started ─assign→ Assigned ─prerequisites met→ Ready ─start→ In Progress
   In Progress ⇄ Blocked (reason)
   In Progress ─submit→ Submitted ─start review→ Under Review ─approve→ Approved
                                    └──────── request changes (comment) → Changes Requested → In Progress …
   In Progress ─complete→ Completed            (tasks that don't need review)
   Approved / Completed ─reopen (reason, manager)→ In Progress
   any open ─cancel (reason, manager)→ Cancelled ─restore→ Not Started / Assigned

   Who: the assignee works the task; the reviewer (or, if none is set, the engagement's manager)
   reviews it; nobody approves their own work; managers can do anything with a reason on record.
   --------------------------------------------------------------------------- */

export const DONE = ["Approved", "Completed"];
export const SATISFIED = [...DONE, "Cancelled"]; // a cancelled prerequisite no longer blocks
export const OPEN = ["Not Started", "Assigned", "Ready", "In Progress", "Blocked", "Submitted", "Under Review", "Changes Requested"];
export const AUTO_KEYS = ["invoice", "payment"]; // ticked by billing, never by hand

const idStr = (v) => (v?._id ?? v)?.toString?.() ?? null;

export const depsMet = (task, tasks) => (task.dependsOn || []).every((k) => {
    const d = tasks.find((t) => t.key === k);
    return !d || SATISFIED.includes(d.status);
});
export const unmetDeps = (task, tasks) => (task.dependsOn || []).map((k) => tasks.find((t) => t.key === k)).filter((d) => d && !SATISFIED.includes(d.status));

// Bring older tasks (a plain done tick) into the lifecycle, and keep Assigned / Ready honest.
export const normalizeTasks = (tasks) => {
    let changed = false;
    for (const t of tasks) {
        const before = t.status;
        if (!t.status) t.status = "Not Started";
        // older tasks predate these fields
        if (!t.priority) { t.priority = "Medium"; changed = true; }
        if (t.mandatory === undefined) t.mandatory = true;
        if (!t.dependsOn) t.dependsOn = [];
        if (t.done && !DONE.includes(t.status) && t.status !== "Cancelled") t.status = "Completed";
        if (["Not Started", "Assigned", "Ready"].includes(t.status)) {
            t.status = !t.assignee ? "Not Started" : depsMet(t, tasks) ? "Ready" : "Assigned";
        }
        const done = DONE.includes(t.status);
        if (t.done !== done) { t.done = done; changed = true; }
        if (before !== t.status) changed = true;
    }
    return changed;
};

// The viewer's relation to a task
export const roleFor = (task, access) => ({
    manage: !!access.manage,
    assignee: idStr(task.assignee) === access.me,
    reviewer: task.reviewer ? idStr(task.reviewer) === access.me : !!access.manage,
    member: !!access.member || !!access.manage,
});

// Every action, with who may take it and what it needs
const ACTIONS = {
    start: { to: "In Progress", label: "Start", from: ["Not Started", "Assigned", "Ready"], who: (r, t) => r.assignee || r.manage || (r.member && !t.assignee) },
    resume: { to: "In Progress", label: "Resume work", from: ["Changes Requested"], who: (r) => r.assignee || r.manage },
    block: { to: "Blocked", label: "Mark blocked", from: ["Ready", "Assigned", "In Progress"], who: (r) => r.assignee || r.manage, needs: "What is blocking it?" },
    unblock: { to: "In Progress", label: "Unblock", from: ["Blocked"], who: (r) => r.assignee || r.manage },
    submit: { to: "Submitted", label: "Submit for review", from: ["In Progress"], who: (r) => r.assignee || r.manage, review: true },
    complete: { to: "Completed", label: "Mark complete", from: ["In Progress"], who: (r) => r.assignee || r.manage, review: false },
    startReview: { to: "Under Review", label: "Start review", from: ["Submitted"], who: (r) => r.reviewer || r.manage },
    requestChanges: { to: "Changes Requested", label: "Request changes", from: ["Submitted", "Under Review"], who: (r) => r.reviewer || r.manage, needs: "What needs to change?" },
    approve: { to: "Approved", label: "Approve", from: ["Submitted", "Under Review"], who: (r) => r.reviewer || r.manage },
    reopen: { to: "In Progress", label: "Reopen", from: ["Approved", "Completed"], who: (r) => r.manage, needs: "Why reopen it?" },
    cancel: { to: "Cancelled", label: "Cancel task", from: OPEN, who: (r) => r.manage, needs: "Why is this task not needed?" },
    restore: { to: "Not Started", label: "Restore", from: ["Cancelled"], who: (r) => r.manage },
};

// Actions this viewer may take now: [{ action, label, to, needs?, warn? }]
export const allowedActions = (task, tasks, access) => {
    if (AUTO_KEYS.includes(task.key)) return [];
    const r = roleFor(task, access);
    const out = [];
    for (const [action, a] of Object.entries(ACTIONS)) {
        if (!a.from.includes(task.status)) continue;
        if (a.review === true && !task.requiresReview) continue;
        if (a.review === false && task.requiresReview) continue;
        if (!a.who(r, task)) continue;
        // nobody approves (or reviews) their own work
        if (["approve", "requestChanges", "startReview"].includes(action) && r.assignee) continue;
        const item = { action, label: a.label, to: a.to, ...(a.needs ? { needs: a.needs } : {}) };
        if (action === "start" && !depsMet(task, tasks)) {
            if (!r.manage) continue; // only a manager can override prerequisites, with a reason
            Object.assign(item, { label: "Start anyway", needs: "Prerequisites aren't done — reason for starting now", override: true });
        }
        out.push(item);
    }
    return out;
};

// Validate a transition; returns { to, error? }
export const checkTransition = (task, tasks, access, action, { note = "", override = false } = {}) => {
    const a = ACTIONS[action];
    if (!a) return { error: "Unknown action." };
    if (AUTO_KEYS.includes(task.key)) return { error: "Billing steps are recorded automatically when the invoice is issued and paid." };
    const allowed = allowedActions(task, tasks, access).find((x) => x.action === action);
    if (!allowed) {
        if (action === "start" && !depsMet(task, tasks)) return { error: `Waiting on: ${unmetDeps(task, tasks).map((d) => d.label).join(", ")}.` };
        return { error: `You can't ${a.label.toLowerCase()} a task that is ${task.status}.` };
    }
    if ((allowed.needs || allowed.override) && !String(note).trim()) return { error: `${allowed.needs} is required.` };
    if (allowed.override && !override) return { error: "Confirm the override to start before prerequisites are done." };
    if (["submit", "complete"].includes(action)) {
        if (task.requiresEvidence && !(task.attachments || []).length) return { error: "Attach the workpaper / evidence before submitting." };
        const open = (task.checklist || []).filter((c) => !c.done);
        if (open.length) return { error: `Finish the checklist first (${open.length} item${open.length === 1 ? "" : "s"} open).` };
    }
    return { to: a.to };
};

// Apply it to the task (in place) and return the history entry
export const applyTransition = (task, action, { by, note = "", now = new Date() } = {}) => {
    const from = task.status;
    const to = ACTIONS[action].to;
    task.status = to;
    if (action === "start" || action === "resume" || action === "unblock") task.startedAt = task.startedAt || now;
    if (action === "block") task.blockedReason = note;
    if (action === "unblock") task.blockedReason = "";
    if (action === "submit") { task.submittedAt = now; task.firstSubmittedAt = task.firstSubmittedAt || now; }
    if (action === "requestChanges") task.reviewCycles = (task.reviewCycles || 0) + 1;
    if (action === "approve" || action === "complete") { task.approvedAt = now; task.approvedBy = by; task.doneAt = now; task.doneBy = by; }
    if (action === "reopen") { task.approvedAt = null; task.approvedBy = null; task.doneAt = null; task.doneBy = null; }
    if (action === "start" && note) task.overrideNote = note;
    if (action === "restore") task.status = task.assignee ? "Assigned" : "Not Started";
    task.done = DONE.includes(task.status);
    return { at: now, by, action, from, to: task.status, note };
};

// Engagement completion: every mandatory, non-cancelled task outside billing must be done
export const completionBlockers = (tasks) => tasks.filter((t) => t.stage !== "Billing" && (t.mandatory !== false) && !t.optional && !SATISFIED.includes(t.status));

// would adding these dependencies create a loop?
export const hasCycle = (tasks) => {
    const by = new Map(tasks.map((t) => [t.key, t.dependsOn || []]));
    const state = new Map();
    const visit = (k) => {
        if (state.get(k) === 1) return true;
        if (state.get(k) === 2) return false;
        state.set(k, 1);
        for (const d of by.get(k) || []) if (by.has(d) && visit(d)) return true;
        state.set(k, 2);
        return false;
    };
    return tasks.some((t) => visit(t.key));
};
