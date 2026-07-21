(function () {
  'use strict';

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character];
    });
  }

  function detail(label, value, className) {
    var safeValue = escapeHtml(value || '—');
    var valueHtml = className
      ? '<span class="' + className + '">' + safeValue + '</span>'
      : safeValue;
    return '<span class="biz-session-detail"><span class="biz-session-key">' + escapeHtml(label) + ':</span> ' + valueHtml + '</span>';
  }

  function parseStoredJson(key) {
    try {
      return JSON.parse(sessionStorage.getItem(key) || '{}') || {};
    } catch (error) {
      return {};
    }
  }

  function renderSessionBanner() {
    var mount = document.getElementById('agent-session-banner');
    if (!mount) return;

    var role = sessionStorage.getItem('bizUserRole') || '';
    var html = '';

    if (role === 'agent') {
      var profile = parseStoredJson('currentAgentProfile');
      if (!profile.name && !profile.ytelId) {
        mount.innerHTML = '';
        mount.style.display = 'none';
        return;
      }

      html =
        '<div class="biz-session-card is-agent" aria-label="Logged in agent details">' +
          '<div class="biz-session-label">Logged In Agent</div>' +
          '<div class="biz-session-details">' +
            detail('Name', profile.name || 'Agent') +
            detail('Ytel', profile.ytelId || '—') +
            detail('Lunch', profile.lunch || '—', profile.lunch && profile.lunch !== '—' ? 'biz-session-lunch' : '') +
            detail('Shift', profile.shift || '—') +
            '<span class="biz-session-detail"><span class="biz-session-key">Streak:</span> 🔥 +' + escapeHtml(String(profile.streak || 1)) + '</span>' +
          '</div>' +
        '</div>';
    } else if (role === 'admin') {
      var admin = parseStoredJson('currentAdmin');
      if (!admin.name && !admin.email) {
        mount.innerHTML = '';
        mount.style.display = 'none';
        return;
      }

      var isSuper = admin.isSuper === true || admin.role === 'super_admin';
      html =
        '<div class="biz-session-card is-admin" aria-label="Logged in administrator details">' +
          '<div class="biz-session-label">Logged In ' + (isSuper ? 'Super Admin' : 'Admin') + '</div>' +
          '<div class="biz-session-details">' +
            detail('Name', admin.name || admin.email || 'Administrator') +
            detail('Role', isSuper ? 'Super Administrator' : 'Administrator') +
            detail('Email', admin.email || '—') +
          '</div>' +
        '</div>';
    }

    if (!html) {
      mount.innerHTML = '';
      mount.style.display = 'none';
      return;
    }

    mount.style.display = 'block';
    mount.innerHTML = html;
  }

  window.renderSessionBanner = renderSessionBanner;
  document.addEventListener('DOMContentLoaded', renderSessionBanner);
  window.addEventListener('storage', renderSessionBanner);
})();
