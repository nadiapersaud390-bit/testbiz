const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync(require.resolve('../tabs/adminpanel.html'), 'utf8');
const start = html.indexOf('async function switchAdminHubTab(tabId) {');
const end = html.indexOf('// REBUTTAL INTEL - COMPLETE FIX WITH CLICK TO EXPAND', start);
assert.notEqual(start, -1, 'the embedded Admin Hub tab switcher exists');
assert.notEqual(end, -1, 'the tab switcher can be isolated for a focused regression test');

const calls = { qa: 0 };
function node() {
  const classes = new Set();
  return { classList: {
    add: name => classes.add(name),
    remove: name => classes.delete(name),
    contains: name => classes.has(name)
  } };
}
const section = node();
const button = node();
const document = {
  querySelectorAll(selector) { return selector === '.ah-section' ? [section] : [button]; },
  getElementById(id) { return id === 'ah-sect-qa' ? section : id === 'ah-tab-qa' ? button : null; }
};
const window = {
  canAccessAdminHubTab: () => true,
  qaInit: async () => { calls.qa += 1; }
};
const context = {
  window, document, console,
  sessionStorage: { getItem: key => key === 'currentAdmin' ? '{"email":"reviewer@example.com"}' : null }
};
vm.runInNewContext('let ahCurrentSubTab = "stats";\n' + html.slice(start, end), context);

(async () => {
  await context.switchAdminHubTab('qa');
  assert.equal(calls.qa, 1, 'clicking the embedded QA tab initializes the QA form and agent roster');
  console.log('Admin Hub QA init: the embedded tab switcher starts QA when its tab is opened.');
})().catch(error => { console.error(error); process.exitCode = 1; });
