const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

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
  click() { this.clicked = true; }
  remove() { this.removed = true; }
}

(async () => {
  const elements = new Map();
  const windowEvents = {};
  const database = {};
  let rosterCallback;
  let recordCallback;
  let exportedCsv = '';
  let printedHtml = '';
  const window = {
    allAgentProfiles: [{ userId: '1001', fullName: 'Alice Example', team: 'BB' }],
    canAccessAdminHubTab: () => true,
    filterDeletedAgents: list => list,
    rtdbRef: path => ({ path }),
    rtdbSet: async (ref, record) => {
      database[ref.path.split('/').pop()] = record;
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
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, new FakeElement(id));
      return elements.get(id);
    },
    querySelectorAll: () => [],
    createElement: () => new FakeElement('link'),
    body: new FakeElement('body')
  };
  const storage = { biz_master_roster: '[]' };
  class FakeBlob { constructor(parts) { this.parts = parts; exportedCsv = parts.join(''); } }
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
  assert.equal(typeof rosterCallback, 'function');

  const set = (id, value) => { document.getElementById(id).value = value; };
  set('qa-agent', '1001');
  set('qa-team', 'BB');
  set('qa-date', '2026-10-03');
  set('qa-call-type', 'Warm transfer');
  set('qa-call-number', 'CALL-452');
  set('qa-customer-number', '5926001234');
  set('qa-loan-specialist', 'Specialist B');
  set('qa-outcome', 'Invalid');
  set('qa-primary-reason', 'Under $200k revenue');
  set('qa-additional-reason', 'Trucking');
  set('qa-issue-source', 'Agent');
  set('qa-score-agentOpening', 'Meets standard');
  set('qa-score-businessDetails', 'Needs coaching');
  set('qa-score-ownerIdentity', 'Not applicable');
  set('qa-finding', 'Qualification should have stopped before transfer.');
  set('qa-strengths', 'The agent confirmed the owner name.');
  set('qa-coaching', 'Confirm annual revenue before moving forward.');
  set('qa-action-plan', 'Practice the revenue qualification question.');
  set('qa-follow-up-date', '2026-10-10');

  await window.qaSaveReview();
  const [saved] = Object.values(database);
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
  assert.equal(elements.get('qa-stat-total').textContent, '1');
  assert.equal(elements.get('qa-stat-invalid').textContent, '1');
  assert.equal(elements.get('qa-stat-coaching').textContent, '1');
  assert.equal(elements.get('qa-stat-score').textContent, '50%');
  assert.equal(elements.get('qa-stat-top-reason').textContent, 'Trucking');

  database['qa-pending-example'] = { date: '2026-10-02', agentName: 'Pending Agent', outcome: 'Pending' };
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

  const markup = fs.readFileSync(require.resolve('../tabs/adminpanel.html'), 'utf8');
  const qaMarkup = markup.slice(markup.indexOf('<div id="ah-sect-qa"'), markup.indexOf('<!-- ========== AGENT STATS SECTION'));
  assert.doesNotMatch(qaMarkup, /transcript|service code/i);
  assert.doesNotMatch(qaMarkup, /type="file"/i);
  assert.match(qaMarkup, /Professional Call QA Report/);
  console.log('QA manual report: saved fields, scorecard, coaching follow-up, totals, CSV, printable review, and markup passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
