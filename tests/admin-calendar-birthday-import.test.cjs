const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const window = {};
vm.runInNewContext(fs.readFileSync(require.resolve('../js/admin-calendar-core.js'), 'utf8'), { window, Date });
const C = window.AdminCalendarCore;
const mixedIdRoster = C.normalizeRoster({
  '201': { name: 'Ada Example' },
  '202': { ytelId: '202', agentName: 'Grace Hopper' },
  '203': { userID: '203', fullName: 'Inactive Person', status: 'inactive' }
});
assert.deepEqual(JSON.parse(JSON.stringify(mixedIdRoster.map(agent => [agent.userId, agent.fullName]))), [
  ['201', 'Ada Example'], ['202', 'Grace Hopper']
], 'the calendar roster accepts Firebase key, ytelId, and userID identifiers while filtering inactive agents');
const legacyFieldRoster = C.normalizeRoster({ '205': { full_name: 'Legacy Agent', ytel_name: 'GYB Legacy Agent' } });
assert.deepEqual(JSON.parse(JSON.stringify(legacyFieldRoster.map(agent => [agent.userId, agent.fullName]))), [
  ['205', 'Legacy Agent']
], 'the calendar accepts keyed rosters with legacy snake-case fields');
const roster = [
  { userId: '101', fullName: 'Ada Example', team: 'BB' },
  { userId: '102', fullName: 'Grace Hopper', team: 'PR' },
  { userId: '103', fullName: 'Duplicate Name' },
  { userId: '104', fullName: 'Duplicate Name' },
  { userId: '105', fullName: 'Inactive Person', status: 'inactive' }
];
const rows = [
  ['BIZ Agent Birthdays'],
  ['Agent Name', 'Birthday'],
  ['Ada Example', new Date(Date.UTC(1998, 1, 28))],
  ['Grace Hopper', '12/09/1956'],
  ['Missing Agent', new Date(Date.UTC(2000, 0, 1))],
  ['Duplicate Name', '4/15/1990'],
  ['Inactive Person', '7/4/2001'],
  ['Ada Example', '03/11/1998'],
  ['', '']
];
const parsed = C.prepareBirthdayImport(rows, roster);
assert.equal(parsed.headerRowIndex, 1, 'the parser finds headings beneath the title row');
assert.deepEqual(JSON.parse(JSON.stringify(parsed.matched)), [
  { agentId: '101', name: 'Ada Example', month: 2, day: 28 },
  { agentId: '102', name: 'Grace Hopper', month: 12, day: 9 }
]);
assert.deepEqual(JSON.parse(JSON.stringify(parsed.unmatched.map(row => row.reason))), [
  'Agent was not found in the active roster',
  'Agent name is ambiguous',
  'Agent was not found in the active roster',
  'Duplicate agent row'
]);
const splitColumns = C.prepareBirthdayImport([
  ['Employee Name', 'Birth Month', 'Birth Day'],
  ['Ada Example', 'March', '11']
], roster);
assert.deepEqual(JSON.parse(JSON.stringify(splitColumns.matched)), [{ agentId: '101', name: 'Ada Example', month: 3, day: 11 }]);
const uploadedLayout = C.prepareBirthdayImport([
  ['BIZ Agent Birthdays'],
  [],
  ['Agent Name', 'Birthday'],
  ['Ada Example', new Date(Date.UTC(1998, 2, 11))],
  ['Grace Hopper', 'Oct 21 2009']
], mixedIdRoster);
assert.deepEqual(JSON.parse(JSON.stringify(uploadedLayout.matched)), [
  { agentId: '201', name: 'Ada Example', month: 3, day: 11 },
  { agentId: '202', name: 'Grace Hopper', month: 10, day: 21 }
], 'the uploaded title/blank-row layout and full Excel-style dates import correctly');
const prefixedName = C.prepareBirthdayImport([
  ['Agent Name', 'Birthday'],
  ['Ada Example', 'Jan 01 2002']
], C.normalizeRoster([{ userId: '204', fullName: 'GYB Ada Example (BB)' }]));
assert.deepEqual(JSON.parse(JSON.stringify(prefixedName.matched)), [
  { agentId: '204', name: 'GYB Ada Example (BB)', month: 1, day: 1 }
], 'agent prefixes and team suffixes do not prevent a birthday roster match');
const leapYears = C.birthdayEvents({ '101': { month: 2, day: 29, updatedAt: 1 } }, roster, 2025);
assert.equal(leapYears[0].date, '2025-02-28', 'a February 29 birthday shifts to February 28 in non-leap years');
assert.equal(C.birthdayEvents({ '101': { month: 2, day: 29, updatedAt: 1 } }, roster, 2028)[0].date, '2028-02-29');
const calendarUI = fs.readFileSync(require.resolve('../js/admin-calendar.js'), 'utf8');
assert.match(calendarUI, /data-action="birthday-upload"/);
assert.match(calendarUI, /C\.normalizeRoster\(v\)/, 'the calendar normalizes roster ID variants before agent matching');
assert.match(calendarUI, /No active agents are loaded/, 'the uploader explains when it cannot match without a roster');
assert.match(calendarUI, /accept="\.xlsx,\.xls,\.xlsm,\.csv/);
assert.match(calendarUI, /SpreadsheetImport\.readRows\(file\)/, 'the birthday uploader uses the shared workbook reader');
assert.match(calendarUI, /rtdbUpdate\(ref\('admin_calendar\/birthdays'\),updates\)/);
console.log('Calendar birthday import: Excel-style headers, date parsing, roster matching, duplicate and inactive handling, and annual recurrence passed.');
