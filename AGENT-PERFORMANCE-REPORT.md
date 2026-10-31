# Agent Performance Report

Open **Admin Hub > Agent Report**. Upload the Guyana and Philippines Agent Status Details CSV exports. The report combines both locations and assigns agents to the location file they came from. An Agent Time Details CSV is optional. Add it to include customer talk time, combined breaks, bathroom duration, lunch, and call count cross-checks.

## Production pulse

The report summarizes agents in each export, calls, customer interactions (`CIcalls`), `XFER`, `DRXFER`, total leads (`XFER + DRXFER`), and lead rate. Optional location lead targets can be entered before or after report generation. Target attainment is left blank when no positive target is entered. The source CSVs do not provide sales targets, online status, or definitions for invalid/rejected outcomes, so the report does not infer those values.

## Agent report contents

- Calls and customer interactions from both Agent Status Details exports.
- Leads as `XFER + DRXFER`, with transfer counts shown separately.
- Each source disposition code, per agent and in total.
- Customer talk duration from the optional Time Details `CUSTOMER` field.
- Break and lunch durations compared with the configured allowances. Defaults are 10 minutes for the morning break, 10 minutes for the afternoon break, 20 minutes total, and 45 minutes for lunch.
- Bathroom duration from `BthRm`, totaled per agent and compared with the group average. The report can display an optional review limit when a company policy sets one. The export provides duration, not visit count. Above-average time is a prompt to review the record, not a conclusion about misuse.
- Charts for the top agents by leads and customer interactions, plus bathroom duration when Time Details is present.
- Excel sheets: Overview, Agent Performance, Call Outcomes, Outcome Totals, and Report Notes.
- PDF summary, location production pulse, charts, bathroom review, agent details, and non-zero call outcome codes.

## Pacific and Eastern time

The report reads a reporting window from the CSV footer when available, treats that window as Pacific time, and displays its Eastern equivalent. If no time range is present, it uses the date in the export filename. It also shows the 11:00 AM to 8:00 PM Eastern shift as its Pacific equivalent for that report date, including the date-specific daylight-saving offset.

The Time Details export contains elapsed values such as `LOGIN TIME`, `CUSTOMER`, `WAIT`, and `Break`. These durations are not converted between time zones. The current exports do not include clock-in or clock-out timestamps, so the report cannot verify an agent's exact start or finish time.

## Break, bathroom, and lunch interpretation

The CSV has one combined `Break` duration. It cannot show separate morning and afternoon break start times or confirm that each break was taken. The report compares combined duration with the two 10-minute allowances. Bathroom time remains separate. The optional bathroom review limit should only be entered when a company standard exists. A missing or short break/lunch duration asks a reviewer to check the source record; it does not prove that an agent missed a break or lunch.

## Data handling

The report reads selected files in the browser tab and does not write them to Firebase. The location is assigned from the Status Details file selected in the Guyana or Philippines upload field. Source group codes and disposition labels are preserved as provided. Duplicate IDs across the two Status Details files stop report generation so an agent is not counted twice. Optional Time Details rows are matched by numeric agent ID. Missing matches are shown as data checks.

## Installation

Deploy the complete project, including `css/agent-performance-report.css` and `js/agent-performance-report.js`, then hard-refresh the dashboard. Excel and PDF export use the project's bundled `js/vendor` files.
