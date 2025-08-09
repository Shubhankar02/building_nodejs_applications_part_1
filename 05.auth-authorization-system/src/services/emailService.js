const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');

class EmailService {
    constructor() {
        this.transporter = null;
        this.initializeTransporter();
    }

    // Initialize email transporter
    async initializeTransporter() {
        try {
            // Configure based on environment
            if (process.env.NODE_ENV === 'production') {
                // Production configuration (e.g., SendGrid, AWS SES, etc.)
                this.transporter = nodemailer.createTransport({
                    host: process.env.SMTP_HOST,
                    port: parseInt(process.env.SMTP_PORT) || 587,
                    secure: process.env.SMTP_SECURE === 'true',
                    auth: {
                        user: process.env.SMTP_USER,
                        pass: process.env.SMTP_PASS
                    }
                });
            } else {
                // Development configuration - using ethereal for testing
                const testAccount = await nodemailer.createTestAccount();

                this.transporter = nodemailer.createTransport({
                    host: 'smtp.ethereal.email',
                    port: 587,
                    secure: false,
                    auth: {
                        user: testAccount.user,
                        pass: testAccount.pass
                    }
                });
            }

            // Verify transporter configuration
            await this.transporter.verify();
            console.log('Email service initialized successfully');
        } catch (error) {
            console.error('Email service initialization failed:', error);
        }
    }

    // Load email template
    async loadTemplate(templateName, variables = {}) {
        try {
            const templatePath = path.join(__dirname, '..', '..', 'templates', `${templateName}.html`);
            let template = await fs.readFile(templatePath, 'utf8');

            // Replace variables in template
            for (const [key, value] of Object.entries(variables)) {
                const regex = new RegExp(`{{${key}}}`, 'g');
                template = template.replace(regex, value);
            }

            return template;
        } catch (error) {
            console.error('Error loading email template:', error);
            throw error;
        }
    }

    // Send email verification
    async sendEmailVerification(user) {
        try {
            const verificationUrl = `${process.env.FRONTEND_URL}/verify-email/${user.email_verification_token}`;

            const html = await this.loadTemplate('email-verification', {
                firstName: user.first_name,
                verificationUrl: verificationUrl,
                appName: process.env.APP_NAME || 'Auth System',
                supportEmail: process.env.SUPPORT_EMAIL || 'support@example.com'
            });

            const mailOptions = {
                from: `"${process.env.APP_NAME || 'Auth System'}" <${process.env.FROM_EMAIL || 'noreply@example.com'}>`,
                to: user.email,
                subject: 'Verify Your Email Address',
                html: html
            };

            const result = await this.transporter.sendMail(mailOptions);

            if (process.env.NODE_ENV !== 'production') {
                console.log('Email verification sent:', nodemailer.getTestMessageUrl(result));
            }

            return result;
        } catch (error) {
            console.error('Error sending email verification:', error);
            throw error;
        }
    }

    // Send password reset email
    async sendPasswordReset(user, resetToken) {
        try {
            const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

            const html = await this.loadTemplate('password-reset', {
                firstName: user.first_name,
                resetUrl: resetUrl,
                appName: process.env.APP_NAME || 'Auth System',
                supportEmail: process.env.SUPPORT_EMAIL || 'support@example.com',
                expirationTime: '1 hour'
            });

            const mailOptions = {
                from: `"${process.env.APP_NAME || 'Auth System'}" <${process.env.FROM_EMAIL || 'noreply@example.com'}>`,
                to: user.email,
                subject: 'Reset Your Password',
                html: html
            };

            const result = await this.transporter.sendMail(mailOptions);

            if (process.env.NODE_ENV !== 'production') {
                console.log('Password reset email sent:', nodemailer.getTestMessageUrl(result));
            }

            return result;
        } catch (error) {
            console.error('Error sending password reset email:', error);
            throw error;
        }
    }

    // Send welcome email
    async sendWelcomeEmail(user) {
        try {
            const html = await this.loadTemplate('welcome-email', {
                firstName: user.first_name,
                loginUrl: `${process.env.FRONTEND_URL}/login`,
                appName: process.env.APP_NAME || 'Auth System',
                supportEmail: process.env.SUPPORT_EMAIL || 'support@example.com'
            });

            const mailOptions = {
                from: `"${process.env.APP_NAME || 'Auth System'}" <${process.env.FROM_EMAIL || 'noreply@example.com'}>`,
                to: user.email,
                subject: 'Welcome to Our Platform!',
                html: html
            };

            const result = await this.transporter.sendMail(mailOptions);

            if (process.env.NODE_ENV !== 'production') {
                console.log('Welcome email sent:', nodemailer.getTestMessageUrl(result));
            }

            return result;
        } catch (error) {
            console.error('Error sending welcome email:', error);
            throw error;
        }
    }

    // Send security alert email
    async sendSecurityAlert(user, alertDetails) {
        try {
            const html = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: #dc3545; color: white; padding: 20px; text-align: center;">
                        <h1>🚨 Security Alert</h1>
                    </div>
                    <div style="background: #f8f9fa; padding: 30px;">
                        <h2>Hello ${user.first_name},</h2>
                        <p>We detected unusual activity on your account:</p>
                        <div style="background: white; padding: 20px; border-radius: 4px; margin: 20px 0;">
                            <ul style="list-style: none; padding: 0;">
                                <li style="margin-bottom: 10px;"><strong>Activity:</strong> ${alertDetails.activity}</li>
                                <li style="margin-bottom: 10px;"><strong>Time:</strong> ${alertDetails.timestamp}</li>
                                <li style="margin-bottom: 10px;"><strong>IP Address:</strong> ${alertDetails.ip}</li>
                                <li style="margin-bottom: 10px;"><strong>Location:</strong> ${alertDetails.location || 'Unknown'}</li>
                                <li style="margin-bottom: 10px;"><strong>Device:</strong> ${alertDetails.device || 'Unknown'}</li>
                            </ul>
                        </div>
                        <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 4px; margin: 20px 0;">
                            <strong>What should you do?</strong>
                            <p>If this was you, you can ignore this email. If not, please:</p>
                            <ul>
                                <li>Change your password immediately</li>
                                <li>Review your account activity</li>
                                <li>Enable two-factor authentication</li>
                                <li>Contact support if you need assistance</li>
                            </ul>
                        </div>
                        <p>Best regards,<br>Security Team</p>
                        <p style="font-size: 14px; color: #666;">
                            Need help? Contact us at <a href="mailto:${process.env.SECURITY_EMAIL || 'security@example.com'}">${process.env.SECURITY_EMAIL || 'security@example.com'}</a>
                        </p>
                    </div>
                </div>
            `;

            const mailOptions = {
                from: `"Security Team" <${process.env.SECURITY_EMAIL || 'security@example.com'}>`,
                to: user.email,
                subject: 'Security Alert - Unusual Activity Detected',
                html: html
            };

            const result = await this.transporter.sendMail(mailOptions);
            return result;
        } catch (error) {
            console.error('Error sending security alert email:', error);
            throw error;
        }
    }

    // Send account lockout notification
    async sendAccountLockoutNotification(user, lockoutDetails) {
        try {
            const html = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: #dc3545; color: white; padding: 20px; text-align: center;">
                        <h1>🔒 Account Locked</h1>
                    </div>
                    <div style="background: #f8f9fa; padding: 30px;">
                        <h2>Hello ${user.first_name},</h2>
                        <p>Your account has been temporarily locked due to multiple failed login attempts.</p>
                        <div style="background: white; padding: 20px; border-radius: 4px; margin: 20px 0;">
                            <ul style="list-style: none; padding: 0;">
                                <li style="margin-bottom: 10px;"><strong>Failed Attempts:</strong> ${lockoutDetails.attempts}</li>
                                <li style="margin-bottom: 10px;"><strong>Locked Until:</strong> ${lockoutDetails.lockedUntil}</li>
                                <li style="margin-bottom: 10px;"><strong>IP Address:</strong> ${lockoutDetails.ip}</li>
                                <li style="margin-bottom: 10px;"><strong>Last Attempt:</strong> ${lockoutDetails.lastAttempt}</li>
                            </ul>
                        </div>
                        <div style="background: #d1ecf1; border: 1px solid #bee5eb; padding: 15px; border-radius: 4px; margin: 20px 0;">
                            <strong>What happens next?</strong>
                            <p>Your account will automatically unlock after the lockout period expires. If you believe this was not you, please contact our security team immediately.</p>
                        </div>
                        <p>If you initiated these login attempts, please wait for the lockout period to expire and then try again with the correct password.</p>
                        <p>Best regards,<br>Security Team</p>
                    </div>
                </div>
            `;

            const mailOptions = {
                from: `"Security Team" <${process.env.SECURITY_EMAIL || 'security@example.com'}>`,
                to: user.email,
                subject: 'Account Temporarily Locked',
                html: html
            };

            const result = await this.transporter.sendMail(mailOptions);
            return result;
        } catch (error) {
            console.error('Error sending account lockout notification:', error);
            throw error;
        }
    }

    // Send password change confirmation
    async sendPasswordChangeConfirmation(user, changeDetails) {
        try {
            const html = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: #28a745; color: white; padding: 20px; text-align: center;">
                        <h1>🔐 Password Changed</h1>
                    </div>
                    <div style="background: #f8f9fa; padding: 30px;">
                        <h2>Hello ${user.first_name},</h2>
                        <p>Your password has been successfully changed.</p>
                        <div style="background: white; padding: 20px; border-radius: 4px; margin: 20px 0;">
                            <ul style="list-style: none; padding: 0;">
                                <li style="margin-bottom: 10px;"><strong>Changed At:</strong> ${changeDetails.timestamp}</li>
                                <li style="margin-bottom: 10px;"><strong>IP Address:</strong> ${changeDetails.ip}</li>
                                <li style="margin-bottom: 10px;"><strong>Device:</strong> ${changeDetails.device || 'Unknown'}</li>
                            </ul>
                        </div>
                        <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 4px; margin: 20px 0;">
                            <strong>Didn't change your password?</strong>
                            <p>If you did not change your password, please contact our security team immediately and consider that your account may be compromised.</p>
                        </div>
                        <p>For your security, all active sessions have been terminated. You'll need to log in again with your new password.</p>
                        <p>Best regards,<br>Security Team</p>
                    </div>
                </div>
            `;

            const mailOptions = {
                from: `"Security Team" <${process.env.SECURITY_EMAIL || 'security@example.com'}>`,
                to: user.email,
                subject: 'Password Successfully Changed',
                html: html
            };

            const result = await this.transporter.sendMail(mailOptions);
            return result;
        } catch (error) {
            console.error('Error sending password change confirmation:', error);
            throw error;
        }
    }

    // Send two-factor authentication enabled notification
    async sendTwoFactorEnabledNotification(user) {
        try {
            const html = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: #28a745; color: white; padding: 20px; text-align: center;">
                        <h1>🔒 Two-Factor Authentication Enabled</h1>
                    </div>
                    <div style="background: #f8f9fa; padding: 30px;">
                        <h2>Hello ${user.first_name},</h2>
                        <p>Two-factor authentication has been successfully enabled on your account. This adds an extra layer of security to protect your account.</p>

                        <div style="background: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 4px; margin: 20px 0;">
                            <strong>✅ Your account is now more secure!</strong>
                            <p>From now on, you'll need both your password and a verification code from your authenticator app to log in.</p>
                        </div>

                        <div style="background: white; padding: 20px; border-radius: 4px; margin: 20px 0;">
                            <h3>Important reminders:</h3>
                            <ul>
                                <li>Keep your backup codes in a safe place</li>
                                <li>Don't share your authenticator app with anyone</li>
                                <li>If you lose access to your authenticator, use a backup code to log in</li>
                                <li>Contact support if you need help recovering your account</li>
                            </ul>
                        </div>

                        <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 4px; margin: 20px 0;">
                            <strong>Didn't enable 2FA?</strong>
                            <p>If you did not enable two-factor authentication, please contact our security team immediately.</p>
                        </div>

                        <p>Thank you for helping keep your account secure!</p>
                        <p>Best regards,<br>Security Team</p>
                    </div>
                </div>
            `;

            const mailOptions = {
                from: `"Security Team" <${process.env.SECURITY_EMAIL || 'security@example.com'}>`,
                to: user.email,
                subject: 'Two-Factor Authentication Enabled',
                html: html
            };

            const result = await this.transporter.sendMail(mailOptions);
            return result;
        } catch (error) {
            console.error('Error sending 2FA enabled notification:', error);
            throw error;
        }
    }

    // Send admin notification for suspicious activity
    async sendAdminSecurityAlert(alertDetails) {
        try {
            const adminEmail = process.env.ADMIN_EMAIL || process.env.SECURITY_EMAIL;
            if (!adminEmail) {
                console.warn('No admin email configured for security alerts');
                return;
            }

            const html = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: #dc3545; color: white; padding: 20px; text-align: center;">
                        <h1>🚨 Security Alert - Admin Notification</h1>
                    </div>
                    <div style="background: #f8f9fa; padding: 30px;">
                        <h2>Security Event Detected</h2>
                        <p>A security event requires your attention:</p>
                        <div style="background: white; padding: 20px; border-radius: 4px; margin: 20px 0;">
                            <ul style="list-style: none; padding: 0;">
                                <li style="margin-bottom: 10px;"><strong>Event Type:</strong> ${alertDetails.eventType}</li>
                                <li style="margin-bottom: 10px;"><strong>User:</strong> ${alertDetails.userEmail || 'Unknown'}</li>
                                <li style="margin-bottom: 10px;"><strong>IP Address:</strong> ${alertDetails.ip}</li>
                                <li style="margin-bottom: 10px;"><strong>Timestamp:</strong> ${alertDetails.timestamp}</li>
                                <li style="margin-bottom: 10px;"><strong>Details:</strong> ${alertDetails.details}</li>
                            </ul>
                        </div>
                        <p>Please review this activity and take appropriate action if necessary.</p>
                        <p>System Administrator</p>
                    </div>
                </div>
            `;

            const mailOptions = {
                from: `"System Security" <${process.env.SECURITY_EMAIL || 'security@example.com'}>`,
                to: adminEmail,
                subject: `Security Alert - ${alertDetails.eventType}`,
                html: html
            };

            const result = await this.transporter.sendMail(mailOptions);
            return result;
        } catch (error) {
            console.error('Error sending admin security alert:', error);
            throw error;
        }
    }
}

// Create singleton instance
const emailService = new EmailService();

module.exports = emailService;
