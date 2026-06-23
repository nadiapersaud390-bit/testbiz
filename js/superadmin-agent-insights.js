(function () {
  'use strict';

  const state = { reports: [], rebuttals: [], coaching: [], monitoring: [], agentId: null, hooked: false };
  const esc = value => String(value == null ? '' : value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const norm = value => String(value || '').replace(/^GY[BP]\s*/i, '').trim().toLowerCase();

  function profiles() {
    if (Array.isArray(window.allAgentProfiles) && window.allAgentProfiles.length) return window.allAgentProfiles;
    try { return JSON.parse(localStorage.getItem('biz_master_roster') || '[]'); } catch (_) { return []; }
  }

  function agentById(id) {
    return profiles().find(a => String(a.userId || '') === String(id || '')) || null;
  }

  function matches(record, agent) {
    if (!record || !agent) return false;
    const ids = [agent.userId, agent.ytelId, agent.phone, agent.ytelName].filter(Boolean).map(norm);
    const recIds = [record.userId, record.agentId, record.ytelId, record.phone].filter(Boolean).map(norm);
    if (ids.some(id => recIds.includes(id))) return true;
    const names = [agent.fullName, agent.name].filter(Boolean).map(norm);
    const recNames = [record.agentName, record.repName, record.name].filter(Boolean).map(norm);
    return names.some(name => recNames.includes(name));
  }

  function resolveIdentity(row) {
    const roster = profiles();
    const found = roster.find(a =>
      (row.ytelId && [a.ytelId, a.phone, a.ytelName, a.userId].some(v => norm(v) === norm(row.ytelId))) ||
      [a.fullName, a.name].some(v => norm(v) && norm(v) === norm(row.name || row.agentName))
    );
    return found ? { userId: found.userId || '', name: found.fullName || found.name || row.name } : { userId: '', name: row.name || row.agentName || '' };
  }

  function enrichPayload(payload) {
    if (!payload || !Array.isArray(payload.agents)) return payload;
    payload.agents = payload.agents.map(row => {
      const id = resolveIdentity(row);
      return Object.assign({}, row, { userId: id.userId, name: id.name, agentName: id.name });
    });
    return payload;
  }

  function enrichReport(report) {
    if (!report) return report;
    const key = Array.isArray(report.data) ? 'data' : (Array.isArray(report.agents) ? 'agents' : null);
    if (!key) return report;
    report[key] = report[key].map(row => {
      const id = resolveIdentity({ name: row.agentName || row.name, ytelId: row.ytelId });
      return Object.assign({}, row, { userId: id.userId, agentName: id.name, name: row.name || id.name });
    });
    return report;
  }

  function installLeadHooks() {
    if (window.__agentInsightLeadHooks) return;
    const timer = setInterval(() => {
      let installed = 0;
      if (typeof window.saveLiveDashboardState === 'function' && !window.saveLiveDashboardState.__insightWrapped) {
        const original = window.saveLiveDashboardState;
        const wrapped = function (payload) { return original.call(this, enrichPayload(payload)); };
        wrapped.__insightWrapped = true;
        window.saveLiveDashboardState = wrapped;
        installed++;
      }
      if (typeof window.saveAgentReportToFirebase === 'function' && !window.saveAgentReportToFirebase.__insightWrapped) {
        const original = window.saveAgentReportToFirebase;
        const wrapped = function (report) { return original.call(this, enrichReport(report)); };
        wrapped.__insightWrapped = true;
        window.saveAgentReportToFirebase = wrapped;
        installed++;
      }
      if (window.saveLiveDashboardState && window.saveLiveDashboardState.__insightWrapped && window.saveAgentReportToFirebase && window.saveAgentReportToFirebase.__insightWrapped) {
        window.__agentInsightLeadHooks = true;
        clearInterval(timer);
      }
    }, 400);
  }

  function addStyles() {
    if (document.getElementById('agent-insight-styles')) return;
    const style = document.createElement('style');
    style.id = 'agent-insight-styles';
    style.textContent = `
      .agent-mini-tabs{display:flex;gap:8px;padding:14px 28px 0;overflow-x:auto;border-bottom:1px solid rgba(255,255,255,.08)}
      .agent-mini-tab{flex:0 0 auto;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);color:#94a3b8;border-radius:12px 12px 0 0;padding:10px 13px;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;cursor:pointer}
      .agent-mini-tab.active{color:#34d399;background:rgba(16,185,129,.12);border-color:rgba(16,185,129,.35)}
      .agent-mini-panel{display:none}.agent-mini-panel.active{display:block}
      .agent-insight-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:16px}
      .agent-insight-card{background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:13px}
      .agent-insight-label{font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:.09em;color:#64748b}
      .agent-insight-value{margin-top:4px;font-size:19px;font-weight:900;color:#f8fafc}
      .agent-history-row{display:grid;grid-template-columns:1.4fr .8fr .7fr;gap:10px;align-items:center;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.05);font-size:11px}
      .agent-history-row:last-child{border-bottom:0}.agent-empty{padding:30px;text-align:center;color:#64748b;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;border:1px dashed rgba(255,255,255,.1);border-radius:14px}
      @media(max-width:700px){.agent-insight-grid{grid-template-columns:1fr}.agent-mini-tabs{padding-left:14px;padding-right:14px}}
    `;
    document.head.appendChild(style);
  }

  function list(rows, empty) {
    return rows.length ? `<div style="border:1px solid rgba(255,255,255,.08);border-radius:14px;overflow:hidden">${rows.join('')}</div>` : `<div class="agent-empty">${esc(empty)}</div>`;
  }

  function dateKey(value) {
    const d = value ? new Date(value) : new Date();
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-CA', { timeZone: 'America/Guyana' });
  }

  function weekStart() {
    const local = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Guyana' }));
    local.setDate(local.getDate() - ((local.getDay() + 6) % 7));
    local.setHours(0, 0, 0, 0);
    return local;
  }

  function renderProduction(agent) {
    const entries = [];
    state.reports.forEach(report => (report.data || report.agents || []).forEach(row => {
      if (matches(row, agent)) entries.push({ report, row, leads: Number(row.dailyLeads || row.count || 0) });
    }));
    entries.sort((a,b) => new Date(b.report.uploadedAt || b.report.reportDate || 0) - new Date(a.report.uploadedAt || a.report.reportDate || 0));
    const today = dateKey();
    const start = weekStart();
    const todayTotal = entries.filter(e => dateKey(e.report.uploadedAt || e.report.reportDate) === today).reduce((s,e)=>s+e.leads,0);
    const weekTotal = entries.filter(e => new Date(e.report.uploadedAt || e.report.reportDate || 0) >= start).reduce((s,e)=>s+e.leads,0);
    const total = entries.reduce((s,e)=>s+e.leads,0);
    const rows = entries.slice(0,50).map(e => `<div class="agent-history-row"><div><b>${esc(e.report.reportDate || dateKey(e.report.uploadedAt))}</b><div style="font-size:9px;color:#64748b">${esc(e.report.dayOfWeek || '')}</div></div><div>${esc(e.row.team || agent.team || '—')}</div><div style="text-align:right;font-weight:900;color:#34d399">${e.leads} leads</div></div>`);
    document.getElementById('agent-production-content').innerHTML = `<div class="agent-insight-grid"><div class="agent-insight-card"><div class="agent-insight-label">Today</div><div class="agent-insight-value">${todayTotal}</div></div><div class="agent-insight-card"><div class="agent-insight-label">This Week</div><div class="agent-insight-value">${weekTotal}</div></div><div class="agent-insight-card"><div class="agent-insight-label">Recorded Total</div><div class="agent-insight-value">${total}</div></div></div>${list(rows,'No uploaded leads found for this agent yet.')}`;
  }

  function renderRebuttal(agent) {
    const items = state.rebuttals.filter(x => matches(x, agent));
    const uses = items.filter(x => x.eventType === 'use').length;
    const views = items.length - uses;
    const rows = items.slice(0,50).map(x => `<div class="agent-history-row"><div><b>${esc(x.rebuttalTitle || 'Untitled')}</b><div style="font-size:9px;color:#64748b">${new Date(x.timestamp || Date.now()).toLocaleString()}</div></div><div>${x.eventType === 'use' ? 'Used in call' : 'Viewed'}</div><div></div></div>`);
    document.getElementById('agent-rebuttal-content').innerHTML = `<div class="agent-insight-grid"><div class="agent-insight-card"><div class="agent-insight-label">Views</div><div class="agent-insight-value">${views}</div></div><div class="agent-insight-card"><div class="agent-insight-label">Uses</div><div class="agent-insight-value">${uses}</div></div><div class="agent-insight-card"><div class="agent-insight-label">Use Rate</div><div class="agent-insight-value">${views ? Math.round(uses/views*100) : 0}%</div></div></div>${list(rows,'No rebuttal activity found.')}`;
  }

  async function renderAttendance(agent) {
    const el = document.getElementById('agent-attendance-content');
    el.innerHTML = '<div class="agent-empty">Loading attendance...</div>';
    if (typeof window.getAttendanceForDate !== 'function') { el.innerHTML = '<div class="agent-empty">Attendance service unavailable.</div>'; return; }
    const dates = Array.from({length:14}, (_,i) => { const d = new Date(); d.setDate(d.getDate()-i); return dateKey(d); });
    const data = await Promise.all(dates.map(d => window.getAttendanceForDate(d).catch(() => ({}))));
    const rows = []; let present = 0;
    data.forEach((records,i) => {
      const rec = Object.values(records || {}).find(r => matches(r,agent)) || (records || {})[agent.userId];
      if (!rec) return;
      if (String(rec.status || '').toLowerCase().includes('present')) present++;
      rows.push(`<div class="agent-history-row"><div><b>${dates[i]}</b></div><div>${esc(rec.status || 'Recorded')}</div><div style="text-align:right">${esc(rec.clockedAt || rec.time || '')}</div></div>`);
    });
    el.innerHTML = `<div class="agent-insight-grid"><div class="agent-insight-card"><div class="agent-insight-label">Days Recorded</div><div class="agent-insight-value">${rows.length}</div></div><div class="agent-insight-card"><div class="agent-insight-label">Present</div><div class="agent-insight-value">${present}</div></div><div class="agent-insight-card"><div class="agent-insight-label">Window</div><div class="agent-insight-value">14d</div></div></div>${list(rows,'No attendance records in the last 14 days.')}`;
  }

  function renderSimple(kind, agent) {
    const source = kind === 'coaching' ? state.coaching : state.monitoring;
    const items = source.filter(x => matches(x,agent));
    const rows = items.map(x => `<div class="agent-history-row"><div><b>${esc(kind === 'coaching' ? (x.discussion || x.topic || 'Coaching note') : (x.dialBehavior || 'Monitoring session'))}</b><div style="font-size:9px;color:#64748b">${new Date(x.timestamp || Date.now()).toLocaleString()}</div></div><div>${esc(x.adminName || '')}</div><div>${esc(kind === 'monitoring' ? (x.voiceTone || '') : '')}</div></div>`);
    document.getElementById(`agent-${kind}-content`).innerHTML = list(rows, kind === 'coaching' ? 'No coaching notes found.' : 'No live monitoring sessions found.');
  }

  function render(tab) {
    const agent = agentById(state.agentId);
    if (!agent) return;
    if (tab === 'production') renderProduction(agent);
    if (tab === 'rebuttal') renderRebuttal(agent);
    if (tab === 'attendance') renderAttendance(agent);
    if (tab === 'coaching' || tab === 'monitoring') renderSimple(tab,agent);
  }

  window.switchAgentMiniTab = function (tab) {
    document.querySelectorAll('.agent-mini-tab').forEach(b => b.classList.toggle('active', b.dataset.agentTab === tab));
    document.querySelectorAll('.agent-mini-panel').forEach(p => p.classList.toggle('active', p.id === `agent-mini-${tab}`));
    const footer = document.getElementById('agentModalFooter') || document.querySelector('#agentProfileModal .agent-modal-footer');
    if (footer) footer.style.display = tab === 'profile' ? 'flex' : 'none';
    if (tab !== 'profile') render(tab);
  };

  function injectUi() {
    const modal = document.getElementById('agentProfileModal');
    if (!modal || document.getElementById('agentMiniTabs')) return false;
    addStyles();
    const body = modal.querySelector('.agent-modal-body');
    const header = modal.querySelector('.agent-modal-header');
    const footer = modal.querySelector('.agent-modal-footer');
    if (!body || !header) return false;
    if (footer) footer.id = 'agentModalFooter';
    const profileChildren = Array.from(body.childNodes);
    const profile = document.createElement('div');
    profile.id = 'agent-mini-profile'; profile.className = 'agent-mini-panel active';
    profileChildren.forEach(n => profile.appendChild(n));
    body.appendChild(profile);
    ['production','rebuttal','attendance','coaching','monitoring'].forEach(tab => {
      const panel = document.createElement('div'); panel.id = `agent-mini-${tab}`; panel.className = 'agent-mini-panel';
      panel.innerHTML = `<div id="agent-${tab}-content" class="agent-empty">Loading ${tab}...</div>`;
      body.appendChild(panel);
    });
    const tabs = document.createElement('div'); tabs.id = 'agentMiniTabs'; tabs.className = 'agent-mini-tabs'; tabs.style.display = 'none';
    [['profile','Profile'],['production','Production'],['rebuttal','Rebuttal Usage'],['attendance','Attendance'],['coaching','Coaching'],['monitoring','Live Monitoring']].forEach(([key,label],i) => {
      const b = document.createElement('button'); b.type='button'; b.className='agent-mini-tab'+(i===0?' active':''); b.dataset.agentTab=key; b.textContent=label; b.onclick=()=>window.switchAgentMiniTab(key); tabs.appendChild(b);
    });
    header.insertAdjacentElement('afterend', tabs);
    return true;
  }

  function subscribe() {
    if (state.subscribed) return;
    state.subscribed = true;
    const retry = () => {
      let waiting = false;
      if (typeof window.listenForAgentReports === 'function') window.listenForAgentReports(x => { state.reports=x||[]; if(state.agentId) renderProduction(agentById(state.agentId)); }); else waiting=true;
      if (typeof window.listenToRebuttalUsage === 'function') window.listenToRebuttalUsage(x => state.rebuttals=x||[]); else waiting=true;
      if (typeof window.listenToCoaching === 'function') window.listenToCoaching(x => state.coaching=x||[]); else waiting=true;
      if (typeof window.listenToMonitoring === 'function') window.listenToMonitoring(x => state.monitoring=x||[]); else waiting=true;
      if (waiting) setTimeout(retry,800);
    };
    retry();
  }

  function hookModal() {
    if (!injectUi() || typeof window.openAgentModal !== 'function' || window.openAgentModal.__insightWrapped) return false;
    const original = window.openAgentModal;
    const wrapped = function (agentId) {
      state.agentId = agentId || null;
      const result = original.apply(this, arguments);
      const tabs = document.getElementById('agentMiniTabs');
      if (tabs) tabs.style.display = agentId ? 'flex' : 'none';
      window.switchAgentMiniTab('profile');
      subscribe();
      return result;
    };
    wrapped.__insightWrapped = true;
    window.openAgentModal = wrapped;
    return true;
  }

  installLeadHooks();
  const observer = new MutationObserver(() => hookModal());
  observer.observe(document.documentElement, { childList:true, subtree:true });
  const timer = setInterval(() => { if (hookModal()) clearInterval(timer); }, 500);
})();
