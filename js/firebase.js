// js/firebase.js
// Firebase configuration and real-time listeners

// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, onValue, set, push, get, update, remove } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getFirestore, doc, setDoc, getDoc, getDocs, collection, query, orderBy, onSnapshot, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// Your Firebase configuration (replace with your actual config)
const firebaseConfig = {
  apiKey: "AIzaSyA5u7B8UJQOFG8yhE0YKWCiWCHQgaNu1mY",
  authDomain: "biz-dashboard-4396c.firebaseapp.com",
  databaseURL: "https://biz-dashboard-4396c-default-rtdb.firebaseio.com",
  projectId: "biz-dashboard-4396c",
  storageBucket: "biz-dashboard-4396c.firebasestorage.app",
  messagingSenderId: "394155720592",
  appId: "1:394155720592:web:b85a142cf8c885726b3d15",
  measurementId: "G-VMMZWCMLBR"
};

// Initialize Firebase
let app;
let database;
let firestore;
let auth;

try {
    app = initializeApp(firebaseConfig);
    database = getDatabase(app);
    firestore = getFirestore(app);
    auth = getAuth(app);
    
    // Export to window for non-module scripts (like broadcast.js)
    window.firebaseApp = app;
    window.database = database;
    window.firestore = firestore;
    window.db = firestore; // legacy alias
    window.firebaseAuth = auth;

    // Expose modular Firestore helpers for non-module scripts
    window.fsDoc = (collectionPath, docId) => doc(firestore, collectionPath, docId);
    window.fsSetDoc = setDoc;
    window.fsGetDoc = getDoc;
    window.fsServerTimestamp = serverTimestamp;

    // Expose RTDB helpers for non-module scripts (goals, etc.)
    window.rtdbRef = (path) => ref(database, path);
    window.rtdbSet = set;
    window.rtdbGet = get;
    window.rtdbOnValue = onValue;
    window.rtdbUpdate = update;
    window.rtdbPush = push;
    window.rtdbRemove = remove;
    
    console.log("Firebase & Firestore initialized successfully");
} catch (error) {
    console.error("Firebase initialization error:", error);
}


// ========== DELETED AGENT VISIBILITY / PURGE ==========
// A deleted profile must stop appearing throughout the dashboard even when an
// older uploaded report, cached chat channel, attendance row, or live state still
// contains that agent's name. Firebase is authoritative; localStorage is only a
// fast cache for pages that render before the realtime listener finishes.
const DELETED_AGENT_CACHE_KEY = 'biz_deleted_agents_cache_v1';
let _deletedAgents = {};

function _normalizeAgentToken(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}
function _safeAgentKey(value) {
    return String(value || '').trim().replace(/[.#$\[\]\/]/g, '_').replace(/\s+/g, '_') || 'unknown';
}
function _loadDeletedAgentCache() {
    try { _deletedAgents = JSON.parse(localStorage.getItem(DELETED_AGENT_CACHE_KEY) || '{}') || {}; }
    catch (_) { _deletedAgents = {}; }
}
function _saveDeletedAgentCache() {
    try { localStorage.setItem(DELETED_AGENT_CACHE_KEY, JSON.stringify(_deletedAgents || {})); } catch (_) {}
}
_loadDeletedAgentCache();

window.getDeletedAgents = function() { return { ...(_deletedAgents || {}) }; };
window.isDeletedAgentRecord = function(recordOrName, maybeId) {
    const rec = (recordOrName && typeof recordOrName === 'object') ? recordOrName : { name: recordOrName, userId: maybeId };
    const ids = [rec.userId, rec.ytelId, rec.id, rec.agentId, rec.agentID, rec.userid]
        .map(_normalizeAgentToken).filter(Boolean);
    const names = [rec.fullName, rec.name, rec.agentName, rec.rawName, rec.ytelName]
        .map(_normalizeAgentToken).filter(Boolean);
    return Object.values(_deletedAgents || {}).some(d => {
        if (!d) return false;
        const dids = [d.userId, d.ytelId, d.id, d.agentId].map(_normalizeAgentToken).filter(Boolean);
        const dnames = [d.fullName, d.name, d.agentName, d.ytelName, d.normalizedName].map(_normalizeAgentToken).filter(Boolean);
        return ids.some(v => dids.includes(v)) || names.some(v => dnames.includes(v));
    });
};
window.filterDeletedAgents = function(arr) {
    return Array.isArray(arr) ? arr.filter(row => !window.isDeletedAgentRecord(row)) : [];
};

let _activeAgentRosterCache = [];
try {
    const cachedRoster = JSON.parse(localStorage.getItem('biz_master_roster') || '[]');
    if (Array.isArray(cachedRoster)) _activeAgentRosterCache = cachedRoster;
} catch (_) {}
function _normalizeRosterName(value) {
    return _normalizeAgentToken(value)
        .replace(/^(gyp|gyb|gtm|rm)\s+/, '')
        .replace(/\s*\((bb|pr|rm|berbice|providence|remote)\)\s*$/i, '')
        .trim();
}
window.isActiveAgentRecord = function(recordOrName, maybeId) {
    const roster = Array.isArray(_activeAgentRosterCache) && _activeAgentRosterCache.length
        ? _activeAgentRosterCache
        : (Array.isArray(window.allAgentProfiles) ? window.allAgentProfiles : []);
    if (!roster.length) return !window.isDeletedAgentRecord(recordOrName, maybeId);
    const rec = (recordOrName && typeof recordOrName === 'object') ? recordOrName : { name:recordOrName, userId:maybeId };
    const ids = [rec.userId, rec.ytelId, rec.id, rec.agentId, rec.agentID].map(_normalizeAgentToken).filter(Boolean);
    const names = [rec.fullName, rec.name, rec.agentName, rec.rawName, rec.ytelName].map(_normalizeRosterName).filter(Boolean);
    return roster.some(a => {
        if (window.isDeletedAgentRecord(a)) return false;
        const aids = [a.userId, a.ytelId, a.id, a.agentId].map(_normalizeAgentToken).filter(Boolean);
        const anames = [a.fullName, a.name, a.agentName, a.ytelName].map(_normalizeRosterName).filter(Boolean);
        return ids.some(v => aids.includes(v)) || names.some(v => anames.includes(v));
    });
};
window.filterToActiveAgents = function(arr) {
    return Array.isArray(arr) ? arr.filter(row => window.isActiveAgentRecord(row)) : [];
};
function _filterDeletedReport(report) {
    if (!report || typeof report !== 'object') return report;
    const out = { ...report };
    ['data','agents','rows','stats'].forEach(k => {
        if (Array.isArray(out[k])) out[k] = window.filterToActiveAgents(window.filterDeletedAgents(out[k]));
    });
    if (out.agentMap && typeof out.agentMap === 'object' && !Array.isArray(out.agentMap)) {
        out.agentMap = Object.fromEntries(Object.entries(out.agentMap).filter(([k,v]) => !window.isDeletedAgentRecord(v || k)));
    }
    return out;
}
window.filterDeletedAgentReport = _filterDeletedReport;

if (database) {
    onValue(ref(database, 'biz_deleted_agents'), snap => {
        _deletedAgents = snap.val() || {};
        _saveDeletedAgentCache();
        window.dispatchEvent(new CustomEvent('biz-deleted-agents-updated', { detail: window.getDeletedAgents() }));

        // If an agent profile is deleted while that agent still has the dashboard
        // open, end that stale session so it cannot re-add presence/chat data.
        try {
            if (sessionStorage.getItem('bizUserRole') === 'agent') {
                const current = JSON.parse(sessionStorage.getItem('currentAgentProfile') || '{}');
                if (current && window.isDeletedAgentRecord(current)) {
                    const id = String(current.ytelId || current.userId || current.id || '').trim();
                    if (id) remove(ref(database, 'dashboard_presence/' + id)).catch(() => {});
                    sessionStorage.removeItem('currentAgentProfile');
                    sessionStorage.removeItem('currentAgentName');
                    sessionStorage.removeItem('agentLoggedIn');
                    sessionStorage.removeItem('bizUserRole');
                    if (!/agent-login\.html/i.test(location.pathname)) location.replace('agent-login.html?removed=1');
                }
            }
        } catch (_) {}
    });
}
if (database) {
    onValue(ref(database, 'biz_master_roster'), snap => {
        let roster = snap.val() || [];
        if (!Array.isArray(roster)) roster = Object.values(roster);
        _activeAgentRosterCache = roster.filter(Boolean);
        try { localStorage.setItem('biz_master_roster', JSON.stringify(_activeAgentRosterCache)); } catch (_) {}
        window.allAgentProfiles = _activeAgentRosterCache.slice();
        window.dispatchEvent(new CustomEvent('biz-active-roster-updated', { detail:_activeAgentRosterCache.slice() }));
    });
}

window.clearDeletedAgentMarker = async function(agentData) {
    if (!database || !agentData) return;
    const ids = [agentData.userId, agentData.ytelId, agentData.id].map(_normalizeAgentToken).filter(Boolean);
    const names = [agentData.fullName, agentData.name, agentData.ytelName].map(_normalizeAgentToken).filter(Boolean);
    const snap = await get(ref(database, 'biz_deleted_agents'));
    const data = snap.val() || {};
    for (const [key, d] of Object.entries(data)) {
        const dids = [d && d.userId, d && d.ytelId, d && d.id].map(_normalizeAgentToken).filter(Boolean);
        const dnames = [d && d.fullName, d && d.name, d && d.normalizedName].map(_normalizeAgentToken).filter(Boolean);
        if (ids.some(v => dids.includes(v)) || names.some(v => dnames.includes(v))) {
            await remove(ref(database, 'biz_deleted_agents/' + key));
        }
    }
};

window.purgeAgentEverywhere = async function(agentData) {
    if (!database) return { success:false, error:'Database not initialized' };
    const data = (typeof agentData === 'object' && agentData) ? agentData : { userId: agentData };
    const userId = String(data.userId || data.id || data.ytelId || '').trim();
    const ytelId = String(data.ytelId || data.userId || data.id || '').trim();
    const fullName = String(data.fullName || data.name || data.agentName || '').trim();
    if (!userId && !ytelId && !fullName) return { success:false, error:'Agent identity missing' };

    const tombKey = _safeAgentKey(userId || ytelId || fullName);
    const tombstone = { userId, ytelId, fullName, normalizedName:_normalizeAgentToken(fullName), deletedAt:new Date().toISOString() };
    await set(ref(database, 'biz_deleted_agents/' + tombKey), tombstone);
    _deletedAgents[tombKey] = tombstone;
    _saveDeletedAgentCache();

    const matches = (row) => {
        if (!row) return false;
        const rid = _normalizeAgentToken(row.userId || row.id || row.ytelId || row.agentId);
        const rname = _normalizeAgentToken(row.fullName || row.name || row.agentName || row.rawName || row.ytelName);
        return (!!rid && [userId, ytelId].map(_normalizeAgentToken).includes(rid)) || (!!rname && !!fullName && rname === _normalizeAgentToken(fullName));
    };

    try {
        // Profile sources
        if (firestore && userId) { try { await deleteDoc(doc(firestore, 'agent_profiles', userId)); } catch (_) {} }
        for (const id of new Set([userId, ytelId].filter(Boolean))) {
            await remove(ref(database, 'agent_profiles/' + id));
            await remove(ref(database, 'agent_passwords/' + id));
            await remove(ref(database, 'biz_agent_leads/' + id));
            await remove(ref(database, 'dashboard_presence/' + id));
            await remove(ref(database, 'simulator_assignments/' + id));
            await remove(ref(database, 'agent_goals/' + _safeAgentKey(id)));
            await remove(ref(database, 'agent_goal_settings/' + _safeAgentKey(id)));
        }
        if (fullName) {
            await remove(ref(database, 'agent_goals/' + _safeAgentKey(fullName)));
            await remove(ref(database, 'agent_goal_settings/' + _safeAgentKey(fullName)));
        }

        // Master roster
        const rosterSnap = await get(ref(database, 'biz_master_roster'));
        let roster = rosterSnap.val() || [];
        if (!Array.isArray(roster)) roster = Object.values(roster);
        roster = roster.filter(row => !matches(row));
        await set(ref(database, 'biz_master_roster'), roster);

        // Attendance history: remove all rows belonging to the deleted profile.
        const attSnap = await get(ref(database, 'attendance'));
        const attendance = attSnap.val() || {};
        for (const [date, rows] of Object.entries(attendance)) {
            if (!rows || typeof rows !== 'object') continue;
            for (const [rowKey, row] of Object.entries(rows)) {
                if ([userId, ytelId].includes(String(rowKey)) || matches(row)) {
                    await remove(ref(database, 'attendance/' + date + '/' + rowKey));
                }
            }
        }

        // Remove from the current live dashboard snapshot so the name disappears immediately.
        const liveSnap = await get(ref(database, 'live_dashboard_state'));
        const live = liveSnap.val();
        if (live && typeof live === 'object') {
            const cleaned = _filterDeletedReport(live);
            if (Array.isArray(cleaned.agents)) cleaned.agents = cleaned.agents.filter(row => !matches(row));
            await set(ref(database, 'live_dashboard_state'), cleaned);
        }

        // Current browser caches/UI.
        try { localStorage.setItem('biz_master_roster', JSON.stringify(roster)); } catch (_) {}
        if (Array.isArray(window.allAgentProfiles)) window.allAgentProfiles = window.allAgentProfiles.filter(row => !matches(row));
        if (Array.isArray(window.agents)) window.agents = window.agents.filter(row => !matches(row));
        window.dispatchEvent(new CustomEvent('biz-agent-purged', { detail:tombstone }));
        return { success:true };
    } catch (e) {
        console.error('purgeAgentEverywhere failed:', e);
        return { success:false, error:e.message || String(e) };
    }
};

// ========== ADMIN SESSION TRACKING (RTDB) ==========
// Writes/updates admin_sessions/<emailKey> in Firebase RTDB.
// Uses the realtime database .ref() pattern that superadminpanel.html expects.
window.startAdminHeartbeat = async function() {
    if (window._heartbeatRunning) return;
    if (!database) {
        console.warn("[Firebase] Database not ready, retrying heartbeat in 1s");
        setTimeout(window.startAdminHeartbeat, 1000);
        return;
    }

    const cAdmin = JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');
    if (!cAdmin || !cAdmin.email) {
        console.warn("[Firebase] No admin session found");
        return;
    }
    if (cAdmin.role !== 'super_admin' && cAdmin.role !== 'admin') return;

    window._heartbeatRunning = true;
    const key = cAdmin.email.replace(/[.#$[\]]/g, '_');
    const sessionRef = ref(database, 'admin_sessions/' + key);
    
    // Fetch IP-based location then write the session record
    let locationObj = await _fetchAdminLocation();
    
    // Write session record
    const sessionId = _genSessionId();
    await set(sessionRef, {
        name:        cAdmin.name  || 'Unknown',
        email:       cAdmin.email || '',
        role:        cAdmin.role  || 'admin',
        status:      'active',
        loginAt:     Date.now(),
        lastSeen:    Date.now(),
        location:    locationObj,
        sessionId:   sessionId,
        forceLogout: false
    });
    
    // Store sessionId for concurrent tracking
    sessionStorage.setItem('biz_tracker_session_id', sessionId);
    
    // Append to location history log
    const historyRef = ref(database, 'admin_location_history');
    const newHistoryRef = push(historyRef);
    await set(newHistoryRef, {
        adminName:  cAdmin.name  || 'Unknown',
        adminEmail: cAdmin.email || '',
        role:       cAdmin.role  || 'admin',
        loginAt:    Date.now(),
        location:   locationObj,
        sessionId:  sessionId
    });

    // Store session start time for duration tracking
    sessionStorage.setItem('biz_session_login_ts', new Date().toISOString());

    // Push to session activity log
    push(ref(database, 'admin_session_log'), {
        type:      'login',
        adminName: cAdmin.name  || 'Unknown',
        adminEmail:cAdmin.email || '',
        role:      cAdmin.role  || 'admin',
        ts:        Date.now()
    }).catch(() => {});
    
    if (typeof window.writeAdminActivityLog === 'function') {
        window.writeAdminActivityLog(
            'admin_session_start',
            'Session started from ' + (locationObj.city || 'Unknown') + ', ' + (locationObj.country || '')
        );
    }
    console.log("[Firebase] Admin heartbeat started for", cAdmin.email);

    // Pulse every 30 s to stay "active"
    const _hbInterval = setInterval(async () => {
        if (!database) return;
        const activeRef = ref(database, 'admin_sessions/' + key);
        await update(activeRef, { lastSeen: Date.now(), status: 'active' });
    }, 30000);
    
    // Idle detection: 3 min of no interaction → "idle"
    let _idleTimer = null;
    function _resetIdle() {
        clearTimeout(_idleTimer);
        if (!database) return;
        update(ref(database, 'admin_sessions/' + key), { lastSeen: Date.now(), status: 'active' }).catch(() => {});
        _idleTimer = setTimeout(async () => {
            if (!database) return;
            await update(ref(database, 'admin_sessions/' + key), { status: 'idle' });
        }, 3 * 60 * 1000);
    }
    ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(function(ev) {
        document.addEventListener(ev, _resetIdle, { passive: true });
    });
    _resetIdle();
    
    // Tab visibility tracking
    document.addEventListener('visibilitychange', () => {
        if (!database) return;
        const newStatus = document.visibilityState === 'hidden' ? 'idle' : 'active';
        update(ref(database, 'admin_sessions/' + key), { status: newStatus, lastSeen: Date.now() }).catch(() => {});
        if (document.visibilityState === 'hidden' && typeof window.writeAdminActivityLog === 'function') {
            window.writeAdminActivityLog('tab_switch', 'Admin switched or minimized tab');
        }
    });
    
    // Mark offline when page closes
    window.addEventListener('beforeunload', () => {
        clearInterval(_hbInterval);
        clearTimeout(_idleTimer);
        if (!database) return;
        const _nowTs = Date.now();
        update(ref(database, 'admin_sessions/' + key), { status: 'offline', lastSeen: _nowTs, logoutAt: _nowTs }).catch(() => {});
        push(ref(database, 'admin_session_log'), {
            type:       'logout',
            adminName:  cAdmin.name  || 'Unknown',
            adminEmail: cAdmin.email || '',
            role:       cAdmin.role  || 'admin',
            ts:         _nowTs
        }).catch(() => {});
    });
};

// ========== AGENT PASSWORDS (RTDB) ==========
window.getAgentPassword = async function(ytelId) {
    if (!database || !ytelId) return null;
    try {
        const snap = await get(ref(database, 'agent_passwords/' + String(ytelId)));
        return snap.exists() ? snap.val() : null;
    } catch(e) { return null; }
};

window.setAgentPassword = async function(ytelId, name, password) {
    if (!database || !ytelId || !password) return false;
    try {
        await set(ref(database, 'agent_passwords/' + String(ytelId)), {
            ytelId: String(ytelId),
            name: name || 'Agent',
            password: btoa(password),
            setAt: Date.now()
        });
        return true;
    } catch(e) { return false; }
};

window.removeAgentPassword = async function(ytelId) {
    if (!database || !ytelId) return;
    await set(ref(database, 'agent_passwords/' + String(ytelId)), null);
};

window.listenForAgentPasswords = function(callback) {
    if (!database) return;
    onValue(ref(database, 'agent_passwords'), (snap) => {
        const data = snap.val() || {};
        callback(Object.values(data).filter(Boolean));
    });
};

// ── SESSION ACTIVITY LOG helper ──────────────────────────
window.logAdminSessionEvent = async function(type, extra) {
    if (!database) return;
    const cAdmin = JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');
    try {
        await push(ref(database, 'admin_session_log'), {
            type:       type,
            adminName:  (extra && extra.adminName)  || cAdmin.name  || 'Unknown',
            adminEmail: (extra && extra.adminEmail) || cAdmin.email || '',
            role:       (extra && extra.role)       || cAdmin.role  || 'unknown',
            ts:         Date.now(),
            ...(extra || {})
        });
    } catch(e) {}
};


// ── Concurrent session tracking ─────────────────────────
window.startConcurrentSessionTrack = async function() {
    if (!database) {
        setTimeout(window.startConcurrentSessionTrack, 1000);
        return;
    }
    
    const cAdmin = JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');
    if (!cAdmin || !cAdmin.email) return;
    
    const emailKey = cAdmin.email.replace(/[.#$[\]]/g, '_');
    let sessionId = sessionStorage.getItem('biz_tracker_session_id');
    if (!sessionId) {
        sessionId = _genSessionId();
        sessionStorage.setItem('biz_tracker_session_id', sessionId);
    }
    
    const slotRef = ref(database, 'admin_concurrent_sessions/' + emailKey + '/' + sessionId);
    
    // Write this slot
    await set(slotRef, {
        sessionId:  sessionId,
        loginAt:    Date.now(),
        lastSeen:   Date.now(),
        userAgent:  navigator.userAgent.substring(0, 120),
        active:     true,
        adminName:  cAdmin.name || 'Unknown',
        adminEmail: cAdmin.email
    });
    
    // Remove this slot when tab closes
    onDisconnect(slotRef, () => {
        remove(slotRef);
    });
    
    // Heartbeat for this slot every 30 s
    const _slotInterval = setInterval(async () => {
        if (!database) return;
        await update(slotRef, { lastSeen: Date.now(), active: true });
    }, 30000);
    
    window.addEventListener('beforeunload', () => {
        clearInterval(_slotInterval);
        remove(slotRef);
    });
    
    // Log if this is a duplicate login (another slot already exists)
    const allSlotsRef = ref(database, 'admin_concurrent_sessions/' + emailKey);
    const snapshot = await get(allSlotsRef);
    const slots = snapshot.val() || {};
    const count = Object.keys(slots).length;
    if (count > 1 && typeof window.writeAdminActivityLog === 'function') {
        window.writeAdminActivityLog(
            'concurrent_login_alert',
            cAdmin.name + ' account now has ' + count + ' active sessions simultaneously'
        );
    }
    
    console.log("[Firebase] Concurrent session tracking started for", cAdmin.email);
};

// ── Helper: onDisconnect polyfill for modular SDK ──
function onDisconnect(ref, callback) {
    const connectedRef = ref(database, '.info/connected');
    onValue(connectedRef, (snap) => {
        if (snap.val() === true && callback) {
            callback();
        }
    }, { onlyOnce: true });
}

// ── Force-logout another admin (Super Admin only) ──
window.forceLogoutAdmin = async function(emailKey, adminName) {
    if (!database) return;
    await update(ref(database, 'admin_sessions/' + emailKey), {
        status: 'offline',
        forceLogout: true,
        lastSeen: Date.now()
    });
    if (typeof window.writeAdminActivityLog === 'function') {
        window.writeAdminActivityLog('force_logout', 'Super Admin force-terminated session of: ' + adminName);
    }
};

// ── Watch for forced logout of current user ──
window.watchForForcedLogout = function() {
    if (!database) {
        setTimeout(window.watchForForcedLogout, 1000);
        return;
    }
    const cAdmin = JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');
    if (!cAdmin || !cAdmin.email) return;
    const key = cAdmin.email.replace(/[.#$[\]]/g, '_');
    const forceRef = ref(database, 'admin_sessions/' + key + '/forceLogout');
    onValue(forceRef, (snapshot) => {
        if (snapshot.val() === true) {
            alert('⚠️ Your admin session has been terminated by a Super Admin.');
            sessionStorage.clear();
            window.location.href = 'admin-login.html';
        }
    });
};

// ── Helper: generate random session ID ──
function _genSessionId() {
    return Math.random().toString(36).substr(2, 9).toUpperCase();
}

// ── Helper: fetch location with fallback ──
async function _fetchAdminLocation() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const response = await fetch('https://ipapi.co/json/', { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error('Location fetch failed');
        const data = await response.json();
        return {
            ip:       data.ip || '',
            city:     data.city || '',
            region:   data.region || '',
            country:  data.country_name || '',
            org:      data.org || '',
            timezone: data.timezone || ''
        };
    } catch (e) {
        console.warn('[Firebase] Location fetch failed, using fallback');
        return {
            ip: '',
            city: 'Unknown',
            region: '',
            country: '',
            org: '',
            timezone: ''
        };
    }
}

// ========== CALL SIMULATOR SCRIPTS (RTDB) ==========
window.listenForSimScripts = function(callback) {
    if (!database) { setTimeout(() => window.listenForSimScripts(callback), 500); return; }
    onValue(ref(database, 'simulator_scripts'), (snapshot) => {
        const data = snapshot.val() || {};
        // The Firebase node key is the authoritative script ID. Put it last so a
        // stale `id` saved inside an older script cannot override the real key.
        const arr = Object.entries(data).map(([k, v]) => ({ ...(v || {}), id: k }));
        arr.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        if (callback) callback(arr);
    });
};

window.saveSimScript = async function(scriptObj) {
    if (!database) return { success: false, error: 'Firebase database is not ready.' };

    function sanitizeValue(value) {
        if (value === undefined || typeof value === 'function' || typeof value === 'symbol') return undefined;
        if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
        if (typeof value === 'number') return Number.isFinite(value) ? value : null;
        if (Array.isArray(value)) return value.map(sanitizeValue).filter(v => v !== undefined);
        if (typeof value === 'object') {
            const out = {};
            Object.keys(value).forEach(key => {
                const cleaned = sanitizeValue(value[key]);
                if (cleaned !== undefined) out[key] = cleaned;
            });
            return out;
        }
        return String(value);
    }

    function findInvalidFirebaseKey(value, path) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
        for (const key of Object.keys(value)) {
            if (/[.#$\/\[\]]/.test(key)) return (path ? path + '.' : '') + key;
            const child = findInvalidFirebaseKey(value[key], (path ? path + '.' : '') + key);
            if (child) return child;
        }
        return '';
    }

    try {
        const source = scriptObj && typeof scriptObj === 'object' ? scriptObj : {};
        const existingId = String(source.id || '').trim();
        const targetRef = existingId
            ? ref(database, 'simulator_scripts/' + existingId)
            : push(ref(database, 'simulator_scripts'));
        const scriptId = existingId || targetRef.key;

        // Never store `id` inside the record. The RTDB node key is the ID.
        let payload = sanitizeValue({ ...source });
        delete payload.id;
        payload.updatedAt = Date.now();
        if (!payload.createdAt) payload.createdAt = payload.updatedAt;

        const invalidPath = findInvalidFirebaseKey(payload, '');
        if (invalidPath) {
            throw new Error('Firebase rejected a field name containing . # $ / [ ] at: ' + invalidPath);
        }

        await set(targetRef, payload);
        return { success: true, id: scriptId };
    } catch(e) {
        console.error('[Firebase] Unable to save simulator script:', e);
        return { success: false, error: e && e.message ? e.message : String(e) };
    }
};

window.deleteSimScript = async function(id) {
    if (!database || !id) return;
    await set(ref(database, 'simulator_scripts/' + id), null);
};

// ========== CALL SIMULATOR REUSABLE ERROR LIBRARY (RTDB) ==========
window.listenForSimErrorLibrary = function(callback) {
    if (!database) { setTimeout(() => window.listenForSimErrorLibrary(callback), 500); return function(){}; }
    const errorRef = ref(database, 'simulator_call_error_library');
    const unsubscribe = onValue(errorRef, (snapshot) => {
        const data = snapshot.val() || {};
        const arr = Object.entries(data).map(([k, v]) => ({ id: k, ...(v || {}) }));
        arr.sort((a, b) => String(a.text || '').localeCompare(String(b.text || '')));
        if (callback) callback(arr);
    });
    return unsubscribe;
};

window.saveSimErrorOption = async function(text) {
    if (!database) return { success: false, error: 'Firebase database is not ready.' };
    const clean = String(text || '').trim().replace(/\s+/g, ' ');
    if (!clean) return { success: false, error: 'Enter an error option first.' };
    try {
        const rootRef = ref(database, 'simulator_call_error_library');
        const snap = await get(rootRef);
        const existing = snap.val() || {};
        const duplicate = Object.entries(existing).find(([, value]) =>
            String((value || {}).text || '').trim().toLowerCase() === clean.toLowerCase()
        );
        if (duplicate) return { success: true, id: duplicate[0], duplicate: true };
        const itemRef = push(rootRef);
        await set(itemRef, { text: clean, createdAt: Date.now(), updatedAt: Date.now() });
        return { success: true, id: itemRef.key };
    } catch (e) {
        console.error('[Firebase] Unable to save simulator error option:', e);
        return { success: false, error: e && e.message ? e.message : String(e) };
    }
};

window.deleteSimErrorOption = async function(id) {
    if (!database || !id) return { success: false };
    try {
        await set(ref(database, 'simulator_call_error_library/' + id), null);
        return { success: true };
    } catch (e) {
        console.error('[Firebase] Unable to delete simulator error option:', e);
        return { success: false, error: e && e.message ? e.message : String(e) };
    }
};
// ========== REBUTTALS (RTDB) ==========
window.listenForRebuttals = function(callback) {
    if (!database) { setTimeout(() => window.listenForRebuttals(callback), 500); return; }
    onValue(ref(database, 'rebuttals'), (snapshot) => {
        const data = snapshot.val() || {};
        const arr = Object.entries(data).map(([k, v]) => ({ id: k, ...v }));
        arr.sort((a, b) => ((a.order !== undefined ? a.order : 999) - (b.order !== undefined ? b.order : 999)));
        if (callback) callback(arr);
    });
};

window.saveRebuttal = async function(obj) {
    if (!database) return { success: false };
    try {
        if (obj.id && obj.id !== '__new__') {
            await set(ref(database, 'rebuttals/' + obj.id), obj);
            return { success: true, id: obj.id };
        } else {
            delete obj.id;
            const r = push(ref(database, 'rebuttals'));
            obj.id = r.key;
            await set(r, obj);
            return { success: true, id: r.key };
        }
    } catch(e) { return { success: false, error: e.message }; }
};

window.deleteRebuttal = async function(id) {
    if (!database || !id) return;
    await set(ref(database, 'rebuttals/' + id), null);
};



// ========== ANNOUNCEMENTS + CONFIRMATION (RTDB) ==========
// Data model:
// announcements/current                  -> active announcement shown on dashboards
// announcements/history/{announcementId} -> permanent copy with recipient confirmation state
// Each recipient is snapshotted at send time so Super Admin can see exactly who
// acknowledged and who is still pending.

let _activeAnnouncementId = '';
let _currentAnnouncement = null;
let _currentAnnouncementRecipientKey = '';

function announcementSafeKey(value) {
    return String(value || 'unknown')
        .trim()
        .toLowerCase()
        .replace(/[.#$\[\]\/]/g, '_')
        .replace(/\s+/g, '_')
        .slice(0, 120) || 'unknown';
}

function normalizeAnnouncementIdentity(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getCurrentAnnouncementUser() {
    const role = sessionStorage.getItem('bizUserRole') || '';
    if (role === 'agent') {
        let profile = {};
        try { profile = JSON.parse(sessionStorage.getItem('currentAgentProfile') || '{}'); } catch (e) {}
        const id = String(profile.ytelId || profile.userId || profile.id || profile.email || profile.name || '').trim();
        return {
            key: 'agent_' + announcementSafeKey(id),
            id,
            name: profile.name || profile.fullName || sessionStorage.getItem('currentAgentName') || 'Agent',
            role: 'agent',
            email: profile.email || ''
        };
    }

    if (role === 'admin') {
        let admin = {};
        try { admin = JSON.parse(sessionStorage.getItem('currentAdmin') || '{}'); } catch (e) {}
        const id = String(admin.email || admin.username || admin.name || '').trim();
        return {
            key: 'admin_' + announcementSafeKey(id),
            id,
            name: admin.name || admin.email || 'Administrator',
            role: admin.role === 'super_admin' || admin.isSuper ? 'super_admin' : 'admin',
            email: admin.email || ''
        };
    }

    return { key: '', id: '', name: '', role: role || 'guest', email: '' };
}

function audienceIncludesUser(audience, user) {
    if (!user || !user.key) return false;
    if (!audience || audience === 'all') return user.role === 'agent' || user.role === 'admin' || user.role === 'super_admin';
    if (audience === 'agents') return user.role === 'agent';
    if (audience === 'admins') return user.role === 'admin' || user.role === 'super_admin';
    return false;
}

function resolveAnnouncementRecipientKey(announcement, user) {
    if (!announcement || !user || !user.key) return '';
    const recipients = announcement.recipients || {};
    if (recipients[user.key]) return user.key;

    const userIds = [user.id, user.email, user.name].map(normalizeAnnouncementIdentity).filter(Boolean);
    const match = Object.entries(recipients).find(([, recipient]) => {
        if (!recipient) return false;
        if (recipient.role && user.role === 'agent' && recipient.role !== 'agent') return false;
        if (recipient.role && user.role !== 'agent' && recipient.role === 'agent') return false;
        const recipientIds = [recipient.id, recipient.email, recipient.name]
            .map(normalizeAnnouncementIdentity)
            .filter(Boolean);
        return userIds.some(id => recipientIds.includes(id));
    });
    return match ? match[0] : '';
}

function formatAnnouncementTime(timestamp) {
    if (!timestamp) return '';
    try {
        return new Date(timestamp).toLocaleString('en-US', {
            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
        });
    } catch (e) { return ''; }
}

function showBroadcastBar(announcementOrMessage) {
    const announcement = typeof announcementOrMessage === 'string'
        ? { id: 'legacy', title: 'Announcement', message: announcementOrMessage, requireAck: false, sentBy: 'Administration', timestamp: Date.now() }
        : (announcementOrMessage || {});

    const bar = document.getElementById('broadcast-bar');
    const titleEl = document.getElementById('bc-title');
    const textEl = document.getElementById('bc-message-text');
    const senderEl = document.getElementById('bc-sender');
    const timeEl = document.getElementById('bc-time');
    const ackBtn = document.getElementById('bc-ack-btn');
    const closeBtn = document.getElementById('bc-close-btn');
    const labelEl = document.getElementById('bc-type-label');
    if (!bar || !textEl) return;

    if (titleEl) titleEl.textContent = announcement.title || 'Important Announcement';
    textEl.textContent = announcement.message || 'Administration has posted an announcement.';
    if (senderEl) senderEl.textContent = announcement.sentBy ? `From ${announcement.sentBy}` : 'From Administration';
    if (timeEl) timeEl.textContent = formatAnnouncementTime(announcement.timestamp || announcement.createdAt);
    if (labelEl) labelEl.textContent = announcement.requireAck === false ? 'TEAM ANNOUNCEMENT' : 'ACKNOWLEDGEMENT REQUIRED';

    if (ackBtn) {
        ackBtn.style.display = announcement.requireAck === false ? 'none' : 'inline-flex';
        ackBtn.disabled = false;
        ackBtn.innerHTML = '<i class="fas fa-check-circle"></i><span>I ACKNOWLEDGE</span>';
    }
    if (closeBtn) closeBtn.style.display = announcement.requireAck === false ? 'inline-flex' : 'none';

    bar.classList.add('show');
    bar.setAttribute('aria-hidden', 'false');
    document.body.classList.add('announcement-open');
}

function hideBroadcastBar() {
    const bar = document.getElementById('broadcast-bar');
    if (bar) {
        bar.classList.remove('show');
        bar.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('announcement-open');
}

function dismissBroadcast() {
    if (_currentAnnouncement && _currentAnnouncement.id && _currentAnnouncement.requireAck === false) {
        localStorage.setItem('biz_announcement_ack_' + _currentAnnouncement.id, String(Date.now()));
    }
    hideBroadcastBar();
}

async function buildAnnouncementRecipients(audience) {
    const recipients = {};

    if (audience === 'all' || audience === 'agents') {
        const rosterSnap = await get(ref(database, 'biz_master_roster'));
        let roster = rosterSnap.val() || [];
        if (!Array.isArray(roster)) roster = Object.values(roster);
        roster.filter(Boolean).forEach(agent => {
            if (String(agent.status || '').toLowerCase() === 'inactive') return;
            const id = String(agent.userId || agent.ytelId || agent.id || agent.email || agent.fullName || agent.name || '').trim();
            if (!id) return;
            const key = 'agent_' + announcementSafeKey(id);
            recipients[key] = {
                id,
                name: agent.fullName || agent.name || id,
                email: agent.email || '',
                role: 'agent',
                team: agent.team || '',
                acknowledged: false,
                acknowledgedAt: null
            };
        });
    }

    if (audience === 'all' || audience === 'admins') {
        const [adminsSnap, superSnap] = await Promise.all([
            get(ref(database, 'admins_list')),
            get(ref(database, 'super_admin'))
        ]);
        const admins = adminsSnap.val() || {};
        Object.entries(admins).forEach(([adminKey, admin]) => {
            if (!admin) return;
            const id = String(admin.email || adminKey || admin.name || '').trim();
            if (!id) return;
            const key = 'admin_' + announcementSafeKey(id);
            recipients[key] = {
                id,
                name: admin.name || admin.email || adminKey,
                email: admin.email || adminKey,
                role: 'admin',
                acknowledged: false,
                acknowledgedAt: null
            };
        });
        const superAdmin = superSnap.val();
        if (superAdmin) {
            const id = String(superAdmin.email || superAdmin.username || superAdmin.name || 'superadmin').trim();
            const key = 'admin_' + announcementSafeKey(id);
            recipients[key] = {
                id,
                name: superAdmin.name || superAdmin.email || 'Super Admin',
                email: superAdmin.email || '',
                role: 'super_admin',
                acknowledged: false,
                acknowledgedAt: null
            };
        }
    }

    return recipients;
}

window.sendAnnouncement = async function(options = {}) {
    if (!database) return { success: false, error: 'Firebase database is not initialized.' };
    const message = String(options.message || '').trim();
    const title = String(options.title || 'Important Announcement').trim();
    const audience = ['all', 'agents', 'admins'].includes(options.audience) ? options.audience : 'agents';
    const requireAck = options.requireAck !== false;
    if (!message) return { success: false, error: 'Announcement message is required.' };

    try {
        const previousSnap = await get(ref(database, 'announcements/current'));
        const previous = previousSnap.val();
        if (previous && previous.id) {
            await update(ref(database, `announcements/history/${previous.id}`), {
                status: 'closed',
                closedAt: Date.now(),
                closedReason: 'replaced'
            });
        }
        const newRef = push(ref(database, 'announcements/history'));
        const id = newRef.key;
        const recipients = await buildAnnouncementRecipients(audience);
        const sender = options.sentBy || getCurrentAnnouncementUser().name || 'Super Admin';
        const announcement = {
            id,
            title,
            message,
            audience,
            requireAck,
            sentBy: sender,
            timestamp: Date.now(),
            status: 'active',
            recipientCount: Object.keys(recipients).length,
            recipients
        };
        await Promise.all([
            set(newRef, announcement),
            set(ref(database, 'announcements/current'), announcement)
        ]);
        return { success: true, id, recipientCount: announcement.recipientCount };
    } catch (error) {
        console.error('sendAnnouncement failed:', error);
        return { success: false, error: error.message || 'Firebase save failed.' };
    }
};

async function acknowledgeAnnouncement() {
    if (!_currentAnnouncement || !_currentAnnouncement.id) return;
    const user = getCurrentAnnouncementUser();
    if (!user.key) {
        alert('Your logged-in profile could not be identified. Please sign out and log in again.');
        return;
    }

    const ackBtn = document.getElementById('bc-ack-btn');
    if (ackBtn) {
        ackBtn.disabled = true;
        ackBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>SAVING...</span>';
    }

    const recipientKey = _currentAnnouncementRecipientKey || user.key;
    const ackData = {
        acknowledged: true,
        acknowledgedAt: Date.now(),
        acknowledgedBy: user.name,
        id: user.id,
        name: user.name,
        email: user.email || '',
        role: user.role
    };

    try {
        const paths = {};
        paths[`announcements/current/recipients/${recipientKey}`] = {
            ...((_currentAnnouncement.recipients || {})[recipientKey] || {}),
            ...ackData
        };
        paths[`announcements/history/${_currentAnnouncement.id}/recipients/${recipientKey}`] = {
            ...((_currentAnnouncement.recipients || {})[recipientKey] || {}),
            ...ackData
        };
        await update(ref(database), paths);
        localStorage.setItem('biz_announcement_ack_' + _currentAnnouncement.id, String(Date.now()));
        hideBroadcastBar();
    } catch (error) {
        console.error('acknowledgeAnnouncement failed:', error);
        if (ackBtn) {
            ackBtn.disabled = false;
            ackBtn.innerHTML = '<i class="fas fa-exclamation-circle"></i><span>RETRY ACKNOWLEDGEMENT</span>';
        }
        alert('Your acknowledgement could not be saved. Please check the connection and try again.');
    }
}

window.acknowledgeAnnouncement = acknowledgeAnnouncement;

window.clearCurrentAnnouncement = async function() {
    if (!database) return { success: false, error: 'Firebase database is not initialized.' };
    try {
        const currentSnap = await get(ref(database, 'announcements/current'));
        const current = currentSnap.val();
        if (current && current.id) {
            await update(ref(database, `announcements/history/${current.id}`), {
                status: 'closed',
                closedAt: Date.now()
            });
        }
        await remove(ref(database, 'announcements/current'));
        hideBroadcastBar();
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message || 'Unable to clear announcement.' };
    }
};

window.deleteAnnouncementHistory = async function(announcementId) {
    if (!database || !announcementId) return { success: false, error: 'Announcement ID is required.' };
    try {
        const currentSnap = await get(ref(database, 'announcements/current'));
        const current = currentSnap.val();
        if (current && current.id === announcementId) await remove(ref(database, 'announcements/current'));
        await remove(ref(database, `announcements/history/${announcementId}`));
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message || 'Unable to delete announcement.' };
    }
};

window.listenForAnnouncementHistory = function(callback) {
    if (!database) return () => {};
    return onValue(ref(database, 'announcements/history'), snapshot => {
        const data = snapshot.val() || {};
        const rows = Object.entries(data)
            .map(([id, item]) => ({ id, ...(item || {}) }))
            .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
        if (callback) callback(rows);
    });
};

function listenForBroadcasts() {
    if (!database) {
        console.warn('Firebase not initialized, skipping announcement listener');
        return;
    }
    onValue(ref(database, 'announcements/current'), snapshot => {
        const announcement = snapshot.val();
        _currentAnnouncement = announcement || null;
        _currentAnnouncementRecipientKey = '';

        if (!announcement || !announcement.message) {
            _activeAnnouncementId = '';
            hideBroadcastBar();
            return;
        }

        const user = getCurrentAnnouncementUser();
        if (!audienceIncludesUser(announcement.audience, user)) {
            hideBroadcastBar();
            return;
        }

        const recipientKey = resolveAnnouncementRecipientKey(announcement, user);
        _currentAnnouncementRecipientKey = recipientKey || user.key;
        const recipient = recipientKey ? (announcement.recipients || {})[recipientKey] : null;
        const locallyAcked = localStorage.getItem('biz_announcement_ack_' + announcement.id);
        if ((recipient && recipient.acknowledged) || locallyAcked) {
            hideBroadcastBar();
            return;
        }

        // Do not rebuild the same open modal whenever somebody else acknowledges.
        const bar = document.getElementById('broadcast-bar');
        if (_activeAnnouncementId === announcement.id && bar && bar.classList.contains('show')) return;
        _activeAnnouncementId = announcement.id;
        showBroadcastBar(announcement);
    }, error => console.error('Announcement listener error:', error));
}

// Backwards-compatible broadcast API used by older Super Admin controls.
async function sendBroadcastMessage(message, adminId, options = {}) {
    return window.sendAnnouncement({
        title: options.title || 'Important Announcement',
        message,
        audience: options.audience || 'agents',
        requireAck: options.requireAck !== false,
        sentBy: adminId || options.sentBy || 'Super Admin'
    });
}

// ========== ACTIVITY LOGGING ==========

// Function to push admin activity to Firebase directly
window.writeAdminActivityLog = async function(action, details, specificAdmin = null) {
    if (!database) return;

    let admin = specificAdmin || JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');
    if (!admin || (!admin.email && !admin.name)) return;

    try {
        const logEntry = {
            timestamp: new Date().toISOString(),
            email: admin.email || 'unknown',
            name: admin.name || admin.email || 'unknown',
            role: admin.role || 'unknown',
            action: action,
            details: details,
            page: window.location.pathname || '',
            sessionStart: sessionStorage.getItem('biz_session_login_ts') || ''
        };
        await push(ref(database, 'activity_logs'), logEntry);
    } catch(e) {
        console.error("Activity logging failed", e);
    }
};

// Flush any logs queued by super-admin.js (stored in sessionStorage to survive redirects)
(function _flushPendingLogs() {
    try {
        const raw = sessionStorage.getItem('_fbPendingLogs');
        if (!raw) return;
        const queue = JSON.parse(raw);
        if (!queue || !queue.length) return;
        sessionStorage.removeItem('_fbPendingLogs');
        // Push each queued entry directly to Firebase with its original timestamp
        queue.forEach(entry => {
            if (!database) return;
            const logEntry = {
                timestamp: entry.timestamp || new Date().toISOString(),
                email: entry.email || 'unknown',
                name: entry.name || 'unknown',
                role: entry.role || 'unknown',
                action: entry.action || 'unknown',
                details: entry.details || '',
                page: entry.page || ''
            };
            push(ref(database, 'activity_logs'), logEntry).catch(() => {});
        });
        console.log('[Firebase] Flushed', queue.length, 'pending activity log(s) to Firebase from sessionStorage queue');
    } catch(e) {
        console.warn('[Firebase] Failed to flush pending logs:', e);
    }
})();

window.listenForActivityLogs = function(callback) {
    if (!database) return;
    onValue(ref(database, 'activity_logs'), (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const logsArray = Object.keys(data).map(k => ({id: k, ...data[k]}));
            logsArray.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
            callback(logsArray);
        } else {
            callback([]);
        }
    });
};

window.clearFirebaseActivityLogs = async function() {
    if (!database) return;
    try {
        await set(ref(database, 'activity_logs'), null);
    } catch(e) {}
};

// Alias used by superadminpanel.html
window.listenToActivityLogs = function(callback) {
    window.listenForActivityLogs(callback);
};

// Real-time listener for live admin sessions (Who's Online panel)
window.listenForAdminSessions = function(callback) {
    if (!database) { setTimeout(() => window.listenForAdminSessions(callback), 500); return; }
    onValue(ref(database, 'admin_sessions'), (snapshot) => {
        const data = snapshot.val() || {};
        const sessions = Object.entries(data).map(([key, val]) => ({ key, ...val }));
        if (callback) callback(sessions);
    });
};

window.listenForAdmins = function(callback) {
    if (!database) return;
    onValue(ref(database, 'admins_list'), (snapshot) => {
        const data = snapshot.val() || {};
        localStorage.setItem('biz_admins_list_v1', JSON.stringify(data));
        if (callback) callback(data);
    });
};

// Listen to a single admin's Firebase record in real-time (for live tab permission updates)
window.listenForAdminRecord = function(adminKey, callback) {
    if (!database || !adminKey) return () => {};
    const normalizedKey = String(adminKey).trim().toLowerCase();
    const unsubscribe = onValue(ref(database, 'admins_list/' + normalizedKey), (snapshot) => {
        if (callback) callback(snapshot.val());
    });
    return unsubscribe;
};

// Direct Firebase-backed admin authorization helpers. These are the source of
// truth for login and CRUD; localStorage is only a synchronized cache.
window.getAdminRecordFromFirebase = async function(adminKey) {
    if (!database || !adminKey) return null;
    const normalizedKey = String(adminKey).trim().toLowerCase();
    const snapshot = await get(ref(database, 'admins_list/' + normalizedKey));
    return snapshot.exists() ? snapshot.val() : null;
};

window.getSuperAdminFromFirebase = async function() {
    if (!database) return null;
    const snapshot = await get(ref(database, 'super_admin'));
    return snapshot.exists() ? snapshot.val() : null;
};

window.saveAdminRecordToFirebase = async function(adminKey, adminRecord) {
    if (!database) throw new Error('Firebase database is not initialized');
    const normalizedKey = String(adminKey || '').trim().toLowerCase();
    if (!normalizedKey) throw new Error('Admin key is required');
    if (/[.#$\[\]\/]/.test(normalizedKey)) throw new Error('Invalid Firebase admin key');
    await set(ref(database, 'admins_list/' + normalizedKey), {
        ...adminRecord,
        email: adminRecord.email || normalizedKey
    });
};

window.deleteAdminFromFirebase = async function(adminKey) {
    if (!database) throw new Error('Firebase database is not initialized');
    const normalizedKey = String(adminKey || '').trim().toLowerCase();
    if (!normalizedKey) throw new Error('Admin key is required');

    // Remove authorization first. Login reads this exact path, so once this
    // succeeds the deleted admin cannot authenticate from any browser/device.
    await remove(ref(database, 'admins_list/' + normalizedKey));

    // End any active dashboard sessions for the deleted account.
    const sessionKey = normalizedKey.replace(/[.#$\[\]]/g, '_');
    try {
        await update(ref(database, 'admin_sessions/' + sessionKey), {
            status: 'offline',
            forceLogout: true,
            revokedAt: Date.now(),
            lastSeen: Date.now()
        });
    } catch (e) {
        console.warn('[AdminManagement] Could not flag legacy session for logout:', e);
    }
    try { await remove(ref(database, 'active_sessions/admins/' + sessionKey)); } catch (e) {}
    try { await remove(ref(database, 'admin_concurrent_sessions/' + sessionKey)); } catch (e) {}
};

window.saveAdminsListToFirebase = async function(adminsObj) {
    if (!database) return;
    await set(ref(database, 'admins_list'), adminsObj);
};

window.listenForSuperAdmin = function() {
    if (!database) return;
    onValue(ref(database, 'super_admin'), (snapshot) => {
        const data = snapshot.val();
        if (data) localStorage.setItem('biz_super_admin_v1', JSON.stringify(data));
    });
};

window.saveSuperAdminToFirebase = async function(superAdminObj) {
    if (!database) return;
    await set(ref(database, 'super_admin'), superAdminObj);
};

// ========== AGENT STATS (REPORTS) ==========
window.listenForAgentReports = function(callback) {
    if (!database) return;
    onValue(ref(database, 'agent_reports'), (snapshot) => {
        const data = snapshot.val() || {};
        const reportsArray = Object.keys(data).map(k => ({id: k, ...data[k]})).map(_filterDeletedReport);
        // Sort descending by timestamp
        reportsArray.sort((a,b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
        if (callback) callback(reportsArray);
    });
};

window.saveAgentReportToFirebase = async function(reportObj) {
    if (!database) return;
    try {
        const newRef = push(ref(database, 'agent_reports'));
        await set(newRef, reportObj);
        return { success: true, id: newRef.key };
    } catch(e) {
        return { success: false, error: e };
    }
};

window.deleteAgentReportFromFirebase = async function(id) {
    if (!database) return;
    await set(ref(database, 'agent_reports/' + id), null);
};

// ── PRIVATE AGENT REPORTS (scope = 'self') ──
window.saveAgentReportToFirebasePrivate = async function(adminKey, reportObj) {
    if (!database) return { success: false };
    try {
        const newRef = push(ref(database, 'agent_reports_private/' + adminKey));
        await set(newRef, reportObj);
        return { success: true, id: newRef.key };
    } catch(e) {
        return { success: false, error: e };
    }
};

window.listenForAgentReportsPrivate = function(adminKey, callback) {
    if (!database) return;
    onValue(ref(database, 'agent_reports_private/' + adminKey), (snapshot) => {
        const data = snapshot.val() || {};
        const arr = Object.keys(data).map(k => ({id: k, ...data[k]})).map(_filterDeletedReport);
        arr.sort((a,b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
        if (callback) callback(arr);
    });
};

window.deleteAgentReportFromFirebasePrivate = async function(adminKey, id) {
    if (!database) return;
    await set(ref(database, 'agent_reports_private/' + adminKey + '/' + id), null);
};

/**
 * Prunes agent reports older than 30 days to maintain Firebase performance.
 * Runs automatically during administrative initialization.
 */
window.ahPruneOldReports = async function() {
    if (!database) return;
    try {
        onValue(ref(database, 'agent_reports'), async (snapshot) => {
            const data = snapshot.val();
            if (!data) return;
            
            const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
            let deletedCount = 0;
            
            for (const id in data) {
                const uploadedAt = new Date(data[id].uploadedAt).getTime();
                if (uploadedAt < ninetyDaysAgo) {
                    await set(ref(database, 'agent_reports/' + id), null);
                    deletedCount++;
                }
            }
            if (deletedCount > 0) {
                console.log(`Pruned ${deletedCount} legacy reports from Firebase.`);
            }
        }, { onlyOnce: true });
    } catch(e) {
        console.error("Cleanup Error:", e);
    }
};

// ========== STATUS REPORTS (Super Admin Dispositions) ==========
window.saveStatusReportToFirebase = async function(reportObj) {
    if (!database) return { success: false, error: 'Database not initialized' };
    try {
        const newRef = push(ref(database, 'status_reports'));
        reportObj.id = newRef.key;
        await set(newRef, reportObj);
        return { success: true, id: reportObj.id };
    } catch (e) {
        return { success: false, error: e.message };
    }
};

window.listenForStatusReports = function(callback) {
    if (!database) return;
    onValue(ref(database, 'status_reports'), (snapshot) => {
        let sorted = [];
        snapshot.forEach((child) => {
            sorted.push(child.val());
        });
        sorted.sort((a,b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
        if (callback) callback(sorted);
    });
};

window.deleteStatusReportFromFirebase = async function(id) {
    if (!database) return;
    await set(ref(database, 'status_reports/' + id), null);
};

// ========== LIVE DASHBOARD & ZERO TRACKER ==========
window.listenForLiveDashboardState = function(callback) {
    if (!database) return;
    onValue(ref(database, 'live_dashboard_state'), (snapshot) => {
        const raw = snapshot.val();
        if (callback) callback(_filterDeletedReport(raw));
    });
};

window.saveLiveDashboardState = async function(stateObj) {
    if (!database) return;
    await set(ref(database, 'live_dashboard_state'), stateObj);
};

window.listenForMasterRoster = function(callback) {
    if (!database) return null;
    return onValue(ref(database, 'biz_master_roster'), (snapshot) => {
        let roster = snapshot.val() || [];
        if (!Array.isArray(roster)) roster = Object.values(roster);
        if (callback) callback(window.filterDeletedAgents ? window.filterDeletedAgents(roster) : roster);
    });
};

window.saveMasterRoster = async function(rosterArray) {
    if (!database) return;
    await set(ref(database, 'biz_master_roster'), rosterArray);
};

// ========== REBUTTAL USAGE TRACKING (RTDB) ==========
// Each event is pushed under /rebuttal_usage with a unique key. Events carry
// eventType: 'view' (panel opened) or 'use' (agent confirmed they used it on a call).
window.saveRebuttalUsage = async function(eventObj) {
    if (!database) return;
    try {
        await push(ref(database, 'rebuttal_usage'), eventObj);
    } catch (e) {
        console.error('saveRebuttalUsage failed:', e);
    }
};

window.listenToRebuttalUsage = function(callback) {
    if (!database) return;
    onValue(ref(database, 'rebuttal_usage'), (snapshot) => {
        const val = snapshot.val() || {};
        // Convert object-of-pushes to array for easy aggregation
        const arr = Object.keys(val).map(k => ({ id: k, ...val[k] }));
        if (callback) callback(arr);
    });
};

// ========== AGENT PROFILES (FIRESTORE) ==========
window.saveAgentProfileToFirestore = async function(agentData) {
    if (!firestore) return { success: false, error: 'Firestore not initialized' };
    try {
        const agentId = String(agentData.userId);
        const agentRef = doc(firestore, 'agent_profiles', agentId);
        await setDoc(agentRef, {
            ...agentData,
            updatedAt: new Date().toISOString()
        }, { merge: true });
        if (typeof window.clearDeletedAgentMarker === 'function') await window.clearDeletedAgentMarker(agentData);
        return { success: true };
    } catch (e) {
        console.error("Firestore Error:", e);
        return { success: false, error: e };
    }
};

// ── AGENT COACHING SESSIONS ──
window.saveCoachingSession = async (sessionData) => {
    if (!firestore) return { success: false, error: 'Firestore not initialized' };
    try {
        const id = sessionData.id || `coach_${Date.now()}`;
        const docRef = doc(firestore, "coaching_sessions", id);
        await setDoc(docRef, {
            ...sessionData,
            timestamp: sessionData.timestamp || new Date().toISOString()
        }, { merge: true });
        return { success: true, id };
    } catch (e) {
        console.error("Coaching Save Error:", e);
        return { success: false, error: e };
    }
};

window.listenToCoaching = (callback) => {
    if (!firestore) return;
    const q = query(collection(firestore, "coaching_sessions"), orderBy("timestamp", "desc"));
    return onSnapshot(q, snap => {
        const sessions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        callback(sessions);
    }, (error) => {
        console.error("Coaching Listener Error:", error);
    });
};

// ── LIVE MONITORING SESSIONS ──
window.saveMonitoringSession = async (sessionData) => {
    if (!firestore) return { success: false, error: 'Firestore not initialized' };
    try {
        const id = sessionData.id || `mon_${Date.now()}`;
        const docRef = doc(firestore, "monitoring_sessions", id);
        await setDoc(docRef, {
            ...sessionData,
            timestamp: new Date().toISOString()
        }, { merge: true });
        return { success: true, id };
    } catch (e) {
        console.error("Monitoring Save Error:", e);
        return { success: false, error: e };
    }
};

window.listenToMonitoring = (callback) => {
    if (!firestore) return;
    const q = query(collection(firestore, "monitoring_sessions"), orderBy("timestamp", "desc"));
    return onSnapshot(q, snap => {
        const sessions = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        callback(sessions);
    }, (error) => {
        console.error("Monitoring Listener Error:", error);
    });
};

window.deleteSession = async (collectionName, id) => {
    if (!firestore) return { success: false, error: 'Firestore not initialized' };
    try {
        await deleteDoc(doc(firestore, collectionName, id));
        return { success: true };
    } catch (e) {
        console.error("Delete Session Error:", e);
        return { success: false, error: e };
    }
};

window.listenToAgentProfiles = function(callback) {
    // Strategy: Try modular firestore first, but fallback to compat window.db if needed
    const useModular = (fs) => {
        const q = query(collection(fs, 'agent_profiles'), orderBy('fullName', 'asc'));
        return onSnapshot(q, (snapshot) => {
            const profiles = [];
            snapshot.forEach(doc => profiles.push({ id: doc.id, ...doc.data() }));
            callback(window.filterToActiveAgents ? window.filterToActiveAgents(profiles) : (window.filterDeletedAgents ? window.filterDeletedAgents(profiles) : profiles));
        }, (error) => {
            console.warn("Modular Listener Error, trying fallback...", error);
            const fallbackQ = query(collection(fs, 'agent_profiles'));
            onSnapshot(fallbackQ, (snapshot) => {
                const profiles = [];
                snapshot.forEach(doc => profiles.push({ id: doc.id, ...doc.data() }));
                callback(window.filterToActiveAgents ? window.filterToActiveAgents(profiles) : (window.filterDeletedAgents ? window.filterDeletedAgents(profiles) : profiles));
            });
        });
    };

    if (firestore) {
        return useModular(firestore);
    } else if (window.db && typeof window.db.collection === 'function') {
        console.log("Using Compat Firestore for Agent Profiles");
        return window.db.collection('agent_profiles').orderBy('fullName', 'asc').onSnapshot(snap => {
            const profiles = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(window.filterToActiveAgents ? window.filterToActiveAgents(profiles) : (window.filterDeletedAgents ? window.filterDeletedAgents(profiles) : profiles));
        }, err => {
            console.error("Compat Firestore Error:", err);
            window.db.collection('agent_profiles').onSnapshot(snap => {
                const profiles = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                callback(window.filterToActiveAgents ? window.filterToActiveAgents(profiles) : (window.filterDeletedAgents ? window.filterDeletedAgents(profiles) : profiles));
            });
        });
    } else {
        console.warn("No Firestore instance found for Agent Profiles");
    }
};

window.deleteAgentFromFirestore = async function(userId) {
    if (!firestore) return;
    try {
        await deleteDoc(doc(firestore, 'agent_profiles', String(userId)));
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
};

// ========== AGENT LEAD TRACKER ==========
window.listenForAgentLeads = function(ytelId, callback) {
    if (!database) return null;
    const leadsRef = ref(database, 'biz_agent_leads/' + ytelId);
    const unsubscribe = onValue(leadsRef, (snapshot) => {
        const data = snapshot.val() || {};
        if (callback) callback(data);
    });
    return unsubscribe; // Allows unmounting listener if needed
};

// Admin tracker: real-time, read-only overview of every agent's saved tracker.
window.listenForAllAgentLeads = function(callback) {
    if (!database) return null;
    const allLeadsRef = ref(database, 'biz_agent_leads');
    return onValue(allLeadsRef, (snapshot) => {
        const data = snapshot.val() || {};
        if (callback) callback(data);
    });
};

window.saveAgentLeadsToFirebase = async function(ytelId, weekId, dataObj) {
    if (!database) return { success: false, error: 'Database not initialized' };
    try {
        await set(ref(database, 'biz_agent_leads/' + ytelId + '/' + weekId), dataObj);
        return { success: true };
    } catch(e) {
        console.error("Error saving lead", e);
        return { success: false, error: e };
    }
};

window.deleteAgentWeekFromFirebase = async function(ytelId, weekId) {
    if (!database) return { success: false, error: 'Database not initialized' };
    try {
        await set(ref(database, 'biz_agent_leads/' + ytelId + '/' + weekId), null);
        return { success: true };
    } catch(e) {
        return { success: false, error: e };
    }
};

// ========== DASHBOARD PRESENCE ==========
window.ahUpdateAgentPresence = async function(ytelId, name, status) {
    if (!database) return;
    try {
        const presenceRef = ref(database, 'dashboard_presence/' + ytelId);
        await set(presenceRef, {
            name: name,
            status: status,
            lastSeen: Date.now(),
            date: new Date().toISOString().split('T')[0] // Track by day
        });
    } catch(e) {
        console.error("Presence update failed", e);
    }
};

window.ahListenForPresence = function(callback) {
    if (!database) return;
    onValue(ref(database, 'dashboard_presence'), (snapshot) => {
        const data = snapshot.val() || {};
        const today = new Date().toISOString().split('T')[0];
        const active = {};
        
        // Only count people who logged in TODAY
        for (const id in data) {
            if (data[id].date === today) {
                active[id] = data[id];
            }
        }
        callback(active);
    });
};

// ========== AUTHENTICATION FUNCTIONS ==========

// Admin login function
async function adminLogin(email, password) {
    if (!auth) {
        console.error("Firebase auth not initialized");
        return { success: false, error: "Firebase not configured" };
    }
    
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        sessionStorage.removeItem('agentLoggedIn');
        sessionStorage.removeItem('currentAgentProfile');
        sessionStorage.removeItem('currentAgentName');
        sessionStorage.setItem('bizUserRole', 'admin');
        sessionStorage.setItem('bizAdminId', user.uid);
        sessionStorage.setItem('bizAdminEmail', user.email);
        sessionStorage.setItem('currentAdmin', JSON.stringify({
            email: user.email || user.uid,
            name: user.displayName || user.email || 'Administrator',
            role: 'admin',
            isSuper: false,
            hiddenTabs: []
        }));
        sessionStorage.setItem('adminLoggedIn', 'true');
        
        if (typeof window.writeAdminActivityLog === 'function') {
            await window.writeAdminActivityLog('login', `Admin ${user.email} logged in via Auth`);
        }
        
        return { success: true, user: user };
    } catch (error) {
        console.error("Login error:", error);
        return { success: false, error: error.message };
    }
}

// Admin logout
async function adminLogout() {
    if (auth) {
        try {
            await signOut(auth);
        } catch (error) {
            console.error("Logout error:", error);
        }
    }
    
    sessionStorage.clear();
    window.location.href = 'agent-login.html';
}

// ========== LEAD ALERT FUNCTIONS ==========

// Function to show lead alert
function showLeadAlert(agentName, leadCount) {
    const leadAlert = document.getElementById('lead-alert-banner');
    const leadText = document.getElementById('lab-text');
    
    if (leadAlert && leadText) {
        leadText.textContent = `🔥 ${agentName} just got ${leadCount} new leads!`;
        leadAlert.style.display = 'block';
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            if (leadAlert) {
                leadAlert.style.display = 'none';
            }
        }, 5000);
    }
}

// Match the current logged-in agent against an uploaded lead delta entry.
// The CSV alert payload currently carries agent names (not always Ytel IDs), so
// this intentionally supports name normalization and team-prefix differences.
function _leadAlertNormalizeName(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}
function _leadAlertTrimTeamPrefix(value) {
    const parts = String(value || '').trim().split(/\s+/);
    if (parts.length <= 1) return String(value || '').trim();
    const first = String(parts[0] || '').toUpperCase();
    if (/^(GYB|GYP|PR|BB|RM)$/.test(first)) return parts.slice(1).join(' ');
    return String(value || '').trim();
}
function _leadAlertSameAgentName(a, b) {
    const na = _leadAlertNormalizeName(a);
    const nb = _leadAlertNormalizeName(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    return _leadAlertNormalizeName(_leadAlertTrimTeamPrefix(a)) === _leadAlertNormalizeName(_leadAlertTrimTeamPrefix(b));
}
function _leadAlertCurrentAgent() {
    const role = String(sessionStorage.getItem('bizUserRole') || '').toLowerCase();
    if (role !== 'agent') return null;
    let profile = {};
    try { profile = JSON.parse(sessionStorage.getItem('currentAgentProfile') || '{}') || {}; } catch (e) {}
    return {
        name: profile.name || sessionStorage.getItem('currentAgentName') || '',
        ytelId: String(profile.ytelId || profile.userId || profile.id || '').trim()
    };
}
function _leadAlertFindOwnDelta(agentList) {
    const me = _leadAlertCurrentAgent();
    if (!me || !Array.isArray(agentList)) return null;
    return agentList.find(function(a) {
        if (!a) return false;
        const aid = String(a.ytelId || a.userId || a.id || '').trim();
        if (me.ytelId && aid && me.ytelId === aid) return true;
        return _leadAlertSameAgentName(a.name || a.fullName || '', me.name);
    }) || null;
}
function _leadAlertPersonalCard(agentDelta, fallbackQuote) {
    if (!agentDelta) return null;
    const count = Number(agentDelta.count || agentDelta.leadCount) || 0;
    const prev = Number(agentDelta.prev) || 0;
    const rawName = String(agentDelta.name || agentDelta.fullName || 'Agent').trim();
    const firstName = _leadAlertTrimTeamPrefix(rawName).split(/\s+/)[0] || 'Agent';
    const isFirst = prev === 0 && count > 0;
    const isMilestone = count >= 5 && count % 5 === 0;
    const added = Math.max(1, count - prev);
    const plural = count === 1 ? '' : 's';
    let title = 'Great job, ' + firstName + '!';
    let message = 'You just got another lead — you are now at ' + count + ' lead' + plural + ' today!';
    let badge = 'Keep pushing';
    let tier = 'regular';
    if (isFirst) {
        title = firstName + ', you are on the board!';
        message = 'You just got your first lead of the day. Keep the momentum going!';
        badge = 'First lead';
        tier = 'first';
    } else if (isMilestone) {
        title = firstName + ', you hit a milestone!';
        message = 'Amazing work — you are now at ' + count + ' leads today. Stay locked in and keep pushing!';
        badge = 'Milestone unlocked';
        tier = 'milestone';
    } else if (added > 1) {
        title = 'Excellent work, ' + firstName + '!';
        message = 'You just added ' + added + ' new leads and you are now at ' + count + ' leads today!';
        badge = 'Momentum building';
    }
    return {
        badge: badge,
        title: title,
        message: message,
        quote: fallbackQuote || 'Keep pushing — every dial counts!',
        stat: count + ' lead' + plural + ' today',
        tier: tier,
        isFirst: isFirst,
        isMilestone: isMilestone
    };
}

// Listen for lead alerts
function listenForLeadAlerts() {
    if (!database) {
        console.warn("Firebase not initialized, skipping lead alerts");
        return;
    }
    
    const leadsRef = ref(database, 'leads/alerts');
    
    onValue(leadsRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        // Ignore stale alerts — onValue fires immediately on subscription with
        // whatever is currently in Firebase, even data from a previous session.
        // Only process alerts written within the last 15 seconds so re-subscribing
        // (page load, tab switch) never replays an old banner.
        const alertAge = Date.now() - (data.timestamp || 0);
        if (alertAge > 15000) return;

        // CSV upload alert — show banner with agent names + rotating color
        if (data.csvAlert) {
            if (typeof window._renderLeadAlert === 'function') {
                const n = Number(data.totalLeads) || 0;
                const agents = data.agents || [];
                const hasFirst = agents.some(a => (a.prev || 0) === 0);

                // Use the highest single-agent total count to pick the right quote tier
                const maxCount = agents.reduce((m, a) => Math.max(m, a.count || 0), 1);
                const quote = typeof pickQuote === 'function'
                    ? pickQuote(maxCount, hasFirst)
                    : "Keep pushing — every dial counts!";

                // Build agent list string: "NAME (1st lead! 🏆)" or "NAME (X leads)"
                const agentStr = agents.map(a => {
                    const fn = (a.name || '').split(' ')[0].toUpperCase();
                    const isFirst = (a.prev || 0) === 0;
                    return isFirst
                        ? fn + ' (1st lead! 🏆)'
                        : fn + ' (' + a.count + ' leads)';
                }).join(' • ');

                const ownDelta = _leadAlertFindOwnDelta(agents);
                const ownCard = _leadAlertPersonalCard(ownDelta, quote);

                // Everyone receives the normal floor-wide banner/confetti.
                // Only the matching logged-in agent receives the large centered
                // personal celebration card on top of that same alert.
                window._renderLeadAlert({
                    icon: hasFirst ? '🏆' : '🔥',
                    name: n + ' New Lead' + (n !== 1 ? 's' : '') + ' Just Hit the Floor!',
                    msg: agentStr,
                    quote: quote,
                    firstLead: hasFirst,
                    isUploadAlert: true,
                    personal: !!ownCard,
                    personalCard: ownCard,
                    durationMs: 30000,
                    returnDurationMs: 30000
                });
            }
            return;
        }

        // Per-agent lead alert (from tracker, etc.)
        if (data.agentName && data.leadCount) {
            const name = data.agentName;
            const count = data.leadCount;
            const isFirst = count === 1;
            
            // If the leadalerts.js sophisticated system is present, use it
            if (typeof window._renderLeadAlert === 'function') {
                const quotes = [
                    "Keep up the great work!",
                    "Relentless effort pays off!",
                    "Another one for the scoreboard!",
                    "Momentum is building!",
                    "The floor is yours!"
                ];
                const quote = quotes[Math.floor(Math.random() * quotes.length)];
                const msg = isFirst 
                    ? `${name} just got their FIRST lead of the day! 🥇`
                    : `${name} just transferred — now at ${count} leads today! 🔥`;
                
                const ownDelta = _leadAlertFindOwnDelta([{ name: name, count: count, prev: Math.max(0, count - 1) }]);
                const ownCard = _leadAlertPersonalCard(ownDelta, quote);
                window._renderLeadAlert({
                    icon: isFirst ? '🥇' : '🔥',
                    name: `${name} — New Lead!`,
                    msg: msg,
                    quote: quote,
                    firstLead: isFirst,
                    personal: !!ownCard,
                    personalCard: ownCard,
                    durationMs: 30000,
                    returnDurationMs: 30000
                });
            } else {
                showLeadAlert(name, count);
            }
        }
    }, (error) => {
        console.error("Lead alert listener error:", error);
    });
}

// Global function to trigger a lead alert from anywhere (e.g. tracker)
window.triggerLeadAlert = async function(agentName, leadCount) {
    if (!database) return;
    try {
        await set(ref(database, 'leads/alerts'), {
            agentName: agentName,
            leadCount: leadCount,
            timestamp: Date.now()
        });
        // Clear it after a short delay so the same count can be triggered again later
        setTimeout(async () => {
            await set(ref(database, 'leads/alerts'), null);
        }, 2000);
    } catch (e) {
        console.error("Failed to trigger lead alert", e);
    }
};

// Global function to trigger a CSV upload alert banner on all connected clients
window.triggerCsvUploadAlert = async function(totalLeads, agentList) {
    if (!database) return;
    try {
        await set(ref(database, 'leads/alerts'), {
            csvAlert: true,
            totalLeads: totalLeads,
            agents: agentList || [],
            timestamp: Date.now()
        });
        // Clear after short delay so re-uploading can trigger it again
        setTimeout(async () => {
            try { await set(ref(database, 'leads/alerts'), null); } catch(e) {}
        }, 2000);
    } catch (e) {
        console.error("Failed to trigger CSV upload alert", e);
    }
};

// ========== PRANK NUMBERS SYNC (Firebase + Google Sheet) ==========

// Listen for prank numbers from Firebase (real-time)
window.listenForPrankNumbers = function(callback) {
    if (!database) return;
    const prankRef = ref(database, 'prank_numbers');
    onValue(prankRef, (snapshot) => {
        const data = snapshot.val() || {};
        // Convert object to array
        const prankArray = Object.keys(data).map(key => data[key].number);
        window._cachedPrankNumbers = prankArray;
        if (callback) callback(prankArray);
    });
};

// 🔥 FIXED: Save prank number to Firebase AND Google Sheet with proper POST
window.savePrankNumber = async function(number, loggedBy) {
    if (!database) return { success: false, error: 'Database not initialized' };
    
    const cleanNumber = String(number).replace(/\D/g, '').slice(-10);
    if (cleanNumber.length < 7) return { success: false, error: 'Invalid number' };
    
    let firebaseSuccess = false;
    let sheetSuccess = false;
    
    try {
        // Step 1: Save to Firebase RTDB
        const prankRef = ref(database, 'prank_numbers');
        const snapshot = await get(prankRef);
        const existing = snapshot.val() || {};
        
        let alreadyExists = false;
        Object.keys(existing).forEach(key => {
            if (existing[key].number === cleanNumber) {
                alreadyExists = true;
            }
        });
        
        if (!alreadyExists) {
            const newRef = push(prankRef);
            await set(newRef, {
                number: cleanNumber,
                loggedBy: loggedBy || 'system',
                loggedAt: Date.now(),
                timestamp: new Date().toISOString()
            });
            console.log('✅ Saved to Firebase RTDB:', cleanNumber);
            firebaseSuccess = true;
        } else {
            console.log('Number already exists in Firebase RTDB');
            firebaseSuccess = true; // Already there, consider it success
        }
        return { success: true, firebaseSuccess: firebaseSuccess, sheetSuccess: false };
    } catch(e) {
        console.error('Save failed:', e);
        return { success: false, error: e.message };
    }
};

// Get cached prank numbers
window.getPrankNumbers = function() {
    return window._cachedPrankNumbers || [];
};

// Force refresh prank numbers from Firebase
window.refreshPrankNumbers = async function() {
    if (!database) return [];
    const prankRef = ref(database, 'prank_numbers');
    const snapshot = await get(prankRef);
    const data = snapshot.val() || {};
    const prankArray = Object.keys(data).map(key => data[key].number);
    window._cachedPrankNumbers = prankArray;
    return prankArray;
};


// Listen for prank numbers with full metadata (for Super Admin lookup)
window.listenForPrankNumbersFull = function(callback) {
    if (!database) return;
    const prankRef = ref(database, 'prank_numbers');
    onValue(prankRef, (snapshot) => {
        const data = snapshot.val() || {};
        const entries = Object.keys(data).map(key => ({
            key,
            number: data[key].number || '',
            loggedBy: data[key].loggedBy || 'system',
            loggedAt: data[key].loggedAt || null,
            timestamp: data[key].timestamp || ''
        }));
        entries.sort((a, b) => (b.loggedAt || 0) - (a.loggedAt || 0));
        if (callback) callback(entries);
    });
};

// Delete a prank number from Firebase by key
window.deletePrankNumber = async function(key) {
    if (!database) return false;
    try {
        await remove(ref(database, 'prank_numbers/' + key));
        return true;
    } catch(e) {
        console.error('Delete prank number failed:', e);
        return false;
    }
};

// Initialize prank numbers listener
function initPrankNumbersListener() {
    if (typeof window.listenForPrankNumbers === 'function') {
        window.listenForPrankNumbers((prankArray) => {
            console.log(`🔥 Firebase prank numbers updated: ${prankArray.length} total`);
        });
    }
}

// Sync new numbers from Sheet to Firebase efficiently via bulk update
window.syncSheetToFirebase = async function(sheetNumbers) {
    if (!database || !sheetNumbers || !Array.isArray(sheetNumbers)) return;
    
    const prankRef = ref(database, 'prank_numbers');
    const snapshot = await get(prankRef);
    const existing = snapshot.val() || {};
    
    const existingNumbers = Object.keys(existing).map(key => existing[key].number);
    
    const updates = {};
    let addedCount = 0;
    
    for (const num of sheetNumbers) {
        if (!existingNumbers.includes(num)) {
            const newKey = push(prankRef).key;
            updates[`prank_numbers/${newKey}`] = {
                number: num,
                loggedBy: 'Sheet Bulk Sync',
                loggedAt: Date.now(),
                timestamp: new Date().toISOString()
            };
            addedCount++;
        }
    }
    
    if (addedCount > 0) {
        // Bulk update in a single network request (fast for 1600+ numbers)
        await update(ref(database), updates);
        console.log(`✅ Synced ${addedCount} new numbers from Sheet to Firebase in bulk!`);
    }
};

// ========== SINGLE-SESSION ENFORCEMENT ==========
// Ensures only ONE login per agent/admin ID at a time (superadmin is exempt).
// RTDB paths: active_sessions/agents/{id} and active_sessions/admins/{id}

window.claimSession = async function(type, id, name) {
    if (!database) return null;
    const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem('biz_session_token', token);
    try {
        await set(ref(database, 'active_sessions/' + type + '/' + id), {
            token: token,
            name: name || '',
            claimedAt: Date.now()
        });
    } catch(e) {
        console.warn('claimSession failed:', e);
    }
    return token;
};

window.watchSession = function(type, id, onKicked) {
    if (!database) return;
    const myToken = sessionStorage.getItem('biz_session_token');
    if (!myToken) return;
    let initialized = false;
    const sessionRef = ref(database, 'active_sessions/' + type + '/' + id);
    onValue(sessionRef, function(snap) {
        const data = snap.val();
        if (!initialized) {
            initialized = true;
            return; // skip the first fire (our own write)
        }
        if (!data) return;
        if (data.token && data.token !== myToken) {
            onKicked();
        }
    });
};

// ========== PRANK VISIBILITY FLAG ==========

// Set prank visibility in Firebase (superadmin only)
window.setPrankVisibility = async function(visible) {
    if (!database) return;
    try {
        await set(ref(database, 'settings/prankVisibility'), { visible: !!visible, updatedAt: Date.now() });
    } catch(e) {
        console.error('setPrankVisibility failed:', e);
    }
};

// Listen for prank visibility changes in real-time
window.listenForPrankVisibility = function(callback) {
    if (!database) return;
    const visRef = ref(database, 'settings/prankVisibility');
    onValue(visRef, (snapshot) => {
        const data = snapshot.val();
        // Default to true (visible) if no value has been set yet
        const visible = (data === null || data === undefined) ? true : !!data.visible;
        if (callback) callback(visible);
    });
};

// ========== INITIALIZATION ==========

// Initialize all listeners
function initFirebaseListeners() {
    listenForBroadcasts();
    listenForLeadAlerts();
    initPrankNumbersListener();
    
    if (typeof window.listenForAdmins === 'function') {
        window.listenForAdmins(); // auto-sync admins from Firebase on load
        window.listenForSuperAdmin();
    }
    
}
// ========== AGENT PROFILES (RTDB) ==========
window.saveAgentProfileToRTDB = async function(agentData) {
    if (!database) return { success: false, error: 'Database not initialized' };
    try {
        const agentId = String(agentData.userId);
        await set(ref(database, 'agent_profiles/' + agentId), {
            ...agentData,
            updatedAt: new Date().toISOString()
        });
        const snap = await get(ref(database, 'biz_master_roster'));
        let roster = snap.val() || [];
        if (!Array.isArray(roster)) roster = Object.values(roster);
        const idx = roster.findIndex(a => String(a.userId || a.id || '') === agentId);
        const entry = {
            fullName: agentData.fullName || '',
            userId: agentId,
            team: agentData.team || 'PR',
            ytelName: agentData.ytelName || '',
            shift: agentData.shift || '',
            lunchTime: agentData.lunchTime || '',
            breakTime: agentData.breakTime || '',
            status: agentData.status || 'Agent'
        };
        if (idx >= 0) roster[idx] = entry;
        else roster.push(entry);
        await set(ref(database, 'biz_master_roster'), roster);
        if (typeof window.clearDeletedAgentMarker === 'function') await window.clearDeletedAgentMarker(agentData);
        return { success: true };
    } catch (e) {
        console.error('saveAgentProfileToRTDB failed:', e);
        return { success: false, error: e.message };
    }
};

window.deleteAgentFromRTDB = async function(agentId) {
    if (!database) return { success: false };
    try {
        const id = String(agentId);
        await remove(ref(database, 'agent_profiles/' + id));
        const snap = await get(ref(database, 'biz_master_roster'));
        let roster = snap.val() || [];
        if (!Array.isArray(roster)) roster = Object.values(roster);
        roster = roster.filter(a => String(a.userId || a.id || '') !== id);
        await set(ref(database, 'biz_master_roster'), roster);
        return { success: true };
    } catch (e) {
        console.error('deleteAgentFromRTDB failed:', e);
        return { success: false, error: e.message };
    }
};

// ========== ATTENDANCE (RTDB) ==========
window.saveAttendanceToRTDB = async function(agentId, agentName, team, status, clockedAt) {
    if (!database) return { success: false, error: 'Database not initialized' };
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guyana' });
    try {
        await set(ref(database, 'attendance/' + today + '/' + String(agentId)), {
            agentId: String(agentId),
            agentName: agentName || '',
            team: team || '',
            status: status || 'Present',
            clockedAt: clockedAt || '',
            timestamp: Date.now()
        });
        return { success: true };
    } catch (e) {
        console.error('saveAttendanceToRTDB failed:', e);
        return { success: false, error: e.message };
    }
};

window.listenToDailyAttendance = function(date, callback) {
    if (!database) return null;
    return onValue(ref(database, 'attendance/' + date), (snap) => {
        callback(snap.val() || {});
    });
};

window.getAttendanceForDate = async function(date) {
    if (!database) return {};
    const snap = await get(ref(database, 'attendance/' + date));
    return snap.val() || {};
};


// Export functions to window for global access
window.showBroadcastBar = showBroadcastBar;
window.hideBroadcastBar = hideBroadcastBar;
window.sendBroadcastMessage = sendBroadcastMessage;
window.listenForBroadcasts = listenForBroadcasts;
window.adminLogin = adminLogin;
window.adminLogout = adminLogout;
window.showLeadAlert = showLeadAlert;
window.dismissBroadcast = dismissBroadcast;
window.dismissLeadAlert = function() {
    if (typeof window._dismissLeadAlertFully === 'function') {
        window._dismissLeadAlertFully();
        return;
    }
    const banner = document.getElementById('lead-alert-banner');
    if (banner) {
        banner.classList.remove('show');
        banner.style.display = '';
    }
    document.body.style.paddingTop = '';
};

// Auto-initialize when script loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFirebaseListeners);
} else {
    initFirebaseListeners();
}

console.log("Firebase.js loaded successfully");

// ========== CALL SIMULATOR RESULTS / COACHING INTELLIGENCE (RTDB) ==========
window.saveSimResult = async function(resultObj) {
    if (!database) return { success: false, error: 'Firebase database is not ready.' };
    try {
        const source = resultObj && typeof resultObj === 'object' ? resultObj : {};
        const rowRef = push(ref(database, 'simulator_results'));
        const payload = { ...source, createdAt: source.createdAt || Date.now(), updatedAt: Date.now() };
        await set(rowRef, payload);
        return { success: true, id: rowRef.key };
    } catch (e) {
        console.error('[Firebase] Unable to save simulator result:', e);
        return { success: false, error: e && e.message ? e.message : String(e) };
    }
};

window.listenForSimResults = function(callback) {
    if (!database) { setTimeout(() => window.listenForSimResults(callback), 500); return function(){}; }
    const resultsRef = ref(database, 'simulator_results');
    const unsubscribe = onValue(resultsRef, (snapshot) => {
        const data = snapshot.val() || {};
        const arr = Object.entries(data).map(([k, v]) => ({ id: k, ...(v || {}) }));
        arr.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        if (callback) callback(arr);
    });
    return unsubscribe;
};

window.saveSimAutoAssignment = async function(agentKey, assignment) {
    if (!database || !agentKey) return { success: false, error: 'Firebase database is not ready.' };
    try {
        const safeAgent = String(agentKey).replace(/[.#$\[\]\/]/g, '_');
        const skill = String((assignment && assignment.skill) || 'general').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'general';
        const target = ref(database, 'simulator_assignments/' + safeAgent + '/' + skill);
        const payload = { ...(assignment || {}), skill, updatedAt: Date.now(), createdAt: (assignment && assignment.createdAt) || Date.now(), status: (assignment && assignment.status) || 'assigned' };
        await set(target, payload);
        return { success: true };
    } catch (e) {
        console.error('[Firebase] Unable to save simulator assignment:', e);
        return { success: false, error: e && e.message ? e.message : String(e) };
    }
};

window.listenForSimAssignments = function(agentKey, callback) {
    if (!database || !agentKey) { setTimeout(() => window.listenForSimAssignments(agentKey, callback), 500); return function(){}; }
    const safeAgent = String(agentKey).replace(/[.#$\[\]\/]/g, '_');
    const assignmentRef = ref(database, 'simulator_assignments/' + safeAgent);
    const unsubscribe = onValue(assignmentRef, (snapshot) => {
        const data = snapshot.val() || {};
        const arr = Object.entries(data).map(([k, v]) => ({ id: k, ...(v || {}) }));
        arr.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        if (callback) callback(arr);
    });
    return unsubscribe;
};
