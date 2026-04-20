/**
 * js/agentprofiles.js
 * Logic for managing the master agent roster: Add, Edit, Filter, Sync.
 */

let allAgentProfiles = [];
let apIsSubscribed = false;

window.initAgentProfiles = async function() {
    if (apIsSubscribed) return;
    
    const container = document.getElementById('ap-agent-list');
    if (!container) return;

    if (typeof window.listenToAgentProfiles === 'function') {
        window.listenToAgentProfiles((profiles) => {
            allAgentProfiles = profiles || [];
            window.allAgentProfiles = allAgentProfiles; // Expose globally for name lookups
            apFilterAgents();
            
            // Sync current session's agent profile to banner if needed
            const cAdmin = JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');
            if (cAdmin.email) {
                const match = allAgentProfiles.find(p => p.email === cAdmin.email);
                if (match) sessionStorage.setItem('currentAgentProfile', JSON.stringify(match));
            }
        });
        apIsSubscribed = true;
    } else {
        console.error("Firestore listener not found in firebase.js");
        container.innerHTML = '<div class="col-span-full py-10 text-center text-red-400 font-bold uppercase tracking-widest">❌ Database Connection Failed</div>';
    }
};

// Auto-fill logic for Ytel Name based on Team selection
window.apAutoFillYtel = function() {
    const name = document.getElementById('ap-name').value.trim();
    const team = document.getElementById('ap-team').value;
    const ytelInput = document.getElementById('ap-ytel-name');
    
    if (!name) {
        ytelInput.value = '';
        return;
    }
    
    // BB -> GYB, PR -> GYP, RM -> GTM
    let prefix = 'GYP';
    if (team === 'BB') prefix = 'GYB';
    else if (team === 'RM') prefix = 'GTM';
    
    ytelInput.value = `${prefix} ${name} (${team})`;
};

// Form Submission (Dual Save)
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
    const breakVal = document.getElementById('ap-break').value.trim();
    
    if (!/^\d{4}$/.test(userId)) {
        statusDiv.innerHTML = '<span class="text-red-400">❌ Error: User ID must be exactly 4 digits</span>';
        return;
    }

    const agentData = {
        userId,
        fullName,
        team,
        ytelName,
        shift,
        status,
        lunchTime: lunch,
        breakTime: breakVal
    };

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Saving...';
    statusDiv.innerHTML = '<span class="text-blue-400">⚡ Initializing Dual Save...</span>';

    try {
        // 1. Save to Firebase (Firestore)
        let fbSuccess = false;
        if (typeof window.saveAgentProfileToFirestore === 'function') {
            const res = await window.saveAgentProfileToFirestore(agentData);
            fbSuccess = res.success;
        }

        // 2. Save to Google Sheet Bridge
        let sheetSuccess = false;
        if (typeof API_URL !== 'undefined') {
            statusDiv.innerHTML = '<span>📡 Syncing to Google Sheets...</span>';
            try {
                const response = await fetch(API_URL, {
                    method: 'POST',
                    mode: 'no-cors', // Important for Apps Script
                    body: JSON.stringify({
                        action: 'saveAgent',
                        ...agentData
                    })
                });
                sheetSuccess = true; // Assume success for no-cors
            } catch (err) {
                console.warn("Sheet Sync Error:", err);
            }
        }

        if (fbSuccess) {
            statusDiv.innerHTML = `<span class="text-green-400 font-black">✅ Profile Active ${sheetSuccess ? '& Synced' : '(Sheet Wait)'}</span>`;
            
            if (typeof window.writeAdminActivityLog === 'function') {
                window.writeAdminActivityLog('agent_management', `${mode === 'edit' ? 'Updated' : 'Created'} profile for ${fullName} (${userId})`);
            }
            
            setTimeout(() => {
                apCloseModal();
                saveBtn.disabled = false;
                saveBtn.innerText = 'Save Profile';
            }, 1500);
        } else {
            throw new Error("Firebase save failed");
        }

    } catch (error) {
        console.error(error);
        statusDiv.innerHTML = `<span class="text-red-400">❌ Error: ${error.message}</span>`;
        saveBtn.disabled = false;
        saveBtn.innerText = 'Retry Save';
    }
};

// Rendering & Filtering
window.apFilterAgents = function() {
    const search = document.getElementById('ap-search-input').value.toLowerCase();
    const teamFilter = document.getElementById('ap-team-filter').value;
    const container = document.getElementById('ap-agent-list');
    
    if (!container) return;
    
    const filtered = allAgentProfiles.filter(p => {
        const matchesSearch = p.fullName.toLowerCase().includes(search) || p.userId.includes(search);
        const matchesTeam = teamFilter === 'ALL' || p.team === teamFilter;
        return matchesSearch && matchesTeam;
    });
    
    if (filtered.length === 0) {
        container.innerHTML = '<div class="col-span-full py-10 text-center text-slate-500 font-bold uppercase tracking-widest">No agents found</div>';
        return;
    }
    
    container.innerHTML = filtered.map(p => `
        <div class="agent-card glass p-5 rounded-[2rem] border border-white/5 hover:bg-white/10 transition-all group flex flex-col justify-between" onclick="apOpenModal('edit', '${p.userId}')" style="cursor:pointer">
            <div class="flex justify-between items-start mb-4">
                <div class="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-xl">
                    ${p.team === 'BB' ? '🦁' : p.team === 'PR' ? '🐆' : '🌐'}
                </div>
                <div class="text-right">
                    <span class="text-[9px] font-black text-slate-500 uppercase tracking-widest">${p.userId}</span>
                    <div class="px-3 py-1 rounded-full ${p.status === 'Agent' ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'} text-[8px] font-black uppercase tracking-widest mt-1 border border-white/5 whitespace-nowrap">
                        ${p.status}
                    </div>
                </div>
            </div>
            
            <div>
                <h4 class="text-white font-black text-sm uppercase tracking-tight truncate">${p.fullName}</h4>
                <p class="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">${p.ytelName}</p>
            </div>
            
            <div class="mt-4 pt-4 border-t border-white/5 grid grid-cols-2 gap-2">
                <div>
                    <div class="text-[8px] font-black text-slate-600 uppercase tracking-widest">Shift</div>
                    <div class="text-[10px] text-slate-300 font-bold">${p.shift}</div>
                </div>
                <div>
                    <div class="text-[8px] font-black text-slate-600 uppercase tracking-widest">Lunch</div>
                    <div class="text-[10px] text-slate-300 font-bold">${p.lunchTime || 'N/A'}</div>
                </div>
            </div>
        </div>
    `).join('');
};

// Inline Form Management (Replaces Modal)
window.apOpenModal = function(mode = 'add', userId = null) {
    const inlineSect = document.getElementById('ah-profiles-inline');
    const form = document.getElementById('ap-form');
    const title = document.getElementById('ap-modal-title');
    const modeInput = document.getElementById('ap-form-mode');
    const statusDiv = document.getElementById('ap-submit-status');
    const deleteBtn = document.getElementById('ap-delete-btn');
    const userIdInput = document.getElementById('ap-userid');
    
    if (!inlineSect || !form) return;

    // Reset form
    form.reset();
    statusDiv.innerHTML = 'System Status: Ready';
    
    if (mode === 'edit' && userId) {
        const agent = allAgentProfiles.find(p => p.userId === userId);
        if (agent) {
            title.innerText = 'Edit Agent: ' + agent.fullName;
            modeInput.value = 'edit';
            deleteBtn.classList.remove('hidden');
            userIdInput.disabled = true; // Cannot change ID on edit
            
            // Populate
            document.getElementById('ap-form-id').value = agent.userId;
            document.getElementById('ap-userid').value = agent.userId;
            document.getElementById('ap-name').value = agent.fullName;
            document.getElementById('ap-team').value = agent.team;
            document.getElementById('ap-ytel-name').value = agent.ytelName;
            document.getElementById('ap-shift').value = agent.shift;
            document.getElementById('ap-status').value = agent.status;
            document.getElementById('ap-lunch').value = agent.lunchTime || '';
            document.getElementById('ap-break').value = agent.breakTime || '';
        }
    } else {
        title.innerText = 'Add New Remote Agent';
        modeInput.value = 'add';
        deleteBtn.classList.add('hidden');
        userIdInput.disabled = false;
    }
    
    inlineSect.classList.remove('hidden');
    inlineSect.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.apCloseModal = function() {
    const inlineSect = document.getElementById('ah-profiles-inline');
    if (inlineSect) inlineSect.classList.add('hidden');
    document.getElementById('ap-userid').disabled = false;
};

window.apDeleteAgent = async function() {
    const userId = document.getElementById('ap-userid').value;
    const name = document.getElementById('ap-name').value;
    
    if (!confirm(`Are you sure you want to permanently remove ${name} from all systems?`)) return;
    
    if (typeof window.deleteAgentFromFirestore === 'function') {
        await window.deleteAgentFromFirestore(userId);
        if (typeof window.writeAdminActivityLog === 'function') {
            window.writeAdminActivityLog('agent_management', `Deleted profile for ${name} (${userId})`);
        }
        apCloseModal();
    }
};
