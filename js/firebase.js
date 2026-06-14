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
    
    console.log("Firebase & Firestore initialized successfully");
} catch (error) {
    console.error("Firebase initialization error:", error);
}

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
        const arr = Object.entries(data).map(([k, v]) => ({ id: k, ...v }));
        arr.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        if (callback) callback(arr);
    });
};

window.saveSimScript = async function(scriptObj) {
    if (!database) return { success: false };
    try {
        let r;
        if (scriptObj.id) {
            r = ref(database, 'simulator_scripts/' + scriptObj.id);
            await set(r, scriptObj);
            return { success: true, id: scriptObj.id };
        } else {
            r = push(ref(database, 'simulator_scripts'));
            scriptObj.id = r.key;
            await set(r, scriptObj);
            return { success: true, id: r.key };
        }
    } catch(e) { return { success: false, error: e.message }; }
};

window.deleteSimScript = async function(id) {
    if (!database || !id) return;
    await set(ref(database, 'simulator_scripts/' + id), null);
};

// ========== BROADCAST FUNCTIONS ==========

// Function to show broadcast bar
function showBroadcastBar(message) {
    const broadcastBar = document.getElementById('broadcast-bar');
    const broadcastText = document.getElementById('bc-message-text');
    
    if (broadcastBar && broadcastText) {
        broadcastText.textContent = message || 'Admin message';
        broadcastBar.style.display = 'block';
        
        // Auto-hide after 10 seconds
        setTimeout(() => {
            if (broadcastBar) {
                broadcastBar.style.display = 'none';
            }
        }, 10000);
    }
}

// Function to hide broadcast bar
function hideBroadcastBar() {
    const broadcastBar = document.getElementById('broadcast-bar');
    if (broadcastBar) {
        broadcastBar.style.display = 'none';
    }
}

// Listen for broadcast messages from Firebase
function listenForBroadcasts() {
    if (!database) {
        console.warn("Firebase not initialized, skipping broadcast listener");
        return;
    }
    
    const broadcastsRef = ref(database, 'broadcasts/latest');
    
    onValue(broadcastsRef, (snapshot) => {
        const data = snapshot.val();
        if (data && data.message) {
            showBroadcastBar(data.message);
        }
    }, (error) => {
        console.error("Broadcast listener error:", error);
    });
}

// Send broadcast message (admin function)
async function sendBroadcastMessage(message, adminId) {
    if (!database) {
        console.warn("Firebase not initialized");
        alert("Firebase not configured. Using localStorage fallback.");
        
        // Fallback to localStorage
        const broadcast = {
            message: message,
            timestamp: new Date().toISOString(),
            sentBy: adminId || 'admin'
        };
        localStorage.setItem('biz_broadcast', JSON.stringify(broadcast));
        showBroadcastBar(message);
        return true;
    }
    
    try {
        const broadcastData = {
            message: message,
            timestamp: Date.now(),
            sentBy: adminId || 'admin'
        };
        
        await set(ref(database, 'broadcasts/latest'), broadcastData);
        console.log("Broadcast sent successfully");
        showBroadcastBar(message);
        return true;
    } catch (error) {
        console.error("Error sending broadcast:", error);
        alert("Failed to send broadcast. Check Firebase configuration.");
        return false;
    }
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
    const unsubscribe = onValue(ref(database, 'admins_list/' + adminKey), (snapshot) => {
        if (callback) callback(snapshot.val());
    });
    return unsubscribe;
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
        const reportsArray = Object.keys(data).map(k => ({id: k, ...data[k]}));
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
        const arr = Object.keys(data).map(k => ({id: k, ...data[k]}));
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
        if (callback) callback(snapshot.val());
    });
};

window.saveLiveDashboardState = async function(stateObj) {
    if (!database) return;
    await set(ref(database, 'live_dashboard_state'), stateObj);
};

window.listenForMasterRoster = function(callback) {
    if (!database) return;
    onValue(ref(database, 'biz_master_roster'), (snapshot) => {
        if (callback) callback(snapshot.val());
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
            callback(profiles);
        }, (error) => {
            console.warn("Modular Listener Error, trying fallback...", error);
            const fallbackQ = query(collection(fs, 'agent_profiles'));
            onSnapshot(fallbackQ, (snapshot) => {
                const profiles = [];
                snapshot.forEach(doc => profiles.push({ id: doc.id, ...doc.data() }));
                callback(profiles);
            });
        });
    };

    if (firestore) {
        return useModular(firestore);
    } else if (window.db && typeof window.db.collection === 'function') {
        console.log("Using Compat Firestore for Agent Profiles");
        return window.db.collection('agent_profiles').orderBy('fullName', 'asc').onSnapshot(snap => {
            const profiles = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(profiles);
        }, err => {
            console.error("Compat Firestore Error:", err);
            window.db.collection('agent_profiles').onSnapshot(snap => {
                const profiles = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                callback(profiles);
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
        
        sessionStorage.setItem('agentLoggedIn', '1');
        sessionStorage.setItem('bizUserRole', 'admin');
        sessionStorage.setItem('bizAdminId', user.uid);
        sessionStorage.setItem('bizAdminEmail', user.email);
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

                window._renderLeadAlert({
                    icon: hasFirst ? '🏆' : '🔥',
                    name: n + ' New Lead' + (n !== 1 ? 's' : '') + ' Just Hit the Floor!',
                    msg: agentStr,
                    quote: quote,
                    firstLead: hasFirst,
                    isUploadAlert: true
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
                
                window._renderLeadAlert({
                    icon: isFirst ? '🥇' : '🔥',
                    name: `${name} — New Lead!`,
                    msg: msg,
                    quote: quote,
                    firstLead: isFirst
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
    
    // Check for stored broadcast on page load
    const storedBroadcast = localStorage.getItem('biz_broadcast');
    if (storedBroadcast) {
        try {
            const broadcast = JSON.parse(storedBroadcast);
            // Only show if less than 1 hour old
            const broadcastTime = new Date(broadcast.timestamp);
            const now = new Date();
            const hoursDiff = (now - broadcastTime) / (1000 * 60 * 60);
            
            if (hoursDiff < 1) {
                showBroadcastBar(broadcast.message);
            }
        } catch (e) {
            console.error("Error parsing stored broadcast:", e);
        }
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
window.adminLogin = adminLogin;
window.adminLogout = adminLogout;
window.showLeadAlert = showLeadAlert;
window.dismissBroadcast = hideBroadcastBar;
window.dismissLeadAlert = function() {
    const banner = document.getElementById('lead-alert-banner');
    if (banner) {
        banner.classList.remove('show');
        banner.style.display = '';
    }
};

// Auto-initialize when script loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFirebaseListeners);
} else {
    initFirebaseListeners();
}

console.log("Firebase.js loaded successfully");
