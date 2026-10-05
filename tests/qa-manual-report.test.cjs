const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const downloadedFiles = [];

class FakeElement {
  constructor(id) {
    this.id = id;
    this._value = '';
    this.textContent = '';
    this._innerHTML = '';
    this.options = [];
    this.selectedIndex = 0;
    this.checked = false;
    this.hidden = false;
    this.disabled = false;
    this.listeners = {};
    this.classList = { toggle() {} };
    this.download = '';
  }
  set innerHTML(markup) {
    this._innerHTML = markup;
    this.options = [];
    const re = /<option value="([^"]*)" data-name="([^"]*)" data-team="([^"]*)">([^<]*)<\/option>/g;
    for (const match of markup.matchAll(re)) {
      const attrs = { 'data-name': match[2], 'data-team': match[3] };
      this.options.push({ value: match[1], textContent: match[4], getAttribute: key => attrs[key] || '' });
    }
    const current = this.options.findIndex(option => option.value === this._value);
    this.selectedIndex = current >= 0 ? current : 0;
    if (current < 0) this._value = '';
  }
  get innerHTML() { return this._innerHTML; }
  get value() { return this._value; }
  set value(value) {
    this._value = String(value || '');
    if (this.options.length) {
      const selected = this.options.findIndex(option => option.value === this._value);
      this.selectedIndex = selected >= 0 ? selected : 0;
      if (selected < 0) this._value = '';
    }
  }
  addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
  dispatch(name) { (this.listeners[name] || []).forEach(callback => callback({ target: this })); }
  querySelectorAll() { return []; }
  appendChild() {}
  scrollIntoView() {}
  click() { this.clicked = true; if (this.download) downloadedFiles.push(this.download); }
  remove() { this.removed = true; if (this.onRemove) this.onRemove(); }
}

(async () => {
  const elements = new Map();
  const markup = fs.readFileSync(require.resolve('../tabs/adminpanel.html'), 'utf8');
  const qaMarkup = markup.slice(markup.indexOf('<div id="ah-sect-qa"'), markup.indexOf('<!-- ========== AGENT STATS SECTION'));
  for (const match of qaMarkup.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)) {
    const element = new FakeElement(match[1]);
    element.hidden = /\shidden(?:\s|>|=)/.test(match[0]);
    elements.set(match[1], element);
  }
  const sectionSelector = elements.get('qa-add-section-select');
  sectionSelector.options = Array.from(qaMarkup.matchAll(/<option value="([^"]*)">([^<]*)<\/option>/g), match => ({ value: match[1], textContent: match[2], disabled: false }));
  const optionalHost = elements.get('qa-optional-sections');
  optionalHost.insertAdjacentHTML = function (_position, sectionMarkup) {
    this._innerHTML += sectionMarkup;
    const ids = Array.from(sectionMarkup.matchAll(/\bid="([^"]+)"/g), match => match[1]);
    ids.forEach(id => elements.set(id, new FakeElement(id)));
    const wrapperId = ids.find(id => id.indexOf('qa-section-') === 0);
    const wrapper = elements.get(wrapperId);
    wrapper.onRemove = () => {
      ids.forEach(id => elements.delete(id));
      this._innerHTML = this._innerHTML.replace(sectionMarkup, '');
    };
  };
  const windowEvents = {};
  const database = {};
  let rosterCallback;
  let recordCallback;
  let exportedCsv = '';
  let printedHtml = '';
  const excelWorkbooks = [];
  const pdfCapture = { imageCount: 0, tables: [], pageCount: 1 };
  class FakeWorksheet {
    constructor(name) { this.name = name; this.columns = []; this.rows = []; this.images = []; this.cells = {}; }
    mergeCells() {}
    getCell(address) { return this.cells[address] ||= {}; }
    addRow(values) { this.rows.push(values); return this.getRow(this.rows.length + 1); }
    getRow(number) {
      const values = number === 1 ? this.columns.map(column => ({ value: column.header })) : (this.rows[number - 2] || []).map(value => ({ value }));
      return { eachCell: callback => values.forEach(callback), set height(value) { this._height = value; } };
    }
    eachRow(callback) { callback(this.getRow(1), 1); this.rows.forEach((_, index) => callback(this.getRow(index + 2), index + 2)); }
    getColumn() { return {}; }
    addImage(image, placement) { this.images.push({ image, placement }); }
  }
  class FakeImportWorksheet {
    constructor(name, rows) { this.name = name; this.rows = rows; this.columnCount = Math.max(...rows.map(row => row.length)); }
    eachRow(_options, callback) {
      this.rows.forEach(values => callback({
        values: [undefined].concat(values),
        getCell(index) { return { value: values[index - 1] }; }
      }));
    }
  }
  class FakeWorkbook {
    constructor() {
      this.worksheets = [];
      this.xlsx = {
        writeBuffer: async () => new Uint8Array([80, 75, 3, 4]),
        load: async () => {
          this.worksheets = [
            new FakeImportWorksheet('Summary', [
              ['Agent', 'Date', 'Outcome'],
              ['Daily total', '2026-10-02', '2 calls']
            ]),
            new FakeImportWorksheet('Call Details', [
              ['Report date', '10-02-2026'],
              ['Call Number', 'Agent', 'Date', 'Customer Number', 'Outcome', 'Primary Reason', 'Review Finding'],
              ['CALL-XLSX-1', 'Historical Agent Seven', new Date(2026, 9, 2), '5926007771', 'Invalid', 'Trucking', 'Summary sheet must not replace call details.'],
              ['CALL-XLSX-2', 'Historical Agent Eight', new Date(2026, 9, 2), '5926007772', 'Invalid', 'Under $200k revenue', 'The detail table imports from Excel.']
            ])
          ];
          return this;
        }
      };
      excelWorkbooks.push(this);
    }
    addWorksheet(name) { const sheet = new FakeWorksheet(name); this.worksheets.push(sheet); return sheet; }
    addImage(image) { return image; }
  }
  class FakePDF {
    constructor(options) { pdfCapture.options = options; }
    setFillColor() {} rect() {} setTextColor() {} setFontSize() {} text() {} roundedRect() {} addPage() { pdfCapture.pageCount++; }
    addImage() { pdfCapture.imageCount++; }
    splitTextToSize(text) { return [text]; }
    autoTable(options) { pdfCapture.tables.push(options); }
    getNumberOfPages() { return pdfCapture.pageCount; }
    setPage() {}
    output() { return new Uint8Array([37, 80, 68, 70]); }
  }
  const canvasContext = { fillStyle: '', font: '', fillRect() {}, fillText() {} };
  const makeCanvas = () => ({ width: 0, height: 0, getContext: () => canvasContext, toDataURL: () => 'data:image/png;base64,cG5n' });
  const window = {
    allAgentProfiles: [{ userId: '1001', fullName: 'Alice Example', team: 'BB' }],
    SpreadsheetImport: {
      readRows: async file => {
        assert.equal(file.name, 'Earlier Call Report.xlsx');
        return [
          ['Agent', 'Date', 'Outcome'],
          ['Daily total', '2026-10-02', '2 calls'],
          [],
          ['Report date', '10-02-2026'],
          ['Call Number', 'Agent', 'Date', 'Customer Number', 'Outcome', 'Primary Reason', 'Review Finding'],
          ['CALL-XLSX-1', 'Historical Agent Seven', new Date(2026, 9, 2), '5926007771', 'Invalid', 'Trucking', 'Summary sheet must not replace call details.'],
          ['CALL-XLSX-2', 'Historical Agent Eight', new Date(2026, 9, 2), '5926007772', 'Invalid', 'Under $200k revenue', 'The detail table imports from Excel.']
        ];
      }
    },
    canAccessAdminHubTab: () => true,
    filterDeletedAgents: list => list,
    rtdbRef: path => ({ path }),
    rtdbSet: async (ref, record) => {
      database[ref.path.split('/').pop()] = record;
      if (recordCallback) recordCallback({ val: () => database });
    },
    rtdbUpdate: async (ref, values) => {
      assert.equal(ref.path, 'qa_call_reviews');
      Object.assign(database, values);
      if (recordCallback) recordCallback({ val: () => database });
    },
    rtdbGet: async () => ({ val: () => null }),
    rtdbRemove: async () => {},
    rtdbOnValue: (ref, callback) => {
      if (ref.path === 'qa_call_reviews') {
        recordCallback = callback;
        callback({ val: () => database });
      }
      return () => {};
    },
    listenForMasterRoster: callback => { rosterCallback = callback; callback(window.allAgentProfiles); return () => {}; },
    addEventListener: (name, callback) => { (windowEvents[name] ||= []).push(callback); },
    writeAdminActivityLog: () => {},
    confirm: () => true,
    print: () => {},
    open: () => ({
      document: { open() {}, write: html => { printedHtml = html; }, close() {} },
      focus() {}, print() {}
    })
  };
  const document = {
    getElementById: id => elements.get(id) || null,
    querySelectorAll: () => [],
    createElement: tag => tag === 'canvas' ? makeCanvas() : new FakeElement(tag),
    head: { appendChild: script => { if (script.onload) script.onload(); } },
    body: new FakeElement('body')
  };
  const storage = { biz_master_roster: '[]' };
  class FakeBlob { constructor(parts, options = {}) { this.parts = parts; this.type = options.type || ''; exportedCsv = parts.join(''); } }
  const context = {
    window,
    document,
    sessionStorage: { getItem: key => ({ bizUserRole: 'admin', currentAdmin: JSON.stringify({ name: 'Reviewer One', email: 'reviewer@example.com' }) })[key] || null },
    localStorage: { getItem: key => storage[key] || null, setItem: (key, value) => { storage[key] = value; } },
    Date,
    Promise,
    Blob: FakeBlob,
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
    setTimeout: callback => { callback(); return 1; },
    console
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/qa.js'), 'utf8'), context);
  await window.qaInit();
  window.ExcelJS = { Workbook: FakeWorkbook };
  assert.equal(typeof rosterCallback, 'function');

  assert.equal(document.getElementById('qa-score-agentOpening'), null, 'scorecards stay hidden until added');
  assert.equal(document.getElementById('qa-coaching'), null, 'coaching details stay hidden until added');
  const set = (id, value) => { document.getElementById(id).value = value; };
  assert.equal(window.qaAddSection('callHandling'), true);
  assert.equal(window.qaAddSection('callHandling'), false, 'a report section can only be added once');
  window.qaAddSection('agentScorecard');
  window.qaAddSection('strengths');
  set('qa-agent', '1001');
  set('qa-team', 'BB');
  set('qa-date', '2026-10-03');
  set('qa-call-type', 'Warm transfer');
  set('qa-call-number', 'CALL-452');
  set('qa-customer-number', '5926001234');
  set('qa-loan-specialist', 'Specialist B');
  set('qa-outcome', 'Invalid');
  window.qaOutcomeChanged();
  assert.equal(elements.get('qa-invalid-fields').hidden, false);
  set('qa-primary-reason', 'Under $200k revenue');
  set('qa-additional-reason', 'Trucking');
  set('qa-issue-source', 'Agent');
  set('qa-score-agentOpening', 'Meets standard');
  set('qa-score-businessDetails', 'Needs coaching');
  set('qa-score-ownerIdentity', 'Not applicable');
  set('qa-finding', 'Qualification should have stopped before transfer.');
  set('qa-strengths', 'The agent confirmed the owner name.');

  await window.qaSaveReview();
  assert.ok(document.getElementById('qa-coaching'), 'a coaching plan is added when a score needs coaching');
  set('qa-coaching', 'Confirm annual revenue before moving forward.');
  set('qa-action-plan', 'Practice the revenue qualification question.');
  set('qa-follow-up-date', '2026-10-10');
  await window.qaSaveReview();
  const [saved] = Object.values(database);
  const savedId = Object.keys(database)[0];
  assert.ok(saved);
  assert.equal(saved.agentName, 'Alice Example');
  assert.equal(saved.callNumber, 'CALL-452');
  assert.equal(saved.customerNumber, '5926001234');
  assert.equal(saved.callType, 'Warm transfer');
  assert.equal(saved.loanSpecialist, 'Specialist B');
  assert.equal(saved.scorecard.agentOpening, 'Meets standard');
  assert.equal(saved.scorecard.businessDetails, 'Needs coaching');
  assert.equal(saved.needsFollowUp, true);

  assert.match(elements.get('qa-report-body').innerHTML, /CALL-452/);
  assert.match(elements.get('qa-report-body').innerHTML, /5926001234/);
  assert.match(elements.get('qa-report-body').innerHTML, /50%/);
  assert.match(elements.get('qa-chart-call-types').innerHTML, /Warm transfer/);
  assert.match(elements.get('qa-chart-agent-quality').innerHTML, /Alice Example/);
  assert.match(elements.get('qa-chart-agent-quality').innerHTML, /50% avg/);
  assert.equal(elements.get('qa-stat-total').textContent, '1');
  assert.equal(elements.get('qa-stat-invalid').textContent, '1');
  assert.equal(elements.get('qa-stat-top-reason').textContent, 'Trucking');
  assert.equal(document.getElementById('qa-score-agentOpening'), null, 'saving clears optional sections for the next call');

  window.qaEditReview(savedId);
  assert.equal(document.getElementById('qa-score-businessDetails').value, 'Needs coaching', 'editing restores only the sections already on the report');
  assert.equal(document.getElementById('qa-coaching').value, 'Confirm annual revenue before moving forward.');
  window.qaResetForm();
  assert.equal(document.getElementById('qa-coaching'), null, 'clearing the form removes added sections');
  assert.equal(elements.get('qa-invalid-fields').hidden, true);

  database['qa-pending-example'] = { date: '2026-10-02', agentName: 'Pending Agent', callNumber: 'PENDING-1', reviewFinding: 'Pending sample review', outcome: 'Pending' };
  recordCallback({ val: () => database });
  assert.equal(elements.get('qa-stat-total').textContent, '1');
  assert.equal(elements.get('qa-stat-pending').textContent, '1');
  assert.equal(elements.get('qa-report-count').textContent, '2 matching calls');
  set('qa-filter-outcome', 'Valid');
  window.qaRenderReport();
  assert.match(elements.get('qa-report-body').innerHTML, /No call reviews match/);
  assert.equal(elements.get('qa-stat-total').textContent, '0');
  set('qa-filter-outcome', '');
  window.qaRenderReport();

  window.qaExportCSV();
  assert.match(exportedCsv, /Call Number/);
  assert.match(exportedCsv, /Customer Number/);
  assert.match(exportedCsv, /Coaching action plan/);
  assert.match(exportedCsv, /Practice the revenue qualification question/);

  window.qaPrintReview(Object.keys(database)[0]);
  assert.match(printedHtml, /Call Quality Review/);
  assert.match(printedHtml, /Agent Review|Agent/);
  assert.match(printedHtml, /Specialist B/);
  assert.match(printedHtml, /Coaching action plan/);

  const legacyCsv = [
    ',,,,,',
    'INVALID CALL REPORT - BERBICE BUSINESS TEAM,,,,',
    ',,,,',
    'Report date,10-02-2026,,,',
    ',,,,',
    'BREAKDOWN BY REASON,,,,',
    'Primary reason,Additional reason,Agent,Date,Review finding',
    'Under $200k revenue,Trucking,GYB Historical Agent One,10-02-2026,"Customer reported revenue below the minimum and identified a trucking business."',
    'Under $200k revenue,Unqualified,GYB Historical Agent Two,10-02-2026,"The agent pressured an unqualified caller into agreeing to a revenue figure."',
    'Unqualified,,GYB Historical Agent Three,10-02-2026,"The non-US business is ineligible for funding."',
    ',,GYB Historical Agent Four,10-02-2026,"The caller gave an opt-out cue and the agent transferred the call."',
    ',,GYB Historical Agent Five,10-02-2026,"The agent did not clarify the \"\"delivery\"\" industry.",',
    ',,GYB Historical Agent Six,10-02-2026,"The call appeared to be a prank and should not have been transferred."'
  ].join('\r\n');
  await window.qaPreviewImportFile({ name: 'Invalid Call Report - Berbice.csv', size: legacyCsv.length, text: async () => legacyCsv });
  assert.equal(elements.get('qa-import-preview').hidden, false);
  assert.match(elements.get('qa-import-summary').textContent, /6 call\(s\) ready to import/);
  assert.match(elements.get('qa-import-call-number-note').textContent, /no Call Number column/);
  assert.match(elements.get('qa-import-preview-body').innerHTML, /GYB Historical Agent One/);
  set('qa-import-date-format', 'DMY');
  window.qaReparseImport();
  assert.match(elements.get('qa-import-preview-body').innerHTML, /2026-02-10/, 'the alternate legacy date format can be previewed');
  set('qa-import-date-format', 'MDY');
  window.qaReparseImport();
  await window.qaCommitImport();
  const importedRows = Object.values(database).filter(record => record.importedFromFile === 'Invalid Call Report - Berbice.csv');
  const imported = importedRows[0];
  assert.ok(imported);
  assert.equal(importedRows.length, 6, 'the old report detail table imports without its summary rows');
  assert.equal(imported.date, '2026-10-02', 'the preview date format is applied to legacy dates');
  assert.equal(imported.outcome, 'Invalid');
  assert.equal(imported.team, 'BB');
  assert.equal(imported.callNumber, '', 'missing call numbers remain blank instead of being invented');
  assert.ok(importedRows.some(record => !record.primaryReason), 'blank legacy reason fields remain blank');
  assert.match(elements.get('qa-report-body').innerHTML, /GYB Historical Agent One/);

  await window.qaPreviewImportFile({ name: 'Previously exported QA.csv', size: exportedCsv.length, text: async () => exportedCsv });
  assert.match(elements.get('qa-import-summary').textContent, /0 call\(s\) ready to import/);
  assert.match(elements.get('qa-import-summary').textContent, /2 duplicate\(s\) skipped/);
  assert.equal(elements.get('qa-import-confirm').disabled, true);
  window.qaCancelImport();

  await window.qaPreviewImportFile({ name: 'Earlier Call Report.xlsx', size: 1000, arrayBuffer: async () => new Uint8Array([80, 75, 3, 4]).buffer });
  assert.match(elements.get('qa-import-summary').textContent, /2 call\(s\) ready to import/);
  assert.match(elements.get('qa-import-preview-body').innerHTML, /Historical Agent Seven/);
  await window.qaCommitImport();
  const workbookRows = Object.values(database).filter(record => record.importedFromFile === 'Earlier Call Report.xlsx');
  assert.equal(workbookRows.length, 2, 'the detailed worksheet is selected when an earlier summary table is present');
  assert.equal(workbookRows[0].date, '2026-10-02', 'Excel date cells are preserved as calendar dates');
  assert.equal(workbookRows[0].callNumber, 'CALL-XLSX-1');

  await window.qaExportExcel();
  const exportedWorkbook = excelWorkbooks[excelWorkbooks.length - 1];
  assert.deepEqual(exportedWorkbook.worksheets.map(sheet => sheet.name), ['Overview', 'Call Types', 'Agent Quality', 'Call Reviews', 'Report Notes']);
  assert.equal(exportedWorkbook.worksheets[0].images.length, 2, 'Excel Overview embeds both report charts');
  assert.ok(exportedWorkbook.worksheets.find(sheet => sheet.name === 'Call Reviews').rows.some(row => row.some(value => String(value).includes('Practice the revenue qualification question.'))));
  assert.ok(downloadedFiles.some(name => name.endsWith('.xlsx')));

  window.jspdf = { jsPDF: FakePDF };
  await window.qaExportPDF();
  assert.equal(pdfCapture.imageCount, 2, 'PDF Overview embeds both report charts');
  assert.ok(pdfCapture.tables.some(table => table.body.some(row => row.some(cell => String(cell).includes('Practice the revenue qualification question.')))));
  assert.ok(downloadedFiles.some(name => name.endsWith('.pdf')));

  assert.doesNotMatch(qaMarkup, /transcript|service code/i);
  assert.match(qaMarkup, /type="file" id="qa-import-file" accept="[^"]*\.csv[^"]*\.xlsx/i);
  assert.doesNotMatch(qaMarkup, /accept="[^"]*audio/i);
  assert.match(qaMarkup, /id="qa-chart-call-types"/);
  assert.match(qaMarkup, /id="qa-chart-agent-quality"/);
  assert.doesNotMatch(qaMarkup, /qa-stat-coaching|qa-stat-score/);
  assert.match(qaMarkup, /Professional Call QA Report/);
  assert.match(qaMarkup, /id="qa-export-pdf"/);
  assert.match(qaMarkup, /id="qa-export-excel"/);
  console.log('QA manual report: optional sections, charts, previous CSV/Excel preview/import, duplicate handling, totals, print, PDF, Excel, and markup passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
