/**
 * Agent Stats logic for parsing dialer CSVs and syncing them to Firebase + Leaderboard
 */

let allReports = [];
let currentReportData = null;
let asSortCol = 'transfers';
let asSortAsc = false;

// Initialization function called from index.html (or tab load)
window.renderAgentStatsHistory = function() {
    if (typeof window.listenForAgentReports === 'function') {
        window.listenForAgentReports(data => {
            allReports = data;
            
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
            
            // If we don't have a currently viewed report, pick the latest
            if (!currentReportData && allReports.length > 0) {
                viewReport(allReports[0].id);
            }
            
            // Overwrite dashboard goals with latest report
            if (allReports.length > 0) {
                syncLatestReportToLeaderboard(allReports[0]);
            }
        });
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

function handleFileUpload(file) {
    if (!file.name.endsWith('.csv')) {
        updateStatsStatus('❌ Please upload a CSV file', true);
        return;
    }
    
    updateStatsStatus('<i class="fas fa-spinner fa-spin mr-2"></i> Analyzing CSV...', false);
    
    // Auto date extraction from filename
    // e.g. "Xfer_Report_2023-10-25.csv" -> 2023-10-25
    let fileDateStr = new Date().toLocaleDateString();
    const dateMatch = file.name.match(/(\d{4}[-_]\d{2}[-_]\d{2}|\d{2}[-_]\d{2}[-_]\d{4})/);
    if(dateMatch) fileDateStr = dateMatch[1];
    
    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async function(results) {
            const parsedData = processCSVRows(results.data);
            
            if (parsedData.length === 0) {
                updateStatsStatus('❌ No valid agent data found in CSV', true);
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
    const agentsMap = {};
    
    rows.forEach(row => {
        // Handle various potential header names for Agent Name
        const name = row['Agent Name'] || row['Agent Nan'] || row['Agent Name '] || row['Agent Id'] || 'Unknown';
        if (name === 'Unknown' || name === '') return;
        
        let duration = 0;
        if(row['Duration']) {
            duration = parseInt(row['Duration'], 10) || 0;
        }
        
        if (!agentsMap[name]) {
            agentsMap[name] = { name: name, connections: 0, transfers: 0 };
        }
        
        agentsMap[name].connections++;
        
        // RULE: >= 120 seconds counts as a transfer
        if (duration >= 120) {
            agentsMap[name].transfers++;
        }
    });
    
    const parsedArray = [];
    for (const key in agentsMap) {
        let rate = 0;
        if(agentsMap[key].connections > 0) {
            rate = (agentsMap[key].transfers / agentsMap[key].connections) * 100;
        }
        parsedArray.push({
            name: agentsMap[key].name,
            connections: agentsMap[key].connections,
            transfers: agentsMap[key].transfers,
            rate: parseFloat(rate.toFixed(1))
        });
    }
    
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
        const uploadDate = new Date(r.uploadedAt).toLocaleDateString();
        const isActive = currentReportData && currentReportData.id === r.id;
        
        return `
            <div onclick="viewReport('${r.id}')" class="report-item bg-black/20 p-3 rounded-xl flex justify-between items-center ${isActive ? 'active' : ''}">
                <div>
                    <div class="text-xs font-bold text-white flex items-center gap-2">
                        <i class="far fa-file-alt text-cyan-500"></i> ${r.reportDate}
                        ${isLatest ? '<span class="bg-cyan-500/20 text-cyan-400 text-[8px] px-1.5 py-0.5 rounded font-black tracking-widest uppercase">Latest</span>' : ''}
                    </div>
                    <div class="text-[9px] text-slate-500 mt-0.5 ml-5 truncate w-32" title="${r.filename}">${r.filename}</div>
                </div>
                <div class="text-[9px] text-slate-400 text-right">
                    <div><i class="far fa-user"></i> ${r.author}</div>
                    <div class="mt-0.5">${uploadDate}</div>
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
    }
    
    // Wire up Push Button
    const pushBtn = document.getElementById('as-push-btn');
    if (pushBtn) {
        pushBtn.classList.remove('hidden');
        pushBtn.onclick = async () => {
            if(confirm(`Broadcast this report (${report.reportDate}) to the LIVE Leaderboard for all agents?`)) {
                
                const pushState = {
                    dateLabel: report.reportDate,
                    pushedAt: new Date().toISOString(),
                    pushedBy: report.author,
                    agents: report.data.map(d => ({
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
    let totalAgents = displayData.length;
    let totalCalls = 0;
    let totalXfers = 0;
    
    displayData.forEach(d => {
        totalCalls += d.connections;
        totalXfers += d.transfers;
    });
    
    document.getElementById('as-stat-agents').innerText = totalAgents;
    document.getElementById('as-stat-calls').innerText = totalCalls;
    document.getElementById('as-stat-transfers').innerText = totalXfers;
    document.getElementById('as-stat-rate').innerText = totalCalls > 0 ? ((totalXfers / totalCalls)*100).toFixed(1) + '%' : '0%';
    
    // Search Filter
    const searchVal = (document.getElementById('as-search-input')?.value || '').toLowerCase();
    if (searchVal) {
        displayData = displayData.filter(d => d.name.toLowerCase().includes(searchVal));
    }
    
    // Sorting
    displayData.sort((a,b) => {
        let valA = a[asSortCol];
        let valB = b[asSortCol];
        
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
        tbody.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-slate-500 text-xs italic">No matching agents found.</td></tr>`;
        return;
    }
    
    tbody.innerHTML = displayData.map(d => {
        return `
            <tr class="border-b border-white/5 hover:bg-white/5 transition group">
                <td class="p-4 font-bold text-white uppercase group-hover:text-cyan-300 transition">${d.name}</td>
                <td class="p-4 text-center text-slate-300">${d.connections}</td>
                <td class="p-4 text-center text-cyan-400 font-bold">${d.transfers}</td>
                <td class="p-4 text-center text-slate-300">${d.rate}%</td>
            </tr>
        `;
    }).join('');
}

// Automatically pipeline the LATEST report into the daily leaderboard goals
function syncLatestReportToLeaderboard(latestReport) {
    if (!latestReport || !latestReport.data) return;
    
    const pushData = { agents: {} };
    latestReport.data.forEach(d => {
        // Map "transfers" to the leaderboard's "dailyLeads" target.
        // We look up the agent's team inside dashboard variables if possible (apAgentMap)
        // Since we are separated, we just inject
        pushData.agents[d.name] = { leads: d.transfers }; 
    });
    
// Use adminpanel's injection tool locally just for immediate goal bar updates
    // The REAL global update happens when they click Push!
    if (typeof apInjectIntoDashboard === 'function') {
        apInjectIntoDashboard(pushData);
    } else {
        console.warn('Leaderboard injection function missing!');
    }
}
