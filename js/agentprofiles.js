/**
 * js/agentprofiles.js
 * Agent profile management: Add, Edit, Delete via Firebase RTDB popup modal.
 */

let allAgentProfiles = [];
let apIsSubscribed = false;

window.initAgentProfiles = async function() {
    if (apIsSubscribed) return;

    const container = document.getElementById('ap-agent-list');
    if (!container) return;

    container.innerHTML = '<div class="col-span-full py-10 text-center text-blue-400 text-[10px] font-black uppercase tracking-widest"><i class="fas fa-spinner fa-spin mr-2"></i>Loading Agents...</div>';

    // Primary: RTDB biz_master_roster (real-time)
    if (typeof window.listenForMasterRoster === 'function') {
        window.listenForMasterRoster((rosterData) => {
            let profiles = [];
            if (Array.isArray(rosterData)) profiles = rosterData;
            else if (rosterData && typeof rosterData === 'object') profiles = Object.values(rosterData);
            profiles = profiles.filter(p => p && p.fullName && p.userId);
            profiles.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
            allAgentProfiles = profiles;
            window.allAgentProfiles = allAgentProfiles;
            apFilterAgents();
        });
        apIsSubscribed = true;
    } else if (typeof window.listenToAgentProfiles === 'function') {
        // Fallback: Firestore
        window.listenToAgentProfiles((profiles) => {
            allAgentProfiles = profiles || [];
            window.allAgentProfiles = allAgentProfiles;
            apFilterAgents();
        });
        apIsSubscribed = true;
    } else {
        container.innerHTML = '<div class="col-span-full py-10 text-center text-red-400 font-bold uppercase tracking-widest">❌ Database Connection Failed</div>';
    }
};

// Auto-fill Ytel Name based on Agent Name + Team
window.apAutoFillYtel = function() {
    const name = (document.getElementById('ap-name') || {}).value || '';
    const team = (document.getElementById('ap-team') || {}).value || 'PR';
    const ytelInput = document.getElementById('ap-ytel-name');
    if (!ytelInput || !name.trim()) return;

    const prefixMap = { BB: 'GYB', PR: 'GYP', RM: 'GTM' };
    const prefix = prefixMap[team] || 'GYP';
    ytelInput.value = `${prefix} ${name.trim().toUpperCase()} (${team})`;
};

// Form Submission
window.apHandleSubmit = async function(e) {
    e.preventDefault();
    const statusDiv = document.getElementById('ap-submit-status');
    const saveBtn = document.getElementById('ap-save-btn');

    const mode = document.getElementById('ap-form-mode').value;
    const userId = document.getElementById('ap-userid').value.trim();
    const fullName = document.getElementById('ap-name').value.trim();
    const team = document.getElementById('ap-team').value;
    const ytelName = document.getElementById('ap-ytel-name').value.trim();
    const shift = document.getElementById('ap-shift').value;
    const status = document.getElementById('ap-status').value;
    const lunch = document.getElementById('ap-lunch').value.trim();
    const breakVal = (document.getElementById('ap-break') || {}).value || '';

    if (!/^\d{4}$/.test(userId)) {
        statusDiv.innerHTML = '<span class="text-red-400">❌ Ytel ID must be exactly 4 digits</span>';
        return;
    }
    if (!fullName) {
        statusDiv.innerHTML = '<span class="text-red-400">❌ Agent Name is required</span>';
        return;
    }

    const hidden = !!(document.getElementById('ap-hidden-toggle') || {}).checked;
    const agentData = { userId, fullName, team, ytelName, shift, status, lunchTime: lunch, breakTime: breakVal, hidden };

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Saving...';
    statusDiv.innerHTML = '<span class="text-blue-400">⚡ Saving to Firebase...</span>';

    try {
        // Save to RTDB (primary — also updates biz_master_roster)
        let saved = false;
        if (typeof window.saveAgentProfileToRTDB === 'function') {
            const res = await window.saveAgentProfileToRTDB(agentData);
            saved = res.success;
        }
        // Also save to Firestore if available
        if (typeof window.saveAgentProfileToFirestore === 'function') {
            await window.saveAgentProfileToFirestore(agentData);
        }

        if (!saved) throw new Error('RTDB save failed');

        // Save goals if set
        const goalLow = document.getElementById('ap-goal-low');
        const goalHigh = document.getElementById('ap-goal-high');
        if (goalLow && goalHigh && goalLow.value && goalHigh.value) {
            const lo = parseInt(goalLow.value), hi = parseInt(goalHigh.value);
            if (!isNaN(lo) && !isNaN(hi) && lo >= 1 && hi >= lo && typeof window.adminSetAgentGoals === 'function') {
                window.adminSetAgentGoals(userId, lo, hi);
            }
        }

        statusDiv.innerHTML = '<span class="text-green-400 font-black">✅ Profile Saved</span>';
        if (typeof window.writeAdminActivityLog === 'function') {
            window.writeAdminActivityLog('agent_management', `${mode === 'edit' ? 'Updated' : 'Created'} profile for ${fullName} (${userId})`);
        }
        setTimeout(() => { apCloseModal(); saveBtn.disabled = false; saveBtn.innerText = 'Save Profile'; }, 1200);

    } catch (err) {
        console.error(err);
        statusDiv.innerHTML = `<span class="text-red-400">❌ ${err.message}</span>`;
        saveBtn.disabled = false;
        saveBtn.innerText = 'Retry Save';
    }
};

// Filtering & Rendering
window.apFilterAgents = function() {
    const search = (document.getElementById('ap-search-input') || {}).value || '';
    const teamFilter = (document.getElementById('ap-team-filter') || {}).value || 'ALL';
    const container = document.getElementById('ap-agent-list');
    if (!container) return;

    const q = search.toLowerCase();
    const filtered = allAgentProfiles.filter(p => {
        const matchSearch = (p.fullName || '').toLowerCase().includes(q) || (p.userId || '').includes(q) || (p.ytelName || '').toLowerCase().includes(q);
        const matchTeam = teamFilter === 'ALL' || p.team === teamFilter;
        return matchSearch && matchTeam;
    });

    if (filtered.length === 0) {
        container.innerHTML = '<div class="col-span-full py-10 text-center text-slate-500 font-bold uppercase tracking-widest text-[10px]">No agents found</div>';
        return;
    }

    const statusColor = {
        Agent: 'bg-green-500/10 text-green-400 border-green-500/20',
        Trainee: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
        Quit: 'bg-red-500/10 text-red-400 border-red-500/20',
        Replaced: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
        Fired: 'bg-red-700/10 text-red-500 border-red-700/20',
        Inactive: 'bg-slate-500/10 text-slate-500 border-slate-500/20'
    };
    const teamEmoji = { BB: '🦁', PR: '🐆', RM: '🌐' };

    container.innerHTML = filtered.map(p => {
        const sc = statusColor[p.status] || statusColor.Inactive;
        const emoji = teamEmoji[p.team] || '👤';
        return `<div class="glass p-5 rounded-[1.5rem] border border-white/5 hover:bg-white/5 transition-all cursor-pointer flex flex-col gap-3"
                    onclick="apOpenModal('edit','${p.userId}')">
            <div class="flex justify-between items-start">
                <div class="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-xl">${emoji}</div>
                <div class="text-right flex flex-col items-end gap-1">
                    <span class="text-[9px] font-black text-slate-500">${p.userId}</span>
                    <span class="px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${sc}">${p.status || 'Agent'}</span>
                </div>
            </div>
            <div>
                <div class="text-white font-black text-[13px] uppercase tracking-tight truncate">${p.fullName}</div>
                <div class="text-[9px] text-slate-500 font-bold truncate mt-0.5">${p.ytelName || '—'}</div>
            </div>
            <div class="grid grid-cols-2 gap-2 border-t border-white/5 pt-3">
                <div>
                    <div class="text-[8px] font-black text-slate-600 uppercase tracking-widest">Shift</div>
                    <div class="text-[10px] text-slate-300 font-bold">${p.shift || '—'}</div>
                </div>
                <div>
                    <div class="text-[8px] font-black text-slate-600 uppercase tracking-widest">Lunch</div>
                    <div class="text-[10px] text-slate-300 font-bold">${p.lunchTime || '—'}</div>
                </div>
            </div>
        </div>`;
    }).join('');
};

// Open popup modal
window.apOpenModal = function(mode = 'add', userId = null) {
    const overlay = document.getElementById('ap-modal-overlay');
    const form = document.getElementById('ap-form');
    const title = document.getElementById('ap-modal-title');
    const modeInput = document.getElementById('ap-form-mode');
    const statusDiv = document.getElementById('ap-submit-status');
    const deleteBtn = document.getElementById('ap-delete-btn');
    const userIdInput = document.getElementById('ap-userid');
    const saveBtn = document.getElementById('ap-save-btn');

    if (!overlay || !form) { console.error('Agent modal not found'); return; }

    form.reset();
    if (statusDiv) statusDiv.innerHTML = '';
    if (saveBtn) { saveBtn.disabled = false; saveBtn.innerText = 'Save Profile'; }

    if (mode === 'edit' && userId) {
        const agent = allAgentProfiles.find(p => p.userId === userId);
        if (!agent) return;

        if (title) title.innerText = 'Edit Agent';
        if (modeInput) modeInput.value = 'edit';
        if (deleteBtn) deleteBtn.classList.remove('hidden');
        if (userIdInput) userIdInput.disabled = true;

        document.getElementById('ap-form-id').value = agent.userId;
        document.getElementById('ap-userid').value = agent.userId;
        document.getElementById('ap-name').value = agent.fullName || '';
        document.getElementById('ap-team').value = agent.team || 'PR';
        document.getElementById('ap-ytel-name').value = agent.ytelName || '';
        document.getElementById('ap-shift').value = agent.shift || '10:00AM-7:00PM';
        document.getElementById('ap-status').value = agent.status || 'Agent';
        document.getElementById('ap-lunch').value = agent.lunchTime || '';
        const brk = document.getElementById('ap-break');
        if (brk) brk.value = agent.breakTime || '';

        // Hidden toggle
        const hiddenSection = document.getElementById('ap-hidden-section');
        const hiddenToggle = document.getElementById('ap-hidden-toggle');
        if (hiddenSection) hiddenSection.classList.remove('hidden');
        if (hiddenToggle) hiddenToggle.checked = !!(agent.hidden);

        // Load goals
        const goalsSection = document.getElementById('ap-goals-section');
        const goalsBadge = document.getElementById('ap-goals-badge');
        const goalLow = document.getElementById('ap-goal-low');
        const goalHigh = document.getElementById('ap-goal-high');
        if (goalsSection) {
            goalsSection.classList.remove('hidden');
            if (goalsBadge) goalsBadge.textContent = 'Loading...';
            if (goalLow) goalLow.value = '';
            if (goalHigh) goalHigh.value = '';
            if (typeof window.adminGetAgentGoals === 'function') {
                window.adminGetAgentGoals(agent.userId).then(goals => {
                    if (goals && goals.low) {
                        if (goalLow) goalLow.value = goals.low;
                        if (goalHigh) goalHigh.value = goals.high;
                        if (goalsBadge) goalsBadge.textContent = `Low: ${goals.low}  High: ${goals.high}`;
                    } else {
                        if (goalsBadge) goalsBadge.textContent = 'No goals set today';
                    }
                });
            }
        }
    } else {
        if (title) title.innerText = 'Add New Agent';
        if (modeInput) modeInput.value = 'add';
        if (deleteBtn) deleteBtn.classList.add('hidden');
        if (userIdInput) userIdInput.disabled = false;
        const goalsSection = document.getElementById('ap-goals-section');
        if (goalsSection) goalsSection.classList.add('hidden');
        const hiddenSectionAdd = document.getElementById('ap-hidden-section');
        if (hiddenSectionAdd) hiddenSectionAdd.classList.add('hidden');
        const hiddenToggleAdd = document.getElementById('ap-hidden-toggle');
        if (hiddenToggleAdd) hiddenToggleAdd.checked = false;
    }

    overlay.style.display = 'flex';
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
};

// Close popup modal
window.apCloseModal = function() {
    const overlay = document.getElementById('ap-modal-overlay');
    if (overlay) {
        overlay.style.display = 'none';
        overlay.classList.add('hidden');
    }
    const userIdInput = document.getElementById('ap-userid');
    if (userIdInput) userIdInput.disabled = false;
    document.body.style.overflow = '';
};

// Click outside to close
window.apHandleOverlayClick = function(e) {
    if (e.target === document.getElementById('ap-modal-overlay')) apCloseModal();
};

// Delete agent
window.apDeleteAgent = async function() {
    const userId = document.getElementById('ap-userid').value;
    const name = document.getElementById('ap-name').value;

    if (!confirm(`Permanently remove ${name} (${userId}) from Firebase?`)) return;

    if (typeof window.deleteAgentFromFirestore === 'function') {
        await window.deleteAgentFromFirestore(userId);
    }
    if (typeof window.deleteAgentFromRTDB === 'function') {
        await window.deleteAgentFromRTDB(userId);
    }
    if (typeof window.writeAdminActivityLog === 'function') {
        window.writeAdminActivityLog('agent_management', `Deleted profile for ${name} (${userId})`);
    }
    apCloseModal();
};
