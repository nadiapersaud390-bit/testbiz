/**
 * Dashboard Logic
 * All logged-in users see the full leaderboard.
 * The logged-in agent's own row is highlighted automatically.
 */

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
        banner.classList.add('hidden');
    }

    const isAdmin = sessionStorage.getItem('bizUserRole') === 'admin';
    const targetDisplay = document.getElementById('target-display');

    document.getElementById('goal-label').innerText = isWeekly ? 'Weekly Team Goal' : isHistory ? DAY_FULL[currentDayView] + ' Final' : todayName + ' Daily Goal';

    if (targetDisplay) {
        targetDisplay.innerText = isAdmin ? 'Target: ' + target : '';
        targetDisplay.style.display = isAdmin ? '' : 'none';
    }

    document.getElementById('day-indicator').innerText = isWeekly ? 'Weekly Sprint' : isHistory ? DAY_SHORT[currentDayView] + ' — Completed' : todayName + ' Performance';

    // 3. Process Data
    let fullList = [];
    let prTotal = 0, bbTotal = 0, totalLeads = 0, masters = 0, activeReps = 0;

    if (isHistory) {
        const snap = dayHistory.find(d => d.day === currentDayView);
        if (snap) {
            fullList = [...snap.agents].sort((a, b) => b.leads - a.leads);
            prTotal = snap.prTotal || 0;
            bbTotal = snap.bbTotal || 0;
            if (!prTotal && !bbTotal) {
                fullList.forEach(a => { if (a.team === 'PR') prTotal += a.leads; else bbTotal += a.leads; });
            }
        }
    } else {
        fullList = agents.map(a => ({
            name: a.name,
            leads: isWeekly ? (a.weeklyLeads || 0) : (a.dailyLeads || 0),
            team: a.team || getTeam(a.name),
            ytelId: a.ytelId || ''
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

    // 4. Global Stat Calculations
    fullList.forEach(agent => {
        totalLeads += agent.leads;
        if (agent.leads >= 12) masters++;
        if (agent.leads > 0) activeReps++;
    });

    // 5. All users see the full leaderboard
    const displayData = fullList.map((a, i) => ({ ...a, rank: i + 1 }));

    // 6. Rendering
    document.getElementById('leaderboard').innerHTML = displayData.map((agent) => {
        const lvl = getLevel(agent.leads);
        const rank = agent.rank;
        const isMe = myName && agent.name && agent.name.trim().toUpperCase() === myName;

        const badge = agent.team === 'PR'
            ? '<span style="font-size:8px;background:rgba(167,139,250,0.15);border:1px solid rgba(167,139,250,0.3);border-radius:4px;padding:1px 5px;color:#a78bfa;font-weight:900;margin-left:6px;">PROV</span>'
            : '<span style="font-size:8px;background:rgba(192,132,252,0.15);border:1px solid rgba(192,132,252,0.3);border-radius:4px;padding:1px 5px;color:#c084fc;font-weight:900;margin-left:6px;">BERB</span>';

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
            b.style.background = '';
            b.style.color = '';

            if (t === 'trivia') {
                b.style.background = 'linear-gradient(90deg,rgba(255,229,0,0.2),rgba(255,107,0,0.2))';
                b.style.borderColor = 'rgba(255,229,0,0.5)';
            }
        } else {
            b.className = 'flex-1 glass py-3 rounded-xl text-[10px] md:text-sm font-black uppercase tracking-widest transition-all text-slate-500';
            b.style.background = '';

            if (t === 'rebuttals') {
                b.style.color = '#14b8a6';
                b.style.borderColor = 'rgba(20,184,166,0.3)';
            } else if (t === 'prank') {
                b.style.color = '#a855f7';
            } else if (t === 'trivia') {
                b.style.color = '#f59e0b';
                b.style.borderColor = 'rgba(245,158,11,0.3)';
            }
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
