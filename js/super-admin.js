// js/super-admin.js
// Complete Multi-Admin System with DEFAULT SUPER ADMIN

const SUPER_ADMIN_KEY = 'biz_super_admin_v1';
const ADMINS_KEY = 'biz_admins_list_v1';
const ACTIVITY_LOG_KEY = 'biz_activity_logs_v1';

window.writeAdminActivityLog = function(action, details, specificAdmin = null) {
    let admin = specificAdmin || JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');
    if (!admin || (!admin.email && !admin.name)) return;

    const entry = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        email: admin.email || 'unknown',
        name: admin.name || admin.email || 'unknown',
        role: admin.role || 'unknown',
        action: action,
        details: details,
        page: window.location.pathname || ''
    };

    // Write to localStorage as always
    let logs = [];
    try { logs = JSON.parse(localStorage.getItem(ACTIVITY_LOG_KEY) || '[]'); } catch(e) {}
    logs.unshift(entry);
    if (logs.length > 500) logs.length = 500;
    localStorage.setItem(ACTIVITY_LOG_KEY, JSON.stringify(logs));

    // Queue in sessionStorage so it survives page redirects (firebase.js flushes this on index.html)
    try {
        const queue = JSON.parse(sessionStorage.getItem('_fbPendingLogs') || '[]');
        queue.push(entry);
        sessionStorage.setItem('_fbPendingLogs', JSON.stringify(queue));
    } catch(e) {}
};

// ============================================
// DEFAULT SUPER ADMIN - CHANGE THESE VALUES!
// ============================================
const DEFAULT_SUPER_ADMIN = {
    email: "rose",
    password: "PopoDarling1996",              // 👈 Updated to match user guidelines
    name: "Rose",
    role: "super_admin"
};

// Auto-create default super admin if none exists
function initializeDefaultSuperAdmin() {
    const existingSuper = localStorage.getItem(SUPER_ADMIN_KEY);
    const parsedSuper = existingSuper ? JSON.parse(existingSuper) : null;
    if (!existingSuper || parsedSuper.email === "0000") {
        console.log('📌 Creating default super admin...');
        const superAdmin = {
            email: DEFAULT_SUPER_ADMIN.email,
            password: btoa(DEFAULT_SUPER_ADMIN.password),
            name: DEFAULT_SUPER_ADMIN.name,
            role: 'super_admin',
            created: new Date().toISOString(),
            isSuper: true
        };
        localStorage.setItem(SUPER_ADMIN_KEY, JSON.stringify(superAdmin));
        if (typeof window.saveSuperAdminToFirebase === 'function') window.saveSuperAdminToFirebase(superAdmin);
    } else if (parsedSuper && parsedSuper.email === 'rose' && parsedSuper.name !== DEFAULT_SUPER_ADMIN.name) {
        // Migrate: update name if it's the old default
        parsedSuper.name = DEFAULT_SUPER_ADMIN.name;
        localStorage.setItem(SUPER_ADMIN_KEY, JSON.stringify(parsedSuper));
        if (typeof window.saveSuperAdminToFirebase === 'function') window.saveSuperAdminToFirebase(parsedSuper);
        console.log('📌 Super admin name updated to:', DEFAULT_SUPER_ADMIN.name);
    }
}

// Regular admin accounts are authoritative in Firebase RTDB under admins_list.
// Do not auto-create or re-seed deleted accounts. Re-seeding caused removed admins
// to reappear and allowed stale localStorage credentials to keep working.
const DEFAULT_ADMIN_ACCOUNTS = [];
const RESTRICTED_ADMIN_IDS = ['0000'];

function seedDefaultAdmins() {
    // Compatibility hook retained for older pages. It only ensures the cache exists;
    // Firebase listeners replace this cache with the exact remote directory.
    if (!localStorage.getItem(ADMINS_KEY)) {
        localStorage.setItem(ADMINS_KEY, '{}');
    }
}

// Expose so the login page can also call this after Firebase sync
window.seedDefaultAdmins = seedDefaultAdmins;
window.initializeDefaultSuperAdmin = initializeDefaultSuperAdmin;

// Call initializations
initializeDefaultSuperAdmin();
seedDefaultAdmins();

function clearConflictingSessionForAdminLogin() {
    sessionStorage.removeItem('agentLoggedIn');
    sessionStorage.removeItem('currentAgentProfile');
    sessionStorage.removeItem('currentAgentName');
    sessionStorage.removeItem('adminEmail');
    sessionStorage.removeItem('adminRole');
    sessionStorage.removeItem('adminName');
}

// ========== LOGIN SYSTEM ==========
function _normalizeAdminKey(value) {
    return String(value || '').trim().toLowerCase();
}

function _safeDecodePassword(value) {
    try { return atob(String(value || '')); } catch (e) { return ''; }
}

async function superAdminLogin(email, password) {
    const lookupKey = _normalizeAdminKey(email);
    const suppliedPassword = String(password || '');

    if (!lookupKey || !suppliedPassword) {
        return { success: false, error: 'Enter your login ID and password' };
    }

    // Super Admin is stored separately, but use the current Firebase record whenever
    // the login page exposes the verifier. Local storage is only a cache/fallback for Rose.
    let superRecord = null;
    try {
        if (typeof window.fetchSuperAdminForLogin === 'function') {
            superRecord = await window.fetchSuperAdminForLogin();
        }
    } catch (e) {
        console.warn('[AdminAuth] Could not read super admin from Firebase:', e);
    }
    if (!superRecord) {
        try { superRecord = JSON.parse(localStorage.getItem(SUPER_ADMIN_KEY) || 'null'); } catch (e) {}
    }

    if (superRecord) {
        const superKey = _normalizeAdminKey(superRecord.email);
        const isSuperMatch = lookupKey === superKey || (lookupKey === 'rose' && superRecord.role === 'super_admin');
        if (isSuperMatch && _safeDecodePassword(superRecord.password) === suppliedPassword) {
            localStorage.setItem(SUPER_ADMIN_KEY, JSON.stringify(superRecord));
            clearConflictingSessionForAdminLogin();
            sessionStorage.setItem('currentAdmin', JSON.stringify({
                email: superRecord.email,
                name: superRecord.name,
                role: 'super_admin',
                isSuper: true
            }));
            sessionStorage.setItem('adminLoggedIn', 'true');
            sessionStorage.setItem('bizAdminUnlocked', '1');
            sessionStorage.setItem('bizUserRole', 'admin');
            window.writeAdminActivityLog('login', 'Super Admin logged in', {email: superRecord.email, name: superRecord.name, role: 'super_admin'});
            return { success: true, role: 'super_admin' };
        }
    }

    // Regular admins must be verified against Firebase on every login. Never accept a
    // stale localStorage record because the account may have been deleted by Super Admin.
    if (typeof window.fetchAdminForLogin !== 'function') {
        return { success: false, error: 'Cannot verify admin account. Check the internet connection and try again.' };
    }

    let admin = null;
    try {
        admin = await window.fetchAdminForLogin(lookupKey);
    } catch (e) {
        console.error('[AdminAuth] Firebase verification failed:', e);
        return { success: false, error: 'Cannot reach Firebase right now. Please try again.' };
    }

    if (!admin) {
        // Remove any stale local copy immediately.
        try {
            const cached = JSON.parse(localStorage.getItem(ADMINS_KEY) || '{}');
            delete cached[lookupKey];
            localStorage.setItem(ADMINS_KEY, JSON.stringify(cached));
        } catch (e) {}
        window.writeAdminActivityLog('login_failed', 'Deleted or unauthorized admin attempted login: ' + lookupKey, {email: lookupKey, name: 'Unknown', role: 'unknown'});
        return { success: false, error: 'This admin account is not authorized or has been removed.' };
    }

    if (admin.password !== btoa(suppliedPassword)) {
        window.writeAdminActivityLog('login_failed', 'Failed admin login attempt: ' + lookupKey, {email: lookupKey, name: admin.name || 'Unknown', role: admin.role || 'admin'});
        return { success: false, error: 'Invalid credentials' };
    }

    // Refresh the exact verified record in the local cache.
    try {
        const cached = JSON.parse(localStorage.getItem(ADMINS_KEY) || '{}');
        cached[lookupKey] = { ...admin, email: admin.email || lookupKey };
        localStorage.setItem(ADMINS_KEY, JSON.stringify(cached));
    } catch (e) {}

    clearConflictingSessionForAdminLogin();
    sessionStorage.setItem('currentAdmin', JSON.stringify({
        email: admin.email || lookupKey,
        name: admin.name,
        role: admin.role || 'admin',
        isSuper: false,
        hiddenTabs: admin.hiddenTabs || [],
        adminToolUploadScope: admin.adminToolUploadScope || 'all'
    }));
    sessionStorage.setItem('adminLoggedIn', 'true');
    sessionStorage.setItem('bizAdminUnlocked', '1');
    sessionStorage.setItem('bizUserRole', 'admin');
    window.writeAdminActivityLog('login', 'Admin logged in', {email: admin.email || lookupKey, name: admin.name, role: admin.role || 'admin'});
    return { success: true, role: admin.role || 'admin' };
}

// ========== ADMIN MANAGEMENT ==========
function getAllAdmins() {
    const currentAdmin = JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');
    if (currentAdmin.role !== 'super_admin') {
        return { success: false, error: 'Access denied' };
    }
    
    const admins = JSON.parse(localStorage.getItem(ADMINS_KEY) || '{}');
    return {
        success: true,
        admins: Object.values(admins).map(admin => ({
            ...admin,
            password: '••••••'
        }))
    };
}

async function addNewAdmin(email, password, name, role = 'admin') {
    const currentAdmin = JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');
    if (currentAdmin.role !== 'super_admin' && !currentAdmin.isSuper) {
        return { success: false, error: 'Only super admin can add new admins' };
    }

    const saveKey = _normalizeAdminKey(email);
    if (!saveKey || !name || !password) return { success: false, error: 'All fields are required' };
    if (/[.#$\[\]\/]/.test(saveKey)) return { success: false, error: 'Login ID cannot contain . # $ [ ] or /' };

    const admins = JSON.parse(localStorage.getItem(ADMINS_KEY) || '{}');
    if (admins[saveKey]) return { success: false, error: 'Admin already exists' };
    if (typeof window.saveAdminRecordToFirebase !== 'function') {
        return { success: false, error: 'Firebase is not connected. Admin was not added.' };
    }
    if (typeof window.getAdminRecordFromFirebase === 'function') {
        try {
            const existingRemote = await window.getAdminRecordFromFirebase(saveKey);
            if (existingRemote) return { success: false, error: 'Admin already exists in Firebase' };
        } catch (e) {
            return { success: false, error: 'Could not verify Firebase before adding the admin' };
        }
    }

    const record = {
        email: saveKey,
        name: String(name).trim(),
        role: role || 'admin',
        password: btoa(String(password)),
        addedBy: currentAdmin.email,
        addedAt: new Date().toISOString(),
        hiddenTabs: [],
        adminToolUploadScope: 'all'
    };

    try {
        await window.saveAdminRecordToFirebase(saveKey, record);
        admins[saveKey] = record;
        localStorage.setItem(ADMINS_KEY, JSON.stringify(admins));
        window.writeAdminActivityLog('user_management', 'Added new admin: ' + saveKey);
        return { success: true, message: 'Admin added successfully' };
    } catch (e) {
        console.error('[AdminManagement] Add failed:', e);
        return { success: false, error: 'Firebase save failed. No account was created.' };
    }
}

async function removeAdmin(email) {
    const currentAdmin = JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');
    if (currentAdmin.role !== 'super_admin' && !currentAdmin.isSuper) {
        return { success: false, error: 'Only super admin can remove admins' };
    }

    const key = _normalizeAdminKey(email);
    if (key === _normalizeAdminKey(currentAdmin.email)) return { success: false, error: 'Cannot remove yourself' };
    if (typeof window.deleteAdminFromFirebase !== 'function') {
        return { success: false, error: 'Firebase is not connected. Admin was not removed.' };
    }

    try {
        await window.deleteAdminFromFirebase(key);
        const admins = JSON.parse(localStorage.getItem(ADMINS_KEY) || '{}');
        delete admins[key];
        localStorage.setItem(ADMINS_KEY, JSON.stringify(admins));
        window.writeAdminActivityLog('user_management', 'Removed admin: ' + key);
        return { success: true, message: 'Admin removed and access revoked' };
    } catch (e) {
        console.error('[AdminManagement] Remove failed:', e);
        return { success: false, error: 'Firebase delete failed. The admin still has access.' };
    }
}

async function updateAdminRole(email, newRole) {
    const currentAdmin = JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');
    if (currentAdmin.role !== 'super_admin' && !currentAdmin.isSuper) {
        return { success: false, error: 'Only super admin can change roles' };
    }

    const key = _normalizeAdminKey(email);
    const admins = JSON.parse(localStorage.getItem(ADMINS_KEY) || '{}');
    if (!admins[key]) return { success: false, error: 'Admin not found' };
    if (typeof window.saveAdminRecordToFirebase !== 'function') return { success: false, error: 'Firebase is not connected' };

    const updated = { ...admins[key], role: newRole };
    try {
        await window.saveAdminRecordToFirebase(key, updated);
        admins[key] = updated;
        localStorage.setItem(ADMINS_KEY, JSON.stringify(admins));
        window.writeAdminActivityLog('user_management', `Updated role for ${key} to ${newRole}`);
        return { success: true, message: 'Role updated successfully' };
    } catch (e) {
        return { success: false, error: 'Firebase update failed' };
    }
}

async function changeOwnPassword(email, oldPassword, newPassword) {
    const key = _normalizeAdminKey(email);
    const superAdmin = localStorage.getItem(SUPER_ADMIN_KEY);
    if (superAdmin) {
        const admin = JSON.parse(superAdmin);
        if (_normalizeAdminKey(admin.email) === key && _safeDecodePassword(admin.password) === oldPassword) {
            admin.password = btoa(newPassword);
            if (typeof window.saveSuperAdminToFirebase !== 'function') return { success: false, error: 'Firebase is not connected' };
            try {
                await window.saveSuperAdminToFirebase(admin);
                localStorage.setItem(SUPER_ADMIN_KEY, JSON.stringify(admin));
                return { success: true, message: 'Password changed successfully' };
            } catch (e) { return { success: false, error: 'Firebase update failed' }; }
        }
    }

    const admins = JSON.parse(localStorage.getItem(ADMINS_KEY) || '{}');
    const admin = admins[key];
    if (!admin || _safeDecodePassword(admin.password) !== oldPassword) return { success: false, error: 'Current password is incorrect' };
    if (typeof window.saveAdminRecordToFirebase !== 'function') return { success: false, error: 'Firebase is not connected' };
    const updated = { ...admin, password: btoa(newPassword) };
    try {
        await window.saveAdminRecordToFirebase(key, updated);
        admins[key] = updated;
        localStorage.setItem(ADMINS_KEY, JSON.stringify(admins));
        return { success: true, message: 'Password changed successfully' };
    } catch (e) { return { success: false, error: 'Firebase update failed' }; }
}

async function superResetAdminPassword(email, newPassword) {
    const currentAdmin = JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');
    if (currentAdmin.role !== 'super_admin' && !currentAdmin.isSuper) return { success: false, error: 'Only super admin can reset passwords' };
    const key = _normalizeAdminKey(email);
    const admins = JSON.parse(localStorage.getItem(ADMINS_KEY) || '{}');
    if (!admins[key]) return { success: false, error: 'Admin not found' };
    if (typeof window.saveAdminRecordToFirebase !== 'function') return { success: false, error: 'Firebase is not connected' };
    const updated = { ...admins[key], password: btoa(newPassword) };
    try {
        await window.saveAdminRecordToFirebase(key, updated);
        admins[key] = updated;
        localStorage.setItem(ADMINS_KEY, JSON.stringify(admins));
        window.writeAdminActivityLog('user_management', `Super Admin reset password for: ${key}`);
        return { success: true, message: 'Password reset successfully' };
    } catch (e) { return { success: false, error: 'Firebase update failed' }; }
}

function isLoggedIn() {
    return sessionStorage.getItem('adminLoggedIn') === 'true';
}

function logout() {
    window.writeAdminActivityLog('logout', 'Admin logged out');
    sessionStorage.removeItem('currentAdmin');
    sessionStorage.removeItem('adminLoggedIn');
    sessionStorage.removeItem('bizAdminUnlocked');
    sessionStorage.removeItem('bizUserRole');
    window.location.href = 'admin-login.html';
}

function getCurrentAdmin() {
    return JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');
}

function setupFirstSuperAdmin(email, password, name) {
    const superAdmin = {
        email: email,
        password: btoa(password),
        name: name,
        role: 'super_admin',
        created: new Date().toISOString(),
        isSuper: true
    };
    
    // Clear old data just to be safe
    localStorage.removeItem(ADMINS_KEY);
    
    localStorage.setItem(SUPER_ADMIN_KEY, JSON.stringify(superAdmin));
    if (typeof window.saveSuperAdminToFirebase === 'function') {
        window.saveSuperAdminToFirebase(superAdmin);
    }
    
    return { success: true };
}

// ============================================================
// ADMIN LIVE TRACKER — FIXED
// Handles: session heartbeat, idle detection, tab tracking,
//          IP geolocation, force-logout, location history
// FIXED: Now uses modular firebase.database() from firebase.js
// ============================================================

// Get the Firebase RTDB instance - works with both modular and legacy
function _getRTDB() {
    // Check for modular database from firebase.js
    if (window.database && typeof window.database.ref === 'function') {
        return window.database;
    }
    // Fallback to legacy window.db (Firestore compat)
    if (window.db && typeof window.db.ref === 'function') {
        return window.db;
    }
    return null;
}

// ── Heartbeat: call once after successful login ──────────────
// Writes/updates admin_sessions/<emailKey> in Firebase.
window.startAdminHeartbeat = function () {
    const cAdmin = JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');
    if (!cAdmin || !cAdmin.email) return;
    if (cAdmin.role !== 'super_admin' && cAdmin.role !== 'admin') return;
    
    const rtdb = _getRTDB();
    if (!rtdb) { 
        console.warn('[AdminTracker] RTDB not ready, retrying in 1s');
        setTimeout(window.startAdminHeartbeat, 1000); 
        return; 
    }

    const key = cAdmin.email.replace(/[.#$[\]]/g, '_');
    const sessionRef = rtdb.ref('admin_sessions/' + key);
    
    // Store sessionId for concurrent tracking
    const sessionId = _tracker_genSessionId();
    sessionStorage.setItem('biz_tracker_session_id', sessionId);

    // Write session immediately so login is not blocked by location fetch
    sessionRef.update({
        name:        cAdmin.name  || 'Unknown',
        email:       cAdmin.email || '',
        role:        cAdmin.role  || 'admin',
        status:      'active',
        loginAt:     Date.now(),
        lastSeen:    Date.now(),
        location:    { ip: '', city: '', region: '', country: '', org: '', timezone: '' },
        sessionId:   sessionId,
        forceLogout: false
    }).catch(err => console.warn('[AdminTracker] Session write failed:', err));

    if (typeof window.writeAdminActivityLog === 'function') {
        window.writeAdminActivityLog('admin_session_start', 'Session started');
    }
    console.log('[AdminTracker] Session started for', cAdmin.email);

    // Fetch location async (fire-and-forget) without blocking login
    _tracker_fetchLocation(function (locObj) {
        sessionRef.update({ location: locObj }).catch(() => {});
        rtdb.ref('admin_location_history').push({
            adminName:  cAdmin.name  || 'Unknown',
            adminEmail: cAdmin.email || '',
            role:       cAdmin.role  || 'admin',
            loginAt:    Date.now(),
            location:   locObj,
            sessionId:  sessionId
        }).catch(() => {});
    });

    // ── Pulse every 30 s to stay "active" ──
    const _hbInterval = setInterval(function () {
        const r = _getRTDB();
        if (!r) return;
        r.ref('admin_sessions/' + key).update({ lastSeen: Date.now(), status: 'active' }).catch(() => {});
    }, 30000);

    // ── Idle detection: 3 min of no interaction → "idle" ──
    let _idleTimer = null;
    function _resetIdle() {
        clearTimeout(_idleTimer);
        const r = _getRTDB();
        if (!r) return;
        r.ref('admin_sessions/' + key).update({ lastSeen: Date.now(), status: 'active' }).catch(() => {});
        _idleTimer = setTimeout(function () {
            const r2 = _getRTDB();
            if (!r2) return;
            r2.ref('admin_sessions/' + key).update({ status: 'idle' }).catch(() => {});
        }, 3 * 60 * 1000);
    }
    ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(function (ev) {
        document.addEventListener(ev, _resetIdle, { passive: true });
    });
    _resetIdle();

    // ── Tab visibility tracking ──
    document.addEventListener('visibilitychange', function () {
        const r = _getRTDB();
        if (!r) return;
        const newStatus = document.visibilityState === 'hidden' ? 'idle' : 'active';
        r.ref('admin_sessions/' + key).update({ status: newStatus, lastSeen: Date.now() }).catch(() => {});
        if (document.visibilityState === 'hidden' && typeof window.writeAdminActivityLog === 'function') {
            window.writeAdminActivityLog('tab_switch', 'Admin switched or minimized tab');
        }
    });

    // ── Mark offline when page closes ──
    window.addEventListener('beforeunload', function () {
        clearInterval(_hbInterval);
        clearTimeout(_idleTimer);
        const r = _getRTDB();
        if (!r) return;
        r.ref('admin_sessions/' + key).update({ status: 'offline', lastSeen: Date.now() }).catch(() => {});
    });
};

// ── Force-logout another admin (Super Admin only) ────────────
// Sets forceLogout: true in Firebase. Target admin's listener
// (watchForForcedLogout) picks it up and signs them out.
window.forceLogoutAdmin = function (emailKey, adminName) {
    if (!confirm('Force logout ' + adminName + '? They will be signed out immediately.')) return;
    const rtdb = _getRTDB();
    if (!rtdb) return;
    rtdb.ref('admin_sessions/' + emailKey).update({
        status:      'offline',
        forceLogout: true,
        lastSeen:    Date.now()
    }).then(() => {
        console.log('[AdminTracker] Force logged out:', adminName);
    }).catch(err => console.warn('[AdminTracker] Force logout failed:', err));
    if (typeof window.writeAdminActivityLog === 'function') {
        window.writeAdminActivityLog('force_logout', 'Super Admin force-terminated session of: ' + adminName);
    }
};

// ── Watch for forced logout of current user ──────────────────
// Call once after login. If forceLogout becomes true, clears
// session and redirects to login page.
window.watchForForcedLogout = function () {
    const cAdmin = JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');
    if (!cAdmin || !cAdmin.email) return;
    const rtdb = _getRTDB();
    if (!rtdb) { 
        setTimeout(window.watchForForcedLogout, 1000); 
        return; 
    }
    const key = cAdmin.email.replace(/[.#$[\]]/g, '_');
    rtdb.ref('admin_sessions/' + key + '/forceLogout').on('value', function (snap) {
        if (snap.val() === true) {
            alert('⚠️ Your admin session has been terminated by a Super Admin.');
            sessionStorage.clear();
            window.location.href = 'admin-login.html';
        }
    });
};

// ── Private helpers ──────────────────────────────────────────

function _tracker_genSessionId() {
    return Math.random().toString(36).substr(2, 9).toUpperCase();
}

function _tracker_fetchLocation(cb) {
    // Use AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    fetch('https://ipapi.co/json/', { signal: controller.signal })
        .then(function (r) { return r.json(); })
        .then(function (d) {
            clearTimeout(timeoutId);
            cb({
                ip:       d.ip           || '',
                city:     d.city         || '',
                region:   d.region       || '',
                country:  d.country_name || '',
                org:      d.org          || '',
                timezone: d.timezone     || ''
            });
        })
        .catch(function (err) {
            clearTimeout(timeoutId);
            console.warn('[AdminTracker] Location fetch failed:', err.message);
            cb({ 
                ip: '', 
                city: 'Unknown', 
                region: '', 
                country: '', 
                org: '', 
                timezone: '' 
            });
        });
}

// ============================================================
// CONCURRENT SESSION TRACKER — FIXED
// Tracks how many devices/browsers are logged into each admin
// account simultaneously. Stored under:
//   admin_concurrent_sessions/<emailKey>/<sessionId>
// ============================================================

// ── Start a concurrent session slot ─────────────────────────
// Called alongside startAdminHeartbeat() after login.
// Each browser tab/device gets its own sessionId slot.
window.startConcurrentSessionTrack = function () {
    const cAdmin = JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');
    if (!cAdmin || !cAdmin.email) return;
    
    const rtdb = _getRTDB();
    if (!rtdb) { 
        setTimeout(window.startConcurrentSessionTrack, 1000); 
        return; 
    }

    const emailKey = cAdmin.email.replace(/[.#$[\]]/g, '_');
    let sessionId = sessionStorage.getItem('biz_tracker_session_id');
    if (!sessionId) {
        sessionId = _tracker_genSessionId();
        sessionStorage.setItem('biz_tracker_session_id', sessionId);
    }

    const slotRef = rtdb.ref('admin_concurrent_sessions/' + emailKey + '/' + sessionId);

    // Write this slot
    slotRef.set({
        sessionId:  sessionId,
        loginAt:    Date.now(),
        lastSeen:   Date.now(),
        userAgent:  navigator.userAgent.substring(0, 120),
        active:     true,
        adminName:  cAdmin.name || 'Unknown',
        adminEmail: cAdmin.email
    }).catch(err => console.warn('[Concurrent] Slot write failed:', err));

    // Remove this slot when tab closes
    slotRef.onDisconnect().remove();

    // Heartbeat for this slot every 30 s
    const _slotInterval = setInterval(function () {
        const r = _getRTDB();
        if (!r) return;
        r.ref('admin_concurrent_sessions/' + emailKey + '/' + sessionId)
            .update({ lastSeen: Date.now(), active: true })
            .catch(() => {});
    }, 30000);

    window.addEventListener('beforeunload', function () {
        clearInterval(_slotInterval);
        const r = _getRTDB();
        if (!r) return;
        r.ref('admin_concurrent_sessions/' + emailKey + '/' + sessionId).remove().catch(() => {});
    });

    // Log if this is a duplicate login (another slot already exists)
    rtdb.ref('admin_concurrent_sessions/' + emailKey).once('value', function (snap) {
        const slots = snap.val() || {};
        const count = Object.keys(slots).length; // includes the one just written
        if (count > 1 && typeof window.writeAdminActivityLog === 'function') {
            window.writeAdminActivityLog(
                'concurrent_login_alert',
                cAdmin.name + ' account now has ' + count + ' active sessions simultaneously'
            );
        }
    });
    
    console.log('[Concurrent] Session tracking started for', cAdmin.email);
};

// ── Get live concurrent session count for one admin ──────────
// cb(count, sessions[]) — used by the tracker grid renderer.
window.watchConcurrentSessions = function (emailKey, cb) {
    const rtdb = _getRTDB();
    if (!rtdb) return;
    rtdb.ref('admin_concurrent_sessions/' + emailKey).on('value', function (snap) {
        const slots    = snap.val() || {};
        const sessions = Object.values(slots).filter(function (s) { return s && s.active; });
        cb(sessions.length, sessions);
    });
};

// ── Watch ALL admins' concurrent counts (for tracker grid) ───
// cb(map) where map = { emailKey: count }
window.watchAllConcurrentCounts = function (cb) {
    const rtdb = _getRTDB();
    if (!rtdb) return;
    rtdb.ref('admin_concurrent_sessions').on('value', function (snap) {
        const all = snap.val() || {};
        const result = {};
        Object.entries(all).forEach(function (_ref) {
            const key   = _ref[0];
            const slots = _ref[1] || {};
            result[key] = Object.values(slots).filter(function (s) { return s && s.active; }).length;
        });
        cb(result);
    });
};
