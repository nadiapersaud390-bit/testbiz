// js/tracker.js
// Agent Lead Tracker — Firebase only, no localStorage
// Agents manage their own tracker. Admins get a read-only view of every agent tracker.

let trackerWeeks = {};
let trackerCurrentWeekId = null;
let trackerUnsubscribe = null;
let trackerRosterUnsubscribe = null;
let trackerAllAgentLeads = {};
let trackerAgentRoster = [];
let trackerSelectedAgentId = null;
let trackerIsAdmin = false;

window.initTracker = function() {
    const profile = _trackerReadSession('currentAgentProfile');
    const cAdmin = _trackerReadSession('currentAdmin');
    const role = String(sessionStorage.getItem('bizUserRole') || '').toLowerCase();

    trackerIsAdmin = role === 'admin' || !!cAdmin.email || cAdmin.role === 'admin' || cAdmin.role === 'super_admin' || cAdmin.isSuper === true;

    _trackerStopListeners();
    trackerCurrentWeekId = null;

    if (trackerIsAdmin) {
        _trackerSetupAdminMode();
        _trackerInitAdminView();
        return;
    }

    _trackerSetupAgentMode();
    const ytelId = String(profile.ytelId || profile.userId || '').trim();

    if (!ytelId) {
        const c = document.getElementById('tracker-days-container');
        if (c) c.innerHTML = _trackerMessage('Not logged in or agent ID is missing.', 'red');
        return;
    }

    if (typeof window.listenForAgentLeads !== 'function') {
        setTimeout(window.initTracker, 500);
        return;
    }

    trackerUnsubscribe = window.listenForAgentLeads(ytelId, (data) => {
        trackerWeeks = data || {};
        renderTrackerWeekSelect();
        renderTrackerDays();
    });
};

function _trackerInitAdminView() {
    const hasLeadsListener = typeof window.listenForAllAgentLeads === 'function';
    const hasRosterListener = typeof window.listenForMasterRoster === 'function';

    if (!hasLeadsListener || !hasRosterListener) {
        setTimeout(window.initTracker, 500);
        return;
    }

    trackerAgentRoster = [];
    trackerAllAgentLeads = {};
    trackerWeeks = {};
    trackerSelectedAgentId = null;

    trackerUnsubscribe = window.listenForAllAgentLeads((data) => {
        trackerAllAgentLeads = data || {};
        if (trackerSelectedAgentId) {
            trackerWeeks = trackerAllAgentLeads[trackerSelectedAgentId] || {};
            renderTrackerWeekSelect();
            renderTrackerDays();
            _trackerRenderViewingBanner();
        }
        _trackerRenderAdminSummary();
        _trackerRenderAgentList();
    });

    trackerRosterUnsubscribe = window.listenForMasterRoster((rosterData) => {
        let roster = [];
        if (Array.isArray(rosterData)) roster = rosterData;
        else if (rosterData && typeof rosterData === 'object') roster = Object.values(rosterData);

        trackerAgentRoster = roster.filter(Boolean);
        _trackerRenderAdminSummary();
        _trackerRenderAgentList();
        if (trackerSelectedAgentId) _trackerRenderViewingBanner();
    });
}

window.trackerSelectAgent = function(encodedAgentId) {
    if (!trackerIsAdmin) return;

    let agentId = '';
    try { agentId = decodeURIComponent(encodedAgentId || ''); }
    catch (e) { agentId = String(encodedAgentId || ''); }
    agentId = agentId.trim();
    if (!agentId) return;

    trackerSelectedAgentId = agentId;
    trackerWeeks = trackerAllAgentLeads[agentId] || {};
    trackerCurrentWeekId = null;

    _trackerRenderAgentList();
    renderTrackerWeekSelect();
    renderTrackerDays();
    _trackerRenderViewingBanner();
};

window.trackerFilterAgents = function() {
    _trackerRenderAgentList();
};

window.trackerStartNewWeek = async function() {
    if (trackerIsAdmin) return;

    const ytelId = _getTrackerUserId();
    if (!ytelId) return;

    const now = new Date();
    const day = now.getDay() || 7;
    if (day !== 1) now.setDate(now.getDate() - (day - 1));

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const date = String(now.getDate()).padStart(2, '0');
    const weekId = `week_${year}_${month}_${date}`;
    const label = `Week of ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

    if (!trackerWeeks[weekId]) {
        const newWeek = { id: weekId, label, createdAt: new Date().toISOString(), leads: [] };
        const result = await window.saveAgentLeadsToFirebase(ytelId, weekId, newWeek);
        if (result && result.success === false) {
            showTrackerError('Could not create the week. Please try again.');
            return;
        }
    }

    trackerCurrentWeekId = weekId;
    renderTrackerWeekSelect();
    renderTrackerDays();
};

window.trackerDeleteWeek = async function() {
    if (trackerIsAdmin || !trackerCurrentWeekId) return;
    if (!confirm('Delete this entire week of leads? This cannot be undone.')) return;

    const ytelId = _getTrackerUserId();
    if (!ytelId) return;

    await window.deleteAgentWeekFromFirebase(ytelId, trackerCurrentWeekId);
    trackerCurrentWeekId = null;
};

window.trackerSelectWeek = function() {
    const sel = document.getElementById('tracker-week-select');
    trackerCurrentWeekId = sel && sel.value ? sel.value : null;
    renderTrackerDays();

    const delBtn = document.getElementById('tracker-del-week-btn');
    if (delBtn) delBtn.classList.toggle('hidden', trackerIsAdmin || !trackerCurrentWeekId);
};

window.trackerAddLead = async function() {
    if (trackerIsAdmin) return;
    if (!trackerCurrentWeekId) {
        showTrackerError('Please select or start a week first.');
        return;
    }

    const fnameEl = document.getElementById('tl-fname');
    const lnameEl = document.getElementById('tl-lname');
    const phoneEl = document.getElementById('tl-phone');
    const goodEl = document.getElementById('tl-good');

    const fname = fnameEl ? fnameEl.value.trim() : '';
    const lname = lnameEl ? lnameEl.value.trim() : '';
    const phone = phoneEl ? phoneEl.value.trim() : '';
    const isGood = !!(goodEl && goodEl.checked);

    if (!phone) {
        showTrackerError('Phone number is required. First and last name are optional.');
        if (phoneEl) phoneEl.focus();
        return;
    }

    const ytelId = _getTrackerUserId();
    if (!ytelId) return;

    const now = new Date();
    const newLead = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        fname,
        lname,
        phone,
        isGood,
        dayStr: now.toLocaleDateString('en-US', { weekday: 'long' }),
        dateStr: now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        addedAt: now.toISOString()
    };

    const week = trackerWeeks[trackerCurrentWeekId];
    if (!week) return;
    if (!Array.isArray(week.leads)) week.leads = [];
    week.leads.push(newLead);

    const submitBtn = document.getElementById('tl-submit-btn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Saving...';
    }

    const result = await window.saveAgentLeadsToFirebase(ytelId, trackerCurrentWeekId, week);

    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Add Lead';
    }

    if (result && result.success === false) {
        week.leads = week.leads.filter(l => l.id !== newLead.id);
        showTrackerError('Lead could not be saved. Please try again.');
        return;
    }

    if (fnameEl) fnameEl.value = '';
    if (lnameEl) lnameEl.value = '';
    if (phoneEl) phoneEl.value = '';
    if (goodEl) goodEl.checked = false;
    showTrackerError('Lead saved.', 'success');
    renderTrackerDays();
};

window.trackerToggleGood = async function(encodedLeadId, checkboxElem) {
    if (trackerIsAdmin || !trackerCurrentWeekId) return;

    const leadId = _trackerDecode(encodedLeadId);
    const ytelId = _getTrackerUserId();
    const week = trackerWeeks[trackerCurrentWeekId];
    if (!week || !Array.isArray(week.leads)) return;

    const lead = week.leads.find(l => String(l.id) === leadId);
    if (lead) {
        lead.isGood = checkboxElem.checked;
        await window.saveAgentLeadsToFirebase(ytelId, trackerCurrentWeekId, week);
    }
};

window.trackerDeleteLead = async function(encodedLeadId) {
    if (trackerIsAdmin || !trackerCurrentWeekId) return;
    if (!confirm('Delete this lead?')) return;

    const leadId = _trackerDecode(encodedLeadId);
    const ytelId = _getTrackerUserId();
    const week = trackerWeeks[trackerCurrentWeekId];
    if (!week || !Array.isArray(week.leads)) return;

    week.leads = week.leads.filter(l => String(l.id) !== leadId);
    await window.saveAgentLeadsToFirebase(ytelId, trackerCurrentWeekId, week);
    renderTrackerDays();
};

// ── Mode setup ────────────────────────────────────────────────────────────

function _trackerSetupAgentMode() {
    const title = document.getElementById('tracker-title');
    const subtitle = document.getElementById('tracker-subtitle');
    const form = document.getElementById('tracker-agent-form-panel');
    const adminPanel = document.getElementById('tracker-admin-panel');
    const newWeekBtn = document.getElementById('tracker-new-week-btn');
    const pill = document.getElementById('tracker-selected-agent-pill');
    const banner = document.getElementById('tracker-viewing-banner');
    const weekSelect = document.getElementById('tracker-week-select');

    if (title) title.textContent = 'My Lead Tracker';
    if (subtitle) subtitle.textContent = 'Track your weekly leads';
    if (form) form.classList.remove('hidden');
    if (adminPanel) adminPanel.classList.add('hidden');
    if (newWeekBtn) newWeekBtn.classList.remove('hidden');
    if (pill) pill.classList.add('hidden');
    if (banner) banner.classList.add('hidden');
    if (weekSelect) weekSelect.disabled = false;
}

function _trackerSetupAdminMode() {
    const title = document.getElementById('tracker-title');
    const subtitle = document.getElementById('tracker-subtitle');
    const form = document.getElementById('tracker-agent-form-panel');
    const adminPanel = document.getElementById('tracker-admin-panel');
    const newWeekBtn = document.getElementById('tracker-new-week-btn');
    const delWeekBtn = document.getElementById('tracker-del-week-btn');
    const weekSelect = document.getElementById('tracker-week-select');
    const pill = document.getElementById('tracker-selected-agent-pill');
    const banner = document.getElementById('tracker-viewing-banner');
    const days = document.getElementById('tracker-days-container');

    if (title) title.textContent = 'Admin Lead Tracker';
    if (subtitle) subtitle.textContent = 'View every agent tracker and weekly leads';
    if (form) form.classList.add('hidden');
    if (adminPanel) adminPanel.classList.remove('hidden');
    if (newWeekBtn) newWeekBtn.classList.add('hidden');
    if (delWeekBtn) delWeekBtn.classList.add('hidden');
    if (pill) pill.classList.add('hidden');
    if (banner) banner.classList.add('hidden');
    if (weekSelect) {
        weekSelect.disabled = true;
        weekSelect.innerHTML = '<option value="">Select an Agent</option>';
    }
    if (days) days.innerHTML = _trackerMessage('Select an agent on the left to view their leads.', 'slate');
}

// ── Admin list and summaries ──────────────────────────────────────────────

function _trackerGetAdminAgents() {
    const map = new Map();

    trackerAgentRoster.forEach((agent) => {
        const id = String(agent.userId || agent.ytelId || agent.id || '').trim();
        if (!id) return;
        map.set(id, {
            id,
            name: String(agent.fullName || agent.name || agent.ytelName || `Agent ${id}`).trim(),
            team: String(agent.team || '').trim(),
            status: String(agent.status || 'Agent').trim()
        });
    });

    Object.keys(trackerAllAgentLeads || {}).forEach((idRaw) => {
        const id = String(idRaw || '').trim();
        if (!id || map.has(id)) return;
        map.set(id, { id, name: `Agent ${id}`, team: '', status: 'Agent' });
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function _trackerAgentTotals(agentId) {
    const weeksObj = trackerAllAgentLeads[agentId] || {};
    const weeks = Object.values(weeksObj).filter(Boolean);
    let leads = 0;
    let good = 0;
    let latest = '';

    weeks.forEach((week) => {
        const weekLeads = Array.isArray(week.leads) ? week.leads : [];
        leads += weekLeads.length;
        good += weekLeads.filter(l => !!l.isGood).length;
        weekLeads.forEach((lead) => {
            const stamp = String(lead.addedAt || '');
            if (stamp && stamp > latest) latest = stamp;
        });
    });

    return { weeks: weeks.length, leads, good, latest };
}

function _trackerRenderAdminSummary() {
    if (!trackerIsAdmin) return;

    const agents = _trackerGetAdminAgents();
    let totalLeads = 0;
    let totalGood = 0;
    agents.forEach((agent) => {
        const totals = _trackerAgentTotals(agent.id);
        totalLeads += totals.leads;
        totalGood += totals.good;
    });

    const agentsEl = document.getElementById('tracker-summary-agents');
    const leadsEl = document.getElementById('tracker-summary-leads');
    const goodEl = document.getElementById('tracker-summary-good');
    if (agentsEl) agentsEl.textContent = String(agents.length);
    if (leadsEl) leadsEl.textContent = String(totalLeads);
    if (goodEl) goodEl.textContent = String(totalGood);
}

function _trackerRenderAgentList() {
    if (!trackerIsAdmin) return;
    const container = document.getElementById('tracker-agent-list');
    if (!container) return;

    const searchEl = document.getElementById('tracker-agent-search');
    const query = String(searchEl ? searchEl.value : '').trim().toLowerCase();
    const agents = _trackerGetAdminAgents().filter((agent) => {
        if (!query) return true;
        return `${agent.name} ${agent.id} ${agent.team} ${agent.status}`.toLowerCase().includes(query);
    });

    if (!agents.length) {
        container.innerHTML = '<div class="text-center py-8 text-slate-500 text-[10px] font-black uppercase tracking-widest">No agents found</div>';
        return;
    }

    container.innerHTML = agents.map((agent) => {
        const totals = _trackerAgentTotals(agent.id);
        const active = trackerSelectedAgentId === agent.id ? ' active' : '';
        const encodedId = encodeURIComponent(agent.id);
        const latestText = totals.latest ? _trackerFormatDateTime(totals.latest) : 'No leads yet';
        const team = agent.team ? `<span class="text-[8px] font-black uppercase tracking-wider text-cyan-400 bg-cyan-500/10 border border-cyan-500/15 rounded px-1.5 py-0.5">${_trackerEscape(agent.team)}</span>` : '';

        return `<button type="button" class="tracker-agent-card${active}" onclick="window.trackerSelectAgent('${encodedId}')">
            <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                    <div class="text-white text-[12px] font-black uppercase truncate">${_trackerEscape(agent.name)}</div>
                    <div class="flex items-center gap-2 mt-1">
                        <span class="text-[9px] text-slate-500 font-bold">ID ${_trackerEscape(agent.id)}</span>
                        ${team}
                    </div>
                </div>
                <div class="text-right shrink-0">
                    <div class="text-indigo-400 text-base font-black leading-none">${totals.leads}</div>
                    <div class="text-[7px] text-slate-600 font-black uppercase tracking-wider mt-1">Leads</div>
                </div>
            </div>
            <div class="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-white/5">
                <span class="text-[8px] text-slate-500 font-bold uppercase">${totals.weeks} Week${totals.weeks === 1 ? '' : 's'} · ${totals.good} Good</span>
                <span class="text-[8px] text-slate-600 font-bold truncate max-w-[120px]">${_trackerEscape(latestText)}</span>
            </div>
        </button>`;
    }).join('');
}

function _trackerRenderViewingBanner() {
    const banner = document.getElementById('tracker-viewing-banner');
    const pill = document.getElementById('tracker-selected-agent-pill');
    if (!trackerIsAdmin || !trackerSelectedAgentId) {
        if (banner) banner.classList.add('hidden');
        if (pill) pill.classList.add('hidden');
        return;
    }

    const agent = _trackerGetAdminAgents().find(a => a.id === trackerSelectedAgentId) || {
        id: trackerSelectedAgentId,
        name: `Agent ${trackerSelectedAgentId}`,
        team: ''
    };
    const totals = _trackerAgentTotals(trackerSelectedAgentId);
    const nameEl = document.getElementById('tracker-viewing-name');
    const statsEl = document.getElementById('tracker-viewing-stats');

    if (nameEl) nameEl.textContent = `${agent.name} · ID ${agent.id}${agent.team ? ` · ${agent.team}` : ''}`;
    if (statsEl) statsEl.textContent = `${totals.leads} total leads · ${totals.good} good · ${totals.weeks} weeks`;
    if (banner) banner.classList.remove('hidden');

    if (pill) {
        pill.textContent = agent.name;
        pill.classList.remove('hidden');
    }
}

// ── Shared rendering ──────────────────────────────────────────────────────

function renderTrackerWeekSelect() {
    const sel = document.getElementById('tracker-week-select');
    if (!sel) return;

    if (trackerIsAdmin && !trackerSelectedAgentId) {
        sel.disabled = true;
        sel.innerHTML = '<option value="">Select an Agent</option>';
        trackerCurrentWeekId = null;
        return;
    }

    sel.disabled = false;
    const weeks = Object.values(trackerWeeks || {})
        .filter(Boolean)
        .sort((a, b) => String(b.id || '').localeCompare(String(a.id || '')));

    if (weeks.length === 0) {
        sel.innerHTML = '<option value="">No Weeks Created</option>';
        trackerCurrentWeekId = null;
    } else {
        const oldVal = trackerCurrentWeekId;
        sel.innerHTML = weeks.map((week) => {
            const id = String(week.id || '');
            const label = week.label || id || 'Week';
            return `<option value="${_trackerEscapeAttribute(id)}">${_trackerEscape(label)}</option>`;
        }).join('');
        sel.value = oldVal && trackerWeeks[oldVal] ? oldVal : String(weeks[0].id || '');
        trackerCurrentWeekId = sel.value || null;
    }

    const delBtn = document.getElementById('tracker-del-week-btn');
    if (delBtn) delBtn.classList.toggle('hidden', trackerIsAdmin || !trackerCurrentWeekId);
}

function renderTrackerDays() {
    const container = document.getElementById('tracker-days-container');
    if (!container) return;

    if (trackerIsAdmin && !trackerSelectedAgentId) {
        container.innerHTML = _trackerMessage('Select an agent on the left to view their leads.', 'slate');
        return;
    }

    if (!trackerCurrentWeekId || !trackerWeeks[trackerCurrentWeekId]) {
        const message = trackerIsAdmin
            ? 'This agent has not created any tracker weeks yet.'
            : 'Select or start a week to view leads.';
        container.innerHTML = _trackerMessage(message, trackerIsAdmin ? 'cyan' : 'slate');
        return;
    }

    const week = trackerWeeks[trackerCurrentWeekId];
    const leads = Array.isArray(week.leads) ? week.leads : [];
    const grouped = { Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [], Sunday: [] };
    const dateMap = {};

    leads.forEach((lead) => {
        const inferredDate = lead.addedAt ? new Date(lead.addedAt) : null;
        const validDate = inferredDate && !Number.isNaN(inferredDate.getTime());
        const dayName = lead.dayStr || (validDate ? inferredDate.toLocaleDateString('en-US', { weekday: 'long' }) : 'Monday');
        const dateLabel = lead.dateStr || (validDate ? inferredDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');
        if (!grouped[dayName]) grouped[dayName] = [];
        grouped[dayName].push(lead);
        dateMap[dayName] = dateLabel;
    });

    const daysOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    let html = '';

    daysOrder.forEach((day) => {
        const dayLeads = grouped[day] || [];
        if (!dayLeads.length) return;

        html += `<div class="tl-day-card">
            <div class="tl-day-header">
                <div class="text-indigo-400 font-black uppercase text-sm tracking-wider">${day} <span class="text-slate-400 text-[10px] ml-2">${_trackerEscape(dateMap[day] || '')}</span></div>
                <div class="text-slate-500 text-[10px] font-bold uppercase">${dayLeads.length} Lead${dayLeads.length !== 1 ? 's' : ''}</div>
            </div><div>`;

        dayLeads
            .slice()
            .sort((a, b) => String(b.addedAt || '').localeCompare(String(a.addedAt || '')))
            .forEach((lead) => {
                const displayName = [lead.fname, lead.lname].filter(Boolean).join(' ').trim() || 'Name not provided';
                const leadId = encodeURIComponent(String(lead.id || ''));
                const time = lead.addedAt ? _trackerFormatTime(lead.addedAt) : '';

                let actionHtml = '';
                if (trackerIsAdmin) {
                    actionHtml = `<div class="flex items-center gap-2 shrink-0">
                        <span class="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${lead.isGood ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20' : 'text-slate-500 bg-white/5 border border-white/5'}">
                            ${lead.isGood ? '<i class="fas fa-check mr-1"></i>Good Lead' : 'Regular Lead'}
                        </span>
                    </div>`;
                } else {
                    actionHtml = `<div class="flex items-center gap-4 shrink-0">
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" ${lead.isGood ? 'checked' : ''} onchange="window.trackerToggleGood('${leadId}', this)" class="w-4 h-4 rounded border-white/10 bg-black/40 text-indigo-500 focus:ring-indigo-500">
                            <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Good</span>
                        </label>
                        <button onclick="window.trackerDeleteLead('${leadId}')" class="text-red-500/50 hover:text-red-400 transition" title="Delete Lead">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>`;
                }

                html += `<div class="tl-lead-row">
                    <div class="flex-1 min-w-0">
                        <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <div class="text-white text-sm font-bold truncate">${_trackerEscape(displayName)}</div>
                            ${time ? `<span class="text-[8px] text-slate-600 font-bold uppercase">${_trackerEscape(time)}</span>` : ''}
                        </div>
                        <div class="text-slate-400 text-xs font-mono mt-0.5 break-all">${_trackerEscape(lead.phone || 'No phone number')}</div>
                    </div>
                    ${actionHtml}
                </div>`;
            });

        html += '</div></div>';
    });

    if (!html) {
        html = _trackerMessage('No leads added for this week yet.', 'indigo');
    }

    container.innerHTML = html;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function _getTrackerUserId() {
    if (trackerIsAdmin) return null;
    const profile = _trackerReadSession('currentAgentProfile');
    return String(profile.ytelId || profile.userId || '').trim() || null;
}

function showTrackerError(msg, type) {
    const el = document.getElementById('tl-error');
    if (!el) return;
    el.textContent = msg || '';
    el.className = `${type === 'success' ? 'text-emerald-400' : 'text-red-400'} text-[10px] font-bold text-center min-h-4 mt-1`;
    if (type === 'success' && msg) {
        setTimeout(() => {
            if (el.textContent === msg) el.textContent = '';
        }, 1800);
    }
}

function _trackerStopListeners() {
    if (typeof trackerUnsubscribe === 'function') {
        try { trackerUnsubscribe(); } catch (e) {}
    }
    if (typeof trackerRosterUnsubscribe === 'function') {
        try { trackerRosterUnsubscribe(); } catch (e) {}
    }
    trackerUnsubscribe = null;
    trackerRosterUnsubscribe = null;
}

function _trackerReadSession(key) {
    try { return JSON.parse(sessionStorage.getItem(key) || '{}') || {}; }
    catch (e) { return {}; }
}

function _trackerDecode(value) {
    try { return decodeURIComponent(value || ''); }
    catch (e) { return String(value || ''); }
}

function _trackerEscape(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function _trackerEscapeAttribute(value) {
    return _trackerEscape(value).replace(/`/g, '&#096;');
}

function _trackerMessage(message, tone) {
    const toneClass = {
        red: 'text-red-400 border-red-500/20 bg-red-500/5',
        cyan: 'text-cyan-400/70 border-cyan-500/10 bg-cyan-500/5',
        indigo: 'text-indigo-400/50 border-indigo-500/10 bg-indigo-500/5',
        slate: 'text-slate-500 border-white/5 bg-white/5'
    }[tone] || 'text-slate-500 border-white/5 bg-white/5';

    return `<div class="text-center p-10 font-bold uppercase tracking-widest text-xs border rounded-2xl ${toneClass}">${_trackerEscape(message)}</div>`;
}

function _trackerFormatTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function _trackerFormatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
