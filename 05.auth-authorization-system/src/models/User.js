const db = require('../config/database');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

class User {
    constructor(userData) {
        this.id = userData.id;
        this.email = userData.email;
        this.username = userData.username;
        this.first_name = userData.first_name;
        this.last_name = userData.last_name;
        this.password_hash = userData.password_hash;

        // Email verification
        this.email_verified = userData.email_verified;
        this.email_verification_token = userData.email_verification_token;
        this.email_verification_expires = userData.email_verification_expires;

        // Password reset
        this.password_reset_token = userData.password_reset_token;
        this.password_reset_expires = userData.password_reset_expires;
        this.last_password_change = userData.last_password_change;

        // Two-factor authentication
        this.two_factor_enabled = userData.two_factor_enabled;
        this.two_factor_secret = userData.two_factor_secret;
        this.two_factor_backup_codes = userData.two_factor_backup_codes;

        // Account security
        this.failed_login_attempts = userData.failed_login_attempts;
        this.account_locked_until = userData.account_locked_until;
        this.last_login = userData.last_login;
        this.last_login_ip = userData.last_login_ip;

        // Profile information
        this.avatar_url = userData.avatar_url;
        this.timezone = userData.timezone;
        this.locale = userData.locale;

        // Account status
        this.is_active = userData.is_active;
        this.is_verified = userData.is_verified;

        // Audit fields
        this.created_at = userData.created_at;
        this.updated_at = userData.updated_at;
        this.created_by = userData.created_by;
        this.updated_by = userData.updated_by;
    }

    // Create a new user with secure password handling and email verification
    static async create(userData, createdBy = null) {
        const {
            email,
            username,
            first_name,
            last_name,
            password,
            timezone = 'UTC',
            locale = 'en'
        } = userData;

        try {
            // Hash password with secure salt rounds
            const saltRounds = 12;
            const password_hash = await bcrypt.hash(password, saltRounds);

            // Generate email verification token
            const email_verification_token = crypto.randomBytes(32).toString('hex');
            const email_verification_expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

            const result = await db.query(`
                INSERT INTO users (
                    email, username, first_name, last_name, password_hash,
                    email_verification_token, email_verification_expires,
                    timezone, locale, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING *
            `, [
                email, username, first_name, last_name, password_hash,
                email_verification_token, email_verification_expires,
                timezone, locale, createdBy
            ]);

            const user = new User(result.rows[0]);

            // Assign default role to new user
            await user.assignDefaultRole();

            return user;
        } catch (error) {
            console.error('Error creating user:', error);

            // Handle specific constraint violations
            if (error.code === '23505') {
                if (error.constraint.includes('email')) {
                    throw new Error('Email address is already registered');
                }
                if (error.constraint.includes('username')) {
                    throw new Error('Username is already taken');
                }
            }

            throw error;
        }
    }

    // Find user by email with security information
    static async findByEmail(email, includePasswordHash = false) {
        try {
            const selectFields = includePasswordHash ? '*' : `
                id, email, username, first_name, last_name, email_verified,
                two_factor_enabled, failed_login_attempts, account_locked_until,
                last_login, last_login_ip, avatar_url, timezone, locale,
                is_active, is_verified, created_at, updated_at
            `;

            const result = await db.query(
                `SELECT ${selectFields} FROM users WHERE email = $1`,
                [email]
            );

            if (result.rows.length === 0) {
                return null;
            }

            return new User(result.rows[0]);
        } catch (error) {
            console.error('Error finding user by email:', error);
            throw error;
        }
    }

    // Find user by ID with optional role and permission loading
    static async findById(id, includeRoles = false) {
        try {
            let query = `
                SELECT
                    id, email, username, first_name, last_name, email_verified,
                    two_factor_enabled, failed_login_attempts, account_locked_until,
                    last_login, last_login_ip, avatar_url, timezone, locale,
                    is_active, is_verified, created_at, updated_at
                FROM users WHERE id = $1
            `;

            const result = await db.query(query, [id]);

            if (result.rows.length === 0) {
                return null;
            }

            const user = new User(result.rows[0]);

            // Load roles and permissions if requested
            if (includeRoles) {
                user.roles = await user.getRoles();
                user.permissions = await user.getPermissions();
            }

            return user;
        } catch (error) {
            console.error('Error finding user by ID:', error);
            throw error;
        }
    }

    // Verify password and handle account security
    async verifyPassword(plainPassword) {
        try {
            // Check if account is locked
            if (this.isAccountLocked()) {
                throw new Error('Account is temporarily locked due to failed login attempts');
            }

            // Get user with password hash for verification
            const userWithPassword = await User.findByEmail(this.email, true);
            if (!userWithPassword) {
                throw new Error('User not found');
            }

            const isValid = await bcrypt.compare(plainPassword, userWithPassword.password_hash);

            if (isValid) {
                // Reset failed login attempts on successful authentication
                await this.resetFailedLoginAttempts();
                return true;
            } else {
                // Increment failed login attempts
                await this.incrementFailedLoginAttempts();
                return false;
            }
        } catch (error) {
            console.error('Error verifying password:', error);
            throw error;
        }
    }
    // Check if account is currently locked
    isAccountLocked() {
        if (!this.account_locked_until) {
            return false;
        }

        return new Date() < new Date(this.account_locked_until);
    }

    // Increment failed login attempts with automatic lockout
    async incrementFailedLoginAttempts() {
        try {
            const result = await db.query(`
                UPDATE users
                SET failed_login_attempts = failed_login_attempts + 1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
                RETURNING failed_login_attempts, account_locked_until
            `, [this.id]);

            if (result.rows.length > 0) {
                this.failed_login_attempts = result.rows[0].failed_login_attempts;
                this.account_locked_until = result.rows[0].account_locked_until;
            }
        } catch (error) {
            console.error('Error incrementing failed login attempts:', error);
            throw error;
        }
    }

    // Reset failed login attempts after successful authentication
    async resetFailedLoginAttempts() {
        try {
            await db.query(`
                UPDATE users
                SET failed_login_attempts = 0,
                    account_locked_until = NULL,
                    last_login = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
            `, [this.id]);

            this.failed_login_attempts = 0;
            this.account_locked_until = null;
            this.last_login = new Date();
        } catch (error) {
            console.error('Error resetting failed login attempts:', error);
            throw error;
        }
    }

    // Generate and save password reset token
    async generatePasswordResetToken() {
        try {
            const token = crypto.randomBytes(32).toString('hex');
            const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

            await db.query(`
                UPDATE users
                SET password_reset_token = $1,
                    password_reset_expires = $2,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $3
            `, [token, expires, this.id]);

            this.password_reset_token = token;
            this.password_reset_expires = expires;

            return token;
        } catch (error) {
            console.error('Error generating password reset token:', error);
            throw error;
        }
    }

    // Verify and consume password reset token
    static async verifyPasswordResetToken(token) {
        try {
            const result = await db.query(`
                SELECT * FROM users
                WHERE password_reset_token = $1
                AND password_reset_expires > CURRENT_TIMESTAMP
            `, [token]);

            if (result.rows.length === 0) {
                return null;
            }

            return new User(result.rows[0]);
        } catch (error) {
            console.error('Error verifying password reset token:', error);
            throw error;
        }
    }

    // Reset password using reset token
    async resetPassword(newPassword, resetToken) {
        try {
            // Verify the reset token belongs to this user and is still valid
            if (this.password_reset_token !== resetToken ||
                !this.password_reset_expires ||
                new Date() > new Date(this.password_reset_expires)) {
                throw new Error('Invalid or expired password reset token');
            }

            // Hash new password
            const saltRounds = 12;
            const password_hash = await bcrypt.hash(newPassword, saltRounds);

            // Update password and clear reset token
            await db.query(`
                UPDATE users
                SET password_hash = $1,
                    password_reset_token = NULL,
                    password_reset_expires = NULL,
                    last_password_change = CURRENT_TIMESTAMP,
                    failed_login_attempts = 0,
                    account_locked_until = NULL,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
            `, [password_hash, this.id]);

            // Clear sensitive fields
            this.password_reset_token = null;
            this.password_reset_expires = null;
            this.last_password_change = new Date();
            this.failed_login_attempts = 0;
            this.account_locked_until = null;

        } catch (error) {
            console.error('Error resetting password:', error);
            throw error;
        }
    }

    // Verify email using verification token
    async verifyEmail(verificationToken) {
        try {
            // Check if token matches and hasn't expired
            if (this.email_verification_token !== verificationToken ||
                !this.email_verification_expires ||
                new Date() > new Date(this.email_verification_expires)) {
                throw new Error('Invalid or expired email verification token');
            }

            // Mark email as verified
            await db.query(`
                UPDATE users
                SET email_verified = TRUE,
                    email_verification_token = NULL,
                    email_verification_expires = NULL,
                    is_verified = TRUE,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
            `, [this.id]);

            this.email_verified = true;
            this.email_verification_token = null;
            this.email_verification_expires = null;
            this.is_verified = true;

        } catch (error) {
            console.error('Error verifying email:', error);
            throw error;
        }
    }

    // Get user's roles
    async getRoles() {
        try {
            const result = await db.query(`
                SELECT r.* FROM roles r
                INNER JOIN user_roles ur ON r.id = ur.role_id
                WHERE ur.user_id = $1
                AND ur.is_active = TRUE
                AND (ur.expires_at IS NULL OR ur.expires_at > CURRENT_TIMESTAMP)
                ORDER BY r.level ASC, r.name
            `, [this.id]);

            return result.rows;
        } catch (error) {
            console.error('Error getting user roles:', error);
            throw error;
        }
    }

    // Get user's permissions (including inherited from roles)
    async getPermissions() {
        try {
            const result = await db.query(`
                SELECT DISTINCT p.* FROM permissions p
                INNER JOIN role_permissions rp ON p.id = rp.permission_id
                INNER JOIN user_roles ur ON rp.role_id = ur.role_id
                WHERE ur.user_id = $1
                AND ur.is_active = TRUE
                AND (ur.expires_at IS NULL OR ur.expires_at > CURRENT_TIMESTAMP)
                AND rp.granted = TRUE
                ORDER BY p.category, p.name
            `, [this.id]);

            return result.rows;
        } catch (error) {
            console.error('Error getting user permissions:', error);
            throw error;
        }
    }

    // Check if user has specific permission
    async hasPermission(permissionName) {
        try {
            const result = await db.query(`
                SELECT COUNT(*) as count FROM permissions p
                INNER JOIN role_permissions rp ON p.id = rp.permission_id
                INNER JOIN user_roles ur ON rp.role_id = ur.role_id
                WHERE ur.user_id = $1
                AND p.name = $2
                AND ur.is_active = TRUE
                AND (ur.expires_at IS NULL OR ur.expires_at > CURRENT_TIMESTAMP)
                AND rp.granted = TRUE
            `, [this.id, permissionName]);

            return parseInt(result.rows[0].count) > 0;
        } catch (error) {
            console.error('Error checking user permission:', error);
            throw error;
        }
    }

    // Assign role to user
    async assignRole(roleId, assignedBy = null, expiresAt = null) {
        try {
            await db.query(`
                INSERT INTO user_roles (user_id, role_id, assigned_by, expires_at)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (user_id, role_id)
                DO UPDATE SET
                    is_active = TRUE,
                    assigned_at = CURRENT_TIMESTAMP,
                    assigned_by = $3,
                    expires_at = $4
            `, [this.id, roleId, assignedBy, expiresAt]);
        } catch (error) {
            console.error('Error assigning role to user:', error);
            throw error;
        }
    }

    // Remove role from user
    async removeRole(roleId) {
        try {
            await db.query(`
                UPDATE user_roles
                SET is_active = FALSE
                WHERE user_id = $1 AND role_id = $2
            `, [this.id, roleId]);
        } catch (error) {
            console.error('Error removing role from user:', error);
            throw error;
        }
    }

    // Assign default role to new user
    async assignDefaultRole() {
        try {
            const result = await db.query(`
                SELECT id FROM roles WHERE is_default = TRUE LIMIT 1
            `);

            if (result.rows.length > 0) {
                await this.assignRole(result.rows[0].id);
            }
        } catch (error) {
            console.error('Error assigning default role:', error);
            throw error;
        }
    }

    // Update user profile information
    async updateProfile(updateData, updatedBy = null) {
        try {
            const allowedFields = [
                'first_name', 'last_name', 'username', 'avatar_url',
                'timezone', 'locale'
            ];

            const updates = [];
            const values = [];
            let paramCount = 0;

            for (const [key, value] of Object.entries(updateData)) {
                if (allowedFields.includes(key) && value !== undefined) {
                    paramCount++;
                    updates.push(`${key} = $${paramCount}`);
                    values.push(value);
                }
            }

            if (updates.length === 0) {
                return this;
            }

            // Add updated_by and updated_at
            paramCount++;
            updates.push(`updated_by = $${paramCount}`);
            values.push(updatedBy);

            paramCount++;
            updates.push(`updated_at = CURRENT_TIMESTAMP`);

            paramCount++;
            values.push(this.id);

            const query = `
                UPDATE users
                SET ${updates.join(', ')}
                WHERE id = $${paramCount}
                RETURNING *
            `;

            const result = await db.query(query, values);

            if (result.rows.length > 0) {
                Object.assign(this, result.rows[0]);
            }

            return this;
        } catch (error) {
            console.error('Error updating user profile:', error);
            throw error;
        }
    }

    // Convert user to JSON, excluding sensitive information
    toJSON() {
        return {
            id: this.id,
            email: this.email,
            username: this.username,
            first_name: this.first_name,
            last_name: this.last_name,
            full_name: `${this.first_name} ${this.last_name}`,
            email_verified: this.email_verified,
            two_factor_enabled: this.two_factor_enabled,
            avatar_url: this.avatar_url,
            timezone: this.timezone,
            locale: this.locale,
            is_active: this.is_active,
            is_verified: this.is_verified,
            last_login: this.last_login,
            created_at: this.created_at,
            updated_at: this.updated_at,
            // Include roles and permissions if they were loaded
            roles: this.roles,
            permissions: this.permissions
        };
    }

    // Get account security summary
    getSecuritySummary() {
        return {
            email_verified: this.email_verified,
            two_factor_enabled: this.two_factor_enabled,
            failed_login_attempts: this.failed_login_attempts,
            account_locked: this.isAccountLocked(),
            last_login: this.last_login,
            last_password_change: this.last_password_change
        };
    }
}

module.exports = User;