(function () {
  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, function (m) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
    });
  }

  function renderSessionBanner() {
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

  document.addEventListener('DOMContentLoaded', renderSessionBanner);
})();
