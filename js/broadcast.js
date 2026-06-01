// js/firebase-broadcast.js
// Firebase-powered Broadcast System (replaces old broadcast.js)

let bcUnlocked = false;
let tapCount = 0;
let lastTap = 0;

// Listen for real-time broadcast messages
function initBroadcastListener() {
    if (!db) {
        console.warn('Firestore not initialized');
        return;
    }
    
    db.collection('broadcasts').orderBy('timestamp', 'desc').limit(1)
        .onSnapshot((snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    const data = change.doc.data();
                    if (data.message && data.message.trim()) {
                        showBroadcastBar(data.message, data.timestamp);
                    }
                }
            });
        });
}

function showBroadcastBar(message, timestamp) {
    const bcBar = document.getElementById('broadcast-bar');
    const bcText = document.getElementById('bc-message-text');
    if (bcBar && bcText) {
        bcText.innerHTML = message;
        bcBar.style.display = 'block';
        // Auto-hide after 10 seconds
        setTimeout(() => {
            if (bcBar) bcBar.style.display = 'none';
        }, 10000);
    }
}

async function sendBroadcastToFirebase(message) {
    if (!bcUnlocked && !isFirebaseAdminLoggedIn()) {
        alert('Admin access required');
        return;
    }
    
    if (!message || !message.trim()) {
        alert('Please enter a message');
        return;
    }
    
    try {
        await db.collection('broadcasts').add({
            message: message.trim(),
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            sentBy: auth.currentUser?.email || 'admin'
        });
        document.getElementById('bc-input').value = '';
        document.getElementById('bc-status').innerHTML = '<span style="color:#22c55e;">✅ Broadcast sent!</span>';
        setTimeout(() => {
            const statusEl = document.getElementById('bc-status');
            if (statusEl) statusEl.innerHTML = '';
        }, 2000);
    } catch (error) {
        console.error('Broadcast error:', error);
        document.getElementById('bc-status').innerHTML = '<span style="color:#ef4444;">❌ Failed to send</span>';
    }
}

async function clearBroadcastFirebase() {
    if (!bcUnlocked && !isFirebaseAdminLoggedIn()) {
        alert('Admin access required');
        return;
    }
    
    try {
        const snapshot = await db.collection('broadcasts').get();
        const batch = db.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        document.getElementById('bc-status').innerHTML = '<span style="color:#22c55e;">🗑 All broadcasts cleared</span>';
        const bcBar = document.getElementById('broadcast-bar');
        if (bcBar) bcBar.style.display = 'none';
        setTimeout(() => {
            const statusEl = document.getElementById('bc-status');
            if (statusEl) statusEl.innerHTML = '';
        }, 2000);
    } catch (error) {
        console.error('Clear error:', error);
    }
}

// ========== ADMIN TRIGGER LOGIC ==========

window.handleTitleTap = function() {
    const now = Date.now();
    if (now - lastTap > 2000) tapCount = 0; // reset if too slow
    tapCount++;
    lastTap = now;
    
    if (tapCount >= 5) {
        tapCount = 0;
        window.toggleBcPanel();
    }
};

window.toggleBcPanel = function() {
    const panel = document.getElementById('bc-panel');
    if (!panel) return;
    
    if (panel.style.display === 'block') {
        panel.style.display = 'none';
    } else {
        // If not already unlocked and not logged in as admin, show login modal
        const isAuth = (typeof isFirebaseAdminLoggedIn === 'function' && isFirebaseAdminLoggedIn()) || 
                       (typeof isAdminLoggedIn === 'function' && isAdminLoggedIn()) ||
                       sessionStorage.getItem('bizUserRole') === 'admin';
                       
        if (bcUnlocked || isAuth) {
            panel.style.display = 'block';
        } else {
            const modal = document.getElementById('bc-login-modal');
            if (modal) modal.classList.remove('hidden');
        }
    }
};

window.checkBcPassword = function() {
    const input = document.getElementById('bc-pw-input');
    const error = document.getElementById('bc-pw-error');
    const pw = input ? input.value : '';
    
    // Check against common passwords in the system
    const validPasswords = [
        typeof WEEKLY_PASSWORD !== 'undefined' ? WEEKLY_PASSWORD : 'bizlevelup2025',
        'PopoDarling',
        '2424',
        'admin'
    ];
    
    if (validPasswords.includes(pw)) {
        bcUnlocked = true;
        document.getElementById('bc-login-modal').classList.add('hidden');
        document.getElementById('bc-panel').style.display = 'block';
        if (input) input.value = '';
        if (error) error.textContent = '';
    } else {
        if (error) error.textContent = '❌ Invalid administrative password';
        if (input) input.value = '';
    }
};

function isFirebaseAdminLoggedIn() {
    return sessionStorage.getItem('firebaseAdminLoggedIn') === 'true' || 
           sessionStorage.getItem('adminLoggedIn') === 'true' ||
           sessionStorage.getItem('bizUserRole') === 'admin';
}

// Override original functions if they exist
window.sendBroadcast = () => {
    const msg = document.getElementById('bc-input')?.value;
    sendBroadcastToFirebase(msg);
};
window.clearBroadcast = clearBroadcastFirebase;
window.dismissBroadcast = () => {
    const bar = document.getElementById('broadcast-bar');
    if (bar) bar.style.display = 'none';
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase !== 'undefined' && typeof db !== 'undefined' && db) {
        initBroadcastListener();
    }
});
