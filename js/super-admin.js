// js/super-admin.js
// Complete Multi-Admin Management System with Super Admin Creation

const SUPER_ADMIN_KEY = 'biz_super_admin_v1';
const ADMINS_KEY = 'biz_admins_list_v1';

// ========== INITIAL SETUP ==========
// Run this ONCE to create the first super admin
function setupFirstSuperAdmin(email, password, name) {
    // Check if super admin already exists
    const existingSuper = localStorage.getItem(SUPER_ADMIN_KEY);
    if (existingSuper) {
        return { success: false, error: 'Super admin already exists! Use the login page.' };
    }
    
    // Create super admin
    const superAdmin = {
        email: email,
        password: btoa(password), // Simple encoding (upgrade for production)
        name: name,
        role: 'super_admin',
        created: new Date().toISOString(),
        isSuper: true
    };
    
    localStorage.setItem(SUPER_ADMIN_KEY, JSON.stringify(superAdmin));
    
    // Initialize admins list
    const admins = {
        [email]: {
            email: email,
            name: name,
            role: 'super_admin',
            addedBy: 'system',
            addedAt: new Date().toISOString()
        }
    };
    localStorage.setItem(ADMINS_KEY, JSON.stringify(admins));
    
    return { success: true, message: 'Super admin created successfully!' };
}

// ========== LOGIN SYSTEM ==========
function superAdminLogin(email, password) {
    // Check super admin first
    const superAdmin = localStorage.getItem(SUPER_ADMIN_KEY);
    if (superAdmin) {
        const admin = JSON.parse(superAdmin);
        if (admin.email === email && atob(admin.password) === password) {
            sessionStorage.setItem('currentAdmin', JSON.stringify({
                email: admin.email,
                name: admin.name,
                role: 'super_admin',
                isSuper: true
            }));
            sessionStorage.setItem('adminLoggedIn', 'true');
            sessionStorage.setItem('bizAdminUnlocked', '1');
            sessionStorage.setItem('bizUserRole', 'admin');
            return { success: true, role: 'super_admin' };
        }
    }
    
    // Check regular admins
    const admins = JSON.parse(localStorage.getItem(ADMINS_KEY) || '{}');
    const admin = admins[email];
    
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
        return { success: true, role: admin.role || 'admin' };
    }
    
    return { success: false, error: 'Invalid credentials' };
}

// ========== ADMIN MANAGEMENT (Super Admin only) ==========
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
    
    if (admins[email]) {
        return { success: false, error: 'Admin already exists' };
    }
    
    admins[email] = {
        email: email,
        name: name,
        role: role,
        password: btoa(password),
        addedBy: currentAdmin.email,
        addedAt: new Date().toISOString()
    };
    
    localStorage.setItem(ADMINS_KEY, JSON.stringify(admins));
    return { success: true, message: 'Admin added successfully' };
}

function removeAdmin(email) {
    const currentAdmin = JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');
    if (currentAdmin.role !== 'super_admin') {
        return { success: false, error: 'Only super admin can remove admins' };
    }
    
    // Prevent removing self
    if (email === currentAdmin.email) {
        return { success: false, error: 'Cannot remove yourself' };
    }
    
    const admins = JSON.parse(localStorage.getItem(ADMINS_KEY) || '{}');
    delete admins[email];
    localStorage.setItem(ADMINS_KEY, JSON.stringify(admins));
    
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
            return { success: true, message: 'Password changed successfully' };
        }
    }
    
    // Check regular admins
    const admins = JSON.parse(localStorage.getItem(ADMINS_KEY) || '{}');
    const admin = admins[email];
    if (admin && atob(admin.password) === oldPassword) {
        admin.password = btoa(newPassword);
        localStorage.setItem(ADMINS_KEY, JSON.stringify(admins));
        return { success: true, message: 'Password changed successfully' };
    }
    
    return { success: false, error: 'Current password is incorrect' };
}

function isLoggedIn() {
    return sessionStorage.getItem('adminLoggedIn') === 'true';
}

function logout() {
    sessionStorage.removeItem('currentAdmin');
    sessionStorage.removeItem('adminLoggedIn');
    sessionStorage.removeItem('bizAdminUnlocked');
    sessionStorage.removeItem('bizUserRole');
    window.location.href = 'admin-login.html';
}

function getCurrentAdmin() {
    return JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');
}
