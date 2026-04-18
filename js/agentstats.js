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
    
    let fileDateStr = null;
    const _mdyM = file.name.match(/(\d{2})[-_](\d{2})[-_](\d{4})/);
    const _ymdM = file.name.match(/(\d{4})[-_](\d{2})[-_](\d{2})/);
    let parsedReportDate = new Date();
    
    if (_mdyM) {
        // Add T12:00:00 to prevent local timezone from shifting the day backwards
        parsedReportDate = new Date(_mdyM[3] + '-' + _mdyM[1] + '-' + _mdyM[2] + 'T12:00:00');
        if (!isNaN(parsedReportDate)) fileDateStr = typeof getFormattedDate === 'function' ? getFormattedDate(parsedReportDate) : parsedReportDate.toLocaleDateString();
    } else if (_ymdM) {
        parsedReportDate = new Date(_ymdM[1] + '-' + _ymdM[2] + '-' + _ymdM[3] + 'T12:00:00');
        if (!isNaN(parsedReportDate)) fileDateStr = typeof getFormattedDate === 'function' ? getFormattedDate(parsedReportDate) : parsedReportDate.toLocaleDateString();
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
            try {
                const parsedData = processCSVRows(results.data);
                
                if (parsedData.length === 0) {
                    const headers = results.meta && results.meta.fields ? results.meta.fields.join(' | ') : 'none';
                    updateStatsStatus(`❌ Failed. Cols: ${headers}`, true);
                    return;
                }
                
                // Build report object
                const currentAdmin = JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');
                const adminName = currentAdmin.name || currentAdmin.email || 'Admin';
                
                const selectEl = document.getElementById('as-expiry-select');
                const selectVal = selectEl ? selectEl.value : '30';
                let expiryDays = 30;
                if (selectVal === 'custom') {
                    const customEl = document.getElementById('as-expiry-custom');
                    expiryDays = customEl ? (parseInt(customEl.value) || 30) : 30;
                } else {
                    expiryDays = parseInt(selectVal) || 30;
                }
                
                const expiryDate = new Date();
                expiryDate.setDate(expiryDate.getDate() + expiryDays);
                
                const dayName = typeof getGuyanaDayName === 'function' ? getGuyanaDayName(parsedReportDate) : 'MON';
                
                const reportObj = {
                    filename: file.name,
                    reportDate: fileDateStr,
                    dayOfWeek: dayName,
                    uploadedAt: new Date().toISOString(),
                    expiresAt: expiryDate.toISOString(),
                    author: adminName,
                    data: parsedData
                };
                
                // OVERWRITE LOGIC: Delete existing report for the same date if it exists
                const existingReport = allReports.find(r => r.reportDate === fileDateStr);
                if (existingReport && typeof window.deleteAgentReportFromFirebase === 'function') {
                    console.log('Overwrite: Deleting existing report for', fileDateStr);
                    await window.deleteAgentReportFromFirebase(existingReport.id);
                }
                
                // Save to Firebase
                if (typeof window.saveAgentReportToFirebase === 'function') {
                    const res = await window.saveAgentReportToFirebase(reportObj);
                    if(res && res.success) {
                        updateStatsStatus('✅ Report uploaded & synced globally', false);
                        if (typeof window.writeAdminActivityLog === 'function') {
                            window.writeAdminActivityLog('upload_stats', `Uploaded new Agent Stats Report: ${file.name}`);
                        }
                        setTimeout(() => updateStatsStatus('', false), 3000);
                    } else {
                        const errMsg = (res && res.error && res.error.message) ? res.error.message : 'Unknown error';
                        updateStatsStatus(`❌ Failed to upload: ${errMsg}`, true);
                    }
                } else {
                    updateStatsStatus('❌ Firebase not connected. Please reload.', true);
                }
            } catch(err) {
                updateStatsStatus('❌ Error processing CSV: ' + err.message, true);
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
    
    // 1. Identify ID Column
    let idCol = keys.find(k => {
        const l = k.toLowerCase();
        return l === 'agent id' || l === 'user id' || l === 'ext' || l === 'id' || l === 'extension';
    }) || keys.find(k => k.toLowerCase().includes('id')) || keys[0];
    
    // 2. Identify Name Column (Must NOT be the ID column)
    let nameCol = keys.find(k => {
        const l = k.toLowerCase();
        if (k === idCol) return false; // Skip if already picked as ID
        return l === 'agent name' || l === 'full name' || l === 'name' || (l.includes('agent') && !l.includes('id'));
    }) || keys.find(k => k !== idCol && k.toLowerCase().includes('name')) || keys.find(k => k !== idCol) || keys[1];
    
    // 3. Identify Status Column
    let statusCol = keys.find(k => {
        const l = k.toLowerCase();
        return (l.includes('status') || l.includes('state')) && k !== idCol && k !== nameCol;
    }) || keys.find(k => k !== idCol && k !== nameCol) || keys[2];
    
    // 4. Identify Duration Column
    let durationColName = keys.find(k => {
        const l = k.toLowerCase();
        return (l.includes('duration') || l.includes('time') || l.includes('length')) && k !== idCol && k !== nameCol && k !== statusCol;
    }) || keys.find(k => k !== idCol && k !== nameCol && k !== statusCol) || keys[3];

    const parsedArray = [];
    
    rows.forEach(row => {
        const id = String(row[idCol] || '').trim();
        const rawName = String(row[nameCol] || 'Unknown').toUpperCase().trim();
        const cleanName = typeof stripPrefix === 'function' ? stripPrefix(rawName).toUpperCase() : rawName;
        
        if (cleanName === 'UNKNOWN' || cleanName === '') return;
        
        // Skip placeholders/training accounts starting with PH (with space)
        if (rawName.startsWith('PH ') || id.startsWith('PH ')) return; 
        
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
            agentName: cleanName,
            rawName: rawName,
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
    const listHtmls = document.querySelectorAll('#as-history-list');
    if (listHtmls.length === 0) return;
    
    if (allReports.length === 0) {
        listHtmls.forEach(listHtml => {
            listHtml.innerHTML = '<div class="text-center text-slate-500 text-xs py-8">No historical reports inside database.</div>';
        });
        return;
    }
    
    // Sort descending by upload time
    const sorted = [...allReports].sort((a,b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    
    const htmlOutput = sorted.map((r, i) => {
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
    
    listHtmls.forEach(listHtml => {
        listHtml.innerHTML = htmlOutput;
    });
}

window.viewReport = function(id) {
    const report = allReports.find(r => r.id === id);
    if (!report) return;
    
    currentReportData = report;
    renderHistoryList(); // updates active highlight
    
    document.querySelectorAll('#as-report-title').forEach(el => el.innerText = 'Report: ' + report.reportDate);
    document.querySelectorAll('#as-report-date').forEach(el => el.innerHTML = `<i class="far fa-calendar-alt mr-1"></i> Uploaded ${new Date(report.uploadedAt).toLocaleDateString()}`);
    document.querySelectorAll('#as-report-author').forEach(el => el.innerHTML = `<i class="far fa-user mr-1"></i> ${report.author}`);
    
    // Wire up delete button
    const delBtns = document.querySelectorAll('#as-delete-btn');
    delBtns.forEach(delBtn => {
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
    });
    
    // Wire up Push Button
    const pushBtns = document.querySelectorAll('#as-push-btn');
    pushBtns.forEach(pushBtn => {
        pushBtn.classList.remove('hidden');
        pushBtn.onclick = async () => {
            if(confirm(`WARNING: This will overwrite the "TODAY" Live Leaderboard with this report (${report.reportDate}).\n\nNote: If this is an old report (like from yesterday), you DO NOT need to push it! It automatically goes to the correct Mon-Fri tab just by uploading it.\n\nAre you sure you want to broadcast this to the LIVE "TODAY" board?`)) {
                
                // Aggregate total transfers before pushing
                const aggMap = {};
                report.data.forEach(d => {
                    const id = d.agentId || d.ytelId || d.agentName;
                    const rawKey = d.rawName || d.agentName;
                    if(!aggMap[id]) aggMap[id] = { name: d.agentName, rawName: rawKey, transfers: 0, ytelId: id };
                    if(d.duration >= 120) aggMap[id].transfers++;
                });
                const aggregatedList = Object.values(aggMap);
                
                const pushState = {
                    dateLabel: report.reportDate,
                    pushedAt: new Date().toISOString(),
                    pushedBy: report.author,
                    agents: aggregatedList.map(d => ({
                        name: d.name,
                        ytelId: d.ytelId,
                        team: typeof normalizeTeam === 'function' ? normalizeTeam('', d.rawName) : 'PR',
                        dailyLeads: d.transfers
                    }))
                };
                
                if (typeof window.saveLiveDashboardState === 'function') {
                    await window.saveLiveDashboardState(pushState);
                    pushBtns.forEach(btn => btn.innerHTML = '✅ Pushed!');
                    setTimeout(() => pushBtns.forEach(btn => btn.innerHTML = '🚀 Push to Daily Full Board'), 2000);
                    
                    if (typeof window.writeAdminActivityLog === 'function') {
                        window.writeAdminActivityLog('push_dashboard', `Pushed Report to Live Dashboard: ${report.reportDate}`);
                    }
                }
            }
        };
    });
    
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
        // Use a combination of ID and Name for unique counting to be safe
        const uniqueKey = (d.agentId || d.ytelId || '') + '_' + (d.agentName || '');
        totalAgentsMap[uniqueKey] = true;
        if(d.duration >= 120) totalXfers++;
    });
    
    // If the user expects 43, it means they are counting rows in their file
    const agentCount = displayData.length;
    document.querySelectorAll('#as-stat-agents').forEach(el => el.innerText = agentCount);
    document.querySelectorAll('#as-stat-calls').forEach(el => el.innerText = totalCalls);
    document.querySelectorAll('#as-stat-transfers').forEach(el => el.innerText = totalXfers);
    document.querySelectorAll('#as-stat-rate').forEach(el => el.innerText = totalCalls > 0 ? ((totalXfers / totalCalls)*100).toFixed(1) + '%' : '0%');
    
    // Search Filter
    let searchVal = '';
    const searchInput = document.getElementById('as-search-input');
    if (searchInput) searchVal = searchInput.value.toLowerCase();
    
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
    const tbodies = document.querySelectorAll('#as-table-body');
    if (tbodies.length === 0) return;
    
    if (displayData.length === 0) {
        tbodies.forEach(tbody => tbody.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-slate-500 text-xs italic">No matching rows found.</td></tr>`);
        return;
    }
    
    const htmlOutput = displayData.map(d => {
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
    
    tbodies.forEach(tbody => tbody.innerHTML = htmlOutput);
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
