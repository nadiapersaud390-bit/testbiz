(function () {
  'use strict';

  const state = { reports: [], rebuttals: [], coaching: [], monitoring: [], agentId: null, subscribed: false };
  const esc = v => String(v == null ? '' : v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const norm = v => String(v || '').replace(/^GY[BP]\s*/i, '').trim().toLowerCase();

  function profiles() {
    if (Array.isArray(window.allAgentProfiles) && window.allAgentProfiles.length) return window.allAgentProfiles;
    try { return JSON.parse(localStorage.getItem('biz_master_roster') || '[]'); } catch (_) { return []; }
  }

  function currentAgent() {
    return profiles().find(a => String(a.userId || '') === String(state.agentId || '')) || null;
  }

  function matches(row, agent) {
    if (!row || !agent) return false;
    const aIds = [agent.userId, agent.ytelId, agent.phone, agent.ytelName].filter(Boolean).map(norm);
    const rIds = [row.userId, row.agentId, row.ytelId, row.phone].filter(Boolean).map(norm);
    if (aIds.some(id => rIds.includes(id))) return true;
    const aNames = [agent.fullName, agent.name].filter(Boolean).map(norm);
    const rNames = [row.agentName, row.repName, row.name, row.rawName].filter(Boolean).map(norm);
    return aNames.some(name => rNames.includes(name));
  }

  function isLead(row) {
    if (row == null) return false;
    if (row.dailyLeads != null || row.count != null) return Number(row.dailyLeads || row.count || 0) > 0;
    return Number(row.duration || 0) >= 120;
  }

  function leadCountForRows(rows, agent) {
    const matched = (rows || []).filter(row => matches(row, agent));
    if (!matched.length) return 0;
    if (matched.length === 1 && (matched[0].dailyLeads != null || matched[0].count != null)) {
      return Number(matched[0].dailyLeads || matched[0].count || 0);
    }
    return matched.reduce((sum, row) => sum + (isLead(row) ? 1 : 0), 0);
  }

  function parseReportDate(report) {
    const raw = String(report.reportDate || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
    let d = raw ? new Date(raw) : new Date(report.uploadedAt || 0);
    if (isNaN(d.getTime())) d = new Date(report.uploadedAt || 0);
    return d;
  }

  function dayKey(d) {
    return d.toLocaleDateString('en-CA', { timeZone: 'America/Guyana' });
  }

  function dayLabel(d) {
    return d.toLocaleDateString('en-US', { timeZone: 'America/Guyana', month: 'short', day: 'numeric', year: 'numeric' });
  }

  function mondayKey(d) {
    const x = new Date(d);
    x.setHours(0,0,0,0);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return dayKey(x);
  }

  function productionData(agent) {
    const byDay = new Map();
    state.reports.forEach(report => {
      const rows = report.data || report.agents || [];
      const count = leadCountForRows(rows, agent);
      const date = parseReportDate(report);
      if (isNaN(date.getTime())) return;
      const key = dayKey(date);
      const existing = byDay.get(key);
      if (!existing || new Date(report.uploadedAt || 0) > new Date(existing.uploadedAt || 0)) {
        byDay.set(key, {
          key,
          date,
          label: dayLabel(date),
          weekday: date.toLocaleDateString('en-US', { timeZone: 'America/Guyana', weekday: 'short' }),
          leads: count,
          team: agent.team || '',
          filename: report.filename || '',
          uploadedAt: report.uploadedAt || ''
        });
      }
    });
    const daily = Array.from(byDay.values()).sort((a,b) => b.date - a.date);
    const weekMap = new Map();
    daily.forEach(day => {
      const key = mondayKey(day.date);
      if (!weekMap.has(key)) weekMap.set(key, { key, start: new Date(key + 'T00:00:00'), leads: 0, days: 0 });
      const week = weekMap.get(key);
      week.leads += day.leads;
      week.days += 1;
    });
    const weekly = Array.from(weekMap.values()).sort((a,b) => b.start - a.start).map(week => {
      const end = new Date(week.start); end.setDate(end.getDate() + 6);
      return Object.assign(week, { label: dayLabel(week.start) + ' – ' + dayLabel(end) });
    });
    return { daily, weekly };
  }

  function addStyles() {
    if (document.getElementById('agent-insight-styles-v3')) return;
    const style = document.createElement('style');
    style.id = 'agent-insight-styles-v3';
    style.textContent = `
      #agentProfileModal .agent-modal-container{max-width:920px;width:min(94vw,920px);max-height:92vh}
      .agent-mini-tabs{display:flex;flex-wrap:wrap;gap:8px;padding:14px 28px;border-bottom:1px solid rgba(255,255,255,.08);background:rgba(2,6,23,.24)}
      .agent-mini-tab{border:1px solid rgba(148,163,184,.16);background:rgba(15,23,42,.72);color:#94a3b8;border-radius:999px;padding:9px 14px;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.07em;cursor:pointer;transition:.18s}
      .agent-mini-tab:hover{color:#e2e8f0;border-color:rgba(52,211,153,.3)}
      .agent-mini-tab.active{color:#34d399;background:rgba(16,185,129,.13);border-color:rgba(52,211,153,.42);box-shadow:0 0 18px rgba(16,185,129,.08)}
      .agent-mini-panel{display:none}.agent-mini-panel.active{display:block}
      .prod-head{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:18px;flex-wrap:wrap}
      .prod-title{font-size:15px;font-weight:900;color:#f8fafc;text-transform:uppercase;letter-spacing:.07em}.prod-subtitle{font-size:10px;color:#64748b;margin-top:4px}
      .prod-view-tabs{display:inline-flex;gap:5px;padding:4px;background:rgba(2,6,23,.62);border:1px solid rgba(148,163,184,.12);border-radius:12px}
      .prod-view-btn{border:0;background:transparent;color:#64748b;padding:8px 14px;border-radius:9px;font-size:9px;font-weight:900;text-transform:uppercase;cursor:pointer}.prod-view-btn.active{background:rgba(16,185,129,.16);color:#34d399}
      .agent-insight-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:18px}
      .agent-insight-card{position:relative;overflow:hidden;background:linear-gradient(145deg,rgba(15,23,42,.92),rgba(2,6,23,.82));border:1px solid rgba(148,163,184,.13);border-radius:18px;padding:17px}
      .agent-insight-card:before{content:'';position:absolute;inset:0 auto 0 0;width:3px;background:linear-gradient(#34d399,#06b6d4)}
      .agent-insight-label{font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:.11em;color:#64748b}.agent-insight-value{margin-top:7px;font-size:26px;font-weight:950;color:#f8fafc}
      .prod-table{border:1px solid rgba(148,163,184,.12);border-radius:16px;overflow:hidden;background:rgba(2,6,23,.35)}
      .prod-row{display:grid;grid-template-columns:minmax(170px,1.5fr) .8fr .8fr;gap:12px;align-items:center;padding:14px 16px;border-bottom:1px solid rgba(148,163,184,.08)}.prod-row:last-child{border-bottom:0}.prod-row:hover{background:rgba(15,23,42,.5)}
      .prod-date{font-size:12px;font-weight:850;color:#cbd5e1}.prod-meta{font-size:9px;color:#64748b;margin-top:3px}.prod-team{font-size:10px;font-weight:800;color:#94a3b8}.prod-leads{text-align:right;font-size:13px;font-weight:950;color:#2dd4bf}
      .agent-empty{padding:42px 20px;text-align:center;color:#64748b;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;border:1px dashed rgba(148,163,184,.16);border-radius:16px;background:rgba(2,6,23,.28)}
      @media(max-width:700px){.agent-insight-grid{grid-template-columns:1fr}.agent-mini-tabs{padding:12px 14px}.prod-row{grid-template-columns:1fr auto}.prod-team{display:none}}
    `;
    document.head.appendChild(style);
  }

  function renderProduction(agent, view) {
    const target = document.getElementById('agent-production-content');
    if (!target) return;
    const data = productionData(agent);
    const today = dayKey(new Date());
    const thisWeek = mondayKey(new Date());
    const todayTotal = (data.daily.find(d => d.key === today) || {}).leads || 0;
    const weekTotal = (data.weekly.find(w => w.key === thisWeek) || {}).leads || 0;
    const total = data.daily.reduce((sum, d) => sum + d.leads, 0);
    const selected = view || target.dataset.productionView || 'daily';
    target.dataset.productionView = selected;

    const dailyRows = data.daily.map(d => `<div class="prod-row"><div><div class="prod-date">${esc(d.label)}</div><div class="prod-meta">${esc(d.weekday)}${d.filename ? ' • ' + esc(d.filename) : ''}</div></div><div class="prod-team">${esc(d.team || '—')}</div><div class="prod-leads">${d.leads} lead${d.leads === 1 ? '' : 's'}</div></div>`).join('');
    const weeklyRows = data.weekly.map(w => `<div class="prod-row"><div><div class="prod-date">${esc(w.label)}</div><div class="prod-meta">${w.days} uploaded day${w.days === 1 ? '' : 's'}</div></div><div class="prod-team">Weekly total</div><div class="prod-leads">${w.leads} lead${w.leads === 1 ? '' : 's'}</div></div>`).join('');
    const rows = selected === 'weekly' ? weeklyRows : dailyRows;

    target.innerHTML = `
      <div class="prod-head"><div><div class="prod-title">Lead Production</div><div class="prod-subtitle">Counted directly from Agent Stats uploads • duration 120 seconds or more</div></div><div class="prod-view-tabs"><button class="prod-view-btn ${selected === 'daily' ? 'active' : ''}" data-prod-view="daily">Daily</button><button class="prod-view-btn ${selected === 'weekly' ? 'active' : ''}" data-prod-view="weekly">Weekly</button></div></div>
      <div class="agent-insight-grid"><div class="agent-insight-card"><div class="agent-insight-label">Today</div><div class="agent-insight-value">${todayTotal}</div></div><div class="agent-insight-card"><div class="agent-insight-label">This Week</div><div class="agent-insight-value">${weekTotal}</div></div><div class="agent-insight-card"><div class="agent-insight-label">Recorded Total</div><div class="agent-insight-value">${total}</div></div></div>
      ${rows ? `<div class="prod-table">${rows}</div>` : `<div class="agent-empty">No Agent Stats uploads matched this agent yet.<br><span style="display:block;margin-top:8px;text-transform:none;font-weight:600">Matching uses user ID, Ytel ID, phone, or agent name.</span></div>`}
    `;
    target.querySelectorAll('[data-prod-view]').forEach(btn => btn.addEventListener('click', () => renderProduction(agent, btn.dataset.prodView)));
  }

  function renderSimple(kind, agent) {
    const source = kind === 'rebuttal' ? state.rebuttals : (kind === 'coaching' ? state.coaching : state.monitoring);
    const items = source.filter(x => matches(x, agent));
    const target = document.getElementById(`agent-${kind}-content`);
    if (!target) return;
    target.innerHTML = items.length ? `<div class="prod-table">${items.map(x => `<div class="prod-row"><div><div class="prod-date">${esc(x.rebuttalTitle || x.discussion || x.topic || x.dialBehavior || 'Record')}</div><div class="prod-meta">${esc(x.adminName || '')}</div></div><div class="prod-team">${esc(x.status || x.eventType || '')}</div><div></div></div>`).join('')}</div>` : `<div class="agent-empty">No ${esc(kind)} records found.</div>`;
  }

  async function renderAttendance(agent) {
    const target = document.getElementById('agent-attendance-content');
    if (!target) return;
    target.innerHTML = '<div class="agent-empty">Loading attendance...</div>';
    if (typeof window.getAttendanceForDate !== 'function') { target.innerHTML = '<div class="agent-empty">Attendance service unavailable.</div>'; return; }
    const dates = Array.from({length:14}, (_,i) => { const d = new Date(); d.setDate(d.getDate()-i); return dayKey(d); });
    const snapshots = await Promise.all(dates.map(d => window.getAttendanceForDate(d).catch(() => ({}))));
    const rows = [];
    snapshots.forEach((records, i) => {
      const rec = Object.values(records || {}).find(r => matches(r, agent)) || (records || {})[agent.userId];
      if (rec) rows.push(`<div class="prod-row"><div><div class="prod-date">${esc(dates[i])}</div></div><div class="prod-team">${esc(rec.status || 'Recorded')}</div><div class="prod-leads">${esc(rec.clockedAt || rec.time || '')}</div></div>`);
    });
    target.innerHTML = rows.length ? `<div class="prod-table">${rows.join('')}</div>` : '<div class="agent-empty">No attendance records found in the last 14 days.</div>';
  }

  function render(tab) {
    const agent = currentAgent();
    if (!agent) return;
    if (tab === 'production') renderProduction(agent, 'daily');
    else if (tab === 'attendance') renderAttendance(agent);
    else renderSimple(tab, agent);
  }

  window.switchAgentMiniTab = function(tab) {
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
    const profile = document.createElement('div');
    profile.id = 'agent-mini-profile'; profile.className = 'agent-mini-panel active';
    Array.from(body.childNodes).forEach(n => profile.appendChild(n));
    body.appendChild(profile);
    ['production','rebuttal','attendance','coaching','monitoring'].forEach(tab => {
      const panel = document.createElement('div'); panel.id = `agent-mini-${tab}`; panel.className = 'agent-mini-panel';
      panel.innerHTML = `<div id="agent-${tab}-content" class="agent-empty">Loading ${tab}...</div>`;
      body.appendChild(panel);
    });
    const tabs = document.createElement('div'); tabs.id = 'agentMiniTabs'; tabs.className = 'agent-mini-tabs'; tabs.style.display = 'none';
    [['profile','Profile'],['production','Production'],['rebuttal','Rebuttal Usage'],['attendance','Attendance'],['coaching','Coaching'],['monitoring','Live Monitoring']].forEach(([key,label],i) => {
      const b = document.createElement('button'); b.type='button'; b.className='agent-mini-tab'+(i===0?' active':''); b.dataset.agentTab=key; b.textContent=label; b.addEventListener('click', () => window.switchAgentMiniTab(key)); tabs.appendChild(b);
    });
    header.insertAdjacentElement('afterend', tabs);
    return true;
  }

  function subscribe() {
    if (state.subscribed) return;
    state.subscribed = true;
    const retry = () => {
      let missing = false;
      if (typeof window.listenForAgentReports === 'function') window.listenForAgentReports(x => { state.reports = x || []; if (state.agentId && document.querySelector('.agent-mini-tab[data-agent-tab="production"].active')) renderProduction(currentAgent()); }); else missing = true;
      if (typeof window.listenToRebuttalUsage === 'function') window.listenToRebuttalUsage(x => state.rebuttals = x || []); else missing = true;
      if (typeof window.listenToCoaching === 'function') window.listenToCoaching(x => state.coaching = x || []); else missing = true;
      if (typeof window.listenToMonitoring === 'function') window.listenToMonitoring(x => state.monitoring = x || []); else missing = true;
      if (missing) setTimeout(retry, 900);
    };
    retry();
  }

  function hookModal() {
    if (!injectUi() || typeof window.openAgentModal !== 'function' || window.openAgentModal.__insightWrapped) return false;
    const original = window.openAgentModal;
    const wrapped = function(agentId) {
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

  const observer = new MutationObserver(hookModal);
  observer.observe(document.documentElement, { childList:true, subtree:true });
  const timer = setInterval(() => { subscribe(); if (hookModal()) clearInterval(timer); }, 500);
})();
