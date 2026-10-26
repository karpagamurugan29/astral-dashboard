# Audit Management System — assessment and workflow enhancement

Audience: engineers and engagement leads working on the Astral audit module.
Status: implemented on the working tree (not yet committed). Test results are at the end.

## 1. What existed (assessed before any change)

| Area | What was there |
|---|---|
| Company | `AuditClients` (client company) with code, GSTIN/PAN, state. |
| Engagement | `AuditEngagements`: client, type, FY, manager, team, dates, estimate, fee, status (Planning → Fieldwork → Review → Reporting → Completed / On Hold / Cancelled), charges, a fixed 17-step checklist (`milestones`: tick = done). |
| Time | `AuditTimeLog`: one timer per person (start/stop with location), auto-stop at 7 PM / 10 h / check-out, `needsReview` flag for long or auto-stopped sessions, manager review (approve / adjust / non-billable), time tagged to a checklist step. |
| Billing | Charges (fixed, hourly, retainer, per visit, milestone, expenses), monthly bill preparation, GST invoices, payments. |
| Access | `authorize(module, roles)` middleware + reporting-tree scope (`utils/hierarchy.js`). Admin/HR saw every engagement; others saw their team's. |
| Tests | None in the backend; `react-scripts test` in the frontend with no tests. |

## 2. Verification of the existing flow — findings

An API run through the live flow (client → engagement → workflow → timer → review → permissions) gave **20 pass / 14 fail**.

### Broken (fixed)
1. **Stopped timers recorded 0 minutes.** `stopAuditTimer` set `endTime` and then called `minutesOf()`, which returns the stored duration (0) once `endTime` is set. Archiving an audit and removing a member had the same bug. No real data was affected; the only 0-minute sessions in the database really were under a minute.
2. **Any team lead could edit, re-staff, archive or complete any engagement.** Routes only checked the role (`adminHRManager`), not whether the person had anything to do with the engagement.
3. **Engagements could be completed with 0 of 17 steps done.**
4. **End date before start date was accepted.**
5. **Team leads could create client companies.**
6. **HR staff saw every engagement, every time entry and could change billable status of audit time.**
7. **Approved time could be re-edited without a reason.**
8. **Workpaper attachment schema bug** (found while building tasks): a field named `type` inside the array made every element a string, so any save after an upload failed.

### Gaps (now built)
- No project level between company and engagement.
- No task lifecycle (assignment, start, block, submit, review, changes, approval), no reviewer, no dependencies, no task history, comments or workpapers.
- No workflow templates or versions; the "standard" was a hard-coded list.
- No manual time entry, no timesheet submission / approval, no correction trail.
- No My Work, work allocation, management dashboard or productivity analytics.
- No reminders or escalation for task deadlines; no timesheet reminders.

### Data quality observations (not changed)
- One person-day in the demo data has **30 hours** logged (5 overlapping demo sessions across engagements on 21 Oct, Pooja Iyer). The new 16 h/day check refuses further time that day; the record itself was left as is.
- Several demo employees share 1 January as birth date (seed default).

## 3. Role → permission matrix (as now enforced on the backend)

Full access = every engagement: view, manage, configure workflow, assign, review/approve tasks, approve time, templates, dashboard, allocation. **By the firm's decision, the HR Head and Accounts/Finance Head have full access**, alongside Admin and firm-wide leadership.

| Who (designation / role) | Engagements visible | Manage engagement & team | Configure workflow | Templates (create/version/activate) | Review & approve tasks | Approve timesheets | Workpapers & review comments | Fees / economics | Dashboard | Allocation |
|---|---|---|---|---|---|---|---|---|---|---|
| Admin · Company Partner · Director | All | All | All | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Senior Manager (firm-wide) | All | All | All | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| HR Head · Accounts / Finance Head | All | All | All | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Manager | Theirs + team's | Own engagements / projects | Own | View | Own engagements | Own engagements | Own + team's | No | Own scope | Own scope |
| Project manager / partner | Project's | Project's | Project's | View | Project's | Project's | Project's | — | Project's | Project's |
| Senior Consultant · Consultant (leading juniors) | Theirs + reports' | No | No | No | As named reviewer | No | Theirs + reports' | No | No | No |
| Junior Consultant · Associate | Assigned | No | No | No | No (never own work) | No | Assigned | No | No | No |
| Accounts staff | All (for billing) | No | No | No | No | No | **No** | Yes | Yes | No |
| HR staff (below HR Head) | Only if on the team | No | No | No | No | No | Only if on the team | No | No | No |

Rules that apply to everyone:
- Nobody approves their own task or their own correction.
- Reviewers must be someone other than the assignee.
- Only managers / full access can override task prerequisites, and a reason is required and logged.
- Every check is on the API. The sidebar only mirrors it.

Code: `employee-management-be/utils/auditAccess.js` (single source).

## 4. The model

```
Company (AuditClients)
 └─ Audit project (AuditProjects)            budget hours / fee, manager, partner, deadline
     └─ Engagement (AuditEngagements)        workflowTemplate {id, family, version}, stages
         └─ Tasks (milestones[])             status, assignee, reviewer, dependsOn, due, estimate,
             │                               instructions, deliverables, checklist, evidence rule,
             │                               comments, workpapers (GridFS, versioned), history
             └─ Time entries (AuditTimeLog)  timer or manual, workDate, task, status Draft→Submitted→Approved/Rejected,
                                             adjustments[] (requested / applied / declined, with reason)
Workflow templates (WorkflowTemplates)       family + version, status Draft / Active / Inactive, scope
```

### Task statuses and transitions (`utils/auditTasks.js`)
- Not Started → Assigned → Ready (prerequisites met) → In Progress.
- In Progress ⇄ Blocked. Blocking needs a reason; the manager is notified, and again after 2 days.
- In Progress → Submitted → Under Review → Approved. Changes Requested (comment required) → In Progress → …
- In Progress → Completed, for tasks that don't need review.
- Approved / Completed → In Progress via reopen (manager, reason).
- Any open task → Cancelled (manager, reason) → restore.
- Submit / complete require evidence when the task demands it and every checklist item ticked.
- Engagement completion requires all mandatory tasks outside Billing to be done or cancelled. Full-access users may override with a reason, which is recorded on the engagement and in the audit log.
- Invoice / payment steps are set only by billing.

### Templates and versions
- The firm standard is seeded with prerequisites, review and evidence rules, responsible / reviewer roles, estimates and target days.
- A new engagement uses the most specific active template: project → company → audit type → firm standard (or the one picked in the form).
- Tasks are matched to the team by designation when exactly one person fits.
- Active versions are read-only. Changes go into a new draft version, which is then activated.
- Running engagements never change silently. Their manager previews and applies a migration that:
  - adds new tasks;
  - updates only not-started ones;
  - retires not-started removed tasks as Cancelled;
  - keeps everything that has started.

### Time
- Both the timer and manual entries are supported.
- A manual entry checks:
  - no future dates;
  - no overlap with other entries;
  - at most 16 h per day;
  - a description is required;
  - it must be on an engagement you're assigned to.
- **Weekly flow:**
  - The employee submits the week, and submitted time is locked.
  - The engagement manager (or a full-access user) approves the time or returns it with a comment.
  - Approved time changes only through a correction: the employee asks with a reason and the manager applies or declines it.
  - Billed time can't change.
- **Integrations:**
  - Attendance hours are shown next to logged time for comparison and never counted as project time.
  - Billing now bills only approved time and warns about the rest.

## 5. Implementation order (priority) and status

| # | Item | Status |
|---|---|---|
| P0 | Fix 0-minute timers, engagement-scoped edit rights, HR isolation, date / team validation, completion gate, approved-time protection, attachment schema | Done |
| P1 | Task lifecycle, review, prerequisites, history, comments, workpapers; task drawer UI | Done |
| P2 | Timesheets: manual entry, weekly submit / approve / return, corrections; Timesheets page | Done |
| P3 | Versioned workflow templates, library and editor (drag-and-drop), controlled migration | Done |
| P4 | Company → Project → Engagement; project list / detail; project & template pickers on create | Done |
| P5 | My Work; Work allocation (capacity, leave, cross-engagement load, reassign) | Done |
| P6 | Management dashboard + productivity analytics with formulas on screen | Done |
| P7 | Reminders and escalation (due soon, overdue, blocked, timesheet nudges), de-duplicated | Done |
| P8 | Automated tests (unit + API integration) | Done |
| Next | See section 8 | Open |

## 6. Changes

### Backend (`employee-management-be/`)
- **New**
  - `utils/auditAccess.js`: access rules.
  - `utils/auditTasks.js`: lifecycle rules (pure).
  - `utils/workflowTemplates.js`: seed, pick, instantiate, migration plan.
  - `utils/auditJobs.js`: reminders and escalation.
  - `models/auditProjectModel.js`, `models/workflowTemplateModel.js`.
  - `controller/auditTask.controller.js`, `timesheet.controller.js`, `workflowTemplate.controller.js`, `auditProject.controller.js`, `auditWork.controller.js` (My Work, allocation, dashboard).
  - `scripts/demoWorkflow.js`: demo data, re-runnable.
  - `tests/auditTasks.test.js`, `tests/auditFlow.integration.test.js`.
- **Changed**
  - `controller/auditEngagement.controller.js`: rewritten on the shared access rules.
  - `auditWorkflow.controller.js`: full task fields, publish as a template version, migration.
  - `billing.controller.js`: approved-time billing, review rules; the old `setMilestone` was removed and replaced by the task lifecycle.
  - `auditClient.controller.js`, `auditInsights.controller.js`: visibility.
  - `models/auditEngagementModel.js` (task sub-schema, project, template, completion override), `models/auditTimeLogModel.js` (timesheet fields).
  - `routes/routes.js`, `index.js` (reminder job), `package.json` (`npm test`).

### New API
- **Tasks**
  - `POST /audits/:id/tasks/:key/action`
  - `PUT /audits/:id/tasks/:key/assign`
  - `PUT …/checklist/:i`
  - `POST …/comments`, `PUT …/comments/:cid/resolve`
  - `POST …/files`, `GET …/files/:fileId`
  - `GET|POST /audits/:id/workflow/migrate`
- **Timesheets**
  - `GET /timesheets/me`
  - `POST|PUT|DELETE /timesheets/entries[/:id]`
  - `POST /timesheets/submit`
  - `GET /timesheets/approvals`, `POST /timesheets/decide`
  - `GET /timesheets/adjustments`, `POST /timesheets/entries/:id/adjustments[/:aid]`
- **Templates:** `GET|POST /workflow-templates`, `GET|PUT /workflow-templates/:id`, `POST …/:id/version|duplicate|activate|deactivate`.
- **Projects:** `GET|POST /audit-projects`, `GET|PUT|DELETE /audit-projects/:id`.
- **Work:** `GET /audit-work/me`, `/audit-work/allocation`, `/audit-work/dashboard`.
- **Kept, now lifecycle-aware:** `PUT /audits/:id/milestones/:key`, the old one-click tick.

### Data migration
All migrations are backward-compatible and run automatically. No data was deleted or reset.
- Old ticks become Completed, assigned tasks Assigned / Ready, and missing fields get defaults. This happens on first read.
- Time entries without a status get a work date: entries before this week become Approved, this week's become Draft.
- The firm-standard template is seeded once. Any per-type standard saved earlier becomes a template.

### Frontend (`employee-management-fe/src/`)
- **New**
  - `components/audits/TaskUI.js` (+ `TaskUI.css`): task pill and drawer.
  - `components/audits/WorkflowEditor.js` (+ `WorkflowEditor.css`): shared editor with drag-and-drop.
  - `pages/dashboard/audits/MyWork.js`, `Timesheets.js`, `WorkAllocation.js`, `AuditDashboard.js`, `AuditProjects.js`, `WorkflowTemplates.js`, `AuditOps.css`.
- **Changed**
  - `AuditDetail.js`: task drawer, template update banner, completion override, phone timer at the top.
  - `AuditsList.js`: project and template pickers.
  - `App.js`, `Sidebar.js`: Audit Dashboard, My Work, Timesheets, Engagements, Projects, Clients, Work Allocation, Workflow Templates.

## 7. Productivity metrics — how they are calculated
Shown on the dashboard under "How these are calculated":
- **Utilization** = hours logged ÷ capacity. Capacity = working days − approved leave, × 8 h (`WORK_HOURS_PER_DAY`).
- **Billable utilization** = billable hours ÷ capacity. Only for people who can see fees.
- **On time** = tasks completed by their due date ÷ tasks completed.
- **Estimate accuracy** = estimated ÷ actual hours on completed tasks.
- **First-time approval** = reviewed tasks approved with no change request ÷ reviewed tasks.
- **Rework** = hours logged on a task after its first submission, for tasks that had changes requested.
- **Review turnaround** = average hours from submission to approval, per reviewer.
- **At risk** means any of:
  - elapsed time is 20+ points ahead of progress;
  - 90%+ of budgeted hours are used with under 75% of tasks done;
  - there are overdue tasks within a week of the deadline;
  - the engagement is past its deadline.

These are presented as decision support, not rankings. Rows with little data are marked "limited data".

## 8. Remaining issues and recommendations
1. **Restart the backend** on the main server (`npm run dev`) to load the new code.
2. **Deploy notes:**
   - Vercel now has two crons (7 PM audit timers, 8 PM auto check-out), the Hobby plan limit.
   - The hourly audit reminder job runs only in a long-running server. If Vercel is the production host, add a cron route for it.
3. **Speed:** dashboard calls take about 2 seconds from this machine, which is about 8 round trips × 250 ms to the hosted database. On a server near the database it should be well under a second. If it isn't, add an aggregation cache or indexes on `audittimelogs (auditId, milestoneKey, employeeId)` and `(employeeId, workDate)`.
4. **Workpaper storage:** workpapers are stored in GridFS with no virus scanning or retention policy. Consider both.
5. **Configurable statuses:** the task status names are fixed in code. Making them configurable per template would need UI labels and transition tables in the template.
6. **Cross-company assignment** is allowed for anyone a manager can assign. There is no separate "authorized companies" list per employee; add one if certain staff must never work for certain clients (conflict-of-interest).
7. **Capacity** assumes Mon–Fri × 8 h and does not read company holidays or part-time schedules yet.
8. **Frontend tests:** there are none. The flows are covered by the API integration suite and the browser checks listed below.

## 9. Tests and verification
- **Unit tests** (`npm test`): 12/12 pass.
- **API integration** (`API_URL=http://localhost:5000/api npm test`): 10/10 scenarios pass. They cover:
  - companies and projects;
  - template generation;
  - isolation across 12 roles;
  - the full task review cycle with history;
  - reassignment;
  - the completion gate;
  - timer durations;
  - manual-entry validation;
  - timesheet submit / approve / lock / correction;
  - My Work / allocation / dashboard figures;
  - template versioning and controlled migration.

  The tests create `[QA]` records and remove them. Test tokens are signed locally; no passwords are used.
- **Original flow re-run:** 30 pass. The other 4 are the new rules correctly refusing what the old test did: a reviewer equal to the assignee, starting before prerequisites, a day over 16 h in demo data, and the submit that depends on it.
- **Browser checks** (desktop 1440 px and phone 390 px):
  - every new page renders with no client errors;
  - HR staff see no engagements;
  - the HR Head sees everything;
  - a consultant is refused allocation;
  - the phone timer sits above the content;
  - no horizontal scroll.
