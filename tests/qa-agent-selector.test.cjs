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
    if (id === 'qa-team') this.options = ['', 'BB', 'PR', 'RM'].map(value => ({ value, getAttribute: () => '' }));
    this.selectedIndex = 0;
    this.hidden = false;
    this.listeners = {};
    this.classList = { toggle() {} };
  }
  set innerHTML(markup) {
    this._innerHTML = markup;
    this.options = [{ value: '', textContent: 'Select an agent', getAttribute: () => '' }];
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
    const selected = this.options.findIndex(option => option.value === this._value);
    this.selectedIndex = selected >= 0 ? selected : 0;
    if (selected < 0) this._value = '';
  }
  addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
  dispatch(name) { (this.listeners[name] || []).forEach(callback => callback({ target: this })); }
  querySelectorAll() { return []; }
  scrollIntoView() {}
}

(async () => {
  const elements = new Map();
  const windowEvents = {};
  let rosterCallback;
  const window = {
    QA_REVIEW_ENDPOINT: '',
    allAgentProfiles: [],
    canAccessAdminHubTab: () => true,
    filterDeletedAgents: list => list.filter(agent => String(agent.userId || agent.ytelId || agent.id) !== 'deleted'),
    rtdbRef: path => ({ path }),
    rtdbOnValue: () => () => {},
    listenForMasterRoster: callback => { rosterCallback = callback; return () => {}; },
    addEventListener: (name, callback) => { (windowEvents[name] ||= []).push(callback); }
  };
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, new FakeElement(id));
      return elements.get(id);
    },
    querySelectorAll: () => [],
    createElement: () => new FakeElement('created'),
    body: new FakeElement('body')
  };
  const storage = { biz_master_roster: '[]' };
  const context = {
    window,
    document,
    sessionStorage: { getItem: key => key === 'bizUserRole' ? 'admin' : null },
    localStorage: { getItem: key => storage[key] || null, setItem: (key, value) => { storage[key] = value; } },
    Date,
    Promise,
    setTimeout,
    console
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/qa.js'), 'utf8'), context);
  await window.qaInit();

  assert.equal(elements.get('qa-agent').innerHTML.includes('Alice Example'), false);
  rosterCallback([
    { userId: '1001', fullName: 'Alice Example', team: 'BB' },
    { ytelId: '1002', name: 'Bob Example', location: 'RM' },
    { userId: 'deleted', fullName: 'Old Agent', team: 'PR' },
    { userId: '1003', fullName: 'Inactive Agent', status: 'Inactive' }
  ]);

  const select = elements.get('qa-agent');
  assert.match(select.innerHTML, /Alice Example/);
  assert.match(select.innerHTML, /Bob Example/);
  assert.doesNotMatch(select.innerHTML, /Old Agent|Inactive Agent/);
  assert.equal(elements.get('qa-agent-status').textContent, '2 active agents loaded.');

  select.value = '1002';
  select.dispatch('change');
  assert.equal(elements.get('qa-team').value, 'RM');

  for (const listener of windowEvents['biz-active-roster-updated'] || []) {
    listener({ detail: [{ userId: '1001', fullName: 'Alice Example', team: 'BB' }] });
  }
  assert.doesNotMatch(select.innerHTML, /Bob Example/);
  assert.equal(elements.get('qa-agent-status').textContent, '1 active agent loaded.');
  console.log('QA agent selector: late Firebase roster load, ID variants, inactive/deleted filtering, team update, and live refresh passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
