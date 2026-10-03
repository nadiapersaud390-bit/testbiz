# Call Quality Assurance and Reporting

The Admin Tools QA tab is a manual call review and coaching workspace. It stores completed reports in Firebase Realtime Database at qa_call_reviews, where authorized admins can review the same records.

## Complete a call report

1. Select the agent and confirm the team and call date.
2. Add the call type, Call Number, Customer Number, and loan specialist when applicable.
3. Set the final outcome to Valid, Invalid, or Pending. An invalid call requires a primary reason.
4. Rate the applicable agent and loan specialist standards. Choose Not applicable when a standard did not apply. Not applicable items are excluded from the QA score.
5. Record the finding and call evidence, what went well, one practical coaching tip, and the agreed action plan.
6. Mark whether coaching follow-up is required and set a follow-up date when needed, then save the report.

The score is the percentage of rated standards marked Meets standard. Needs coaching ratings remain in the denominator; blank and Not applicable ratings do not.

## Reasons and issue source

If the customer requests removal or reports annual revenue under $200,000, stop qualification and do not transfer. Invalid-call reasons include Under $200k revenue, Trucking, Attorney / Legal, No qualified call, Unqualified business, DNC / Removal Request, Prank / Not Serious, Partner Call, Other, Unclear audio, and Unclear / Incomplete Record. A second issue can be recorded as the additional reason. A call appears once in total call counts even when it has two reasons.

Issue source identifies whether the issue came from the agent, loan specialist, both, lead data, a process or system, the caller or partner, or an unclear source. This helps separate agent coaching from other operational issues.

## Call QA report

The report includes call counts for Valid, Invalid, and Pending outcomes, coaching follow-ups, top invalid reason, and average QA score. Pending reviews are excluded from the Calls reviewed total. Use the date, team, outcome, reason, source, and agent filters to focus the report.

Use Print on a report row to open a formatted call review with call details, scorecard ratings, findings, strengths, coaching, action plan, and reviewer. Use Print Report to print the filtered report, or Export CSV to download the filtered call rows and rating details.

## Agent selector and access

The Agent list uses the active Firebase master roster (biz_master_roster). It loads when QA opens and refreshes when agents are added, changed, or removed. Super Admins can grant regular admins access to QA under Manage Admins. Matching Firebase rules must allow authorized reviewers to read and write qa_call_reviews.

Call and customer numbers can be sensitive. Limit report access to authorized reviewers and store the Firebase data according to your organization’s retention rules.
