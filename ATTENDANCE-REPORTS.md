# Attendance reports

Open **Admin Hub > Attendance** (or the Super Admin Attendance Hub) and select **Attendance Reports · Excel & PDF**.

1. Choose this month, last month, this week, this year, all recorded history, or custom dates.
2. Choose all teams or one team, then Everyone or one employee.
3. Select **Generate report**. Click an employee's name to view their individual report.
4. Use **Download Excel** or **Download PDF**. Use **Refresh data** after attendance is edited elsewhere.

## Included

- Overall, team and individual summaries, including employees with no records and historical employees whose saved records remain available.
- Present, Late, Absent, Training, Personal Out, Vacation, Sick, Off, Holiday and unknown status totals.
- Attendance and punctuality percentages, dated absences and lateness, clock-in times, notes, and recorded editor details.
- Status chart and daily attendance graph.
- Excel workbook: Overview, Employee Summary, Attendance History, Absences and Lateness, Daily Trend, Status Totals and Report Notes. Includes frozen headings, filters, numeric counts and percentage formatting. Overview charts are snapshot images; their values are included in the data sheets.
- Landscape PDF with overview charts, employee summary, leave summary, absences/lateness, complete history and page numbers.
- Searchable, paginated history preview. Search affects the preview only; downloads contain the full selected report.

## Calculation rules

Attendance rate = (Present + Late + Training) / (Present + Late + Training + Absent).

Punctuality = Present / (Present + Late).

Leave, Personal Out, Off, Holiday and unknown statuses are reported separately and excluded from these two rates. A zero denominator produces N/A (blank in numeric Excel cells).

Only saved attendance records are counted. Missing records are **not** confirmed absences. The existing daily attendance screen may display an unsaved missing record as Absent; reporting deliberately does not convert that default into a confirmed absence. Record or correct the status in Attendance before relying on it in a report.

Weekends are included when records exist. Dates use Guyana time. Future date ranges are rejected. Times late count the saved Late status; minutes late and total hours worked are unavailable because reliable scheduled start and clock-out data are not supplied. Team membership uses the saved record team, with the current roster as fallback. Records deleted from Firebase cannot be reconstructed. Last-edited fields are not a full audit log.

## Installation

Deploy the complete updated project, including the new CSS, reporting JavaScript, and `js/vendor` files. Hard-refresh the dashboard after uploading. This ZIP does not deploy itself or change the live website.

Existing attendance editing and Firebase paths are unchanged. The report only reads `attendance` and `biz_master_roster` using the application's existing Firebase connection and permissions. Export libraries are bundled locally, with licenses, and loaded only when a download is requested.

Dependencies: ExcelJS 4.4.0, jsPDF 3.0.3, jsPDF-AutoTable 5.0.2.
