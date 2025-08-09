const User = require('../models/User');
const File = require('../models/File');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const joi = require('joi');

class AuthController {
    // User registration with input validation
    static async register(req, res) {
        try {
            // Validate input data
            const schema = joi.object({
                email: joi.string().email().required(),
                name: joi.string().min(2).max(50).required(),
                password: joi.string().min(6).max(128).required()
            });

            const { error, value } = schema.validate(req.body);

            if (error) {
                return res.status(400).json({
                    success: false,
                    error: 'Validation failed',
                    details: error.details.map(detail => detail.message)
                });
            }

            const { email, name, password } = value;

            // Check if user already exists
            const existingUser = await User.findByEmail(email);

            if (existingUser) {
                return res.status(409).json({
                    success: false,
                    error: 'User with this email already exists'
                });
            }

            // Create new user
            const user = await User.create({ email, name, password });

            // Generate JWT token
            const token = jwt.sign(
                {
                    userId: user.id,
                    email: user.email
                },
                process.env.JWT_SECRET || 'fallback-secret-key',
                {
                    expiresIn: '7d',
                    issuer: 'file-upload-service'
                }
            );

            res.status(201).json({
                success: true,
                message: 'User registered successfully',
                data: {
                    user: user.toJSON(),
                    token,
                    token_expires: '7 days'
                }
            });

        } catch (error) {
            console.error('Registration error:', error);

            if (error.message.includes('Email already exists')) {
                return res.status(409).json({
                    success: false,
                    error: error.message
                });
            }

            res.status(500).json({
                success: false,
                error: 'Registration failed',
                details: error.message
            });
        }
    }

    // User login with credential validation
    static async login(req, res) {
        try {
            // Validate input data
            const schema = joi.object({
                email: joi.string().email().required(),
                password: joi.string().required()
            });

            const { error, value } = schema.validate(req.body);

            if (error) {
                return res.status(400).json({
                    success: false,
                    error: 'Validation failed',
                    details: error.details.map(detail => detail.message)
                });
            }

            const { email, password } = value;

            // Find user by email
            const user = await User.findByEmail(email);

            if (!user) {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid email or password'
                });
            }

            // Verify password
            const isValidPassword = await user.verifyPassword(password);

            if (!isValidPassword) {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid email or password'
                });
            }

            // Generate JWT token
            const token = jwt.sign(
                {
                    userId: user.id,
                    email: user.email
                },
                process.env.JWT_SECRET || 'fallback-secret-key',
                {
                    expiresIn: '7d',
                    issuer: 'file-upload-service'
                }
            );

            res.json({
                success: true,
                message: 'Login successful',
                data: {
                    user: user.toJSON(),
                    token,
                    token_expires: '7 days'
                }
            });

        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({
                success: false,
                error: 'Login failed',
                details: error.message
            });
        }
    }

    // Get current user profile
    static async getProfile(req, res) {
        try {
            // req.user is set by the authentication middleware
            const user = await User.findById(req.user.id);

            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }

            // Get user's storage statistics
            const storageStats = await File.getStorageStats(user.id);

            res.json({
                success: true,
                data: {
                    user: user.toJSON(),
                    storage: {
                        used_bytes: parseInt(storageStats.storage_used_bytes),
                        quota_bytes: parseInt(storageStats.storage_quota_bytes),
                        usage_percentage: Math.round((storageStats.storage_used_bytes / storageStats.storage_quota_bytes) * 100),
                        file_count: parseInt(storageStats.total_files)
                    }
                }
            });

        } catch (error) {
            console.error('Error getting user profile:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to retrieve user profile'
            });
        }
    }

    // Update user profile
    static async updateProfile(req, res) {
        try {
            // Validate input data
            const schema = joi.object({
                name: joi.string().min(2).max(50),
                current_password: joi.string().when('new_password', {
                    is: joi.exist(),
                    then: joi.required(),
                    otherwise: joi.optional()
                }),
                new_password: joi.string().min(6).max(128)
            });

            const { error, value } = schema.validate(req.body);

            if (error) {
                return res.status(400).json({
                    success: false,
                    error: 'Validation failed',
                    details: error.details.map(detail => detail.message)
                });
            }

            const { name, current_password, new_password } = value;

            const user = await User.findById(req.user.id);

            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }

            // Handle password change if requested
            if (new_password) {
                const isValidCurrentPassword = await user.verifyPassword(current_password);

                if (!isValidCurrentPassword) {
                    return res.status(401).json({
                        success: false,
                        error: 'Current password is incorrect'
                    });
                }

                // Hash new password
                const saltRounds = 12;
                const newPasswordHash = await bcrypt.hash(new_password, saltRounds);

                await user.update({
                    name: name || user.name,
                    password_hash: newPasswordHash
                });
            } else {
                // Update only name if provided
                if (name) {
                    await user.update({ name });
                }
            }

            res.json({
                success: true,
                message: 'Profile updated successfully',
                data: {
                    user: user.toJSON()
                }
            });

        } catch (error) {
            console.error('Error updating user profile:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update profile',
                details: error.message
            });
        }
    }
}

module.exports = AuthController;
