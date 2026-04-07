const API_URL = 'https://script.google.com/macros/s/AKfycby3xpXiC8RAO5aZhGxjHO5XhnkzrwYv8quohxZSLpAkWSqc1JOizkMfVCS9txooz_uCTA/exec';

// ── DO NOT CALL LIST ──
const DNC_API_URL = 'https://script.google.com/macros/s/AKfycbxWKiLsRSpxOkes8wgArJ0fa6Ww4hA6EYqgik_lithTNeVrG9Qec3tOHeLRgecfcH6SVA/exec';
const WEEKLY_PASSWORD = 'bizlevelup2025';
const DAY_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat'];
const DAY_FULL  = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
let agents = [], dayHistory = [];

// ── CLIENT-SIDE GUYANA DAY DETECTION ──
function getGuyanaToday() {
  const dayName = new Date().toLocaleDateString('en-US', { timeZone: 'America/Guyana', weekday: 'long' });
  const valid = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  return valid.includes(dayName) ? dayName : 'Monday';
}
let lookupHistory = [];
try { lookupHistory = JSON.parse(localStorage.getItem('bizlookup_history') || '[]'); } catch(e) {}

function getTeam(name) { return (!name) ? 'PR' : name.trim().startsWith('GYB') ? 'BB' : 'PR'; }
