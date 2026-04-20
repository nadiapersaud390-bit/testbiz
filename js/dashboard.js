/**
 * Dashboard Logic
 * All logged-in users see the full leaderboard.
 * The logged-in agent's own row is highlighted automatically.
 */

let isDashboardSubscribed = false;

function updateDashboard() {
    const btn = document.getElementById('refresh-btn');
    if (btn) {
        btn.classList.add('spin-anim');
        setTimeout(() => btn.classList.remove('spin-anim'), 1000);
    }

    if (!isDashboardSubscribed && typeof window.listenForLiveDashboardState === 'function') {
        window.listenForLiveDashboardState((state) => {
            if (!state) {
                const ts = document.getElementById('timestamp');
                if (ts) ts.innerText = 'System Offline: No Live Data';
                return;
            }
            
            // SECURITY: Check if state is from TODAY
            // If pushed yesterday, it shouldn't show in the "Today" tab
            const now = new Date();
            const pushDate = state.pushedAt ? new Date(state.pushedAt) : null;
            
            // Check if dateLabel matches today (e.g. "Apr 18, 2026")
            const todayStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const labelMatches = state.dateLabel && state.dateLabel.includes(todayStr);
            
            const isToday = pushDate && 
                            pushDate.toLocaleDateString('en-GB') === now.toLocaleDateString('en-GB') &&
                            labelMatches;

            // Construct agents array
            if (isToday) {
                agents = (state.agents || []).map(a => {
                    // If name is just numbers (ID), try to find real name in master roster
                    let realName = a.name;
                    if (window.biz_master_roster && /^\d+$/.test(a.name)) {
                        const profile = window.biz_master_roster.find(p => String(p.userId) === String(a.name));
                        if (profile) realName = profile.fullName;
                    }
                    return { ...a, name: realName };
                });
            } else {
                agents = []; // Stale data, hide it
                const ts = document.getElementById('timestamp');
                if (ts) ts.innerText = 'System Waiting: No Upload for Today Yet';
            }
            
            // Re-apply normalizations
            agents.forEach(a => {
                a.team = normalizeTeam(a.team, a.name);
            });
            
            if (agents.length > 0) {
                agents[0].todayName = state.dateLabel || getGuyanaToday();
                
                let pr = 0, bb = 0, rm = 0;
                agents.forEach(a => {
                    if (a.team === 'PR') pr += (a.dailyLeads || 0);
                    else if (a.team === 'BB') bb += (a.dailyLeads || 0);
                    else if (a.team === 'RM') rm += (a.dailyLeads || 0);
                });
                agents[0].prTotal = pr;
                agents[0].bbTotal = bb;
                agents[0].rmTotal = rm;
            }
            
            checkLeadAlerts(agents);
            if (currentDayView === 'today') render();
            renderDaySubTabs();
            
            const ts = document.getElementById('timestamp');
            if (ts) ts.innerText = 'Globally Synced: ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        });
        
        // Auto-Link Historical CSV Reports to the Daily Tabs!
        if (typeof window.listenForAgentReports === 'function') {
            window.listenForAgentReports(data => {
                if(!data) return;
                
                // 1. Determine "Current Week" (Monday start)
                const now = new Date();
                const day = now.getDay();
                const diff = now.getDate() - day + (day === 0 ? -6 : 1);
                const monday = new Date(now.setDate(diff));
                monday.setHours(0,0,0,0);

                const thisWeek = data.filter(r => new Date(r.uploadedAt) >= monday);
                
                const weekdays = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
                const weekMap = {};
                
                thisWeek.forEach(r => {
                    const dayKey = r.dayOfWeek || (typeof getGuyanaDayName === 'function' ? getGuyanaDayName(new Date(r.uploadedAt)) : 'MON');
                    if (weekdays.includes(dayKey)) {
                        if (!weekMap[dayKey] || new Date(r.uploadedAt) > new Date(weekMap[dayKey].uploadedAt)) {
                           weekMap[dayKey] = r;
                        }
                    }
                });

                dayHistory = weekdays.map(day => {
                    const r = weekMap[day];
                    if (!r) return { day: day, empty: true, dayName: day };
                    
                    const agg = {};
                    (r.data || []).forEach(d => {
                        const id = d.agentId || d.ytelId || d.name;
                        const name = d.agentName || d.name;
                        const rawName = d.rawName || name;
                        
                        // Use a composite key to ensure unique agents are merged correctly
                        const aggKey = (id || 'ID') + '_' + (name || 'NAME');
                        
                        if(id) {
                            if(!agg[aggKey]) {
                                agg[aggKey] = { 
                                    name: name, 
                                    leads: 0, 
                                    rawName: rawName,
                                    ytelId: id 
                                };
                            }
                            
                            let l = d.dailyLeads || 0;
                            // If it's a raw dialer report (duration available), 
                            // count 2+ mins as a transfer
                            if(d.duration !== undefined && d.duration >= 120) l = 1;
                            agg[id].leads += l;
                        }
                    });
                    
                    return {
                        day: day,
                        dayName: day,
                        fullDate: r.reportDate,
                        agents: Object.values(agg).map(a => ({
                            name: a.name,
                            leads: a.leads,
                            ytelId: a.ytelId,
                            rawName: a.rawName,
                            team: typeof normalizeTeam === 'function' ? normalizeTeam('', a.rawName) : 'PR'
                        }))
                    };
                });
                renderDaySubTabs();
                if(currentDayView !== 'today') render(); 
            });
        }
        
        isDashboardSubscribed = true;
    } else if (isDashboardSubscribed) {
        // Just re-render if pushed manually
        if(typeof render === 'function') render();
    }
}

// Check every few seconds to hook up initialization if it missed
setInterval(() => {
    if(!isDashboardSubscribed) updateDashboard();
}, 5000);
updateDashboard();

function render() {
    // 1. Session Info (used for highlighting own row only)
    const agentProfileRaw = sessionStorage.getItem('currentAgentProfile');
    let userProfile = null;
    try { userProfile = JSON.parse(agentProfileRaw); } catch(e) {}
    const myName = userProfile ? (userProfile.name || '').trim().toUpperCase() : '';

    const lView = document.getElementById('leaderboard-view');
    const pView = document.getElementById('playbook-view');
    const luView = document.getElementById('lookup-view');
    const prView = document.getElementById('prank-view');
    const rbView = document.getElementById('rebuttals-view');
    const trView = document.getElementById('trivia-view');
    const adView = document.getElementById('adminpanel-view');
    const sadView = document.getElementById('superadminpanel-view');
    const asView = document.getElementById('agentstats-view');
    const trackerView = document.getElementById('tracker-view');

    // Hide all views first
    [lView, pView, luView, prView, rbView, trView, adView, sadView, asView, trackerView].forEach(v => { if (v) v.classList.add('hidden'); });

    // Handle non-leaderboard tabs
    if (currentTab === 'playbook') { pView.classList.remove('hidden'); return; }
    if (currentTab === 'lookup') { luView.classList.remove('hidden'); return; }
    if (currentTab === 'prank') { if (prView) prView.classList.remove('hidden'); return; }
    if (currentTab === 'rebuttals') { if (rbView) rbView.classList.remove('hidden'); return; }
    if (currentTab === 'trivia') { if (trView) trView.classList.remove('hidden'); return; }
    if (currentTab === 'adminpanel') { if (adView) adView.classList.remove('hidden'); return; }
    if (currentTab === 'superadminpanel') { if (sadView) sadView.classList.remove('hidden'); return; }
    if (currentTab === 'agentstats') { if (asView) asView.classList.remove('hidden'); return; }
    if (currentTab === 'tracker') { if (trackerView) trackerView.classList.remove('hidden'); return; }

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
        const dayLong = snap ? (snap.dayName === 'MON' ? 'Monday' : 
                               snap.dayName === 'TUE' ? 'Tuesday' : 
                               snap.dayName === 'WED' ? 'Wednesday' : 
                               snap.dayName === 'THU' ? 'Thursday' : 
                               snap.dayName === 'FRI' ? 'Friday' : 
                               snap.dayName === 'SAT' ? 'Saturday' : 
                               snap.dayName === 'SUN' ? 'Sunday' : snap.dayName) : 'Historical';
        
        document.getElementById('goal-label').innerText = dayLong.toUpperCase() + ' FINAL';
        document.getElementById('day-indicator').innerText = (dayLong.substring(0,3).toUpperCase()) + ' — COMPLETED';
        if (banner) {
            document.getElementById('history-banner-text').innerHTML = `<i class="fas fa-history mr-2"></i> VIEWING ${dayLong.toUpperCase()} — FINAL RESULTS`;
            banner.classList.remove('hidden');
        }
    } else {
        if(banner) banner.classList.add('hidden');
        document.getElementById('goal-label').innerText = isWeekly ? 'Weekly Team Goal' : todayName.toUpperCase() + ' DAILY GOAL';
        document.getElementById('day-indicator').innerText = isWeekly ? 'Weekly Sprint' : todayName.toUpperCase() + ' PERFORMANCE';
    }

    const isAdmin = sessionStorage.getItem('bizUserRole') === 'admin';
    const targetDisplay = document.getElementById('target-display');

    if (targetDisplay) {
        targetDisplay.innerText = isAdmin ? 'Target: ' + target : '';
        targetDisplay.style.display = isAdmin ? '' : 'none';
    }

    // 3. Process Data
    let fullList = [];
    let prTotal = 0, bbTotal = 0, rmTotal = 0, totalLeads = 0, masters = 0, activeReps = 0;

    if (isHistory) {
        const snap = dayHistory.find(d => d.day === currentDayView);
        if (snap) {
            fullList = [...snap.agents]
                .filter(a => !(a.name && String(a.name).toUpperCase().startsWith('PH ')))
                .sort((a, b) => b.leads - a.leads);
            fullList = fullList.map(a => {
                const cleanName = typeof stripPrefix === 'function' ? stripPrefix(a.name).toUpperCase() : a.name;
                const rawName = a.rawName || a.name;
                return {
                    ...a,
                    name: cleanName,
                    rawName: rawName,
                    team: normalizeTeam(a.team, rawName)
                };
            });
            fullList.forEach(a => {
                if (a.team === 'PR') prTotal += a.leads;
                else if (a.team === 'BB') bbTotal += a.leads;
                else if (a.team === 'RM') rmTotal += a.leads;
            });
        }
    } else {
        fullList = agents
            .filter(a => !(a.name && String(a.name).toUpperCase().startsWith('PH ')))
            .map(a => ({
                name: typeof stripPrefix === 'function' ? stripPrefix(a.name).toUpperCase() : a.name,
                leads: isWeekly ? (a.weeklyLeads || 0) : (a.dailyLeads || 0),
                team: normalizeTeam(a.team, a.name),
                ytelId: a.ytelId || ''
            })).sort((a, b) => b.leads - a.leads);

        fullList.forEach(a => {
            if (a.team === 'PR') prTotal += a.leads;
            else if (a.team === 'BB') bbTotal += a.leads;
            else if (a.team === 'RM') rmTotal += a.leads;
        });
    }

    // 4. Global Stat Calculations
    fullList.forEach(agent => {
        totalLeads += agent.leads;
        if (agent.leads >= 12) masters++;
        activeReps++; // Count every agent in the list to reach 40+ total
    });

    // 5. All users see the full leaderboard
    const displayData = fullList.map((a, i) => ({ ...a, rank: i + 1 }));

    // 6. Rendering
    document.getElementById('leaderboard').innerHTML = displayData.map((agent) => {
        const lvl = getLevel(agent.leads);
        const rank = agent.rank;
        const isMe = myName && agent.name && agent.name.trim().toUpperCase() === myName;

        const teamMeta = getTeamMeta(agent.team);
        const badge = `<span style="font-size:8px;background:rgba(${teamMeta.rgb},0.15);border:1px solid rgba(${teamMeta.rgb},0.3);border-radius:4px;padding:1px 5px;color:${teamMeta.color};font-weight:900;margin-left:6px;">${teamMeta.label}</span>`;

        const myHighlight = isMe
            ? 'outline: 2px solid rgba(250,204,21,0.6); outline-offset: -2px;'
            : '';

        return `
            <div class="glass p-5 rounded-2xl flex justify-between items-center transition-all hover:bg-white/5 ${lvl.cls} mb-3 md:mb-0 md:m-2" style="${myHighlight}">
                <div class="flex items-center gap-4">
                    <span class="text-xl font-black italic ${rank <= 3 ? 'text-white' : 'text-slate-700'}">
                        ${String(rank).padStart(2, '0')}
                    </span>
                    <div>
                        <div class="font-black text-sm md:text-lg text-white uppercase flex items-center flex-wrap gap-1">
                            ${agent.name}${badge}${isMe ? '<span style="font-size:8px;background:rgba(250,204,21,0.15);border:1px solid rgba(250,204,21,0.35);border-radius:4px;padding:1px 6px;color:#facc15;font-weight:900;margin-left:4px;">YOU</span>' : ''}
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

    // Update Bottom Stats Bar
    document.getElementById('floor-total').innerText = totalLeads;
    document.getElementById('master-count').innerText = String(masters).padStart(2, '0');
    document.getElementById('active-reps').innerText = activeReps;
    document.getElementById('current-leads-sum').innerText = totalLeads + ' Leads';
    document.getElementById('pr-count').innerText = prTotal;
    document.getElementById('bb-count').innerText = bbTotal;
    document.getElementById('rm-count').innerText = rmTotal;

    // Progress Bar
    const pct = Math.min((totalLeads / target) * 100, 100);
    document.getElementById('progress-bar').style.width = pct + '%';
    document.getElementById('goal-percent').innerText = Math.floor(pct) + '%';
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
        const hasHistory = !d.empty;
        const isActive = currentDayView === d.day;
        html += `
            <button onclick="switchDayView('${d.day}')" 
                    class="day-sub-tab is-history ${isActive ? 'active' : ''}" 
                    ${!hasHistory ? 'disabled style="opacity:0.3;cursor:not-allowed;"' : ''}>
                ${d.dayName}${hasHistory ? '<span class="history-dot"></span>' : ''}
            </button>`;
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
    if (tab === 'agentstats' && typeof renderAgentStatsHistory === 'function') renderAgentStatsHistory();
    if (tab === 'adminpanel' && typeof window.ahInitOverview === 'function') window.ahInitOverview();
    if (tab === 'tracker' && typeof window.initTracker === 'function') window.initTracker();
}

function updateTabUI() {
    ['daily', 'lookup', 'playbook', 'rebuttals', 'prank', 'weekly', 'trivia', 'adminpanel', 'superadminpanel', 'agentstats', 'tracker'].forEach(t => {
        const b = document.getElementById('tab-' + t);
        if (!b) return;

        if (t === currentTab) {
            b.classList.add('tab-active');
            b.classList.remove('text-slate-500');
            b.style.background = '';
            b.style.color = '';

            if (t === 'trivia') {
                b.style.background = 'linear-gradient(90deg,rgba(255,229,0,0.2),rgba(255,107,0,0.2))';
                b.style.borderColor = 'rgba(255,229,0,0.5)';
            } else if (t === 'adminpanel') {
                b.style.color = 'white';
            } else if (t === 'superadminpanel') {
                b.style.color = 'white';
            }
        } else {
            b.classList.remove('tab-active');
            b.classList.add('text-slate-500');
            b.style.background = '';

            if (t === 'rebuttals') {
                b.style.color = '#14b8a6';
                b.style.borderColor = 'rgba(20,184,166,0.3)';
            } else if (t === 'prank') {
                b.style.color = '#a855f7';
            } else if (t === 'trivia') {
                b.style.color = '#f59e0b';
                b.style.borderColor = 'rgba(245,158,11,0.3)';
            } else if (t === 'tracker') {
                b.style.color = '#818cf8';
                b.style.borderColor = 'rgba(129,140,248,0.3)';
            } else if (t === 'adminpanel') {
                b.style.color = '#ef4444';
                b.style.borderColor = 'rgba(239,68,68,0.35)';
            } else if (t === 'superadminpanel') {
                b.style.color = '#eab308';
                b.style.borderColor = 'rgba(234,179,8,0.35)';
            }
        }
    });
}

function requestWeekly() {
    const isAdmin = sessionStorage.getItem('bizUserRole') === 'admin';
    if (weeklyUnlocked || isAdmin) {
        currentTab = 'weekly';
        updateTabUI();
        render();
        renderDaySubTabs();
        return;
    }

    const modal = document.getElementById('pw-modal');
    if (modal) modal.classList.remove('hidden');

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
window.showTeamDrilldown = function(teamCode) {
    const modal = document.getElementById('team-drill-modal');
    const list = document.getElementById('team-drill-list');
    const title = document.getElementById('team-drill-title');
    const tag = document.getElementById('team-drill-tag');
    if (!modal || !list) return;

    const teamLabels = { 'PR': 'Providence', 'BB': 'Berbice', 'RM': 'Remote' };
    const teamColors = { 'PR': 'text-purple-400', 'BB': 'text-fuchsia-400', 'RM': 'text-sky-400' };
    
    title.innerText = teamLabels[teamCode] || 'Team Breakdown';
    tag.innerText = teamCode;
    tag.className = `text-[8px] font-black uppercase tracking-[0.2em] px-2 py-0.5 rounded border border-white/10 inline-block mb-1 ${teamColors[teamCode] || 'text-slate-400'}`;

    // Get current board data
    const isWeekly = currentTab === 'weekly';
    const targetAgents = agents.length > 0 ? agents : [];
    
    // Use the roster if available to find EVERYONE in that team
    const roster = window.allAgentProfiles || [];
    const teamMembers = roster.length > 0 
        ? roster.filter(p => normalizeTeam(p.team, p.fullName) === teamCode)
        : targetAgents.filter(a => normalizeTeam(a.team, a.name) === teamCode);

    const mapped = teamMembers.map(m => {
        const live = targetAgents.find(a => String(a.ytelId) === String(m.userId || m.ytelId) || (a.name && a.name.toUpperCase() === (m.fullName || m.name).toUpperCase()));
        return {
            name: m.fullName || m.name,
            leads: live ? (isWeekly ? (live.weeklyLeads || 0) : (live.dailyLeads || 0)) : 0
        };
    }).sort((a, b) => b.leads - a.leads);

    list.innerHTML = mapped.map((a, i) => `
        <div class="bg-white/5 border border-white/5 rounded-xl p-3 flex justify-between items-center group hover:bg-white/10 transition">
            <div class="flex items-center gap-3">
                <div class="text-[10px] font-black text-slate-600 italic w-4">${i+1}</div>
                <div class="text-[11px] font-black text-white uppercase truncate max-w-[120px]">${a.name}</div>
            </div>
            <div class="text-right">
                <div class="text-xs font-black text-cyan-400 italic">${a.leads} <span class="text-[7px] text-slate-500 not-italic ml-0.5">XFERS</span></div>
            </div>
        </div>
    `).join('') || '<div class="py-10 text-center text-[10px] text-slate-600 font-bold uppercase tracking-widest">No agents assigned to this team</div>';

    modal.classList.remove('hidden');
};
