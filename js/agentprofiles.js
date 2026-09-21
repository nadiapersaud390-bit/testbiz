/**
 * js/agentprofiles.js
 * Agent profile management: Add, Edit, Delete via Firebase RTDB popup modal.
 */

let allAgentProfiles = [];
let apIsSubscribed = false;
let apInitRetryTimer = null;

window.initAgentProfiles = async function() {
    const container = document.getElementById('ap-agent-list');

    // The roster is shared by Profiles, Attendance, and performance tools. Start
    // the Firebase listener even when the Profiles markup has not been mounted yet.
    if (apIsSubscribed) {
        if (container && typeof window.apFilterAgents === 'function') window.apFilterAgents();
        return;
    }

    if (container) {
        container.innerHTML = '<div class="col-span-full py-10 text-center text-blue-400 text-[10px] font-black uppercase tracking-widest"><i class="fas fa-spinner fa-spin mr-2"></i>Loading Agents...</div>';
    }

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
            if (typeof window.renderDailyAttendance === 'function') {
                const attSection = document.getElementById('ah-sect-attendance');
                if (attSection && !attSection.classList.contains('hidden')) window.renderDailyAttendance();
            }
        });
        apIsSubscribed = true;
    } else if (typeof window.listenToAgentProfiles === 'function') {
        // Fallback: Firestore
        window.listenToAgentProfiles((profiles) => {
            allAgentProfiles = profiles || [];
            window.allAgentProfiles = allAgentProfiles;
            apFilterAgents();
            if (typeof window.renderDailyAttendance === 'function') {
                const attSection = document.getElementById('ah-sect-attendance');
                if (attSection && !attSection.classList.contains('hidden')) window.renderDailyAttendance();
            }
        });
        apIsSubscribed = true;
    } else {
        // Firebase's module script can finish a moment after the dashboard shell.
        // Retry instead of leaving Profiles/Attendance permanently blank.
        if (container) {
            container.innerHTML = '<div class="col-span-full py-10 text-center text-blue-400 text-[10px] font-black uppercase tracking-widest"><i class="fas fa-spinner fa-spin mr-2"></i>Connecting to roster...</div>';
        }
        if (!apInitRetryTimer) {
            apInitRetryTimer = setTimeout(() => {
                apInitRetryTimer = null;
                if (!apIsSubscribed && typeof window.initAgentProfiles === 'function') window.initAgentProfiles();
            }, 500);
        }
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

    const breakSchedule = {};
    for (const slot of ['morning', 'afternoon']) {
        const time = document.getElementById('ap-break-' + slot).value;
        const minutes = Number(document.getElementById('ap-break-' + slot + '-minutes').value);
        if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120 ||
            (time && (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || (slot === 'morning' ? time >= '12:00' : time < '12:00')))) {
            statusDiv.textContent = 'Enter a valid ' + slot + ' start time and 1 to 120 whole minutes.';
            return;
        }
        breakSchedule[slot] = { time, minutes };
    }
    const hidden = !!(document.getElementById('ap-hidden-toggle') || {}).checked;
    const agentData = { userId, fullName, team, ytelName, shift, status, lunchTime: lunch, breakTime: breakVal, breakSchedule, hidden };

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
                const goalResult = await window.adminSetAgentGoals(userId, lo, hi);
                if (!goalResult || !goalResult.success) {
                    throw new Error(goalResult?.error || 'Daily goal could not be saved');
                }
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

// Keep the Agent Profile editor independent from the Admin Hub scroll/transform.
// The modal is moved to <body>, its header and footer stay visible, and only the
// form fields scroll. This also guarantees that outside-click closes reliably.
window.apPrepareModalForViewport = function(overlay) {
    if (!overlay) return;

    // Inject the modal UX CSS once. Keeping this here means both the standalone
    // Profiles page and the Profiles copy inside Admin Tools use the same layout.
    if (!document.getElementById('ap-modal-viewport-styles')) {
        const style = document.createElement('style');
        style.id = 'ap-modal-viewport-styles';
        style.textContent = `
            #ap-modal-overlay.ap-modal-viewport {
                position: fixed !important;
                inset: 0 !important;
                z-index: 2147483000 !important;
                align-items: center !important;
                justify-content: center !important;
                padding: 16px !important;
                overflow: hidden !important;
                isolation: isolate;
            }
            #ap-modal-overlay.ap-modal-viewport > [data-ap-backdrop] {
                position: absolute !important;
                inset: 0 !important;
                background: rgba(2, 6, 23, 0.86) !important;
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
                cursor: default;
            }
            #ap-modal-overlay.ap-modal-viewport .ap-modal-card {
                position: relative !important;
                z-index: 1 !important;
                width: min(780px, 100%) !important;
                max-width: 780px !important;
                max-height: calc(100dvh - 32px) !important;
                display: flex !important;
                flex-direction: column !important;
                overflow: hidden !important;
                border-radius: 26px !important;
                border: 1px solid rgba(148, 163, 184, 0.20) !important;
                background: linear-gradient(180deg, rgba(15, 23, 42, 0.985), rgba(7, 12, 27, 0.99)) !important;
                box-shadow: 0 30px 90px rgba(0, 0, 0, 0.62) !important;
            }
            #ap-modal-overlay.ap-modal-viewport .ap-modal-main {
                min-height: 0 !important;
                flex: 1 1 auto !important;
                display: flex !important;
                flex-direction: column !important;
                overflow: hidden !important;
                padding: 0 !important;
            }
            #ap-modal-overlay.ap-modal-viewport .ap-modal-header {
                flex: 0 0 auto !important;
                margin: 0 !important;
                padding: 20px 24px 18px !important;
                border-bottom: 1px solid rgba(148, 163, 184, 0.12) !important;
                background: rgba(15, 23, 42, 0.96) !important;
            }
            #ap-modal-overlay.ap-modal-viewport .ap-modal-header h3 {
                line-height: 1.1 !important;
            }
            #ap-modal-overlay.ap-modal-viewport .ap-modal-close {
                width: 42px !important;
                height: 42px !important;
                flex: 0 0 42px !important;
                border: 1px solid rgba(148, 163, 184, 0.16) !important;
                background: rgba(255, 255, 255, 0.06) !important;
            }
            #ap-modal-overlay.ap-modal-viewport .ap-modal-close:hover {
                background: rgba(255, 255, 255, 0.12) !important;
            }
            #ap-modal-overlay.ap-modal-viewport #ap-form {
                min-height: 0 !important;
                flex: 1 1 auto !important;
                overflow-y: auto !important;
                overscroll-behavior: contain;
                padding: 20px 24px 24px !important;
                margin: 0 !important;
                scrollbar-gutter: stable;
            }
            #ap-modal-overlay.ap-modal-viewport #ap-form::-webkit-scrollbar {
                width: 7px;
            }
            #ap-modal-overlay.ap-modal-viewport #ap-form::-webkit-scrollbar-track {
                background: transparent;
            }
            #ap-modal-overlay.ap-modal-viewport #ap-form::-webkit-scrollbar-thumb {
                background: rgba(148, 163, 184, 0.24);
                border-radius: 999px;
            }
            #ap-modal-overlay.ap-modal-viewport .ap-modal-actions {
                flex: 0 0 auto !important;
                display: flex !important;
                align-items: center !important;
                gap: 12px !important;
                margin: 0 !important;
                padding: 14px 20px !important;
                border-top: 1px solid rgba(148, 163, 184, 0.14) !important;
                background: rgba(8, 15, 31, 0.98) !important;
                box-shadow: 0 -14px 32px rgba(0, 0, 0, 0.22) !important;
            }
            #ap-modal-overlay.ap-modal-viewport .ap-modal-actions #ap-save-btn {
                min-height: 48px !important;
                flex: 1 1 auto !important;
                width: auto !important;
                margin: 0 !important;
            }
            #ap-modal-overlay.ap-modal-viewport .ap-modal-actions #ap-delete-btn {
                min-height: 48px !important;
                margin: 0 !important;
            }
            #ap-modal-overlay.ap-modal-viewport #ap-submit-status {
                flex: 0 0 auto !important;
                min-height: 38px !important;
                padding: 8px 16px !important;
                background: rgba(2, 6, 23, 0.92) !important;
            }
            @media (max-width: 640px) {
                #ap-modal-overlay.ap-modal-viewport {
                    padding: 8px !important;
                }
                #ap-modal-overlay.ap-modal-viewport .ap-modal-card {
                    width: 100% !important;
                    max-height: calc(100dvh - 16px) !important;
                    border-radius: 20px !important;
                }
                #ap-modal-overlay.ap-modal-viewport .ap-modal-header {
                    padding: 16px 16px 14px !important;
                }
                #ap-modal-overlay.ap-modal-viewport #ap-form {
                    padding: 16px !important;
                }
                #ap-modal-overlay.ap-modal-viewport .ap-modal-actions {
                    padding: 12px !important;
                }
            }
        `;
        document.head.appendChild(style);
    }

    // A fixed modal nested inside a transformed/scrolling Admin Hub can be clipped.
    // Mount it directly under body so it is always centered in the browser viewport.
    if (overlay.parentElement !== document.body) {
        document.body.appendChild(overlay);
    }
    overlay.classList.add('ap-modal-viewport');

    const card = Array.from(overlay.children).find(el => el.querySelector && el.querySelector('#ap-form'));
    const form = overlay.querySelector('#ap-form');
    const saveBtn = overlay.querySelector('#ap-save-btn');
    const deleteBtn = overlay.querySelector('#ap-delete-btn');
    const status = overlay.querySelector('#ap-submit-status');
    if (!card || !form) return;

    card.classList.add('ap-modal-card');
    const main = card.children[0];
    if (main && main !== status) {
        main.classList.add('ap-modal-main');
        const header = main.children[0];
        if (header && header !== form) {
            header.classList.add('ap-modal-header');
            const closeBtn = header.querySelector('button[onclick*="apCloseModal"]');
            if (closeBtn) {
                closeBtn.classList.add('ap-modal-close');
                closeBtn.setAttribute('aria-label', 'Close agent profile');
                closeBtn.setAttribute('title', 'Close');
            }
        }
    }

    // Move the action row out of the scrolling form. The Save button remains tied
    // to the form through the HTML form attribute, so validation/submit still works.
    if (saveBtn) {
        const actions = saveBtn.parentElement;
        if (actions) {
            actions.classList.add('ap-modal-actions');
            if (actions.parentElement !== card) {
                card.insertBefore(actions, status || null);
            }
        }
        saveBtn.setAttribute('form', 'ap-form');
        saveBtn.setAttribute('type', 'submit');
    }
    if (deleteBtn) deleteBtn.setAttribute('type', 'button');

    const backdrop = overlay.children[0];
    if (backdrop && backdrop !== card) {
        backdrop.setAttribute('data-ap-backdrop', 'true');
        // Use one centralized outside-click handler rather than relying on an
        // inline backdrop handler that can be lost when the modal is re-mounted.
        backdrop.removeAttribute('onclick');
    }

    if (overlay.dataset.apOutsideCloseBound !== '1') {
        overlay.dataset.apOutsideCloseBound = '1';
        overlay.addEventListener('pointerdown', function(event) {
            const currentCard = overlay.querySelector('.ap-modal-card');
            if (!currentCard || !currentCard.contains(event.target)) {
                window.apCloseModal();
            }
        });
    }
};

// Escape is another safe, expected way to dismiss a modal.
if (!window.__apEscapeCloseBound) {
    window.__apEscapeCloseBound = true;
    document.addEventListener('keydown', function(event) {
        if (event.key !== 'Escape') return;
        const overlay = document.getElementById('ap-modal-overlay');
        if (overlay && !overlay.classList.contains('hidden') && overlay.style.display !== 'none') {
            window.apCloseModal();
        }
    });
}

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

    window.apPrepareModalForViewport(overlay);

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
        for (const slot of ['morning', 'afternoon']) {
            const schedule = agent.breakSchedule?.[slot] || {};
            document.getElementById('ap-break-' + slot).value = schedule.time || '';
            document.getElementById('ap-break-' + slot + '-minutes').value = schedule.minutes || 10;
        }

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
                        if (goalsBadge) goalsBadge.textContent = `Daily · Low: ${goals.low}  High: ${goals.high}`;
                    } else {
                        if (goalsBadge) goalsBadge.textContent = 'No daily goal set';
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

// Delete agent — purge the profile from every active dashboard source.
window.apDeleteAgent = async function() {
    const userId = document.getElementById('ap-userid').value;
    const name = document.getElementById('ap-name').value;
    const current = (window.allAgentProfiles || []).find(p => String(p.userId || p.id || '') === String(userId)) || {};

    if (!confirm(`Permanently remove ${name} (${userId}) from Firebase and all active dashboard areas?`)) return;

    let result = { success: false };
    if (typeof window.purgeAgentEverywhere === 'function') {
        result = await window.purgeAgentEverywhere({ ...current, userId, fullName: name || current.fullName || current.name || '' });
    } else {
        if (typeof window.deleteAgentFromFirestore === 'function') await window.deleteAgentFromFirestore(userId);
        if (typeof window.deleteAgentFromRTDB === 'function') await window.deleteAgentFromRTDB(userId);
        result = { success: true };
    }
    if (!result || result.success === false) {
        alert('Could not completely remove this agent. Please try again.');
        return;
    }
    if (typeof window.writeAdminActivityLog === 'function') {
        window.writeAdminActivityLog('agent_management', `Deleted profile for ${name} (${userId}) and purged active references`);
    }
    apCloseModal();
};
