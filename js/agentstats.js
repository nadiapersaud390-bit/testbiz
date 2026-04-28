/**
 * Agent Stats logic for parsing dialer CSVs and syncing them to Firebase + Leaderboard
 * PRESERVES EXACT CSV ORDER - NO SORTING WHATSOEVER
 * FIXED: Allows momo (admin) to access Agent Stats
 * FIXED: Counts leads based ONLY on duration >= 120 seconds (Status column ignored for counting)
 */

let allReports = [];
let currentReportData = null;
let asSortCol = 'agentName';
let asSortAsc = true;
let asSubscribed = false;

let lastAutoPushedReportId = null;
let previousReportData = null;
let _asLastUploadedDateLabel = null;

// Helper function to check if current user can access Agent Stats
// 🔥 FIXED: Allows rose (super admin) AND momo (admin)
function canAccessAgentStats() {
    const currentAdmin = JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');
    const email = String(currentAdmin.email || '').toLowerCase();
    
    // Super Admin (rose) has access
    if (email === 'rose') return true;
    
    // Admin (momo) has access
    if (email === 'momo') return true;
    
    // Also check role property
    if (currentAdmin.role === 'super_admin') return true;
    if (currentAdmin.isSuper === true) return true;
    
    return false;
}

// Returns true if a CSV agent-name represents a PH (Philippines) training account.
function isPhTrainingName(rawName) {
    if (!rawName) return false;
    const t = String(rawName).trim();
    return /^PH(?![A-Za-z])/i.test(t);
}

// 🔥 FIXED: Determines if a row counts as a lead based ONLY on duration
// A lead counts if the call duration is 120 seconds or more
// Status column (XFER/CONN/etc.) does NOT matter for counting
function isLead(row) {
    const duration = Number(row.duration) || 0;
    
    // If duration is 0, never count as a lead
    if (duration === 0) return false;
    
    // Count as lead if duration >= 120 seconds
    return duration >= 120;
}

function normalizeReportDateLabel(input) {
    if (!input) return "Unknown Date";
    const raw = String(input).trim();
    let d = null;
    const mdy = raw.match(/^(\d{1,2})[\/\-_](\d{1,2})[\/\-_](\d{2,4})/);
    if (mdy) {
        let yr = parseInt(mdy[3], 10);
        if (yr < 100) yr += 2000;
        d = new Date(yr, parseInt(mdy[1], 10) - 1, parseInt(mdy[2], 10));
    } else {
        const cleaned = raw.replace(/\s*\([^)]*\)\s*$/, "").trim();
        d = new Date(cleaned);
    }
    if (!d || isNaN(d.getTime())) return raw;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
           " (" + d.toLocaleDateString("en-US", { weekday: "short" }) + ")";
}

window.renderAgentStatsHistory = function() {
    // 🔥 FIXED: Use the new access check function
    const hasAccess = canAccessAgentStats();
    
    if (!hasAccess) {
        const container = document.getElementById('ah-sect-stats');
        if (container) {
            container.innerHTML = '<div class="p-20 text-center"><i class="fas fa-lock text-5xl text-red-500 mb-4"></i><p class="text-slate-400 font-bold uppercase tracking-widest">Access Denied</p><p class="text-slate-500 text-sm mt-2">Agent Stats is only available for Authorized Admins.</p></div>';
        }
        return;
    }
    
    if (asSubscribed) {
        if (currentReportData) {
            viewReport(currentReportData.id);
        } else if (allReports.length > 0) {
            const sortedForDisplay = [...allReports].sort((a,b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
            if (sortedForDisplay.length > 0) {
                viewReport(sortedForDisplay[0].id);
            }
        }
    } else if (typeof window.listenForAgentReports === 'function') {
        window.listenForAgentReports(data => {
            allReports = data || [];
            window.allAgentReports = allReports;
            
            const now = new Date();
            allReports.forEach(r => {
                const expires = new Date(r.expiresAt);
                if (now > expires) {
                    if (typeof window.deleteAgentReportFromFirebase === 'function') {
                        window.deleteAgentReportFromFirebase(r.id);
                    }
                }
            });
            
            renderHistoryList();
            
            if (allReports.length > 0) {
                const sortedForDisplay = [...allReports].sort((a,b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
                
                if (_asLastUploadedDateLabel) {
                    const justUploaded = sortedForDisplay.find(r => normalizeReportDateLabel(r.reportDate) === _asLastUploadedDateLabel);
                    _asLastUploadedDateLabel = null;
                    if (justUploaded) {
                        viewReport(justUploaded.id);
                    } else {
                        viewReport(sortedForDisplay[0].id);
                    }
                } else if (!currentReportData) {
                    viewReport(sortedForDisplay[0].id);
                } else {
                    const stillExists = allReports.find(r => r.id === currentReportData.id);
                    if (!stillExists) viewReport(sortedForDisplay[0].id);
                }
            }
            
            if (allReports.length > 0) {
                const latestReport = [...allReports].sort((a,b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))[0];
                if (lastAutoPushedReportId !== latestReport.id) {
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

async function autoPushReportToDashboard(report) {
    if (!report || !report.data) return;
    
    const today = new Date();
    const todayCanon = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const reportCanon = (normalizeReportDateLabel(report.reportDate) || '').split(' (')[0];
    
    if (!reportCanon || reportCanon !== todayCanon) {
        console.log('[autoPush] Skipped — report date', reportCanon, 'is not today', todayCanon);
        return;
    }
    
    const aggMap = {};
    report.data.forEach(d => {
        const nameKey = (d.agentName || 'UNKNOWN').trim().toUpperCase();
        const rawKey = d.rawName || d.agentName;
        if(!aggMap[nameKey]) aggMap[nameKey] = { name: d.agentName, rawName: rawKey, transfers: 0 };
        if(isLead(d)) aggMap[nameKey].transfers++;
    });
    const aggregatedList = Object.values(aggMap);
    
    const pushState = {
        dateLabel: report.reportDate,
        pushedAt: new Date().toISOString(),
        pushedBy: report.author || 'Auto-Push System',
        sourceReportId: report.id,
        agents: aggregatedList.map(d => ({
            name: d.name,
            team: typeof normalizeTeam === 'function' ? normalizeTeam('', d.rawName) : 'PR',
            dailyLeads: d.transfers
        }))
    };
    
    if (typeof window.saveLiveDashboardState === 'function') {
        await window.saveLiveDashboardState(pushState);
        if (typeof window.updateDashboard === 'function') setTimeout(() => window.updateDashboard(), 500);
        if (typeof window.writeAdminActivityLog === 'function') {
            window.writeAdminActivityLog('auto_push', `Auto-pushed Report: ${report.reportDate}`);
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
    
    const normalizedFinalDate = normalizeReportDateLabel(finalDateStr);
    
    // DELETE existing report for this date completely
    const existingReport = allReports.find(r => normalizeReportDateLabel(r.reportDate) === normalizedFinalDate);
    if (existingReport && typeof window.deleteAgentReportFromFirebase === 'function') {
        await window.deleteAgentReportFromFirebase(existingReport.id);
        console.log(`[Upload] Deleted existing report for ${normalizedFinalDate} - will replace with fresh data`);
    }
    
    // Calculate lead counts for success message with per-agent breakdown
    const agentLeadMap = {};
    _asStagedParsed.forEach(row => {
        const agentName = row.agentName;
        if (!agentName) return;
        if (!agentLeadMap[agentName]) agentLeadMap[agentName] = 0;
        if (isLead(row)) agentLeadMap[agentName]++;
    });
    
    const totalRows = _asStagedParsed.length;
    const totalLeads = Object.values(agentLeadMap).reduce((a, b) => a + b, 0);
    
    console.log('[Upload] Per-agent lead counts:', agentLeadMap);
    
    // Create brand new report with FRESH data
    const reportObj = {
        filename: _asStagedFile.name,
        reportDate: finalDateStr,
        dayOfWeek: dayName,
        uploadedAt: new Date().toISOString(),
        expiresAt: expiryDate.toISOString(),
        author: adminName,
        data: _asStagedParsed
    };
    
    _asLastUploadedDateLabel = normalizedFinalDate;
    
    if (typeof window.saveAgentReportToFirebase === 'function') {
        const res = await window.saveAgentReportToFirebase(reportObj);
        if (res && res.success) {
            updateStatsStatus(`✅ Saved! ${totalRows} rows, ${totalLeads} leads (duration >= 120 sec) - Replaced previous data`, false);
            
            if (typeof window.writeAdminActivityLog === 'function') {
                window.writeAdminActivityLog('upload_stats', `Uploaded (replaced): ${_asStagedFile.name} (${totalRows} rows, ${totalLeads} leads)`);
            }
            
            document.getElementById('as-upload-panel').classList.add('hidden');
            _asStagedFile = null;
            _asStagedParsed = null;
            currentReportData = null;
            setTimeout(() => updateStatsStatus('', false), 4000);
        } else {
            updateStatsStatus('❌ Failed to save', true);
        }
    }
};

async function handleFileUpload(file) {
    if (!file.name.endsWith('.csv')) {
        updateStatsStatus('❌ Please upload a CSV file', true);
        return;
    }
    
    updateStatsStatus('<i class="fas fa-spinner fa-spin mr-2"></i> Reading file...', false);
    
    let fileDateStr = null;
    const dateMatch = file.name.match(/(\d{2})[-_](\d{2})[-_](\d{4})/);
    if (dateMatch) {
        fileDateStr = `${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}`;
    }
    if (!fileDateStr) fileDateStr = file.name.replace(/\.csv$/i, '');
    
    const text = await file.text();
    let lines = text.split(/\r?\n/);
    
    let headerIdx = -1;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].toLowerCase();
        if (line.includes('agent id') && line.includes('agent name')) {
            headerIdx = i;
            break;
        }
        if (line.includes('agent name')) {
            headerIdx = i;
            break;
        }
    }
    
    if (headerIdx === -1) {
        updateStatsStatus('❌ Could not find "Agent Name" header in CSV', true);
        return;
    }
    
    const headers = lines[headerIdx].split(',').map(h => h.replace(/^"|"$/g, '').trim());
    
    const parsedData = [];
    for (let i = headerIdx + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const values = [];
        let inQuote = false;
        let current = '';
        for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"') {
                inQuote = !inQuote;
            } else if (char === ',' && !inQuote) {
                values.push(current.replace(/^"|"$/g, '').trim());
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current.replace(/^"|"$/g, '').trim());
        
        if (values.length < 5) continue;
        
        const row = {};
        headers.forEach((h, idx) => {
            row[h] = values[idx] || '';
        });
        
        const agentId = row['Agent Id'] || '';
        const agentNameRaw = row['Agent Name'] || '';
        const status = row['Current Status'] || '';
        const durationRaw = row['Duration'] || '0';
        
        if (isPhTrainingName(agentNameRaw)) continue;
        if (!agentNameRaw.trim() || agentNameRaw.trim() === 'UNKNOWN') continue;
        
        let team = 'PR';
        const upperRaw = agentNameRaw.toUpperCase().trim();
        if (upperRaw.startsWith('GYB ') || upperRaw.startsWith('GYB\t')) team = 'BB';
        else if (upperRaw.startsWith('GYP ') || upperRaw.startsWith('GYP\t')) team = 'PR';
        else if (upperRaw.startsWith('GTM ') || upperRaw.startsWith('GTM\t')) team = 'RM';
        else if (upperRaw.startsWith('RM ') || upperRaw.startsWith('RM\t')) team = 'RM';

        const agentName = agentNameRaw.replace(/^(GYP|GYB|GTM|RM)\s+/i, '').trim();
        
        let duration = 0;
        if (durationRaw.includes(':')) {
            const parts = durationRaw.split(':').map(Number);
            if (parts.length === 2) duration = parts[0] * 60 + parts[1];
            else if (parts.length === 3) duration = parts[0] * 3600 + parts[1] * 60 + parts[2];
        } else {
            duration = parseInt(durationRaw, 10) || 0;
        }
        
        parsedData.push({
            agentId: agentId,
            agentName: agentName,
            rawName: agentNameRaw,
            team: team,
            status: status.toUpperCase(),
            duration: duration
        });
    }
    
    if (parsedData.length === 0) {
        updateStatsStatus('❌ No valid data rows found in CSV', true);
        return;
    }
    
    _asStagedFile = file;
    _asStagedParsed = parsedData;
    _asStagedDateStr = fileDateStr;
    if (dateMatch) {
        _asStagedParsedDate = new Date(`${dateMatch[3]}-${dateMatch[1]}-${dateMatch[2]}`);
        if (isNaN(_asStagedParsedDate.getTime())) _asStagedParsedDate = new Date();
    } else {
        _asStagedParsedDate = new Date();
    }
    _asRetentionDays = 30;
    
    const dateInput = document.getElementById('as-report-date-input');
    if (dateInput) dateInput.value = normalizeReportDateLabel(fileDateStr);
    
    asSetRetention(_asRetentionDays || 30);
    
    const panel = document.getElementById('as-upload-panel');
    if (panel) panel.classList.remove('hidden');
    
    // Show preview of what will be counted with per-agent breakdown
    const agentLeadMap = {};
    parsedData.forEach(row => {
        const agentName = row.agentName;
        if (!agentName) return;
        if (!agentLeadMap[agentName]) agentLeadMap[agentName] = 0;
        if (isLead(row)) agentLeadMap[agentName]++;
    });
    
    const leadCount = Object.values(agentLeadMap).reduce((a, b) => a + b, 0);
    const agentSummary = Object.entries(agentLeadMap).slice(0, 5).map(([name, count]) => `${name}: ${count}`).join(', ');
    
    updateStatsStatus(`✅ Ready: ${parsedData.length} rows, ${leadCount} qualified leads (duration >= 120 sec). ${agentSummary}${Object.keys(agentLeadMap).length > 5 ? '...' : ''}. This will REPLACE previous data.`, false);
    
    console.log('[File Upload] Per-agent lead counts:', agentLeadMap);
}

function updateStatsStatus(msg, isError) {
    const el = document.getElementById('as-upload-status');
    if (el) {
        el.innerHTML = msg;
        el.className = 'mt-4 text-[10px] text-center font-bold ' + (isError ? 'text-red-400' : 'text-cyan-400');
    }
}

function renderHistoryList() {
    const listHtml = document.getElementById('as-history-list');
    if (!listHtml) return;
    
    if (allReports.length === 0) {
        listHtml.innerHTML = '<div class="text-center text-slate-500 text-xs py-8">No reports found.</div>';
        return;
    }
    
    const sorted = [...allReports].sort((a,b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    
    listHtml.innerHTML = sorted.map(r => {
        const isActive = currentReportData && currentReportData.id === r.id;
        const uploadDateTime = new Date(r.uploadedAt).toLocaleString();
        const niceDate = normalizeReportDateLabel(r.reportDate);
        const _ca = JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');
        // 🔥 FIXED: Allow momo to see delete button
        const canDelete = _ca.email === 'rose' || _ca.email === 'momo' || _ca.role === 'super_admin' || _ca.isSuper;
        const delBtn = canDelete ? `<button onclick="event.stopPropagation(); window.asDeleteReport('${r.id}')" class="text-[10px] text-red-400 hover:text-red-300 ml-2 px-2 py-1 rounded-md hover:bg-red-500/10" title="Delete this report"><i class="fas fa-trash"></i></button>` : '';
        return `
            <div onclick="window.viewReport('${r.id}')" class="report-item bg-black/20 p-3 rounded-xl cursor-pointer flex items-center justify-between gap-2 ${isActive ? 'active' : ''}">
                <div class="min-w-0">
                    <div class="text-xs font-bold text-white truncate">📊 ${niceDate}</div>
                    <div class="text-[8px] text-slate-500 mt-1 truncate">${r.author || 'Admin'} • ${uploadDateTime}</div>
                </div>
                ${delBtn}
            </div>
        `;
    }).join('');
}

window.viewReport = function(id) {
    const report = allReports.find(r => r.id === id);
    if (!report) return;
    
    if (currentReportData && currentReportData.data) {
        previousReportData = currentReportData;
    }
    
    currentReportData = report;
    
    renderHistoryList();
    
    const uploadDateTime = new Date(report.uploadedAt).toLocaleString();
    document.querySelectorAll('#as-report-title').forEach(el => el.innerText = '📊 Report: ' + normalizeReportDateLabel(report.reportDate));
    document.querySelectorAll('#as-report-date').forEach(el => el.innerHTML = `<i class="far fa-calendar-alt mr-1"></i> ${uploadDateTime}`);
    document.querySelectorAll('#as-report-author').forEach(el => el.innerHTML = `<i class="far fa-user mr-1"></i> ${report.author}`);
    
    const delBtns = document.querySelectorAll('#as-delete-btn');
    delBtns.forEach(delBtn => {
        const cAdmin = JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');
        // 🔥 FIXED: Allow momo to delete reports
        const canDelete = cAdmin.email === 'rose' || cAdmin.email === 'momo' || cAdmin.role === 'super_admin' || cAdmin.isSuper;
        if (canDelete) {
            delBtn.classList.remove('hidden');
            delBtn.onclick = () => {
                if (confirm('Delete this report?')) {
                    if (typeof window.deleteAgentReportFromFirebase === 'function') {
                        window.deleteAgentReportFromFirebase(id);
                        currentReportData = null;
                    }
                }
            };
        } else {
            delBtn.classList.add('hidden');
        }
    });
    
    const pushBtns = document.querySelectorAll('#as-push-btn');
    pushBtns.forEach(pushBtn => {
        const cAdmin = JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');
        // 🔥 FIXED: Allow momo to push reports
        const canPush = cAdmin.email === 'rose' || cAdmin.email === 'momo' || cAdmin.role === 'super_admin' || cAdmin.isSuper;
        if (canPush) {
            pushBtn.classList.remove('hidden');
            pushBtn.onclick = async () => {
                if (confirm(`Push ${report.reportDate} to Live Dashboard?`)) {
                    const aggMap = {};
                    report.data.forEach(d => {
                        const nameKey = d.agentName.toUpperCase().trim();
                        if (!aggMap[nameKey]) aggMap[nameKey] = { name: d.agentName, transfers: 0 };
                        if (isLead(d)) aggMap[nameKey].transfers++;
                    });
                    const pushState = {
                        dateLabel: report.reportDate,
                        pushedAt: new Date().toISOString(),
                        pushedBy: report.author,
                        agents: Object.values(aggMap).map(d => ({
                            name: d.name,
                            team: 'PR',
                            dailyLeads: d.transfers
                        }))
                    };
                    if (typeof window.saveLiveDashboardState === 'function') {
                        await window.saveLiveDashboardState(pushState);
                        pushBtn.innerHTML = '✅ Pushed!';
                        setTimeout(() => pushBtn.innerHTML = '🚀 Push to Daily Board', 2000);
                    }
                }
            };
        } else {
            pushBtn.classList.add('hidden');
        }
    });
    
    renderActiveReportTable();
};

function renderActiveReportTable() {
    if (!currentReportData) return;
    
    const rawRows = (currentReportData.data || []).filter(d => !isPhTrainingName(d && (d.rawName || d.agentName)));
    
    // Count leads per agent based ONLY on duration >= 120
    const agentLeadCount = {};
    rawRows.forEach(row => {
        const agentName = row.agentName;
        if (!agentName) return;
        if (!agentLeadCount[agentName]) agentLeadCount[agentName] = 0;
        if (isLead(row)) agentLeadCount[agentName]++;
    });
    
    const totalLeads = Object.values(agentLeadCount).reduce((a, b) => a + b, 0);
    const agentCount = Object.keys(agentLeadCount).length;
    
    document.querySelectorAll('#as-stat-agents').forEach(el => el.innerText = agentCount);
    document.querySelectorAll('#as-stat-calls').forEach(el => el.innerText = rawRows.length);
    document.querySelectorAll('#as-stat-transfers').forEach(el => el.innerText = totalLeads);
    document.querySelectorAll('#as-stat-rate').forEach(el => el.innerText = agentCount > 0 ? ((totalLeads / agentCount) * 100).toFixed(1) + '%' : '0%');
    
    let searchVal = '';
    const searchInput = document.getElementById('as-search-input');
    if (searchInput) searchVal = searchInput.value.toLowerCase().trim();
    
    let displayRows = rawRows;
    if (searchVal) {
        displayRows = rawRows.filter(d => d.agentName.toLowerCase().includes(searchVal) || d.agentId.toLowerCase().includes(searchVal));
    }
    
    const tbodies = document.querySelectorAll('#as-table-body');
    if (displayRows.length === 0) {
        tbodies.forEach(tbody => tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-slate-500">No matches found.基督</tr>`);
        return;
    }
    
    const html = displayRows.map(d => {
        const isLeadRow = isLead(d);
        const typeColor = isLeadRow ? 'text-cyan-400 font-bold' : 'text-slate-600';
        
        // Show duration and status for context
        let typeLabel = '';
        if (isLeadRow) {
            typeLabel = `✅ LEAD (${d.duration}s)`;
        } else if (d.duration === 0) {
            typeLabel = `⏳ 0s - No lead`;
        } else {
            typeLabel = `⏳ ${d.duration}s - No lead (needs 120s)`;
        }
        
        return `
            <tr class="border-b border-white/5 hover:bg-white/5 transition">
                <td class="p-3 text-slate-500 text-[11px] font-mono">${escapeHtml(d.agentId)}<\/td>
                <td class="p-3 font-bold text-white text-[12px] uppercase">
                    ${escapeHtml(d.rawName || d.agentName)}
                <\/td>
                <td class="p-3 text-center text-slate-400 text-[11px]">${escapeHtml(d.status)}<\/td>
                <td class="p-3 text-center text-slate-300 text-[11px] font-mono">${d.duration}s<\/td>
                <td class="p-3 text-right ${typeColor} text-[11px] font-bold">${typeLabel}<\/td>
            <\/tr>
        `;
    }).join('');
    
    tbodies.forEach(tbody => tbody.innerHTML = html);
}

window.asDeleteReport = async function(id) {
    if (!id) return;
    if (!confirm("Delete this report? This cannot be undone.")) return;
    if (typeof window.deleteAgentReportFromFirebase === "function") {
        await window.deleteAgentReportFromFirebase(id);
        if (currentReportData && currentReportData.id === id) {
            currentReportData = null;
        }
    }
};

window.asDeleteAllPrevious = async function() {
    if (!Array.isArray(allReports) || allReports.length === 0) return;
    const sorted = [...allReports].sort((a,b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    const latest = sorted[0];
    const toDelete = sorted.slice(1);
    if (toDelete.length === 0) {
        alert("No previous reports to delete.");
        return;
    }
    if (!confirm("Delete " + toDelete.length + " previous report" + (toDelete.length === 1 ? "" : "s") + "? The most recent (" + normalizeReportDateLabel(latest.reportDate) + ") will be kept.")) return;
    for (const r of toDelete) {
        if (typeof window.deleteAgentReportFromFirebase === "function") {
            await window.deleteAgentReportFromFirebase(r.id);
        }
    }
    if (typeof window.writeAdminActivityLog === "function") {
        window.writeAdminActivityLog("delete_previous_reports", "Deleted " + toDelete.length + " previous reports");
    }
};

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}
