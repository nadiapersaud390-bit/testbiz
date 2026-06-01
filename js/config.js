const API_URL = 'https://script.google.com/macros/s/AKfycbyRxs3TigaCWv8_HAv43kzQOBlk-xRk02kGM3iJrsBIXCU-7E2UuXUkbTwTVeHY5Ucigw/exec';
const LOOKUP_API_URL = 'https://script.google.com/macros/s/AKfycbyRxs3TigaCWv8_HAv43kzQOBlk-xRk02kGM3iJrsBIXCU-7E2UuXUkbTwTVeHY5Ucigw/exec';
const WEEKLY_PASSWORD = 'bizlevelup2025';
const DAY_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat'];
const DAY_FULL  = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const TEAM_CONFIG = {
  PR: { label: 'PROV', short: 'Prov', color: '#a78bfa', rgb: '167,139,250' },
  BB: { label: 'BERB', short: 'Berb', color: '#c084fc', rgb: '192,132,252' },
  RM: { label: 'RM', short: 'Remote', color: '#38bdf8', rgb: '56,189,248' }
};
const REMOTE_AGENT_NAMES = new Set([
  'GTM ALICE HERNANDEZ',
  'GTM MAY UMANDAL',
  'GYP BIBI SAMUELS',
  'GYP CHAUNCEY PIERE',
  'GYP ERIKA SAMUELS',
  'GYP HANNAH BAPTISTE',
  'GYP NATHALIA CHARLES',
  'GYP NICHOLA MANGAR',
  'GYP NISHON GOMES',
  'GYP ROZANNA NIZAM'
]);
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
const PRANK_API_URL = 'https://script.google.com/macros/s/AKfycbxWKiLsRSpxOkes8wgArJ0fa6Ww4hA6EYqgik_lithTNeVrG9Qec3tOHeLRgecfcH6SVA/exec';

function normalizeTeam(team, name) {
  const rawTeam = String(team || '').trim().toUpperCase();
  const rawName = String(name || '').trim().toUpperCase();
  if (REMOTE_AGENT_NAMES.has(rawName)) return 'RM';
  if (rawName.startsWith('RM ') || rawName.startsWith('REMOTE ') || rawName.startsWith('GTR') || rawName.startsWith('GTM')) return 'RM';
  if (rawName.startsWith('GYB')) return 'BB';
  if (['RM', 'REMOTE'].includes(rawTeam)) return 'RM';
  if (['BB', 'BERB', 'BERBICE'].includes(rawTeam)) return 'BB';
  if (['PR', 'PROV', 'PROVIDENCE'].includes(rawTeam)) return 'PR';
  return 'PR';
}

function getTeam(name, team) {
  return normalizeTeam(team, name);
}

function getTeamMeta(team) {
  return TEAM_CONFIG[normalizeTeam(team)] || TEAM_CONFIG.PR;
}
