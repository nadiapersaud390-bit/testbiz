/**
 * js/adminhub.js
 * Core logic for the Admin Panel Hub system.
 */

let ahCurrentSubTab = 'overview';
const ahTeamColors = {
    BB: 'blue-500',
    PR: 'purple-500',
    RM: 'cyan-400'
};

// Internal tab switcher
window.switchAdminHubTab = function(tabId) {
    // Permission Check for Admin Tools
    const currentAdmin = JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');
    const isSuper = currentAdmin.role === 'super_admin' || currentAdmin.isSuper;
    const isMomo = String(currentAdmin.email || '').toLowerCase() === 'momo';
    
    if (tabId === 'admintools' && !isSuper) {
        console.warn('Unauthorized access to Admin Tools blocked.');
        return;
    }
    if (tabId === 'stats' && !isSuper) {
        console.warn('Unauthorized access to Agent Stats blocked.');
        return;
    }

    ahCurrentSubTab = tabId;
    
    // Update Nav Buttons
    document.querySelectorAll('.ah-nav-btn, .ah-nav-btn-special').forEach(btn => {
        btn.classList.remove('active');
        if (btn.id === `ah-tab-${tabId}`) btn.classList.add('active');
    });
    
    // Update Sections
    document.querySelectorAll('.ah-section').forEach(sect => {
        sect.classList.add('hidden');
    });
    const target = document.getElementById(`ah-sect-${tabId}`);
    if (target) target.classList.remove('hidden');
    
    // Lazy Load/Init Sub-modules
    // Lazy Load/Init Sub-modules
    if (tabId === 'profiles' && typeof window.initAgentProfiles === 'function') window.initAgentProfiles();
    if (tabId === 'stats' && typeof window.renderAgentStatsHistory === 'function') window.renderAgentStatsHistory();
    if (tabId === 'coaching' && typeof window.coachingInit === 'function') window.coachingInit();
    if (tabId === 'monitoring' && typeof window.monitoringInit === 'function') window.monitoringInit();
    if (tabId === 'rebuttals') initRebuttalIntel();
    if (tabId === 'performance') initWeeklyPerformance();
    if (tabId === 'admintools') ahAdminToolsInit();
    if (tabId === 'zero') ahInitZeroPerf();
};

function ahInitZeroPerf() {
    const dailyList = document.getElementById('ah-zero-daily-list');
    const weeklyList = document.getElementById('ah-zero-weekly-list');
    if (!dailyList || !weeklyList) return;

    // Prefer active daily agents, but fallback to the full roster if needed
    const profiles = (window.agents && window.agents.length > 0) ? window.agents : (window.allAgentProfiles || []);
    const reports  = window.allAgentReports  || [];

    // Helper to find an agent's count in a map using multiple possible keys (ID, Name, etc)
    function getCount(p, countMap) {
        const id1 = String(p.ytelId || '').trim();
        const id2 = String(p.userId || '').trim();
        const name = (p.name || p.fullName || '').trim().toUpperCase();
        
        if (id1 && countMap[id1] !== undefined) return countMap[id1];
        if (id2 && countMap[id2] !== undefined) return countMap[id2];
        if (name && countMap[name]) return countMap[name];
        return 0;
    }

    // ── Date helpers ──────────────────────────────────────────────────────────
    function todayStr() {
        const n = new Date();
        return `${String(n.getMonth()+1).padStart(2,'0')}/${String(n.getDate()).padStart(2,'0')}/${n.getFullYear()}`;
    }

    function parseReportDate(str) {
        if (!str) return null;
        const p = str.split('/');
        if (p.length !== 3) return null;
        return new Date(`${p[2]}-${p[0]}-${p[1]}T12:00:00`);
    }

    function weekStart() {
        const n = new Date();
        const diff = (n.getDay() === 0 ? -6 : 1) - n.getDay();
        const mon = new Date(n);
        mon.setDate(n.getDate() + diff);
        mon.setHours(0, 0, 0, 0);
        return mon;
    }

    // ── Compute transfer counts from report rows ───────────────────────────────
    // Returns { userId -> xferCount }
    function countXfers(rows) {
        const map = {};
        (rows || []).forEach(row => {
            const uid = String(row.agentId || '').trim();
            if (!uid) return;
            if (!map[uid]) map[uid] = 0;
            if ((row.duration || 0) >= 120) map[uid]++;
        });
        return map;
    }

    // ── Shared row renderer ────────────────────────────────────────────────────
    function renderRow(p, xfers, hasUpload, isWeekly) {
        const team       = p.team || 'PR';
        const hasXfer    = xfers > 0;
        const dotColor   = hasXfer ? 'bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]' : 'bg-slate-700';
        const xferColor  = hasXfer ? 'text-cyan-400' : (isWeekly ? 'text-orange-400' : 'text-red-400');
        let xferLabel;
        if (!hasUpload)      xferLabel = '—';
        else if (hasXfer)    xferLabel = `${xfers} XFER${xfers !== 1 ? 'S' : ''}`;
        else                 xferLabel = isWeekly ? '0 WEEKLY XFERS' : '0 XFERS';

        return `
            <div class="bg-white/5 border border-white/5 rounded-2xl p-4 flex justify-between items-center group hover:bg-white/10 transition">
                <div class="flex items-center gap-3">
                    <div class="w-2 h-2 rounded-full ${dotColor}"></div>
                    <div>
                        <div class="text-[12px] font-black text-white uppercase tracking-tight">${(p.name || p.fullName || 'Unknown').toUpperCase()}</div>
                        <div class="text-[8px] text-slate-500 font-bold uppercase tracking-widest">${p.ytelId || p.userId || '----'} | ${team}</div>
                    </div>
                </div>
                <div class="text-right">
                    <div class="text-[10px] font-black ${xferColor} uppercase italic">${xferLabel}</div>
                </div>
            </div>`;
    }

    // Use the full roster as the definitive source
    const roster = window.allAgentProfiles || [];
    const liveAgents = window.agents || [];
    const reports = window.allAgentReports || [];

    // Helper to find an agent's count in a map or array
    function getDailyCount(p) {
        // Try live data first
        const pId = String(p.userId || '').trim();
        const pName = String(p.fullName || '').trim().toUpperCase();
        const live = liveAgents.find(a => String(a.ytelId).trim() === pId || (a.name && a.name.toUpperCase() === pName));
        if (live) return Number(live.dailyLeads) || 0;

        // Try today's report second
        const todayReport = reports.find(r => r.reportDate === todayStr());
        if (todayReport) {
            const row = todayReport.data.find(d => String(d.agentId).trim() === pId || (d.agentName && d.agentName.toUpperCase() === pName));
            return row ? (Number(row.dailyLeads) || 0) : 0;
        }
        return 0;
    }

    // ── 1. DAILY: Show anyone in roster with 0 leads ───────────────────────────
    if (roster.length === 0) {
        dailyList.innerHTML = '<div class="py-10 text-center text-slate-600 font-bold uppercase text-[9px] tracking-widest">No agents in roster yet</div>';
    } else {
        const zeros = roster.filter(p => getDailyCount(p) === 0);
        if (zeros.length === 0) {
            dailyList.innerHTML = '<div class="py-10 text-center text-green-500 font-bold uppercase text-[9px] tracking-widest">✅ All agents have transfers today!</div>';
        } else {
            dailyList.innerHTML = zeros.map(p => renderRow(p, 0, true, false)).join('');
        }
    }

    // ── 2. WEEKLY: aggregate all uploads from Mon → today ────────────────────
    const mon = weekStart();
    const weekReports = reports.filter(r => {
        const d = parseReportDate(r.reportDate);
        return d && d >= mon;
    });

    if (weekReports.length === 0) {
        weeklyList.innerHTML = '<div class="py-10 text-center text-slate-600 font-bold uppercase text-[9px] tracking-widest">Awaiting this week\'s report upload...</div>';
    } else {
        // Merge all days' counts
        const weeklyCounts = {};
        weekReports.forEach(r => {
            const day = countXfers(r.data);
            Object.entries(day).forEach(([uid, n]) => {
                weeklyCounts[uid] = (weeklyCounts[uid] || 0) + n;
            });
        });

        const zeros = profiles.filter(p => getCount(p, weeklyCounts) === 0);
        if (zeros.length === 0) {
            weeklyList.innerHTML = '<div class="py-10 text-center text-green-500 font-bold uppercase text-[9px] tracking-widest">✅ All agents have transfers this week!</div>';
        } else {
            weeklyList.innerHTML = zeros.map(p =>
                renderRow(p, 0, true, true)
            ).join('');
        }
    }
}

// ── WEEKLY PERFORMANCE LOGIC ──
function initWeeklyPerformance() {
    // Set current week range
    const rangeEl = document.getElementById('ah-weekly-range');
    if (rangeEl) {
        const now = new Date();
        const start = new Date(now);
        // Set to previous Monday
        const day = now.getDay();
        const diff = (day === 0 ? -6 : 1) - day; 
        start.setDate(now.getDate() + diff);
        start.setHours(0,0,0,0);
        
        const end = new Date(start);
        end.setDate(start.getDate() + 6); // Sunday
        end.setHours(23,59,59,999);
        
        rangeEl.innerText = `${start.toLocaleDateString('en-US', {month:'short', day:'numeric'})} - ${end.toLocaleDateString('en-US', {month:'short', day:'numeric'})}, ${start.getFullYear()}`;
    }

    // Load Data
    renderWeeklyTeamRankings();
    renderWeeklyTopAgents();
}

function renderWeeklyTeamRankings() {
    const list = document.getElementById('ah-weekly-team-list');
    if (!list) return;

    // Simulated Weekly Totals (In production, these come from Firestore daily aggregations)
    // We can calculate them from window.agents daily stats as a baseline
    const teams = [
        { name: 'Providence', code: 'PR', xfers: 482, color: 'purple-500', trend: '+12%' },
        { name: 'Berbice', code: 'BB', xfers: 395, color: 'blue-500', trend: '-2%' },
        { name: 'Remote', code: 'RM', xfers: 215, color: 'cyan-400', trend: '+140%' }
    ].sort((a,b) => b[xfers] - a[xfers]);

    const max = teams[0].xfers;

    list.innerHTML = teams.map((t, i) => `
        <div class="relative">
            <div class="flex justify-between items-center mb-2">
                <div class="flex items-center gap-3">
                    <span class="text-xl font-black text-slate-700">0${i+1}</span>
                    <div>
                        <div class="text-[12px] font-black text-white uppercase tracking-tight">${t.name}</div>
                        <div class="text-[8px] text-${t.color} font-bold uppercase tracking-widest">${t.code} TEAM</div>
                    </div>
                </div>
                <div class="text-right">
                    <div class="text-lg font-black text-white italic">${t.xfers} <span class="text-[9px] text-slate-500 not-italic">Xfers</span></div>
                    <div class="text-[8px] font-black ${t.trend.startsWith('+') ? 'text-green-500' : 'text-red-500'} uppercase">${t.trend} vs Last Week</div>
                </div>
            </div>
            <div class="h-3 bg-white/5 rounded-full overflow-hidden p-0.5 border border-white/5">
                <div class="h-full bg-${t.color} rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(0,0,0,0.5)]" style="width: ${(t.xfers/max)*100}%"></div>
            </div>
        </div>
    `).join('');
}

function renderWeeklyTopAgents() {
    const list = document.getElementById('ah-weekly-agent-list');
    if (!list) return;

    // Use current agents array but simulate weekly scale
    const topAgents = (window.agents || [])
        .map(a => ({ ...a, weekly: (Number(a.dailyLeads) || 0) * 4.5 + Math.floor(Math.random()*20) })) // Simulated weekly
        .sort((a,b) => b.weekly - a.weekly)
        .slice(0, 5);

    if (topAgents.length === 0) {
        list.innerHTML = '<div class="py-10 text-center text-slate-600 font-bold uppercase text-[9px] tracking-widest">No agent data available</div>';
        return;
    }

    list.innerHTML = topAgents.map((a, i) => {
        const team = normalizeTeam(a.team, a.name);
        const color = ahTeamColors[team] || 'slate-500';
        return `
            <div class="flex items-center gap-4 bg-white/5 border border-white/5 p-3 rounded-2xl hover:bg-white/10 transition group">
                <div class="w-8 h-8 rounded-xl bg-black/40 flex items-center justify-center font-black text-[10px] text-slate-500 group-hover:text-white transition">${i+1}</div>
                <div class="flex-1 overflow-hidden">
                    <div class="text-[11px] font-black text-white uppercase truncate">${a.name}</div>
                    <div class="text-[7px] text-${color} font-bold uppercase tracking-widest">${team}</div>
                </div>
                <div class="text-right">
                    <div class="text-[12px] font-black text-white italic">${Math.floor(a.weekly)}</div>
                    <div class="text-[7px] text-slate-600 font-bold uppercase tracking-tighter">TOTAL</div>
                </div>
            </div>
        `;
    }).join('');
}

// ── REBUTTAL INTEL LOGIC ──
window.logRebuttalUsage = async function(id, title) {
    const cUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
    const data = {
        rebuttalId: id,
        rebuttalTitle: title,
        agentName: cUser.name || 'Unknown',
        timestamp: Date.now()
    };
    if (typeof window.saveRebuttalUsage === 'function') {
        window.saveRebuttalUsage(data);
    }
};

function initRebuttalIntel() {
    if (window.ahRebuttalSubscribed) return;
    if (typeof window.listenToRebuttalUsage === 'function') {
        window.listenToRebuttalUsage((usage) => {
            renderRebuttalIntel(usage);
        });
        window.ahRebuttalSubscribed = true;
    }
}

function renderRebuttalIntel(usage) {
    const chart = document.getElementById('ah-rebuttal-chart');
    const table = document.getElementById('ah-rebuttal-table-body');
    const signals = document.getElementById('ah-coaching-signals');
    if (!chart || !table) return;

    // Aggregate counts
    const counts = {};
    usage.forEach(u => {
        counts[u.rebuttalTitle] = (counts[u.rebuttalTitle] || 0) + 1;
    });

    const sorted = Object.entries(counts).sort((a,b) => b[1] - a[1]);
    const top5 = sorted.slice(0, 5);
    const max = top5[0] ? top5[0][1] : 1;

    // Render Chart
    chart.innerHTML = top5.map(([title, val]) => `
        <div class="space-y-2">
            <div class="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
                <span>${title}</span>
                <span class="text-white">${val} Hits</span>
            </div>
            <div class="h-2 bg-white/5 rounded-full overflow-hidden">
                <div class="h-full bg-gradient-to-r from-blue-600 to-cyan-400 rounded-full" style="width: ${(val/max)*100}%"></div>
            </div>
        </div>
    `).join('') || '<div class="py-10 text-center text-slate-600 font-bold uppercase text-[10px] tracking-widest">No clicks recorded yet today</div>';

    // Render Table
    table.innerHTML = sorted.map(([title, val]) => `
        <tr class="hover:bg-white/5 transition">
            <td class="p-4 text-[12px] font-black text-white uppercase tracking-tight">${title}</td>
            <td class="p-4 text-[9px] font-bold text-slate-500 uppercase tracking-widest">General Objection</td>
            <td class="p-4 text-center font-black text-blue-400 tabular-nums">${val}</td>
            <td class="p-4 text-right"><span class="px-2 py-0.5 rounded bg-green-500/10 text-green-500 text-[8px] font-black uppercase tracking-widest">↗ Stable</span></td>
        </tr>
    `).join('');

    // Logic for Coaching Signals
    if (usage.length > 5) {
        // Find agents with high hits
        const agentHits = {};
        usage.forEach(u => {
            agentHits[u.agentName] = (agentHits[u.agentName] || 0) + 1;
        });
        const heavyUsers = Object.entries(agentHits).filter(([name, hits]) => hits > usage.length / 3);
        
        if (heavyUsers.length > 0 && signals) {
            signals.innerHTML = heavyUsers.map(([name, hits]) => `
                <div class="bg-purple-500/5 border border-purple-500/20 p-4 rounded-2xl">
                    <div class="text-[10px] font-black text-white uppercase tracking-tight mb-1">${name}</div>
                    <div class="text-[9px] text-purple-400 font-bold uppercase tracking-widest">High Objection Volume (${hits} hits)</div>
                    <div class="text-[9px] text-slate-500 mt-2 font-bold leading-relaxed italic">Suggestion: Monitor live calls to check closing tone.</div>
                </div>
            `).join('');
        }
    }
}

// Initialize Overview Data
window.ahInitOverview = function() {
    const currentAdmin = JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');
    const isSuper = currentAdmin.role === 'super_admin' || currentAdmin.isSuper;
    const isMomo = currentAdmin.name === 'Momo';
    
    // Store globally so switchAdminHubTab can access them
    window.ahIsSuperAdmin = isSuper;
    window.ahIsMomo = isMomo;
    
    const toolsBtn = document.getElementById('ah-tab-admintools');
    const statsBtn = document.getElementById('ah-tab-stats');
    
    // Role-based sidebar cleanup
    if (!isSuper && !isMomo) {
        // Standard Admins (like 0000) - Hide restricted tools
        if (toolsBtn) toolsBtn.classList.add('hidden');
        if (statsBtn) statsBtn.classList.add('hidden');
        
        if (['admintools','stats','trivia','super'].includes(ahCurrentSubTab)) {
            window.switchAdminHubTab('overview');
        }
    }

    // Clock
    setInterval(() => {
        const d = document.getElementById('ah-live-clock');
        if (d) {
            const now = new Date();
            d.innerText = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }
    }, 1000);

    // 1. Sync Roster from Google Sheet first
    ahSyncRosterFromSheet();

    // 2. Pre-load Agent Profiles from Firebase as a secondary backup
    if (typeof window.initAgentProfiles === 'function') {
        window.initAgentProfiles();
    }

    // Sync from global 'agents' and 'roster' (from dashboard.js)
    if (typeof window.listenForLiveDashboardState === 'function') {
        window.listenForLiveDashboardState(handleLiveStateUpdate);
    }
    
    // Dashboard Presence Sync
    if (typeof window.ahListenForPresence === 'function') {
        window.ahListenForPresence(presence => {
            window.ahOnlinePresences = presence;
            if (window.agents) handleLiveStateUpdate({ agents: window.agents });
        });
    }

    // Historical Attendance Sync
    if (typeof window.listenForAgentReports === 'function') {
        window.listenForAgentReports(reports => {
            const select = document.getElementById('ah-att-report-select');
            if (!select) return;
            
            // Keep the 'Live' option
            select.innerHTML = '<option value="live" class="bg-slate-900">Live Today</option>';
            
            // Sort by date desc
            const sorted = [...reports].sort((a,b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
            sorted.forEach(r => {
                const opt = document.createElement('option');
                opt.value = r.id;
                opt.className = 'bg-slate-900';
                opt.innerText = r.reportDate || r.filename;
                select.appendChild(opt);
            });
            
            window.ahAllReports = reports;
            window.allAgentReports = reports; // Keep in sync for Zero Performance tab
        });
    }
}

let ahAttFilterTeam = 'ALL';
let ahAttCurrentView = 'daily';
let ahAttSelectedReportId = 'live';

window.ahSelectAttReport = function(id) {
    ahAttSelectedReportId = id;
    renderDailyAttendance();
};

window.switchAttView = function(view) {
    ahAttCurrentView = view;
    document.querySelectorAll('.att-view-content').forEach(v => v.classList.add('hidden'));
    document.getElementById(`att-view-${view}`).classList.remove('hidden');
    
    // Update Btn Styles
    ['daily', 'weekly', 'monthly'].forEach(v => {
        const b = document.getElementById(`att-v-${v}`);
        if(b) {
            b.className = (v === view) 
                ? "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-blue-500 text-white shadow-lg shadow-blue-900/40"
                : "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white transition";
        }
    });

    if (view === 'daily') renderDailyAttendance();
};

window.filterAttTeam = function(team) {
    ahAttFilterTeam = team;
    document.querySelectorAll('.att-team-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.id === `att-t-${team.toLowerCase()}`) btn.classList.add('active');
    });
    
    if (ahAttCurrentView === 'daily') renderDailyAttendance();
    if (ahAttCurrentView === 'weekly') ahLoadWeeklyMatrix(team);
};

function renderDailyAttendance() {
    const list = document.getElementById('att-daily-list');
    if (!list) return;

    let sourceData = [];
    const roster = window.allAgentProfiles || [];
    const liveAgents = window.agents || [];

    if (ahAttSelectedReportId === 'live') {
        sourceData = roster.map(p => {
            const live = liveAgents.find(la => String(la.ytelId) === String(p.userId) || (la.name && la.name.toUpperCase() === p.fullName.toUpperCase()));
            return {
                name: p.fullName,
                ytelId: p.userId,
                team: p.team || '',
                status: live ? 'Present' : 'Absent',
                loginTime: live ? (live.loginTime || 'LOGGED') : '--:--',
                rawName: p.fullName
            };
        });
    } else if (window.ahAllReports) {
        const report = window.ahAllReports.find(r => r.id === ahAttSelectedReportId);
        if (report && report.data) {
            const reportData = report.data;
            sourceData = roster.map(p => {
                const match = reportData.find(d => String(d.agentId) === String(p.userId) || (d.agentName && d.agentName.toUpperCase() === p.fullName.toUpperCase()));
                return {
                    name: p.fullName,
                    ytelId: p.userId,
                    team: p.team || '',
                    status: (match && match.duration >= 120) ? 'Present' : 'Absent',
                    loginTime: (match && match.duration >= 120) ? 'LOGGED' : '--:--',
                    rawName: p.fullName
                };
            });
        }
    }
    
    if (sourceData.length === 0) {
        list.innerHTML = '<tr><td colspan="6" class="py-10 text-center text-slate-500 font-bold uppercase tracking-widest">No attendance records found. Please select a date or upload a report.</td></tr>';
        return;
    }

    const filtered = sourceData.filter(a => {
        if (ahAttFilterTeam === 'ALL') return true;
        const team = normalizeTeam(a.team, a.rawName || a.name);
        return team === ahAttFilterTeam;
    });
    
    if (filtered.length === 0) {
        list.innerHTML = '<tr><td colspan="6" class="py-10 text-center text-slate-500 font-bold uppercase tracking-widest">No attendance records found for this team</td></tr>';
        return;
    }
    
    list.innerHTML = filtered.map((a, i) => {
        const team = normalizeTeam(a.team, a.name);
        const colorClass = ahTeamColors[team] || 'slate-500';
        return `
            <tr class="hover:bg-white/5 transition group">
                <td class="py-4 px-2 text-[10px] font-black text-slate-600">${i+1}</td>
                <td class="py-4">
                    <div class="text-[12px] font-black text-white uppercase tracking-tight">${a.name}</div>
                    <div class="text-[8px] text-slate-500 font-bold">${a.ytelId || '----'}</div>
                </td>
                <td class="py-4">
                    <span class="px-2 py-1 rounded bg-${colorClass}/10 text-${colorClass} text-[8px] font-black uppercase tracking-widest border border-${colorClass}/20">${team}</span>
                </td>
                <td class="py-4 text-[10px] text-slate-300 font-bold">${a.shift || '10AM-7PM'}</td>
                <td class="py-4">
                    <span class="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest ${a.status === 'Present' ? 'text-green-400' : 'text-yellow-400'}">
                        <span class="w-1.5 h-1.5 rounded-full ${a.status === 'Present' ? 'bg-green-500' : 'bg-yellow-500'}"></span>
                        ${a.status || 'Present'}
                    </span>
                </td>
                <td class="py-4 text-right tabular-nums text-[10px] text-slate-400 font-bold">${a.loginTime || '--:--'}</td>
            </tr>
        `;
    }).join('');
}

async function ahLoadWeeklyMatrix(team) {
    const container = document.getElementById('att-weekly-matrix');
    if (team === 'ALL') {
        container.innerHTML = '<div class="py-10 text-slate-600 font-bold uppercase text-[10px] tracking-widest border border-dashed border-white/10 rounded-2xl">Select BB, PR, or RM to load sheet data</div>';
        return;
    }
    
    container.innerHTML = '<div class="py-10 text-blue-400 font-bold uppercase text-[10px] tracking-widest"><i class="fas fa-spinner fa-spin mr-2"></i> Connecting to Google Sheet Bridge...</div>';
    
    try {
        const resp = await fetch(`${API_URL}?action=getWeekly&team=${team}`);
        const data = await resp.json();
        // Integration for matrix rendering coming in next step
        container.innerHTML = `<div class="py-10 text-green-400 font-bold uppercase text-[10px] tracking-widest">✅ Data Received for ${team} (${data.length} records)</div>`;
    } catch (e) {
        container.innerHTML = `<div class="py-10 text-red-400 font-bold uppercase text-[10px] tracking-widest">❌ Sheet Sync Failed</div>`;
    }
}

let ahLastUpdate = 0;
function handleLiveStateUpdate(state) {
    if (!state || !state.agents) return;
    window.agents = state.agents; // Data sync stays instant
    
    // Throttle the heavy UI rendering (max once per second)
    const now = Date.now();
    if (now - ahLastUpdate < 1000) return; 
    ahLastUpdate = now;
    
    // Update Datalists for modals
    const coachList = document.getElementById('coach-rep-list');
    const monList = document.getElementById('mon-rep-list');
    if (coachList && monList) {
        const names = window.agents.map(a => a.name).sort();
        const opts = names.map(n => `<option value="${n}">`).join('');
        coachList.innerHTML = opts;
        monList.innerHTML = opts;
    }

    let totalXfers = 0;
    let bbXfers = 0;
    let prXfers = 0;
    let rmXfers = 0;
    
    // Calculate Team Totals
    agents.forEach(a => {
        const x = Number(a.dailyLeads) || 0;
        totalXfers += x;
        const team = normalizeTeam(a.team, a.name);
        if (team === 'BB') bbXfers += x;
        else if (team === 'PR') prXfers += x;
        else if (team === 'RM') rmXfers += x;
    });
    
    // Update Overview UI
    const totalEl = document.getElementById('ah-total-transfers');
    if (totalEl) {
        const goal = 300; // Hardcoded default for now
        totalEl.innerHTML = `${totalXfers} <span class="text-lg text-slate-600">/ ${goal}</span>`;
        const percent = Math.min(100, (totalXfers / goal) * 100);
        document.getElementById('ah-goal-progress').style.width = `${percent}%`;
    }
    
    if (document.getElementById('ah-bb-count')) document.getElementById('ah-bb-count').innerHTML = `${bbXfers} <span class="text-xs text-slate-500">Transfers</span>`;
    if (document.getElementById('ah-pr-count')) document.getElementById('ah-pr-count').innerHTML = `${prXfers} <span class="text-xs text-slate-500">Transfers</span>`;
    if (document.getElementById('ah-rm-count')) document.getElementById('ah-rm-count').innerHTML = `${rmXfers} <span class="text-xs text-slate-500">Transfers</span>`;
    
    // Populate Online & Offline Grids
    const onlineGrid = document.getElementById('ah-online-grid');
    const offlineGrid = document.getElementById('ah-offline-grid');
    
    if (onlineGrid && offlineGrid) {
        // 1. Prepare Roster Map for fast lookup
        const roster = window.allAgentProfiles || [];
        const rosterTotalEl = document.getElementById('ah-roster-total');
        if (rosterTotalEl) rosterTotalEl.textContent = roster.length;

        const presence = window.ahOnlinePresences || {};
        const liveAgents = window.agents || [];
        
        // 2. Build the full list starting with the roster
        const rosterIds = new Set();
        const fullAgentList = roster.map(p => {
            const pId = String(p.userId || '').trim();
            const pName = String(p.fullName || '').trim().toUpperCase();
            rosterIds.add(pId);

            // Find live data matching this roster entry
            const live = liveAgents.find(a => {
                const aId = String(a.ytelId || '').trim();
                const aName = String(a.name || '').trim().toUpperCase();
                return (aId === pId && aId !== '') || (aName === pName && aName !== '');
            });

            return {
                ...p,
                name: p.fullName,
                ytelId: p.userId,
                dailyLeads: live ? (live.dailyLeads || 0) : 0,
                isOnline: !!presence[pId],
                inRoster: true
            };
        });

        // 3. ADD agents who are online but NOT in the roster (Safety Catch)
        liveAgents.forEach(a => {
            const aId = String(a.ytelId || '').trim();
            if (!rosterIds.has(aId)) {
                fullAgentList.push({
                    name: a.name,
                    ytelId: aId,
                    team: '??',
                    dailyLeads: a.dailyLeads || 0,
                    isOnline: !!presence[aId],
                    inRoster: false
                });
            }
        });

        const onlineAgents = fullAgentList.filter(a => a.isOnline);
        const offlineAgents = fullAgentList.filter(a => !a.isOnline && a.inRoster);

        onlineGrid.innerHTML = onlineAgents.map(a => {
            const team = normalizeTeam(a.team, a.name);
            const colorClass = ahTeamColors[team] || 'slate-500';
            const status = presence[a.ytelId]?.status || 'Online';
            return `
                <div class="bg-white/5 border border-white/10 rounded-xl p-2 flex items-center gap-2 hover:bg-white/10 transition group cursor-help" title="${status}">
                    <div class="w-1.5 h-1.5 bg-green-500 rounded-full shadow-[0_0_5px_rgba(34,197,94,0.5)]"></div>
                    <div class="flex-1 overflow-hidden">
                        <div class="text-[9px] font-black text-white truncate uppercase">${a.name}</div>
                        <div class="flex justify-between items-center mt-0.5">
                            <div class="text-[7px] font-bold text-${colorClass} uppercase tracking-tighter">${team}</div>
                            <div class="text-[7px] font-black text-cyan-400 italic">${a.dailyLeads}</div>
                        </div>
                    </div>
                </div>
            `;
        }).join('') || '<div class="col-span-3 py-6 text-center text-[8px] text-slate-600 font-bold uppercase tracking-widest">No agents online</div>';

        offlineGrid.innerHTML = offlineAgents.map(a => {
            const team = normalizeTeam(a.team, a.name);
            const colorClass = ahTeamColors[team] || 'slate-500';
            return `
                <div class="bg-white/5 border border-white/5 opacity-40 rounded-xl p-2 flex items-center gap-2 hover:opacity-100 transition grayscale hover:grayscale-0">
                    <div class="w-1.5 h-1.5 bg-slate-700 rounded-full"></div>
                    <div class="flex-1 overflow-hidden">
                        <div class="text-[9px] font-black text-slate-400 truncate uppercase">${a.name || 'Unknown Agent'}</div>
                        <div class="flex justify-between items-center mt-0.5">
                            <div class="text-[7px] font-bold text-slate-600 uppercase tracking-tighter">${team}</div>
                            <div class="text-[7px] font-black text-slate-800 uppercase tracking-widest">${a.dailyLeads}</div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Update Broadcast Audience (Only those online)
    if (document.getElementById('ah-broadcast-audience')) {
        const onlineCount = agents.filter(a => (window.ahOnlinePresences || {})[a.ytelId]).length;
        document.getElementById('ah-broadcast-audience').innerText = onlineCount;
    }
}

// Global hook for dashboard loading
document.addEventListener('DOMContentLoaded', () => {
    // If adminpanel tab is already open, init it
    if (currentTab === 'adminpanel') ahInitOverview();
});

window.ahShowTeamBreakdown = function(team) {
    const detailSect = document.getElementById('ah-sect-team-detail');
    const title = document.getElementById('ah-team-modal-title');
    const icon = document.getElementById('ah-team-modal-icon');
    const list = document.getElementById('ah-team-modal-list');
    
    if (!detailSect || !window.agents) return;

    // Toggle logic: If clicking the SAME team that is already visible, hide it.
    if (!detailSect.classList.contains('hidden') && detailSect.dataset.currentTeam === team) {
        detailSect.classList.add('hidden');
        return;
    }

    const teamNames = { BB: 'Berbice', PR: 'Providence', RM: 'Remote' };
    const teamIcons = { BB: '🦁', PR: '🐆', RM: '🌐' };
    const colorClass = ahTeamColors[team] || 'slate-500';

    title.innerText = `${teamNames[team]} Team`;
    icon.innerText = teamIcons[team];
    icon.className = `w-16 h-16 rounded-[2rem] flex items-center justify-center text-3xl shadow-2xl bg-${colorClass}/20 text-${colorClass}`;
    
    const filtered = window.agents.filter(a => normalizeTeam(a.team, a.name) === team);
    const totalXfers = filtered.reduce((sum, a) => sum + (Number(a.dailyLeads) || 0), 0);
    
    document.getElementById('ah-team-modal-agents').innerText = filtered.length;
    document.getElementById('ah-team-modal-xfers').innerText = totalXfers;
    document.getElementById('ah-team-modal-avg').innerText = filtered.length ? (totalXfers / filtered.length).toFixed(1) : '0.0';

    list.innerHTML = filtered.sort((a,b) => (Number(b.dailyLeads)||0) - (Number(a.dailyLeads)||0)).map(a => `
        <tr class="hover:bg-white/5 transition border-b border-white/5 last:border-0 text-[11px]">
            <td class="py-3">
                <div class="font-black text-white uppercase">${a.name}</div>
            </td>
            <td class="py-3">
                <span class="flex items-center gap-1.5 text-[9px] font-black uppercase text-green-400">
                    <span class="w-1 h-1 rounded-full bg-green-500"></span>
                    Online
                </span>
            </td>
            <td class="py-3 text-right">
                <div class="font-black text-white italic">${a.dailyLeads || 0}</div>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="3" class="py-10 text-center text-slate-600 font-bold uppercase tracking-widest text-[9px]">No agents found</td></tr>';

    detailSect.classList.remove('hidden');
    detailSect.dataset.currentTeam = team;
    detailSect.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.ahCloseTeamDetail = function() {
    document.getElementById('ah-sect-team-detail').classList.add('hidden');
};

window.ahEditGoal = function() {
    const newGoal = prompt("Enter new Daily Transfer Goal:", "300");
    if (newGoal) {
        // Implementation for persistence coming soon
        alert("Goal updated locally to " + newGoal);
    }
};

// ── COACHING LOGIC ──
window.ahOpenCoachingInline = function() {
    const cAdmin = JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');
    document.getElementById('coach-admin-name').value = cAdmin.name || cAdmin.email || 'Admin';
    document.getElementById('ah-coaching-form').reset();
    document.getElementById('ah-coaching-inline').classList.remove('hidden');
    document.getElementById('ah-coaching-inline').scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.ahCloseCoachingInline = function() {
    document.getElementById('ah-coaching-inline').classList.add('hidden');
};

window.ahHandleCoachingSubmit = async function(e) {
    e.preventDefault();
    const saveBtn = document.getElementById('coach-save-btn');
    const status = document.getElementById('coach-submit-status');
    
    const repName = document.getElementById('coach-rep-name').value;
    const adminName = document.getElementById('coach-admin-name').value;
    const topic = document.getElementById('coach-topic').value;
    const points = document.getElementById('coach-points').value;
    const outcome = document.getElementById('coach-outcome').value;
    
    const agent = (window.agents || []).find(a => a.name === repName);
    const repTeam = agent ? normalizeTeam(agent.team, agent.name) : 'PR';

    const sessionData = {
        repName,
        repTeam,
        adminName,
        topic,
        points,
        outcome
    };

    saveBtn.disabled = true;
    status.innerHTML = '<span class="text-blue-400">Saving...</span>';

    const res = await window.saveCoachingSession(sessionData);
    if (res.success) {
        status.innerHTML = '<span class="text-green-400">✅ Saved Successfully</span>';
        if (typeof window.writeAdminActivityLog === 'function') {
            window.writeAdminActivityLog('coaching', `Logged coaching session for ${repName} on "${topic}"`);
        }
        setTimeout(() => {
            ahCloseCoachingInline();
            saveBtn.disabled = false;
            status.innerHTML = '';
        }, 1500);
    } else {
        status.innerHTML = '<span class="text-red-400">❌ Error Saving</span>';
        saveBtn.disabled = false;
    }
};

window.coachingInit = function() {
    if (window.ahCoachingSubscribed) return;
    if (typeof window.listenToCoaching === 'function') {
        window.listenToCoaching((sessions) => {
            renderCoachingList(sessions);
        });
        window.ahCoachingSubscribed = true;
    }
};

function renderCoachingList(sessions) {
    const list = document.getElementById('ah-coaching-list');
    if (!list) return;

    if (sessions.length === 0) {
        list.innerHTML = '<div class="py-20 text-center text-slate-500 font-bold uppercase tracking-widest border border-dashed border-white/10 rounded-[2.5rem]">No Coaching Sessions Recorded Yet</div>';
        return;
    }

    list.innerHTML = sessions.map(s => {
        const colorClass = ahTeamColors[s.repTeam] || 'slate-500';
        return `
            <div class="glass p-6 rounded-[2rem] border border-white/5 hover:bg-white/5 transition group">
                <div class="flex justify-between items-start mb-4">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center text-xl">📝</div>
                        <div>
                            <h4 class="text-sm font-black text-white uppercase tracking-tight">${s.repName}</h4>
                            <div class="flex gap-2 mt-1">
                                <span class="px-2 py-0.5 rounded bg-${colorClass}/10 text-${colorClass} text-[7px] font-black uppercase tracking-widest">${s.repTeam}</span>
                                <span class="text-[8px] text-slate-500 font-bold uppercase tracking-widest">${new Date(s.timestamp).toLocaleDateString()}</span>
                            </div>
                        </div>
                    </div>
                    <button onclick="ahDeleteSession('coaching_sessions', '${s.id}')" class="text-red-500/30 hover:text-red-500 transition opacity-0 group-hover:opacity-100 p-2"><i class="fas fa-trash"></i></button>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-white/5">
                    <div>
                        <div class="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Topic: ${s.topic}</div>
                        <div class="text-[11px] text-slate-300 leading-relaxed">${s.points || 'No points recorded.'}</div>
                    </div>
                    <div>
                        <div class="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Outcome</div>
                        <div class="text-[11px] text-slate-300 italic">${s.outcome || 'Pending follow-up.'}</div>
                    </div>
                </div>
                <div class="mt-4 text-[7px] text-slate-600 font-bold uppercase tracking-widest text-right">Logged by ${s.adminName}</div>
            </div>
        `;
    }).join('');
}

// ── MONITORING LOGIC ──
window.ahOpenMonitoringInline = function() {
    const cAdmin = JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');
    document.getElementById('mon-admin-name').value = cAdmin.name || cAdmin.email || 'Admin';
    document.getElementById('ah-monitoring-form').reset();
    document.getElementById('ah-monitoring-inline').classList.remove('hidden');
    document.getElementById('ah-monitoring-inline').scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.ahCloseMonitoringInline = function() {
    document.getElementById('ah-monitoring-inline').classList.add('hidden');
};

window.ahHandleMonitoringSubmit = async function(e) {
    e.preventDefault();
    const saveBtn = document.getElementById('mon-save-btn');
    const status = document.getElementById('mon-submit-status');
    
    const repName = document.getElementById('mon-rep-name').value;
    const adminName = document.getElementById('mon-admin-name').value;
    const tone = document.getElementById('mon-score-tone').value;
    const script = document.getElementById('mon-score-script').value;
    const points = document.getElementById('mon-coaching-pts').value;
    
    const agent = (window.agents || []).find(a => a.name === repName);
    const repTeam = agent ? normalizeTeam(agent.team, agent.name) : 'PR';

    const sessionData = {
        repName,
        repTeam,
        adminName,
        scores: { tone, script },
        points
    };

    saveBtn.disabled = true;
    status.innerHTML = '<span class="text-blue-400">Saving...</span>';

    const res = await window.saveMonitoringSession(sessionData);
    if (res.success) {
        status.innerHTML = '<span class="text-green-400">✅ QA Logged</span>';
        if (typeof window.writeAdminActivityLog === 'function') {
            window.writeAdminActivityLog('monitoring', `Logged QA check for ${repName}`);
        }
        setTimeout(() => {
            ahCloseMonitoringInline();
            saveBtn.disabled = false;
            status.innerHTML = '';
        }, 1500);
    } else {
        status.innerHTML = '<span class="text-red-400">❌ Error</span>';
        saveBtn.disabled = false;
    }
};

window.monitoringInit = function() {
    if (window.ahMonitoringSubscribed) return;
    if (typeof window.listenToMonitoring === 'function') {
        window.listenToMonitoring((sessions) => {
            renderMonitoringList(sessions);
        });
        window.ahMonitoringSubscribed = true;
    }
};

function renderMonitoringList(sessions) {
    const list = document.getElementById('ah-monitoring-list');
    if (!list) return;

    if (sessions.length === 0) {
        list.innerHTML = '<div class="py-20 text-center text-slate-500 font-bold uppercase tracking-widest border border-dashed border-white/10 rounded-[2.5rem]">No QA Checks Logged Yet</div>';
        return;
    }

    list.innerHTML = sessions.map(s => {
        const colorClass = ahTeamColors[s.repTeam] || 'slate-500';
        const avg = ((Number(s.scores.tone) + Number(s.scores.script)) / 2).toFixed(1);
        return `
            <div class="glass p-6 rounded-[2rem] border border-white/5 hover:bg-white/5 transition group">
                <div class="flex justify-between items-start mb-4">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 rounded-2xl bg-cyan-500/10 flex items-center justify-center text-xl">🎧</div>
                        <div>
                            <h4 class="text-sm font-black text-white uppercase tracking-tight">${s.repName}</h4>
                            <div class="flex gap-2 mt-1">
                                <span class="px-2 py-0.5 rounded bg-${colorClass}/10 text-${colorClass} text-[7px] font-black uppercase tracking-widest">${s.repTeam}</span>
                                <span class="text-[8px] text-slate-500 font-bold uppercase tracking-widest">${new Date(s.timestamp).toLocaleDateString()}</span>
                            </div>
                        </div>
                    </div>
                    <div class="text-right">
                        <div class="text-[14px] font-black text-cyan-400 italic">${avg}/5.0</div>
                        <div class="text-[7px] text-slate-600 font-black uppercase tracking-tighter">QA SCORE</div>
                    </div>
                </div>
                <div class="mt-4 pt-4 border-t border-white/5">
                    <div class="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Primary Feedback</div>
                    <div class="text-[11px] text-slate-300 leading-relaxed">${s.points || 'Standard quality maintained.'}</div>
                </div>
                <div class="mt-4 flex justify-between items-center">
                    <div class="text-[7px] text-slate-600 font-bold uppercase tracking-widest">Logged by ${s.adminName}</div>
                    <button onclick="ahDeleteSession('monitoring_sessions', '${s.id}')" class="text-red-500/30 hover:text-red-500 transition opacity-0 group-hover:opacity-100 text-[10px]"><i class="fas fa-trash mr-1"></i> Delete</button>
                </div>
            </div>
        `;
    }).join('');
}

// ── ADMIN TOOLS LOGIC ──
let ahtCurrentSubTab = 'resources';

window.switchAhToolsSubTab = function(sub) {
    const subs = ['resources', 'logs', 'users', 'performance'];
    subs.forEach(s => {
        const sect = document.getElementById('aht-sect-' + s);
        const tab = document.getElementById('aht-tab-' + s);
        if (sect) sect.classList.add('hidden');
        if (tab) {
            tab.classList.remove('bg-cyan-500', 'text-white', 'shadow-lg', 'shadow-cyan-900/40');
            tab.classList.add('text-slate-400');
        }
    });

    const activeSect = document.getElementById('aht-sect-' + sub);
    const activeTab = document.getElementById('aht-tab-' + sub);

    // Role check for 'users' sub-tab
    const cAdmin = JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');
    const isSuper = cAdmin.role === 'super_admin' || cAdmin.isSuper;
    if (sub === 'users' && !isSuper) {
        switchAhToolsSubTab('resources');
        return;
    }

    if (activeSect) activeSect.classList.remove('hidden');
    if (activeTab) {
        activeTab.classList.remove('text-slate-400');
        activeTab.classList.add('bg-cyan-500', 'text-white', 'shadow-lg', 'shadow-cyan-900/40');
    }

    if (sub === 'logs') listenForActivityLogs(renderAhLogs);
    if (sub === 'users') ahToolsLoadUsers();
    if (sub === 'performance') ahToolsLoadPerformance();
};

function ahAdminToolsInit() {
    const cAdmin = JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');
    const isSuper = cAdmin.role === 'super_admin' || cAdmin.isSuper;
    
    // Auto-cleanup legacy data once on init
    if (typeof window.ahPruneOldReports === 'function') {
        window.ahPruneOldReports();
    }

    const userTabBtn = document.getElementById('aht-tab-users');
    if (userTabBtn) {
        if (isSuper) userTabBtn.classList.remove('hidden');
        else userTabBtn.classList.add('hidden');
    }
    
    switchAhToolsSubTab('resources');
}

function ahToolsLoadLogs() {
    const container = document.getElementById('ah-activity-logs');
    if (!container) return;

    if (typeof window.listenToActivityLogs === 'function') {
        window.listenToActivityLogs((logs) => {
            renderAhLogs(logs);
        });
    } else {
        // Fallback to localStorage if Firebase listener isn't ready
        const logs = JSON.parse(localStorage.getItem('biz_activity_logs_v1') || '[]');
        renderAhLogs(logs);
    }
}

function renderAhLogs(logs) {
    const container = document.getElementById('ah-activity-logs');
    if (!container) return;

    if (logs.length === 0) {
        container.innerHTML = '<div class="py-20 text-center text-slate-600 font-bold uppercase text-[10px] tracking-widest">Audit trail is currently empty</div>';
        return;
    }

    window.ahCurrentLogs = logs; 
    container.innerHTML = logs.slice(0, 100).map((log, idx) => {
        const date = new Date(log.timestamp);
        const timeStr = date.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });
        const dateStr = date.toLocaleDateString('en-US', { month:'short', day:'numeric' });
        
        return `
            <div class="p-4 hover:bg-white/5 transition flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 last:border-0 group">
                <div class="flex items-center gap-4">
                    <div class="text-[9px] font-black text-slate-500 w-12 text-right flex-shrink-0">${timeStr}<br>${dateStr}</div>
                    <div>
                        <div class="text-[11px] font-black text-white uppercase group-hover:text-cyan-400 transition-colors">${log.name}</div>
                        <div class="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">${(log.action || '').replace(/_/g, ' ')}</div>
                    </div>
                </div>
                <div class="text-[10px] text-slate-300 bg-black/40 px-3 py-2 rounded-xl border border-white/5 max-w-md whitespace-normal leading-relaxed">${log.details || ''}</div>
            </div>
        `;
    }).join('');
}

window.ahShowLogDetail = function(id) {
    const modal = document.getElementById('ah-log-detail-modal');
    if (!modal || !window.ahCurrentLogs) return;

    const log = window.ahCurrentLogs.find(l => (l.id === id || window.ahCurrentLogs.indexOf(l) == id));
    if (!log) return;

    const date = new Date(log.timestamp);
    
    document.getElementById('ah-log-modal-id').textContent = `Log ID: ${id.length > 10 ? id.substring(0,8) + '...' : id}`;
    document.getElementById('ah-log-modal-name').textContent = log.name;
    document.getElementById('ah-log-modal-role').textContent = log.role || 'Admin';
    document.getElementById('ah-log-modal-time').textContent = date.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
    document.getElementById('ah-log-modal-date').textContent = date.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
    document.getElementById('ah-log-modal-action').textContent = (log.action || '').replace(/_/g, ' ');

    let detailsStr = log.details || 'No additional data';
    if (typeof log.details === 'object') {
        detailsStr = JSON.stringify(log.details, null, 2);
    }
    document.getElementById('ah-log-modal-details').textContent = detailsStr;

    modal.classList.remove('hidden');
};

window.ahCloseLogModal = function() {
    const modal = document.getElementById('ah-log-detail-modal');
    if (modal) modal.classList.add('hidden');
};

function ahToolsLoadUsers() {
    const list = document.getElementById('ah-admins-list');
    if (!list) return;

    const admins = JSON.parse(localStorage.getItem('biz_admins_list_v1') || '{}');
    const adminArray = Object.values(admins).filter(a => a && a.email);

    if (adminArray.length === 0) {
        list.innerHTML = '<div class="py-10 text-center text-slate-600 font-bold uppercase text-[9px] tracking-widest">No regular administrators found</div>';
        return;
    }

    list.innerHTML = adminArray.map(admin => `
        <div class="bg-white/5 border border-white/5 p-4 rounded-2xl flex justify-between items-center group">
            <div>
                <div class="text-[11px] font-black text-white uppercase">${admin.name}</div>
                <div class="text-[9px] text-slate-500 font-bold">${admin.email}</div>
                <div class="mt-2 text-[7px] font-black uppercase tracking-widest ${admin.role === 'super_admin' ? 'text-yellow-500' : 'text-cyan-400'}">${admin.role.replace('_', ' ')}</div>
            </div>
            <button onclick="ahRemoveAdmin('${admin.email}')" class="text-red-500/20 group-hover:text-red-500 transition p-2"><i class="fas fa-user-minus"></i></button>
        </div>
    `).join('');
}

window.ahAddNewAdmin = function(e) {
    e.preventDefault();
    const name = document.getElementById('aht-new-name').value;
    const email = document.getElementById('aht-new-id').value;
    const pass = document.getElementById('aht-new-pass').value;
    const role = document.getElementById('aht-new-role').value;
    const status = document.getElementById('aht-add-status');

    if (typeof window.addNewAdmin === 'function') {
        const res = window.addNewAdmin(email, pass, name, role);
        if (res.success) {
            status.innerHTML = '<span class="text-green-400">✅ Authorized successfully</span>';
            e.target.reset();
            ahToolsLoadUsers();
            setTimeout(() => status.innerHTML = '', 3000);
        } else {
            status.innerHTML = `<span class="text-red-400">❌ ${res.error}</span>`;
        }
    }
};

window.ahRemoveAdmin = function(email) {
    if (!confirm(`Revoke all privileges for ${email}?`)) return;
    if (typeof window.removeAdmin === 'function') {
        const res = window.removeAdmin(email);
        if (res.success) ahToolsLoadUsers();
        else alert(res.error);
    }
};

window.ahDeleteSession = async function(coll, id) {
    if (!confirm("Are you sure you want to delete this record?")) return;
    await window.deleteSession(coll, id);
};

// Ensure init runs when tab switches
window.switchTab = (function(orig) {
    return function(tab) {
        if (tab === 'adminpanel') setTimeout(ahAdminToolsInit, 100);
        return orig.apply(this, arguments);
    };
})(window.switchTab || function(){});

window.ahToolsLoadPerformance = function() {
    const tbody = document.getElementById('ah-performance-table-body');
    const empty = document.getElementById('ah-perf-empty');
    if (!tbody) return;

    if (typeof window.listenForAgentReports === 'function') {
        window.listenForAgentReports(reports => {
            if (!reports || !reports.length) {
                if(empty) empty.classList.remove('hidden');
                tbody.innerHTML = '';
                return;
            }
            if(empty) empty.classList.add('hidden');

            // 1. Determine "Current Week" (Monday start)
            const now = new Date();
            const day = now.getDay(); 
            const diff = now.getDate() - day + (day === 0 ? -6 : 1); 
            const monday = new Date(now.setDate(diff));
            monday.setHours(0,0,0,0);
            
            const sunday = new Date(monday);
            sunday.setDate(monday.getDate() + 6);
            sunday.setHours(23,59,59,999);

            const rangeEl = document.getElementById('ah-perf-range');
            if(rangeEl) rangeEl.textContent = `Tracking: ${monday.toLocaleDateString()} — ${sunday.toLocaleDateString()}`;

            // 2. Filter reports for this week
            const thisWeekReports = reports.filter(r => {
                const rd = new Date(r.uploadedAt);
                return rd >= monday && rd <= sunday;
            });

            // 3. Aggregate by agent and weekday
            const matrix = {}; 
            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

            thisWeekReports.forEach(r => {
                const reportDay = days[new Date(r.uploadedAt).getDay()];
                (r.data || []).forEach(a => {
                    const name = a.agentName;
                    if (!matrix[name]) {
                        matrix[name] = { team: a.team || '—', Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, total: 0 };
                    }
                    // Aggregate counts for that day
                    matrix[name][reportDay] = (matrix[name][reportDay] || 0) + (a.dailyLeads || 0);
                    matrix[name].total += (a.dailyLeads || 0);
                });
            });

            // 4. Render
            const sorted = Object.keys(matrix).sort((a,b) => matrix[b].total - matrix[a].total);
            tbody.innerHTML = sorted.map(name => {
                const m = matrix[name];
                return `
                    <tr class="hover:bg-white/5 transition-colors group border-b border-white/5 last:border-0">
                        <td class="py-4 px-2">
                            <div class="text-[11px] font-black text-white uppercase group-hover:text-cyan-400 transition-colors">${name}</div>
                        </td>
                        <td class="py-4 px-2">
                            <span class="text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${m.team==='BB'?'bg-purple-500/10 text-purple-400 border border-purple-500/20':'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'}">${m.team}</span>
                        </td>
                        <td class="py-4 px-2 text-center text-[10px] font-bold ${m.Mon>0?'text-white':'text-slate-700'}">${m.Mon || '—'}</td>
                        <td class="py-4 px-2 text-center text-[10px] font-bold ${m.Tue>0?'text-white':'text-slate-700'}">${m.Tue || '—'}</td>
                        <td class="py-4 px-2 text-center text-[10px] font-bold ${m.Wed>0?'text-white':'text-slate-700'}">${m.Wed || '—'}</td>
                        <td class="py-4 px-2 text-center text-[10px] font-bold ${m.Thu>0?'text-white':'text-slate-700'}">${m.Thu || '—'}</td>
                        <td class="py-4 px-2 text-center text-[10px] font-bold ${m.Fri>0?'text-white':'text-slate-700'}">${m.Fri || '—'}</td>
                        <td class="py-4 px-2 text-center text-[10px] font-bold ${m.Sat>0?'text-white':'text-slate-700'}">${m.Sat || '—'}</td>
                        <td class="py-4 px-2 text-right">
                            <span class="text-sm font-black text-cyan-400 italic">${m.total}</span>
                        </td>
                    </tr>
                `;
            }).join('');
        });
    }
};

window.ahSyncRosterFromSheet = async function() {
    console.log('[AdminHub] Syncing roster from Google Sheet...');
    try {
        const resp = await fetch(`${API_URL}?action=getRoster`);
        const roster = await resp.json();
        
        if (Array.isArray(roster) && roster.length > 0) {
            console.log(`[AdminHub] Successfully pulled ${roster.length} agents from Sheet.`);
            window.allAgentProfiles = roster;
            

            // Refresh currently visible tabs immediately
            if (window.ahCurrentSubTab === 'overview' || !window.ahCurrentSubTab) {
                handleLiveStateUpdate({ agents: window.agents || [] });
            }
            if (window.ahCurrentSubTab === 'attendance') {
                renderDailyAttendance();
            }
            if (window.ahCurrentSubTab === 'zero') {
                ahInitZeroPerf();
            }
        }
    } catch (e) {
        console.error('[AdminHub] Roster sync failed:', e);
    }
};
