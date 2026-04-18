/**
 * Agent Stats logic for parsing dialer CSVs and syncing them to Firebase + Leaderboard
 */

let allReports = [];
let currentReportData = null;
let asSortCol = 'duration';
let asSortAsc = false;
let asSubscribed = false; // Flag to prevent multiple listeners

// Initialization function called from index.html (or tab load)
window.renderAgentStatsHistory = function() {
    if (asSubscribed) {
        // Just refresh the existing view if we're already subscribed
        if (currentReportData) {
            viewReport(currentReportData.id);
        } else if (allReports.length > 0) {
            viewReport(allReports[0].id);
        }
    } else if (typeof window.listenForAgentReports === 'function') {
        window.listenForAgentReports(data => {
            console.log('Agent Stats: Received data update', data?.length);
            allReports = data || [];
            
            // Clean up expired ones
            const now = new Date();
            let needsCleanup = false;
            
            allReports.forEach(r => {
                const expires = new Date(r.expiresAt);
                if (now > expires) {
                    if (typeof window.deleteAgentReportFromFirebase === 'function') {
                        window.deleteAgentReportFromFirebase(r.id);
                        needsCleanup = true;
                    }
                }
            });
            
            if (needsCleanup) return; // The listener will fire again after deletions
            
            renderHistoryList();
            
            // If we don't have a currently viewed report, pick the latest.
            // If we DO have one, refresh it to show data in the potentially re-loaded tab HTML.
            if (!currentReportData && allReports.length > 0) {
                viewReport(allReports[0].id);
            } else if (currentReportData) {
                // Check if the current report still exists in the list
                const stillExists = allReports.find(r => r.id === currentReportData.id);
                if (stillExists) {
                    viewReport(stillExists.id);
                } else if (allReports.length > 0) {
                    viewReport(allReports[0].id);
                }
            }
            
            // Overwrite dashboard goals with latest report
            if (allReports.length > 0) {
                syncLatestReportToLeaderboard(allReports[0]);
            }
        });
        asSubscribed = true;
    }
    
    setupDropZone();
    
    const searchInput = document.getElementById('as-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            if (currentReportData) renderActiveReportTable();
        });
    }
};

function setupDropZone() {
    const dropZone = document.getElementById('as-drop-zone');
    const fileInput = document.getElementById('as-file-input');
    
    if (!dropZone || !fileInput) return;
    
    dropZone.addEventListener('click', () => fileInput.click());
    
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('border-cyan-400', 'bg-cyan-500/10');
    });
    
    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.classList.remove('border-cyan-400', 'bg-cyan-500/10');
    });
    
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('border-cyan-400', 'bg-cyan-500/10');
        if (e.dataTransfer.files.length) {
            handleFileUpload(e.dataTransfer.files[0]);
        }
    });
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleFileUpload(e.target.files[0]);
        }
    });
}

async function handleFileUpload(file) {
    if (!file.name.endsWith('.csv')) {
        updateStatsStatus('❌ Please upload a CSV file', true);
        return;
    }
    
    updateStatsStatus('<i class="fas fa-spinner fa-spin mr-2"></i> Analyzing CSV...', false);
    
    // Auto date extraction from filename (MM_DD_YYYY or YYYY-MM-DD)
    let fileDateStr = null;
    const _mdyM = file.name.match(/(\d{2})[-_](\d{2})[-_](\d{4})/);
    const _ymdM = file.name.match(/(\d{4})[-_](\d{2})[-_](\d{2})/);
    if (_mdyM) {
        const _d = new Date(_mdyM[3] + '-' + _mdyM[1] + '-' + _mdyM[2]);
        if (!isNaN(_d)) fileDateStr = typeof getFormattedDate === 'function' ? getFormattedDate(_d) : _d.toLocaleDateString();
    } else if (_ymdM) {
        const _d = new Date(_ymdM[1] + '-' + _ymdM[2] + '-' + _ymdM[3]);
        if (!isNaN(_d)) fileDateStr = typeof getFormattedDate === 'function' ? getFormattedDate(_d) : _d.toLocaleDateString();
    }
    if (!fileDateStr) fileDateStr = file.name.replace(/\.csv$/i, '');
    
    // Pre-process file to strip dialer metadata (e.g. "Xfer report:")
    const text = await file.text();
    let lines = text.split('\n');
    let headerIdx = -1;
    for(let i=0; i<lines.length; i++) {
        const lower = lines[i].toLowerCase();
        // Look for the actual header row
        if(lower.includes('agent id') || lower.includes('agent name')) {
            headerIdx = i; break;
        }
    }
    
    if(headerIdx === -1) {
        updateStatsStatus('❌ CSV Missing "Agent Name" or "Agent Id" Header', true);
        return;
    }
    
    const validCSV = lines.slice(headerIdx).join('\n');
    
    Papa.parse(validCSV, {
        header: true,
        skipEmptyLines: true,
        complete: async function(results) {
            const parsedData = processCSVRows(results.data);
            
            if (parsedData.length === 0) {
                const headers = results.meta && results.meta.fields ? results.meta.fields.join(' | ') : 'none';
                updateStatsStatus(`❌ Failed. Cols: ${headers}`, true);
                return;
            }
            
            // Build report object
            const currentAdmin = JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');
            const adminName = currentAdmin.name || currentAdmin.email || 'Admin';
            
            const expiryDays = parseInt(document.getElementById('as-expiry-select').value) || 30;
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + expiryDays);
            
            const reportObj = {
                filename: file.name,
                reportDate: fileDateStr,
                uploadedAt: new Date().toISOString(),
                expiresAt: expiryDate.toISOString(),
                author: adminName,
                data: parsedData
            };
            
            // Save to Firebase
            if (typeof window.saveAgentReportToFirebase === 'function') {
                const res = await window.saveAgentReportToFirebase(reportObj);
                if(res.success) {
                    updateStatsStatus('✅ Report uploaded & synced globally', false);
                    if (typeof window.writeAdminActivityLog === 'function') {
                        window.writeAdminActivityLog('upload_stats', `Uploaded new Agent Stats Report: ${file.name}`);
                    }
                    setTimeout(() => updateStatsStatus('', false), 3000);
                } else {
                    updateStatsStatus('❌ Failed to upload to cloud', true);
                }
            }
        },
        error: function(err) {
            updateStatsStatus('❌ Error parsing CSV: ' + err.message, true);
        }
    });
}

function processCSVRows(rows) {
    if(!rows || rows.length === 0) return [];
    
    // Process columns based on user's exact specification:
    // Agent Id, Agent Name, Current Status, Duration
    
    const keys = Object.keys(rows[0]);
    let idCol = keys.find(k => k.toLowerCase().includes('agent id')) || keys[0];
    let nameCol = keys.find(k => k.toLowerCase().includes('agent name')) || keys[1];
    let statusCol = keys.find(k => k.toLowerCase().includes('status')) || keys[2];
    let durationColName = keys.find(k => k.toLowerCase().includes('duration') || k.toLowerCase().includes('time')) || keys[3];

    const parsedArray = [];
    
    rows.forEach(row => {
        const id = row[idCol] || '';
        const name = row[nameCol] || 'Unknown';
        if (name === 'Unknown' || String(name).trim() === '') return;
        
        const status = String(row[statusCol] || '').trim();
        
        let duration = 0;
        if(row[durationColName]) {
            const durRaw = String(row[durationColName]).trim();
            if(durRaw.includes(':')) {
                const parts = durRaw.split(':').map(Number);
                if(parts.length === 2) duration = parts[0]*60 + parts[1]; // mm:ss
                else if(parts.length === 3) duration = parts[0]*3600 + parts[1]*60 + parts[2]; // hh:mm:ss
            } else {
                duration = parseInt(durRaw, 10) || 0;
            }
        }
        
        parsedArray.push({
            agentId: String(id).trim(),
            agentName: String(name).toUpperCase().trim(),
            status: status.toUpperCase(),
            duration: duration
        });
    });
    
    return parsedArray;
}

function updateStatsStatus(msg, isError) {
    const el = document.getElementById('as-upload-status');
    if(el) {
        el.innerHTML = msg;
        el.className = 'mt-4 text-[10px] text-center font-bold ' + (isError ? 'text-red-400' : 'text-cyan-400');
    }
}

function renderHistoryList() {
    const listHtml = document.getElementById('as-history-list');
    if (!listHtml) return;
    
    if (allReports.length === 0) {
        listHtml.innerHTML = '<div class="text-center text-slate-500 text-xs py-8">No historical reports inside database.</div>';
        return;
    }
    
    // Sort descending by upload time
    const sorted = [...allReports].sort((a,b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    
    listHtml.innerHTML = sorted.map((r, i) => {
        const isLatest = i === 0;
        // Show file date (reportDate extracted from filename) as primary label
        const fileDate = r.reportDate || r.filename || 'Unknown Date';
        // Upload date shown as secondary info
        const uploadDate = new Date(r.uploadedAt).toLocaleDateString('en-GB');
        const isActive = currentReportData && currentReportData.id === r.id;
        
        return `
            <div onclick="window.viewReport('${r.id}')" class="report-item bg-black/20 p-3 rounded-xl flex justify-between items-center cursor-pointer ${isActive ? 'active' : ''}" style="cursor:pointer;">
                <div>
                    <div class="text-xs font-bold text-white flex items-center gap-2">
                        <i class="far fa-file-alt text-cyan-500"></i> ${fileDate}
                        ${isLatest ? '<span class="bg-cyan-500/20 text-cyan-400 text-[8px] px-1.5 py-0.5 rounded font-black tracking-widest uppercase">Latest</span>' : ''}
                    </div>
                    <div class="text-[9px] text-slate-500 mt-0.5 ml-5 truncate w-32" title="${r.filename}">${r.filename || ''}</div>
                </div>
                <div class="text-[9px] text-slate-400 text-right">
                    <div><i class="far fa-user"></i> ${r.author || 'Admin'}</div>
                    <div class="mt-0.5 text-slate-600">Uploaded: ${uploadDate}</div>
                </div>
            </div>
        `;
    }).join('');
}

window.viewReport = function(id) {
    const report = allReports.find(r => r.id === id);
    if (!report) return;
    
    currentReportData = report;
    renderHistoryList(); // updates active highlight
    
    document.getElementById('as-report-title').innerText = 'Report: ' + report.reportDate;
    document.getElementById('as-report-date').innerHTML = `<i class="far fa-calendar-alt mr-1"></i> Uploaded ${new Date(report.uploadedAt).toLocaleDateString()}`;
    document.getElementById('as-report-author').innerHTML = `<i class="far fa-user mr-1"></i> ${report.author}`;
    
    // Wire up delete button
    const delBtn = document.getElementById('as-delete-btn');
    if (delBtn) {
        const cAdmin = JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');
        if (cAdmin.role === 'super_admin' || cAdmin.isSuper) {
            delBtn.classList.remove('hidden');
            delBtn.onclick = () => {
                if(confirm('Permanently delete this report globally?')) {
                    if (typeof window.deleteAgentReportFromFirebase === 'function') {
                        window.deleteAgentReportFromFirebase(id);
                        currentReportData = null;
                        if (typeof window.writeAdminActivityLog === 'function') {
                            window.writeAdminActivityLog('delete_stats', `Deleted Agent Report: ${report.reportDate}`);
                        }
                    }
                }
            };
        } else {
            delBtn.classList.add('hidden');
        }
    }
    
    // Wire up Push Button
    const pushBtn = document.getElementById('as-push-btn');
    if (pushBtn) {
        pushBtn.classList.remove('hidden');
        pushBtn.onclick = async () => {
            if(confirm(`Broadcast this report (${report.reportDate}) to the LIVE Leaderboard for all agents?`)) {
                
                // Aggregate total transfers before pushing
                const aggMap = {};
                report.data.forEach(d => {
                    if(!aggMap[d.agentName]) aggMap[d.agentName] = { name: d.agentName, transfers: 0 };
                    if(d.duration >= 120) aggMap[d.agentName].transfers++;
                });
                const aggregatedList = Object.values(aggMap);
                
                const pushState = {
                    dateLabel: report.reportDate,
                    pushedAt: new Date().toISOString(),
                    pushedBy: report.author,
                    agents: aggregatedList.map(d => ({
                        name: d.name,
                        team: typeof getTeam === 'function' ? getTeam('', d.name) : 'PR',
                        dailyLeads: d.transfers
                    }))
                };
                
                if (typeof window.saveLiveDashboardState === 'function') {
                    await window.saveLiveDashboardState(pushState);
                    pushBtn.innerHTML = '✅ Pushed!';
                    setTimeout(() => pushBtn.innerHTML = '🚀 Push to Daily Full Board', 2000);
                    
                    if (typeof window.writeAdminActivityLog === 'function') {
                        window.writeAdminActivityLog('push_dashboard', `Pushed Report to Live Dashboard: ${report.reportDate}`);
                    }
                }
            }
        };
    }
    
    renderActiveReportTable();
};

window.sortAgentStats = function(col) {
    if (asSortCol === col) {
        asSortAsc = !asSortAsc;
    } else {
        asSortCol = col;
        asSortAsc = false; // default desc for new col
    }
    renderActiveReportTable();
};

function renderActiveReportTable() {
    if (!currentReportData) return;
    
    let displayData = [...currentReportData.data];
    
    // Global Stats Setup
    let totalAgentsMap = {};
    let totalCalls = displayData.length;
    let totalXfers = 0;
    
    displayData.forEach(d => {
        totalAgentsMap[d.agentName] = true;
        if(d.duration >= 120) totalXfers++;
    });
    
    document.getElementById('as-stat-agents').innerText = Object.keys(totalAgentsMap).length;
    document.getElementById('as-stat-calls').innerText = totalCalls;
    document.getElementById('as-stat-transfers').innerText = totalXfers;
    document.getElementById('as-stat-rate').innerText = totalCalls > 0 ? ((totalXfers / totalCalls)*100).toFixed(1) + '%' : '0%';
    
    // Search Filter
    const searchVal = (document.getElementById('as-search-input')?.value || '').toLowerCase();
    if (searchVal) {
        displayData = displayData.filter(d => d.agentName.toLowerCase().includes(searchVal));
    }
    
    // Sorting
    displayData.sort((a,b) => {
        let valA = a[asSortCol];
        let valB = b[asSortCol];
        
        if (valA === undefined) valA = 0;
        if (valB === undefined) valB = 0;
        
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        
        if (valA < valB) return asSortAsc ? -1 : 1;
        if (valA > valB) return asSortAsc ? 1 : -1;
        return 0;
    });
    
    // Render
    const tbody = document.getElementById('as-table-body');
    if (!tbody) return;
    
    if (displayData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-slate-500 text-xs italic">No matching rows found.</td></tr>`;
        return;
    }
    
    tbody.innerHTML = displayData.map(d => {
        // Highlight logic for Status and Durations
        let statusColor = 'text-slate-300';
        if(d.status.includes('XFER') || d.status.includes('TRANS')) statusColor = 'text-cyan-400 font-bold';
        else if(d.status.includes('DNC')) statusColor = 'text-red-400';
        else if(d.status.includes('NI')) statusColor = 'text-yellow-400';
        else if(d.status.includes('CI')) statusColor = 'text-blue-400';
        
        let durColor = d.duration >= 120 ? 'text-cyan-400 font-bold' : 'text-slate-300';

        return `
            <tr class="border-b border-white/5 hover:bg-white/5 transition group text-xs">
                <td class="p-3 text-slate-400 font-mono">${d.agentId || '—'}</td>
                <td class="p-3 font-bold text-white uppercase group-hover:text-cyan-300 transition">${d.agentName}</td>
                <td class="p-3 text-center ${statusColor}">${d.status}</td>
                <td class="p-3 text-right ${durColor}">${d.duration}</td>
            </tr>
        `;
    }).join('');
}

// Automatically pipeline the LATEST report into the daily leaderboard goals
function syncLatestReportToLeaderboard(latestReport) {
    if (!latestReport || !latestReport.data) return;
    
    const pushData = { agents: {} };
    // Need to aggregate since new report data is raw rows
    const aggMap = {};
    latestReport.data.forEach(d => {
        if(!aggMap[d.agentName]) aggMap[d.agentName] = 0;
        if(d.duration >= 120) aggMap[d.agentName]++;
    });
    
    Object.keys(aggMap).forEach(name => {
        pushData.agents[name] = { leads: aggMap[name] }; 
    });
    
// Use adminpanel's injection tool locally just for immediate goal bar updates
    // The REAL global update happens when they click Push!
    if (typeof apInjectIntoDashboard === 'function') {
        apInjectIntoDashboard(pushData);
    } else {
        console.warn('Leaderboard injection function missing!');
    }
}
