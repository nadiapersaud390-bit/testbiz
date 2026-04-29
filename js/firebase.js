// js/firebase.js
// Firebase configuration and real-time listeners

// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, onValue, set, push, get, update } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getFirestore, doc, setDoc, getDocs, collection, query, orderBy, onSnapshot, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
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
    console.log("Firebase & Firestore initialized successfully");
} catch (error) {
    console.error("Firebase initialization error:", error);
}

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
            details: details
        };
        await push(ref(database, 'activity_logs'), logEntry);
    } catch(e) {
        console.error("Activity logging failed", e);
    }
};

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

window.listenForAdmins = function(callback) {
    if (!database) return;
    onValue(ref(database, 'admins_list'), (snapshot) => {
        const data = snapshot.val() || {};
        localStorage.setItem('biz_admins_list_v1', JSON.stringify(data));
        if (callback) callback(data);
    });
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
        if (data && data.agentName && data.leadCount) {
            showLeadAlert(data.agentName, data.leadCount);
        }
    }, (error) => {
        console.error("Lead alert listener error:", error);
    });
}

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
    if (banner) banner.style.display = 'none';
};

// Auto-initialize when script loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFirebaseListeners);
} else {
    initFirebaseListeners();
}

console.log("Firebase.js loaded successfully");
