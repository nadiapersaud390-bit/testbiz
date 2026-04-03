const API_URL = 'https://script.google.com/macros/s/AKfycby3xpXiC8RAO5aZhGxjHO5XhnkzrwYv8quohxZSLpAkWSqc1JOizkMfVCS9txooz_uCTA/exec';
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
try { lookupHistory = JSON.parse(localStorage.getItem('bizlookup_history') || '[]'); } catch(e) {}

function getTeam(name) { return (!name) ? 'PR' : name.trim().startsWith('GYB') ? 'BB' : 'PR'; }
