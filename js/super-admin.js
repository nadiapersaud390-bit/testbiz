// js/super-admin.js
// Complete Multi-Admin System with DEFAULT SUPER ADMIN

const SUPER_ADMIN_KEY = 'biz_super_admin_v1';
const ADMINS_KEY = 'biz_admins_list_v1';
const ACTIVITY_LOG_KEY = 'biz_activity_logs_v1';

window.writeAdminActivityLog = function(action, details, specificAdmin = null) {
    let admin = specificAdmin || JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');
    if (!admin || (!admin.email && !admin.name)) return;
    
    let logs = [];
    try {
        logs = JSON.parse(localStorage.getItem(ACTIVITY_LOG_KEY) || '[]');
    } catch(e) {}
    
    logs.unshift({
        id: Date.now(),
        timestamp: new Date().toISOString(),
        email: admin.email || 'unknown',
        name: admin.name || admin.email || 'unknown',
        role: admin.role || 'unknown',
        action: action,
        details: details
    });
    
    if (logs.length > 500) logs = logs.slice(0, 500); // keep max 500 logs
    localStorage.setItem(ACTIVITY_LOG_KEY, JSON.stringify(logs));
};

// ============================================
// DEFAULT SUPER ADMIN - CHANGE THESE VALUES!
// ============================================
const DEFAULT_SUPER_ADMIN = {
    email: "rose",
    password: "PopoDarling",              // 👈 Updated to match user guidelines
    name: "Master Super Admin",         // 👈 CHANGE THIS to your name
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
    }
}

// Seed specific default regular admins if they don't exist
// Default regular admin credentials (always guaranteed)
const DEFAULT_ADMIN_ACCOUNTS = [
    { id: "momo",  name: "Momo",  pass: "2424" },
    { id: "0000", name: "Admin", pass: "admin" }
];

// IDs that exist as logins but get NO admin features (enforced in getAdminPermissions)
const RESTRICTED_ADMIN_IDS = ['0000'];

function seedDefaultAdmins() {
    const admins = JSON.parse(localStorage.getItem(ADMINS_KEY) || '{}');
    let changed = false;

    // Cleanup old system accounts not in current defaults
    const currentDefaultIds = DEFAULT_ADMIN_ACCOUNTS.map(d => d.id);
    Object.keys(admins).forEach(id => {
        if (admins[id].addedBy === 'system' && !currentDefaultIds.includes(id)) {
            delete admins[id];
            changed = true;
        }
    });

    DEFAULT_ADMIN_ACCOUNTS.forEach(d => {
        // ALWAYS overwrite default accounts (momo, 0000) so Firebase data
        // can never break their guaranteed credentials.
        const existing = admins[d.id];
        admins[d.id] = {
            email: d.id,
            name: d.name,
            password: btoa(d.pass),
            role: 'admin',
            addedBy: 'system',
            addedAt: (existing && existing.addedAt) ? existing.addedAt : new Date().toISOString()
        };
        changed = true;
    });

    if (changed) {
        localStorage.setItem(ADMINS_KEY, JSON.stringify(admins));
        // Attempt Firebase sync — may not be available on login page
        if (typeof window.saveAdminsListToFirebase === 'function') {
            window.saveAdminsListToFirebase(admins);
        }
        console.log('✅ Default admins seeded to localStorage.');
    }
}

// Expose so the login page can also call this after Firebase sync
window.seedDefaultAdmins = seedDefaultAdmins;

// Call initializations
initializeDefaultSuperAdmin();
seedDefaultAdmins();

// ========== LOGIN SYSTEM ==========
function superAdminLogin(email, password) {
    // Check super admin first
    const superAdmin = localStorage.getItem(SUPER_ADMIN_KEY);
    if (superAdmin) {
        const admin = JSON.parse(superAdmin);
        const isMatch = (admin.email === email || (String(email).toUpperCase() === 'ROSE' && admin.role === 'super_admin'));
        if (isMatch && atob(admin.password) === password) {
            sessionStorage.setItem('currentAdmin', JSON.stringify({
                email: admin.email,
                name: admin.name,
                role: 'super_admin',
                isSuper: true
            }));
            sessionStorage.setItem('adminLoggedIn', 'true');
            sessionStorage.setItem('bizAdminUnlocked', '1');
            sessionStorage.setItem('bizUserRole', 'admin');
            window.writeAdminActivityLog('login', 'Super Admin logged in', {email: admin.email, name: admin.name, role: 'super_admin'});
            return { success: true, role: 'super_admin' };
        }
    }
    
    // Check regular admins
    const admins = JSON.parse(localStorage.getItem(ADMINS_KEY) || '{}');
    const lookupKey = String(email || '').toLowerCase();
    const admin = admins[lookupKey];
    
    if (admin && admin.password === btoa(password)) {
        sessionStorage.setItem('currentAdmin', JSON.stringify({
            email: admin.email,
            name: admin.name,
            role: admin.role || 'admin',
            isSuper: false
        }));
        sessionStorage.setItem('adminLoggedIn', 'true');
        sessionStorage.setItem('bizAdminUnlocked', '1');
        sessionStorage.setItem('bizUserRole', 'admin');
        window.writeAdminActivityLog('login', 'Admin logged in', {email: admin.email, name: admin.name, role: admin.role || 'admin'});
        return { success: true, role: admin.role || 'admin' };
    }
    
    window.writeAdminActivityLog('login_failed', 'Failed admin login attempt: ' + email, {email: email, name: 'Unknown', role: 'unknown'});
    return { success: false, error: 'Invalid credentials' };
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

function addNewAdmin(email, password, name, role = 'admin') {
    const currentAdmin = JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');
    if (currentAdmin.role !== 'super_admin') {
        return { success: false, error: 'Only super admin can add new admins' };
    }
    
    const admins = JSON.parse(localStorage.getItem(ADMINS_KEY) || '{}');
    const saveKey = String(email || '').toLowerCase();
    
    if (admins[saveKey]) {
        return { success: false, error: 'Admin already exists' };
    }
    
    admins[saveKey] = {
        email: saveKey,
        name: name,
        role: role,
        password: btoa(password),
        addedBy: currentAdmin.email,
        addedAt: new Date().toISOString()
    };
    
    localStorage.setItem(ADMINS_KEY, JSON.stringify(admins));
    if (typeof window.saveAdminsListToFirebase === 'function') window.saveAdminsListToFirebase(admins);
    window.writeAdminActivityLog('user_management', 'Added new admin: ' + email);
    return { success: true, message: 'Admin added successfully' };
}

function removeAdmin(email) {
    const currentAdmin = JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');
    if (currentAdmin.role !== 'super_admin') {
        return { success: false, error: 'Only super admin can remove admins' };
    }
    
    if (email === currentAdmin.email) {
        return { success: false, error: 'Cannot remove yourself' };
    }
    
    const admins = JSON.parse(localStorage.getItem(ADMINS_KEY) || '{}');
    delete admins[email];
    localStorage.setItem(ADMINS_KEY, JSON.stringify(admins));
    if (typeof window.saveAdminsListToFirebase === 'function') window.saveAdminsListToFirebase(admins);
    
    window.writeAdminActivityLog('user_management', 'Removed admin: ' + email);
    return { success: true, message: 'Admin removed successfully' };
}

function updateAdminRole(email, newRole) {
    const currentAdmin = JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');
    if (currentAdmin.role !== 'super_admin') {
        return { success: false, error: 'Only super admin can change roles' };
    }
    
    const admins = JSON.parse(localStorage.getItem(ADMINS_KEY) || '{}');
    if (!admins[email]) {
        return { success: false, error: 'Admin not found' };
    }
    
    admins[email].role = newRole;
    localStorage.setItem(ADMINS_KEY, JSON.stringify(admins));
    if (typeof window.saveAdminsListToFirebase === 'function') window.saveAdminsListToFirebase(admins);
    window.writeAdminActivityLog('user_management', `Updated role for ${email} to ${newRole}`);
    return { success: true, message: 'Role updated successfully' };
}

function changeOwnPassword(email, oldPassword, newPassword) {
    // Check super admin
    const superAdmin = localStorage.getItem(SUPER_ADMIN_KEY);
    if (superAdmin) {
        const admin = JSON.parse(superAdmin);
        if (admin.email === email && atob(admin.password) === oldPassword) {
            admin.password = btoa(newPassword);
            localStorage.setItem(SUPER_ADMIN_KEY, JSON.stringify(admin));
            if (typeof window.saveSuperAdminToFirebase === 'function') window.saveSuperAdminToFirebase(admin);
            return { success: true, message: 'Password changed successfully' };
        }
    }
    
    // Check regular admins
    const admins = JSON.parse(localStorage.getItem(ADMINS_KEY) || '{}');
    const admin = admins[email];
    if (admin && atob(admin.password) === oldPassword) {
        admin.password = btoa(newPassword);
        localStorage.setItem(ADMINS_KEY, JSON.stringify(admins));
        if (typeof window.saveAdminsListToFirebase === 'function') window.saveAdminsListToFirebase(admins);
        return { success: true, message: 'Password changed successfully' };
    }
    
    return { success: false, error: 'Current password is incorrect' };
}

function superResetAdminPassword(email, newPassword) {
    const currentAdmin = JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');
    if (currentAdmin.role !== 'super_admin' && !currentAdmin.isSuper) {
        return { success: false, error: 'Only super admin can reset passwords' };
    }
    
    const admins = JSON.parse(localStorage.getItem(ADMINS_KEY) || '{}');
    if (!admins[email]) {
        return { success: false, error: 'Admin not found' };
    }
    
    admins[email].password = btoa(newPassword);
    localStorage.setItem(ADMINS_KEY, JSON.stringify(admins));
    if (typeof window.saveAdminsListToFirebase === 'function') window.saveAdminsListToFirebase(admins);
    window.writeAdminActivityLog('user_management', `Super Admin reset password for: ${email}`);
    return { success: true, message: 'Password reset successfully' };
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
