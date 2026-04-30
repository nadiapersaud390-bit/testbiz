/**
 * Dashboard Logic
 * All logged-in users see the full leaderboard with ALL agents from roster.
 * The logged-in agent's own row is highlighted automatically.
 * UPDATED: Only show completed days (Monday-Friday) with short names (Mon, Tue, Wed, Thu, Fri)
 * FIXED: Properly initialize and update _prevDailyLeadsMap for +X badges
 * FIXED: Only show data for TODAY - no old reports on current day
 * FIXED: Weekly tab shows cumulative totals across ALL uploaded days (Mon-Fri)
 * FIXED: PREVWK tab now properly displays previous week totals from reports without duplicates
 * FIXED: Prevents orphaned numeric IDs from showing, but keeps valid agents
 */

let isDashboardSubscribed = false;
let fullRoster = []; // Store the full agent roster
let _lastSeenLeadCounts = {}; // Track real-time lead changes for +X badges
let _initialPrevMapLoaded = false; // Track if we've loaded initial previous map
let weeklyAccumulatedData = {}; // Store cumulative weekly leads per agent
let _cachedPrevWeekTotals = null; // Cache for previous week totals
let _cachedPrevWeekTimestamp = 0; // Cache timestamp

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

// Helper function to get actual report date
function getReportActualDate(report) {
    if (report && report.reportDate) {
        const d = new Date(report.reportDate);
        if (!isNaN(d.getTime())) return d;
    }
    if (report && report.filename) {
        const m = report.filename.match(/(\d{2})[_-](\d{2})[_-](\d{4})/);
        if (m) {
            const d = new Date(`${m[3]}-${m[1]}-${m[2]}`);
            if (!isNaN(d.getTime())) return d;
        }
    }
    return new Date(report && report.uploadedAt);
}

// Function to get current date in Guyana time (YYYY-MM-DD)
function getCurrentGuyanaDate() {
    const now = new Date();
    const guyanaTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Guyana' }));
    return guyanaTime.toISOString().split('T')[0];
}

// Function to check if a state is from today
function isStateFromToday(state) {
    if (!state) return false;
    
    const now = new Date();
    const guyanaNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Guyana' }));
    const todayStr = guyanaNow.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    
    if (state.dateLabel === todayStr) return true;
    if (state.pushedAt) {
        const pushDate = new Date(state.pushedAt);
        const pushDateStr = pushDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        if (pushDateStr === todayStr) return true;
    }
    return false;
}

// Function to get current day in Guyana time
function getCurrentGuyanaDay() {
    const now = new Date();
    const guyanaTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Guyana' }));
    const dayIndex = guyanaTime.getDay();
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
    if (targetDayIndex > currentDayIndex) return false;
    if (targetDayIndex === currentDayIndex) return currentHour >= 20;
    return true;
}

// Build a stable signature of a roster
function rosterSignature(arr) {
    if (!Array.isArray(arr)) return '';
    return arr.map(a => [a.fullName||a.name||'', a.userId||a.ytelId||'', a.team||''].join('|'))
              .sort().join('::');
}

// Subscribe to Firestore agent_profiles
let _rosterFirestoreSubscribed = false;
function subscribeRosterFromFirestore() {
    if (_rosterFirestoreSubscribed) return;
    if (typeof window.listenToAgentProfiles !== 'function') {
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

// Function to load the full agent roster
async function loadFullRoster(force) {
    if (!force && fullRoster.length > 0) return fullRoster;

    subscribeRosterFromFirestore();

    try {
        if (typeof API_URL !== 'undefined') {
            const resp = await fetch(`${API_URL}?action=getRoster&_=${Date.now()}`, { cache: 'no-store' });
            const raw = await resp.json();
            let list = Array.isArray(raw) ? raw
                     : (raw && Array.isArray(raw.agents)) ? raw.agents
                     : (raw && Array.isArray(raw.roster)) ? raw.roster
                     : [];
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

// Initialize previous leads map from current state
function initializePrevLeadsMap(agentsList) {
    if (!agentsList || agentsList.length === 0) return;
    
    const prevMap = {};
    agentsList.forEach(agent => {
        const id = String(agent.ytelId || agent.name || '').trim();
        const nameKey = (agent.name || '').toUpperCase().trim();
        if (id) prevMap[id] = agent.dailyLeads || 0;
        if (nameKey) prevMap[nameKey] = agent.dailyLeads || 0;
        if (agent.rawName) {
            const rawKey = (agent.rawName || '').toUpperCase().trim();
            if (rawKey) prevMap[rawKey] = agent.dailyLeads || 0;
        }
    });
    
    window._prevDailyLeadsMap = prevMap;
    localStorage.setItem('biz_prev_leads_map', JSON.stringify(prevMap));
    console.log('[Init] Previous leads map initialized with', Object.keys(prevMap).length, 'entries');
    
    _lastSeenLeadCounts = {};
    agentsList.forEach(agent => {
        const id = String(agent.ytelId || agent.name || '').trim();
        if (id) _lastSeenLeadCounts[id] = agent.dailyLeads || 0;
    });
}

// Update real-time lead tracking for +X badges
function updateRealTimeLeadTracking(newAgents) {
    if (!newAgents || !newAgents.length) return;
    
    if (!window._prevDailyLeadsMap || Object.keys(window._prevDailyLeadsMap).length === 0) {
        initializePrevLeadsMap(newAgents);
        return;
    }
    
    if (!_initialPrevMapLoaded) {
        const savedMap = localStorage.getItem('biz_prev_leads_map');
        if (savedMap) {
            try {
                window._prevDailyLeadsMap = JSON.parse(savedMap);
                console.log('[Init] Loaded previous map from localStorage');
            } catch(e) {}
        }
        _initialPrevMapLoaded = true;
    }
    
    const changes = {};
    newAgents.forEach(agent => {
        const id = String(agent.ytelId || agent.name || '').trim();
        const nameKey = (agent.name || '').toUpperCase().trim();
        const currentLeads = agent.dailyLeads || 0;
        
        let previousLeads = 0;
        if (window._prevDailyLeadsMap[id] !== undefined) {
            previousLeads = window._prevDailyLeadsMap[id];
        } else if (window._prevDailyLeadsMap[nameKey] !== undefined) {
            previousLeads = window._prevDailyLeadsMap[nameKey];
        } else if (_lastSeenLeadCounts[id] !== undefined) {
            previousLeads = _lastSeenLeadCounts[id];
        }
        
        if (currentLeads !== previousLeads && previousLeads > 0) {
            changes[id] = { from: previousLeads, to: currentLeads, diff: currentLeads - previousLeads };
            if (id) window._prevDailyLeadsMap[id] = previousLeads;
            if (nameKey) window._prevDailyLeadsMap[nameKey] = previousLeads;
        }
        
        if (id) _lastSeenLeadCounts[id] = currentLeads;
        if (nameKey) _lastSeenLeadCounts[nameKey] = currentLeads;
    });
    
    if (Object.keys(changes).length > 0) {
        console.log('[Lead Tracking] Changes detected:', changes);
        localStorage.setItem('biz_prev_leads_map', JSON.stringify(window._prevDailyLeadsMap));
    }
}

// Calculate weekly cumulative totals from ALL uploaded days this week
function calculateWeeklyCumulativeTotals() {
    if (!dayHistory || dayHistory.length === 0) return {};
    
    const weeklyTotals = {};
    
    // Get ALL days that have data (Monday-Friday) - NOT just completed days
    const daysWithData = dayHistory.filter(day => day.agents && day.agents.length > 0);
    
    console.log('[Weekly] Days with data:', daysWithData.map(d => `${d.dayName}: ${d.agents.length} agents`));
    
    // Accumulate leads across ALL days that have data
    daysWithData.forEach(day => {
        if (day.agents && day.agents.length > 0) {
            day.agents.forEach(agent => {
                const agentKey = agent.ytelId || agent.name.toUpperCase();
                if (!weeklyTotals[agentKey]) {
                    weeklyTotals[agentKey] = {
                        name: agent.name,
                        ytelId: agent.ytelId,
                        team: agent.team,
                        leads: 0
                    };
                }
                weeklyTotals[agentKey].leads += agent.leads || 0;
            });
        }
    });
    
    console.log('[Weekly] Cumulative totals calculated for', Object.keys(weeklyTotals).length, 'agents');
    return weeklyTotals;
}

function _subscribeLiveDashboard() {
    if (!isDashboardSubscribed && typeof window.listenForLiveDashboardState === 'function') {
        window.listenForLiveDashboardState((state) => {
            if (!state) {
                const ts = document.getElementById('timestamp');
                if (ts) ts.innerText = 'System Offline: No Live Data';
                agents = [];
                if (typeof render === 'function') render();
                return;
            }
            
            // Check if this state is from today
            const isTodayData = isStateFromToday(state);
            
            const now = new Date();
            const pushDate = state.pushedAt ? new Date(state.pushedAt) : null;

            // Track diff changes inside localStorage across pushes
            const lastPushedAt = localStorage.getItem('biz_last_pushed_at');
            const statePushedAt = state.pushedAt || '';
            let prevMap = JSON.parse(localStorage.getItem('biz_prev_leads_map') || '{}');
            
            if (statePushedAt && statePushedAt !== lastPushedAt && isTodayData) {
                 // Push is actually new! Save the OLD state as previous
                 const lastStateStr = localStorage.getItem('biz_last_state_obj');
                 if (lastStateStr) {
                     try {
                         const lastState = JSON.parse(lastStateStr);
                         prevMap = {};
                         (lastState.agents || []).forEach(a => {
                             const id = String(a.ytelId || a.name || '').trim();
                             if (id) prevMap[id] = a.dailyLeads || 0;
                             const nameKey = (a.name || '').toUpperCase().trim();
                             if (nameKey) prevMap[nameKey] = a.dailyLeads || 0;
                         });
                         localStorage.setItem('biz_prev_leads_map', JSON.stringify(prevMap));
                         console.log('[Push] Saved previous leads map from last state');
                         
                         _lastSeenLeadCounts = {};
                         if (state.agents) {
                             state.agents.forEach(a => {
                                 const id = String(a.ytelId || a.name || '').trim();
                                 if (id) _lastSeenLeadCounts[id] = a.dailyLeads || 0;
                             });
                         }
                     } catch(e) {}
                 } else if (state.agents && isTodayData) {
                     prevMap = {};
                     state.agents.forEach(a => {
                         const id = String(a.ytelId || a.name || '').trim();
                         if (id) prevMap[id] = a.dailyLeads || 0;
                         const nameKey = (a.name || '').toUpperCase().trim();
                         if (nameKey) prevMap[nameKey] = a.dailyLeads || 0;
                     });
                     localStorage.setItem('biz_prev_leads_map', JSON.stringify(prevMap));
                     console.log('[Push] Initialized previous leads map from current state');
                 }
                 localStorage.setItem('biz_last_pushed_at', statePushedAt);
                 localStorage.setItem('biz_last_state_obj', JSON.stringify(state));
            } else if (!_initialPrevMapLoaded && state.agents && isTodayData) {
                if (Object.keys(prevMap).length === 0) {
                    state.agents.forEach(a => {
                        const id = String(a.ytelId || a.name || '').trim();
                        if (id) prevMap[id] = a.dailyLeads || 0;
                        const nameKey = (a.name || '').toUpperCase().trim();
                        if (nameKey) prevMap[nameKey] = a.dailyLeads || 0;
                    });
                    localStorage.setItem('biz_prev_leads_map', JSON.stringify(prevMap));
                    console.log('[Init] Initialized previous leads map from current state (no push yet)');
                }
                _initialPrevMapLoaded = true;
            }
            
            window._prevDailyLeadsMap = prevMap;
            window._asLastLiveState = state;
            
            if (fullRoster.length === 0) {
                subscribeRosterFromFirestore();
                agents = [];
                const ts = document.getElementById('timestamp');
                if (ts) ts.innerText = 'Loading roster from Firestore…';
            } else {
                // Only use state data if it's from today
                if (isTodayData && state.agents && state.agents.length > 0) {
                    agents = buildAgentsFromRoster(state);
                    if (agents && agents.length > 0) {
                        updateRealTimeLeadTracking(agents);
                    }
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
                } else {
                    // No data for today - clear agents array
                    agents = [];
                    console.log('[Dashboard] No data for today - waiting for upload');
                    const ts = document.getElementById('timestamp');
                    if (ts) ts.innerText = 'No data uploaded for today. Please upload a report.';
                }
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

                const _actualDate = (r) => {
                    if (r && r.reportDate) {
                        const d = new Date(r.reportDate);
                        if (!isNaN(d.getTime())) return d;
                    }
                    if (r && r.filename) {
                        const m = r.filename.match(/(\d{2})_(\d{2})_(\d{4})/);
                        if (m) {
                            const d = new Date(`${m[3]}-${m[1]}-${m[2]}`);
                            if (!isNaN(d.getTime())) return d;
                        }
                    }
                    return new Date(r && r.uploadedAt);
                };
                const _dayKeyFromIndex = (i) => (
                    i === 1 ? 'MON' : i === 2 ? 'TUE' : i === 3 ? 'WED' :
                    i === 4 ? 'THU' : i === 5 ? 'FRI' : null
                );

                // Get previous week reports (Monday to Sunday of last week)
                const lastWeekReports = data.filter(r => {
                    const d = _actualDate(r);
                    // Use lastMonday as start, lastMonday+7 as end (exclusive)
                    const weekEnd = new Date(lastMonday);
                    weekEnd.setDate(lastMonday.getDate() + 7);
                    return d >= lastMonday && d < weekEnd;
                });

                const lastWeekMap = {};
                FULL_WEEK_DAYS.forEach(day => { lastWeekMap[day] = null; });

                lastWeekReports.forEach(r => {
                    let dayKey = _dayKeyFromIndex(_actualDate(r).getDay());
                    if (!dayKey && FULL_WEEK_DAYS.includes(r.dayOfWeek)) {
                        dayKey = r.dayOfWeek;
                    }

                    if (dayKey && FULL_WEEK_DAYS.includes(dayKey)) {
                        if (!lastWeekMap[dayKey] || new Date(r.uploadedAt) > new Date(lastWeekMap[dayKey].uploadedAt)) {
                            lastWeekMap[dayKey] = r;
                        }
                    }
                });

                // Build previous week totals - ONLY from last week's reports
                const lastWeekAgg = {};
                Object.values(lastWeekMap).forEach(r => {
                    if (!r) return;
                    (r.data || []).forEach(d => {
                        const cleanName = String(d.agentName || d.name || '').replace(/^GY[BP]\s*/i, '').trim().toUpperCase();
                        const ytelId = String(d.agentId || d.ytelId || '').trim();
                        
                        let lc = Number(d.dailyLeads) || 0;
                        if (d.duration !== undefined && Number(d.duration) >= 120) lc = 1;
                        else if (d.duration !== undefined && Number(d.duration) < 120) lc = 0;
                        
                        if (lc > 0) {
                            const key = ytelId || cleanName;
                            lastWeekAgg[key] = (lastWeekAgg[key] || 0) + lc;
                        }
                    });
                });
                
                // Store previous week totals separately
                window._lastWeekTotals = lastWeekAgg;
                _cachedPrevWeekTotals = lastWeekAgg;
                _cachedPrevWeekTimestamp = Date.now();
                console.log('[PREVWK] Calculated previous week totals for', Object.keys(lastWeekAgg).length, 'agents');
                
                // Also store in localStorage for persistence
                localStorage.setItem('biz_prev_week_totals', JSON.stringify(lastWeekAgg));

                // Get current week reports (Monday to today)
                const thisWeekReports = data.filter(r => {
                    const d = _actualDate(r);
                    return d >= monday;
                });

                const weekMap = {};

                FULL_WEEK_DAYS.forEach(day => {
                    weekMap[day] = null;
                });

                thisWeekReports.forEach(r => {
                    let dayKey = _dayKeyFromIndex(_actualDate(r).getDay());
                    if (!dayKey && FULL_WEEK_DAYS.includes(r.dayOfWeek)) {
                        dayKey = r.dayOfWeek;
                    }

                    if (dayKey && FULL_WEEK_DAYS.includes(dayKey)) {
                        if (!weekMap[dayKey] || new Date(r.uploadedAt) > new Date(weekMap[dayKey].uploadedAt)) {
                            weekMap[dayKey] = r;
                        }
                    }
                });
                
                // Build dayHistory for ALL days Monday-Friday
                dayHistory = FULL_WEEK_DAYS.map(day => {
                    const r = weekMap[day];
                    
                    if (!r) {
                        return { 
                            day: day, 
                            empty: true, 
                            dayName: DAY_NAMES[day],
                            fullDayName: FULL_DAY_NAMES[day],
                            fullDate: null,
                            completed: isDayCompleted(day),
                            agents: [] 
                        };
                    }
                    
                    console.log(`Processing ${day} report: ${r.reportDate} - Found ${r.data ? r.data.length : 0} rows`);
                    
                    const agg = {};
                    (r.data || []).forEach(d => {
                        const id = d.agentId || d.ytelId || d.name;
                        const name = d.agentName || d.name;
                        const rawName = d.rawName || name;
                        
                        // Skip PH training accounts
                        if (rawName && /^PH(?![A-Za-z])/i.test(rawName)) return;
                        
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
                            if (leadCount === 0 && d.duration !== undefined) {
                                leadCount = Number(d.duration) >= 120 ? 1 : 0;
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
                        completed: isDayCompleted(day),
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
                
                // Calculate cumulative weekly totals
                const weeklyTotals = calculateWeeklyCumulativeTotals();
                window._weeklyCumulativeTotals = weeklyTotals;
                weeklyAccumulatedData = weeklyTotals;
                
                console.log('[Weekly] Cumulative totals - Number of agents:', Object.keys(weeklyTotals).length);
                
                renderDaySubTabs();
                
                // If currently on weekly tab, re-render immediately
                if (currentTab === 'weekly') {
                    console.log('[Weekly] Refreshing weekly tab');
                    render();
                }
                
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

    [lView, pView, luView, prView, rbView, trView, adView, sadView, asView, trackerView].forEach(v => { if (v) v.classList.add('hidden'); });

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

    const isWeekly = currentTab === 'weekly';
    const isPrevWeek = currentTab === 'daily' && currentDayView === 'prevweek';
    const isHistory = currentTab === 'daily' && currentDayView !== 'today' && currentDayView !== 'prevweek';
    const target = isWeekly ? 800 : (isPrevWeek ? 800 : 150);
    
    const todayName = agents.length > 0 ? (agents[0].todayName || 'Today') : 'Today';

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
            document.getElementById('day-indicator').innerText = isPrevWeek ? 'PREVIOUS WEEK SPRINT' : (isWeekly ? 'WEEKLY SPRINT' : todayName.toUpperCase() + ' PERFORMANCE');
        }
    } else {
        if(banner) banner.classList.add('hidden');
        document.getElementById('goal-label').innerText = (isWeekly || isPrevWeek) ? 'Weekly Team Goal' : todayName.toUpperCase() + ' DAILY GOAL';
        document.getElementById('day-indicator').innerText = isPrevWeek ? 'PREVIOUS WEEK SPRINT' : (isWeekly ? 'WEEKLY SPRINT' : todayName.toUpperCase() + ' PERFORMANCE');
    }

    const isAdmin = sessionStorage.getItem('bizUserRole') === 'admin';
    const targetDisplay = document.getElementById('target-display');

    if (targetDisplay) {
        targetDisplay.innerText = isAdmin ? 'Target: ' + target : '';
        targetDisplay.style.display = isAdmin ? '' : 'none';
    }

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
    } else if (isWeekly) {
        // Use cumulative weekly totals for the Weekly tab
        const weeklyTotals = window._weeklyCumulativeTotals || weeklyAccumulatedData || {};
        const weeklyAgentsList = Object.values(weeklyTotals);
        
        console.log('[Weekly Tab] Rendering with', weeklyAgentsList.length, 'agents from cumulative totals');
        
        fullList = weeklyAgentsList
            .filter(a => a.name && !String(a.name).toUpperCase().startsWith('PH '))
            .map(a => ({
                name: a.name,
                leads: a.leads || 0,
                team: a.team,
                ytelId: a.ytelId,
                rawName: a.name
            }))
            .sort((a, b) => b.leads - a.leads);
        
        fullList.forEach(a => {
            const leads = a.leads || 0;
            if (a.team === 'PR') prTotal += leads;
            else if (a.team === 'BB') bbTotal += leads;
            else if (a.team === 'RM') rmTotal += leads;
            totalLeads += leads;
            if (leads >= 12) masters++;
            activeReps++;
        });
        
        console.log('[Weekly Tab] Total leads:', totalLeads, 'PR:', prTotal, 'BB:', bbTotal, 'RM:', rmTotal);
    } else if (isPrevWeek) {
        // FIXED: Previous Week logic - use cached previous week totals
        console.log('[PREVWK] Rendering previous week');
        
        // Try to load from localStorage if not in memory
        let prevWeekTotals = _cachedPrevWeekTotals || window._lastWeekTotals;
        if (!prevWeekTotals || Object.keys(prevWeekTotals).length === 0) {
            const saved = localStorage.getItem('biz_prev_week_totals');
            if (saved) {
                try {
                    prevWeekTotals = JSON.parse(saved);
                    console.log('[PREVWK] Loaded totals from localStorage:', Object.keys(prevWeekTotals).length);
                } catch(e) {}
            }
        }
        
        if (!prevWeekTotals || Object.keys(prevWeekTotals).length === 0) {
            fullList = [];
            console.log('[PREVWK] No previous week totals found');
        } else {
            // Create a Set to track unique agent identifiers
            const agentsAdded = new Set();
            const prevWeekAgentsList = [];
            
            Object.entries(prevWeekTotals).forEach(([key, leads]) => {
                if (leads <= 0) return;
                
                // Try to find matching agent in roster
                let rosterMatch = null;
                let bestMatchName = key;
                
                for (const r of fullRoster) {
                    const rId = String(r.userId || r.ytelId || '').trim();
                    const rName = (r.fullName || r.name || '').toUpperCase().trim();
                    const keyUpper = String(key).toUpperCase().trim();
                    const rNameClean = rName.replace(/^(GYB|GYP|GTM|RM)\s+/i, '').trim();
                    
                    if (rId === keyUpper || rName === keyUpper || rNameClean === keyUpper) {
                        rosterMatch = r;
                        break;
                    }
                }
                
                let agentName = key;
                let agentTeam = 'PR';
                let agentYtelId = '';
                
                if (rosterMatch) {
                    agentName = rosterMatch.fullName || rosterMatch.name || key;
                    agentTeam = rosterMatch.team || normalizeTeam('', agentName);
                    agentYtelId = rosterMatch.userId || rosterMatch.ytelId || '';
                } else {
                    // If no roster match, clean the name but don't filter out numeric
                    agentName = key.replace(/^(GYB|GYP|GTM|RM)\s+/i, '').trim();
                    // Only skip if it's a standalone number AND less than 1000 (likely an ID)
                    // But keep it if it's a valid looking name
                    if (/^\d+$/.test(agentName) && agentName.length <= 4 && parseInt(agentName) < 10000) {
                        console.log('[PREVWK] Skipping orphaned numeric key:', key);
                        return;
                    }
                }
                
                const agentKey = agentYtelId || agentName.toUpperCase();
                
                // Skip duplicates
                if (agentsAdded.has(agentKey)) return;
                agentsAdded.add(agentKey);
                
                prevWeekAgentsList.push({
                    name: agentName,
                    leads: leads,
                    team: agentTeam,
                    ytelId: agentYtelId,
                    rawName: agentName
                });
            });
            
            fullList = prevWeekAgentsList
                .filter(a => a.name && !String(a.name).toUpperCase().startsWith('PH '))
                .sort((a, b) => b.leads - a.leads);
            
            console.log('[PREVWK] Found', fullList.length, 'unique agents with previous week leads');
        }
        
        fullList.forEach(a => {
            const leads = a.leads || 0;
            if (a.team === 'PR') prTotal += leads;
            else if (a.team === 'BB') bbTotal += leads;
            else if (a.team === 'RM') rmTotal += leads;
            totalLeads += leads;
            if (leads >= 12) masters++;
            activeReps++;
        });
        
        console.log('[PREVWK] Total leads:', totalLeads, 'PR:', prTotal, 'BB:', bbTotal, 'RM:', rmTotal);
    } else {
        const guyanaTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Guyana' }));
        const currentDay = guyanaTime.getDay();
        const daysToMonday = currentDay === 0 ? 6 : currentDay - 1;
        const currentMonday = new Date(guyanaTime);
        currentMonday.setDate(guyanaTime.getDate() - daysToMonday);
        currentMonday.setHours(0, 0, 0, 0);
        
        const stateObj = window._asLastLiveState;
        const pushDate = stateObj && stateObj.pushedAt ? new Date(stateObj.pushedAt) : null;
        
        let forceHideDaily = false;
        if (!isHistory && !isWeekly && !isPrevWeek) {
            if (currentDay === 0) {
                forceHideDaily = true;
            } else if (pushDate && pushDate < currentMonday) {
                forceHideDaily = true;
            }
        }

        fullList = agents
            .filter(a => !(a.name && String(a.name).toUpperCase().startsWith('PH ')))
            .map(a => {
                let leads = a.dailyLeads || 0;
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
            
        if (forceHideDaily) fullList = [];

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

    const displayData = fullList.map((a, i) => ({ ...a, rank: i + 1 }));
    window._lastFullList = fullList;

    const leaderboardEl = document.getElementById('leaderboard');
    if (!leaderboardEl) return;
    
    // Show appropriate messages based on data availability
    if (fullList.length === 0 && isHistory) {
        leaderboardEl.innerHTML = '<div class="glass p-8 rounded-2xl text-center text-slate-500" style="grid-column:1/-1;"><i class="fas fa-calendar-day text-4xl mb-3 block"></i> No data available for this day. The day may not be completed yet or no report was uploaded.</div>';
    } else if (fullList.length === 0 && isWeekly) {
        leaderboardEl.innerHTML = '<div class="glass p-8 rounded-2xl text-center text-slate-500" style="grid-column:1/-1;"><i class="fas fa-chart-line text-4xl mb-3 block"></i> No weekly data available yet. Upload reports for Monday-Friday to see cumulative totals.</div>';
    } else if (fullList.length === 0 && isPrevWeek) {
        leaderboardEl.innerHTML = '<div class="glass p-8 rounded-2xl text-center text-slate-500" style="grid-column:1/-1;"><i class="fas fa-calendar-week text-4xl mb-3 block"></i> No previous week data found. Upload reports for last week to see historical performance.</div>';
    } else if (fullList.length === 0 && !isWeekly && !isPrevWeek && !isHistory && agents.length === 0) {
        leaderboardEl.innerHTML = '<div class="glass p-8 rounded-2xl text-center text-slate-500" style="grid-column:1/-1;"><i class="fas fa-cloud-upload-alt text-4xl mb-3 block"></i> No data uploaded for today. Please upload a report to see live rankings.</div>';
    } else if (fullList.length === 0 && !isWeekly && !isPrevWeek && !isHistory) {
        leaderboardEl.innerHTML = '<div class="glass p-8 rounded-2xl text-center text-slate-500" style="grid-column:1/-1;"><i class="fas fa-calendar-week text-4xl mb-3 block"></i> The new week has started. Waiting for the live board to be updated...</div>';
    } else {
        leaderboardEl.innerHTML = displayData.map((agent) => {
            const lvl = getLevel(agent.leads);
            const rank = agent.rank;
            const isMe = (myName && agent.name && agent.name.trim().toUpperCase() === myName) ||
                         (myYtelId && agent.ytelId === myYtelId);

            const teamBadgeClass = {
                'PR': 'badge-prov',
                'BB': 'badge-bb',
                'RM': 'badge-rm'
            }[String(agent.team || '').toUpperCase()] || 'badge-prov';

            const teamLabel = {
                'PR': 'PROV',
                'BB': 'BERB',
                'RM': 'RM'
            }[String(agent.team || '').toUpperCase()] || 'PROV';

            const teamBadge = `<span class="lb-team-badge ${teamBadgeClass}">${teamLabel}</span>`;
            const youBadge  = isMe ? `<span class="lb-you-badge">YOU</span>` : '';

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
                        <div class="lb-score-label">${isWeekly || isPrevWeek ? 'WEEKLY' : 'TRANSFERS'}</div>
                    </div>
                </div>`;
        }).join('');
    }

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

function renderDaySubTabs() {
    const wrapper = document.getElementById('day-sub-tabs-wrapper');
    const container = document.getElementById('day-sub-tabs-container');

    if (currentTab !== 'daily') {
        if (wrapper) wrapper.classList.add('hidden');
        return;
    }
    
    if (wrapper) wrapper.classList.remove('hidden');
    if (!container) return;
    
    let html = `<button onclick="switchDayView('today')" class="day-sub-tab is-today ${currentDayView === 'today' ? 'active' : ''}">📅 Today</button>`;
    
    FULL_WEEK_DAYS.forEach(day => {
        const dayData = dayHistory.find(d => d && d.day === day);
        const hasData = dayData && !dayData.empty && dayData.agents && dayData.agents.length > 0;
        const isCompleted = isDayCompleted(day);
        const isActive = currentDayView === day;
        const shortName = DAY_NAMES[day] || day;
        
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

    const isPrevActive = currentDayView === 'prevweek';
    html += `
        <button onclick="switchDayView('prevweek')" 
                class="day-sub-tab is-history ${isPrevActive ? 'active' : ''}" style="margin-left:8px; border-color:rgba(148,163,184,0.3); color:#94a3b8;">
            <i class="fas fa-history mr-1 opacity-60"></i> PREV WK
        </button>`;

    container.innerHTML = html;
    
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
