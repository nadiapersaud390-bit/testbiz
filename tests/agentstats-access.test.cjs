const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../js/agentstats.js'), 'utf8');

function checkAccess(admin, permissions, includeHubCheck = true) {
  const window = { _RESTRICTED_ADMIN_IDS: ['0000'] };
  if (includeHubCheck) {
    window.canAccessAdminHubTab = tab => tab === 'stats' && permissions.stats === true;
  }
  const context = {
    window,
    sessionStorage: { getItem: key => key === 'currentAdmin' ? JSON.stringify(admin) : null },
    console
  };
  vm.runInNewContext(source, context);
  return context.canAccessAgentStats();
}

assert.equal(checkAccess({ email: 'jamal' }, { stats: true }), true,
  'an admin granted Agent Stats in Admin Tools can load the stats report');
assert.equal(checkAccess({ email: 'jamal' }, { stats: false }), false,
  'an explicit Agent Stats denial remains enforced');
assert.equal(checkAccess({ email: '0000' }, { stats: true }), false,
  'the restricted account stays blocked even if its permission map is stale');
assert.equal(checkAccess({ email: 'momo' }, {}, false), true,
  'legacy access remains available when the shared permission helper is absent');
assert.equal(checkAccess({ email: 'jamal' }, {}, false), false,
  'unknown admins fail closed when the shared permission helper is absent');

console.log('Agent Stats access: assigned permission, explicit denial, restricted account, and legacy fallback passed.');
