/**
 * Agent Stats logic for parsing dialer CSVs and syncing them to Firebase + Leaderboard
 * AUTO-PUSH: Most recent file automatically updates the Daily dashboard
 * FIXED: CSV rows sorted with newest at TOP, proper same-day overwrite
 */

let allReports = [];
let currentReportData = null;
let asSortCol = 'agentName';
let asSortAsc = true;
let asSubscribed = false; // Flag to prevent multiple listeners

// Track last auto-pushed report to prevent duplicates
let lastAutoPushedReportId = null;
let lastReportCount = 0; // Track count to detect new reports

// Track previously viewed report IDs to highlight new leads
let previousReportLeadCounts = new Map();

// Track new leads found in current report compared to previous
let newLeadsList = [];

// Initialization function called from index.html (or tab load)
window.renderAgentStatsHistory = function() {
    // Check permissions - only Super Admin can access Agent Stats
    const currentAdmin = JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');
    const isSuper = currentAdmin.role === 'super_admin' || currentAdmin.isSuper;
    
    if (!isSuper) {
        console.log('Agent Stats: Access denied - Super Admin only');
        const container = document.getElementById('ah-sect-stats');
        if (container) {
            container.innerHTML = '<div class="p-20 text-center"><i class="fas fa-lock text-5xl text-red-500 mb-4"></i><p class="text-slate-400 font-bold uppercase tracking-widest">Access Denied</p><p class="text-slate-500 text-sm mt-2">Agent Stats is only available for Super Admin.</p></div>';
        }
        return;
    }
    
    if (asSubscribed) {
        // Just refresh the existing view if we're already subscribed
        if (currentReportData) {
            viewReport(currentReportData.id);
        } else if (allReports.length > 0) {
            // Auto-open the MOST RECENT report (newest upload)
            const sortedForDisplay = [...allReports].sort((a,b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
            if (sortedForDisplay.length > 0) {
                viewReport(sortedForDisplay[0].id);
            }
        }
    } else if (typeof window.listenForAgentReports === 'function') {
        window.listenForAgentReports(data => {
            console.log('Agent Stats: Received data update', data?.length);
            
            // Detect if this is a NEW report being added
            const previousCount = allReports.length;
            allReports = data || [];
            window.allAgentReports = allReports;
            
            const isNewReport = previousCount > 0 && allReports.length > previousCount;
            const newReportId = isNewReport && allReports[0] ? allReports[0].id : null;
            
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
            
            if (needsCleanup) return;
            
            renderHistoryList(isNewReport, newReportId);
            
            // Auto-open the MOST RECENT report (newest upload first)
            if (!currentReportData && allReports.length > 0) {
                const sortedForDisplay = [...allReports].sort((a,b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
                if (sortedForDisplay.length > 0) {
                    viewReport(sortedForDisplay[0].id);
                }
            } else if (currentReportData) {
                const stillExists = allReports.find(r => r.id === currentReportData.id);
                if (stillExists) {
                    viewReport(stillExists.id);
                } else if (allReports.length > 0) {
                    const sortedForDisplay = [...allReports].sort((a,b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
                    if (sortedForDisplay.length > 0) {
                        viewReport(sortedForDisplay[0].id);
                    }
                }
            }
            
            // AUTO-PUSH: Automatically push the latest report to the Daily dashboard
            if (allReports.length > 0) {
                const latestReport = [...allReports].sort((a,b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))[0];
                
                if (lastAutoPushedReportId !== latestReport.id) {
                    console.log('Auto-pushing latest report to Daily tab:', latestReport.reportDate);
                    autoPushReportToDashboard(latestReport);
                    lastAutoPushedReportId = latestReport.id;
                }
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

// AUTO-PUSH FUNCTION: Auto-push report to Live Dashboard
async function autoPushReportToDashboard(report) {
    if (!report || !report.data) {
        console.warn('Auto-push skipped: No report data');
        return;
    }
    
    const today = new Date();
    const todayStr = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const reportDateStr = report.reportDate;
    
    if (!reportDateStr || (!reportDateStr.includes(todayStr.split(' ')[0]) && !reportDateStr.includes(todayStr))) {
        console.log('Auto-push skipped: Report is not from today -', reportDateStr);
        return;
    }
    
    const aggMap = {};
    report.data.forEach(d => {
        const nameKey = (d.agentName || 'UNKNOWN').trim().toUpperCase();
        const id = d.agentId || d.ytelId || d.agentName;
        const rawKey = d.rawName || d.agentName;
        if(!aggMap[nameKey]) aggMap[nameKey] = { 
            name: d.agentName, 
            rawName: rawKey, 
            transfers: 0, 
            ytelId: id 
        };
        if(d.duration >= 120) aggMap[nameKey].transfers++;
    });
    const aggregatedList = Object.values(aggMap);
    
    const pushState = {
        dateLabel: report.reportDate,
        pushedAt: new Date().toISOString(),
        pushedBy: report.author || 'Auto-Push System',
        sourceReportId: report.id,
        agents: aggregatedList.map(d => ({
            name: d.name,
            ytelId: d.ytelId,
            team: typeof normalizeTeam === 'function' ? normalizeTeam('', d.rawName) : 'PR',
            dailyLeads: d.transfers
        }))
    };
    
    if (typeof window.saveLiveDashboardState === 'function') {
        await window.saveLiveDashboardState(pushState);
        console.log('✅ Auto-pushed report to Daily dashboard:', report.reportDate);
        
        if (typeof window.updateDashboard === 'function') {
            setTimeout(() => window.updateDashboard(), 500);
        }
        
        if (typeof window.agents !== 'undefined' && Array.isArray(window.agents)) {
            aggregatedList.forEach(pushed => {
                const existingAgent = window.agents.find(a => 
                    a.name === pushed.name || 
                    (pushed.ytelId && a.ytelId === pushed.ytelId)
                );
                if (existingAgent) {
                    existingAgent.dailyLeads = pushed.transfers;
                } else {
                    window.agents.push({
                        name: pushed.name,
                        ytelId: pushed.ytelId,
                        team: pushed.team,
                        dailyLeads: pushed.transfers,
                        weeklyLeads: 0
                    });
                }
            });
            
            if (typeof window.render === 'function') window.render();
            if (typeof window.checkLeadAlerts === 'function') window.checkLeadAlerts(window.agents);
        }
        
        if (typeof window.writeAdminActivityLog === 'function') {
            window.writeAdminActivityLog('auto_push', `Auto-pushed Report to Live Dashboard: ${report.reportDate}`);
        }
    }
}

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

// Holds staged data before user confirms upload
let _asStagedFile = null;
let _asStagedParsed = null;
let _asStagedDateStr = null;
let _asStagedParsedDate = null;
let _asRetentionDays = 30;

window.asSetRetention = function(days) {
    if (!days || isNaN(days) || days < 1) return;
    _asRetentionDays = days;
    [7, 30, 60, 90].forEach(d => {
        const btn = document.getElementById(`as-ret-${d}`);
        if (btn) btn.classList.remove('active-ret');
        if (btn && d === days) btn.classList.add('active-ret');
    });
    const customInput = document.getElementById('as-ret-custom');
    if (customInput && days !== 7 && days !== 30 && days !== 60 && days !== 90) {
        customInput.value = days;
    }
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + days);
    const expiryEl = document.getElementById('as-expiry-display');
    if (expiryEl) expiryEl.innerText = expiryDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

window.asSetCustomRetention = function() {
    const customInput = document.getElementById('as-ret-custom');
    if (customInput) {
        let days = parseInt(customInput.value);
        if (isNaN(days) || days < 1) days = 30;
        if (days > 365) days = 365;
        _asRetentionDays = days;
        [7, 30, 60, 90].forEach(d => {
            const btn = document.getElementById(`as-ret-${d}`);
            if (btn) btn.classList.remove('active-ret');
        });
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + days);
        const expiryEl = document.getElementById('as-expiry-display');
        if (expiryEl) expiryEl.innerText = expiryDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
};

window.asToggleDateOverride = function(checked) {
    const input = document.getElementById('as-report-date-input');
    if (!input) return;
    input.readOnly = !checked;
    input.style.borderColor = checked ? 'rgba(6,182,212,0.5)' : '';
    input.style.cursor = checked ? 'text' : 'default';
};

window.asConfirmUpload = async function() {
    if (!_asStagedParsed || !_asStagedFile) {
        updateStatsStatus('❌ No file staged. Please re-select your CSV.', true);
        return;
    }
    
    const dateInput = document.getElementById('as-report-date-input');
    const isOverride = document.getElementById('as-date-override-check')?.checked;
    let finalDateStr = _asStagedDateStr;
    if (isOverride && dateInput && dateInput.value.trim()) {
        finalDateStr = dateInput.value.trim();
    }
    
    updateStatsStatus('<i class="fas fa-spinner fa-spin mr-2"></i> Saving to Firebase...', false);
    
    const currentAdmin = JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');
    const adminName = currentAdmin.name || currentAdmin.email || 'Admin';
    
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + _asRetentionDays);
    
    const dayName = typeof getGuyanaDayName === 'function' ? getGuyanaDayName(_asStagedParsedDate) : 'MON';
    
    const reportObj = {
        filename: _asStagedFile.name,
        reportDate: finalDateStr,
        dayOfWeek: dayName,
        uploadedAt: new Date().toISOString(),
        expiresAt: expiryDate.toISOString(),
        author: adminName,
        data: _asStagedParsed
    };
    
    // 🔥 FIX: Delete existing report for same date BEFORE saving new one
    const existingReport = allReports.find(r => r.reportDate === finalDateStr);
    if (existingReport && typeof window.deleteAgentReportFromFirebase === 'function') {
        await window.deleteAgentReportFromFirebase(existingReport.id);
        console.log(`Deleted existing report for ${finalDateStr}`);
    }
    
    if (typeof window.saveAgentReportToFirebase === 'function') {
        const res = await window.saveAgentReportToFirebase(reportObj);
        if (res && res.success) {
            updateStatsStatus('✅ Report saved successfully! Auto-pushing to Dashboard...', false);
            if (typeof window.writeAdminActivityLog === 'function') {
                window.writeAdminActivityLog('upload_stats', `Uploaded Agent Stats Report: ${_asStagedFile.name}`);
            }
            
            document.getElementById('as-upload-panel').classList.add('hidden');
            _asStagedFile = null;
            _asStagedParsed = null;
            
            setTimeout(() => updateStatsStatus('', false), 3000);
        } else {
            const errMsg = (res && res.error && res.error.message) ? res.error.message : 'Unknown error';
            updateStatsStatus(`❌ Failed: ${errMsg}`, true);
        }
    } else {
        updateStatsStatus('❌ Firebase not connected. Please reload.', true);
    }
};

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
        parsedReportDate = new Date(_mdyM[3] + '-' + _mdyM[1] + '-' + _mdyM[2] + 'T12:00:00');
        if (!isNaN(parsedReportDate)) fileDateStr = typeof getFormattedDate === 'function' ? getFormattedDate(parsedReportDate) : parsedReportDate.toLocaleDateString();
    } else if (_ymdM) {
        parsedReportDate = new Date(_ymdM[1] + '-' + _ymdM[2] + '-' + _ymdM[3] + 'T12:00:00');
        if (!isNaN(parsedReportDate)) fileDateStr = typeof getFormattedDate === 'function' ? getFormattedDate(parsedReportDate) : parsedReportDate.toLocaleDateString();
    }
    if (!fileDateStr) fileDateStr = file.name.replace(/\.csv$/i, '');
    
    const text = await file.text();
    let lines = text.split('\n');
    let headerIdx = -1;
    for(let i=0; i<lines.length; i++) {
        const lower = lines[i].toLowerCase();
        if(lower.includes('agent id') && lower.includes('agent name')) {
            headerIdx = i;
            break;
        }
        if(lower.includes('agent name')) {
            headerIdx = i;
            break;
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
                
                _asStagedFile = file;
                _asStagedParsed = parsedData;
                _asStagedDateStr = fileDateStr;
                _asStagedParsedDate = parsedReportDate;
                _asRetentionDays = 30;
                
                const dateInput = document.getElementById('as-report-date-input');
                if (dateInput) dateInput.value = fileDateStr;
                
                asSetRetention(30);
                
                const panel = document.getElementById('as-upload-panel');
                if (panel) panel.classList.remove('hidden');
                
                updateStatsStatus(`✅ Ready: ${parsedData.length} rows — ${new Set(parsedData.map(d=>d.agentName)).size} agents detected`, false);
                
            } catch(err) {
                updateStatsStatus('❌ Error processing CSV: ' + err.message, true);
            }
        },
        error: function(err) {
            updateStatsStatus('❌ Error parsing CSV: ' + err.message, true);
        }
    });
}

// 🔥 FIXED: Process CSV rows and sort by timestamp (newest at TOP)
function processCSVRows(rows) {
    if(!rows || rows.length === 0) return [];
    
    const keys = Object.keys(rows[0]);
    
    // 1. Identify ID Column
    let idCol = keys.find(k => {
        const l = k.toLowerCase();
        return l === 'agent id' || l === 'user id' || l === 'ext' || l === 'id' || l === 'extension';
    }) || keys.find(k => k.toLowerCase().includes('id')) || keys[0];
    
    // 2. Identify Name Column
    let nameCol = keys.find(k => {
        const l = k.toLowerCase();
        if (k === idCol) return false;
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
    
    // 5. Identify Date Column (for sorting newest first)
    let dateCol = keys.find(k => {
        const l = k.toLowerCase();
        return l.includes('xfer date') || l.includes('date') || l.includes('timestamp');
    });

    const parsedArray = [];
    
    rows.forEach(row => {
        const id = String(row[idCol] || '').trim();
        const rawName = String(row[nameCol] || 'Unknown').toUpperCase().trim();
        const cleanName = typeof stripPrefix === 'function' ? stripPrefix(rawName).toUpperCase() : rawName;
        
        if (cleanName === 'UNKNOWN' || cleanName === '') return;
        
        // Skip placeholders/training accounts
        if (rawName.startsWith('PH ')) return;
        
        const status = String(row[statusCol] || '').trim();
        
        let duration = 0;
        if(row[durationColName]) {
            const durRaw = String(row[durationColName]).trim();
            if(durRaw.includes(':')) {
                const parts = durRaw.split(':').map(Number);
                if(parts.length === 2) duration = parts[0]*60 + parts[1];
                else if(parts.length === 3) duration = parts[0]*3600 + parts[1]*60 + parts[2];
            } else {
                duration = parseInt(durRaw, 10) || 0;
            }
        }
        
        // Parse timestamp for sorting
        let timestamp = null;
        if (dateCol && row[dateCol]) {
            timestamp = new Date(row[dateCol]);
        }
        
        parsedArray.push({
            agentId: String(id).trim(),
            agentName: cleanName,
            rawName: rawName,
            status: status.toUpperCase(),
            duration: duration,
            timestamp: timestamp,
            rawDate: dateCol ? row[dateCol] : null
        });
    });
    
    // 🔥 FIX: Sort by timestamp (newest first) - this puts most recent at TOP
    parsedArray.sort((a, b) => {
        if (a.timestamp && b.timestamp) {
            return b.timestamp - a.timestamp;
        }
        if (a.timestamp && !b.timestamp) return -1;
        if (!a.timestamp && b.timestamp) return 1;
        return 0;
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

// Render history list with latest at TOP (newest first)
function renderHistoryList(isNewReport = false, newReportId = null) {
    const listHtmls = document.querySelectorAll('#as-history-list');
    if (listHtmls.length === 0) return;
    
    if (allReports.length === 0) {
        listHtmls.forEach(listHtml => {
            listHtml.innerHTML = '<div class="text-center text-slate-500 text-xs py-8">No historical reports inside database.</div>';
        });
        return;
    }
    
    // Sort DESCENDING by upload time (newest first at TOP)
    const sorted = [...allReports].sort((a,b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    
    const htmlOutput = sorted.map((r, i) => {
        const isLatest = i === 0; // First item is newest
        const isNew = isNewReport && newReportId === r.id;
        const fileDate = r.reportDate || r.filename || 'Unknown Date';
        const uploadDate = new Date(r.uploadedAt).toLocaleDateString('en-GB');
        const uploadTime = new Date(r.uploadedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const isActive = currentReportData && currentReportData.id === r.id;
        
        const highlightClass = isNew ? 'report-item-new' : '';
        
        return `
            <div onclick="window.viewReport('${r.id}')" class="report-item bg-black/20 p-3 rounded-xl flex justify-between items-center cursor-pointer ${isActive ? 'active' : ''} ${highlightClass}" style="cursor:pointer; ${isNew ? 'animation: highlightPulse 0.5s ease-in-out 3;' : ''}">
                <div>
                    <div class="text-xs font-bold text-white flex items-center gap-2">
                        <i class="far fa-file-alt text-cyan-500"></i> ${fileDate}
                        ${isLatest ? '<span class="bg-cyan-500/20 text-cyan-400 text-[8px] px-1.5 py-0.5 rounded font-black tracking-widest uppercase">Latest</span>' : ''}
                        ${isNew ? '<span class="bg-green-500/20 text-green-400 text-[8px] px-1.5 py-0.5 rounded font-black tracking-widest uppercase animate-pulse">✨ NEW</span>' : ''}
                    </div>
                    <div class="text-[9px] text-slate-500 mt-0.5 ml-5 truncate w-32" title="${r.filename}">${r.filename || ''}</div>
                </div>
                <div class="text-[9px] text-slate-400 text-right">
                    <div><i class="far fa-user"></i> ${r.author || 'Admin'}</div>
                    <div class="mt-0.5 text-slate-600"><i class="far fa-clock"></i> ${uploadDate} ${uploadTime}</div>
                </div>
            </div>
        `;
    }).join('');
    
    listHtmls.forEach(listHtml => {
        listHtml.innerHTML = htmlOutput;
        
        // Auto-scroll to TOP when new report is added
        if (isNewReport && listHtml.parentElement) {
            setTimeout(() => {
                listHtml.parentElement.scrollTop = 0;
            }, 100);
        }
    });
    
    // Add CSS animations if not already present
    if (!document.getElementById('stats-highlight-style')) {
        const style = document.createElement('style');
        style.id = 'stats-highlight-style';
        style.textContent = `
            @keyframes highlightPulse {
                0% { background: rgba(6, 182, 212, 0); border-left: 3px solid transparent; }
                30% { background: rgba(6, 182, 212, 0.3); border-left: 3px solid #06b6d4; }
                70% { background: rgba(6, 182, 212, 0.15); border-left: 3px solid #06b6d4; }
                100% { background: rgba(6, 182, 212, 0); border-left: 3px solid transparent; }
            }
            @keyframes rowHighlight {
                0% { background: rgba(34, 197, 94, 0); transform: scale(1); }
                30% { background: rgba(34, 197, 94, 0.3); transform: scale(1.02); }
                70% { background: rgba(34, 197, 94, 0.15); transform: scale(1.01); }
                100% { background: rgba(34, 197, 94, 0); transform: scale(1); }
            }
            .report-item-new {
                background: rgba(6, 182, 212, 0.1) !important;
                border-left: 3px solid #06b6d4;
                animation: highlightPulse 0.5s ease-in-out 3;
            }
            .report-item {
                transition: all 0.2s ease;
                border-left: 3px solid transparent;
            }
            .report-item:hover {
                background: rgba(255, 255, 255, 0.08) !important;
                transform: translateX(4px);
            }
            .report-item.active {
                background: rgba(6, 182, 212, 0.15) !important;
                border-left-color: #06b6d4;
            }
            .new-lead-row {
                animation: rowHighlight 0.8s ease-in-out 2;
                background: rgba(34, 197, 94, 0.15);
                border-left: 3px solid #22c55e;
            }
            .as-ret-btn.active-ret {
                background: rgba(6, 182, 212, 0.2);
                border-color: #06b6d4;
                color: #22d3ee;
            }
        `;
        document.head.appendChild(style);
    }
}

window.viewReport = function(id) {
    const report = allReports.find(r => r.id === id);
    if (!report) return;
    
    // Store previous lead counts for comparison
    if (currentReportData && currentReportData.data) {
        previousReportLeadCounts.clear();
        currentReportData.data.forEach(row => {
            const key = `${row.agentId}_${row.agentName}`;
            previousReportLeadCounts.set(key, {
                duration: row.duration,
                status: row.status,
                agentName: row.agentName,
                agentId: row.agentId
            });
        });
    }
    
    currentReportData = report;
    
    // Find new leads in this report compared to previous
    newLeadsList = [];
    if (previousReportLeadCounts.size > 0) {
        report.data.forEach(row => {
            const key = `${row.agentId}_${row.agentName}`;
            const previous = previousReportLeadCounts.get(key);
            const isXfer = row.duration >= 120;
            
            if (isXfer) {
                if (!previous) {
                    newLeadsList.push(row);
                } else if (previous.duration < 120 && row.duration >= 120) {
                    newLeadsList.push(row);
                }
            }
        });
    } else {
        report.data.forEach(row => {
            if (row.duration >= 120) {
                newLeadsList.push(row);
            }
        });
    }
    
    console.log(`Found ${newLeadsList.length} new leads in this report`);
    
    renderHistoryList();
    
    document.querySelectorAll('#as-report-title').forEach(el => el.innerText = '📊 Report: ' + report.reportDate);
    document.querySelectorAll('#as-report-date').forEach(el => el.innerHTML = `<i class="far fa-calendar-alt mr-1"></i> Uploaded ${new Date(report.uploadedAt).toLocaleDateString()} at ${new Date(report.uploadedAt).toLocaleTimeString()}`);
    document.querySelectorAll('#as-report-author').forEach(el => el.innerHTML = `<i class="far fa-user mr-1"></i> ${report.author}`);
    
    // Wire up delete button (Super Admin only)
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
    
    // Wire up Push Button (Super Admin only)
    const pushBtns = document.querySelectorAll('#as-push-btn');
    pushBtns.forEach(pushBtn => {
        const cAdmin = JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');
        if (cAdmin.role === 'super_admin' || cAdmin.isSuper) {
            pushBtn.classList.remove('hidden');
            pushBtn.onclick = async () => {
                if(confirm(`WARNING: This will overwrite the "TODAY" Live Leaderboard with this report (${report.reportDate}). Continue?`)) {
                    
                    const aggMap = {};
                    report.data.forEach(d => {
                        const nameKey = (d.agentName || 'UNKNOWN').trim().toUpperCase();
                        const id = d.agentId || d.ytelId || d.agentName;
                        const rawKey = d.rawName || d.agentName;
                        if(!aggMap[nameKey]) aggMap[nameKey] = { name: d.agentName, rawName: rawKey, transfers: 0, ytelId: id };
                        if(d.duration >= 120) aggMap[nameKey].transfers++;
                    });
                    const aggregatedList = Object.values(aggMap);
                    
                    const pushState = {
                        dateLabel: report.reportDate,
                        pushedAt: new Date().toISOString(),
                        pushedBy: report.author || 'Manual Push',
                        sourceReportId: report.id,
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
                            window.writeAdminActivityLog('push_dashboard', `Manually Pushed Report to Live Dashboard: ${report.reportDate}`);
                        }
                    }
                }
            };
        } else {
            pushBtn.classList.add('hidden');
        }
    });
    
    renderActiveReportTable();
};

window.sortAgentStats = function(col) {
    if (asSortCol === col) {
        asSortAsc = !asSortAsc;
    } else {
        asSortCol = col;
        asSortAsc = (col === 'agentName' || col === 'agentId');
    }
    renderActiveReportTable();
};

// Render table with new leads highlighted and shown at TOP
function renderActiveReportTable() {
    if (!currentReportData) return;
    
    const rawRows = currentReportData.data;
    
    const totalXfers = rawRows.filter(d => (d.duration || 0) >= 120).length;
    const totalCalls = rawRows.length;
    const agentCount = new Set(rawRows.map(d => d.agentId)).size;
    
    document.querySelectorAll('#as-stat-agents').forEach(el => el.innerText = agentCount);
    document.querySelectorAll('#as-stat-calls').forEach(el => el.innerText = totalCalls);
    document.querySelectorAll('#as-stat-transfers').forEach(el => el.innerText = totalXfers);
    document.querySelectorAll('#as-stat-rate').forEach(el => el.innerText = agentCount > 0 ? ((totalXfers / agentCount)*100).toFixed(1) + '%' : '0%');
    
    let displayRows = [...rawRows];
    
    let searchVal = '';
    const searchInput = document.getElementById('as-search-input');
    if (searchInput) searchVal = searchInput.value.toLowerCase().trim();
    if (searchVal) {
        displayRows = displayRows.filter(d => d.agentName.toLowerCase().includes(searchVal) || d.agentId.toLowerCase().includes(searchVal));
    }
    
    const newLeadIds = new Set();
    newLeadsList.forEach(lead => {
        const key = `${lead.agentId}_${lead.agentName}`;
        newLeadIds.add(key);
    });
    
    // Sort: new leads first, then by timestamp (newest first), then by name
    displayRows.sort((a, b) => {
        const aIsNew = newLeadIds.has(`${a.agentId}_${a.agentName}`);
        const bIsNew = newLeadIds.has(`${b.agentId}_${b.agentName}`);
        
        if (aIsNew && !bIsNew) return -1;
        if (!aIsNew && bIsNew) return 1;
        
        // Sort by timestamp if available (newest first)
        if (a.timestamp && b.timestamp) {
            return b.timestamp - a.timestamp;
        }
        
        const aIsXfer = a.duration >= 120;
        const bIsXfer = b.duration >= 120;
        
        if (aIsXfer && !bIsXfer) return -1;
        if (!aIsXfer && bIsXfer) return 1;
        
        if (a.duration !== b.duration) {
            return b.duration - a.duration;
        }
        
        return a.agentName.localeCompare(b.agentName);
    });
    
    const tbodies = document.querySelectorAll('#as-table-body');
    if (displayRows.length === 0) {
        tbodies.forEach(tbody => tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-slate-500 text-xs italic">No matching leads found.<\/td><\/tr>`);
        return;
    }

    const chunkSize = 50;
    let currentIndex = 0;
    tbodies.forEach(tbody => tbody.innerHTML = '');

    function renderNextChunk() {
        const nextBatch = displayRows.slice(currentIndex, currentIndex + chunkSize);
        const html = nextBatch.map(d => {
            const isXfer = (d.duration || 0) >= 120;
            const typeColor = isXfer ? 'text-cyan-400 font-bold' : 'text-slate-600';
            const typeLabel = isXfer ? 'XFER' : 'CONN';
            
            const key = `${d.agentId}_${d.agentName}`;
            const isNewLead = newLeadIds.has(key);
            const highlightClass = isNewLead ? 'new-lead-row' : '';
            const newLeadIndicator = isNewLead ? '<span class="ml-2 text-[10px] bg-green-500/30 text-green-400 px-1.5 py-0.5 rounded-full animate-pulse">⭐ NEW</span>' : '';
            
            return `
                <tr class="border-b border-white/5 hover:bg-white/5 transition group text-[11px] ${highlightClass}">
                    <td class="p-3 text-slate-500 font-mono">${escapeHtml(d.agentId)}<\/td>
                    <td class="p-3 font-bold text-white uppercase group-hover:text-cyan-300 transition">
                        ${escapeHtml(d.rawName || d.agentName)}
                        ${newLeadIndicator}
                    <\/td>
                    <td class="p-3 text-center text-slate-400 truncate max-w-[100px]" title="${escapeHtml(d.status)}">${escapeHtml(d.status)}<\/td>
                    <td class="p-3 text-center text-slate-300 font-mono">${d.duration}s<\/td>
                    <td class="p-3 text-right ${typeColor}">${typeLabel}<\/td>
                 \u007d\u007d
            `;
        }).join('');

        tbodies.forEach(tbody => tbody.insertAdjacentHTML('beforeend', html));
        currentIndex += chunkSize;

        if (currentIndex < displayRows.length) {
            requestAnimationFrame(renderNextChunk);
        } else {
            if (newLeadsList.length > 0) {
                setTimeout(() => {
                    const tableContainer = document.querySelector('.glass.rounded-3xl.overflow-hidden');
                    if (tableContainer) tableContainer.scrollTop = 0;
                }, 100);
            }
        }
    }

    renderNextChunk();
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
