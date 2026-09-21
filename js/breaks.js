(function () {
  'use strict';
  const C = window.BreakCore;
  const role = sessionStorage.getItem('bizUserRole');
  if (!C || !['admin', 'agent'].includes(role)) return;
  let profile = {};
  try { profile = JSON.parse(sessionStorage.getItem('currentAgentProfile') || '{}'); } catch (_) {}
  const agentId = String(profile.ytelId || profile.userId || '');
  if (role === 'agent' && !/^\d{4}$/.test(agentId)) return;
  const panel = document.getElementById('break-panel');
  const alerts = document.getElementById('break-alerts');
  if (!panel || !alerts) return;
  // Keep monitoring global, but show its admin controls only inside Admin Tools.
  window.mountAdminBreakMonitor = function () {
    if (role !== 'admin') return;
    const host = document.getElementById('admin-break-monitor-host');
    if (!host) { panel.hidden = true; return; }
    if (panel.parentElement !== host) host.appendChild(panel);
    panel.hidden = false;
  };
  if (role === 'admin') window.mountAdminBreakMonitor();
  else panel.hidden = false;
  let roster = [], states = {}, offset = 0, clockReady = false, connected = false;
  let rosterReady = false, statesReady = false, busy = false, failure = '', audioEnabled = false;
  let renderedDay = '', pendingSpeech = [], speaking = false;
  const announced = new Set(), acknowledged = new Set(), notified = new Set();
  const desktopAlerts = new Map();
  let deadlineTimer = null, notificationNotice = '';
  const notificationSupported = () => 'Notification' in window;
  const notificationLabel = () => !notificationSupported() ? 'Browser notifications unavailable' : window.Notification.permission === 'granted' ? 'Browser notifications on' : window.Notification.permission === 'denied' ? 'Notifications blocked • Help' : 'Enable browser notifications';
  const now = () => Date.now() + offset;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const live = () => connected && clockReady && rosterReady && statesReady && !failure;
  const agent = () => roster.find(p => String(p.userId) === agentId);
  const activeRecords = () => Object.values(states).map(s => s?.active).filter(r => r && Number.isFinite(Number(r.startedAt)));
  const alertKey = r => r.userId + '/' + r.id + '/' + r.startedAt;
  const timeLabel = t => t ? new Date('2000-01-01T' + t + ':00-04:00').toLocaleTimeString('en-US', {timeZone:'America/Guyana', hour:'numeric', minute:'2-digit'}) : 'Not scheduled';
  const stamp = t => Number.isFinite(Number(t)) ? new Date(Number(t)).toLocaleTimeString('en-US', {timeZone:'America/Guyana',hour:'numeric',minute:'2-digit'}) : 'Syncing';
  function status(message) { failure = message; render(); }
  function speakNext() {
    if (speaking || !audioEnabled || !pendingSpeech.length) return;
    const item = pendingSpeech.shift();
    if (item.record && !activeRecords().some(r => alertKey(r) === alertKey(item.record))) { speakNext(); return; }
    const utterance = new SpeechSynthesisUtterance(item.text);
    utterance.rate = 0.95;
    speaking = true;
    utterance.onend = () => { speaking = false; speakNext(); };
    utterance.onerror = () => {
      speaking = false; audioEnabled = false;
      if (item.record) announced.delete(alertKey(item.record));
      render();
    };
    window.speechSynthesis.speak(utterance);
  }
  function voice(record) {
    pendingSpeech.push({record, text: `${record.name}, your break time is up. Time to log in back.`});
    speakNext();
  }
  function notifyAdmins(records) {
    if (role !== 'admin') return;
    const activeKeys = new Set(records.map(alertKey));
    for (const [key, notice] of desktopAlerts) {
      if (!activeKeys.has(key)) { notice.close(); desktopAlerts.delete(key); }
    }
    if (!notificationSupported() || window.Notification.permission !== 'granted') return;
    records.forEach(record => {
      const key = alertKey(record);
      if (notified.has(key)) return;
      try {
        const notice = new window.Notification(`${record.name}: break time is up`, {
          body: 'Time to log in back.', tag: 'agent-break-' + key, requireInteraction: true
        });
        notified.add(key);
        desktopAlerts.set(key, notice);
        notice.onclick = () => {
          window.focus();
          if (typeof window.switchTab === 'function') window.switchTab('adminpanel');
          panel.scrollIntoView({behavior:'smooth', block:'start'});
          notice.close();
        };
      } catch (_) {
        notificationNotice = 'This browser could not show a desktop alert. Keep voice alerts enabled.';
        const message = document.getElementById('break-notification-status');
        if (message) message.textContent = notificationNotice;
      }
    });
  }
  function scheduleDeadline() {
    if (deadlineTimer !== null) clearTimeout(deadlineTimer);
    deadlineTimer = null;
    const next = activeRecords().map(C.dueAt).filter(t => t > now()).sort((a,b) => a-b)[0];
    if (next && live()) deadlineTimer = setTimeout(() => { tick(); scheduleDeadline(); }, Math.min(2147483647, Math.max(0, next - now())));
  }
  function render() {
    renderedDay = C.day(now());
    const connection = failure || (live() ? 'Live • Guyana time' : connected ? 'Loading breaks...' : 'Reconnecting. Break actions are paused.');
    let content = '';
    if (role === 'agent') {
      const a = agent();
      const state = states[agentId] || {};
      const active = state.active;
      if (active) {
        content = `<div class="break-current"><div><strong>${esc(active.slot)} break</strong><p>Started ${stamp(active.startedAt)} • ${active.minutes} minutes</p></div><strong class="break-timer" data-break-timer="${esc(agentId)}"></strong><button data-return="${esc(active.id)}" ${!live() || busy ? 'disabled' : ''}>I’m back</button></div><p class="break-hint">After signing back into your calling system, click “I’m back” to record your return.</p>`;
      } else {
        content = '<div class="break-slots">' + C.slots.map(slot => {
          const schedule = a?.breakSchedule?.[slot];
          const previous = state.days?.[renderedDay]?.[slot];
          const configured = C.validSchedule(schedule, slot);
          return `<div class="break-slot"><div><strong>${slot === 'morning' ? 'Morning' : 'Afternoon'} break</strong><p>${esc(timeLabel(schedule?.time))}${configured ? ' • ' + schedule.minutes + ' min' : ''}</p></div><button data-start="${slot}" ${!live() || busy || !C.available(state, schedule, slot, now()) ? 'disabled' : ''}>${previous ? 'Completed' : 'Start break'}</button>${previous ? '<small>Returned ' + stamp(previous.returnedAt) + '</small>' : configured ? '<small>Available from scheduled time</small>' : '<small>Ask an admin to set your break</small>'}</div>`;
        }).join('') + '</div>';
      }
    } else {
      const records = activeRecords();
      const overdue = records.filter(r => now() >= C.dueAt(r)).length;
      content = `<div class="break-summary"><span><b data-break-count>${records.length}</b> on break</span><span><b data-overdue-count>${overdue}</b> overdue</span><button data-voice ${!('speechSynthesis' in window) ? 'disabled' : ''}>${!('speechSynthesis' in window) ? 'Voice unavailable in this browser' : audioEnabled ? 'Voice alerts on • Test' : 'Enable voice alerts'}</button><button data-notifications ${!notificationSupported() ? 'disabled' : ''}>${notificationLabel()}</button></div><div class="break-live-list">${records.map(r => `<div class="break-current"><div><strong>${esc(r.name)}</strong><p>${esc(r.team)} • ${esc(r.slot)} • Started ${stamp(r.startedAt)} • ${r.minutes} min</p></div><strong class="break-timer" data-break-timer="${esc(r.userId)}"></strong></div>`).join('') || '<p class="break-hint">No agents are currently on break.</p>'}</div>`;
      const todayRecords = Object.values(states).flatMap(s => Object.values(s.days?.[renderedDay] || {})).filter(r => r.returnedAt);
      content += `<details class="break-history"><summary>Today’s returns (${todayRecords.length})</summary><div class="break-table-wrap"><table><thead><tr><th>Agent</th><th>Break</th><th>Started</th><th>Returned</th><th>Time used</th><th>Overrun</th></tr></thead><tbody>${todayRecords.sort((a,b) => b.returnedAt-a.returnedAt).map(r => `<tr><td>${esc(r.name)}</td><td>${esc(r.slot)}</td><td>${stamp(r.startedAt)}</td><td>${stamp(r.returnedAt)}</td><td>${C.duration(r.returnedAt-r.startedAt)}</td><td>${C.duration(r.returnedAt-C.dueAt(r))}</td></tr>`).join('') || '<tr><td colspan="6">No returns recorded today.</td></tr>'}</tbody></table></div></details><p class="break-hint">Set morning and afternoon times and minutes in Agent Profiles. Enable voice and browser notifications, then keep this dashboard open. Alerts continue while you use other dashboard sections or browser tabs. Sleeping devices or suspended tabs may delay alerts.</p>`;
    }
    const historyOpen = panel.querySelector('details')?.open;
    panel.innerHTML = `<div class="break-heading"><h2>${role === 'admin' ? 'Agent break monitor' : 'Your breaks'}</h2><span class="${live() ? 'break-online' : 'break-offline'}">${esc(connection)}</span></div>${content}<p id="break-action-status" role="status"></p><p id="break-notification-status" class="break-hint" role="status">${esc(notificationNotice)}</p>`;
    if (historyOpen && panel.querySelector('details')) panel.querySelector('details').open = true;
    tick();
    scheduleDeadline();
  }
  function tick() {
    if (C.day(now()) !== renderedDay) { render(); return; }
    panel.querySelectorAll('[data-break-timer]').forEach(el => {
      const r = states[el.dataset.breakTimer]?.active;
      if (!r) return;
      const remaining = C.dueAt(r) - now();
      el.textContent = remaining > 0 ? C.duration(remaining) + ' left' : C.duration(-remaining) + ' overdue';
      el.classList.toggle('break-overdue', remaining <= 0);
    });
    panel.querySelectorAll('[data-start]').forEach(button => {
      button.disabled = !live() || busy || !C.available(states[agentId], agent()?.breakSchedule?.[button.dataset.start], button.dataset.start, now());
    });
    const records = activeRecords().filter(r => now() >= C.dueAt(r));
    const count = panel.querySelector('[data-overdue-count]');
    if (count) count.textContent = records.length;
    // Never announce stale cached state while offline or before server-clock synchronization.
    if (!live()) return;
    const visible = records.filter(r => !acknowledged.has(alertKey(r)));
    const signature = visible.map(alertKey).join('|');
    if (alerts.dataset.signature !== signature) {
      alerts.dataset.signature = signature;
      alerts.innerHTML = visible.map(r => `<div class="break-alert"><strong>${esc(r.name)}: break is up</strong><p>Please log back in now.${role === 'admin' ? ' Awaiting return confirmation.' : ' Then click “I’m back”.'}</p><button data-dismiss="${esc(alertKey(r))}">Dismiss alert</button></div>`).join('');
    }
    notifyAdmins(records);
    if (audioEnabled) records.forEach(r => {
      const key = alertKey(r);
      if (!announced.has(key)) { announced.add(key); voice(r); }
    });
  }
  panel.addEventListener('click', async e => {
    const button = e.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-notifications') && role === 'admin') {
      if (!notificationSupported()) return;
      if (window.Notification.permission === 'denied') {
        notificationNotice = 'Notifications are blocked. Open your browser’s site settings, allow notifications for this site, then reload.';
      } else {
        try {
          const permission = await window.Notification.requestPermission();
          notificationNotice = permission === 'granted' ? 'Browser notifications enabled. You can switch to another tab.' : 'Notifications were not enabled. Voice and dashboard alerts remain available.';
        } catch (_) { notificationNotice = 'Unable to enable notifications. Use a supported browser over HTTPS and check site permissions.'; }
      }
      render(); return;
    }
    if (button.hasAttribute('data-voice')) {
      audioEnabled = true;
      pendingSpeech.push({text:'Break voice alerts are enabled.'}); speakNext(); render(); return;
    }
    if (role !== 'agent' || !live() || busy) return;
    const slot = button.dataset.start;
    const returnId = button.dataset.return;
    if (!slot && !returnId) return;
    busy = true; render();
    try {
      const a = agent();
      if (!a || a.hidden || ['Inactive','Quit','Fired','Replaced'].includes(a.status)) throw new Error('Your profile is not active. Contact an admin.');
      const path = window.rtdbRef('biz_agent_breaks/' + agentId);
      // A transaction prevents duplicate clicks, overlapping breaks and a second daily use across tabs.
      const result = await window.rtdbRunTransaction(path, state => slot
        ? C.begin(state, a.breakSchedule?.[slot], slot, now(), {userId:agentId, name:a.fullName || profile.name || 'Agent',team:a.team}, {'.sv':'timestamp'})
        : C.finish(state, returnId, {'.sv':'timestamp'}), {applyLocally:false});
      if (!result.committed) throw new Error('Break changed or is unavailable. Check the current status and try again.');
    } catch (err) {
      busy = false; render();
      document.getElementById('break-action-status').textContent = 'Could not save: ' + err.message;
      return;
    }
    busy = false; render();
  });
  alerts.addEventListener('click', e => {
    const b = e.target.closest('[data-dismiss]');
    if (b) { acknowledged.add(b.dataset.dismiss); tick(); }
  });
  render();
  let attempts = 0;
  const init = setInterval(() => {
    if (!window.rtdbRunTransaction || !window.rtdbOnValue) {
      if (++attempts === 40) status('Unable to connect to breaks. Reload to try again.');
      return;
    }
    clearInterval(init); failure = '';
    const watch = (path, callback) => window.rtdbOnValue(window.rtdbRef(path), snap => { callback(snap.val()); render(); }, () => status('Break data is unavailable. Check Firebase access and reload.'));
    watch('.info/serverTimeOffset', value => { offset = Number(value) || 0; clockReady = true; });
    watch('.info/connected', value => { connected = value === true; });
    watch('biz_master_roster', value => { roster = Object.values(value || {}).filter(Boolean); rosterReady = true; });
    watch(role === 'admin' ? 'biz_agent_breaks' : 'biz_agent_breaks/' + agentId, value => {
      states = role === 'admin' ? (value || {}) : {[agentId]:value || {}}; statesReady = true;
    });
  }, 250);
  setInterval(tick, 1000);
  document.addEventListener('visibilitychange', tick);
  window.addEventListener('focus', tick);
})();
