# Call Quality Assurance and Reporting

The Admin Tools QA tab is a manual call review and coaching workspace. It stores completed reports in Firebase Realtime Database at qa_call_reviews, where authorized admins can review the same records.

## Complete a call report

1. Enter the agent, team, call date, Call Number, Customer Number, and final outcome.
2. For an Invalid outcome, choose the primary reason and issue source, then document the finding and call evidence. An additional reason is optional.
3. Use **Add a report section** only for details that apply: call handling details, an agent or loan specialist scorecard, strengths, a coaching plan, or reviewer notes. Sections can be removed before saving.
4. If a scorecard rating is marked Needs coaching, the form adds the coaching plan section and requires a practical tip and action plan before saving.
5. Save the report. The form clears optional sections for the next call.

The score is the percentage of rated standards marked Meets standard. Needs coaching ratings remain in the denominator; blank and Not applicable ratings do not.

## Reasons and issue source

If the customer requests removal or reports annual revenue under $200,000, stop qualification and do not transfer. Invalid-call reasons include Under $200k revenue, Trucking, Attorney / Legal, No qualified call, Unqualified business, DNC / Removal Request, Prank / Not Serious, Partner Call, Other, Unclear audio, and Unclear / Incomplete Record. A second issue can be recorded as the additional reason. A call appears once in total call counts even when it has two reasons.

Issue source identifies whether the issue came from the agent, loan specialist, both, lead data, a process or system, the caller or partner, or an unclear source. This helps separate agent coaching from other operational issues.

## Call QA report

The report summarizes calls reviewed, Valid, Invalid, Pending, and the top invalid reason. Pending reviews are excluded from the Calls reviewed total. Individual call scores and coaching details appear where reviewers added them. Use the date, team, outcome, reason, source, and agent filters to focus the report.

Use Print on a report row to open a formatted call review with call details, scorecard ratings, findings, strengths, coaching, action plan, and reviewer. Use Print Report to print the filtered report, or Export CSV to download the filtered call rows and rating details.

## Agent selector and access

The Agent list uses the active Firebase master roster (biz_master_roster). It loads when QA opens and refreshes when agents are added, changed, or removed. Super Admins can grant regular admins access to QA under Manage Admins. Matching Firebase rules must allow authorized reviewers to read and write qa_call_reviews.

Call and customer numbers can be sensitive. Limit report access to authorized reviewers and store the Firebase data according to your organization’s retention rules.
