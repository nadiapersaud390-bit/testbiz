(function (g) {
  'use strict';
  const C = g.TimeOffCore, $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function stored(key) { try { return JSON.parse(sessionStorage.getItem(key) || '{}'); } catch (_) { return {}; } }
  const role = sessionStorage.getItem('bizUserRole'), profile = stored('currentAgentProfile'), admin = stored('currentAdmin');
  const agentId = String(profile.ytelId || profile.userId || profile.id || '').trim(), adminId = String(admin.email || '').trim().toLowerCase();
  const isSuper = admin.role === 'super_admin' || admin.isSuper === true;
  const validSession = () => role === sessionStorage.getItem('bizUserRole') && (role === 'agent' ? sessionStorage.getItem('agentLoggedIn') === '1' && C.safeKey(agentId) && String(stored('currentAgentProfile').ytelId || stored('currentAgentProfile').userId || stored('currentAgentProfile').id || '').trim() === agentId : role === 'admin' && sessionStorage.getItem('adminLoggedIn') === 'true' && adminId && String(stored('currentAdmin').email || '').trim().toLowerCase() === adminId);
  let allowed = false, ready = false, connected = false, offset = 0, rows = [], unsubscribe, generation = 0, modal, priorFocus, overflow, busy = false, notice = '', noticeError = false, selected = null, reviewSignature = '';
  const now = () => Date.now() + offset;
  const path = (id, request) => 'admin_calendar/requests/' + id + (request ? '/' + request : '');
  const seenKey = 'biz_timeoff_seen_v1_' + agentId;
  function seen() { try { return JSON.parse(localStorage.getItem(seenKey) || '[]'); } catch (_) { return []; } }
  const decisionKey = r => r.id + ':' + r.revision + ':' + r.status;
  const decisions = () => rows.filter(r => ['Approved', 'Declined'].includes(r.status));
  const unread = () => { const read = seen(); return decisions().filter(r => !Array.isArray(read) || !read.includes(decisionKey(r))); };
  function markSeen() { if (role !== 'agent') return; try { localStorage.setItem(seenKey, JSON.stringify(decisions().map(decisionKey))); } catch (_) {} }
  function message(s, error = false) { notice = s; noticeError = error; render(); }
  function stop() { generation++; if (unsubscribe) unsubscribe(); unsubscribe = null; rows = []; ready = false; }
  function fail(error) { ready = false; message('Requests could not sync. ' + (error?.message || 'Check your connection.') + ' Use Retry sync to try again.', true); }
  function subscribe() {
    if (!allowed || !validSession() || unsubscribe || !g.rtdbOnValue) return;
    const gen = ++generation;
    unsubscribe = g.rtdbOnValue(g.rtdbRef(role === 'agent' ? path(agentId) : 'admin_calendar/requests'), snapshot => {
      if (gen !== generation || !allowed || !validSession()) return;
      const value = snapshot.val() || {};
      rows = C.flatten(role === 'agent' ? { [agentId]: value } : value);
      ready = true;
      if (noticeError) { notice = ''; noticeError = false; }
      render();
    }, error => { if (gen === generation) fail(error); });
  }
  function setAdminAccess(value) {
    if (role !== 'admin') return;
    allowed = !!value && !!validSession();
    if (allowed) subscribe();
    else { stop(); close(); if (modal) { modal.remove(); modal = null; } selected = null; }
    render();
  }
  async function requireAccess() {
    if (!validSession() || !allowed || !connected || !ready) throw Error('Wait for a live connection before saving.');
    if (role === 'admin') {
      const r = (await g.rtdbGet(g.rtdbRef(isSuper ? 'super_admin' : 'admins_list/' + adminId))).val();
      const ok = isSuper ? r && r.role === 'super_admin' && String(r.email || '').trim().toLowerCase() === adminId : r && r.calendarAccess === true && !['inactive', 'deleted', 'disabled'].includes(String(r.status || '').toLowerCase());
      if (!ok) { setAdminAccess(false); throw Error('Your Calendar access is no longer available.'); }
    } else {
      const roster = g.AdminCalendarCore.normalizeRoster((await g.rtdbGet(g.rtdbRef('biz_master_roster'))).val());
      const own = roster.find(p => p.userId === agentId);
      if (!own || own.loginDisabled === true || (g.filterDeletedAgents && !g.filterDeletedAgents([own]).length)) throw Error('Your active agent profile could not be verified. Please contact an admin.');
      if (!validSession() || !connected || !allowed) throw Error('Your session or connection changed. Please sign in again.');
      return own;
    }
    if (!validSession() || !allowed || !connected) throw Error('Your session or connection changed. Please sign in again.');
  }
  function dateLabel(date) { return new Date(date + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); }
  function timeLabel(time) { const [h, m] = time.split(':').map(Number); return (h % 12 || 12) + ':' + String(m).padStart(2, '0') + (h < 12 ? ' AM' : ' PM'); }
  function range(r) { return r.allDay ? dateLabel(r.date) + (r.endDate !== r.date ? ' to ' + dateLabel(r.endDate) : '') + ' · All day' : dateLabel(r.date) + ', ' + timeLabel(r.time) + ' to ' + (r.endDate !== r.date ? dateLabel(r.endDate) + ', ' : '') + timeLabel(r.endTime); }
  function badge(r) { return '<span class="to-badge ' + esc(r.status) + '">' + esc(C.STATUSES[r.status]) + '</span>'; }
  function details(r) {
    return `<div class="to-row to-between"><h3>${esc(role === 'admin' ? r.name + ' · ' + r.team : C.TYPES[r.type])}</h3>${badge(r)}</div><div class="to-muted">${role === 'admin' ? esc(C.TYPES[r.type]) + ' · Agent ' + esc(r.agentId) + '<br>' : ''}${esc(range(r))}</div><p class="to-reason"><strong>Reason:</strong> ${esc(r.notes)}</p>${r.reviewNote ? `<div class="to-reply"><strong>Admin reply:</strong> ${esc(r.reviewNote)}</div>` : ''}${r.reviewedBy ? `<div class="to-muted">${esc(C.STATUSES[r.status])} by ${esc(r.reviewerName || r.reviewedBy)} · ${esc(new Date(r.reviewedAt).toLocaleString('en-GB', { timeZone: 'America/Guyana' }))}</div>` : ''}`;
  }
  function makeModal() {
    modal = document.createElement('div'); modal.id = 'to-modal'; modal.hidden = true; modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'to-title');
    modal.innerHTML = `<div class="to-shell"><header class="to-head"><div><div class="to-eyebrow">Team calendar</div><h2 id="to-title">${role === 'agent' ? 'Request time off' : 'Time-off requests'}</h2><div class="to-subtitle">${role === 'agent' ? 'Choose your dates, explain your request, and track the decision.' : 'Review requests from Berbice, Providence and Remote.'}</div></div><button class="to-btn" type="button" data-to-action="close" aria-label="Close requests">✕</button></header><div class="to-body"><p class="to-muted">All dates and times use Guyana time (UTC−4). A pending request is not approved time off.</p><div id="to-status" class="to-status" role="status" aria-live="polite"></div><button class="to-btn" id="to-retry" data-to-action="retry" hidden>Retry sync</button>
      ${role === 'agent' ? `<section class="to-card"><form id="to-form" class="to-form"><label>Request type<select id="to-type">${Object.entries(C.TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label><label class="to-check"><input type="checkbox" id="to-all-day" checked> All day</label><label>Start date<input type="date" id="to-date" required></label><label>End date<input type="date" id="to-end-date" required></label><label id="to-time-label" hidden>Time away starts<input type="time" id="to-time"></label><label id="to-end-time-label" hidden>Time away ends / expected return<input type="time" id="to-end-time"></label><label class="wide">Reason<textarea id="to-reason" rows="3" maxlength="2000" required placeholder="Tell your admin what you need and why."></textarea></label><div class="wide to-row to-between"><span class="to-muted">Your name and team are included automatically.</span><button class="to-btn primary" id="to-submit" type="submit">Send request</button></div></form></section><h3 class="to-section-title">My requests</h3>` : `<p id="to-summary" class="to-summary"></p><div class="to-filters"><select id="to-team" aria-label="Filter requests by team"><option value="ALL">All teams</option><option value="BB">Berbice (BB)</option><option value="PR">Providence (PR)</option><option value="RM">Remote (RM)</option></select><select id="to-filter-status" aria-label="Filter request status"><option value="Requested">Pending approval</option><option value="ALL">All statuses</option><option value="Approved">Approved</option><option value="Declined">Declined</option><option value="Cancelled">Cancelled</option></select><input id="to-search" aria-label="Search requests" placeholder="Search name, ID or reason"></div><section id="to-review" class="to-card" hidden></section>`}<div id="to-list"></div></div></div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', async e => {
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      if (b.dataset.toAction === 'close') return close();
      if (b.dataset.toAction === 'retry') { stop(); notice = ''; noticeError = false; subscribe(); render(); return; }
      if (b.dataset.toAction === 'back') { selected = null; render(); return; }
      if (b.dataset.review) return selectReview(b.dataset.review);
      if (b.dataset.cancel) return cancelRequest(b.dataset.cancel);
      if (b.dataset.decision) return decide(b.dataset.decision);
      if (b.dataset.calendar) { close(); g.AdminCalendar?.openDate(b.dataset.calendar); }
    });
    modal.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
      if (e.key !== 'Tab') return;
      const elements = Array.from(modal.querySelectorAll('button,input,select,textarea')).filter(x => !x.disabled && x.getClientRects().length), first = elements[0], last = elements[elements.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    if (role === 'agent') {
      $('to-form').onsubmit = submit;
      $('to-date').onchange = () => { $('to-end-date').min = $('to-date').value; if ($('to-end-date').value < $('to-date').value) $('to-end-date').value = $('to-date').value; };
      $('to-type').onchange = () => { if (['late', 'early'].includes($('to-type').value)) $('to-all-day').checked = false; syncTimes(); };
      $('to-all-day').onchange = syncTimes; resetForm();
    } else {
      ['to-team', 'to-filter-status'].forEach(id => $(id).onchange = () => { selected = null; render(); });
      $('to-search').oninput = render;
    }
  }
  function syncTimes() { const allDay = $('to-all-day').checked; ['to-time', 'to-end-time'].forEach(id => { $(id).required = !allDay; $(id).disabled = allDay; $(id + '-label').hidden = allDay; }); }
  function resetForm() { $('to-form').reset(); const date = C.today(now()); $('to-date').value = date; $('to-date').min = date; $('to-end-date').value = date; $('to-end-date').min = date; syncTimes(); }
  function open() {
    if (!allowed || !validSession()) return;
    if (!modal) makeModal();
    if (!ready) { stop(); subscribe(); }
    if (modal.hidden) { priorFocus = document.activeElement; overflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; modal.hidden = false; }
    render(); markSeen(); renderLaunch(); modal.querySelector('[data-to-action="close"]').focus();
  }
  function close() { if (!modal || modal.hidden) return; markSeen(); modal.hidden = true; document.body.style.overflow = overflow || ''; if (priorFocus?.isConnected) priorFocus.focus(); renderLaunch(); }
  function selectReview(id) { selected = id; reviewSignature = ''; render(); $('to-review')?.scrollIntoView({ block: 'nearest' }); }
  function openReview(id, request) { if (role !== 'admin') return; open(); selectReview('request:' + id + ':' + request); }
  function renderLaunch() {
    const visible = allowed && validSession(), pending = rows.filter(r => r.status === 'Requested').length, fresh = unread().length;
    document.querySelectorAll('[data-timeoff-launch]').forEach(b => { b.hidden = !visible; const label = b.querySelector('[data-timeoff-label]'), count = b.querySelector('[data-timeoff-count]'); if (label) label.textContent = role === 'agent' ? 'Request time off / My requests' : 'Time-off requests'; if (count) count.textContent = ready && (role === 'admin' ? pending : fresh) ? String(role === 'admin' ? pending : fresh) : ''; });
    const banner = $('to-banner'); if (!banner) return;
    const upcoming = rows.filter(r => r.status === 'Approved' && r.endDate >= C.today(now())).sort((a, b) => a.date.localeCompare(b.date));
    banner.hidden = !visible || !ready || !(role === 'admin' ? pending : fresh || pending || upcoming.length);
    const text = role === 'admin' ? pending + ' time-off request' + (pending === 1 ? '' : 's') + ' awaiting approval across all teams.' : fresh ? fresh + ' request decision' + (fresh === 1 ? '' : 's') + ' ready. Open My requests to see your approval status and admin reply.' : upcoming.length ? 'Approved: ' + C.TYPES[upcoming[0].type] + ' · ' + range(upcoming[0]) + (upcoming.length > 1 ? ' (+' + (upcoming.length - 1) + ' more)' : '') : pending + ' request' + (pending === 1 ? ' is' : 's are') + ' pending admin approval.';
    banner.querySelector('[data-timeoff-summary]').textContent = text;
  }
  function render() {
    renderLaunch(); if (!modal || modal.hidden) return;
    $('to-status').textContent = !connected ? 'Offline. Requests and decisions are paused until you reconnect.' : notice || (!ready ? 'Loading requests…' : 'Live updates are on.');
    $('to-status').classList.toggle('error', noticeError || !connected);
    $('to-retry').hidden = ready;
    if ($('to-submit')) { $('to-submit').disabled = busy || !connected || !ready; $('to-submit').textContent = busy ? 'Sending…' : 'Send request'; }
    if (!ready) { $('to-list').innerHTML = '<p class="to-empty">Waiting for requests to sync.</p>'; if ($('to-review')) $('to-review').hidden = true; return; }
    const team = $('to-team')?.value || 'ALL', filter = $('to-filter-status')?.value || 'ALL', search = ($('to-search')?.value || '').toLowerCase();
    const list = rows.filter(r => (team === 'ALL' || r.team === team) && (filter === 'ALL' || r.status === filter) && [r.name, r.agentId, r.notes].join(' ').toLowerCase().includes(search)).sort((a, b) => (a.status === 'Requested' ? 0 : 1) - (b.status === 'Requested' ? 0 : 1) || b.createdAt - a.createdAt);
    if ($('to-summary')) $('to-summary').textContent = rows.filter(r => r.status === 'Requested').length + ' pending across all teams · Showing ' + list.length + ' request' + (list.length === 1 ? '' : 's');
    $('to-list').innerHTML = list.map(r => `<article class="to-card">${details(r)}<div class="to-row" style="margin-top:10px">${role === 'admin' ? `<button class="to-btn primary" data-review="${esc(r.id)}">${r.status === 'Requested' ? 'Review request' : 'View details'}</button><button class="to-btn" data-calendar="${esc(r.date)}">View on calendar</button>` : r.status === 'Requested' ? `<button class="to-btn" data-cancel="${esc(r.id)}" ${busy || !connected ? 'disabled' : ''}>Cancel request</button>` : ''}</div></article>`).join('') || '<p class="to-empty">' + (role === 'agent' ? 'No requests yet. Send your first request using the form above.' : 'No requests match these filters.') + '</p>';
    if (role === 'admin') renderReview();
  }
  function renderReview() {
    const box = $('to-review'), r = rows.find(r => r.id === selected); box.hidden = !selected;
    if (!selected) { reviewSignature = ''; return; }
    if (!r) { box.innerHTML = '<p class="to-muted">This request is no longer available.</p>'; return; }
    const signature = r.id + ':' + r.revision;
    if (signature !== reviewSignature) {
      reviewSignature = signature;
      box.innerHTML = `<div class="to-eyebrow">Request details</div>${details(r)}${r.status === 'Requested' ? `<label class="to-stack" style="margin:14px 0">Reply to agent <span class="to-muted">Optional for approval. Required if declining.</span><textarea id="to-review-note" rows="3" maxlength="2000" placeholder="Add a message for the agent"></textarea></label><div class="to-row"><button class="to-btn approve" data-decision="Approved" data-revision="${r.revision}">Approve request</button><button class="to-btn decline" data-decision="Declined" data-revision="${r.revision}">Decline request</button><button class="to-btn" data-to-action="back">Close details</button></div>` : '<p class="to-muted">This request has been ' + esc(r.status.toLowerCase()) + '. The decision is visible to the agent.</p><button class="to-btn" data-to-action="back">Close details</button>'}`;
    }
    box.querySelectorAll('[data-decision]').forEach(b => b.disabled = busy || !connected || !ready);
  }
  async function submit(e) {
    e.preventDefault(); if (busy) return;
    busy = true; render();
    try {
      const input = { type: $('to-type').value, date: $('to-date').value, endDate: $('to-end-date').value, allDay: $('to-all-day').checked, time: $('to-time').value, endTime: $('to-end-time').value, notes: $('to-reason').value };
      const own = await requireAccess(), record = C.create(input, own, now()), id = g.rtdbPush(g.rtdbRef(path(agentId))).key;
      const result = await g.rtdbRunTransaction(g.rtdbRef(path(agentId)), current => {
        if (!validSession() || !connected) return;
        const existing = current || {};
        if (Object.values(existing).some(r => r && ['Requested', 'Approved'].includes(r.status) && C.overlaps(record, r))) return;
        return { ...existing, [id]: record };
      }, { applyLocally: false });
      if (!result.committed) throw Error('The request was not sent. You may already have a pending or approved request for these dates and hours. Check My requests before trying again.');
      resetForm(); message('Request sent. It is on the admin calendar and pending approval.');
    } catch (error) { message(error.message || 'The request could not be sent.', true); }
    finally { busy = false; render(); }
  }
  async function decide(status) {
    if (busy) return;
    const r = rows.find(r => r.id === selected); if (!r || r.status !== 'Requested') return;
    const note = $('to-review-note')?.value || '', expected = Number($('to-review').querySelector('[data-decision]')?.dataset.revision);
    busy = true; render();
    try {
      await requireAccess();
      const actor = { role: 'admin', id: adminId, name: admin.name || adminId };
      C.transition(r, expected, status, actor, note, now());
      const result = await g.rtdbRunTransaction(g.rtdbRef(path(r.agentId, r.requestId)), current => validSession() && allowed && connected ? C.transition(current, expected, status, actor, note, now()) : undefined, { applyLocally: false });
      if (!result.committed) throw Error('This request changed or was already reviewed. Read its latest status before continuing.');
      message('Request ' + status.toLowerCase() + '. The agent and calendar will see the decision automatically.');
    } catch (error) { message(error.message || 'The decision could not be saved.', true); }
    finally { busy = false; render(); }
  }
  async function cancelRequest(id) {
    const r = rows.find(r => r.id === id); if (role !== 'agent' || busy || !r || r.status !== 'Requested' || !confirm('Cancel this pending request?')) return;
    busy = true; render();
    try {
      await requireAccess();
      const result = await g.rtdbRunTransaction(g.rtdbRef(path(agentId, r.requestId)), current => validSession() && connected ? C.transition(current, r.revision, 'Cancelled', { role: 'agent', id: agentId }, '', now()) : undefined, { applyLocally: false });
      if (!result.committed) throw Error('The request has already changed. Check its latest status.');
      message('Request cancelled. The calendar has been updated.');
    } catch (error) { message(error.message || 'The request could not be cancelled.', true); }
    finally { busy = false; render(); }
  }
  function boot() {
    if (!validSession()) return;
    if (role === 'agent') allowed = true;
    document.querySelectorAll('[data-timeoff-launch]').forEach(b => b.onclick = open);
    const banner = $('to-banner'); if (banner) banner.querySelector('button').onclick = open;
    renderLaunch();
    if (!g.rtdbOnValue || !g.rtdbRunTransaction) { setTimeout(boot, 600); return; }
    g.rtdbOnValue(g.rtdbRef('.info/connected'), s => { connected = !!s.val(); render(); }, () => { connected = false; render(); });
    g.rtdbOnValue(g.rtdbRef('.info/serverTimeOffset'), s => { offset = Number(s.val()) || 0; }, () => {});
    subscribe();
    g.addEventListener('storage', e => { if (e.key === seenKey) renderLaunch(); });
    document.addEventListener('visibilitychange', () => { if (!validSession()) { allowed = false; stop(); close(); } render(); });
  }
  g.TimeOffRequests = { open, close, openReview, setAdminAccess };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window);
