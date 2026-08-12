// Dashboard announcement compatibility controls.
// Realtime listening, sending and acknowledgement are handled in js/firebase.js.
let bcUnlocked = false;
let tapCount = 0;
let lastTap = 0;

window.handleTitleTap = function() {
    const now = Date.now();
    if (now - lastTap > 2000) tapCount = 0;
    tapCount += 1;
    lastTap = now;
    if (tapCount >= 5) {
        tapCount = 0;
        window.toggleBcPanel();
    }
};

function isFirebaseAdminLoggedIn() {
    return sessionStorage.getItem('firebaseAdminLoggedIn') === 'true' ||
        sessionStorage.getItem('adminLoggedIn') === 'true' ||
        sessionStorage.getItem('bizUserRole') === 'admin';
}

window.toggleBcPanel = function() {
    const panel = document.getElementById('bc-panel');
    if (!panel) return;
    if (panel.classList.contains('show')) {
        panel.classList.remove('show');
        panel.style.display = 'none';
        return;
    }
    if (bcUnlocked || isFirebaseAdminLoggedIn()) {
        panel.style.display = 'block';
        panel.classList.add('show');
    } else {
        document.getElementById('bc-login-modal')?.classList.remove('hidden');
    }
};

window.checkBcPassword = function() {
    const input = document.getElementById('bc-pw-input');
    const error = document.getElementById('bc-pw-error');
    const validPasswords = [
        typeof WEEKLY_PASSWORD !== 'undefined' ? WEEKLY_PASSWORD : 'bizlevelup2025',
        'PopoDarling', '2424', 'admin'
    ];
    if (validPasswords.includes(input?.value || '')) {
        bcUnlocked = true;
        document.getElementById('bc-login-modal')?.classList.add('hidden');
        const panel = document.getElementById('bc-panel');
        if (panel) { panel.style.display = 'block'; panel.classList.add('show'); }
        if (input) input.value = '';
        if (error) error.textContent = '';
    } else {
        if (error) error.textContent = '❌ Invalid administrative password';
        if (input) input.value = '';
    }
};

window.sendBroadcast = async function() {
    const msg = document.getElementById('bc-input')?.value?.trim();
    const status = document.getElementById('bc-status');
    if (!msg) {
        if (status) status.innerHTML = '<span style="color:#f87171">Enter an announcement first.</span>';
        return;
    }
    if (typeof window.sendAnnouncement !== 'function') {
        if (status) status.innerHTML = '<span style="color:#f87171">Firebase is still loading. Try again.</span>';
        return;
    }
    const currentAdmin = (() => { try { return JSON.parse(sessionStorage.getItem('currentAdmin') || '{}'); } catch (e) { return {}; } })();
    const result = await window.sendAnnouncement({
        title: 'Important Announcement',
        message: msg,
        audience: 'agents',
        requireAck: true,
        sentBy: currentAdmin.name || 'Administration'
    });
    if (result.success) {
        document.getElementById('bc-input').value = '';
        if (status) status.innerHTML = `<span style="color:#34d399">✅ Sent to ${result.recipientCount || 0} agent(s)</span>`;
    } else if (status) {
        status.innerHTML = `<span style="color:#f87171">❌ ${result.error || 'Failed to send'}</span>`;
    }
};

window.clearBroadcast = async function() {
    const status = document.getElementById('bc-status');
    if (typeof window.clearCurrentAnnouncement !== 'function') return;
    const result = await window.clearCurrentAnnouncement();
    if (status) status.innerHTML = result.success
        ? '<span style="color:#34d399">✅ Active announcement cleared</span>'
        : `<span style="color:#f87171">❌ ${result.error || 'Unable to clear'}</span>`;
};
