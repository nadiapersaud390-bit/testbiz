// js/firebase.js
// Firebase configuration and real-time listeners

// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, onValue, set, push } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// Your Firebase configuration (replace with your actual config)
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    databaseURL: "https://YOUR_PROJECT.firebaseio.com",
    projectId: "YOUR_PROJECT",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Initialize Firebase
let app;
let database;
let auth;

try {
    app = initializeApp(firebaseConfig);
    database = getDatabase(app);
    auth = getAuth(app);
    console.log("Firebase initialized successfully");
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

// Function to log admin activity (prevents 405 errors)
async function logAdminActivity(action, details) {
    // Check if user is admin
    const userRole = sessionStorage.getItem('bizUserRole');
    if (userRole !== 'admin') return;
    
    // Try to send to API, but don't error if it fails
    try {
        const response = await fetch('/api/activity', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                adminId: sessionStorage.getItem('bizAdminId') || '',
                adminName: sessionStorage.getItem('bizAdminName') || '',
                action: action,
                details: details,
                page: window.location.pathname,
                timestamp: new Date().toISOString()
            })
        });
        
        if (!response.ok) {
            // Silently fail - API might not exist
            console.debug("Activity log API not available, storing locally");
            storeActivityLocally(action, details);
        }
    } catch (error) {
        // Store locally instead
        console.debug("Activity log API not available, storing locally");
        storeActivityLocally(action, details);
    }
}

// Store activity in localStorage as fallback
function storeActivityLocally(action, details) {
    const activities = JSON.parse(localStorage.getItem('biz_activity_log') || '[]');
    activities.unshift({
        action: action,
        details: details,
        adminId: sessionStorage.getItem('bizAdminId') || '',
        adminName: sessionStorage.getItem('bizAdminName') || '',
        timestamp: new Date().toISOString()
    });
    
    // Keep only last 100 activities
    const trimmed = activities.slice(0, 100);
    localStorage.setItem('biz_activity_log', JSON.stringify(trimmed));
}

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
        
        await logAdminActivity('login', `Admin ${user.email} logged in`);
        
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

// ========== INITIALIZATION ==========

// Initialize all listeners
function initFirebaseListeners() {
    listenForBroadcasts();
    listenForLeadAlerts();
    
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
window.logAdminActivity = logAdminActivity;
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
