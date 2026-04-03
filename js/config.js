const API_URL = 'https://script.google.com/macros/s/YOUR_NEW_DEPLOYMENT_URL/exec';  // UPDATE THIS with your new URL
const WEEKLY_PASSWORD = 'bizlevelup2025';
const DAY_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat'];
const DAY_FULL  = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
let agents = [], dayHistory = [];
let currentTab = 'daily', currentDayView = 'today', weeklyUnlocked = false;

// ── CLIENT-SIDE GUYANA DAY DETECTION ──
// Uses America/Guyana timezone — same approach as the Apps Script.
// Overrides whatever todayName the API returns, preventing server-side TZ bugs.
function getGuyanaToday() {
  const dayName = new Date().toLocaleDateString('en-US', { timeZone: 'America/Guyana', weekday: 'long' });
  const valid = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  return valid.includes(dayName) ? dayName : 'Monday';
}

let lookupHistory = [];
try { 
  lookupHistory = JSON.parse(localStorage.getItem('bizlookup_history') || '[]'); 
} catch(e) {}

function getTeam(name) { 
  return (!name) ? 'PR' : name.trim().startsWith('GYB') ? 'BB' : 'PR'; 
}

// ── CACHING FOR DASHBOARD DATA ──
let cachedDashboardData = null;
let lastDashboardFetch = 0;
const DASHBOARD_CACHE_DURATION = 30000; // 30 seconds cache

async function fetchDashboardData(forceRefresh = false) {
  const now = Date.now();
  
  // Return cached data if still fresh
  if (!forceRefresh && cachedDashboardData && (now - lastDashboardFetch) < DASHBOARD_CACHE_DURATION) {
    return cachedDashboardData;
  }
  
  try {
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error('Network response was not ok');
    const data = await response.json();
    
    // Update cache
    cachedDashboardData = data;
    lastDashboardFetch = now;
    
    return data;
  } catch (error) {
    console.error('Dashboard fetch error:', error);
    // Return cached data if available, otherwise re-throw
    if (cachedDashboardData) return cachedDashboardData;
    throw error;
  }
}

// ── EXPORT FOR OTHER SCRIPTS ──
window.fetchDashboardData = fetchDashboardData;
window.DASHBOARD_CACHE_DURATION = DASHBOARD_CACHE_DURATION;
