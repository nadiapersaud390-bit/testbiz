/**
 * Dashboard Logic with Role-Based Access Control
 * Implements privacy for agents while maintaining global floor stats.
 */

// Global state variables (assumed initialized elsewhere)
// let agents = [];
// let dayHistory = [];
// let currentTab = 'daily';
// let currentDayView = 'today';
// ...

async function updateDashboard() {
    const btn = document.getElementById('refresh-btn');
    if (btn) btn.classList.add('spin-anim');

    try {
        const res = await fetch(API_URL);
        agents = await res.json();

        // Data enrichment
        agents.forEach(a => {
            if (!a.team) a.team = getTeam(a.name);
        });

        // Client-side Guyana day override
        if (agents.length > 0) {
            agents[0].todayName = getGuyanaToday();
        }

        // Process Day History
        if (agents.length > 0 && agents[0].dayHistory) {
            dayHistory = agents[0].dayHistory;
            dayHistory.forEach(d => {
                d.agents.forEach(a => {
                    if (!a.team) a.team = getTeam(a.name);
                });
            });
        }

        // Calculate Team Totals if missing
        if (agents.length > 0 && !agents[0].prTotal && !agents[0].bbTotal) {
            let pr = 0, bb = 0;
            agents.forEach(a => {
                if (a.team === 'PR') pr += (a.dailyLeads || 0);
                else bb += (a.dailyLeads || 0);
            });
            agents[0].prTotal = pr;
            agents[0].bbTotal = bb;
        }

        // Update prank list
        if (agents.length > 0 && agents[0].prankNumbers && agents[0].prankNumbers.length > 0) {
            agents[0].prankNumbers.forEach(n => {
                if (n && !KNOWN_PRANK_NUMBERS.includes(n)) KNOWN_PRANK_NUMBERS.push(n);
            });
        }

        checkLeadAlerts(agents);
        render();
        renderDaySubTabs();

        const ts = document.getElementById('timestamp');
        if (ts) ts.innerText = 'Live: ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    } catch (e) {
        const ts = document.getElementById('timestamp');
        if (ts) ts.innerText = 'System Offline';
        console.error("Dashboard Update Error:", e);
    } finally {
        if (btn) setTimeout(() => btn.classList.remove('spin-anim'), 1000);
    }
}

// Auto-refresh every 10 seconds
setInterval(updateDashboard, 10000);

// ===== MILESTONE TRACKER FUNCTIONS =====

/**
 * Updates the 5-star milestone tracker based on percentage of goal achieved
 * @param {number} totalLeads - Total leads from all agents
 * @param {number} target - Goal target (150 for daily, 800 for weekly)
 */
function updateMilestoneStars(totalLeads, target) {
    // Calculate percentage (capped at 100%)
    const percentage = Math.min((totalLeads / target) * 100, 100);
    
    // Define milestone thresholds (20% increments)
    const milestones = [20, 40, 60, 80, 100];
    
    // Track previously unlocked milestone for notifications
    const previousMilestone = window._lastMilestone || 0;
    const currentMilestone = Math.floor(percentage / 20) * 20;
    
    // Update each star based on milestone thresholds
    milestones.forEach((milestone, index) => {
        const starElement = document.getElementById(`star-${index + 1}`);
        if (!starElement) return;
        
        const icon = starElement.querySelector('i');
        const isUnlocked = percentage >= milestone;
        
        if (isUnlocked && icon.classList.contains('far')) {
            // Star just unlocked - celebrate!
            icon.classList.remove('far');
            icon.classList.add('fas');
            
            // Add celebration animation
            starElement.classList.add('celebrate');
            setTimeout(() => starElement.classList.remove('celebrate'), 600);
            
            // Show notification (skip for 100% - has its own celebration)
            if (milestone < 100) {
                showMilestoneNotification(milestone, totalLeads, target);
            }
            
            // Full completion celebration
            if (milestone === 100 && previousMilestone < 100) {
                celebrateFullMilestone();
            }
        } else if (!isUnlocked && icon.classList.contains('fas')) {
            // Should never happen (can't lose stars), but handle anyway
            icon.classList.remove('fas');
            icon.classList.add('far');
        }
    });
    
    // Store current milestone for next update
    window._lastMilestone = currentMilestone;
    
    // Update percentage display
    const percentEl = document.getElementById('goal-percent');
    if (percentEl) {
        percentEl.innerText = Math.floor(percentage) + '%';
    }
    
    // Return percentage for debugging
    return percentage;
}

/**
 * Show notification when a milestone is reached
 */
function showMilestoneNotification(milestone, currentLeads, target) {
    const notification = document.createElement('div');
    notification.className = 'milestone-notification';
    
    const starCount = milestone / 20;
    const stars = '★'.repeat(starCount);
    const leadsNeeded = Math.ceil((milestone / 100) * target);
    
    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
            <span style="font-size: 24px;">${stars}</span>
            <div>
                <div style="font-size: 12px; opacity: 0.9;">🎯 MILESTONE UNLOCKED!</div>
                <div style="font-size: 16px; font-weight: 900;">${milestone}% Goal Achieved</div>
                <div style="font-size: 11px; opacity: 0.8;">
                    ${currentLeads} / ${target} leads
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 3000);
}

/**
 * Celebration for 100% completion - creates confetti effect
 */
function celebrateFullMilestone() {
    // Create confetti effect
    for (let i = 0; i < 50; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti-particle';
        confetti.style.left = Math.random() * 100 + '%';
        confetti.style.animationDelay = Math.random() * 0.5 + 's';
        confetti.style.backgroundColor = `hsl(${Math.random() * 60 + 40}, 100%, 60%)`;
        document.body.appendChild(confetti);
        
        setTimeout(() => {
            if (confetti.parentNode) confetti.parentNode.removeChild(confetti);
        }, 1000);
    }
    
    // Show big celebration
    const celebration = document.createElement('div');
    celebration.className = 'milestone-notification';
    celebration.style.background = 'linear-gradient(135deg, #facc15, #f59e0b, #ef4444)';
    celebration.style.fontSize = '18px';
    celebration.style.padding = '16px 32px';
    celebration.innerHTML = `
        <div style="text-align: center;">
            <div style="font-size: 32px;">🏆 ★★★★★ 🏆</div>
            <div style="font-weight: 900; font-size: 20px;">PERFECT! GOAL ACHIEVED!</div>
            <div style="font-size: 13px; margin-top: 5px;">🔥 All 5 stars unlocked! 🔥</div>
        </div>
    `;
    document.body.appendChild(celebration);
    
    setTimeout(() => {
        if (celebration.parentNode) celebration.parentNode.removeChild(celebration);
    }, 4000);
}

// ===== END MILESTONE TRACKER FUNCTIONS =====

function render() {
    // 1. Session & Role Check
    const bizUserRole = sessionStorage.getItem('bizUserRole'); // 'admin' or 'agent'
    const agentProfileRaw = sessionStorage.getItem('currentAgentProfile');
    let userProfile = null;
    try { userProfile = JSON.parse(agentProfileRaw); } catch(e) {}

    const lView = document.getElementById('leaderboard-view');
    const pView = document.getElementById('playbook-view');
    const luView = document.getElementById('lookup-view');
    const prView = document.getElementById('prank-view');
    const rbView = document.getElementById('rebuttals-view');
    const trView = document.getElementById('trivia-view');

    // Hide all views first
    [lView, pView, luView, prView, rbView, trView].forEach(v => { if (v) v.classList.add('hidden'); });

    // Handle non-leaderboard tabs
    if (currentTab === 'playbook') { pView.classList.remove('hidden'); return; }
    if (currentTab === 'lookup') { luView.classList.remove('hidden'); return; }
    if (currentTab === 'prank') { if (prView) prView.classList.remove('hidden'); return; }
    if (currentTab === 'rebuttals') { if (rbView) rbView.classList.remove('hidden'); return; }
    if (currentTab === 'trivia') { if (trView) trView.classList.remove('hidden'); return; }

    lView.classList.remove('hidden');

    // 2. Setup Variables
    const isWeekly = currentTab === 'weekly';
    const isHistory = currentTab === 'daily' && currentDayView !== 'today';
    const target = isWeekly ? 800 : 150;
    const todayName = agents.length > 0 ? (agents[0].todayName || 'Today') : 'Today';

    // UI Goal Labels
    const banner = document.getElementById('history-banner');
    if (isHistory) {
        const snap = dayHistory.find(d => d.day === currentDayView);
        document.getElementById('history-banner-text').innerText = 'Viewing ' + (snap ? snap.dayName : DAY_FULL[currentDayView]) + ' — Final Results';
        banner.classList.remove('hidden');
    } else {
        if (banner) banner.classList.add('hidden');
    }

    document.getElementById('goal-label').innerText = isWeekly ? 'Weekly Team Goal' : isHistory ? DAY_FULL[currentDayView] + ' Final' : todayName + ' Daily Goal';
    document.getElementById('target-display').innerText = 'Target: ' + target;
    document.getElementById('day-indicator').innerText = isWeekly ? 'Weekly Sprint' : isHistory ? DAY_SHORT[currentDayView] + ' — Completed' : todayName + ' Performance';

    // 3. Process Data
    let fullList = []; // The original full list for global stats
    let prTotal = 0, bbTotal = 0, totalLeads = 0, masters = 0, activeReps = 0;

    if (isHistory) {
        const snap = dayHistory.find(d => d.day === currentDayView);
        if (snap) {
            fullList = [...snap.agents].sort((a, b) => b.leads - a.leads);
            prTotal = snap.prTotal || 0;
            bbTotal = snap.bbTotal || 0;
            // Fallback calculation for totals
            if (!prTotal && !bbTotal) {
                fullList.forEach(a => { if (a.team === 'PR') prTotal += a.leads; else bbTotal += a.leads; });
            }
        }
    } else {
        fullList = agents.map(a => ({
            name: a.name,
            leads: isWeekly ? (a.weeklyLeads || 0) : (a.dailyLeads || 0),
            team: a.team || getTeam(a.name),
            ytelId: a.ytelId // Ensure ID is mapped for filtering
        })).sort((a, b) => b.leads - a.leads);

        if (isWeekly) {
            fullList.forEach(a => { if (a.team === 'PR') prTotal += a.leads; else bbTotal += a.leads; });
        } else if (agents.length > 0) {
            prTotal = agents[0].prTotal || 0;
            bbTotal = agents[0].bbTotal || 0;
            if (!prTotal && !bbTotal) {
                fullList.forEach(a => { if (a.team === 'PR') prTotal += a.leads; else bbTotal += a.leads; });
            }
        }
    }

    // 4. Global Stat Calculations (Always based on full team)
    fullList.forEach(agent => {
        totalLeads += agent.leads;
        if (agent.leads >= 12) masters++;
        if (agent.leads > 0) activeReps++;
    });

    // 5. Filter List for View (RBAC Logic)
    let displayData = fullList;
    if (bizUserRole === 'agent' && userProfile && userProfile.ytelId) {
        // Find the index in the full sorted list to maintain their "Rank"
        const rankIndex = fullList.findIndex(a => a.ytelId === userProfile.ytelId);
        if (rankIndex !== -1) {
            // Keep the rank property on the object so it shows correctly in the UI
            const myData = { ...fullList[rankIndex], rank: rankIndex + 1 };
            displayData = [myData];
        } else {
            // If the agent is not in the list yet (0 leads), show nothing or a placeholder
            displayData = [];
        }
    } else {
        // Admin or fallback: add rank to all
        displayData = displayData.map((a, i) => ({ ...a, rank: i + 1 }));
    }

    // 6. Rendering
    document.getElementById('leaderboard').innerHTML = displayData.map((agent) => {
        const lvl = getLevel(agent.leads);
        const rank = agent.rank;
        const badge = agent.team === 'PR' 
            ? '<span style="font-size:8px;background:rgba(167,139,250,0.15);border:1px solid rgba(167,139,250,0.3);border-radius:4px;padding:1px 5px;color:#a78bfa;font-weight:900;margin-left:6px;">PROV</span>' 
            : '<span style="font-size:8px;background:rgba(192,132,252,0.15);border:1px solid rgba(192,132,252,0.3);border-radius:4px;padding:1px 5px;color:#c084fc;font-weight:900;margin-left:6px;">BERB</span>';

        return `
            <div class="glass p-5 rounded-2xl flex justify-between items-center transition-all hover:bg-white/5 ${lvl.cls} mb-3 md:mb-0 md:m-2">
                <div class="flex items-center gap-4">
                    <span class="text-xl font-black italic ${rank <= 3 ? 'text-white' : 'text-slate-700'}">
                        ${String(rank).padStart(2, '0')}
                    </span>
                    <div>
                        <div class="font-black text-sm md:text-lg text-white uppercase flex items-center flex-wrap gap-1">
                            ${agent.name}${badge}
                        </div>
                        <div class="text-[9px] font-black uppercase tracking-widest ${lvl.color}">
                            ${lvl.title} STATUS
                        </div>
                    </div>
                </div>
                <div class="text-right">
                    <div class="text-2xl md:text-3xl font-black text-white leading-none">${agent.leads}</div>
                    <div class="text-[8px] text-slate-500 uppercase font-black mt-1">Transfers</div>
                </div>
            </div>`;
    }).join('');

    // Update Bottom Stats Bar (Uses the global values calculated in step 4)
    document.getElementById('floor-total').innerText = totalLeads;
    document.getElementById('master-count').innerText = String(masters).padStart(2, '0');
    document.getElementById('active-reps').innerText = activeReps;
    document.getElementById('current-leads-sum').innerText = totalLeads + ' Leads';
    document.getElementById('pr-count').innerText = prTotal;
    document.getElementById('bb-count').innerText = bbTotal;

    // ===== UPDATE MILESTONE STARS (Replaces Progress Bar) =====
    // Calculate percentage and update the 5-star milestone tracker
    const pct = Math.min((totalLeads / target) * 100, 100);
    updateMilestoneStars(totalLeads, target);
}

/**
 * Tier Thresholds
 */
function getLevel(l) {
    if (l >= 17) return { title: 'CONQUEROR', cls: 'conqueror-tier', color: 'text-red-500' };
    if (l >= 12) return { title: 'MASTER', cls: 'gold-tier', color: 'text-yellow-500' };
    if (l >= 7) return { title: 'ELITE', cls: 'orange-tier', color: 'text-orange-500' };
    if (l >= 4) return { title: 'PRO', cls: 'blue-tier', color: 'text-blue-500' };
    return { title: 'ROOKIE', cls: 'slate-tier', color: 'text-slate-500' };
}

/**
 * Navigation & Tab UI
 */
function renderDaySubTabs() {
    const wrapper = document.getElementById('day-sub-tabs-wrapper');
    const container = document.getElementById('day-sub-tabs-container');
    if (currentTab !== 'daily' || !dayHistory.length) {
        if (wrapper) wrapper.classList.add('hidden');
        return;
    }
    let html = `<button onclick="switchDayView('today')" class="day-sub-tab is-today ${currentDayView === 'today' ? 'active' : ''}">Today</button>`;
    dayHistory.forEach(d => {
        html += `<button onclick="switchDayView(${d.day})" class="day-sub-tab is-history ${currentDayView === d.day ? 'active' : ''}">${DAY_SHORT[d.day]}<span class="history-dot"></span></button>`;
    });
    container.innerHTML = html;
    wrapper.classList.remove('hidden');
}

function switchDayView(key) {
    currentDayView = key;
    renderDaySubTabs();
    render();
}

function switchTab(tab) {
    if (tab === 'weekly') { requestWeekly(); return; }
    currentTab = tab;
    currentDayView = 'today';
    updateTabUI();
    render();
    renderDaySubTabs();
    if (tab === 'lookup') renderLookupHistory();
    if (tab === 'trivia') initTriviaTab();
}

function updateTabUI() {
    ['daily', 'lookup', 'playbook', 'rebuttals', 'prank', 'weekly', 'trivia'].forEach(t => {
        const b = document.getElementById('tab-' + t);
        if (!b) return;
        if (t === currentTab) {
            b.className = 'flex-1 glass py-3 rounded-xl text-[10px] md:text-sm font-black uppercase tracking-widest transition-all tab-active';
            b.style.background = ''; b.style.color = '';
            if (t === 'trivia') {
                b.style.background = 'linear-gradient(90deg,rgba(255,229,0,0.2),rgba(255,107,0,0.2))';
                b.style.borderColor = 'rgba(255,229,0,0.5)';
            }
        } else {
            b.className = 'flex-1 glass py-3 rounded-xl text-[10px] md:text-sm font-black uppercase tracking-widest transition-all text-slate-500';
            b.style.background = '';
            if (t === 'rebuttals') { b.style.color = '#14b8a6'; b.style.borderColor = 'rgba(20,184,166,0.3)'; }
            else if (t === 'prank') { b.style.color = '#a855f7'; }
            else if (t === 'trivia') { b.style.color = '#f59e0b'; b.style.borderColor = 'rgba(245,158,11,0.3)'; }
        }
    });
}

function requestWeekly() {
    if (weeklyUnlocked) {
        currentTab = 'weekly';
        updateTabUI();
        render();
        renderDaySubTabs();
        return;
    }
    const modal = document.getElementById('pw-modal');
    modal.classList.remove('hidden');
    const input = document.getElementById('pw-input');
    input.value = '';
    document.getElementById('pw-error').innerText = '';
    input.classList.remove('error');
    setTimeout(() => input.focus(), 100);
}

function checkPassword() {
    if (document.getElementById('pw-input').value === WEEKLY_PASSWORD) {
        weeklyUnlocked = true;
        document.getElementById('pw-modal').classList.add('hidden');
        document.getElementById('tab-weekly').innerHTML = 'Weekly';
        currentTab = 'weekly';
        currentDayView = 'today';
        updateTabUI();
        render();
        renderDaySubTabs();
    } else {
        const inp = document.getElementById('pw-input');
        inp.classList.add('error');
        document.getElementById('pw-error').innerText = 'Incorrect access code. Try again.';
        inp.value = '';
        setTimeout(() => inp.classList.remove('error'), 500);
        setTimeout(() => inp.focus(), 100);
    }
}

function cancelPassword() {
    document.getElementById('pw-modal').classList.add('hidden');
}
