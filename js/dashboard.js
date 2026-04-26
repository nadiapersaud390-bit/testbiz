/**
 * Dashboard Logic
 * All logged-in users see the full leaderboard with ALL agents from roster.
 * The logged-in agent's own row is highlighted automatically.
 * UPDATED: Only show completed days (Monday-Friday) with short names (Mon, Tue, Wed, Thu, Fri)
 */

let isDashboardSubscribed = false;
let fullRoster = []; // Store the full agent roster

// Full week days array (Monday to Friday only - Saturday excluded from history)
const FULL_WEEK_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
const DAY_NAMES = {
    'MON': 'Mon',
    'TUE': 'Tue',
    'WED': 'Wed',
    'THU': 'Thu',
    'FRI': 'Fri'
};
const FULL_DAY_NAMES = {
    'MON': 'Monday',
    'TUE': 'Tuesday',
    'WED': 'Wednesday',
    'THU': 'Thursday',
    'FRI': 'Friday'
};

// Function to get current day in Guyana time
function getCurrentGuyanaDay() {
    const now = new Date();
    const guyanaTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Guyana' }));
    const dayIndex = guyanaTime.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    return dayIndex;
}

// Function to check if a given day is completed (has passed)
function isDayCompleted(dayKey) {
    const currentDayIndex = getCurrentGuyanaDay();
    const dayMap = { 'MON': 1, 'TUE': 2, 'WED': 3, 'THU': 4, 'FRI': 5 };
    const targetDayIndex = dayMap[dayKey];
    
    if (!targetDayIndex) return false;
    
    const now = new Date();
    const guyanaTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Guyana' }));
    const currentHour = guyanaTime.getHours();
    
    // If it's a future day in the week
    if (targetDayIndex > currentDayIndex) {
        return false;
    }
    
    // If it's today, check if the day is over (after 8:00 PM)
    if (targetDayIndex === currentDayIndex) {
        // Day is considered complete after 8:00 PM (20:00) Guyana time
        if (currentHour >= 20) {
            return true;
        }
        return false;
    }
    
    // If it's a past day
    return true;
}

// Build a stable signature of a roster so we can detect add/remove/update/move
function rosterSignature(arr) {
    if (!Array.isArray(arr)) return '';
    return arr.map(a => [a.fullName||a.name||'', a.userId||a.ytelId||'', a.team||''].join('|'))
              .sort().join('::');
}

// Subscribe to Firestore agent_profiles and keep fullRoster in sync.
// This is the real source of truth — the Google Sheet `getRoster` action is
// not implemented on the deployed Apps Script, so Firebase carries the roster.
let _rosterFirestoreSubscribed = false;
function subscribeRosterFromFirestore() {
    if (_rosterFirestoreSubscribed) return;
    if (typeof window.listenToAgentProfiles !== 'function') {
        // Firebase module hasn't loaded yet — try again shortly.
        setTimeout(subscribeRosterFromFirestore, 500);
        return;
    }
    _rosterFirestoreSubscribed = true;
    try {
        window.listenToAgentProfiles((profiles) => {
            const list = Array.isArray(profiles) ? profiles : [];
            if (list.length === 0) return;
            fullRoster = list;
            window.allAgentProfiles = list;
            try { localStorage.setItem('biz_master_roster', JSON.stringify(list)); } catch (e) {}
            console.log(`[roster] Loaded ${list.length} agents from Firestore`);
            // Re-render daily tab with the latest live state (if any).
            const state = window._asLastLiveState || null;
            agents = buildAgentsFromRoster(state);
            if (agents.length > 0) {
                agents[0].todayName = (state && state.dateLabel) || (typeof getGuyanaToday === 'function' ? getGuyanaToday() : '');
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
            if (typeof render === 'function') render();
            if (typeof renderDaySubTabs === 'function') renderDaySubTabs();
            const ts = document.getElementById('timestamp');
            if (ts) ts.innerText = `Roster: ${list.length} agents | ${new Date().toLocaleTimeString()}`;
        });
    } catch (e) {
        console.warn('[roster] Firestore subscription failed:', e);
        _rosterFirestoreSubscribed = false;
    }
}

// Function to load the full agent roster.
// Order of sources: Firestore (live) → Google Sheet (legacy) → localStorage cache.
async function loadFullRoster(force) {
    if (!force && fullRoster.length > 0) return fullRoster;

    // Always make sure the live Firestore subscription is running.
    subscribeRosterFromFirestore();

    // Try the Google Sheet endpoint as a legacy source. This action may not
    // exist on the deployed Apps Script — that's fine, we just ignore it.
    try {
        if (typeof API_URL !== 'undefined') {
            const resp = await fetch(`${API_URL}?action=getRoster&_=${Date.now()}`, { cache: 'no-store' });
            const raw = await resp.json();
            // Accept either a plain array, or { success:true, agents:[...] }
            let list = Array.isArray(raw) ? raw
                     : (raw && Array.isArray(raw.agents)) ? raw.agents
                     : (raw && Array.isArray(raw.roster)) ? raw.roster
                     : [];
            // Normalize fields and drop inactive agents
            list = list
                .filter(a => a && !a.inactive)
                .map(a => ({
                    fullName: a.fullName || a.name || a.agentName || '',
                    userId:   String(a.userId || a.ytelId || a.id || '').trim(),
                    team:     a.team || ''
                }))
                .filter(a => a.fullName && a.userId);
            if (list.length > 0) {
                fullRoster = list;
                window.allAgentProfiles = list;
                try { localStorage.setItem('biz_master_roster', JSON.stringify(list)); } catch(e) {}
                console.log(`Loaded ${fullRoster.length} agents from Google Sheet roster`);
                return fullRoster;
            }
            console.warn('[roster] Sheet returned empty/unsupported payload:', raw);
        }
    } catch (e) {
        console.warn('Could not load from Google Sheet, using fallback:', e);
    }

    // Use whatever Firestore has already published.
    if (window.allAgentProfiles && window.allAgentProfiles.length > 0) {
        fullRoster = window.allAgentProfiles;
        console.log(`Loaded ${fullRoster.length} agents from allAgentProfiles`);
    } else {
        const saved = localStorage.getItem('biz_master_roster');
        if (saved) {
            try {
                fullRoster = JSON.parse(saved);
                if (fullRoster.length > 0) {
                    window.allAgentProfiles = fullRoster;
                    console.log(`Loaded ${fullRoster.length} agents from localStorage cache`);
                }
            } catch(e) {}
        }
    }
    return fullRoster;
}

// Build the agent list for the daily tab from the roster, applying lead counts from live state
function buildAgentsFromRoster(state) {
    const leadMap = new Map();
    if (state && Array.isArray(state.agents)) {
        state.agents.forEach(a => {
            const nameKey = (a.name || '').toUpperCase().trim();
            if (nameKey) leadMap.set(nameKey, a.dailyLeads || 0);
            if (a.ytelId) leadMap.set(String(a.ytelId), a.dailyLeads || 0);
        });
    }
    return fullRoster.map(rosterAgent => {
        const agentName = rosterAgent.fullName || rosterAgent.name || '';
        const agentNameUpper = agentName.toUpperCase().trim();
        const ytelId = rosterAgent.userId || rosterAgent.ytelId || '';
        const dailyLeads = leadMap.get(agentNameUpper) || leadMap.get(String(ytelId)) || 0;
        return {
            name: agentName,
            ytelId: ytelId,
            team: rosterAgent.team || normalizeTeam('', agentName),
            dailyLeads: dailyLeads,
            weeklyLeads: 0
        };
    });
}

function updateDashboard() {
    const btn = document.getElementById('refresh-btn');
    if (btn) {
        btn.classList.add('spin-anim');
        setTimeout(() => btn.classList.remove('spin-anim'), 1000);
    }

    // Load roster (Google Sheet is the source of truth) before subscribing
    const subscribe = () => {
        if (isDashboardSubscribed || typeof window.listenForLiveDashboardState !== 'function') return;
        _subscribeLiveDashboard();
    };
    if (fullRoster.length === 0) {
        loadFullRoster().then(() => { subscribe(); startRosterPoller(); }).catch(subscribe);
    } else {
        subscribe();
        startRosterPoller();
    }
    return;
}

// Live roster poller — refreshes from Google Sheet every 60s and re-renders
// the daily tab if any agent was added, removed, updated, or moved between teams.
let _rosterPollerHandle = null;
function startRosterPoller() {
    if (_rosterPollerHandle) return;
    _rosterPollerHandle = setInterval(async () => {
        try {
            const before = rosterSignature(fullRoster);
            await loadFullRoster(true);
            const after = rosterSignature(fullRoster);
            if (before !== after) {
                console.log('[roster] Sheet change detected — re-rendering daily tab');
                const state = window._asLastLiveState || null;
                agents = buildAgentsFromRoster(state);
                if (agents.length > 0) {
                    agents[0].todayName = (state && state.dateLabel) || (typeof getGuyanaToday === 'function' ? getGuyanaToday() : '');
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
                if (typeof render === 'function') render();
                if (typeof renderDaySubTabs === 'function') renderDaySubTabs();
                const ts = document.getElementById('timestamp');
                if (ts) ts.innerText = `Roster updated: ${fullRoster.length} agents | ${new Date().toLocaleTimeString()}`;
            }
        } catch (e) {
            console.warn('[roster] poll failed:', e);
        }
    }, 60000);
}

function _subscribeLiveDashboard() {
    if (!isDashboardSubscribed && typeof window.listenForLiveDashboardState === 'function') {
        window.listenForLiveDashboardState((state) => {
            if (!state) {
                const ts = document.getElementById('timestamp');
                if (ts) ts.innerText = 'System Offline: No Live Data';
                return;
            }
            
            const now = new Date();
            const pushDate = state.pushedAt ? new Date(state.pushedAt) : null;
            
            const todayStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const labelMatches = state.dateLabel && state.dateLabel.includes(todayStr);
            
            const isToday = pushDate && 
                            pushDate.toLocaleDateString('en-GB') === now.toLocaleDateString('en-GB') &&
                            labelMatches;

            // Track diff changes inside localStorage across pushes
            const lastPushedAt = localStorage.getItem('biz_last_pushed_at');
            const statePushedAt = state.pushedAt || '';
            let prevMap = JSON.parse(localStorage.getItem('biz_prev_leads_map') || '{}');
            
            if (statePushedAt && statePushedAt !== lastPushedAt) {
                 // Push is actually new!
                 const lastStateStr = localStorage.getItem('biz_last_state_obj');
                 if (lastStateStr) {
                     try {
                         const lastState = JSON.parse(lastStateStr);
                         prevMap = {};
                         (lastState.agents || []).forEach(a => {
                             const id = String(a.ytelId || a.name || '').trim();
                             if (id) prevMap[id] = a.dailyLeads || 0;
                         });
                         localStorage.setItem('biz_prev_leads_map', JSON.stringify(prevMap));
                     } catch(e) {}
                 }
                 localStorage.setItem('biz_last_pushed_at', statePushedAt);
                 localStorage.setItem('biz_last_state_obj', JSON.stringify(state));
            }
            window._prevDailyLeadsMap = prevMap;

            // Cache the latest live state so the roster poller can re-render
            // with current lead counts when the sheet changes.
            window._asLastLiveState = state;
            
            // Roster is the source of truth for who appears on the daily tab.
            // CSV uploads only update the lead counts for matching agents.
            if (fullRoster.length === 0) {
                // Make sure the Firestore roster subscription is active.
                // Once profiles arrive, the subscription itself will re-render.
                subscribeRosterFromFirestore();
                agents = [];
                const ts = document.getElementById('timestamp');
                if (ts) ts.innerText = 'Loading roster from Firestore…';
            } else {
                agents = buildAgentsFromRoster(state);
                if (agents.length > 0) {
                    agents[0].todayName = (state && state.dateLabel) || getGuyanaToday();
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
                const ts = document.getElementById('timestamp');
                if (ts) ts.innerText = `Roster: ${agents.length} agents | Synced: ${new Date().toLocaleTimeString()}`;
            }
            
            checkLeadAlerts(agents);
            render();
            renderDaySubTabs();
        });
        
        // Auto-Link Historical CSV Reports to the Daily Tabs
        if (typeof window.listenForAgentReports === 'function') {
            window.listenForAgentReports(data => {
                if(!data) return;
                
                console.log('Processing historical reports for day tabs...');
                
                // Get the start of the current week (Monday)
                const now = new Date();
                const guyanaTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Guyana' }));
                const currentDay = guyanaTime.getDay();
                const daysToMonday = currentDay === 0 ? 6 : currentDay - 1;
                const monday = new Date(guyanaTime);
                monday.setDate(guyanaTime.getDate() - daysToMonday);
                monday.setHours(0, 0, 0, 0);
                
                console.log(`Week starting Monday: ${monday.toLocaleDateString()}`);
                
                const lastMonday = new Date(monday);
                lastMonday.setDate(monday.getDate() - 7);
                
                // Process Last Week's Totals (Deduplicate to pick 1 report per day)
                const lastWeekReports = data.filter(r => {
                    const uploadDate = new Date(r.uploadedAt);
                    return uploadDate >= lastMonday && uploadDate < monday;
                });
                
                const lastWeekMap = {};
                FULL_WEEK_DAYS.forEach(day => { lastWeekMap[day] = null; });

                lastWeekReports.forEach(r => {
                    let dayKey = r.dayOfWeek;
                    if (!FULL_WEEK_DAYS.includes(dayKey)) {
                        const reportDayIndex = new Date(r.uploadedAt).getDay();
                        if (reportDayIndex === 1) dayKey = 'MON';
                        else if (reportDayIndex === 2) dayKey = 'TUE';
                        else if (reportDayIndex === 3) dayKey = 'WED';
                        else if (reportDayIndex === 4) dayKey = 'THU';
                        else if (reportDayIndex === 5) dayKey = 'FRI';
                    }
                    
                    if (dayKey && FULL_WEEK_DAYS.includes(dayKey)) {
                        if (!lastWeekMap[dayKey] || new Date(r.uploadedAt) > new Date(lastWeekMap[dayKey].uploadedAt)) {
                            lastWeekMap[dayKey] = r;
                        }
                    }
                });

                const lastWeekAgg = {};
                Object.values(lastWeekMap).forEach(r => {
                    if (!r) return;
                    (r.data || []).forEach(d => {
                        const cleanName = String(d.agentName || d.name || '').replace(/^GY[BP]\s*/i, '').trim().toUpperCase();
                        const ytelId = String(d.agentId || d.ytelId || '').trim();
                        
                        let lc = Number(d.dailyLeads) || 0;
                        if (d.duration !== undefined && Number(d.duration) >= 120) lc = 1;
                        else if (d.duration !== undefined && Number(d.duration) < 120) lc = 0;
                        
                        if (ytelId) {
                            lastWeekAgg[ytelId] = (lastWeekAgg[ytelId] || 0) + lc;
                        }
                        if (cleanName) {
                            lastWeekAgg[cleanName] = (lastWeekAgg[cleanName] || 0) + lc;
                        }
                    });
                });
                window._lastWeekTotals = lastWeekAgg;

                // Filter reports from this week
                const thisWeekReports = data.filter(r => {
                    const uploadDate = new Date(r.uploadedAt);
                    return uploadDate >= monday;
                });
                
                // Map to store the best report for each day
                const weekMap = {};
                
                // Initialize Monday-Friday
                FULL_WEEK_DAYS.forEach(day => {
                    weekMap[day] = null;
                });
                
                // Process each report and assign to the correct day
                thisWeekReports.forEach(r => {
                    let dayKey = r.dayOfWeek;
                    if (!FULL_WEEK_DAYS.includes(dayKey)) {
                        const reportDayIndex = new Date(r.uploadedAt).getDay();
                        if (reportDayIndex === 1) dayKey = 'MON';
                        else if (reportDayIndex === 2) dayKey = 'TUE';
                        else if (reportDayIndex === 3) dayKey = 'WED';
                        else if (reportDayIndex === 4) dayKey = 'THU';
                        else if (reportDayIndex === 5) dayKey = 'FRI';
                    }
                    
                    if (dayKey && FULL_WEEK_DAYS.includes(dayKey)) {
                        if (!weekMap[dayKey] || new Date(r.uploadedAt) > new Date(weekMap[dayKey].uploadedAt)) {
                            weekMap[dayKey] = r;
                        }
                    }
                });
                
                // Build dayHistory array - ONLY for COMPLETED days
                dayHistory = FULL_WEEK_DAYS.map(day => {
                    const r = weekMap[day];
                    const isCompleted = isDayCompleted(day);
                    
                    if (!r || !isCompleted) {
                        return { 
                            day: day, 
                            empty: true, 
                            dayName: DAY_NAMES[day],
                            fullDayName: FULL_DAY_NAMES[day],
                            fullDate: null,
                            completed: false,
                            agents: [] 
                        };
                    }
                    
                    console.log(`Processing ${day} report: ${r.reportDate} (completed: ${isCompleted})`);
                    
                    const agg = {};
                    (r.data || []).forEach(d => {
                        const id = d.agentId || d.ytelId || d.name;
                        const name = d.agentName || d.name;
                        const rawName = d.rawName || name;
                        
                        if (id) {
                            if (!agg[id]) {
                                agg[id] = { 
                                    name: name, 
                                    leads: 0, 
                                    rawName: rawName,
                                    ytelId: id 
                                };
                            }
                            
                            let leadCount = d.dailyLeads || 0;
                            if (d.duration !== undefined && d.duration >= 120) {
                                leadCount = 1;
                            } else if (d.duration !== undefined && d.duration < 120) {
                                leadCount = 0;
                            }
                            agg[id].leads += leadCount;
                        }
                    });
                    
                    return {
                        day: day,
                        dayName: DAY_NAMES[day],
                        fullDayName: FULL_DAY_NAMES[day],
                        fullDate: r.reportDate,
                        fullDateObj: new Date(r.uploadedAt),
                        completed: isCompleted,
                        agents: Object.values(agg).map(a => ({
                            name: a.name,
                            leads: a.leads,
                            ytelId: a.ytelId,
                            rawName: a.rawName,
                            team: typeof normalizeTeam === 'function' ? normalizeTeam('', a.rawName) : 'PR'
                        }))
                    };
                });
                
                console.log('Day history built:', dayHistory.map(d => ({ day: d.dayName, completed: d.completed, hasData: !d.empty, agentCount: d.agents.length })));
                
                renderDaySubTabs();
                
                // If currently viewing a historical day, re-render
                if (currentDayView !== 'today') {
                    render();
                }
            });
        }
        
        isDashboardSubscribed = true;
    } else if (isDashboardSubscribed) {
        if(typeof render === 'function') render();
    }
}

// Check every few seconds to hook up initialization if it missed
setInterval(() => {
    if(!isDashboardSubscribed) updateDashboard();
}, 5000);
updateDashboard();

function render() {
    // Session Info
    const agentProfileRaw = sessionStorage.getItem('currentAgentProfile');
    let userProfile = null;
    try { userProfile = JSON.parse(agentProfileRaw); } catch(e) {}
    const myName = userProfile ? (userProfile.name || '').trim().toUpperCase() : '';
    const myYtelId = userProfile ? (userProfile.ytelId || '').trim() : '';

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

    // Setup Variables
    const isWeekly = currentTab === 'weekly';
    const isPrevWeek = currentTab === 'daily' && currentDayView === 'prevweek';
    const isHistory = currentTab === 'daily' && currentDayView !== 'today' && currentDayView !== 'prevweek';
    const target = isWeekly ? 800 : (isPrevWeek ? 800 : 150);
    
    const todayName = agents.length > 0 ? (agents[0].todayName || 'Today') : 'Today';

    // UI Goal Labels
    const banner = document.getElementById('history-banner');
    if (isHistory) {
        const snap = dayHistory.find(d => d.day === currentDayView);
        if (snap && !snap.empty && snap.completed) {
            const dayLong = snap.fullDayName || snap.dayName;
            const dateDisplay = snap.fullDate ? ` (${snap.fullDate})` : '';
            
            document.getElementById('goal-label').innerText = dayLong.toUpperCase() + ' FINAL' + dateDisplay;
            document.getElementById('day-indicator').innerText = snap.dayName.toUpperCase() + ' — COMPLETED';
            if (banner) {
                document.getElementById('history-banner-text').innerHTML = `<i class="fas fa-history mr-2"></i> VIEWING ${dayLong.toUpperCase()}${dateDisplay} — FINAL RESULTS`;
                banner.classList.remove('hidden');
            }
        } else {
            if (banner) banner.classList.add('hidden');
            document.getElementById('goal-label').innerText = (isWeekly || isPrevWeek) ? 'Weekly Team Goal' : todayName.toUpperCase() + ' DAILY GOAL';
            document.getElementById('day-indicator').innerText = isPrevWeek ? 'Previous Week Sprint' : (isWeekly ? 'Weekly Sprint' : todayName.toUpperCase() + ' PERFORMANCE');
        }
    } else {
        if(banner) banner.classList.add('hidden');
        document.getElementById('goal-label').innerText = (isWeekly || isPrevWeek) ? 'Weekly Team Goal' : todayName.toUpperCase() + ' DAILY GOAL';
        document.getElementById('day-indicator').innerText = isPrevWeek ? 'Previous Week Sprint' : (isWeekly ? 'Weekly Sprint' : todayName.toUpperCase() + ' PERFORMANCE');
    }

    const isAdmin = sessionStorage.getItem('bizUserRole') === 'admin';
    const targetDisplay = document.getElementById('target-display');

    if (targetDisplay) {
        targetDisplay.innerText = isAdmin ? 'Target: ' + target : '';
        targetDisplay.style.display = isAdmin ? '' : 'none';
    }

    // Process Data
    let fullList = [];
    let prTotal = 0, bbTotal = 0, rmTotal = 0, totalLeads = 0, masters = 0, activeReps = 0;

    if (isHistory) {
        const snap = dayHistory.find(d => d.day === currentDayView);
        if (snap && snap.agents && snap.agents.length > 0 && snap.completed) {
            fullList = [...snap.agents]
                .filter(a => a.name && !String(a.name).toUpperCase().startsWith('PH '))
                .sort((a, b) => (b.leads || 0) - (a.leads || 0));
            
            fullList = fullList.map(a => {
                const cleanName = typeof stripPrefix === 'function' ? stripPrefix(a.name).toUpperCase() : a.name;
                const rawName = a.rawName || a.name;
                return {
                    ...a,
                    name: cleanName || a.name,
                    rawName: rawName,
                    leads: a.leads || 0,
                    team: normalizeTeam(a.team, rawName)
                };
            });
            
            fullList.forEach(a => {
                const leads = a.leads || 0;
                if (a.team === 'PR') prTotal += leads;
                else if (a.team === 'BB') bbTotal += leads;
                else if (a.team === 'RM') rmTotal += leads;
                totalLeads += leads;
                if (leads >= 12) masters++;
                activeReps++;
            });
        }
    } else {
        // Figure out week boundaries to hide old data on Sunday/Monday
        const guyanaTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Guyana' }));
        const currentDay = guyanaTime.getDay();
        const daysToMonday = currentDay === 0 ? 6 : currentDay - 1;
        const currentMonday = new Date(guyanaTime);
        currentMonday.setDate(guyanaTime.getDate() - daysToMonday);
        currentMonday.setHours(0, 0, 0, 0);
        
        const stateObj = window._asLastLiveState;
        const pushDate = stateObj && stateObj.pushedAt ? new Date(stateObj.pushedAt) : null;
        
        // Hide data if it's Sunday waiting for Monday's push, or if Monday hasn't been pushed yet.
        let forceHideDaily = false;
        if (!isHistory && !isWeekly && !isPrevWeek) {
            if (currentDay === 0) {
                forceHideDaily = true;
            } else if (pushDate && pushDate < currentMonday) {
                forceHideDaily = true;
            }
        }

        // Use current agents array
        fullList = agents
            .filter(a => !(a.name && String(a.name).toUpperCase().startsWith('PH ')))
            .map(a => {
                let leads = isWeekly ? (a.weeklyLeads || 0) : (a.dailyLeads || 0);
                if (isPrevWeek && window._lastWeekTotals) {
                    const idLookup = String(a.ytelId || a.name || '').trim();
                    leads = window._lastWeekTotals[idLookup] || 0;
                }
                if (forceHideDaily) leads = 0;
                return {
                    name: typeof stripPrefix === 'function' ? stripPrefix(a.name).toUpperCase() : a.name,
                    leads: leads,
                    team: normalizeTeam(a.team, a.name),
                    ytelId: a.ytelId || '',
                    rawName: a.name
                };
            })
            .sort((a, b) => b.leads - a.leads);
            
        if (forceHideDaily) fullList = []; // clear everyone to show no data message

        fullList.forEach(a => {
            if (a.team === 'PR') prTotal += a.leads;
            else if (a.team === 'BB') bbTotal += a.leads;
            else if (a.team === 'RM') rmTotal += a.leads;
            totalLeads += a.leads;
            if (a.leads >= 12) masters++;
            activeReps++;
        });
    }

    // All users see the full leaderboard
    const displayData = fullList.map((a, i) => ({ ...a, rank: i + 1 }));

    // Expose for team drill-down popup
    window._lastFullList = fullList;


    // Rendering
    const leaderboardEl = document.getElementById('leaderboard');
    if (!leaderboardEl) return;
    
    if (fullList.length === 0 && isHistory) {
        leaderboardEl.innerHTML = '<div class="glass p-8 rounded-2xl text-center text-slate-500"><i class="fas fa-calendar-day text-4xl mb-3 block"></i> No data available for this day. The day may not be completed yet or no report was uploaded.</div>';
    } else if (fullList.length === 0 && !isWeekly && !isPrevWeek && !isHistory) {
        leaderboardEl.innerHTML = '<div class="glass p-8 rounded-2xl text-center text-slate-500" style="grid-column:1/-1;"><i class="fas fa-calendar-week text-4xl mb-3 block"></i> The new week has started. Waiting for the live board to be updated...</div>';
    } else {
        leaderboardEl.innerHTML = displayData.map((agent) => {
            const lvl = getLevel(agent.leads);
            const rank = agent.rank;
            const isMe = (myName && agent.name && agent.name.trim().toUpperCase() === myName) ||
                         (myYtelId && agent.ytelId === myYtelId);

            const teamMeta = getTeamMeta(agent.team);
            const teamBadge = `<span class="lb-team-badge" style="background:rgba(${teamMeta.rgb},0.15);border:1px solid rgba(${teamMeta.rgb},0.3);color:${teamMeta.color};">${teamMeta.label}</span>`;
            const youBadge = isMe ? `<span class="lb-you-badge">YOU</span>` : '';
            return `
                <div class="lb-card ${lvl.tierCls} ${isMe ? 'is-me' : ''}">
                    <div class="lb-rank">${String(rank).padStart(2,'0')}</div>
                    <div class="lb-divider"></div>
                    <div class="lb-info">
                        <div class="lb-name-row">
                            <div class="lb-name">${escapeHtml(agent.name)}</div>
                            ${teamBadge}${youBadge}
                        </div>
                        <div class="lb-status">${lvl.title} STATUS</div>
                    </div>
                    <div class="lb-score">
                        <div class="lb-score-num">${agent.leads}</div>
                        <div class="lb-score-label">Transfers</div>
                    </div>
                </div>`;
        }).join('');
    }

    // Update Bottom Stats Bar
    const floorTotalEl = document.getElementById('floor-total');
    const masterCountEl = document.getElementById('master-count');
    const activeRepsEl = document.getElementById('active-reps');
    const currentLeadsSumEl = document.getElementById('current-leads-sum');
    const prCountEl = document.getElementById('pr-count');
    const bbCountEl = document.getElementById('bb-count');
    const rmCountEl = document.getElementById('rm-count');
    const progressBarEl = document.getElementById('progress-bar');
    const goalPercentEl = document.getElementById('goal-percent');
    
    if (floorTotalEl) floorTotalEl.innerText = totalLeads;
    if (masterCountEl) masterCountEl.innerText = String(masters).padStart(2, '0');
    if (activeRepsEl) activeRepsEl.innerText = activeReps;
    if (currentLeadsSumEl) currentLeadsSumEl.innerText = totalLeads + ' Leads';
    if (prCountEl) prCountEl.innerText = prTotal;
    if (bbCountEl) bbCountEl.innerText = bbTotal;
    if (rmCountEl) rmCountEl.innerText = rmTotal;

    const pct = Math.min((totalLeads / target) * 100, 100);
    if (progressBarEl) progressBarEl.style.width = pct + '%';
    if (goalPercentEl) goalPercentEl.innerText = Math.floor(pct) + '%';
}

function getLevel(l) {
    if (l >= 17) return { title: 'CONQUEROR', cls: 'conqueror-tier', tierCls: 'tier-conqueror', color: 'text-red-500' };
    if (l >= 12) return { title: 'MASTER',    cls: 'gold-tier',      tierCls: 'tier-master',    color: 'text-yellow-500' };
    if (l >= 7)  return { title: 'ELITE',     cls: 'orange-tier',    tierCls: 'tier-elite',     color: 'text-orange-500' };
    if (l >= 4)  return { title: 'PRO',       cls: 'blue-tier',      tierCls: 'tier-pro',       color: 'text-blue-500' };
    return           { title: 'ROOKIE',    cls: 'slate-tier',     tierCls: 'tier-rookie',    color: 'text-slate-500' };
}

// Navigation & Tab UI - ONLY SHOW COMPLETED DAYS WITH SHORT NAMES
function renderDaySubTabs() {
    const wrapper = document.getElementById('day-sub-tabs-wrapper');
    const container = document.getElementById('day-sub-tabs-container');

    if (currentTab !== 'daily') {
        if (wrapper) wrapper.classList.add('hidden');
        return;
    }
    
    if (wrapper) wrapper.classList.remove('hidden');
    if (!container) return;
    
    // Build tabs: Today + ONLY completed Monday-Friday with short names
    let html = `<button onclick="switchDayView('today')" class="day-sub-tab is-today ${currentDayView === 'today' ? 'active' : ''}">📅 Today</button>`;
    
    // Add ONLY completed days with short names (Mon, Tue, Wed, Thu, Fri)
    FULL_WEEK_DAYS.forEach(day => {
        const dayData = dayHistory.find(d => d && d.day === day);
        const hasData = dayData && !dayData.empty && dayData.agents && dayData.agents.length > 0;
        const isCompleted = isDayCompleted(day);
        const isActive = currentDayView === day;
        const shortName = DAY_NAMES[day] || day;
        
        // ONLY show the tab if the day is COMPLETED
        if (isCompleted) {
            html += `
                <button onclick="switchDayView('${day}')" 
                        class="day-sub-tab is-history ${isActive ? 'active' : ''}" 
                        ${!hasData ? 'style="opacity:0.5;"' : ''}>
                    ${shortName}
                    ${hasData ? '<span class="history-dot" style="background:#22c55e;"></span>' : '<span class="history-dot" style="background:#475569;"></span>'}
                </button>`;
        }
    });

    // Append Previous Week button
    const isPrevActive = currentDayView === 'prevweek';
    html += `
        <button onclick="switchDayView('prevweek')" 
                class="day-sub-tab is-history ${isPrevActive ? 'active' : ''}" style="margin-left:8px; border-color:rgba(148,163,184,0.3); color:#94a3b8;">
            <i class="fas fa-history mr-1 opacity-60"></i> PREV WK
        </button>`;

    container.innerHTML = html;
    
    // Add CSS for the day tabs if not already present
    if (!document.getElementById('day-tabs-style')) {
        const style = document.createElement('style');
        style.id = 'day-tabs-style';
        style.textContent = `
            .day-sub-tab {
                padding: 6px 14px;
                border-radius: 20px;
                font-size: 11px;
                font-weight: 900;
                text-transform: uppercase;
                letter-spacing: 0.08em;
                background: rgba(255,255,255,0.04);
                border: 1px solid rgba(255,255,255,0.1);
                color: #64748b;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            .day-sub-tab:hover {
                background: rgba(255,255,255,0.08);
                color: #94a3b8;
            }
            .day-sub-tab.is-today {
                background: rgba(59,130,246,0.1);
                border-color: rgba(59,130,246,0.3);
                color: #60a5fa;
            }
            .day-sub-tab.is-today.active {
                background: rgba(59,130,246,0.2);
                border-color: #3b82f6;
                color: #93c5fd;
            }
            .day-sub-tab.is-history.active {
                background: rgba(234,179,8,0.15);
                border-color: #eab308;
                color: #facc15;
            }
            .history-dot {
                display: inline-block;
                width: 6px;
                height: 6px;
                border-radius: 50%;
                margin-left: 6px;
                vertical-align: middle;
            }
        `;
        document.head.appendChild(style);
    }
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

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}
