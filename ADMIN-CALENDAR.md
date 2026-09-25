# Admin calendar

## Open the calendar

The **Admin Calendar** button is available on the dashboard navigation and in Admin Tools / Super Admin. It appears only after the current admin's live access record is verified. Agents never receive the button or calendar subscriptions.

Superadmin opens **Admin Calendar > Manage access** and checks the admins who should have access. Every regular admin starts with access off. Granted admins can view, create, edit, delete, and receive calendar reminders. Only the master superadmin can change this calendar allowlist. This permission is independent of the other Admin Tools permissions.

Revoking access removes the button, closes and clears the calendar, unsubscribes from its data, and closes active calendar desktop notifications. There is no local permission fallback. Deleting the admin's directory record also removes calendar access.

## Features

- Month grid with Today, previous/next month and month picker.
- Click any date for its complete list; click an event to edit it.
- Day-off requests with inclusive start/end dates; planned lateness with required expected arrival time; early departures, appointments and general events.
- Requested, Approved, Planned, Declined and Cancelled statuses. Calendar entries do not automatically alter attendance or payroll.
- Overlapping plans for the same agent prompt a confirmation before saving.
- Optimistic transaction checks prevent one event editor from silently overwriting a newer edit. The most recent editor and update time are displayed.
- Team, event-type and text filters. Upcoming list for 14, 30 or 90 days, including ongoing multi-day events. Declined/cancelled entries remain visible in the calendar, but do not appear in upcoming items or reminders.
- Agent birthdays stored as month/day only. Annual recurrence, including upcoming birthdays across New Year. Feb 29 birthdays display on Feb 28 in non-leap years. Inactive/deleted/archived agents do not receive birthday events. Removing a birthday does not modify the agent profile.
- Eleven recurring U.S. federal holidays, actual dates and weekend-observed dates, including observations in the preceding/following year. These are planning references, not automatic business closures. Source: https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/ (checked September 25, 2026). Special one-off government closures and state-only holidays are not generated.

## Reminders

Event reminders can be set for the event time, 15 minutes, 1 hour, 1 day, 3 days or 1 week beforehand, or disabled. Events without a time use 9 AM Guyana time. Birthdays remind from 7 days before at 9 AM; holidays from 1 day before at 9 AM.

The inbox and dashboard badge show due reminders for all teams, independently of the calendar filters. Dismissal syncs in Firebase for that admin account, so another admin retains their own reminder. Editing an event creates a new reminder revision. Reminders remain available until the event's final day ends. On reopening the dashboard, still-relevant reminders are shown again unless dismissed.

**Desktop and voice reminders require the dashboard to stay open.** The browser must grant notification permission. Voice must be enabled per page session through its button. Background browser sleep can delay reminders; the app checks again when the page becomes visible. There is no service worker, server scheduler, email, WhatsApp, or closed-browser push delivery. Desktop notification repeats are suppressed per browser/account/occurrence. The in-app inbox is the authoritative reminder list.

Times and date boundaries use Guyana, UTC−4, with Firebase server time offset. Changes and reminder delivery pause while disconnected.

## Access boundary: required before using confidential records

This project's existing admin login stores its identity/role in browser session storage and verifies passwords against the RTDB directory. It does not establish a Firebase Auth identity for these admin sessions. The new calendar follows this existing application permission model and adds live permission checks before subscriptions and every edit.

**These are application-level access controls, not server-enforced privacy.** Hiding a button or checking browser session state cannot prevent direct Firebase requests when deployed database rules allow them. No deployed Firebase rules or credentials were included in the ZIP, so their protections could not be checked. This change does not weaken or replace database rules.

For confidential day-off reasons and birthdays, the deployment owner must first connect the admin login to Firebase Auth (or a trusted backend), issue trusted admin identities, and enforce the calendar allowlist in database rules or that backend. Ordinary admins must not be able to write their own grants or master-superadmin identity. Protect `admin_calendar` and the `calendarAccess` field in `admins_list`; only authorized admins should read/write events and birthdays, and each admin should write only their own reminder acknowledgements. Do not deploy permissive root reads/writes as a workaround. RTDB permissions granted at an ancestor cannot be removed by stricter child rules.

No live authentication, Firebase rules, or production data were changed by this ZIP. Database-level privacy setup remains a deployment prerequisite, not a feature this ZIP can establish by itself.

## Files and Firebase paths

New files: `js/admin-calendar-core.js`, `js/admin-calendar.js`, `css/admin-calendar.css`.
Updated entry points: `index.html`, `tabs/adminpanel.html`, `tabs/superadminpanel.html`.

- `admins_list/{existingAdminKey}/calendarAccess`: explicit boolean, default false.
- `admin_calendar/events/{pushId}`: events and last-editor metadata.
- `admin_calendar/birthdays/{agentId}`: month/day and editor metadata.
- `admin_calendar/reminder_ack/{hexAdminKey}/{hexOccurrenceKey}`: per-admin dismissals.
- Reads the existing `biz_master_roster` and master `super_admin` record.

Upload the whole project and hard-refresh the browser. New fragment version numbers avoid using the previous cached Admin Tools and Super Admin markup. Keep existing Firebase paths and permissions intact. This ZIP does not deploy the website.

## Validation

Tested using mocked Firebase data and a local headless browser: default denial, live grant and revocation, removal of calendar listeners after revocation, agent isolation, superadmin-only access UI, create/edit and stale-edit conflicts, leap-year birthdays, reminder dismissal, filters, desktop/mobile layouts, and holiday dates/year boundaries. These tests do not prove deployed Firebase database security or real operating-system background notification delivery.
