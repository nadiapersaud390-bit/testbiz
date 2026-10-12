(function (g) {
  'use strict';
  const C = g.TimeOffCore;
  let host, unsubs = [], policyUnsub, generation = 0, authorized = false, ready = false, connected = false, offset = 0, settings, busyTeam = '', pendingGrant = false, notice = '', error = false;
  function session() {
    try {
      const user = JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');
      return sessionStorage.getItem('bizUserRole') === 'admin' && sessionStorage.getItem('adminLoggedIn') === 'true' && (user.role === 'super_admin' || user.isSuper === true) ? String(user.email || '').trim().toLowerCase() : '';
    } catch (_) { return ''; }
  }
  const member = (record, identity) => !!(identity && record && record.role === 'super_admin' && String(record.email || '').trim().toLowerCase() === identity);
  function render() {
    if (!host?.isConnected) return;
    const flags = C.teamAccess(settings), available = authorized && ready && !!session();
    host.querySelectorAll('[data-to-team-access]').forEach(input => {
      const t = input.dataset.toTeamAccess;
      input.checked = available && (busyTeam === t ? pendingGrant : flags[t]);
      input.disabled = !available || !connected || !!busyTeam;
      host.querySelector('[data-to-team-state="' + t + '"]').textContent = busyTeam === t ? 'Saving…' : !available ? 'Unavailable' : flags[t] ? 'Allowed' : 'Hidden';
    });
    const status = host.querySelector('[data-to-access-status]');
    status.textContent = notice || (!connected ? 'Connect to save team access.' : !authorized ? 'Verifying Super Admin access…' : !ready ? 'Loading team access…' : 'Changes save automatically and apply to signed-in agents.');
    status.classList.toggle('error', error);
    host.querySelector('[data-to-access-retry]').hidden = !error;
  }
  function revoke(message) {
    authorized = false; ready = false; settings = undefined;
    if (policyUnsub) policyUnsub(); policyUnsub = null;
    notice = message; error = true; render();
  }
  function start() {
    generation++; const gen = generation, identity = session();
    unsubs.forEach(fn => fn()); unsubs = [];
    if (policyUnsub) policyUnsub(); policyUnsub = null;
    authorized = ready = connected = false; settings = undefined; notice = ''; error = false;
    if (!identity) { revoke('Only Super Admin can change team access.'); return; }
    if (!g.rtdbOnValue || !g.rtdbGet || !g.rtdbRunTransaction) { revoke('Team access could not connect. Select Retry.'); return; }
    const watch = (path, callback, failed) => g.rtdbOnValue(g.rtdbRef(path), s => { if (gen === generation) callback(s.val()); }, e => { if (gen === generation) failed(e); });
    unsubs.push(watch('.info/connected', value => { connected = value === true; render(); }, () => { connected = false; render(); }));
    unsubs.push(watch('.info/serverTimeOffset', value => { offset = Number(value) || 0; }, () => {}));
    unsubs.push(watch('super_admin', record => {
      if (session() !== identity || !member(record, identity)) { revoke('Your Super Admin access could not be verified.'); return; }
      authorized = true;
      if (!policyUnsub) {
        notice = ''; error = false;
        policyUnsub = watch(C.TEAM_ACCESS_PATH, value => {
          if (!authorized || session() !== identity) return;
          settings = value; ready = true; render();
        }, () => { ready = false; notice = 'Team access could not sync. Select Retry.'; error = true; render(); });
      }
      render();
    }, () => revoke('Super Admin access could not sync. Select Retry.')));
    render();
  }
  async function save(team, grant) {
    const identity = session(), gen = generation;
    if (!identity || !authorized || !ready || !connected || busyTeam || !Object.hasOwn(C.TEAM_NAMES, team)) { render(); return; }
    busyTeam = team; pendingGrant = grant; notice = ''; error = false; render();
    try {
      const current = (await g.rtdbGet(g.rtdbRef('super_admin'))).val();
      if (!member(current, identity) || session() !== identity) { revoke('Your Super Admin access is no longer available.'); throw Error(notice); }
      const result = await g.rtdbRunTransaction(g.rtdbRef(C.TEAM_ACCESS_PATH), value => {
        if (gen !== generation || !authorized || !connected || session() !== identity) return;
        const record = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        return { ...record, teams: { ...C.teamAccess(value), [team]: grant }, updatedAt: Date.now() + offset, updatedBy: identity };
      }, { applyLocally: false });
      if (!result.committed) throw Error('Team access was not saved. Check your connection and try again.');
      notice = C.TEAM_NAMES[team] + (grant ? ' agents can now see and use time-off requests.' : ' time-off requests are hidden from agents. Existing calendar entries are kept.');
    } catch (e) { notice = e.message || 'Team access could not be saved. Try again.'; error = true; }
    finally { busyTeam = ''; render(); }
  }
  function mount() {
    const next = document.getElementById('to-team-access-host');
    if (!next) return;
    if (next === host && host.childElementCount) { render(); return; }
    host = next;
    host.className = 'to-team-access';
    host.setAttribute('aria-labelledby', 'to-team-access-title');
    host.innerHTML = `<div class="to-eyebrow">Super Admin · Team permissions</div><h3 id="to-team-access-title">Time-off request access</h3><p>Choose which teams can see and use time-off requests on their agent dashboard. Existing requests, approvals and admin calendar reminders are kept when access is turned off.</p><div class="to-team-access-grid">${Object.entries(C.TEAM_NAMES).map(([t, name]) => `<label class="to-team-access-row"><span><strong>${name}</strong><span class="to-team-access-state" data-to-team-state="${t}">Unavailable</span></span><input type="checkbox" role="switch" data-to-team-access="${t}" aria-label="Allow ${name} time-off requests" disabled><span class="to-team-switch" aria-hidden="true"></span></label>`).join('')}</div><div class="to-team-access-footer"><span data-to-access-status role="status" aria-live="polite"></span><button type="button" data-to-access-retry hidden>Retry</button></div>`;
    host.querySelectorAll('[data-to-team-access]').forEach(input => input.onchange = () => save(input.dataset.toTeamAccess, input.checked));
    host.querySelector('[data-to-access-retry]').onclick = () => { if (!busyTeam) start(); };
    start();
  }
  document.addEventListener('visibilitychange', () => { if (!session()) revoke('Only Super Admin can change team access.'); });
  g.TimeOffTeamAccess = { mount };
})(window);
