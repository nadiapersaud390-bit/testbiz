const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class FakeElement {
  constructor() { this._value = ''; this._innerHTML = ''; this.textContent = ''; this.options = []; this.listeners = {}; this.classList = { toggle() {} }; }
  set innerHTML(markup) {
    this._innerHTML = markup;
    this.options = [{ value: '', getAttribute: () => '' }];
    for (const match of markup.matchAll(/<option value="([^"]*)" data-name="([^"]*)" data-team="([^"]*)">([^<]*)<\/option>/g)) {
      const attrs = { 'data-name': match[2], 'data-team': match[3] };
      this.options.push({ value: match[1], getAttribute: key => attrs[key] || '' });
    }
  }
  get innerHTML() { return this._innerHTML; }
  get value() { return this._value; }
  set value(value) { this._value = String(value || ''); }
  addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
}

(async () => {
  const elements = new Map();
  const window = {
    allAgentProfiles: [],
    canAccessAdminHubTab: () => true,
    filterDeletedAgents: list => list,
    rtdbRef: path => ({ path }),
    // Simulate a silent/broken live roster listener; the one-time read should populate the picker.
    listenForMasterRoster: (_callback, onError) => { queueMicrotask(() => onError(new Error('listener unavailable'))); return () => {}; },
    rtdbGet: async () => ({ val: () => [{ userId: 'agent-42', fullName: 'Taylor Example', team: 'BB' }] }),
    rtdbOnValue: () => () => {},
    addEventListener() {}
  };
  const document = {
    getElementById(id) { if (!elements.has(id)) elements.set(id, new FakeElement()); return elements.get(id); },
    querySelectorAll: () => [],
    createElement: () => new FakeElement(),
    body: new FakeElement()
  };
  const storage = {};
  const context = {
    window, document,
    sessionStorage: { getItem: key => key === 'bizUserRole' ? 'admin' : null },
    localStorage: { getItem: key => storage[key] || null, setItem: (key, value) => { storage[key] = value; } },
    Date, Promise, setTimeout, clearTimeout, console
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/qa.js'), 'utf8'), context);
  await window.qaInit();
  await new Promise(resolve => setImmediate(resolve));

  assert.match(elements.get('qa-agent').innerHTML, /Taylor Example/);
  assert.equal(elements.get('qa-agent-status').textContent, '1 active agent loaded.');
  console.log('QA agent selector fallback: failed listener recovers the active Firebase roster.');
})().catch(error => { console.error(error); process.exitCode = 1; });
