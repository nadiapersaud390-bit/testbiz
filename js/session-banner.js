(function () {
  var SCHEDULE_API_URL = 'https://script.google.com/macros/s/AKfycbzAKQCxoAhX260aUZCjlH7P-DjfQKlSuUJ9V7QO0g71z6SDk5d5oEXyaTh4GoSWzEeXgQ/exec';

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, function (m) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
    });
  }

  function resolveLunchValue(data) {
    if (!data || typeof data !== 'object') return '—';
    var candidates = [
      data.lunch,
      data.lunchSlot,
      data.lunch_time,
      data.lunchTime,
      data['Lunch Slot'],
      data['Lunch']
    ];
    for (var i = 0; i < candidates.length; i += 1) {
      var v = candidates[i];
      if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
    }
    return '—';
  }

  function resolveShiftValue(data, fallback) {
    if (!data || typeof data !== 'object') return fallback || '—';
    var candidates = [
      data.shift,
      data.shiftSlot,
      data.shift_time,
      data.shiftTime,
      data['Shift'],
      data['Shift Slot']
    ];
    for (var i = 0; i < candidates.length; i += 1) {
      var v = candidates[i];
      if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
    }
    return fallback || '—';
  }

  async function refreshProfileFromSheet(profile) {
    if (!profile || !profile.ytelId) return profile;
    try {
      var res = await fetch(SCHEDULE_API_URL + '?action=getAgentSchedule&ytelId=' + encodeURIComponent(profile.ytelId));
      var data = await res.json();
      if (!data || !data.found) return profile;

      var resolvedLunch = resolveLunchValue(data);
      return Object.assign({}, profile, {
        name: data.name || profile.name,
        lunch: resolvedLunch === '—' ? (profile.lunch || '—') : resolvedLunch,
        shift: resolveShiftValue(data, profile.shift)
      });
    } catch (e) {
      return profile;
    }
  }

  function renderBannerHtml(profile, mount) {
    mount.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;padding:8px 12px;border-radius:10px;background:rgba(30,41,59,0.85);border:1px solid rgba(148,163,184,0.28);backdrop-filter:blur(4px);">' +
        '<div style="font-size:11px;font-weight:900;letter-spacing:0.09em;text-transform:uppercase;color:#22c55e;">Logged In Agent</div>' +
        '<div style="font-size:12px;font-weight:700;color:#e2e8f0;display:flex;gap:12px;flex-wrap:wrap;">' +
          '<span><strong style="color:#94a3b8;">Name:</strong> ' + escapeHtml(profile.name) + '</span>' +
          '<span><strong style="color:#94a3b8;">Ytel:</strong> ' + escapeHtml(profile.ytelId || '—') + '</span>' +
          '<span><strong style="color:#94a3b8;">Lunch:</strong> ' + escapeHtml(profile.lunch || '—') + '</span>' +
          '<span><strong style="color:#94a3b8;">Shift:</strong> ' + escapeHtml(profile.shift || '—') + '</span>' +
          '<span><strong style="color:#94a3b8;">Streak:</strong> 🔥 +' + escapeHtml(profile.streak || 1) + '</span>' +
        '</div>' +
      '</div>';
  }

  async function renderSessionBanner() {
    var role = sessionStorage.getItem('bizUserRole') || 'agent';
    if (role !== 'agent') return;

    var raw = sessionStorage.getItem('currentAgentProfile');
    if (!raw) return;

    var profile;
    try {
      profile = JSON.parse(raw);
    } catch (e) {
      return;
    }
    if (!profile || !profile.name) return;

    var mount = document.getElementById('agent-session-banner');
    if (!mount) return;

    renderBannerHtml(profile, mount);

    var freshProfile = await refreshProfileFromSheet(profile);
    sessionStorage.setItem('currentAgentProfile', JSON.stringify(freshProfile));
    renderBannerHtml(freshProfile, mount);
  }

  document.addEventListener('DOMContentLoaded', renderSessionBanner);
})();
