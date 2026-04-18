// js/firebase-broadcast.js
// Firebase-powered Broadcast System (replaces old broadcast.js)

let bcUnlocked = false;

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
    if (typeof firebase !== 'undefined' && db) {
        initBroadcastListener();
    }
});
