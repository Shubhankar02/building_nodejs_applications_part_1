class AuthApp {
    constructor() {
        this.apiBase = '/api';
        this.token = localStorage.getItem('authToken');
        this.currentUser = null;
        this.refreshToken = localStorage.getItem('refreshToken');
        this.requires2FA = false;
        
        this.initializeElements();
        this.setupEventListeners();
        this.checkAuthState();
    }

    initializeElements() {
        // Auth elements
        this.authSection = document.getElementById('authSection');
        this.appSection = document.getElementById('appSection');
        this.userInfo = document.getElementById('userInfo');
        this.userName = document.getElementById('userName');
        this.userRole = document.getElementById('userRole');
        
        // Forms
        this.loginForm = document.getElementById('loginForm');
        this.registerForm = document.getElementById('registerForm');
        
        // Modals
        this.modalOverlay = document.getElementById('modalOverlay');
        this.modalTitle = document.getElementById('modalTitle');
        this.modalBody = document.getElementById('modalBody');
        
        // Toast container
        this.toastContainer = document.getElementById('toastContainer');
    }

    setupEventListeners() {
        // Auth tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchAuthTab(e.target.dataset.tab));
        });

        // Auth forms
        this.loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        this.registerForm.addEventListener('submit', (e) => this.handleRegister(e));

        // Password strength indicator
        const passwordInput = document.getElementById('registerPassword');
        if (passwordInput) {
            passwordInput.addEventListener('input', (e) => this.checkPasswordStrength(e.target.value));
        }

        // Main app buttons
        document.getElementById('logoutBtn').addEventListener('click', () => this.handleLogout());
        document.getElementById('profileBtn').addEventListener('click', () => this.showProfile());
        document.getElementById('editProfileBtn').addEventListener('click', () => this.showEditProfile());
        document.getElementById('changePasswordBtn').addEventListener('click', () => this.showChangePassword());
        document.getElementById('toggle2FABtn').addEventListener('click', () => this.toggle2FA());
        document.getElementById('viewSessionsBtn').addEventListener('click', () => this.showSessions());
        document.getElementById('refreshBtn').addEventListener('click', () => this.refreshDashboard());

        // Admin panel tabs
        document.querySelectorAll('.admin-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchAdminTab(e.target.dataset.tab));
        });

        // Admin buttons
        document.getElementById('loadUsersBtn').addEventListener('click', () => this.loadUsers());
        document.getElementById('loadRolesBtn').addEventListener('click', () => this.loadRoles());
        document.getElementById('createRoleBtn').addEventListener('click', () => this.showCreateRole());
        document.getElementById('loadAuditBtn').addEventListener('click', () => this.loadAuditLogs());

        // Modal close
        document.getElementById('closeModal').addEventListener('click', () => this.closeModal());
        this.modalOverlay.addEventListener('click', (e) => {
            if (e.target === this.modalOverlay) this.closeModal();
        });

        // Forgot password
        document.getElementById('forgotPasswordLink').addEventListener('click', (e) => {
            e.preventDefault();
            this.showForgotPassword();
        });
    }

    async checkAuthState() {
        if (this.token) {
            try {
                const response = await this.apiCall('/auth/profile', 'GET');
                if (response.success) {
                    this.currentUser = response.data.user;
                    this.showApp();
                    this.updateUserInfo();
                    this.loadDashboard();
                } else {
                    this.handleLogout();
                }
            } catch (error) {
                console.error('Auth check failed:', error);
                this.handleLogout();
            }
        } else {
            this.showAuth();
        }
    }

    switchAuthTab(tab) {
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tab}"]`).classList.add('active');

        // Update form visibility
        document.querySelectorAll('.auth-form').forEach(form => {
            form.classList.remove('active');
        });
        document.getElementById(`${tab}Tab`).classList.add('active');
    }

    async handleLogin(e) {
        e.preventDefault();
        
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        const rememberMe = document.getElementById('rememberMe').checked;
        const twoFactorCode = document.getElementById('twoFactorCode').value;

        const loginData = {
            email,
            password,
            remember_me: rememberMe
        };

        if (this.requires2FA) {
            loginData.two_factor_code = twoFactorCode;
        }

        try {
            const response = await this.apiCall('/auth/login', 'POST', loginData);

            if (response.success) {
                this.token = response.data.tokens.access_token;
                this.refreshToken = response.data.tokens.refresh_token;
                this.currentUser = response.data.user;
                
                localStorage.setItem('authToken', this.token);
                localStorage.setItem('refreshToken', this.refreshToken);
                
                this.showToast('Login successful!', 'success');
                this.showApp();
                this.updateUserInfo();
                this.loadDashboard();
                
                // Reset 2FA state
                this.requires2FA = false;
                document.getElementById('twoFactorSection').style.display = 'none';
                
            } else if (response.requires_2fa) {
                this.requires2FA = true;
                document.getElementById('twoFactorSection').style.display = 'block';
                this.showToast('Please enter your 2FA code', 'info');
            } else {
                this.showToast(response.error, 'error');
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showToast('Login failed. Please try again.', 'error');
        }
    }

    async handleRegister(e) {
        e.preventDefault();
        
        const firstName = document.getElementById('registerFirstName').value;
        const lastName = document.getElementById('registerLastName').value;
        const email = document.getElementById('registerEmail').value;
        const password = document.getElementById('registerPassword').value;

        try {
            const response = await this.apiCall('/auth/register', 'POST', {
                first_name: firstName,
                last_name: lastName,
                email,
                password
            });

            if (response.success) {
                this.showToast('Registration successful! Please check your email for verification.', 'success');
                this.switchAuthTab('login');
                // Pre-fill email in login form
                document.getElementById('loginEmail').value = email;
            } else {
                this.showToast(response.error, 'error');
            }
        } catch (error) {
            console.error('Registration error:', error);
            this.showToast('Registration failed. Please try again.', 'error');
        }
    }

    async handleLogout() {
        try {
            await this.apiCall('/auth/logout', 'POST');
        } catch (error) {
            console.error('Logout error:', error);
        }
        
        this.token = null;
        this.refreshToken = null;
        this.currentUser = null;
        localStorage.removeItem('authToken');
        localStorage.removeItem('refreshToken');
        
        this.showAuth();
        this.showToast('Logged out successfully', 'info');
    }

    showAuth() {
        this.authSection.style.display = 'flex';
        this.appSection.style.display = 'none';
        this.userInfo.style.display = 'none';
    }

    showApp() {
        this.authSection.style.display = 'none';
        this.appSection.style.display = 'block';
        this.userInfo.style.display = 'flex';
    }

    updateUserInfo() {
        if (this.currentUser) {
            this.userName.textContent = `${this.currentUser.first_name} ${this.currentUser.last_name}`;
            
            // Set user role (use first role or default)
            if (this.currentUser.roles && this.currentUser.roles.length > 0) {
                this.userRole.textContent = this.currentUser.roles[0].name;
            } else {
                this.userRole.textContent = 'User';
            }
        }
    }

    async loadDashboard() {
        try {
            // Update profile information
            document.getElementById('profileName').textContent = 
                `${this.currentUser.first_name} ${this.currentUser.last_name}`;
            document.getElementById('profileEmail').textContent = this.currentUser.email;
            
            // Update status badges
            const emailVerified = document.getElementById('profileEmailVerified');
            emailVerified.textContent = this.currentUser.email_verified ? 'Verified' : 'Not Verified';
            emailVerified.className = `status-badge ${this.currentUser.email_verified ? 'verified' : 'unverified'}`;
            
            const twoFactor = document.getElementById('profileTwoFactor');
            twoFactor.textContent = this.currentUser.two_factor_enabled ? 'Enabled' : 'Disabled';
            twoFactor.className = `status-badge ${this.currentUser.two_factor_enabled ? 'enabled' : 'disabled'}`;
            
            // Update 2FA button text
            const toggle2FABtn = document.getElementById('toggle2FABtn');
            toggle2FABtn.textContent = this.currentUser.two_factor_enabled ? 'Disable 2FA' : 'Enable 2FA';
            
            document.getElementById('profileCreated').textContent = 
                new Date(this.currentUser.created_at).toLocaleDateString();

            // Show admin panel if user has admin permissions
            if (this.hasPermission('system.admin') || this.hasPermission('users.list')) {
                document.getElementById('adminPanel').style.display = 'block';
            }
            
        } catch (error) {
            console.error('Error loading dashboard:', error);
        }
    }

    hasPermission(permission) {
        if (!this.currentUser || !this.currentUser.permissions) return false;
        return this.currentUser.permissions.some(p => p.name === permission);
    }

    refreshDashboard() {
        this.checkAuthState();
    }

    checkPasswordStrength(password) {
        const strengthIndicator = document.getElementById('passwordStrength');
        
        let strength = 0;
        if (password.length >= 8) strength++;
        if (/[A-Z]/.test(password)) strength++;
        if (/[a-z]/.test(password)) strength++;
        if (/[0-9]/.test(password)) strength++;
        if (/[^A-Za-z0-9]/.test(password)) strength++;
        
        strengthIndicator.className = 'password-strength';
        if (strength >= 2) strengthIndicator.classList.add('weak');
        if (strength >= 4) strengthIndicator.classList.add('medium');
        if (strength >= 5) strengthIndicator.classList.add('strong');
    }

    // Admin functions
    switchAdminTab(tab) {
        document.querySelectorAll('.admin-tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tab}"]`).classList.add('active');

        document.querySelectorAll('.admin-tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tab}Tab`).classList.add('active');
    }

    async loadUsers() {
        try {
            const search = document.getElementById('userSearch').value;
            const status = document.getElementById('userStatusFilter').value;
            
            let url = '/users?';
            if (search) url += `search=${encodeURIComponent(search)}&`;
            if (status) url += `status=${status}&`;
            
            const response = await this.apiCall(url, 'GET');
            
            if (response.success) {
                this.renderUsers(response.data.users);
            } else {
                this.showToast('Failed to load users', 'error');
            }
        } catch (error) {
            console.error('Error loading users:', error);
            this.showToast('Failed to load users', 'error');
        }
    }

    renderUsers(users) {
        const usersList = document.getElementById('usersList');
        
        if (users.length === 0) {
            usersList.innerHTML = '<p class="text-center text-muted">No users found</p>';
            return;
        }
        
        usersList.innerHTML = users.map(user => `
            <div class="admin-item">
                <div class="admin-item-header">
                    <div class="admin-item-title">${user.first_name} ${user.last_name}</div>
                    <div class="admin-item-actions">
                        <button class="btn btn-primary" onclick="app.viewUser(${user.id})">View</button>
                        <button class="btn btn-secondary" onclick="app.editUser(${user.id})">Edit</button>
                        ${!user.is_active ? 
                            `<button class="btn btn-success" onclick="app.toggleUserStatus(${user.id}, true)">Activate</button>` :
                            `<button class="btn btn-warning" onclick="app.toggleUserStatus(${user.id}, false)">Deactivate</button>`
                        }
                    </div>
                </div>
                <div class="admin-item-details">
                    <div>Email: ${user.email}</div>
                    <div>Roles: ${user.roles || 'None'}</div>
                    <div>Status: ${user.is_active ? 'Active' : 'Inactive'}</div>
                </div>
                <div class="admin-item-meta">
                    Created: ${new Date(user.created_at).toLocaleDateString()} | 
                    Last login: ${user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}
                </div>
            </div>
        `).join('');
    }

    async loadRoles() {
        try {
            const response = await this.apiCall('/admin/roles', 'GET');
            
            if (response.success) {
                this.renderRoles(response.data.roles);
            } else {
                this.showToast('Failed to load roles', 'error');
            }
        } catch (error) {
            console.error('Error loading roles:', error);
            this.showToast('Failed to load roles', 'error');
        }
    }

    renderRoles(roles) {
        const rolesList = document.getElementById('rolesList');
        
        if (roles.length === 0) {
            rolesList.innerHTML = '<p class="text-center text-muted">No roles found</p>';
            return;
        }
        
        rolesList.innerHTML = roles.map(role => `
            <div class="admin-item">
                <div class="admin-item-header">
                    <div class="admin-item-title">${role.name}</div>
                    <div class="admin-item-actions">
                        <button class="btn btn-primary" onclick="app.viewRole(${role.id})">View</button>
                        ${!role.is_system_role ? 
                            `<button class="btn btn-secondary" onclick="app.editRole(${role.id})">Edit</button>
                             <button class="btn btn-danger" onclick="app.deleteRole(${role.id})">Delete</button>` :
                            ''
                        }
                    </div>
                </div>
                <div class="admin-item-details">
                    <div>Description: ${role.description || 'No description'}</div>
                    <div>Permissions: ${role.permissions ? role.permissions.length : 0}</div>
                   <div>System Role: ${role.is_system_role ? 'Yes' : 'No'}</div>
                   <div>Default Role: ${role.is_default ? 'Yes' : 'No'}</div>
               </div>
               <div class="admin-item-meta">
                   Created: ${new Date(role.created_at).toLocaleDateString()}
               </div>
           </div>
       `).join('');
   }

   async loadAuditLogs() {
       try {
           const category = document.getElementById('auditCategory').value;
           const success = document.getElementById('auditSuccess').value;
           
           let url = '/admin/audit-logs?';
           if (category) url += `event_category=${category}&`;
           if (success) url += `success=${success}&`;
           
           const response = await this.apiCall(url, 'GET');
           
           if (response.success) {
               this.renderAuditLogs(response.data.logs);
           } else {
               this.showToast('Failed to load audit logs', 'error');
           }
       } catch (error) {
           console.error('Error loading audit logs:', error);
           this.showToast('Failed to load audit logs', 'error');
       }
   }

   renderAuditLogs(logs) {
       const auditList = document.getElementById('auditList');
       
       if (logs.length === 0) {
           auditList.innerHTML = '<p class="text-center text-muted">No audit logs found</p>';
           return;
       }
       
       auditList.innerHTML = logs.map(log => `
           <div class="admin-item">
               <div class="admin-item-header">
                   <div class="admin-item-title">${log.event_type}</div>
                   <div class="admin-item-actions">
                       <span class="status-badge ${log.success ? 'verified' : 'unverified'}">
                           ${log.success ? 'Success' : 'Failed'}
                       </span>
                   </div>
               </div>
               <div class="admin-item-details">
                   <div>User: ${log.user_email || 'System'}</div>
                   <div>Category: ${log.event_category}</div>
                   <div>IP: ${log.ip_address || 'N/A'}</div>
                   ${log.error_message ? `<div>Error: ${log.error_message}</div>` : ''}
               </div>
               <div class="admin-item-meta">
                   ${new Date(log.created_at).toLocaleString()}
               </div>
           </div>
       `).join('');
   }

   // Modal functions
   showModal(title, content) {
       this.modalTitle.textContent = title;
       this.modalBody.innerHTML = content;
       this.modalOverlay.classList.add('active');
   }

   closeModal() {
       this.modalOverlay.classList.remove('active');
   }

   showProfile() {
       const content = `
           <div class="profile-info">
               <div class="profile-field">
                   <label>Name:</label>
                   <span>${this.currentUser.first_name} ${this.currentUser.last_name}</span>
               </div>
               <div class="profile-field">
                   <label>Email:</label>
                   <span>${this.currentUser.email}</span>
               </div>
               <div class="profile-field">
                   <label>Email Verified:</label>
                   <span class="status-badge ${this.currentUser.email_verified ? 'verified' : 'unverified'}">
                       ${this.currentUser.email_verified ? 'Verified' : 'Not Verified'}
                   </span>
               </div>
               <div class="profile-field">
                   <label>Two-Factor Auth:</label>
                   <span class="status-badge ${this.currentUser.two_factor_enabled ? 'enabled' : 'disabled'}">
                       ${this.currentUser.two_factor_enabled ? 'Enabled' : 'Disabled'}
                   </span>
               </div>
               <div class="profile-field">
                   <label>Roles:</label>
                   <span>${this.currentUser.roles ? this.currentUser.roles.map(r => r.name).join(', ') : 'None'}</span>
               </div>
               <div class="profile-field">
                   <label>Member Since:</label>
                   <span>${new Date(this.currentUser.created_at).toLocaleDateString()}</span>
               </div>
           </div>
       `;
       
       this.showModal('Profile Information', content);
   }

   showEditProfile() {
       const content = `
           <form id="editProfileForm">
               <div class="form-group">
                   <label for="editFirstName">First Name</label>
                   <input type="text" id="editFirstName" value="${this.currentUser.first_name}" required>
               </div>
               <div class="form-group">
                   <label for="editLastName">Last Name</label>
                   <input type="text" id="editLastName" value="${this.currentUser.last_name}" required>
               </div>
               <div class="form-group">
                   <label for="editUsername">Username</label>
                   <input type="text" id="editUsername" value="${this.currentUser.username || ''}" placeholder="Optional">
               </div>
               <div class="form-group">
                   <label for="editTimezone">Timezone</label>
                   <select id="editTimezone">
                       <option value="UTC" ${this.currentUser.timezone === 'UTC' ? 'selected' : ''}>UTC</option>
                       <option value="America/New_York" ${this.currentUser.timezone === 'America/New_York' ? 'selected' : ''}>Eastern Time</option>
                       <option value="America/Chicago" ${this.currentUser.timezone === 'America/Chicago' ? 'selected' : ''}>Central Time</option>
                       <option value="America/Denver" ${this.currentUser.timezone === 'America/Denver' ? 'selected' : ''}>Mountain Time</option>
                       <option value="America/Los_Angeles" ${this.currentUser.timezone === 'America/Los_Angeles' ? 'selected' : ''}>Pacific Time</option>
                   </select>
               </div>
               <button type="submit" class="btn btn-primary">Update Profile</button>
           </form>
       `;
       
       this.showModal('Edit Profile', content);
       
       document.getElementById('editProfileForm').addEventListener('submit', (e) => this.handleEditProfile(e));
   }

   async handleEditProfile(e) {
       e.preventDefault();
       
       const updateData = {
           first_name: document.getElementById('editFirstName').value,
           last_name: document.getElementById('editLastName').value,
           username: document.getElementById('editUsername').value || null,
           timezone: document.getElementById('editTimezone').value
       };
       
       try {
           const response = await this.apiCall('/auth/profile', 'PUT', updateData);
           
           if (response.success) {
               this.currentUser = response.data.user;
               this.updateUserInfo();
               this.loadDashboard();
               this.closeModal();
               this.showToast('Profile updated successfully', 'success');
           } else {
               this.showToast(response.error, 'error');
           }
       } catch (error) {
           console.error('Error updating profile:', error);
           this.showToast('Failed to update profile', 'error');
       }
   }

   showChangePassword() {
       const content = `
           <form id="changePasswordForm">
               <div class="form-group">
                   <label for="currentPassword">Current Password</label>
                   <input type="password" id="currentPassword" required>
               </div>
               <div class="form-group">
                   <label for="newPassword">New Password</label>
                   <input type="password" id="newPassword" required>
                   <div class="password-strength" id="newPasswordStrength"></div>
               </div>
               <div class="form-group">
                   <label for="confirmPassword">Confirm New Password</label>
                   <input type="password" id="confirmPassword" required>
               </div>
               <button type="submit" class="btn btn-primary">Change Password</button>
           </form>
       `;
       
       this.showModal('Change Password', content);
       
       const form = document.getElementById('changePasswordForm');
       form.addEventListener('submit', (e) => this.handleChangePassword(e));
       
       // Add password strength indicator
       document.getElementById('newPassword').addEventListener('input', (e) => {
           this.checkPasswordStrength(e.target.value);
       });
   }

   async handleChangePassword(e) {
       e.preventDefault();
       
       const currentPassword = document.getElementById('currentPassword').value;
       const newPassword = document.getElementById('newPassword').value;
       const confirmPassword = document.getElementById('confirmPassword').value;
       
       if (newPassword !== confirmPassword) {
           this.showToast('New passwords do not match', 'error');
           return;
       }
       
       try {
           const response = await this.apiCall('/auth/change-password', 'POST', {
               current_password: currentPassword,
               new_password: newPassword
           });
           
           if (response.success) {
               this.closeModal();
               this.showToast('Password changed successfully', 'success');
           } else {
               this.showToast(response.error, 'error');
           }
       } catch (error) {
           console.error('Error changing password:', error);
           this.showToast('Failed to change password', 'error');
       }
   }

   async toggle2FA() {
       if (this.currentUser.two_factor_enabled) {
           this.disable2FA();
       } else {
           this.enable2FA();
       }
   }

   async enable2FA() {
       try {
           const response = await this.apiCall('/auth/enable-2fa', 'POST');
           
           if (response.success) {
               const content = `
                   <div class="text-center">
                       <h4>Setup Two-Factor Authentication</h4>
                       <p>Scan this QR code with your authenticator app:</p>
                       <img src="${response.data.qr_code}" alt="QR Code" style="max-width: 200px;">
                       <p>Or enter this key manually:</p>
                       <code>${response.data.secret}</code>
                       
                       <h5 class="mt-4">Backup Codes</h5>
                       <p>Save these backup codes in a secure place:</p>
                       <div class="backup-codes">
                           ${response.data.backup_codes.map(code => `<code>${code}</code>`).join(' ')}
                       </div>
                       
                       <form id="verify2FAForm" class="mt-4">
                           <div class="form-group">
                               <label for="verify2FACode">Enter code from your app:</label>
                               <input type="text" id="verify2FACode" placeholder="6-digit code" required>
                           </div>
                           <button type="submit" class="btn btn-primary">Verify and Enable</button>
                       </form>
                   </div>
               `;
               
               this.showModal('Enable Two-Factor Authentication', content);
               
               document.getElementById('verify2FAForm').addEventListener('submit', (e) => this.handleVerify2FA(e));
           } else {
               this.showToast(response.error, 'error');
           }
       } catch (error) {
           console.error('Error enabling 2FA:', error);
           this.showToast('Failed to enable 2FA', 'error');
       }
   }

   async handleVerify2FA(e) {
       e.preventDefault();
       
       const code = document.getElementById('verify2FACode').value;
       
       try {
           const response = await this.apiCall('/auth/verify-2fa', 'POST', { code });
           
           if (response.success) {
               this.currentUser.two_factor_enabled = true;
               this.loadDashboard();
               this.closeModal();
               this.showToast('Two-factor authentication enabled successfully', 'success');
           } else {
               this.showToast(response.error, 'error');
           }
       } catch (error) {
           console.error('Error verifying 2FA:', error);
           this.showToast('Failed to verify 2FA code', 'error');
       }
   }

   async disable2FA() {
       const content = `
           <div class="text-center">
               <h4>Disable Two-Factor Authentication</h4>
               <p>Are you sure you want to disable two-factor authentication? This will make your account less secure.</p>
               
               <form id="disable2FAForm">
                   <div class="form-group">
                       <label for="disable2FAPassword">Enter your password to confirm:</label>
                       <input type="password" id="disable2FAPassword" required>
                   </div>
                   <button type="submit" class="btn btn-danger">Disable 2FA</button>
                   <button type="button" class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
               </form>
           </div>
       `;
       
       this.showModal('Disable Two-Factor Authentication', content);
       
       document.getElementById('disable2FAForm').addEventListener('submit', (e) => this.handleDisable2FA(e));
   }

   async handleDisable2FA(e) {
       e.preventDefault();
       
       const password = document.getElementById('disable2FAPassword').value;
       
       try {
           const response = await this.apiCall('/auth/disable-2fa', 'POST', { password });
           
           if (response.success) {
               this.currentUser.two_factor_enabled = false;
               this.loadDashboard();
               this.closeModal();
               this.showToast('Two-factor authentication disabled', 'success');
           } else {
               this.showToast(response.error, 'error');
           }
       } catch (error) {
           console.error('Error disabling 2FA:', error);
           this.showToast('Failed to disable 2FA', 'error');
       }
   }

   showForgotPassword() {
       const content = `
           <form id="forgotPasswordForm">
               <div class="form-group">
                   <label for="forgotEmail">Email Address</label>
                   <input type="email" id="forgotEmail" required>
               </div>
               <button type="submit" class="btn btn-primary">Send Reset Link</button>
           </form>
       `;
       
       this.showModal('Forgot Password', content);
       
       document.getElementById('forgotPasswordForm').addEventListener('submit', (e) => this.handleForgotPassword(e));
   }

   async handleForgotPassword(e) {
       e.preventDefault();
       
       const email = document.getElementById('forgotEmail').value;
       
       try {
           const response = await this.apiCall('/auth/forgot-password', 'POST', { email });
           
           if (response.success) {
               this.closeModal();
               this.showToast('Password reset instructions sent to your email', 'success');
           } else {
               this.showToast(response.error, 'error');
           }
       } catch (error) {
           console.error('Error sending password reset:', error);
           this.showToast('Failed to send password reset', 'error');
       }
   }

   async showSessions() {
       try {
           const response = await this.apiCall('/auth/sessions', 'GET');
           
           if (response.success) {
               const sessions = response.data.sessions;
               const content = `
                   <div class="sessions-list">
                       <h4>Active Sessions</h4>
                       ${sessions.map(session => `
                           <div class="session-item">
                               <div class="session-info">
                                   <strong>${session.device_info ? session.device_info.platform : 'Unknown Device'}</strong>
                                   <div>IP: ${session.ip_address}</div>
                                   <div>Last Active: ${new Date(session.last_accessed).toLocaleString()}</div>
                                   <div>Created: ${new Date(session.created_at).toLocaleString()}</div>
                               </div>
                               <div class="session-actions">
                                   ${session.is_current ? 
                                       '<span class="status-badge verified">Current</span>' : 
                                       `<button class="btn btn-danger btn-sm" onclick="app.terminateSession('${session.id}')">Terminate</button>`
                                   }
                               </div>
                           </div>
                       `).join('')}
                       
                       <div class="mt-4">
                           <button class="btn btn-danger" onclick="app.terminateAllSessions()">Terminate All Other Sessions</button>
                       </div>
                   </div>
               `;
               
               this.showModal('Active Sessions', content);
           } else {
               this.showToast('Failed to load sessions', 'error');
           }
       } catch (error) {
           console.error('Error loading sessions:', error);
           this.showToast('Failed to load sessions', 'error');
       }
   }

   // Admin modal functions
   async viewUser(userId) {
       try {
           const response = await this.apiCall(`/users/${userId}`, 'GET');
           
           if (response.success) {
               const user = response.data.user;
               const content = `
                   <div class="user-details">
                       <h4>${user.first_name} ${user.last_name}</h4>
                       <div class="profile-field">
                           <label>Email:</label>
                           <span>${user.email}</span>
                       </div>
                       <div class="profile-field">
                           <label>Status:</label>
                           <span class="status-badge ${user.is_active ? 'verified' : 'unverified'}">
                               ${user.is_active ? 'Active' : 'Inactive'}
                           </span>
                       </div>
                       <div class="profile-field">
                           <label>Email Verified:</label>
                           <span class="status-badge ${user.email_verified ? 'verified' : 'unverified'}">
                               ${user.email_verified ? 'Verified' : 'Not Verified'}
                           </span>
                       </div>
                       <div class="profile-field">
                           <label>Two-Factor:</label>
                           <span class="status-badge ${user.two_factor_enabled ? 'enabled' : 'disabled'}">
                               ${user.two_factor_enabled ? 'Enabled' : 'Disabled'}
                           </span>
                       </div>
                       <div class="profile-field">
                           <label>Roles:</label>
                           <span>${user.roles ? user.roles.map(r => r.name).join(', ') : 'None'}</span>
                       </div>
                       <div class="profile-field">
                           <label>Last Login:</label>
                           <span>${user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}</span>
                       </div>
                       <div class="profile-field">
                           <label>Member Since:</label>
                           <span>${new Date(user.created_at).toLocaleDateString()}</span>
                       </div>
                   </div>
               `;
               
               this.showModal('User Details', content);
           } else {
               this.showToast('Failed to load user details', 'error');
           }
       } catch (error) {
           console.error('Error loading user:', error);
           this.showToast('Failed to load user details', 'error');
       }
   }

   async toggleUserStatus(userId, activate) {
       try {
           const response = await this.apiCall(`/users/${userId}/status`, 'PUT', {
               is_active: activate
           });
           
           if (response.success) {
               this.loadUsers();
               this.showToast(`User ${activate ? 'activated' : 'deactivated'} successfully`, 'success');
           } else {
               this.showToast(response.error, 'error');
           }
       } catch (error) {
           console.error('Error toggling user status:', error);
           this.showToast('Failed to update user status', 'error');
       }
   }

   showCreateRole() {
       const content = `
           <form id="createRoleForm">
               <div class="form-group">
                   <label for="roleName">Role Name</label>
                   <input type="text" id="roleName" required>
               </div>
               <div class="form-group">
                   <label for="roleDescription">Description</label>
                   <textarea id="roleDescription" rows="3"></textarea>
               </div>
               <div class="form-group">
                   <input type="checkbox" id="roleDefault">
                   <label for="roleDefault">Default role for new users</label>
               </div>
               <button type="submit" class="btn btn-primary">Create Role</button>
           </form>
       `;
       
       this.showModal('Create New Role', content);
       
       document.getElementById('createRoleForm').addEventListener('submit', (e) => this.handleCreateRole(e));
   }

   async handleCreateRole(e) {
       e.preventDefault();
       
       const roleData = {
           name: document.getElementById('roleName').value,
           description: document.getElementById('roleDescription').value,
           is_default: document.getElementById('roleDefault').checked
       };
       
       try {
           const response = await this.apiCall('/admin/roles', 'POST', roleData);
           
           if (response.success) {
               this.loadRoles();
               this.closeModal();
               this.showToast('Role created successfully', 'success');
           } else {
               this.showToast(response.error, 'error');
           }
       } catch (error) {
           console.error('Error creating role:', error);
           this.showToast('Failed to create role', 'error');
       }
   }

   // Utility functions
   async apiCall(endpoint, method = 'GET', body = null) {
       const url = endpoint.startsWith('http') ? endpoint : `${this.apiBase}${endpoint}`;
       
       const options = {
           method,
           headers: {
               'Content-Type': 'application/json',
           }
       };
       
       if (this.token) {
           options.headers['Authorization'] = `Bearer ${this.token}`;
       }
       
       if (body && method !== 'GET') {
           options.body = JSON.stringify(body);
       }
       
       try {
           const response = await fetch(url, options);
           const data = await response.json();
           
           // Handle token expiration
           if (response.status === 401 && data.code === 'TOKEN_EXPIRED' && this.refreshToken) {
               const refreshed = await this.refreshAccessToken();
               if (refreshed) {
                   // Retry the original request
                   options.headers['Authorization'] = `Bearer ${this.token}`;
                   const retryResponse = await fetch(url, options);
                   return await retryResponse.json();
               }
           }
           
           return data;
       } catch (error) {
           console.error('API call error:', error);
           throw error;
       }
   }

   async refreshAccessToken() {
       try {
           const response = await fetch(`${this.apiBase}/auth/refresh`, {
               method: 'POST',
               headers: {
                   'Content-Type': 'application/json',
               },
               body: JSON.stringify({
                   refresh_token: this.refreshToken
               })
           });
           
           const data = await response.json();
           
           if (data.success) {
               this.token = data.data.access_token;
               localStorage.setItem('authToken', this.token);
               return true;
           } else {
               this.handleLogout();
               return false;
           }
       } catch (error) {
           console.error('Token refresh error:', error);
           this.handleLogout();
           return false;
       }
   }

   showToast(message, type = 'info') {
       const toast = document.createElement('div');
       toast.className = `toast ${type}`;
       toast.innerHTML = `
           <div class="toast-header">
               <div class="toast-title">${type.charAt(0).toUpperCase() + type.slice(1)}</div>
               <button class="toast-close" onclick="this.parentElement.parentElement.remove()">&times;</button>
           </div>
           <div class="toast-message">${message}</div>
       `;
       
       this.toastContainer.appendChild(toast);
       
       // Auto-remove after 5 seconds
       setTimeout(() => {
           if (toast.parentNode) {
               toast.remove();
           }
       }, 5000);
   }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
   window.app = new AuthApp();
});