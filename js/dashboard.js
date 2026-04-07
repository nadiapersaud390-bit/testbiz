/**
 * BIZ LEVEL UP DASHBOARD - MAIN CORE
 * Handles data fetching, UI rendering, and Lead Alert integration.
 */

let currentTab = 'daily';
let dashboardData = [];

/**
 * 1. INITIALIZE LEAD ALERTS
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
 */
async function updateDashboard() {
  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) refreshBtn.classList.add('fa-spin');

  try {
    const response = await fetch(CONFIG.API_URL);
    const data = await response.json();

    dashboardData = data;

    renderLeaderboard(data);
    updateSystemTime();

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

  let filtered = data;
  if (currentTab === 'daily') {
    // daily filter logic here if needed
  }

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

  const guyanaTime = new Intl.DateTimeFormat('en-US', {
    ...options, timeZone: 'America/Guyana'
  }).format(new Date());

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

  document.querySelectorAll('.glass').forEach(btn => {
    btn.classList.remove('tab-active');
    btn.classList.add('text-slate-500');
  });

  const activeBtn = document.getElementById(`tab-${tab}`);
  if (activeBtn) {
    activeBtn.classList.add('tab-active');
    activeBtn.classList.remove('text-slate-500');
  }

  ['leaderboard-view', 'lookup-view', 'playbook-view', 'rebuttals-view', 'prank-view', 'trivia-view'].forEach(view => {
    const el = document.getElementById(view);
    if (el) el.classList.add('hidden');
  });

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

/**
 * 6. INITIALIZE
 * Clock starts immediately. Dashboard waits for Firebase to be ready.
 */
document.addEventListener('DOMContentLoaded', () => {
  setInterval(updateSystemTime, 1000);
});

window.addEventListener('firebase-ready', () => {
  syncLeadAlertUser();
  updateDashboard();
  setInterval(updateDashboard, 30000);
});
