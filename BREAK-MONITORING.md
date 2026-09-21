# Agent break monitoring

## Set up and use

1. Upload the updated project, including the new `js/break-core.js`, `js/breaks.js` and `css/breaks.css` files.
2. In Admin Tools > Profiles, edit an agent. Set a morning start time, afternoon start time and the duration in minutes for each, then save. Times use Guyana time. Blank times disable the corresponding break. Existing text break notes are preserved; they do not automatically create schedules.
3. Agents see a compact **My breaks** dropdown beneath their session details. It is closed by default; click to view the schedule and break buttons. A running or overdue countdown remains visible in its collapsed header. **Start break** becomes available from the scheduled time. The timer starts only after they click and Firebase accepts the change. Each slot can be used once per Guyana calendar day; an active break must be returned from before another starts.
4. Agents sign back into their calling system, then click **I’m back**. The app records the return; it does not control or verify the external phone-system login.
5. The live break monitor is located inside Admin Tools > Break Monitoring. Click **Enable voice alerts** in each open admin dashboard. When a timer expires, it displays an alert and says, for example: “Alice, your break time is up. Time to log in back.” Multiple names are queued. Dismissing an alert does not mark an agent back.
6. The admin monitor shows active and overdue timers, plus today's return times, elapsed time and overruns. Changing a profile's duration affects future breaks, not a break already running.

## Timing, refreshes and connectivity

Start and return timestamps are saved by Firebase. The countdown uses Firebase's server clock offset and absolute elapsed time, so refreshes, tab switching and a late timer callback do not restart a break. Transactions protect against double clicks and simultaneous sessions. Break controls pause when disconnected. Once the app reconnects or resumes, overdue breaks are detected again.

Visual and spoken alerts run in open dashboard pages. Closed browsers, sleeping devices and browser background throttling can delay or prevent immediate delivery. Voice requires browser speech support, enabled sound and a user click per loaded page. No background notification service or scheduled cloud function is included. All connected admin dashboards subscribe to the same break data; an admin opening later sees breaks that remain overdue. An agent stays overdue until they confirm return, even across midnight.

## Data and deployment checks

The existing app uses Firebase Realtime Database for its master roster and live features. Break schedules are saved on the existing profile in `agent_profiles`, on `biz_master_roster` roster entries, and through the existing Firestore profile mirror. Live break state is stored at `biz_agent_breaks/{fourDigitAgentId}` with `active` and `days/{YYYY-MM-DD}/{morning|afternoon}` records. Completed records older than 30 days are pruned when that agent next starts a break; this is a live monitor, not a permanent audit archive.

Production Firebase rules and credentials are not included in the project. Before rollout, verify that the existing authenticated admin sessions can read all break states and edit schedules, and that agents can read/transact only their own break state and cannot edit their schedules. This feature follows the application's existing session model. Browser role checks alone are not server-side authorization. Do not grant public database access to enable it. No live Firebase data or security rules were changed during development.

Test with two admin sessions and one agent in staging: save schedules, start a break, refresh, enable audio, let it expire, then confirm return. Confirm your deployed rules accept the new path and that audio works in the browsers you use.

## Local verification

Run `node tests/break-runtime.test.cjs` for simulated realtime subscriptions, two-admin visual/audio alerts, refresh restoration and offline gating. Run `node tests/break-core.test.cjs` for schedule, countdown, duplicate/overlapping break, day rollover and return calculations. The browser test `tests/break-ui.test.cjs` requires Playwright and Chromium; it uses an isolated fake database and speech API, never the production Firebase database.

Validation completed: JavaScript syntax, core tests and simulated runtime tests passed. A real browser test could not run in the development environment because Chromium was unavailable and its download timed out. Live Firebase rules, real browser speech and visual rendering must be checked in staging.

## Alerts while using another tab

Admins should click **Enable voice alerts** and **Enable browser notifications**, then choose Allow in the browser permission prompt. The dashboard remains subscribed and speaks agent names even when another app section or browser tab is selected. Desktop notifications include the agent name and “Time to log in back.” Clicking one focuses the dashboard. Notifications close when the agent records their return. A scheduled deadline check supplements the regular countdown check.

The dashboard tab must remain open, connected and not suspended. Operating-system notification settings, Do Not Disturb, muted audio, sleeping computers and browser tab suspension can suppress or delay notifications. This update does not include push notifications from a server for closed/suspended pages. Notification permission usually requires HTTPS or localhost.

The admin monitor is mounted only in Admin Tools > Break Monitoring. The agent break buttons remain on the agent dashboard. Monitoring, spoken reminders and browser notifications initialize globally and continue when Admin Tools is hidden or has not yet been opened. The embedded Admin Tools profile form includes both break schedules.

Profile editor fix: numeric and string agent IDs now match, cached forms gain missing break fields before opening/saving, and missing editors are loaded on demand. Verified with `node tests/profile-editor.test.cjs` using an isolated DOM/database simulation.

The Break Monitoring sub-tab lists each active agent with morning and afternoon schedule, allowed minutes, actual start/return, countdown or time used, overrun and status. Search by name, ID or team. Times are set through Profiles. The new sub-tab is available to existing admins with Admin Tools access unless their permission map explicitly disables breaks; it does not grant access to Admin Tools itself.

Admins can choose any valid time of day for either the morning or afternoon break. These are labels only, with no before-noon or after-noon restriction. Availability still begins at the chosen time, once per slot per day.

Break Monitoring includes All teams, Berbice (BB), Providence (PR) and Remote (RM) buttons. The selected team filters schedules, active-break cards, totals, overdue counts and today’s returns. Selection remains in place through live data updates. Voice and browser alerts still cover every team.

Admins with Profiles editing access can click Set breaks on either schedule row in Break Monitoring. The profile editor opens in place and focuses the selected break time. Save Profile updates the shared Firebase profile and roster, so both the monitor and agent dashboard receive the change live. Active breaks retain their original duration. Admins without Profiles access see View only.
