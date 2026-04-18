// js/multi-admin.js
// Multi-Admin Management System - No Firebase Required

// Admin data structure (stored in localStorage)
// Format: { "admin@email.com": { password: "hashed", role: "admin|super_admin", name: "Name" } }

const ADMIN_STORAGE_KEY = 'biz_multi_admins_v1';

// Default super admin (change this on first use!)
const DEFAULT_SUPER_ADMIN = {
    email: 'super@bizlevelup.com',
    password: 'Admin123!',  // CHANGE THIS IMMEDIATELY AFTER FIRST LOGIN
    role: 'super_admin',
    name: 'Super Admin'
};

// Initialize admin list if empty
function initAdminList() {
    let admins = getAdminList();
    if (Object.keys(admins).length === 0) {
        admins[DEFAULT_SUPER_ADMIN.email] = {
            password: btoa(DEFAULT_SUPER_ADMIN.password), // Simple encoding
            role: DEFAULT_SUPER_ADMIN.role,
            name: DEFAULT_SUPER_ADMIN.name,
            createdBy: 'system',
            createdAt: new Date().toISOString()
        };
        saveAdminList(admins);
        console.log('Default super admin created. Email: super@bizlevelup.com, Password: Admin123!');
        console.log('⚠️ CHANGE THIS PASSWORD IMMEDIATELY AFTER FIRST LOGIN!');
    }
}

function getAdminList() {
    try {
        return JSON.parse(localStorage.getItem(ADMIN_STORAGE_KEY) || '{}');
    } catch(e) {
        return {};
    }
}

function saveAdminList(admins) {
    localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(admins));
}

// Simple hash function (for demo - use bcrypt in production)
function hashPassword(password) {
    return btoa(password); // Base64 encoding (not secure for production!)
}

function verifyPassword(password, hashed) {
    return btoa(password) === hashed;
}

// Login with email/password
async function adminLogin(email, password) {
    const admins = getAdminList();
    const admin = admins[email];
    
    if (!admin) {
        return { success: false, error: 'Admin not found' };
    }
    
    if (!verifyPassword(password, admin.password)) {
        return { success: false, error: 'Invalid password' };
    }
    
    // Store session
    sessionStorage.setItem('adminEmail', email);
    sessionStorage.setItem('adminRole', admin.role);
    sessionStorage.setItem('adminName', admin.name);
    sessionStorage.setItem('adminLoggedIn', 'true');
    
    return { success: true, email, role: admin.role };
}

// Add new admin (only super admin)
function addAdmin(email, password, role, name) {
    const currentAdminEmail = sessionStorage.getItem('adminEmail');
    const currentAdminRole = sessionStorage.getItem('adminRole');
    
    if (currentAdminRole !== 'super_admin') {
        return { success: false, error: 'Only super admins can add new admins' };
    }
    
    const admins = getAdminList();
    
    if (admins[email]) {
        return { success: false, error: 'Admin already exists' };
    }
    
    admins[email] = {
        password: hashPassword(password),
        role: role,
        name: name,
        createdBy: currentAdminEmail,
        createdAt: new Date().toISOString()
    };
    
    saveAdminList(admins);
    return { success: true };
}

// Remove admin (only super admin)
function removeAdmin(email) {
    const currentAdminEmail = sessionStorage.getItem('adminEmail');
    const currentAdminRole = sessionStorage.getItem('adminRole');
    
    if (currentAdminRole !== 'super_admin') {
        return { success: false, error: 'Only super admins can remove admins' };
    }
    
    if (email === currentAdminEmail) {
        return { success: false, error: 'Cannot remove yourself' };
    }
    
    const admins = getAdminList();
    delete admins[email];
    saveAdminList(admins);
    return { success: true };
}

// Change own password
function changePassword(oldPassword, newPassword) {
    const currentAdminEmail = sessionStorage.getItem('adminEmail');
    const admins = getAdminList();
    const admin = admins[currentAdminEmail];
    
    if (!verifyPassword(oldPassword, admin.password)) {
        return { success: false, error: 'Current password is incorrect' };
    }
    
    admins[currentAdminEmail].password = hashPassword(newPassword);
    saveAdminList(admins);
    return { success: true };
}

// Get all admins (filtered by permission)
function getAllAdmins() {
    const currentAdminRole = sessionStorage.getItem('adminRole');
    const admins = getAdminList();
    
    if (currentAdminRole === 'super_admin') {
        return Object.entries(admins).map(([email, data]) => ({
            email,
            ...data,
            password: '••••••' // Don't show password
        }));
    } else {
        // Regular admins can only see themselves
        const currentEmail = sessionStorage.getItem('adminEmail');
        return Object.entries(admins)
            .filter(([email]) => email === currentEmail)
            .map(([email, data]) => ({
                email,
                ...data,
                password: '••••••'
            }));
    }
}

// Check if logged in
function isAdminLoggedIn() {
    return sessionStorage.getItem('adminLoggedIn') === 'true';
}

// Logout
function adminLogout() {
    sessionStorage.removeItem('adminEmail');
    sessionStorage.removeItem('adminRole');
    sessionStorage.removeItem('adminName');
    sessionStorage.removeItem('adminLoggedIn');
    window.location.href = 'admin-login.html';
}

// Initialize on load
initAdminList();
