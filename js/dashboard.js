/**
 * BIZ LEVEL UP DASHBOARD - MAIN CORE
 * Handles data fetching, UI rendering, and Lead Alert integration.
 */

let currentTab = 'daily';
let dashboardData = [];

/**
 * 1. INITIALIZE LEAD ALERTS
 * This runs when the page loads to tell the alert system who is watching.
 */
function syncLeadAlertUser() {
    const agentName = sessionStorage.getItem('agentName') || 'Guest';
    const ytelId = sessionStorage.getItem('ytelId') || '';
    
    if (typeof initLeadAlerts === 'function') {
        initLeadAlerts(agentName, ytelId);
        console.log("Lead Alerts synced for:", agentName);
    }
}

/**
 * 2. MAIN UPDATE FUNCTION
 * Fetches data from your API/Sheet and updates the UI.
 */
async function updateDashboard() {
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) refreshBtn.classList.add('fa-spin');

    try {
        // Replace this URL with your actual Google Apps Script / Firebase URL
        const response = await fetch(CONFIG.API_URL); 
        const data = await response.json();
        
        dashboardData = data;
        
        // Render the UI
        renderLeaderboard(data);
        updateSystemTime();
        
        // TRIGGER LEAD ALERTS CHECK
        if (typeof checkForNewLeads === 'function') {
            checkForNewLeads(data);
        }

        document.getElementById('timestamp').innerText = `Last Sync: ${new Date().toLocaleTimeString()}`;
    } catch (error) {
        console.error("Dashboard Sync Error:", error);
        const status = document.getElementById('system-status');
        if (status) {
            status.innerText = "SYSTEM OFFLINE";
            status.style.color = "#ff4444";
        }
    } finally {
        if (refreshBtn) refreshBtn.classList.remove('fa-spin');
    }
}

/**
 * 3. RENDER LEADERBOARD
 */
function renderLeaderboard(data) {
    const container = document.getElementById('leaderboard-container');
    if (!container) return;

    // Filter logic based on tab
    let filtered = data;
    if (currentTab === 'daily') {
        // logic to filter daily rows
    }

    // Sort by leads descending
    filtered.sort((a, b) => (parseInt(b.leads) || 0) - (parseInt(a.leads) || 0));

    let html = '';
    filtered.forEach((rep, index) => {
        const isTop = index < 3;
        html += `
            <div class="rep-card ${isTop ? 'top-three' : ''}">
                <div class="rep-rank">#${index + 1}</div>
                <div class="rep-info">
                    <span class="rep-name">${rep.name}</span>
                    <span class="rep-team">${rep.team || 'BIZ'}</span>
                </div>
                <div class="rep-stats">
                    <span class="stat-leads">${rep.leads}</span>
                    <span class="stat-label">LEADS</span>
                </div>
            </div>
        `;
    });

    container.innerHTML = html || '<div class="no-data">No active leads found.</div>';
}

/**
 * 4. SYSTEM CLOCKS
 */
function updateSystemTime() {
    const options = { hour: '2-digit', minute: '2-digit', hour12: true };
    
    // Guyana Time (UTC-4)
    const guyanaTime = new Intl.DateTimeFormat('en-US', {
        ...options, timeZone: 'America/Guyana'
    }).format(new Date());
    
    // California Time (UTC-7/8)
    const caliTime = new Intl.DateTimeFormat('en-US', {
        ...options, timeZone: 'America/Los_Angeles'
    }).format(new Date());

    if (document.getElementById('clock-guyana')) document.getElementById('clock-guyana').innerText = guyanaTime;
    if (document.getElementById('clock-california')) document.getElementById('clock-california').innerText = caliTime;
}

/**
 * 5. TAB SWITCHING
 */
window.switchTab = function(tab) {
    currentTab = tab;
    
    // Update button styles
    document.querySelectorAll('.glass').forEach(btn => {
        btn.classList.remove('tab-active');
        btn.classList.add('text-slate-500');
    });
    
    const activeBtn = document.getElementById(`tab-${tab}`);
    if (activeBtn) {
        activeBtn.classList.add('tab-active');
        activeBtn.classList.remove('text-slate-500');
    }

    // Hide all views
    ['leaderboard-view', 'lookup-view', 'playbook-view', 'rebuttals-view', 'prank-view', 'trivia-view'].forEach(view => {
        const el = document.getElementById(view);
        if (el) el.classList.add('hidden');
    });

    // Show correct view
    const viewMap = {
        daily: 'leaderboard-view',
        lookup: 'lookup-view',
        playbook: 'playbook-view',
        rebuttals: 'rebuttals-view',
        prank: 'prank-view',
        trivia: 'trivia-view'
    };
    
    const targetView = document.getElementById(viewMap[tab]);
    if (targetView) targetView.classList.remove('hidden');

    if (tab === 'daily') renderLeaderboard(dashboardData);
};

// INITIALIZE ON LOAD
document.addEventListener('DOMContentLoaded', () => {
    syncLeadAlertUser();
    updateDashboard();
    setInterval(updateDashboard, 30000); // Auto-refresh every 30 seconds
    setInterval(updateSystemTime, 1000); // Clock update every second
});
