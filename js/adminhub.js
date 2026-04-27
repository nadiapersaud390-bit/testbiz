/**
 * js/adminhub.js
 * Core logic for the Admin Panel Hub system - FULLY OPTIMIZED with Weekly Performance Dropdown
 */

let ahCurrentSubTab = 'overview';
let ahZeroPerfInitialized = false; // Lazy load flag
let ahSelectedWeek = 'current'; // Track selected week for performance view
let ahAvailableWeeks = []; // Store available weeks for dropdown
let ahAllAgentsWeeklyData = []; // Store all agents weekly performance

const ahTeamColors = {
    BB: 'blue-500',
    PR: 'purple-500',
    RM: 'cyan-400'
};

// IDs that can log in but receive ZERO admin features
window._RESTRICTED_ADMIN_IDS = ['0000'];

// Helper function to check permissions based on admin email
function getAdminPermissions(adminEmail) {
    const email = String(adminEmail || '').toLowerCase();
    
    // Restricted IDs (e.g. 0000) can log in but see NO admin features
    const restricted = (window._RESTRICTED_ADMIN_IDS || ['0000']).map(s => String(s).toLowerCase());
    if (restricted.includes(email)) {
        return {
            isSuper: false,
            canSeeStats: false,
            canSeeAdminTools: false,
            canSeeTrivia: false,
            canSeeSuper: false
        };
    }
    
    if (email === 'rose') {
        return {
            isSuper: true,
            canSeeStats: true,
            canSeeAdminTools: true,
            canSeeTrivia: true,
            canSeeSuper: true
        };
    }
    
    if (email === 'momo') {
        return {
            isSuper: false,
            canSeeStats: true,
            canSeeAdminTools: true,
            canSeeTrivia: true,
            canSeeSuper: false
        };
    }
    
    return {
        isSuper: false,
        canSeeStats: false,
        canSeeAdminTools: false,
        canSeeTrivia: false,
        canSeeSuper: false
    };
}

// Internal tab switcher
window.switchAdminHubTab = function(tabId) {
    const currentAdmin = JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');
    const permissions = getAdminPermissions(currentAdmin.email);
    
    if (tabId === 'admintools' && !permissions.canSeeAdminTools) {
        console.warn('Unauthorized access to Admin Tools blocked.');
        return;
    }
    if (tabId === 'stats' && !permissions.canSeeStats) {
        console.warn('Unauthorized access to Agent Stats blocked.');
        return;
    }
    if (tabId === 'trivia' && !permissions.canSeeTrivia) {
        console.warn('Unauthorized access to Trivia blocked.');
        return;
    }
    if (tabId === 'super' && !permissions.canSeeSuper) {
        console.warn('Unauthorized access to Super Admin blocked.');
        return;
    }

    ahCurrentSubTab = tabId;
    
    document.querySelectorAll('.ah-nav-btn, .ah-nav-btn-special').forEach(btn => {
        btn.classList.remove('active');
        if (btn.id === `ah-tab-${tabId}`) btn.classList.add('active');
    });
    
    document.querySelectorAll('.ah-section').forEach(sect => {
        sect.classList.add('hidden');
    });
    const target = document.getElementById(`ah-sect-${tabId}`);
    if (target) target.classList.remove('hidden');
    
    // Lazy load expensive modules only when clicked
    if (tabId === 'profiles' && typeof window.initAgentProfiles === 'function') window.initAgentProfiles();
    if (tabId === 'stats' && typeof window.renderAgentStatsHistory === 'function') window.renderAgentStatsHistory();
    if (tabId === 'coaching' && typeof window.coachingInit === 'function') window.coachingInit();
    if (tabId === 'monitoring' && typeof window.monitoringInit === 'function') window.monitoringInit();
    if (tabId === 'rebuttals') initRebuttalIntel();
    if (tabId === 'performance') initWeeklyPerformance();
    if (tabId === 'admintools') ahAdminToolsInit();
    
    // Only initialize Zero Performance when the tab is actually clicked
    if (tabId === 'zero' && !ahZeroPerfInitialized) {
        ahInitZeroPerfLazy();
        ahZeroPerfInitialized = true;
    }
};

// Lazy-loaded version of Zero Performance (only runs when clicked)
function ahInitZeroPerfLazy() {
    console.log('[AdminHub] Loading Zero Performance tab...');
    const dailyList = document.getElementById('ah-zero-daily-list');
    const weeklyList = document.getElementById('ah-zero-weekly-list');
    if (!dailyList || !weeklyList) return;

    dailyList.innerHTML = '<div class="py-10 text-center text-cyan-400 font-bold uppercase text-[9px] tracking-widest"><i class="fas fa-spinner fa-spin mr-2"></i> Loading daily data...</div>';
    weeklyList.innerHTML = '<div class="py-10 text-center text-cyan-400 font-bold uppercase text-[9px] tracking-widest"><i class="fas fa-spinner fa-spin mr-2"></i> Loading weekly data...</div>';

    setTimeout(() => {
        const roster = window.allAgentProfiles || [];
        const liveAgents = window.agents || [];
        const reportsList = window.allAgentReports || [];

        function getCount(p, countMap) {
            const id1 = String(p.ytelId || '').trim();
            const id2 = String(p.userId || '').trim();
            const name = (p.name || p.fullName || '').trim().toUpperCase();
            
            if (id1 && countMap[id1] !== undefined) return countMap[id1];
            if (id2 && countMap[id2] !== undefined) return countMap[id2];
            if (name && countMap[name]) return countMap[name];
            return 0;
        }

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

        function countXfers(rows) {
            const map = {};
            (rows || []).forEach(row => {
                const uid = String(row.agentId || '').trim();
                if (!uid) return;
                // Skip PH training accounts
                const rawName = row.rawName || row.agentName || '';
                if (/^PH(?![A-Za-z])/i.test(rawName)) return;
                if (!map[uid]) map[uid] = 0;
                if (String(row.status || row.currentStatus || row['Current Status'] || '').toUpperCase() === 'XFER') map[uid]++;
            });
            return map;
        }

        function renderRow(p, xfers, hasUpload, isWeekly) {
            const team = p.team || 'PR';
            const hasXfer = xfers > 0;
            const dotColor = hasXfer ? 'bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]' : 'bg-slate-700';
            const xferColor = hasXfer ? 'text-cyan-400' : (isWeekly ? 'text-orange-400' : 'text-red-400');
            let xferLabel;
            if (!hasUpload) xferLabel = '—';
            else if (hasXfer) xferLabel = `${xfers} XFER${xfers !== 1 ? 'S' : ''}`;
            else xferLabel = isWeekly ? '0 WEEKLY XFERS' : '0 XFERS';

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

        function getDailyCount(p) {
            const pId = String(p.userId || '').trim();
            const pName = String(p.fullName || '').trim().toUpperCase();
            const live = liveAgents.find(a => String(a.ytelId).trim() === pId || (a.name && a.name.toUpperCase() === pName));
            if (live) return Number(live.dailyLeads) || 0;

            const todayReport = reportsList.find(r => r.reportDate === todayStr());
            if (todayReport) {
                const row = todayReport.data.find(d => String(d.agentId).trim() === pId || (d.agentName && d.agentName.toUpperCase() === pName));
                return row ? (Number(row.dailyLeads) || 0) : 0;
            }
            return 0;
        }

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

        const mon = weekStart();
        const weekReports = reportsList.filter(r => {
            const d = parseReportDate(r.reportDate);
            return d && d >= mon;
        });

        if (weekReports.length === 0) {
            weeklyList.innerHTML = '<div class="py-10 text-center text-slate-600 font-bold uppercase text-[9px] tracking-widest">Awaiting this week\'s report upload...</div>';
        } else {
            const weeklyCounts = {};
            weekReports.forEach(r => {
                const day = countXfers(r.data);
                Object.entries(day).forEach(([uid, n]) => {
                    weeklyCounts[uid] = (weeklyCounts[uid] || 0) + n;
                });
            });

            const zeros = roster.filter(p => getCount(p, weeklyCounts) === 0);
            if (zeros.length === 0) {
                weeklyList.innerHTML = '<div class="py-10 text-center text-green-500 font-bold uppercase text-[9px] tracking-widest">✅ All agents have transfers this week!</div>';
            } else {
                weeklyList.innerHTML = zeros.map(p => renderRow(p, 0, true, true)).join('');
            }
        }
    }, 50);
}

// ========== UPDATED WEEKLY PERFORMANCE WITH DROPDOWN AND ALL AGENTS TABLE ==========
function initWeeklyPerformance() {
    // Build available weeks from reports
    buildAvailableWeeks();
    
    // Populate dropdown
    populateWeekDropdown();
    
    // Load current week data by default
    loadWeeklyDataForWeek('current');
}

function getReportActualDate(report) {
    // Priority: reportDate (actual CSV date) > filename date > uploadedAt (upload timestamp - least reliable)
    if (report.reportDate) {
        const d = new Date(report.reportDate);
        if (!isNaN(d.getTime())) return d;
    }
    // Try to parse date from filename e.g. xfer_report04_20_2026.csv
    if (report.filename) {
        const m = report.filename.match(/(\d{2})_(\d{2})_(\d{4})/);
        if (m) {
            const d = new Date(`${m[3]}-${m[1]}-${m[2]}`);
            if (!isNaN(d.getTime())) return d;
        }
    }
    // Fallback to uploadedAt
    return new Date(report.uploadedAt);
}

function buildAvailableWeeks() {
    const reports = window.allAgentReports || [];
    if (!reports.length) {
        ahAvailableWeeks = [];
        return;
    }
    
    // Get unique weeks from reports — use ACTUAL report date, not upload timestamp
    const weekMap = new Map();
    
    reports.forEach(report => {
        const reportDate = getReportActualDate(report);
        if (isNaN(reportDate.getTime())) return;
        // Get the Monday of that week
        const day = reportDate.getDay();
        const diff = (day === 0 ? -6 : 1) - day;
        const monday = new Date(reportDate);
        monday.setDate(reportDate.getDate() + diff);
        monday.setHours(0, 0, 0, 0);
        
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);
        
        const weekKey = monday.toISOString().split('T')[0];
        const weekLabel = `${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
        
        if (!weekMap.has(weekKey)) {
            weekMap.set(weekKey, { key: weekKey, label: weekLabel, monday: monday, sunday: sunday });
        }
    });
    
    // Convert to array and sort by date descending (newest first)
    ahAvailableWeeks = Array.from(weekMap.values())
        .sort((a, b) => b.monday - a.monday);
}

function populateWeekDropdown() {
    const dropdown = document.getElementById('ah-week-select');
    if (!dropdown) return;
    
    // Get current week label
    const now = new Date();
    const currentDay = now.getDay();
    const daysToMonday = currentDay === 0 ? 6 : currentDay - 1;
    const currentMonday = new Date(now);
    currentMonday.setDate(now.getDate() - daysToMonday);
    currentMonday.setHours(0, 0, 0, 0);
    const currentSunday = new Date(currentMonday);
    currentSunday.setDate(currentMonday.getDate() + 6);
    const currentWeekLabel = `${currentMonday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${currentSunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    
    let options = `<option value="current" selected>📅 Current Week (${currentWeekLabel})</option>`;
    
    ahAvailableWeeks.forEach(week => {
        options += `<option value="${week.key}">📊 ${week.label}</option>`;
    });
    
    dropdown.innerHTML = options;
    
    // Add event listener if not already added
    if (!dropdown._hasListener) {
        dropdown.addEventListener('change', (e) => {
            ahSelectedWeek = e.target.value;
            loadWeeklyDataForWeek(ahSelectedWeek);
        });
        dropdown._hasListener = true;
    }
}

async function loadWeeklyDataForWeek(weekKey) {
    const reports = window.allAgentReports || [];
    const roster = window.allAgentProfiles || [];
    
    let weekStart, weekEnd;
    let weekLabel = '';
    
    if (weekKey === 'current') {
        // Current week
        const now = new Date();
        const currentDay = now.getDay();
        const daysToMonday = currentDay === 0 ? 6 : currentDay - 1;
        weekStart = new Date(now);
        weekStart.setDate(now.getDate() - daysToMonday);
        weekStart.setHours(0, 0, 0, 0);
        weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);
        weekLabel = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    } else {
        // Selected historical week
        const weekInfo = ahAvailableWeeks.find(w => w.key === weekKey);
        if (weekInfo) {
            weekStart = weekInfo.monday;
            weekEnd = weekInfo.sunday;
            weekLabel = weekInfo.label;
        } else {
            console.warn('Week not found:', weekKey);
            return;
        }
    }
    
    // Update range display
    const rangeEl = document.getElementById('ah-weekly-range');
    if (rangeEl) {
        rangeEl.innerText = weekLabel;
    }
    
    // Filter reports for this week using ACTUAL report date (not upload timestamp)
    const weekReportsRaw = reports.filter(r => {
        const actualDate = getReportActualDate(r);
        return actualDate >= weekStart && actualDate <= weekEnd;
    });
    
    // Deduplicate: Keep only the latest-uploaded report per actual calendar date
    // This prevents double-counting re-uploads of the same day while keeping all days
    const dayMap = new Map();
    weekReportsRaw.forEach(report => {
        // Always derive dateKey from the ACTUAL report date, never uploadedAt
        const actualDate = getReportActualDate(report);
        const dateKey = `${actualDate.getFullYear()}-${String(actualDate.getMonth()+1).padStart(2,'0')}-${String(actualDate.getDate()).padStart(2,'0')}`;
        
        const existing = dayMap.get(dateKey);
        // If same day was uploaded multiple times, keep the most recently uploaded one
        if (!existing || new Date(report.uploadedAt) > new Date(existing.uploadedAt)) {
            dayMap.set(dateKey, report);
        }
    });
    const weekReports = Array.from(dayMap.values());
    
    // Calculate team totals — accumulate ALL days in the week
    const teamTotals = { PR: 0, BB: 0, RM: 0 };
    const agentWeeklyMap = new Map(); // agent key -> { name, team, transfers }
    
    weekReports.forEach(report => {
        (report.data || []).forEach(row => {
            const agentName = row.agentName || row.name || row['Agent Name'] || '';
            if (!agentName) return;
            const rawName = row.rawName || agentName;
            
            // Skip PH training accounts that slipped into old Firebase records
            if (/^PH(?![A-Za-z])/i.test(rawName)) return;
            
            // Use stored team field first (set by parser), fall back to normalizeTeam
            const team = row.team || normalizeTeam(row.team, rawName);
            
            // Check XFER status — try every possible field name the CSV parser may have used
            const statusVal = String(
                row.status || row.currentStatus || row['Current Status'] ||
                row.currentstatus || row.Status || ''
            ).toUpperCase().trim();
            const isXfer = statusVal === 'XFER';
            
            // leadCount: 1 per confirmed XFER, or fall back to dailyLeads for live data
            const leadCount = isXfer ? 1 : (Number(row.dailyLeads) || 0);
            
            if (leadCount > 0) {
                teamTotals[team] = (teamTotals[team] || 0) + leadCount;
                
                // Use agentId as key if available (most reliable), else name-based key
                const cleanKey = row.agentId
                    ? String(row.agentId).trim()
                    : String(agentName).replace(/^(GYP|GYB|PH|GTM|RM)\s+/i, '').trim().toUpperCase();
                
                if (!agentWeeklyMap.has(cleanKey)) {
                    agentWeeklyMap.set(cleanKey, {
                        name: agentName,
                        team: team,
                        transfers: 0,
                        rawName: rawName
                    });
                }
                agentWeeklyMap.get(cleanKey).transfers += leadCount;
            }
        });
    });
    
    // Also include agents from roster with 0 transfers
    roster.forEach(agent => {
        const agentName = agent.fullName || agent.name;
        if (!agentWeeklyMap.has(agentName)) {
            agentWeeklyMap.set(agentName, {
                name: agentName,
                team: agent.team || normalizeTeam('', agentName),
                transfers: 0,
                rawName: agentName
            });
        }
    });
    
    // Convert to array and sort by transfers (highest first)
    ahAllAgentsWeeklyData = Array.from(agentWeeklyMap.values())
        .sort((a, b) => b.transfers - a.transfers);
    
    // Render team rankings
    renderWeeklyTeamRankings(teamTotals);
    
    // Render top 5 agents
    renderWeeklyTopAgents(ahAllAgentsWeeklyData.slice(0, 5));
    
    // Render all agents table
    renderAllAgentsWeeklyTable(ahAllAgentsWeeklyData);
}

function renderWeeklyTeamRankings(teamTotals) {
    const list = document.getElementById('ah-weekly-team-list');
    if (!list) return;
    
    const teams = [
        { name: 'Providence', code: 'PR', xfers: teamTotals.PR || 0, color: 'purple-500' },
        { name: 'Berbice', code: 'BB', xfers: teamTotals.BB || 0, color: 'blue-500' },
        { name: 'Remote', code: 'RM', xfers: teamTotals.RM || 0, color: 'cyan-400' }
    ].sort((a, b) => b.xfers - a.xfers);
    
    const max = teams[0].xfers || 1;
    
    list.innerHTML = teams.map((t, i) => `
        <div class="relative mb-4">
            <div class="flex justify-between items-center mb-2">
                <div class="flex items-center gap-3">
                    <span class="text-xl font-black text-slate-700">${i+1}</span>
                    <div>
                        <div class="text-[12px] font-black text-white uppercase tracking-tight">${t.name}</div>
                        <div class="text-[8px] text-${t.color} font-bold uppercase tracking-widest">${t.code} TEAM</div>
                    </div>
                </div>
                <div class="text-right">
                    <div class="text-lg font-black text-white italic">${t.xfers} <span class="text-[9px] text-slate-500 not-italic">Xfers</span></div>
                </div>
            </div>
            <div class="h-3 bg-white/5 rounded-full overflow-hidden p-0.5 border border-white/5">
                <div class="h-full bg-${t.color} rounded-full transition-all duration-1000" style="width: ${(t.xfers/max)*100}%"></div>
            </div>
        </div>
    `).join('');
}

function renderWeeklyTopAgents(topAgents) {
    const list = document.getElementById('ah-weekly-agent-list');
    if (!list) return;
    
    if (topAgents.length === 0) {
        list.innerHTML = '<div class="py-10 text-center text-slate-600 font-bold uppercase text-[9px] tracking-widest">No agent data available</div>';
        return;
    }
    
    list.innerHTML = topAgents.map((a, i) => {
        const color = ahTeamColors[a.team] || 'slate-500';
        return `
            <div class="flex items-center gap-4 bg-white/5 border border-white/5 p-3 rounded-2xl hover:bg-white/10 transition group">
                <div class="w-8 h-8 rounded-xl bg-black/40 flex items-center justify-center font-black text-[10px] text-slate-500 group-hover:text-white transition">${i+1}</div>
                <div class="flex-1 overflow-hidden">
                    <div class="text-[11px] font-black text-white uppercase truncate">${a.name}</div>
                    <div class="text-[7px] text-${color} font-bold uppercase tracking-widest">${a.team}</div>
                </div>
                <div class="text-right">
                    <div class="text-[12px] font-black text-white italic">${a.transfers}</div>
                    <div class="text-[7px] text-slate-600 font-bold uppercase tracking-tighter">XFERS</div>
                </div>
            </div>
        `;
    }).join('');
}

function renderAllAgentsWeeklyTable(allAgents) {
    const container = document.getElementById('ah-weekly-agents-table-container');
    if (!container) return;
    
    if (allAgents.length === 0) {
        container.innerHTML = '<div class="py-10 text-center text-slate-500">No agent data available for this week</div>';
        return;
    }
    
    // Split into teams for organized display
    const prAgents = allAgents.filter(a => a.team === 'PR').sort((a, b) => b.transfers - a.transfers);
    const bbAgents = allAgents.filter(a => a.team === 'BB').sort((a, b) => b.transfers - a.transfers);
    const rmAgents = allAgents.filter(a => a.team === 'RM').sort((a, b) => b.transfers - a.transfers);
    const otherAgents = allAgents.filter(a => !['PR', 'BB', 'RM'].includes(a.team)).sort((a, b) => b.transfers - a.transfers);
    
    let html = `
        <div class="space-y-6">
            ${renderTeamTable('🦁 Berbice (BB)', bbAgents, 'blue-500')}
            ${renderTeamTable('🐆 Providence (PR)', prAgents, 'purple-500')}
            ${renderTeamTable('🌐 Remote (RM)', rmAgents, 'cyan-400')}
            ${otherAgents.length > 0 ? renderTeamTable('📌 Other Teams', otherAgents, 'slate-500') : ''}
        </div>
    `;
    
    container.innerHTML = html;
}

function renderTeamTable(title, agents, colorClass) {
    if (agents.length === 0) return '';
    
    return `
        <div class="glass rounded-2xl border border-white/5 overflow-hidden">
            <div class="bg-${colorClass}/10 px-4 py-3 border-b border-white/5">
                <h4 class="text-sm font-black text-${colorClass} uppercase tracking-widest">${title}</h4>
                <p class="text-[9px] text-slate-500">${agents.length} agents • ${agents.reduce((sum, a) => sum + a.transfers, 0)} total transfers</p>
            </div>
            <div class="overflow-x-auto max-h-[400px] overflow-y-auto">
                <table class="w-full text-left">
                    <thead class="sticky top-0 bg-black/80">
                        <tr class="text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-white/5">
                            <th class="p-3">Rank</th>
                            <th class="p-3">Agent Name</th>
                            <th class="p-3 text-center">Team</th>
                            <th class="p-3 text-right">Weekly Xfers</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-white/5">
                        ${agents.map((agent, idx) => `
                            <tr class="hover:bg-white/5 transition group text-[11px]">
                                <td class="p-3 text-slate-500 font-black">${idx + 1}</td>
                                <td class="p-3 font-bold text-white uppercase">${escapeHtml(agent.name)}</td>
                                <td class="p-3 text-center">
                                    <span class="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest bg-${colorClass}/10 text-${colorClass} border border-${colorClass}/20">${agent.team}</span>
                                </td>
                                <td class="p-3 text-right">
                                    <span class="text-lg font-black text-${colorClass} italic">${agent.transfers}</span>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// Helper function to escape HTML
function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

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

    const counts = {};
    usage.forEach(u => {
        counts[u.rebuttalTitle] = (counts[u.rebuttalTitle] || 0) + 1;
    });

    const sorted = Object.entries(counts).sort((a,b) => b[1] - a[1]);
    const top5 = sorted.slice(0, 5);
    const max = top5[0] ? top5[0][1] : 1;

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

    table.innerHTML = sorted.map(([title, val]) => `
        <tr class="hover:bg-white/5 transition">
            <td class="p-4 text-[12px] font-black text-white uppercase tracking-tight">${title}</td>
            <td class="p-4 text-[9px] font-bold text-slate-500 uppercase tracking-widest">General Objection</td>
            <td class="p-4 text-center font-black text-blue-400 tabular-nums">${val}</td>
            <td class="p-4 text-right"><span class="px-2 py-0.5 rounded bg-green-500/10 text-green-500 text-[8px] font-black uppercase tracking-widest">↗ Stable</span></td>
        </tr>
    `).join('');

    if (usage.length > 5) {
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

// Initialize Overview Data - OPTIMIZED
window.ahInitOverview = function() {
    const currentAdmin = JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');
    const permissions = getAdminPermissions(currentAdmin.email);
    
    const toolsBtn = document.getElementById('ah-tab-admintools');
    const statsBtn = document.getElementById('ah-tab-stats');
    const triviaBtn = document.getElementById('ah-tab-trivia');
    const superBtn = document.getElementById('ah-tab-super');
    
    if (toolsBtn) {
        if (permissions.canSeeAdminTools) toolsBtn.classList.remove('hidden');
        else toolsBtn.classList.add('hidden');
    }
    
    if (statsBtn) {
        if (permissions.canSeeStats) statsBtn.classList.remove('hidden');
        else statsBtn.classList.add('hidden');
    }
    
    if (triviaBtn) {
        if (permissions.canSeeTrivia) triviaBtn.classList.remove('hidden');
        else triviaBtn.classList.add('hidden');
    }
    
    if (superBtn) {
        if (permissions.canSeeSuper) superBtn.classList.remove('hidden');
        else superBtn.classList.add('hidden');
    }
    
    if (!permissions.isSuper) {
        if (['admintools', 'trivia', 'super'].includes(ahCurrentSubTab)) {
            // Only force switch if the active tab is one they strictly don't have access to
            if ((ahCurrentSubTab === 'adminpanel' && !permissions.canSeeAdminTools) ||
                (ahCurrentSubTab === 'trivia' && !permissions.canSeeTrivia) ||
                (ahCurrentSubTab === 'super')) {
                window.switchAdminHubTab('overview');
            }
        }
    }

    const updateClock = () => {
        const d = document.getElementById('ah-live-clock');
        if (d) {
            const now = new Date();
            d.innerText = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }
    };
    updateClock();
    setInterval(updateClock, 1000);

    ahSyncRosterFromSheet();

    if (typeof window.initAgentProfiles === 'function') {
        window.initAgentProfiles();
    }

    if (typeof window.listenForLiveDashboardState === 'function') {
        window.listenForLiveDashboardState(handleLiveStateUpdate);
    }
    
    if (typeof window.ahListenForPresence === 'function') {
        window.ahListenForPresence(presence => {
            window.ahOnlinePresences = presence;
            if (window.agents) handleLiveStateUpdate({ agents: window.agents });
        });
    }

    if (typeof window.listenForAgentReports === 'function') {
        window.listenForAgentReports(reports => {
            const select = document.getElementById('ah-att-report-select');
            if (!select) return;
            
            select.innerHTML = '<option value="live" class="bg-slate-900">Live Today</option>';
            
            const sorted = [...reports].sort((a,b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
            sorted.forEach(r => {
                const opt = document.createElement('option');
                opt.value = r.id;
                opt.className = 'bg-slate-900';
                opt.innerText = r.reportDate || r.filename;
                select.appendChild(opt);
            });
            
            window.ahAllReports = reports;
            window.allAgentReports = reports;
            
            // Refresh weekly performance if tab is active
            if (ahCurrentSubTab === 'performance') {
                buildAvailableWeeks();
                populateWeekDropdown();
                loadWeeklyDataForWeek(ahSelectedWeek);
            }
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
        list.innerHTML = '<tr><td colspan="6" class="py-10 text-center text-slate-500 font-bold uppercase tracking-widest">No attendance records found. Please select a date or upload a report.复制</td>';
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
        container.innerHTML = `<div class="py-10 text-green-400 font-bold uppercase text-[10px] tracking-widest">✅ Data Received for ${team} (${data.length} records)</div>`;
    } catch (e) {
        container.innerHTML = `<div class="py-10 text-red-400 font-bold uppercase text-[10px] tracking-widest">❌ Sheet Sync Failed</div>`;
    }
}

let ahLastUpdate = 0;
function handleLiveStateUpdate(state) {
    if (!state || !state.agents) return;
    window.agents = state.agents;
    
    const now = Date.now();
    if (now - ahLastUpdate < 1000) return; 
    ahLastUpdate = now;
    
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
    
    window.agents.forEach(a => {
        const x = Number(a.dailyLeads) || 0;
        totalXfers += x;
        const team = normalizeTeam(a.team, a.name);
        if (team === 'BB') bbXfers += x;
        else if (team === 'PR') prXfers += x;
        else if (team === 'RM') rmXfers += x;
    });
    
    const totalEl = document.getElementById('ah-total-transfers');
    if (totalEl) {
        const goal = 300;
        totalEl.innerHTML = `${totalXfers} <span class="text-lg text-slate-600">/ ${goal}</span>`;
        const percent = Math.min(100, (totalXfers / goal) * 100);
        document.getElementById('ah-goal-progress').style.width = `${percent}%`;
    }
    
    if (document.getElementById('ah-bb-count')) document.getElementById('ah-bb-count').innerHTML = `${bbXfers} <span class="text-xs text-slate-500">Transfers</span>`;
    if (document.getElementById('ah-pr-count')) document.getElementById('ah-pr-count').innerHTML = `${prXfers} <span class="text-xs text-slate-500">Transfers</span>`;
    if (document.getElementById('ah-rm-count')) document.getElementById('ah-rm-count').innerHTML = `${rmXfers} <span class="text-xs text-slate-500">Transfers</span>`;
    
    const onlineGrid = document.getElementById('ah-online-grid');
    const offlineGrid = document.getElementById('ah-offline-grid');
    
    if (onlineGrid && offlineGrid) {
        const roster = window.allAgentProfiles || [];
        const rosterTotalEl = document.getElementById('ah-roster-total');
        if (rosterTotalEl) rosterTotalEl.textContent = roster.length;

        const presence = window.ahOnlinePresences || {};
        const liveAgents = window.agents || [];
        
        const rosterIds = new Set();
        const fullAgentList = roster.map(p => {
            const pId = String(p.userId || '').trim();
            const pName = String(p.fullName || '').trim().toUpperCase();
            rosterIds.add(pId);

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

    if (document.getElementById('ah-broadcast-audience')) {
        const onlineCount = window.agents.filter(a => (window.ahOnlinePresences || {})[a.ytelId]).length;
        document.getElementById('ah-broadcast-audience').innerText = onlineCount;
    }
}

// Global hook for dashboard loading
document.addEventListener('DOMContentLoaded', () => {
    const userRole = sessionStorage.getItem('bizUserRole');
    const currentAdmin = JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');
    const isAdmin = userRole === 'admin';
    
    if (isAdmin) {
        const adminTabVisible = document.getElementById('tab-adminpanel') && 
                                !document.getElementById('tab-adminpanel').classList.contains('hidden');
        
        if (adminTabVisible || currentTab === 'adminpanel') {
            setTimeout(() => {
                ahInitOverview();
            }, 100);
        }
    }
});

window.ahShowTeamBreakdown = function(team) {
    const detailSect = document.getElementById('ah-sect-team-detail');
    const title = document.getElementById('ah-team-modal-title');
    const icon = document.getElementById('ah-team-modal-icon');
    const list = document.getElementById('ah-team-modal-list');
    
    if (!detailSect || !window.agents) return;

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
        alert("Goal updated locally to " + newGoal);
    }
};

// COACHING LOGIC
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

// MONITORING LOGIC
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

// ADMIN TOOLS LOGIC
let ahtCurrentSubTab = 'resources';

window.switchAhToolsSubTab = function(sub) {
    const subs = ['resources', 'logs', 'users', 'performance'];
    subs.forEach(s => {
        const sect = document.getElementById('aht-sect-' + s);
        const tab = document.getElementById('aht-tab-' + s);
        if (sect) sect.classList.add('hidden');
        if (tab) {
            tab.classList.remove('active', 'bg-cyan-500', 'text-white', 'shadow-lg', 'shadow-cyan-900/40');
            tab.classList.add('text-slate-400');
        }
    });

    const activeSect = document.getElementById('aht-sect-' + sub);
    const activeTab = document.getElementById('aht-tab-' + sub);

    const cAdmin = JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');
    const permissions = getAdminPermissions(cAdmin.email);
    
    if (sub === 'users' && !permissions.canSeeSuper) {
        switchAhToolsSubTab('resources');
        return;
    }

    if (activeSect) activeSect.classList.remove('hidden');
    if (activeTab) {
        activeTab.classList.remove('text-slate-400');
        activeTab.classList.add('active');
    }

    if (sub === 'logs') {
        if (typeof window.listenToActivityLogs === 'function') {
            window.listenToActivityLogs(renderAhLogs);
        } else {
            const logs = JSON.parse(localStorage.getItem('biz_activity_logs_v1') || '[]');
            renderAhLogs(logs);
        }
    }
    if (sub === 'users') ahToolsLoadUsers();
    if (sub === 'performance') ahToolsLoadPerformance();
};

function ahAdminToolsInit() {
    const cAdmin = JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');
    const permissions = getAdminPermissions(cAdmin.email);
    
    if (typeof window.ahPruneOldReports === 'function') {
        window.ahPruneOldReports();
    }

    const userTabBtn = document.getElementById('aht-tab-users');
    if (userTabBtn) {
        if (permissions.canSeeSuper) userTabBtn.classList.remove('hidden');
        else userTabBtn.classList.add('hidden');
    }
    
    switchAhToolsSubTab('resources');
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
        
        let actionClass = 'text-slate-400';
        if (log.action === 'login') actionClass = 'text-green-400';
        if (log.action === 'logout') actionClass = 'text-yellow-400';
        if (log.action === 'login_failed') actionClass = 'text-red-400';
        
        return `
            <div class="p-4 hover:bg-white/5 transition flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 last:border-0 group">
                <div class="flex items-center gap-4">
                    <div class="text-[9px] font-black text-slate-500 w-12 text-right flex-shrink-0">${timeStr}<br>${dateStr}</div>
                    <div>
                        <div class="text-[11px] font-black text-white uppercase group-hover:text-cyan-400 transition-colors">${log.name || log.email || 'Unknown'}</div>
                        <div class="text-[9px] ${actionClass} font-bold uppercase tracking-widest mt-0.5">${(log.action || '').replace(/_/g, ' ')}</div>
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
    document.getElementById('ah-log-modal-name').textContent = log.name || log.email || 'Unknown';
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
                <div class="mt-2 text-[7px] font-black uppercase tracking-widest ${admin.role === 'super_admin' ? 'text-yellow-500' : 'text-cyan-400'}">${admin.role ? admin.role.replace('_', ' ') : 'admin'}</div>
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

            const thisWeekReports = reports.filter(r => {
                const rd = getReportActualDate(r);
                return rd >= monday && rd <= sunday;
            });

            const matrix = {}; 
            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

            thisWeekReports.forEach(r => {
                const reportDay = days[getReportActualDate(r).getDay()];
                (r.data || []).forEach(a => {
                    const name = a.agentName || a.name || a['Agent Name'];
                    if (!name) return;
                    const rawName = a.rawName || name;
                    // Skip PH training accounts
                    if (/^PH(?![A-Za-z])/i.test(rawName)) return;
                    const teamLabel = a.team || '—';
                    if (!matrix[name]) {
                        matrix[name] = { team: teamLabel, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, total: 0 };
                    }
                    const statusVal = String(a.status || a.currentStatus || a['Current Status'] || a.currentstatus || '').toUpperCase().trim();
                    const xferCount = statusVal === 'XFER' ? 1 : (Number(a.dailyLeads) || 0);
                    matrix[name][reportDay] = (matrix[name][reportDay] || 0) + xferCount;
                    matrix[name].total += xferCount;
                });
            });

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
        const roster = list;

        if (Array.isArray(roster) && roster.length > 0) {
            console.log(`[AdminHub] Successfully pulled ${roster.length} agents from Sheet.`);
            window.allAgentProfiles = roster;
            
            localStorage.setItem('biz_master_roster', JSON.stringify(roster));
            
            if (window.ahCurrentSubTab === 'overview' || !window.ahCurrentSubTab) {
                handleLiveStateUpdate({ agents: window.agents || [] });
            }
            if (window.ahCurrentSubTab === 'attendance') {
                renderDailyAttendance();
            }
            if (window.ahCurrentSubTab === 'zero' && ahZeroPerfInitialized) {
                const dailyList = document.getElementById('ah-zero-daily-list');
                const weeklyList = document.getElementById('ah-zero-weekly-list');
                if (dailyList && weeklyList && dailyList.innerHTML !== '') {
                    ahInitZeroPerfLazy();
                }
            }
            if (window.ahCurrentSubTab === 'performance') {
                buildAvailableWeeks();
                populateWeekDropdown();
                loadWeeklyDataForWeek(ahSelectedWeek);
            }
        }
    } catch (e) {
        console.error('[AdminHub] Roster sync failed:', e);
    }
};
