async function updateDashboard(forceRefresh = false) {
    const btn = document.getElementById('refresh-btn');
    if (btn) btn.classList.add('spin-anim');
    
    try {
        // Use the cached fetch function from config.js
        const data = await fetchDashboardData(forceRefresh);
        agents = data;
        
        agents.forEach(a => {
            if (!a.team) a.team = getTeam(a.name);
        });
        
        // Always override todayName with client-side Guyana day
        if (agents.length > 0) {
            agents[0].todayName = getGuyanaToday();
        }
        
        if (agents.length > 0 && agents[0].dayHistory) {
            dayHistory = agents[0].dayHistory;
            dayHistory.forEach(d => {
                d.agents.forEach(a => {
                    if (!a.team) a.team = getTeam(a.name);
                });
            });
        }
        
        // Calculate PR/BB totals if not provided
        if (agents.length > 0 && !agents[0].prTotal && !agents[0].bbTotal) {
            let pr = 0, bb = 0;
            agents.forEach(a => {
                if (a.team === 'PR') pr += (a.dailyLeads || 0);
                else bb += (a.dailyLeads || 0);
            });
            agents[0].prTotal = pr;
            agents[0].bbTotal = bb;
        }
        
        // Update prank numbers list
        if (agents.length > 0 && agents[0].prankNumbers && agents[0].prankNumbers.length > 0) {
            agents[0].prankNumbers.forEach(n => {
                if (n && window.KNOWN_PRANK_NUMBERS && !KNOWN_PRANK_NUMBERS.includes(n)) {
                    KNOWN_PRANK_NUMBERS.push(n);
                }
            });
        }
        
        // Trigger lead alerts
        if (typeof checkLeadAlerts === 'function') {
            checkLeadAlerts(agents);
        }
        
        // Render everything
        render();
        renderDaySubTabs();
        
        // Update timestamp
        const timestampEl = document.getElementById('timestamp');
        if (timestampEl) {
            timestampEl.innerText = 'Live: ' + new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'});
        }
        
    } catch(e) {
        console.error('Dashboard update error:', e);
        const timestampEl = document.getElementById('timestamp');
        if (timestampEl) {
            timestampEl.innerText = 'System Offline - Retrying...';
        }
        
        // Show offline indicator
        showOfflineIndicator();
    } finally {
        if (btn) {
            setTimeout(() => btn.classList.remove('spin-anim'), 500);
        }
    }
}

// Show offline indicator for users
function showOfflineIndicator() {
    let indicator = document.getElementById('offline-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'offline-indicator';
        indicator.style.cssText = `
            position: fixed;
            bottom: 16px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(239,68,68,0.9);
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            z-index: 9999;
            backdrop-filter: blur(8px);
            border: 1px solid rgba(255,255,255,0.2);
            pointer-events: none;
            animation: fadeInUp 0.3s ease;
        `;
        document.body.appendChild(indicator);
    }
    indicator.textContent = '⚠️ Connection Issue - Retrying...';
    indicator.style.display = 'block';
    
    // Hide after 5 seconds
    setTimeout(() => {
        if (indicator) indicator.style.display = 'none';
    }, 5000);
}

// Debounced refresh to prevent multiple rapid refreshes
let refreshTimeout = null;
function debouncedRefresh(force = false) {
    if (refreshTimeout) clearTimeout(refreshTimeout);
    refreshTimeout = setTimeout(() => {
        updateDashboard(force);
        refreshTimeout = null;
    }, 100);
}

// Override the refresh button to use debouncing
document.addEventListener('DOMContentLoaded', () => {
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
        const originalOnClick = refreshBtn.onclick;
        refreshBtn.onclick = () => debouncedRefresh(true);
    }
});

function renderDaySubTabs() {
    const wrapper = document.getElementById('day-sub-tabs-wrapper');
    const container = document.getElementById('day-sub-tabs-container');
    
    if (currentTab !== 'daily') {
        if (wrapper) wrapper.classList.add('hidden');
        return;
    }
    
    if (!dayHistory || !dayHistory.length) {
        if (wrapper) wrapper.classList.add('hidden');
        return;
    }
    
    let html = '<button onclick="switchDayView(\'today\')" class="day-sub-tab is-today ' + (currentDayView === 'today' ? 'active' : '') + '">Today</button>';
    
    dayHistory.forEach(d => {
        html += '<button onclick="switchDayView(' + d.day + ')" class="day-sub-tab is-history ' + (currentDayView === d.day ? 'active' : '') + '">' + DAY_SHORT[d.day] + '<span class="history-dot"></span></button>';
    });
    
    if (container) container.innerHTML = html;
    if (wrapper) wrapper.classList.remove('hidden');
}

function switchDayView(key) {
    currentDayView = key;
    renderDaySubTabs();
    render();
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
    if (modal) {
        modal.classList.remove('hidden');
        const input = document.getElementById('pw-input');
        if (input) {
            input.value = '';
            input.classList.remove('error');
            setTimeout(() => input.focus(), 100);
        }
        const errorEl = document.getElementById('pw-error');
        if (errorEl) errorEl.innerText = '';
    }
}

function checkPassword() {
    const input = document.getElementById('pw-input');
    const errorEl = document.getElementById('pw-error');
    
    if (input.value === WEEKLY_PASSWORD) {
        weeklyUnlocked = true;
        const modal = document.getElementById('pw-modal');
        if (modal) modal.classList.add('hidden');
        
        const tabWeekly = document.getElementById('tab-weekly');
        if (tabWeekly) tabWeekly.innerHTML = 'Weekly';
        
        currentTab = 'weekly';
        currentDayView = 'today';
        updateTabUI();
        render();
        renderDaySubTabs();
    } else {
        if (input) {
            input.classList.add('error');
            input.value = '';
        }
        if (errorEl) errorEl.innerText = 'Incorrect access code. Try again.';
        setTimeout(() => {
            if (input) input.classList.remove('error');
            if (input) input.focus();
        }, 500);
    }
}

function cancelPassword() {
    const modal = document.getElementById('pw-modal');
    if (modal) modal.classList.add('hidden');
}

function switchTab(tab) {
    if (tab === 'weekly') {
        requestWeekly();
        return;
    }
    
    currentTab = tab;
    currentDayView = 'today';
    updateTabUI();
    render();
    renderDaySubTabs();
    
    if (tab === 'lookup' && typeof renderLookupHistory === 'function') {
        renderLookupHistory();
    }
    if (tab === 'trivia' && typeof initTriviaTab === 'function') {
        initTriviaTab();
    }
}

function updateTabUI() {
    const tabs = ['daily', 'lookup', 'playbook', 'rebuttals', 'prank', 'weekly', 'trivia'];
    
    tabs.forEach(t => {
        const b = document.getElementById('tab-' + t);
        if (!b) return;
        
        if (t === currentTab) {
            b.className = 'flex-1 glass py-3 rounded-xl text-[10px] md:text-sm font-black uppercase tracking-widest transition-all tab-active';
            b.style.color = '';
            b.style.borderColor = '';
            b.style.background = '';
            
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
                b.style.borderColor = '';
            } else if (t === 'trivia') {
                b.style.color = '#f59e0b';
                b.style.borderColor = 'rgba(245,158,11,0.3)';
            } else {
                b.style.color = '';
                b.style.borderColor = '';
            }
        }
    });
}

function getLevel(l) {
    if (l >= 17) return { title: 'CONQUEROR', cls: 'conqueror-tier', color: 'text-red-500' };
    if (l >= 12) return { title: 'MASTER', cls: 'gold-tier', color: 'text-yellow-500' };
    if (l >= 7) return { title: 'ELITE', cls: 'orange-tier', color: 'text-orange-500' };
    if (l >= 4) return { title: 'PRO', cls: 'blue-tier', color: 'text-blue-500' };
    return { title: 'ROOKIE', cls: 'slate-tier', color: 'text-slate-500' };
}

function render() {
    const lView = document.getElementById('leaderboard-view');
    const pView = document.getElementById('playbook-view');
    const luView = document.getElementById('lookup-view');
    const prView = document.getElementById('prank-view');
    const rbView = document.getElementById('rebuttals-view');
    const trView = document.getElementById('trivia-view');
    
    const views = [lView, pView, luView, prView, rbView, trView];
    views.forEach(v => { if (v) v.classList.add('hidden'); });
    
    if (currentTab === 'playbook') { if (pView) pView.classList.remove('hidden'); return; }
    if (currentTab === 'lookup') { if (luView) luView.classList.remove('hidden'); return; }
    if (currentTab === 'prank') { if (prView) prView.classList.remove('hidden'); return; }
    if (currentTab === 'rebuttals') { if (rbView) rbView.classList.remove('hidden'); return; }
    if (currentTab === 'trivia') { if (trView) trView.classList.remove('hidden'); return; }
    
    if (lView) lView.classList.remove('hidden');
    
    const isWeekly = currentTab === 'weekly';
    const isHistory = currentTab === 'daily' && currentDayView !== 'today';
    const target = isWeekly ? 800 : 150;
    const todayName = agents.length > 0 ? (agents[0].todayName || 'Today') : 'Today';
    const banner = document.getElementById('history-banner');
    
    if (isHistory) {
        const snap = dayHistory.find(d => d.day === currentDayView);
        const bannerText = document.getElementById('history-banner-text');
        if (bannerText) {
            bannerText.innerText = 'Viewing ' + (snap ? snap.dayName : DAY_FULL[currentDayView]) + ' — Final Results';
        }
        if (banner) banner.classList.remove('hidden');
    } else {
        if (banner) banner.classList.add('hidden');
    }
    
    const goalLabel = document.getElementById('goal-label');
    if (goalLabel) {
        goalLabel.innerText = isWeekly ? 'Weekly Team Goal' : isHistory ? DAY_FULL[currentDayView] + ' Final' : todayName + ' Daily Goal';
    }
    
    const targetDisplay = document.getElementById('target-display');
    if (targetDisplay) targetDisplay.innerText = 'Target: ' + target;
    
    const dayIndicator = document.getElementById('day-indicator');
    if (dayIndicator) {
        dayIndicator.innerText = isWeekly ? 'Weekly Sprint' : isHistory ? DAY_SHORT[currentDayView] + ' — Completed' : todayName + ' Performance';
    }
    
    let displayData = [], prTotal = 0, bbTotal = 0;
    
    if (isHistory) {
        const snap = dayHistory.find(d => d.day === currentDayView);
        if (snap) {
            displayData = [...snap.agents].sort((a, b) => b.leads - a.leads);
            prTotal = snap.prTotal || 0;
            bbTotal = snap.bbTotal || 0;
            if (!prTotal && !bbTotal) {
                displayData.forEach(a => {
                    if (a.team === 'PR') prTotal += a.leads;
                    else bbTotal += a.leads;
                });
            }
        }
    } else {
        displayData = agents.map(a => ({
            name: a.name,
            leads: isWeekly ? (a.weeklyLeads || 0) : (a.dailyLeads || 0),
            team: a.team || getTeam(a.name)
        })).sort((a, b) => b.leads - a.leads);
        
        if (isWeekly) {
            displayData.forEach(a => {
                if (a.team === 'PR') prTotal += a.leads;
                else bbTotal += a.leads;
            });
        } else if (agents.length > 0) {
            prTotal = agents[0].prTotal || 0;
            bbTotal = agents[0].bbTotal || 0;
            if (!prTotal && !bbTotal) {
                displayData.forEach(a => {
                    if (a.team === 'PR') prTotal += a.leads;
                    else bbTotal += a.leads;
                });
            }
        }
    }
    
    let totalLeads = 0, masters = 0, activeReps = 0;
    const leaderboard = document.getElementById('leaderboard');
    
    if (leaderboard) {
        leaderboard.innerHTML = displayData.map((agent, i) => {
            const lvl = getLevel(agent.leads);
            totalLeads += agent.leads;
            if (agent.leads >= 12) masters++;
            if (agent.leads > 0) activeReps++;
            
            const badge = agent.team === 'PR' 
                ? '<span style="font-size:8px;background:rgba(167,139,250,0.15);border:1px solid rgba(167,139,250,0.3);border-radius:4px;padding:1px 5px;color:#a78bfa;font-weight:900;margin-left:6px;">PROV</span>'
                : '<span style="font-size:8px;background:rgba(192,132,252,0.15);border:1px solid rgba(192,132,252,0.3);border-radius:4px;padding:1px 5px;color:#c084fc;font-weight:900;margin-left:6px;">BERB</span>';
            
            return '<div class="glass p-5 rounded-2xl flex justify-between items-center transition-all hover:bg-white/5 ' + lvl.cls + ' mb-3 md:mb-0 md:m-2">' +
                '<div class="flex items-center gap-4">' +
                '<span class="text-xl font-black italic ' + (i < 3 ? 'text-white' : 'text-slate-700') + '">' + String(i + 1).padStart(2, '0') + '</span>' +
                '<div>' +
                '<div class="font-black text-sm md:text-lg text-white uppercase flex items-center flex-wrap gap-1">' + escapeHtml(agent.name) + badge + '</div>' +
                '<div class="text-[9px] font-black uppercase tracking-widest ' + lvl.color + '">' + lvl.title + ' STATUS</div>' +
                '</div>' +
                '</div>' +
                '<div class="text-right">' +
                '<div class="text-2xl md:text-3xl font-black text-white leading-none">' + agent.leads + '</div>' +
                '<div class="text-[8px] text-slate-500 uppercase font-black mt-1">Transfers</div>' +
                '</div>' +
                '</div>';
        }).join('');
    }
    
    const floorTotal = document.getElementById('floor-total');
    if (floorTotal) floorTotal.innerText = totalLeads;
    
    const masterCount = document.getElementById('master-count');
    if (masterCount) masterCount.innerText = String(masters).padStart(2, '0');
    
    const activeRepsEl = document.getElementById('active-reps');
    if (activeRepsEl) activeRepsEl.innerText = activeReps;
    
    const currentLeadsSum = document.getElementById('current-leads-sum');
    if (currentLeadsSum) currentLeadsSum.innerText = totalLeads + ' Leads';
    
    const prCount = document.getElementById('pr-count');
    if (prCount) prCount.innerText = prTotal;
    
    const bbCount = document.getElementById('bb-count');
    if (bbCount) bbCount.innerText = bbTotal;
    
    const pct = Math.min((totalLeads / target) * 100, 100);
    const progressBar = document.getElementById('progress-bar');
    if (progressBar) progressBar.style.width = pct + '%';
    
    const goalPercent = document.getElementById('goal-percent');
    if (goalPercent) goalPercent.innerText = Math.floor(pct) + '%';
}

// Initial load with cache
setTimeout(() => {
    updateDashboard(false);
}, 100);

// Auto-refresh every 30 seconds (matches cache duration)
setInterval(() => {
    updateDashboard(false);
}, 30000);
