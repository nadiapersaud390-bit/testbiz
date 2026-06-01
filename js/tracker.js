// js/tracker.js
// Agent Lead Tracker — Firebase only, no localStorage

let trackerWeeks = {};
let trackerCurrentWeekId = null;
let trackerUnsubscribe = null;

window.initTracker = function() {
    const profile = JSON.parse(sessionStorage.getItem('currentAgentProfile') || '{}');
    const cAdmin  = JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');

    // Resolve ytelId: agents use profile.ytelId, super admin uses their email as key
    const ytelId = profile.ytelId || (cAdmin.isSuper || cAdmin.role === 'super_admin' ? cAdmin.email : null);

    if (!ytelId) {
        const c = document.getElementById('tracker-days-container');
        if (c) c.innerHTML = '<div class="text-center p-10 text-red-400 font-bold uppercase tracking-widest text-xs border border-red-500/20 rounded-2xl bg-red-500/5">Not logged in or ID missing.</div>';
        return;
    }

    if (trackerUnsubscribe) { trackerUnsubscribe(); trackerUnsubscribe = null; }

    if (typeof window.listenForAgentLeads !== 'function') {
        // Firebase not ready yet — retry in 500ms
        setTimeout(window.initTracker, 500);
        return;
    }

    trackerUnsubscribe = window.listenForAgentLeads(ytelId, (data) => {
        trackerWeeks = data || {};
        renderTrackerWeekSelect();
        renderTrackerDays();
    });
};

window.trackerStartNewWeek = async function() {
    const ytelId = _getTrackerUserId();
    if (!ytelId) return;

    const now = new Date();
    const day = now.getDay() || 7;
    if (day !== 1) now.setDate(now.getDate() - (day - 1));

    const year  = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const date  = String(now.getDate()).padStart(2, '0');
    const weekId = `week_${year}_${month}_${date}`;
    const label  = `Week of ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

    if (!trackerWeeks[weekId]) {
        const newWeek = { id: weekId, label, createdAt: new Date().toISOString(), leads: [] };
        await window.saveAgentLeadsToFirebase(ytelId, weekId, newWeek);
    }

    trackerCurrentWeekId = weekId;
    renderTrackerWeekSelect();
    renderTrackerDays();
};

window.trackerDeleteWeek = async function() {
    if (!trackerCurrentWeekId) return;
    if (!confirm('Delete this entire week of leads? This cannot be undone.')) return;

    const ytelId = _getTrackerUserId();
    if (!ytelId) return;

    await window.deleteAgentWeekFromFirebase(ytelId, trackerCurrentWeekId);
    trackerCurrentWeekId = null;
    // Firebase listener will auto-update trackerWeeks
};

window.trackerSelectWeek = function() {
    const sel = document.getElementById('tracker-week-select');
    trackerCurrentWeekId = sel ? sel.value : null;
    renderTrackerDays();

    const delBtn = document.getElementById('tracker-del-week-btn');
    if (delBtn) delBtn.classList.toggle('hidden', !trackerCurrentWeekId);
};

window.trackerAddLead = async function() {
    if (!trackerCurrentWeekId) { showTrackerError('Please select or start a week first.'); return; }

    const fname = document.getElementById('tl-fname').value.trim();
    const lname = document.getElementById('tl-lname').value.trim();
    const phone = document.getElementById('tl-phone').value.trim();
    const isGood = document.getElementById('tl-good').checked;

    if (!fname || !lname || !phone) { showTrackerError('First name, Last name, and Phone are required.'); return; }

    const ytelId = _getTrackerUserId();
    if (!ytelId) return;

    const now = new Date();
    const newLead = {
        id: Date.now().toString(),
        fname, lname, phone, isGood,
        dayStr:  now.toLocaleDateString('en-US', { weekday: 'long' }),
        dateStr: now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        addedAt: now.toISOString()
    };

    const week = trackerWeeks[trackerCurrentWeekId];
    if (!week) return;
    if (!week.leads) week.leads = [];
    week.leads.push(newLead);

    await window.saveAgentLeadsToFirebase(ytelId, trackerCurrentWeekId, week);

    // Real-time lead alert
    if (typeof window.triggerLeadAlert === 'function') {
        const profile = JSON.parse(sessionStorage.getItem('currentAgentProfile') || '{}');
        const todayLeads = week.leads.filter(l => new Date(l.addedAt).toDateString() === new Date().toDateString()).length;
        window.triggerLeadAlert(profile.name || profile.fullName || 'An Agent', todayLeads);
    }

    document.getElementById('tl-fname').value = '';
    document.getElementById('tl-lname').value = '';
    document.getElementById('tl-phone').value = '';
    document.getElementById('tl-good').checked = false;
    showTrackerError('');
    renderTrackerDays();
};

window.trackerToggleGood = async function(leadId, checkboxElem) {
    if (!trackerCurrentWeekId) return;
    const ytelId = _getTrackerUserId();
    const week = trackerWeeks[trackerCurrentWeekId];
    if (!week || !week.leads) return;

    const lead = week.leads.find(l => l.id === leadId);
    if (lead) {
        lead.isGood = checkboxElem.checked;
        await window.saveAgentLeadsToFirebase(ytelId, trackerCurrentWeekId, week);
    }
};

window.trackerDeleteLead = async function(leadId) {
    if (!trackerCurrentWeekId) return;
    if (!confirm('Delete this lead?')) return;

    const ytelId = _getTrackerUserId();
    const week = trackerWeeks[trackerCurrentWeekId];
    if (!week || !week.leads) return;

    week.leads = week.leads.filter(l => l.id !== leadId);
    await window.saveAgentLeadsToFirebase(ytelId, trackerCurrentWeekId, week);
    renderTrackerDays();
};

// ── Helpers ────────────────────────────────────────────────────────────────

function _getTrackerUserId() {
    const profile = JSON.parse(sessionStorage.getItem('currentAgentProfile') || '{}');
    const cAdmin  = JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');
    return profile.ytelId || (cAdmin.isSuper || cAdmin.role === 'super_admin' ? cAdmin.email : null);
}

function showTrackerError(msg) {
    const el = document.getElementById('tl-error');
    if (el) el.innerText = msg;
}

function renderTrackerWeekSelect() {
    const sel = document.getElementById('tracker-week-select');
    if (!sel) return;

    const weeks = Object.values(trackerWeeks).sort((a, b) => b.id.localeCompare(a.id));

    if (weeks.length === 0) {
        sel.innerHTML = '<option value="">No Weeks Created</option>';
        trackerCurrentWeekId = null;
    } else {
        const oldVal = trackerCurrentWeekId;
        sel.innerHTML = weeks.map(w => `<option value="${w.id}">${w.label}</option>`).join('');
        sel.value = (oldVal && trackerWeeks[oldVal]) ? oldVal : weeks[0].id;
        trackerCurrentWeekId = sel.value;
    }

    const delBtn = document.getElementById('tracker-del-week-btn');
    if (delBtn) delBtn.classList.toggle('hidden', !trackerCurrentWeekId);
}

function renderTrackerDays() {
    const container = document.getElementById('tracker-days-container');
    if (!container) return;

    if (!trackerCurrentWeekId || !trackerWeeks[trackerCurrentWeekId]) {
        container.innerHTML = '<div class="text-center p-10 text-slate-500 font-bold uppercase tracking-widest text-xs border border-white/5 rounded-2xl bg-white/5">Select or Start a week to view leads.</div>';
        return;
    }

    const week  = trackerWeeks[trackerCurrentWeekId];
    const leads = week.leads || [];

    const grouped = { Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [], Sunday: [] };
    const dateMap = {};

    leads.forEach(l => {
        if (!grouped[l.dayStr]) grouped[l.dayStr] = [];
        grouped[l.dayStr].push(l);
        dateMap[l.dayStr] = l.dateStr;
    });

    const daysOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    let html = '';

    daysOrder.forEach(d => {
        const dLeads = grouped[d];
        if (!dLeads.length) return;

        html += `<div class="tl-day-card">
            <div class="tl-day-header">
                <div class="text-indigo-400 font-black uppercase text-sm tracking-wider">${d} <span class="text-slate-400 text-[10px] ml-2">${dateMap[d] || ''}</span></div>
                <div class="text-slate-500 text-[10px] font-bold uppercase">${dLeads.length} Lead${dLeads.length !== 1 ? 's' : ''}</div>
            </div><div>`;

        dLeads.forEach(l => {
            html += `<div class="tl-lead-row">
                <div class="flex-1">
                    <div class="text-white text-sm font-bold">${l.fname} ${l.lname}</div>
                    <div class="text-slate-400 text-xs font-mono mt-0.5">${l.phone}</div>
                </div>
                <div class="flex items-center gap-4">
                    <label class="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" ${l.isGood ? 'checked' : ''} onchange="window.trackerToggleGood('${l.id}', this)" class="w-4 h-4 rounded border-white/10 bg-black/40 text-indigo-500 focus:ring-indigo-500">
                        <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Good</span>
                    </label>
                    <button onclick="window.trackerDeleteLead('${l.id}')" class="text-red-500/50 hover:text-red-400 transition" title="Delete Lead">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>`;
        });

        html += `</div></div>`;
    });

    if (!html) {
        html = '<div class="text-center p-10 text-indigo-400/50 font-bold uppercase tracking-widest text-xs border border-indigo-500/10 rounded-2xl bg-indigo-500/5">No leads added for this week yet.</div>';
    }

    container.innerHTML = html;
}
