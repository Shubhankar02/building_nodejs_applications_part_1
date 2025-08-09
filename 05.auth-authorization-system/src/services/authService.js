const User = require('../models/User');
const tokenService = require('./tokenService');
const emailService = require('./emailService');
const auditService = require('./auditService');
const twoFactorService = require('./twoFactorService');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../config/database');

class AuthService {
    // Register new user with email verification
    static async register(userData, clientInfo = {}) {
        try {
            // Create user account
            const user = await User.create(userData);

            // Send email verification
            await emailService.sendEmailVerification(user);

            // Log registration event
            await auditService.logEvent({
                user_id: user.id,
                event_type: 'user_registration',
                event_category: 'authentication',
                success: true,
                ip_address: clientInfo.ip,
                user_agent: clientInfo.userAgent,
                metadata: {
                    email: user.email,
                    registration_method: 'email'
                }
            });

            return {
                user: user.toJSON(),
                message: 'Registration successful. Please check your email for verification instructions.'
            };
        } catch (error) {
            // Log failed registration
            await auditService.logEvent({
                event_type: 'user_registration_failed',
                event_category: 'authentication',
                success: false,
                error_message: error.message,
                ip_address: clientInfo.ip,
                user_agent: clientInfo.userAgent,
                metadata: {
                    attempted_email: userData.email
                }
            });

            throw error;
        }
    }

    // Authenticate user with comprehensive security checks
    static async login(credentials, clientInfo = {}) {
        const { email, password, two_factor_code, remember_me = false } = credentials;

        try {
            // Find user by email
            const user = await User.findByEmail(email);
            if (!user) {
                throw new Error('Invalid email or password');
            }

            // Check if account is active
            if (!user.is_active) {
                throw new Error('Account is deactivated');
            }

            // Verify password
            const isValidPassword = await user.verifyPassword(password);
            if (!isValidPassword) {
                await auditService.logEvent({
                    user_id: user.id,
                    event_type: 'login_failed',
                    event_category: 'authentication',
                    success: false,
                    error_message: 'Invalid password',
                    ip_address: clientInfo.ip,
                    user_agent: clientInfo.userAgent
                });

                throw new Error('Invalid email or password');
            }

            // Check two-factor authentication if enabled
            if (user.two_factor_enabled) {
                if (!two_factor_code) {
                    throw new Error('Two-factor authentication code required');
                }

                const isValidTwoFactor = await twoFactorService.verifyCode(
                    user.two_factor_secret,
                    two_factor_code
                );

                if (!isValidTwoFactor) {
                    await auditService.logEvent({
                        user_id: user.id,
                        event_type: 'two_factor_failed',
                        event_category: 'authentication',
                        success: false,
                        ip_address: clientInfo.ip,
                        user_agent: clientInfo.userAgent
                    });

                    throw new Error('Invalid two-factor authentication code');
                }
            }

            // Generate tokens
            const tokenDuration = remember_me ? '30d' : '1d';
            const accessToken = await tokenService.generateAccessToken(user, tokenDuration);
            const refreshToken = await tokenService.generateRefreshToken(user);

            // Create session record
            const session = await tokenService.createSession({
                user_id: user.id,
                access_token: accessToken,
                refresh_token: refreshToken,
                device_info: clientInfo.deviceInfo,
                ip_address: clientInfo.ip,
                user_agent: clientInfo.userAgent,
                is_remembered: remember_me
            });

            // Update last login information
            await user.resetFailedLoginAttempts();

            // Load user roles and permissions
            const userWithRoles = await User.findById(user.id, true);

            // Log successful login
            await auditService.logEvent({
                user_id: user.id,
                session_id: session.id,
                event_type: 'login_success',
                event_category: 'authentication',
                success: true,
                ip_address: clientInfo.ip,
                user_agent: clientInfo.userAgent,
                metadata: {
                    remember_me,
                    two_factor_used: user.two_factor_enabled
                }
            });

            return {
                user: userWithRoles.toJSON(),
                tokens: {
                    access_token: accessToken,
                    refresh_token: refreshToken,
                    token_type: 'Bearer',
                    expires_in: remember_me ? 30 * 24 * 60 * 60 : 24 * 60 * 60 // seconds
                },
                session: {
                    id: session.id,
                    created_at: session.created_at,
                    expires_at: session.expires_at
                }
            };
        } catch (error) {
            console.error('Login error:', error);
            throw error;
        }
    }

    // Refresh access token using refresh token
    static async refreshToken(refreshToken, clientInfo = {}) {
        try {
            // Verify and get session
            const session = await tokenService.verifyRefreshToken(refreshToken);
            if (!session) {
                throw new Error('Invalid refresh token');
            }

            // Get user
            const user = await User.findById(session.user_id, true);
            if (!user || !user.is_active) {
                throw new Error('User not found or inactive');
            }

            // Generate new access token
            const newAccessToken = await tokenService.generateAccessToken(user);

            // Update session
            await tokenService.updateSessionLastAccessed(session.id, clientInfo.ip);

            // Log token refresh
            await auditService.logEvent({
                user_id: user.id,
                session_id: session.id,
                event_type: 'token_refresh',
                event_category: 'authentication',
                success: true,
                ip_address: clientInfo.ip,
                user_agent: clientInfo.userAgent
            });

            return {
                access_token: newAccessToken,
                token_type: 'Bearer',
                expires_in: 24 * 60 * 60 // 24 hours in seconds
            };
        } catch (error) {
            await auditService.logEvent({
                event_type: 'token_refresh_failed',
                event_category: 'authentication',
                success: false,
                error_message: error.message,
                ip_address: clientInfo.ip,
                user_agent: clientInfo.userAgent
            });

            throw error;
        }
    }

    // Logout user and invalidate session
    static async logout(sessionToken, clientInfo = {}) {
        try {
            const session = await tokenService.findSessionByToken(sessionToken);
            if (session) {
                await tokenService.invalidateSession(session.id);

                await auditService.logEvent({
                    user_id: session.user_id,
                    session_id: session.id,
                    event_type: 'logout',
                    event_category: 'authentication',
                    success: true,
                    ip_address: clientInfo.ip,
                    user_agent: clientInfo.userAgent
                });
            }

            return { message: 'Logout successful' };
        } catch (error) {
            console.error('Logout error:', error);
            throw error;
        }
    }
    // Request password reset
    static async requestPasswordReset(email, clientInfo = {}) {
        try {
            const user = await User.findByEmail(email);

            // Always return success to prevent email enumeration attacks
            const response = {
                message: 'If an account with that email exists, you will receive password reset instructions.'
            };

            if (!user) {
                // Log failed password reset attempt
                await auditService.logEvent({
                    event_type: 'password_reset_request_failed',
                    event_category: 'authentication',
                    success: false,
                    error_message: 'Email not found',
                    ip_address: clientInfo.ip,
                    user_agent: clientInfo.userAgent,
                    metadata: { attempted_email: email }
                });

                return response;
            }

            // Generate reset token
            const resetToken = await user.generatePasswordResetToken();

            // Send password reset email
            await emailService.sendPasswordReset(user, resetToken);

            // Log password reset request
            await auditService.logEvent({
                user_id: user.id,
                event_type: 'password_reset_request',
                event_category: 'authentication',
                success: true,
                ip_address: clientInfo.ip,
                user_agent: clientInfo.userAgent
            });

            return response;
        } catch (error) {
            console.error('Password reset request error:', error);
            throw error;
        }
    }

    // Reset password using reset token
    static async resetPassword(token, newPassword, clientInfo = {}) {
        try {
            // Verify reset token
            const user = await User.verifyPasswordResetToken(token);
            if (!user) {
                throw new Error('Invalid or expired password reset token');
            }

            // Reset password
            await user.resetPassword(newPassword, token);

            // Invalidate all existing sessions for security
            await tokenService.invalidateAllUserSessions(user.id);

            // Log password reset
            await auditService.logEvent({
                user_id: user.id,
                event_type: 'password_reset_completed',
                event_category: 'authentication',
                success: true,
                ip_address: clientInfo.ip,
                user_agent: clientInfo.userAgent
            });

            return { message: 'Password reset successful. Please log in with your new password.' };
        } catch (error) {
            await auditService.logEvent({
                event_type: 'password_reset_failed',
                event_category: 'authentication',
                success: false,
                error_message: error.message,
                ip_address: clientInfo.ip,
                user_agent: clientInfo.userAgent
            });

            throw error;
        }
    }

    // Verify email address
    static async verifyEmail(token, clientInfo = {}) {
        try {
            // Find user by verification token
            const result = await db.query(`
                SELECT * FROM users
                WHERE email_verification_token = $1
                AND email_verification_expires > CURRENT_TIMESTAMP
            `, [token]);

            if (result.rows.length === 0) {
                throw new Error('Invalid or expired email verification token');
            }

            const user = new User(result.rows[0]);
            await user.verifyEmail(token);

            // Log email verification
            await auditService.logEvent({
                user_id: user.id,
                event_type: 'email_verified',
                event_category: 'authentication',
                success: true,
                ip_address: clientInfo.ip,
                user_agent: clientInfo.userAgent
            });

            return {
                message: 'Email verified successfully. Your account is now fully activated.',
                user: user.toJSON()
            };
        } catch (error) {
            await auditService.logEvent({
                event_type: 'email_verification_failed',
                event_category: 'authentication',
                success: false,
                error_message: error.message,
                ip_address: clientInfo.ip,
                user_agent: clientInfo.userAgent
            });

            throw error;
        }
    }

    // Resend email verification
    static async resendEmailVerification(email, clientInfo = {}) {
        try {
            const user = await User.findByEmail(email);

            if (!user) {
                // Don't reveal if email exists to prevent enumeration
                return { message: 'If an account with that email exists and is unverified, a verification email has been sent.' };
            }

            if (user.email_verified) {
                return { message: 'Email address is already verified.' };
            }

            // Generate new verification token
            const verificationToken = crypto.randomBytes(32).toString('hex');
            const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

            await db.query(`
                UPDATE users
                SET email_verification_token = $1,
                    email_verification_expires = $2,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $3
            `, [verificationToken, verificationExpires, user.id]);

            // Send verification email
            user.email_verification_token = verificationToken;
            await emailService.sendEmailVerification(user);

            // Log resend verification
            await auditService.logEvent({
                user_id: user.id,
                event_type: 'email_verification_resent',
                event_category: 'authentication',
                success: true,
                ip_address: clientInfo.ip,
                user_agent: clientInfo.userAgent
            });

            return { message: 'Verification email sent. Please check your inbox.' };
        } catch (error) {
            console.error('Resend email verification error:', error);
            throw error;
        }
    }
    // Change password for authenticated user
    static async changePassword(userId, currentPassword, newPassword, clientInfo = {}) {
        try {
            const user = await User.findById(userId);
            if (!user) {
                throw new Error('User not found');
            }

            // Verify current password
            const userWithPassword = await User.findByEmail(user.email, true);
            const isValidCurrentPassword = await bcrypt.compare(currentPassword, userWithPassword.password_hash);

            if (!isValidCurrentPassword) {
                throw new Error('Current password is incorrect');
            }

            // Hash new password
            const saltRounds = 12;
            const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

            // Update password
            await db.query(`
                UPDATE users
                SET password_hash = $1,
                    last_password_change = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
            `, [newPasswordHash, userId]);

            // Invalidate all sessions except current one for security
            const currentSession = await tokenService.findSessionByUserId(userId);
            await tokenService.invalidateAllUserSessionsExcept(userId, currentSession?.id);

            // Log password change
            await auditService.logEvent({
                user_id: userId,
                event_type: 'password_changed',
                event_category: 'authentication',
                success: true,
                ip_address: clientInfo.ip,
                user_agent: clientInfo.userAgent
            });

            return { message: 'Password changed successfully' };
        } catch (error) {
            await auditService.logEvent({
                user_id: userId,
                event_type: 'password_change_failed',
                event_category: 'authentication',
                success: false,
                error_message: error.message,
                ip_address: clientInfo.ip,
                user_agent: clientInfo.userAgent
            });

            throw error;
        }
    }

    // Enable two-factor authentication
    static async enableTwoFactor(userId, clientInfo = {}) {
        try {
            const user = await User.findById(userId);
            if (!user) {
                throw new Error('User not found');
            }

            if (user.two_factor_enabled) {
                throw new Error('Two-factor authentication is already enabled');
            }

            // Generate 2FA secret
            const secret = twoFactorService.generateSecret(user.email);
            const qrCodeUrl = await twoFactorService.generateQRCode(secret);
            const backupCodes = twoFactorService.generateBackupCodes();

            // Store secret temporarily (not activated until verified)
            await db.query(`
                UPDATE users
                SET two_factor_secret = $1,
                    two_factor_backup_codes = $2,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $3
            `, [secret.base32, backupCodes, userId]);

            return {
                secret: secret.base32,
                qr_code: qrCodeUrl,
                backup_codes: backupCodes,
                manual_entry_key: secret.base32
            };
        } catch (error) {
            console.error('Enable 2FA error:', error);
            throw error;
        }
    }

    // Verify and activate two-factor authentication
    static async verifyTwoFactor(userId, code, clientInfo = {}) {
        try {
            const user = await User.findById(userId);
            if (!user) {
                throw new Error('User not found');
            }

            const userWithSecret = await db.query(
                'SELECT two_factor_secret FROM users WHERE id = $1',
                [userId]
            );

            if (!userWithSecret.rows[0]?.two_factor_secret) {
                throw new Error('Two-factor setup not initiated');
            }

            const secret = userWithSecret.rows[0].two_factor_secret;
            const isValid = twoFactorService.verifyCode(secret, code);

            if (!isValid) {
                throw new Error('Invalid two-factor authentication code');
            }

            // Activate two-factor authentication
            await db.query(`
                UPDATE users
                SET two_factor_enabled = TRUE,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
            `, [userId]);

            // Log 2FA activation
            await auditService.logEvent({
                user_id: userId,
                event_type: 'two_factor_enabled',
                event_category: 'authentication',
                success: true,
                ip_address: clientInfo.ip,
                user_agent: clientInfo.userAgent
            });

            return { message: 'Two-factor authentication enabled successfully' };
        } catch (error) {
            await auditService.logEvent({
                user_id: userId,
                event_type: 'two_factor_enable_failed',
                event_category: 'authentication',
                success: false,
                error_message: error.message,
                ip_address: clientInfo.ip,
                user_agent: clientInfo.userAgent
            });

            throw error;
        }
    }

    // Disable two-factor authentication
    static async disableTwoFactor(userId, password, clientInfo = {}) {
        try {
            const user = await User.findByEmail(
                (await User.findById(userId)).email,
                true
            );

            if (!user) {
                throw new Error('User not found');
            }

            // Verify password before disabling 2FA
            const isValidPassword = await bcrypt.compare(password, user.password_hash);
            if (!isValidPassword) {
                throw new Error('Invalid password');
            }

            // Disable two-factor authentication
            await db.query(`
                UPDATE users
                SET two_factor_enabled = FALSE,
                    two_factor_secret = NULL,
                    two_factor_backup_codes = NULL,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
            `, [userId]);

            // Log 2FA deactivation
            await auditService.logEvent({
                user_id: userId,
                event_type: 'two_factor_disabled',
                event_category: 'authentication',
                success: true,
                ip_address: clientInfo.ip,
                user_agent: clientInfo.userAgent
            });

            return { message: 'Two-factor authentication disabled successfully' };
        } catch (error) {
            await auditService.logEvent({
                user_id: userId,
                event_type: 'two_factor_disable_failed',
                event_category: 'authentication',
                success: false,
                error_message: error.message,
                ip_address: clientInfo.ip,
                user_agent: clientInfo.userAgent
            });

            throw error;
        }
    }
}

module.exports = AuthService;