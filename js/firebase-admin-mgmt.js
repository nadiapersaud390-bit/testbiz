// js/firebase-admin-mgmt.js
// Multi-Admin Management System

let currentAdminEmail = null;

// ========== ADMIN AUTHENTICATION ==========
async function signInWithEmail(email, password) {
    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        currentAdminEmail = userCredential.user.email;
        
        // Check if user is authorized admin in Firestore
        const adminDoc = await db.collection('admins').doc(currentAdminEmail).get();
        if (!adminDoc.exists) {
            await auth.signOut();
            throw new Error('Not authorized as admin');
        }
        
        sessionStorage.setItem('firebaseAdminEmail', currentAdminEmail);
        sessionStorage.setItem('firebaseAdminLoggedIn', 'true');
        return { success: true, email: currentAdminEmail };
    } catch (error) {
        console.error('Login error:', error);
        return { success: false, error: error.message };
    }
}

async function signOutAdmin() {
    await auth.signOut();
    sessionStorage.removeItem('firebaseAdminEmail');
    sessionStorage.removeItem('firebaseAdminLoggedIn');
    currentAdminEmail = null;
    window.location.href = 'admin-login.html';
}

function isFirebaseAdminLoggedIn() {
    return sessionStorage.getItem('firebaseAdminLoggedIn') === 'true';
}

// ========== ADMIN MANAGEMENT (SUPER ADMIN ONLY) ==========
async function addAdmin(email, role = 'admin') {
    if (!isFirebaseAdminLoggedIn()) {
        throw new Error('Not logged in');
    }
    
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('No authenticated user');
    
    // Check if current user is super admin
    const currentAdminDoc = await db.collection('admins').doc(currentUser.email).get();
    if (currentAdminDoc.data()?.role !== 'super_admin') {
        throw new Error('Only super admins can add new admins');
    }
    
    // Add to Firestore
    await db.collection('admins').doc(email).set({
        email: email,
        role: role,
        createdBy: currentUser.email,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    return { success: true };
}

async function removeAdmin(email) {
    if (!isFirebaseAdminLoggedIn()) {
        throw new Error('Not logged in');
    }
    
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('No authenticated user');
    
    // Check if current user is super admin
    const currentAdminDoc = await db.collection('admins').doc(currentUser.email).get();
    if (currentAdminDoc.data()?.role !== 'super_admin') {
        throw new Error('Only super admins can remove admins');
    }
    
    // Cannot remove self
    if (email === currentUser.email) {
        throw new Error('Cannot remove your own admin account');
    }
    
    await db.collection('admins').doc(email).delete();
    return { success: true };
}

async function getAdminList() {
    if (!isFirebaseAdminLoggedIn()) return [];
    
    const snapshot = await db.collection('admins').get();
    return snapshot.docs.map(doc => ({
        email: doc.id,
        ...doc.data()
    }));
}

// ========== INITIAL SETUP (Run once to create super admin) ==========
// After deploying, visit: /setup-admin.html to create first super admin
async function setupSuperAdmin(email, password) {
    try {
        // Create user in Firebase Auth
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        
        // Add as super admin in Firestore
        await db.collection('admins').doc(email).set({
            email: email,
            role: 'super_admin',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        await auth.signOut();
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}
