# Agent time-off requests

## Agents

On the dashboard, use **Request time off / My requests** above the main navigation tabs.

1. Choose Day off, Late arrival, Early departure, Appointment, or Other request.
2. Select **Date** once. **Day off** needs only the date. **Late arrival** adds one **Expected arrival time** field, and **Early departure** adds one **Leaving time** field. Appointment and Other request support start/end hours on that date, or **All day**.
3. Write a reason and select **Send request**.
4. The request appears immediately on the admin calendar as **Pending approval**. The agent name and BB, PR, or RM team come from the current Firebase roster.
5. Check **My requests** for Approved, Declined, or Cancelled, the reviewing admin, and their reply. Decisions update live while the dashboard is open and remain available after refresh or the next login.

The dashboard shows pending requests, new decisions, and upcoming approved time off. Agents can cancel their own pending requests. Approved requests remain in the history; changes to approved leave should be arranged with an admin. No notification is sent outside the dashboard.

## Super Admin team access

Open **Super Admin > User Mgmt > Time-off request access**. Separate **Berbice**, **Providence**, and **Remote** switches control which agents can see and use the feature. All three teams are allowed by default when no saved setting exists. Each switch saves automatically, with Allowed/Hidden status and a visible error if a save fails.

Turning a team off hides its request button and dashboard notice, closes any open request window, and stops that agent's request subscription. Turning it on restores their saved request history. Agents use their current active Firebase roster team, not a cached session team. The dashboard waits for the roster and policy to sync before showing the feature and checks both again before a submission or cancellation. Unknown teams and failed permission reads are denied.

Disabling a team **does not delete or hide existing requests from authorized calendar admins**. Pending requests can still be reviewed, approved entries stay on their dates, and reminders continue. Admin viewing and review rights still follow the separate Calendar permission.

## Admins

Use **Time-off requests** on the dashboard or **Review time-off requests** inside **Admin Calendar**. The queue starts with pending requests from **all teams**, including Berbice (BB) and Providence (PR). Filter by team, status, name, ID, or reason when needed.

Select **Review request**, read the date, requested time and reason, optionally add a reply, then approve or decline. A reply is required when declining. The agent receives the status and reply in their dashboard automatically. Requests also appear directly in the calendar grid, selected-day list, upcoming list, reminders, and the new all-team **Pending agent requests** inbox. Click an agent request on the calendar to review it. Pending and approved requests have distinct calendar labels.

Approved requests remain on their calendar dates, including after refresh and after the date has passed. **Upcoming approved time off** lists all teams independently of the calendar filters, and the admin dashboard continues to show approved plans even when the pending queue is empty.

Approved requests remind admins at **9 AM Guyana time the day before**, then again **on the approved date**. Existing multi-day approvals receive a separate reminder on each approved date. Dismissing a reminder does not remove the calendar entry, and dismissing the day-before reminder does not dismiss the actual-day reminder. Desktop and voice reminders use the existing calendar controls and require the dashboard to remain open; the in-app reminders return when the dashboard is reopened on a relevant day.

This follows the existing **Calendar** permission. Superadmin can grant it through **Edit Admin > Admin Tools Access > Calendar**, or **Admin Calendar > Manage access**. An admin without that permission does not receive the request queue or request subscriptions. Revoking access closes the request window and removes its listeners. Permissions are not granted or broadened by this update.

## Dates, updates and conflicts

- All date/time fields use Guyana time (UTC−4), including agents whose computer is set to another timezone.
- New requests use one date. Late arrival stores the expected arrival time, and early departure stores the leaving time, each clearly labelled in the agent history, admin review and calendar. Existing requests with date/time ranges remain readable and keep their original values.
- Past dates/times, reversed time ranges, missing reasons, and overlapping pending/approved requests by the same agent are rejected. For overlap checks, late arrival covers the beginning of the day up to arrival and early departure covers leaving time onward. A late arrival and an early departure on the same day are allowed if they do not overlap.
- Firebase transactions prevent duplicate overlapping submissions and stale approvals. If two admins review the same request, the first committed decision wins. The other admin sees the latest result.
- Offline submissions and decisions are disabled. Failed saves retain the agent's input and show an error instead of reporting success.
- Requests are planning records. They do not automatically change attendance or payroll.

## Installation and data

Upload the whole updated project to the existing website, then hard-refresh the browser. New script version URLs are included in `index.html`. No live site, live Firebase records, or deployed rules were changed while preparing this ZIP.

Requests are stored at `admin_calendar/requests/{agentId}/{requestId}`. The existing calendar derives its request entries from that same record; it does not create a second event that could become out of sync. Existing calendar events and birthdays are preserved. An agent subscribes only to their own request branch; authorized calendar admins subscribe to the request queue for all teams. Decision acknowledgement is stored per agent in browser local storage; authoritative requests and replies are in Firebase.

Team access is stored at `settings/timeOffTeamAccess` as `{ teams: { BB: true, PR: true, RM: true }, updatedAt, updatedBy }`. Super Admin controls use the existing authoritative `super_admin` identity record, verify it live and again before a save, and use a transaction to preserve simultaneous changes to other teams. Regular admins cannot operate these controls. Deployed rules must allow signed-in agents to read the policy, reserve its writes for trusted Super Admin, and check the active roster team and enabled flag when allowing agent request reads/writes. These checks must keep authorized admin reads and reviews available for existing requests from disabled teams.

The existing login's session-storage access model and database-security limitation described in `ADMIN-CALENDAR.md` still apply. For server-enforced access, deployed Firebase Auth/rules or a trusted backend must limit agents to their own request branch, allow them to create only their own pending requests and cancel only their own pending requests, and reserve approval/decline fields and all-team reads for trusted calendar admins. Do not make the database public to enable this feature. This ZIP contains no deployed rules or trusted backend, so production permissions need to be checked by the deployment owner.

## Validation

`node tests/time-off-core.test.cjs` verifies team policy defaults and invalid values, dates/hours, required reasons, team normalization, overlapping ranges, ownership, cancellation, and stale review handling.

`node tests/time-off-browser.cjs` uses Playwright with a local in-memory Firebase substitute to exercise BB/PR/RM sessions, Super Admin team toggles, live revocation and authoritative roster changes, fresh pre-save checks, concurrent team edits, failed saves, preserved calendar entries, approval/decline replies, reminders, refresh, cancellation, duplicate prevention, offline gating, default denial, and narrow layouts. It does not connect to the production database. Supply Playwright through `NODE_PATH` if it is not installed locally. `TIMEOFF_CHROMIUM_PATH` can select an installed Chromium binary; `TIMEOFF_SCREENSHOT_DIR` optionally saves layout screenshots.
