let prevLeadCounts = {};
let leadAlertInitialized = false;
let alertViewerName = '';
const PRIVATE_ALERT_MESSAGES = [
  "Great transfer! Keep your momentum going. 🔥",
  "You're doing excellent work — stay focused and keep dialing. ⚡",
  "Strong result just now. Keep that same energy! 💪",
  "Nice job! Keep pushing and finish the shift strong. 🚀",
  "Beautiful execution on that call — keep it rolling. 🎯"
];

function normalizeName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function trimTeamPrefix(name) {
  const parts = String(name || '').trim().split(/\s+/);
  if (parts.length <= 1) return String(name || '').trim();
  const first = parts[0].toUpperCase();
  if (/^[A-Z]{2,4}$/.test(first) || /^GY[BP]$/.test(first)) return parts.slice(1).join(' ');
  return String(name || '').trim();
}

function isSameAgentName(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return normalizeName(trimTeamPrefix(a)) === normalizeName(trimTeamPrefix(b));
}

function getFirstName(fullName) {
  if (!fullName) return 'Rep';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length > 1 && parts[0].length <= 3 && /^[A-Z]+$/.test(parts[0])) return parts[1];
  return parts[0];
}

function checkLeadAlerts(newAgents) {
  if (!newAgents || !newAgents.length) return;
  const viewerRole = sessionStorage.getItem('bizUserRole') || 'agent';
  const sessionName = sessionStorage.getItem('currentAgentName');
  let profileName = '';
  try {
    const profile = JSON.parse(sessionStorage.getItem('currentAgentProfile') || '{}');
    profileName = profile && profile.name ? profile.name : '';
  } catch (e) {}
  alertViewerName = normalizeName(sessionName || profileName);

  // Start from tracker data if available, then merge in per-agent daily totals as fallback.
  const tracker = (newAgents[0] && newAgents[0].berbiceTracker) || {};
  let snapshot = Object.keys(tracker).length ? { ...tracker } : {};
  newAgents.forEach(a => {
    if (!a || !a.name) return;
    if (snapshot[a.name] === undefined || snapshot[a.name] === null) {
      snapshot[a.name] = a.dailyLeads || 0;
    }
  });
  if (!Object.keys(snapshot).length) return;

  // First load — initialize previous counts, but give each agent their own login-time status banner.
  if (!leadAlertInitialized) {
    Object.entries(snapshot).forEach(([n, c]) => { prevLeadCounts[n] = c; });
    leadAlertInitialized = true;

    if (viewerRole !== 'admin' && alertViewerName) {
      const ownEntry = Object.entries(snapshot).find(([name]) => isSameAgentName(name, alertViewerName));
      const ownCount = ownEntry ? (Number(ownEntry[1]) || 0) : 0;
      if (ownCount > 0) {
        const firstName = getFirstName(ownEntry[0]);
        const quote = LEAD_ALERT_QUOTES[Math.floor(Math.random() * LEAD_ALERT_QUOTES.length)];
        const plural = ownCount === 1 ? '' : 's';
        _renderAlert({
          icon: ownCount === 1 ? '🥇' : '🔥',
          name: 'Welcome back, ' + firstName + '!',
          msg: 'You currently have ' + ownCount + ' lead' + plural + ' today. Keep going!',
          quote,
          firstLead: ownCount === 1
        });
      }
    }
    return;
  }

  // Find reps with new leads
  const newReps = [];
  Object.entries(snapshot).forEach(([name, count]) => {
    const c = Number(count) || 0;
    const prev = Number(prevLeadCounts[name]) || 0;
    if (c > prev) newReps.push({ name, count: c, isFirst: prev === 0 });
    prevLeadCounts[name] = c;
  });

  if (viewerRole !== 'admin') {
    if (!alertViewerName) return;
    newReps.splice(0, newReps.length, ...newReps.filter(rep => isSameAgentName(rep.name, alertViewerName)));
  }
  if (!newReps.length) return;

  if (newReps.length === 1) {
    const { name, isFirst } = newReps[0];
    const firstName = getFirstName(name);
    const quote = LEAD_ALERT_QUOTES[Math.floor(Math.random() * LEAD_ALERT_QUOTES.length)];
    const msg = PRIVATE_ALERT_MESSAGES[Math.floor(Math.random() * PRIVATE_ALERT_MESSAGES.length)];
    _renderAlert({ icon: isFirst ? '🥇' : '🔥', name: 'Great job, ' + firstName + '!', msg, quote, firstLead: isFirst });
  } else {
    const hasFirstLeads = newReps.some(r => r.isFirst);
    const names = newReps.map(r => getFirstName(r.name));
    const nameStr = names.length === 2 ? names[0] + ' & ' + names[1]
      : names.slice(0,-1).join(', ') + ' & ' + names[names.length-1];
    const quote = LEAD_ALERT_QUOTES[Math.floor(Math.random() * LEAD_ALERT_QUOTES.length)];
    if (hasFirstLeads) {
      _renderAlert({ icon: '🥇', name: nameStr + ' hit the board!', msg: "Multiple reps getting their first lead of the day — the floor is heating up! 🔥", quote, firstLead: true });
    } else {
      _renderAlert({ icon: '⚡', name: nameStr + '!', msg: "Look at the team go! Everyone's putting up numbers! 💪", quote, firstLead: false });
    }
  }
}

function _renderAlert({icon, name, msg, quote, firstLead=false}) {
  const banner = document.getElementById('lead-alert-banner');
  const inner = banner.querySelector('.lab-inner');
  // Swap gold style for first lead, purple for regular
  if (firstLead) { inner.classList.add('first-lead'); } else { inner.classList.remove('first-lead'); }
  // Update content first, then show
  document.querySelector('.lab-icon').textContent = icon;
  document.getElementById('lab-text').innerHTML =
    escapeHtml(name) + '<span>' + escapeHtml(msg) + ' — ❭' + escapeHtml(quote) + '❮</span>';
  banner.classList.add('show');
  document.body.style.paddingTop = '72px';
  startTabBlink(icon + ' ' + name + (firstLead ? ' — First Lead Today!' : ' — New Lead!'));
}

function dismissLeadAlert() {
  document.getElementById('lead-alert-banner').classList.remove('show');
  document.body.style.paddingTop = '';
  stopTabBlink();
}

updateDashboard();
setInterval(updateDashboard,30000);
