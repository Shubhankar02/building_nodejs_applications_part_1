const authService = require('../services/authService');
const User = require('../models/User');
const joi = require('joi');
const auditService = require('../services/auditService');

class AuthController {
    // User registration with comprehensive validation
    static async register(req, res) {
        try {
            // Entry log for debugging routing flow
            console.log('AuthController.register: received request', {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                email: req.body?.email
            });
            console.log('Registering user');
            // Validate input data
            const schema = joi.object({
                email: joi.string().email().required(),
                username: joi.string().alphanum().min(3).max(30).optional(),
                first_name: joi.string().min(2).max(50).required(),
                last_name: joi.string().min(2).max(50).required(),
                password: joi.string().min(2).max(128).required(),
                timezone: joi.string().optional(),
                locale: joi.string().length(2).optional()
            });

            const { error, value } = schema.validate(req.body);

            if (error) {
                return res.status(400).json({
                    success: false,
                    error: 'Validation failed',
                    details: error.details.map(detail => ({
                        field: detail.path.join('.'),
                        message: detail.message
                    }))
                });
            }

            // Get client information for audit logging
            const clientInfo = {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                deviceInfo: {
                    platform: req.get('sec-ch-ua-platform'),
                    mobile: req.get('sec-ch-ua-mobile')
                }
            };

            // Register user
            const result = await authService.register(value, clientInfo);

            // Success log for visibility
            console.log('AuthController.register: registration successful', {
                email: value.email,
                userId: result?.user?.id || result?.id || 'unknown'
            });

            res.status(201).json({
                success: true,
                data: result
            });

        } catch (error) {
            console.error('Registration error:', error);
            res.status(400).json({
                success: false,
                error: error.message,
                code: 'REGISTRATION_FAILED'
            });
        }
    }

    // User login with optional 2FA
    static async login(req, res) {
        try {
            const schema = joi.object({
                email: joi.string().email().required(),
                password: joi.string().required(),
                two_factor_code: joi.string().length(6).optional(),
                remember_me: joi.boolean().default(false)
            });

            const { error, value } = schema.validate(req.body);

            if (error) {
                return res.status(400).json({
                    success: false,
                    error: 'Validation failed',
                    details: error.details.map(detail => detail.message)
                });
            }

            const clientInfo = {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                deviceInfo: {
                    platform: req.get('sec-ch-ua-platform'),
                    mobile: req.get('sec-ch-ua-mobile')
                }
            };

            const result = await authService.login(value, clientInfo);

            res.json({
                success: true,
                data: result
            });

        } catch (error) {
            console.error('Login error:', error);

            // Different status codes for different error types
            let statusCode = 401;
            if (error.message.includes('Two-factor authentication code required')) {
                statusCode = 200; // Special case - partial success, 2FA required
            } else if (error.message.includes('deactivated') || error.message.includes('locked')) {
                statusCode = 403;
            }

            res.status(statusCode).json({
                success: false,
                error: error.message,
                code: error.message.includes('Two-factor') ? 'TWO_FACTOR_REQUIRED' : 'LOGIN_FAILED',
                requires_2fa: error.message.includes('Two-factor authentication code required')
            });
        }
    }

    // Refresh access token
    static async refreshToken(req, res) {
        try {
            const { refresh_token } = req.body;

            if (!refresh_token) {
                return res.status(400).json({
                    success: false,
                    error: 'Refresh token is required'
                });
            }

            const clientInfo = {
                ip: req.ip,
                userAgent: req.get('User-Agent')
            };

            const result = await authService.refreshToken(refresh_token, clientInfo);

            res.json({
                success: true,
                data: result
            });

        } catch (error) {
            console.error('Token refresh error:', error);
            res.status(401).json({
                success: false,
                error: error.message,
                code: 'TOKEN_REFRESH_FAILED'
            });
        }
    }

    // User logout
    static async logout(req, res) {
        try {
            const clientInfo = {
                ip: req.ip,
                userAgent: req.get('User-Agent')
            };

            await authService.logout(req.token, clientInfo);

            res.json({
                success: true,
                message: 'Logged out successfully'
            });

        } catch (error) {
            console.error('Logout error:', error);
            res.status(500).json({
                success: false,
                error: 'Logout failed'
            });
        }
    }

    // Request password reset
    static async requestPasswordReset(req, res) {
        try {
            const schema = joi.object({
                email: joi.string().email().required()
            });

            const { error, value } = schema.validate(req.body);

            if (error) {
                return res.status(400).json({
                    success: false,
                    error: 'Valid email address is required'
                });
            }

            const clientInfo = {
                ip: req.ip,
                userAgent: req.get('User-Agent')
            };

            const result = await authService.requestPasswordReset(value.email, clientInfo);

            res.json({
                success: true,
                data: result
            });

        } catch (error) {
            console.error('Password reset request error:', error);
            res.status(500).json({
                success: false,
                error: 'Password reset request failed'
            });
        }
    }

    // Reset password using token
    static async resetPassword(req, res) {
        try {
            const schema = joi.object({
                token: joi.string().required(),
                new_password: joi.string().min(8).max(128).pattern(
                    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/
                ).required()
            });

            const { error, value } = schema.validate(req.body);

            if (error) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid input data',
                    details: error.details.map(detail => detail.message)
                });
            }

            const clientInfo = {
                ip: req.ip,
                userAgent: req.get('User-Agent')
            };

            const result = await authService.resetPassword(value.token, value.new_password, clientInfo);

            res.json({
                success: true,
                data: result
            });

        } catch (error) {
            console.error('Password reset error:', error);
            res.status(400).json({
                success: false,
                error: error.message,
                code: 'PASSWORD_RESET_FAILED'
            });
        }
    }

    // Verify email address
    static async verifyEmail(req, res) {
        try {
            const { token } = req.params;

            if (!token) {
                return res.status(400).json({
                    success: false,
                    error: 'Verification token is required'
                });
            }

            const clientInfo = {
                ip: req.ip,
                userAgent: req.get('User-Agent')
            };

            const result = await authService.verifyEmail(token, clientInfo);

            res.json({
                success: true,
                data: result
            });

        } catch (error) {
            console.error('Email verification error:', error);
            res.status(400).json({
                success: false,
                error: error.message,
                code: 'EMAIL_VERIFICATION_FAILED'
            });
        }
    }

    // Resend email verification
    static async resendEmailVerification(req, res) {
        try {
            const schema = joi.object({
                email: joi.string().email().required()
            });

            const { error, value } = schema.validate(req.body);

            if (error) {
                return res.status(400).json({
                    success: false,
                    error: 'Valid email address is required'
                });
            }

            const clientInfo = {
                ip: req.ip,
                userAgent: req.get('User-Agent')
            };

            const result = await authService.resendEmailVerification(value.email, clientInfo);

            res.json({
                success: true,
                data: result
            });

        } catch (error) {
            console.error('Resend verification error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to resend verification email'
            });
        }
    }

    // Change password for authenticated user
    static async changePassword(req, res) {
        try {
            const schema = joi.object({
                current_password: joi.string().required(),
                new_password: joi.string().min(8).max(128).pattern(
                    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/
                ).required()
            });

            const { error, value } = schema.validate(req.body);

            if (error) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid input data',
                    details: error.details.map(detail => detail.message)
                });
            }

            const clientInfo = {
                ip: req.ip,
                userAgent: req.get('User-Agent')
            };

            const result = await authService.changePassword(
                req.user.id,
                value.current_password,
                value.new_password,
                clientInfo
            );

            res.json({
                success: true,
                data: result
            });

        } catch (error) {
            console.error('Change password error:', error);
            res.status(400).json({
                success: false,
                error: error.message,
                code: 'PASSWORD_CHANGE_FAILED'
            });
        }
    }

    // Enable two-factor authentication
    static async enableTwoFactor(req, res) {
        try {
            const clientInfo = {
                ip: req.ip,
                userAgent: req.get('User-Agent')
            };

            const result = await authService.enableTwoFactor(req.user.id, clientInfo);

            res.json({
                success: true,
                data: result
            });

        } catch (error) {
            console.error('Enable 2FA error:', error);
            res.status(400).json({
                success: false,
                error: error.message,
                code: 'TWO_FACTOR_ENABLE_FAILED'
            });
        }
    }

    // Verify and activate two-factor authentication
    static async verifyTwoFactor(req, res) {
        try {
            const schema = joi.object({
                code: joi.string().length(6).required()
            });

            const { error, value } = schema.validate(req.body);

            if (error) {
                return res.status(400).json({
                    success: false,
                    error: 'Valid 6-digit code is required'
                });
            }

            const clientInfo = {
                ip: req.ip,
                userAgent: req.get('User-Agent')
            };

            const result = await authService.verifyTwoFactor(req.user.id, value.code, clientInfo);

            res.json({
                success: true,
                data: result
            });

        } catch (error) {
            console.error('Verify 2FA error:', error);
            res.status(400).json({
                success: false,
                error: error.message,
                code: 'TWO_FACTOR_VERIFY_FAILED'
            });
        }
    }

    // Disable two-factor authentication
    static async disableTwoFactor(req, res) {
        try {
            const schema = joi.object({
                password: joi.string().required()
            });

            const { error, value } = schema.validate(req.body);

            if (error) {
                return res.status(400).json({
                    success: false,
                    error: 'Password is required to disable 2FA'
                });
            }

            const clientInfo = {
                ip: req.ip,
                userAgent: req.get('User-Agent')
            };

            const result = await authService.disableTwoFactor(req.user.id, value.password, clientInfo);

            res.json({
                success: true,
                data: result
            });

        } catch (error) {
            console.error('Disable 2FA error:', error);
            res.status(400).json({
                success: false,
                error: error.message,
                code: 'TWO_FACTOR_DISABLE_FAILED'
            });
        }
    }

    // Get current user profile
    static async getProfile(req, res) {
        try {
            // Load user with roles and permissions
            const user = await User.findById(req.user.id, true);

            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }

            res.json({
                success: true,
                data: {
                    user: user.toJSON(),
                    security: user.getSecuritySummary()
                }
            });

        } catch (error) {
            console.error('Get profile error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to retrieve profile'
            });
        }
    }

    // Update user profile
    static async updateProfile(req, res) {
        try {
            const schema = joi.object({
                first_name: joi.string().min(2).max(50).optional(),
                last_name: joi.string().min(2).max(50).optional(),
                username: joi.string().alphanum().min(3).max(30).optional(),
                avatar_url: joi.string().uri().optional(),
                timezone: joi.string().optional(),
                locale: joi.string().length(2).optional()
            });

            const { error, value } = schema.validate(req.body);

            if (error) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid input data',
                    details: error.details.map(detail => detail.message)
                });
            }

            const user = await User.findById(req.user.id);
            const updatedUser = await user.updateProfile(value, req.user.id);

            res.json({
                success: true,
                data: {
                    user: updatedUser.toJSON()
                }
            });

        } catch (error) {
            console.error('Update profile error:', error);
            res.status(400).json({
                success: false,
                error: error.message,
                code: 'PROFILE_UPDATE_FAILED'
            });
        }
    }
}

module.exports = AuthController;
