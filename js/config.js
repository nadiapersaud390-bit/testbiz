const API_URL = 'https://script.google.com/macros/s/AKfycbyRxs3TigaCWv8_HAv43kzQOBlk-xRk02kGM3iJrsBIXCU-7E2UuXUkbTwTVeHY5Ucigw/exec';
const WEEKLY_PASSWORD = 'bizlevelup2025';
const DAY_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat'];
const DAY_FULL  = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

const TEAM_CONFIG = {
  PR: { label: 'PROV',  short: 'Prov',   color: '#a78bfa', rgb: '167,139,250', badgeClass: 'badge-prov' },
  BB: { label: 'BERB',  short: 'Berb',   color: '#c084fc', rgb: '192,132,252', badgeClass: 'badge-bb'   },
  RM: { label: 'RM',    short: 'Remote', color: '#38bdf8', rgb: '56,189,248',  badgeClass: 'badge-rm'   }
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
function getGuyanaToday() {
  const dayName = new Date().toLocaleDateString('en-US', { timeZone: 'America/Guyana', weekday: 'long' });
  const valid = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  return valid.includes(dayName) ? dayName : 'Monday';
}

let lookupHistory = [];
try { lookupHistory = JSON.parse(localStorage.getItem('bizlookup_history') || '[]'); } catch(e) {}

// Strip agent name prefixes (GYP, GTM, GYB, etc.) for clean display
function stripPrefix(raw) {
  return String(raw || '')
    .replace(/\n/g, ' ')
    .replace(/^GUYB\s+/i, '')
    .replace(/^GUYP\d*\s+/i, '')
    .replace(/^GYB\s+/i, '')
    .replace(/^GYP\d*\s+/i, '')
    .replace(/^GTM\s+/i, '')
    .replace(/^GUY\s+/i,  '')
    .replace(/^GUY[PB]?\d*-/i, '')
    .trim();
}

// Resolve the team code (PR / BB / RM) from roster team field + agent name
function normalizeTeam(team, name) {
  const rawTeam        = String(team || '').trim().toUpperCase();
  const rawName        = String(name || '').trim().toUpperCase();
  const rawNameNoSpace = rawName.replace(/[\s-]+/g, '');

  // 1. Explicit team field overrides everything
  if (['RM', 'REMOTE'].includes(rawTeam))               return 'RM';
  if (['BB', 'BERB', 'BERBICE'].includes(rawTeam))      return 'BB';
  if (['PR', 'PROV', 'PROVIDENCE'].includes(rawTeam))   return 'PR';

  // 2. Known remote agents list
  const isRemote = [...REMOTE_AGENT_NAMES].some(rn => {
    const cleanRN = rn.toUpperCase().replace(/[\s-]+/g, '');
    return rawName === rn.toUpperCase() || rawNameNoSpace === cleanRN;
  });
  if (isRemote) return 'RM';

  // 3. Name prefix auto-detection
  if (rawNameNoSpace.startsWith('RM')     ||
      rawNameNoSpace.startsWith('REMOTE') ||
      rawNameNoSpace.startsWith('GTR')    ||
      rawNameNoSpace.startsWith('GTM'))     return 'RM';
  if (rawNameNoSpace.startsWith('GUYP')  ||
      rawNameNoSpace.startsWith('GYP'))     return 'PR';
  if (rawNameNoSpace.startsWith('GUYB')  ||
      rawNameNoSpace.startsWith('GYB'))     return 'BB';

  return 'PR'; // default
}

function getTeam(name, team) {
  return normalizeTeam(team, name);
}

// Returns the full TEAM_CONFIG entry for a given team code/name
// Pass both team AND name so name-based detection fires correctly
function getTeamMeta(team, name) {
  const resolved = normalizeTeam(team, name || '');
  return TEAM_CONFIG[resolved] || TEAM_CONFIG.PR;
}

// Returns the CSS badge class string for the lb-card badge span
function getTeamBadgeClass(team, name) {
  const meta = getTeamMeta(team, name);
  return meta.badgeClass || 'badge-prov';
}
