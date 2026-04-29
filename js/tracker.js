// js/tracker.js
// Logic for Agent Lead Tracker

let trackerWeeks = {};
let trackerCurrentWeekId = null;
let trackerUnsubscribe = null;

window.initTracker = function() {
    const profile = JSON.parse(sessionStorage.getItem('currentAgentProfile') || '{}');
    const ytelId = profile.ytelId;
    if (!ytelId) {
        document.getElementById('tracker-days-container').innerHTML = 
            '<div class="text-center p-10 text-red-400 font-bold uppercase tracking-widest text-xs border border-red-500/20 rounded-2xl bg-red-500/5">Agent not logged in or Ytel ID missing.</div>';
        return;
    }

    if (trackerUnsubscribe) trackerUnsubscribe();
    
    // Subscribe to Firebase
    if (typeof window.listenForAgentLeads === 'function') {
        trackerUnsubscribe = window.listenForAgentLeads(ytelId, (data) => {
            trackerWeeks = data || {};
            renderTrackerWeekSelect();
            renderTrackerDays();
        });
    } else {
        // Fallback to local storage if Firebase function not ready
        trackerWeeks = JSON.parse(localStorage.getItem('biz_leads_' + ytelId) || '{}');
        renderTrackerWeekSelect();
        renderTrackerDays();
    }
};

window.trackerStartNewWeek = async function() {
    const profile = JSON.parse(sessionStorage.getItem('currentAgentProfile') || '{}');
    const ytelId = profile.ytelId;
    if (!ytelId) return;

    // Determine the Monday of the current week
    const now = new Date();
    const day = now.getDay() || 7; // Get current day number, converting Sun (0) to 7
    if (day !== 1) {
        now.setHours(-24 * (day - 1)); // Adjust to previous Monday
    }
    
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const date = String(now.getDate()).padStart(2, '0');
    const weekId = `week_${year}_${month}_${date}`;
    const label = `Week of ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

    if (!trackerWeeks[weekId]) {
        trackerWeeks[weekId] = {
            id: weekId,
            label: label,
            createdAt: new Date().toISOString(),
            leads: []
        };
        await saveTrackerData(ytelId, weekId, trackerWeeks[weekId]);
    }
    
    trackerCurrentWeekId = weekId;
    renderTrackerWeekSelect();
    renderTrackerDays();
};

window.trackerDeleteWeek = async function() {
    if (!trackerCurrentWeekId) return;
    if (!confirm("Are you sure you want to delete this entire week of leads?")) return;
    
    const profile = JSON.parse(sessionStorage.getItem('currentAgentProfile') || '{}');
    const ytelId = profile.ytelId;
    
    if (typeof window.deleteAgentWeekFromFirebase === 'function') {
        await window.deleteAgentWeekFromFirebase(ytelId, trackerCurrentWeekId);
    } else {
        delete trackerWeeks[trackerCurrentWeekId];
        localStorage.setItem('biz_leads_' + ytelId, JSON.stringify(trackerWeeks));
    }
    
    trackerCurrentWeekId = null;
    initTracker(); // Reload
};

window.trackerSelectWeek = function() {
    const sel = document.getElementById('tracker-week-select');
    trackerCurrentWeekId = sel.value;
    renderTrackerDays();
    
    const delBtn = document.getElementById('tracker-del-week-btn');
    if(trackerCurrentWeekId) {
        delBtn.classList.remove('hidden');
    } else {
        delBtn.classList.add('hidden');
    }
};

window.trackerAddLead = async function() {
    if (!trackerCurrentWeekId) {
        showTrackerError("Please select or start a week first.");
        return;
    }
    
    const fname = document.getElementById('tl-fname').value.trim();
    const lname = document.getElementById('tl-lname').value.trim();
    const phone = document.getElementById('tl-phone').value.trim();
    const isGood = document.getElementById('tl-good').checked;
    
    if (!fname || !lname || !phone) {
        showTrackerError("First name, Last name, and Phone are required.");
        return;
    }
    
    const profile = JSON.parse(sessionStorage.getItem('currentAgentProfile') || '{}');
    const ytelId = profile.ytelId;
    
    // Get current day string (e.g. "Monday") and date
    const now = new Date();
    const dayStr = now.toLocaleDateString('en-US', { weekday: 'long' });
    const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    
    const newLead = {
        id: Date.now().toString(),
        fname, lname, phone, isGood,
        dayStr, dateStr,
        addedAt: now.toISOString()
    };
    
    if (!trackerWeeks[trackerCurrentWeekId].leads) {
        trackerWeeks[trackerCurrentWeekId].leads = [];
    }
    
    trackerWeeks[trackerCurrentWeekId].leads.push(newLead);
    await saveTrackerData(ytelId, trackerCurrentWeekId, trackerWeeks[trackerCurrentWeekId]);
    
    // 🔥 Real-time Lead Alert Trigger
    if (typeof window.triggerLeadAlert === 'function') {
        const todayLeads = trackerWeeks[trackerCurrentWeekId].leads.filter(l => {
            const leadDate = new Date(l.addedAt).toDateString();
            const todayDate = new Date().toDateString();
            return leadDate === todayDate;
        }).length;
        window.triggerLeadAlert(profile.name || profile.fullName || 'An Agent', todayLeads);
    }
    
    // Clear inputs
    document.getElementById('tl-fname').value = '';
    document.getElementById('tl-lname').value = '';
    document.getElementById('tl-phone').value = '';
    document.getElementById('tl-good').checked = false;
    showTrackerError(""); // clear error
    
    renderTrackerDays();
};

window.trackerToggleGood = async function(leadId, checkboxElem) {
    if (!trackerCurrentWeekId) return;
    const profile = JSON.parse(sessionStorage.getItem('currentAgentProfile') || '{}');
    const ytelId = profile.ytelId;
    
    const week = trackerWeeks[trackerCurrentWeekId];
    if (week && week.leads) {
        const lead = week.leads.find(l => l.id === leadId);
        if (lead) {
            lead.isGood = checkboxElem.checked;
            await saveTrackerData(ytelId, trackerCurrentWeekId, week);
        }
    }
};

window.trackerDeleteLead = async function(leadId) {
    if (!trackerCurrentWeekId) return;
    if (!confirm("Delete this lead?")) return;
    
    const profile = JSON.parse(sessionStorage.getItem('currentAgentProfile') || '{}');
    const ytelId = profile.ytelId;
    
    const week = trackerWeeks[trackerCurrentWeekId];
    if (week && week.leads) {
        week.leads = week.leads.filter(l => l.id !== leadId);
        await saveTrackerData(ytelId, trackerCurrentWeekId, week);
        renderTrackerDays();
    }
};

async function saveTrackerData(ytelId, weekId, data) {
    if (typeof window.saveAgentLeadsToFirebase === 'function') {
        await window.saveAgentLeadsToFirebase(ytelId, weekId, data);
    } else {
        trackerWeeks[weekId] = data;
        localStorage.setItem('biz_leads_' + ytelId, JSON.stringify(trackerWeeks));
    }
}

function showTrackerError(msg) {
    document.getElementById('tl-error').innerText = msg;
}

function renderTrackerWeekSelect() {
    const sel = document.getElementById('tracker-week-select');
    if (!sel) return;
    
    const weeks = Object.values(trackerWeeks).sort((a, b) => b.id.localeCompare(a.id)); // Descending sort
    
    if (weeks.length === 0) {
        sel.innerHTML = '<option value="">No Weeks Created</option>';
        trackerCurrentWeekId = null;
    } else {
        const oldVal = trackerCurrentWeekId;
        sel.innerHTML = weeks.map(w => `<option value="${w.id}">${w.label}</option>`).join('');
        
        if (oldVal && trackerWeeks[oldVal]) {
            sel.value = oldVal;
        } else {
            sel.value = weeks[0].id;
            trackerCurrentWeekId = weeks[0].id;
        }
    }
    
    const delBtn = document.getElementById('tracker-del-week-btn');
    if(trackerCurrentWeekId && delBtn) delBtn.classList.remove('hidden');
    else if(delBtn) delBtn.classList.add('hidden');
}

function renderTrackerDays() {
    const container = document.getElementById('tracker-days-container');
    if (!container) return;
    
    if (!trackerCurrentWeekId || !trackerWeeks[trackerCurrentWeekId]) {
        container.innerHTML = '<div class="text-center p-10 text-slate-500 font-bold uppercase tracking-widest text-xs border border-white/5 rounded-2xl bg-white/5">Select or Start a week to view leads.</div>';
        return;
    }
    
    const week = trackerWeeks[trackerCurrentWeekId];
    const leads = week.leads || [];
    
    // Group by dayStr
    const grouped = {
        'Monday': [], 'Tuesday': [], 'Wednesday': [], 'Thursday': [], 'Friday': [], 'Saturday': [], 'Sunday': []
    };
    
    // To handle exact dates correctly
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
        if (dLeads.length > 0) {
            const dateLabel = dateMap[d] || '';
            html += `
            <div class="tl-day-card">
                <div class="tl-day-header">
                    <div class="text-indigo-400 font-black uppercase text-sm tracking-wider">${d} <span class="text-slate-400 text-[10px] ml-2">${dateLabel}</span></div>
                    <div class="text-slate-500 text-[10px] font-bold uppercase">${dLeads.length} Leads</div>
                </div>
                <div>
            `;
            
            dLeads.forEach(l => {
                const isGoodChecked = l.isGood ? 'checked' : '';
                html += `
                <div class="tl-lead-row">
                    <div class="flex-1">
                        <div class="text-white text-sm font-bold">${l.fname} ${l.lname}</div>
                        <div class="text-slate-400 text-xs font-mono mt-0.5">${l.phone}</div>
                    </div>
                    <div class="flex items-center gap-4">
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" ${isGoodChecked} onchange="window.trackerToggleGood('${l.id}', this)" class="w-4 h-4 rounded border-white/10 bg-black/40 text-indigo-500 focus:ring-indigo-500">
                            <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Good</span>
                        </label>
                        <button onclick="window.trackerDeleteLead('${l.id}')" class="text-red-500/50 hover:text-red-400 transition" title="Delete Lead">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
                `;
            });
            
            html += `</div></div>`;
        }
    });
    
    if (html === '') {
        html = '<div class="text-center p-10 text-indigo-400/50 font-bold uppercase tracking-widest text-xs border border-indigo-500/10 rounded-2xl bg-indigo-500/5">No leads added for this week yet.</div>';
    }
    
    container.innerHTML = html;
}
