# QA reviews and invalid-call reporting

The Admin Tools QA tab supports manual call reviews and a shared invalid-call report. Review records are written to the Firebase Realtime Database path `qa_call_reviews`, so connected admins see updates in real time. The report can be filtered and exported as CSV.

The form saves the call date, selected agent, team, call number, customer number, outcome, findings, coaching notes, and reviewer. Call number and customer number appear in the invalid-call report and CSV export. Older records remain readable after the field names changed.

## Agent selector

The Agent list uses the active Firebase master roster (`biz_master_roster`). It loads the roster when QA opens and refreshes when agents are added, changed, or removed. If the list is empty, confirm that the active roster is populated and that Firebase is connected.

## AI draft review without audio

The QA form does not upload audio. To use AI-assisted review, paste a call transcript into the transcript box. Put each turn on its own line and include speaker labels and timestamps when available, for example:

    [00:12] Agent: Thank you for calling...
    [00:18] Customer: My business is...

The AI route uses timestamps from the pasted transcript when available; otherwise it points to the transcript line number. If the transcript does not identify the agent speaker or the evidence cannot be verified, it downgrades the suggestion to `Pending`. An admin still selects and saves the final outcome. The transcript is sent to the configured review service for analysis, but is not saved with the QA record. Do not paste private details that are not needed for the review.

The current invalid-call categories are `Under $200k revenue`, `Trucking`, `Attorney`, `No qualified call`, `Unqualified business`, `Other`, and `Unclear audio`. Since the app does not contain a full written qualification policy, unclear or policy-dependent cases should remain `Pending`; update these categories and their definitions if the business rules change.

### Configure server secrets

Run this app through Node.js 18 or newer using `node js/server.js`, on the same host as the dashboard. Serve the dashboard over HTTPS.

Set these values in the host's private environment/secrets settings:

- `OPENAI_API_KEY`: a server-side API key used for text review requests.
- `QA_REVIEW_ACCESS_TOKEN`: a random private access code of at least 32 characters. Give it only to QA reviewers who are allowed to use AI review.
- `QA_REVIEW_MODEL` (optional): defaults to `gpt-5-mini` for the transcript review.

Generate an access code with:

    node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))'

Keep the generated access code and provider key out of source code, the browser bundle, and shared repository files. Each reviewer enters the access code in the QA tab; it stays in that browser page's memory and is never saved with the review.

The tab checks `/api/qa/review/status` and reports whether the route and server settings are available. If that route returns 404, the deployed host is serving only static files; run the dashboard through `js/server.js` or configure the host's equivalent server-side route.

When the reviewer presses **Generate AI draft review**, only the pasted transcript is sent through the server to the review provider. Provider data handling and retention depend on your organization's OpenAI API settings. The text review request sets `store: false`; this does not replace your organization's review of its provider data controls.

- [Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs)
- [GPT-5 Mini model page](https://developers.openai.com/api/docs/models/gpt-5-mini)
- [API data controls](https://developers.openai.com/api/docs/guides/your-data)

## Access to the QA tab

Super Admins have access to the QA tab. They can grant it to a regular admin from Manage Admins under the Admin Tools permissions. New regular admin records default to no QA access.

The existing custom admin login stores its session in browser storage. The AI route therefore requires the separate server-side `QA_REVIEW_ACCESS_TOKEN`; the browser's QA navigation permission is not itself server authentication. Matching Firebase rules should also be configured for the QA data path before storing real call reviews.
