// ============================================================
//  BIZ Admin Panel — adminpanel.js
//  Lead Upload · 120s Quality Check · Session Timer · Push to Dashboard · History
// ============================================================

// ── State ──────────────────────────────────────────────────────────────────────
let apRawRows     = [];   // All parsed rows from file
let apHeaders     = [];   // Column headers
let apQualified   = [];   // Rows passing 120s filter (GYB/GYP only)
let apAgentMap    = {};   // { agentName: { ytelId, team, count, calls[] } }
let apTimerEnd    = null; // Date when session expires
let apTimerTick   = null; // setInterval handle
let apSessionMins = null; // chosen duration in minutes

const AP_STORAGE_KEY   = 'biz_ap_session_v1';
const AP_HISTORY_KEY   = 'biz_ap_history_v1';
const AP_DASHBOARD_KEY = 'biz_ap_dashboard_v1'; // what dashboard reads

// ── Init ───────────────────────────────────────────────────────────────────────
function initAdminPanel() {
  const role = sessionStorage.getItem('bizUserRole');
  if (role !== 'admin') {
    document.getElementById('adminpanel-wrap').innerHTML =
      '<div style="text-align:center;padding:60px 20px;"><div style="font-size:40px;margin-bottom:14px;">🔐</div><div style="font-family:\'Orbitron\',sans-serif;font-size:13px;font-weight:900;color:#ef4444;text-transform:uppercase;letter-spacing:0.1em;">Admin Access Required</div></div>';
    return;
  }
  apLoadHistory();
  apRestoreSession();
  apUpdateSessionLabel();
}

// ── File Handling ──────────────────────────────────────────────────────────────
function apDragOver(e) {
  e.preventDefault();
  document.getElementById('ap-dropzone').classList.add('drag-over');
}
function apDragLeave() {
  document.getElementById('ap-dropzone').classList.remove('drag-over');
}
function apDrop(e) {
  e.preventDefault();
  apDragLeave();
  const file = e.dataTransfer.files[0];
  if (file) apHandleFile(file);
}

function apHandleFile(file) {
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'csv') {
    const reader = new FileReader();
    reader.onload = (e) => apParseCSV(e.target.result, file.name);
    reader.readAsText(file);
  } else if (ext === 'xlsx' || ext === 'xls') {
    apLoadSheetJS(() => {
      const reader = new FileReader();
      reader.onload = (e) => apParseExcel(e.target.result, file.name);
      reader.readAsArrayBuffer(file);
    });
  } else {
    apShowDropError('Unsupported file type. Use CSV or Excel (.xlsx/.xls)');
  }
}

function apLoadSheetJS(cb) {
  if (window.XLSX) { cb(); return; }
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  s.onload = cb;
  document.head.appendChild(s);
}

function apParseCSV(text, filename) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) { apShowDropError('File appears empty.'); return; }

  // Detect delimiter (comma or tab or semicolon or pipe)
  const delim = [',', '\t', ';', '|'].find(d => lines[0].split(d).length > 2) || ',';
  const headers = lines[0].split(delim).map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = lines.slice(1).map(line => {
    const vals = line.split(delim).map(v => v.trim().replace(/^"|"$/g, ''));
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] !== undefined ? vals[i] : ''; });
    return obj;
  }).filter(r => Object.values(r).some(v => v !== ''));

  apRawRows  = rows;
  apHeaders  = headers;
  apShowMapper(filename, rows.length);
}

function apParseExcel(buffer, filename) {
  const wb   = XLSX.read(buffer, { type: 'array' });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
  if (!data.length) { apShowDropError('Excel file appears empty.'); return; }

  apRawRows = data;
  apHeaders = Object.keys(data[0]);
  apShowMapper(filename, data.length);
}

function apShowDropError(msg) {
  const dz = document.getElementById('ap-dropzone');
  document.getElementById('ap-dz-icon').textContent = '❌';
  document.getElementById('ap-dz-title').textContent = msg;
  document.getElementById('ap-dz-sub').textContent = 'Click to try again';
}

function apShowMapper(filename, count) {
  // Update dropzone
  const dz = document.getElementById('ap-dropzone');
  dz.classList.add('loaded');
  document.getElementById('ap-dz-icon').textContent = '✅';
  document.getElementById('ap-dz-title').textContent = filename;
  document.getElementById('ap-dz-sub').textContent = count + ' rows loaded — map your columns below';

  // Populate selects
  const selects = ['ap-col-name', 'ap-col-ytelid', 'ap-col-duration', 'ap-col-team'];
  selects.forEach(id => {
    const sel = document.getElementById(id);
    sel.innerHTML = '<option value="">(select column)</option>' +
      apHeaders.map(h => `<option value="${h}">${h}</option>`).join('');
  });

  // Auto-detect common column names
  apAutoSelect('ap-col-name',     ['agent name', 'name', 'agent', 'rep name', 'representative', 'full name']);
  apAutoSelect('ap-col-ytelid',   ['ytel id', 'ytelid', 'user id', 'userid', 'agent id', 'agentid', 'id']);
  apAutoSelect('ap-col-duration', ['duration', 'call duration', 'call_duration', 'dur', 'seconds', 'time', 'talk time', 'talktime']);
  apAutoSelect('ap-col-team',     ['team', 'prefix', 'ytel name', 'ytelname', 'agent code']);

  document.getElementById('ap-col-mapper').style.display = 'block';
}

function apAutoSelect(selectId, candidates) {
  const sel = document.getElementById(selectId);
  for (const cand of candidates) {
    const opt = Array.from(sel.options).find(o => o.value.toLowerCase().replace(/[\s_-]/g,'') === cand.replace(/[\s_-]/g,''));
    if (opt) { sel.value = opt.value; return; }
  }
}

// ── Process / Filter ───────────────────────────────────────────────────────────
function apProcessLeads() {
  const nameCol     = document.getElementById('ap-col-name').value;
  const ytelIdCol   = document.getElementById('ap-col-ytelid').value;
  const durationCol = document.getElementById('ap-col-duration').value;
  const teamCol     = document.getElementById('ap-col-team').value;

  if (!nameCol || !durationCol) {
    alert('Please map at least the Agent Name and Duration columns.');
    return;
  }

  const MIN_DURATION = 120; // seconds

  // Filter: GYB/GYP agents AND duration >= 120s
  const qualified = [];
  const agentMap  = {};

  apRawRows.forEach(row => {
    const rawName  = String(row[nameCol] || '').trim();
    const rawId    = ytelIdCol ? String(row[ytelIdCol] || '').trim() : '';
    const rawDur   = String(row[durationCol] || '').trim();
    const rawTeam  = teamCol ? String(row[teamCol] || '').trim() : '';

    if (!rawName) return;

    // Determine team prefix — from team col or from name prefix
    let prefix = '';
    if (rawTeam) {
      const m = rawTeam.match(/^(GYB|GYP)/i);
      if (m) prefix = m[1].toUpperCase();
    }
    if (!prefix) {
      const m = rawName.match(/^(GYB|GYP)/i);
      if (m) prefix = m[1].toUpperCase();
    }
    if (!prefix) return; // Skip non-GYB/GYP

    // Parse duration — handles "120", "2:00", "00:02:00", "120.5"
    const dur = apParseDuration(rawDur);
    if (dur < MIN_DURATION) return;

    // Clean agent name (strip prefix for display)
    const cleanName = rawName.replace(/^GY[BP]\s*/i, '').trim();

    qualified.push({ name: cleanName, prefix, ytelId: rawId, duration: dur, raw: row });

    if (!agentMap[cleanName]) {
      agentMap[cleanName] = { name: cleanName, prefix, ytelId: rawId, team: prefix === 'GYB' ? 'BB' : 'PR', count: 0, calls: [] };
    }
    agentMap[cleanName].count++;
    agentMap[cleanName].calls.push({ duration: dur, row });
  });

  apQualified = qualified;
  apAgentMap  = agentMap;

  // Stats
  document.getElementById('ap-stat-total').textContent     = apRawRows.length;
  document.getElementById('ap-stat-qualified').textContent  = qualified.length;
  document.getElementById('ap-stat-filtered').textContent   = apRawRows.length - qualified.length;
  document.getElementById('ap-upload-stats').style.display  = 'block';

  // Render quality section
  apRenderQualityResults();
  document.getElementById('ap-quality-section').style.display = 'block';
  document.getElementById('ap-timer-section').style.display   = 'block';
  document.getElementById('ap-push-section').style.display    = 'block';

  apRenderPushPreview();
  document.getElementById('ap-push-status').textContent = '';
}

function apParseDuration(val) {
  if (!val) return 0;
  const s = String(val).trim();
  // "HH:MM:SS"
  const hms = s.match(/^(\d+):(\d+):(\d+)$/);
  if (hms) return parseInt(hms[1])*3600 + parseInt(hms[2])*60 + parseInt(hms[3]);
  // "MM:SS"
  const ms = s.match(/^(\d+):(\d+)$/);
  if (ms) return parseInt(ms[1])*60 + parseInt(ms[2]);
  // plain number
  const n = parseFloat(s);
  return isNaN(n) ? 0 : Math.floor(n);
}

// ── Quality Results ────────────────────────────────────────────────────────────
function apRenderQualityResults() {
  const container = document.getElementById('ap-quality-results');
  const agents = Object.values(apAgentMap).sort((a,b) => b.count - a.count);

  if (!agents.length) {
    container.innerHTML = '<div style="text-align:center;padding:20px;font-size:12px;font-weight:700;color:#334155;">No qualifying calls found (GYB/GYP + ≥120s)</div>';
    return;
  }

  container.innerHTML = agents.map((agent, idx) => {
    const teamColor = agent.prefix === 'GYB' ? '#c084fc' : '#a78bfa';
    const teamLabel = agent.prefix === 'GYB' ? 'BERB' : 'PROV';
    const callsHtml = agent.calls.map(c => {
      const m = Math.floor(c.duration / 60);
      const s = c.duration % 60;
      return `<div class="ap-call-row">
        <span>Call</span>
        <span style="font-family:'Orbitron',sans-serif;font-size:11px;color:#22c55e;">${m}m ${s}s</span>
        <span style="color:#22c55e;">${c.duration}s ✓</span>
      </div>`;
    }).join('');

    return `<div class="ap-agent-card">
      <div class="ap-agent-header" onclick="apToggleAgent('ap-calls-${idx}', this)">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:16px;font-weight:900;font-family:'Orbitron',sans-serif;color:#334155;">${String(idx+1).padStart(2,'0')}</span>
          <div>
            <div style="font-weight:900;font-size:13px;color:white;text-transform:uppercase;">${agent.name}</div>
            <div style="font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:0.1em;margin-top:2px;">
              <span style="background:rgba(${agent.prefix==='GYB'?'192,132,252':'167,139,250'},0.15);border:1px solid rgba(${agent.prefix==='GYB'?'192,132,252':'167,139,250'},0.3);border-radius:4px;padding:1px 6px;color:${teamColor};">${teamLabel}</span>
              ${agent.ytelId ? `<span style="color:#475569;margin-left:6px;">ID: ${agent.ytelId}</span>` : ''}
            </div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="text-align:right;">
            <div style="font-family:'Orbitron',sans-serif;font-size:20px;font-weight:900;color:#22c55e;">${agent.count}</div>
            <div style="font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:0.1em;color:#475569;">Qual. Leads</div>
          </div>
          <span id="ap-chevron-${idx}" style="color:#475569;font-size:14px;transition:transform 0.2s;">▼</span>
        </div>
      </div>
      <div id="ap-calls-${idx}" class="ap-agent-calls">
        <div style="font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:0.1em;color:#475569;margin-bottom:8px;padding-top:4px;border-top:1px solid rgba(255,255,255,0.05);">Call Breakdown</div>
        ${callsHtml}
      </div>
    </div>`;
  }).join('');
}

function apToggleAgent(callsId, header) {
  const el = document.getElementById(callsId);
  const idx = callsId.replace('ap-calls-','');
  const chev = document.getElementById('ap-chevron-' + idx);
  if (el.style.display === 'block') {
    el.style.display = 'none';
    if (chev) chev.style.transform = 'rotate(0deg)';
  } else {
    el.style.display = 'block';
    if (chev) chev.style.transform = 'rotate(180deg)';
  }
}

// ── Session Timer ──────────────────────────────────────────────────────────────
function apSetTimer(mins) {
  apSessionMins = mins;
  // Highlight selected button
  document.querySelectorAll('.ap-timer-btn').forEach(b => b.classList.remove('selected'));
  event.target.classList.add('selected');
  apStartTimer(mins);
}

function apSetCustomTimer() {
  const val = parseInt(document.getElementById('ap-custom-timer').value);
  if (!val || val < 1) { alert('Enter a valid number of minutes (1–1440)'); return; }
  apSessionMins = val;
  document.querySelectorAll('.ap-timer-btn').forEach(b => b.classList.remove('selected'));
  apStartTimer(val);
}

function apStartTimer(mins) {
  if (apTimerTick) clearInterval(apTimerTick);
  apTimerEnd = new Date(Date.now() + mins * 60 * 1000);

  const display = document.getElementById('ap-timer-display');
  display.style.display = 'flex';
  document.getElementById('ap-timer-until').textContent =
    apTimerEnd.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', timeZone:'America/Guyana' }) + ' Guyana';

  apTickTimer();
  apTimerTick = setInterval(apTickTimer, 1000);
  apUpdateSessionLabel();
  apPersistSession();
}

function apTickTimer() {
  if (!apTimerEnd) return;
  const remaining = apTimerEnd - Date.now();
  if (remaining <= 0) {
    clearInterval(apTimerTick);
    document.getElementById('ap-timer-countdown').textContent = 'Expired';
    document.getElementById('ap-timer-countdown').style.color = '#ef4444';
    apClearDashboardData();
    return;
  }
  const h = Math.floor(remaining / 3600000);
  const m = Math.floor((remaining % 3600000) / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  const txt = h > 0
    ? h + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0')
    : m + ':' + String(s).padStart(2,'0');
  document.getElementById('ap-timer-countdown').textContent = txt;
  document.getElementById('ap-timer-countdown').style.color = remaining < 300000 ? '#ef4444' : '#facc15';
}

// ── Push to Dashboard ──────────────────────────────────────────────────────────
function apRenderPushPreview() {
  const agents = Object.values(apAgentMap).sort((a,b) => b.count - a.count);
  const preview = document.getElementById('ap-push-preview');

  if (!agents.length) { preview.innerHTML = ''; return; }

  preview.innerHTML = `
    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:12px 14px;max-height:200px;overflow-y:auto;">
      <div style="font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:0.1em;color:#64748b;margin-bottom:10px;">Preview — ${agents.length} agents will be updated</div>
      ${agents.map(a => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
          <span style="font-size:12px;font-weight:700;color:white;">${a.name}</span>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:9px;font-weight:900;text-transform:uppercase;color:${a.prefix==='GYB'?'#c084fc':'#a78bfa'};">${a.prefix==='GYB'?'BERB':'PROV'}</span>
            <span style="font-family:'Orbitron',sans-serif;font-size:14px;font-weight:900;color:#22c55e;">${a.count}</span>
          </div>
        </div>`).join('')}
    </div>`;
}

function apPushToDashboard() {
  if (!Object.keys(apAgentMap).length) {
    alert('No qualified leads to push. Process a file first.');
    return;
  }

  const btn = document.getElementById('ap-push-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Pushing...';

  // Save previous dashboard data to history first
  apSaveCurrentToHistory();

  // Build the data object that dashboard.js will read
  const pushData = {
    dateLabel: typeof getFormattedDate === 'function' ? getFormattedDate() : new Date().toLocaleDateString(),
    pushedAt:  Date.now(),
    pushedBy:  sessionStorage.getItem('bizAdminName') || 'admin',
    expiresAt: apTimerEnd ? apTimerEnd.getTime() : null,
    agents:    Object.values(apAgentMap).map(a => ({
      name:       a.name,
      ytelId:     a.ytelId,
      team:       a.team,
      prefix:     a.prefix,
      dailyLeads: a.count
    }))
  };

  if (typeof window.saveLiveDashboardState === 'function') {
      window.saveLiveDashboardState(pushData);
  }

  if (typeof window.writeAdminActivityLog === 'function') {
      window.writeAdminActivityLog('file_upload', 'Pushed new lead data to dashboard. Update included ' + Object.keys(apAgentMap).length + ' agents.');
  }

  // Signal the global agents array to refresh with this data
  apInjectIntoDashboard(pushData);

  btn.disabled = false;
  btn.textContent = '🚀 Push Lead Counts to Dashboard';
  document.getElementById('ap-push-status').textContent = '✅ Pushed at ' + new Date().toLocaleTimeString('en-US', { timeZone: 'America/Guyana' }) + ' Guyana time';
  apPersistSession();
}

/**
 * Injects pushed lead counts directly into the live `agents` array
 * so the dashboard leaderboard refreshes immediately without waiting
 * for the next API poll.
 */
function apInjectIntoDashboard(pushData) {
  if (typeof agents === 'undefined' || !Array.isArray(agents)) return;

  Object.values(pushData.agents).forEach(pushed => {
    // Match by ytelId first, then by name
    let match = agents.find(a => pushed.ytelId && String(a.ytelId||'').trim() === String(pushed.ytelId).trim());
    if (!match) {
      match = agents.find(a => {
        const clean = (n) => String(n||'').replace(/^GY[BP]\s*/i,'').trim().toLowerCase();
        return clean(a.name) === clean(pushed.name);
      });
    }
    if (match) {
      match.dailyLeads = pushed.dailyLeads;
    } else {
      // Agent not in current list — add them
      agents.push({
        name:        pushed.prefix + ' ' + pushed.name,
        ytelId:      pushed.ytelId,
        team:        pushed.team,
        dailyLeads:  pushed.dailyLeads,
        weeklyLeads: 0
      });
    }
  });

  // Re-render the dashboard immediately
  if (typeof render === 'function') render();
  if (typeof checkLeadAlerts === 'function') checkLeadAlerts(agents);
}

// ── History ────────────────────────────────────────────────────────────────────
async function apSaveCurrentToHistory() {
  const existing = apGetDashboardData();
  if (!existing || !existing.agents || !Object.keys(existing.agents).length) return;

  // 🔥 FIX: Derive dayOfWeek from the data's actual date (existing.dateLabel),
  // not from "today". Previously this stamped saved reports with today's day,
  // so e.g. Monday's pushed data got tagged as "TUE" when Tuesday's push saved
  // it to history — making the Weekly tab drop Monday's totals entirely.
  const reportDateStr = existing.dateLabel || (typeof getFormattedDate === 'function' ? getFormattedDate() : new Date().toLocaleDateString());
  const _dayMap = { 0:'SUN', 1:'MON', 2:'TUE', 3:'WED', 4:'THU', 5:'FRI', 6:'SAT' };
  let derivedDay = null;
  try {
    const cleanDate = String(reportDateStr).replace(/\s*\([^)]*\)\s*$/, '').trim();
    const dObj = new Date(cleanDate);
    if (!isNaN(dObj.getTime())) derivedDay = _dayMap[dObj.getDay()];
  } catch (e) {}
  const reportDayOfWeek = derivedDay || (typeof getGuyanaDayName === 'function' ? getGuyanaDayName() : 'MON');

  const reportObj = {
    reportDate: reportDateStr,
    dayOfWeek: reportDayOfWeek,
    uploadedAt: new Date().toISOString(),
    pushedAt: existing.pushedAt,
    expiresAt: existing.expiresAt,
    totalAgents: (existing.agents || []).length || 0,
    totalLeads: (existing.agents || []).reduce((s, a) => s + (a.dailyLeads || 0), 0),
    data: (existing.agents || []).map(a => ({
        agentName: a.name,
        ytelId: a.ytelId,
        team: a.team,
        prefix: a.prefix,
        dailyLeads: a.dailyLeads
    }))
  };

  if (typeof window.saveAgentReportToFirebase === 'function') {
      await window.saveAgentReportToFirebase(reportObj);
  }
}

function apGetHistory() {
  try { return JSON.parse(localStorage.getItem(AP_HISTORY_KEY) || '[]'); } catch(e) { return []; }
}

function apGetDashboardData() {
  try {
    const raw = localStorage.getItem(AP_DASHBOARD_KEY) || sessionStorage.getItem(AP_DASHBOARD_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch(e) { return null; }
}

window.apHistoryData = []; // Store for restoration
function apLoadHistory() {
  if (typeof window.listenForAgentReports === 'function') {
      // Setup listener only once
      if (!window._apHistorySubscribed) {
          window.listenForAgentReports(data => {
              window.apHistoryData = data || [];
              apRenderHistoryList(window.apHistoryData);
          });
          window._apHistorySubscribed = true;
      } else {
          apRenderHistoryList(window.apHistoryData);
      }
  }
}

function apRenderHistoryList(history) {
  const container = document.getElementById('ap-history-list');
  if (!container) return;
  
  if (!history.length) {
    container.innerHTML = '<div style="text-align:center;padding:20px;font-size:12px;font-weight:700;color:#334155;">No global uploads yet</div>';
    return;
  }

  container.innerHTML = history.map((entry, idx) => {
    const d = new Date(entry.uploadedAt);
    const timeStr = d.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', timeZone:'America/Guyana' });
    const expired = entry.expiresAt && Date.now() > entry.expiresAt;

    return `<div class="ap-history-card">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
        <div>
          <div style="font-size:12px;font-weight:900;color:white;">${entry.reportDate} <span style="color:#64748b;font-weight:600;margin-left:4px;">${timeStr}</span></div>
          <div style="font-size:10px;font-weight:600;color:#475569;margin-top:2px;">${entry.totalAgents} agents · ${entry.totalLeads} total leads</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          ${expired ? '<span style="font-size:9px;font-weight:900;text-transform:uppercase;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:6px;padding:2px 7px;color:#ef4444;">Expired</span>' : '<span style="font-size:9px;font-weight:900;text-transform:uppercase;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:6px;padding:2px 7px;color:#22c55e;">Synced</span>'}
          <button onclick="apRestoreUpload('${entry.id}')" style="font-size:9px;font-weight:900;text-transform:uppercase;background:rgba(250,204,21,0.1);border:1px solid rgba(250,204,21,0.25);border-radius:7px;padding:4px 9px;color:#facc15;cursor:pointer;letter-spacing:0.06em;">Restore</button>
          <button onclick="apDeleteHistory('${entry.id}')" style="font-size:9px;font-weight:900;text-transform:uppercase;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:7px;padding:4px 9px;color:#ef4444;cursor:pointer;">Delete</button>
        </div>
      </div>
      <div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px;">
        ${(entry.data || []).sort((a,b)=>(b.dailyLeads||0)-(a.dailyLeads||0)).slice(0,6).map(a =>
          `<span style="font-size:10px;font-weight:700;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:3px 9px;color:#94a3b8;">${(a.agentName || '').split(' ')[0]} <span style="color:${a.prefix==='GYB'?'#c084fc':'#a78bfa'}">${a.dailyLeads}</span></span>`
        ).join('')}
        ${(entry.data || []).length > 6 ? `<span style="font-size:10px;font-weight:700;color:#475569;">+${(entry.data || []).length - 6} more</span>` : ''}
      </div>
    </div>`;
  }).join('');
}

function apRestoreUpload(idx) {
  const history = apGetHistory();
  if (!history[idx]) return;
  const entry = history[idx];

  // Rebuild apAgentMap from saved data
  apAgentMap = {};
  Object.values(entry.agents).forEach(a => {
    apAgentMap[a.name] = {
      name:    a.name,
      ytelId:  a.ytelId,
      team:    a.team,
      prefix:  a.prefix,
      count:   a.dailyLeads,
      calls:   []
    };
  });
  apQualified = [];

  // Show sections
  document.getElementById('ap-quality-section').style.display = 'block';
  document.getElementById('ap-timer-section').style.display   = 'block';
  document.getElementById('ap-push-section').style.display    = 'block';

  apRenderQualityResults();
  apRenderPushPreview();

  document.getElementById('ap-upload-stats').style.display = 'block';
  document.getElementById('ap-stat-total').textContent     = Object.keys(entry.agents).length;
  document.getElementById('ap-stat-qualified').textContent  = Object.values(entry.agents).reduce((s,a) => s+(a.dailyLeads||0),0);
  document.getElementById('ap-stat-filtered').textContent   = '—';

  // Update dropzone
  const dz = document.getElementById('ap-dropzone');
  dz.classList.add('loaded');
  document.getElementById('ap-dz-icon').textContent  = '🔄';
  document.getElementById('ap-dz-title').textContent = 'Restored from history';
  document.getElementById('ap-dz-sub').textContent   = new Date(entry.savedAt).toLocaleString('en-US', { timeZone:'America/Guyana' });
  document.getElementById('ap-col-mapper').style.display = 'none';

  document.getElementById('ap-push-status').textContent = '⬆️ History restored — re-push to update dashboard';
}

function apDeleteHistory(idx) {
  const history = apGetHistory();
  history.splice(idx, 1);
  try { localStorage.setItem(AP_HISTORY_KEY, JSON.stringify(history)); } catch(e) {}
  apLoadHistory();
}

function apClearHistory() {
  if (!confirm('Clear all upload history? This cannot be undone.')) return;
  try { localStorage.removeItem(AP_HISTORY_KEY); } catch(e) {}
  apLoadHistory();
}

// ── Session Persistence ────────────────────────────────────────────────────────
function apPersistSession() {
  const session = {
    agentMap:  apAgentMap,
    timerEnd:  apTimerEnd ? apTimerEnd.getTime() : null,
    sessionMins: apSessionMins
  };
  try { sessionStorage.setItem(AP_STORAGE_KEY, JSON.stringify(session)); } catch(e) {}
}

function apRestoreSession() {
  try {
    const raw = sessionStorage.getItem(AP_STORAGE_KEY);
    if (!raw) return;
    const session = JSON.parse(raw);

    if (session.agentMap && Object.keys(session.agentMap).length) {
      apAgentMap    = session.agentMap;
      apSessionMins = session.sessionMins;

      if (session.timerEnd && Date.now() < session.timerEnd) {
        apTimerEnd = new Date(session.timerEnd);
        if (apTimerTick) clearInterval(apTimerTick);
        const display = document.getElementById('ap-timer-display');
        display.style.display = 'flex';
        document.getElementById('ap-timer-until').textContent =
          apTimerEnd.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', timeZone:'America/Guyana' }) + ' Guyana';
        apTickTimer();
        apTimerTick = setInterval(apTickTimer, 1000);
      }

      document.getElementById('ap-quality-section').style.display = 'block';
      document.getElementById('ap-timer-section').style.display   = 'block';
      document.getElementById('ap-push-section').style.display    = 'block';
      apRenderQualityResults();
      apRenderPushPreview();

      // Update dropzone to reflect session restore
      document.getElementById('ap-dz-icon').textContent  = '🔄';
      document.getElementById('ap-dz-title').textContent = 'Session Restored';
      document.getElementById('ap-dz-sub').textContent   = Object.keys(apAgentMap).length + ' agents from previous session';
      document.getElementById('ap-dropzone').classList.add('loaded');

      document.getElementById('ap-upload-stats').style.display = 'block';
      document.getElementById('ap-stat-total').textContent     = Object.keys(apAgentMap).length;
      document.getElementById('ap-stat-qualified').textContent  = Object.values(apAgentMap).reduce((s,a) => s+(a.count||0),0);
      document.getElementById('ap-stat-filtered').textContent   = '—';
    }
  } catch(e) {}
}

function apClearDashboardData() {
  try { localStorage.removeItem(AP_DASHBOARD_KEY); } catch(e) {}
  try { sessionStorage.removeItem(AP_DASHBOARD_KEY); } catch(e) {}
}

function apUpdateSessionLabel() {
  const label = document.getElementById('ap-session-label');
  if (!label) return;
  if (!apTimerEnd || Date.now() >= apTimerEnd) {
    label.textContent = 'No active session';
    label.style.color = '#64748b';
  } else {
    const m = Math.ceil((apTimerEnd - Date.now()) / 60000);
    label.textContent = m > 60 ? Math.ceil(m/60) + 'h remaining' : m + 'm remaining';
    label.style.color = m < 10 ? '#ef4444' : '#facc15';
  }
}

// Update session label every 30s
setInterval(apUpdateSessionLabel, 30000);
