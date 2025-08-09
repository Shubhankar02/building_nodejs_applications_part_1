const User = require('../models/User');
const Role = require('../models/Role');
const tokenService = require('../services/tokenService');
const auditService = require('../services/auditService');
const joi = require('joi');

class UserController {
    // Get all users (admin only)
    static async getAllUsers(req, res) {
        try {
            const {
                page = 1,
                limit = 20,
                search,
                role,
                status,
                sort_by = 'created_at',
                sort_order = 'DESC'
            } = req.query;

            const pageNum = parseInt(page);
            const limitNum = Math.min(parseInt(limit), 100); // Cap at 100

            let query = `
                SELECT
                    u.id, u.email, u.username, u.first_name, u.last_name,
                    u.email_verified, u.two_factor_enabled, u.is_active, u.is_verified,
                    u.last_login, u.created_at, u.updated_at,
                    STRING_AGG(r.name, ', ') as roles
                FROM users u
                LEFT JOIN user_roles ur ON u.id = ur.user_id AND ur.is_active = TRUE
                LEFT JOIN roles r ON ur.role_id = r.id
                WHERE 1=1
            `;

            const params = [];
            let paramCount = 0;

            // Add search filter
            if (search) {
                paramCount++;
                query += ` AND (u.first_name ILIKE $${paramCount} OR u.last_name ILIKE $${paramCount} OR u.email ILIKE $${paramCount})`;
                params.push(`%${search}%`);
            }

            // Add role filter
            if (role) {
                paramCount++;
                query += ` AND r.name = $${paramCount}`;
                params.push(role);
            }

            // Add status filter
            if (status === 'active') {
                query += ` AND u.is_active = TRUE`;
            } else if (status === 'inactive') {
                query += ` AND u.is_active = FALSE`;
            }

            query += ` GROUP BY u.id, u.email, u.username, u.first_name, u.last_name,
                       u.email_verified, u.two_factor_enabled, u.is_active, u.is_verified,
                       u.last_login, u.created_at, u.updated_at`;

            // Add sorting
            const validSortColumns = ['created_at', 'last_login', 'email', 'first_name', 'last_name'];
            if (validSortColumns.includes(sort_by)) {
                query += ` ORDER BY u.${sort_by} ${sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'}`;
            } else {
                query += ` ORDER BY u.created_at DESC`;
            }

            // Add pagination
            query += ` LIMIT ${limitNum} OFFSET ${(pageNum - 1) * limitNum}`;

            const result = await User.query(query, params);

            // Get total count for pagination
            let countQuery = `
                SELECT COUNT(DISTINCT u.id) as total
                FROM users u
                LEFT JOIN user_roles ur ON u.id = ur.user_id AND ur.is_active = TRUE
                LEFT JOIN roles r ON ur.role_id = r.id
                WHERE 1=1
            `;

            if (search) {
                countQuery += ` AND (u.first_name ILIKE '${search}' OR u.last_name ILIKE '${search}' OR u.email ILIKE '${search}')`;
            }
            if (role) {
                countQuery += ` AND r.name = '${role}'`;
            }
            if (status === 'active') {
                countQuery += ` AND u.is_active = TRUE`;
            } else if (status === 'inactive') {
                countQuery += ` AND u.is_active = FALSE`;
            }

            const countResult = await User.query(countQuery);
            const totalUsers = parseInt(countResult.rows[0].total);

            res.json({
                success: true,
                data: {
                    users: result.rows,
                    pagination: {
                        page: pageNum,
                        limit: limitNum,
                        total: totalUsers,
                        pages: Math.ceil(totalUsers / limitNum)
                    }
                }
            });

        } catch (error) {
            console.error('Error getting all users:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to retrieve users'
            });
        }
    }

    // Get specific user details (admin only)
    static async getUserDetails(req, res) {
        try {
            const { userId } = req.params;

            const user = await User.findById(parseInt(userId), true);

            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }

            // Get user's active sessions
            const sessions = await tokenService.getUserSessions(user.id);

            // Get user's activity summary
            const activitySummary = await auditService.getUserActivitySummary(user.id);

            res.json({
                success: true,
                data: {
                    user: user.toJSON(),
                    security: user.getSecuritySummary(),
                    sessions: sessions,
                    activity_summary: activitySummary
                }
            });

        } catch (error) {
            console.error('Error getting user details:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to retrieve user details'
            });
        }
    }

    // Update user status (admin only)
    static async updateUserStatus(req, res) {
        try {
            const { userId } = req.params;
            const schema = joi.object({
                is_active: joi.boolean().optional(),
                is_verified: joi.boolean().optional()
            });

            const { error, value } = schema.validate(req.body);

            if (error) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid input data',
                    details: error.details.map(detail => detail.message)
                });
            }

            const user = await User.findById(parseInt(userId));

            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }

            // Prevent self-deactivation
            if (req.user.id === user.id && value.is_active === false) {
                return res.status(400).json({
                    success: false,
                    error: 'Cannot deactivate your own account'
                });
            }

            // Update user status
            await user.updateProfile(value, req.user.id);

            // If deactivating user, invalidate all their sessions
            if (value.is_active === false) {
                await tokenService.invalidateAllUserSessions(user.id);
            }

            // Log admin action
            await auditService.logEvent({
                user_id: req.user.id,
                event_type: 'user_status_updated',
                event_category: 'admin',
                success: true,
                ip_address: req.ip,
                user_agent: req.get('User-Agent'),
                resource_type: 'user',
                resource_id: user.id.toString(),
                metadata: {
                    target_user_id: user.id,
                    changes: value
                }
            });

            res.json({
                success: true,
                message: 'User status updated successfully',
                data: {
                    user: user.toJSON()
                }
            });

        } catch (error) {
            console.error('Error updating user status:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update user status'
            });
        }
    }

    // Assign role to user (admin only)
    static async assignRole(req, res) {
        try {
            const { userId } = req.params;
            const schema = joi.object({
                role_id: joi.number().integer().required(),
                expires_at: joi.date().optional()
            });

            const { error, value } = schema.validate(req.body);

            if (error) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid input data',
                    details: error.details.map(detail => detail.message)
                });
            }

            const user = await User.findById(parseInt(userId));
            const role = await Role.findById(value.role_id);

            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }

            if (!role) {
                return res.status(404).json({
                    success: false,
                    error: 'Role not found'
                });
            }

            // Assign role to user
            await user.assignRole(value.role_id, req.user.id, value.expires_at);

            // Log admin action
            await auditService.logEvent({
                user_id: req.user.id,
                event_type: 'role_assigned',
                event_category: 'admin',
                success: true,
                ip_address: req.ip,
                user_agent: req.get('User-Agent'),
                resource_type: 'user',
                resource_id: user.id.toString(),
                metadata: {
                    target_user_id: user.id,
                    assigned_role: role.name,
                    expires_at: value.expires_at
                }
            });

            res.json({
                success: true,
                message: 'Role assigned successfully'
            });

        } catch (error) {
            console.error('Error assigning role:', error);
            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }

    // Remove role from user (admin only)
    static async removeRole(req, res) {
        try {
            const { userId, roleId } = req.params;

            const user = await User.findById(parseInt(userId));
            const role = await Role.findById(parseInt(roleId));

            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }

            if (!role) {
                return res.status(404).json({
                    success: false,
                    error: 'Role not found'
                });
            }

            // Remove role from user
            await user.removeRole(parseInt(roleId));

            // Log admin action
            await auditService.logEvent({
                user_id: req.user.id,
                event_type: 'role_removed',
                event_category: 'admin',
                success: true,
                ip_address: req.ip,
                user_agent: req.get('User-Agent'),
                resource_type: 'user',
                resource_id: user.id.toString(),
                metadata: {
                    target_user_id: user.id,
                    removed_role: role.name
                }
            });

            res.json({
                success: true,
                message: 'Role removed successfully'
            });

        } catch (error) {
            console.error('Error removing role:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to remove role'
            });
        }
    }

    // Force logout user (admin only)
    static async forceLogout(req, res) {
        try {
            const { userId } = req.params;

            const user = await User.findById(parseInt(userId));

            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }

            // Invalidate all user sessions
            await tokenService.invalidateAllUserSessions(user.id);

            // Log admin action
            await auditService.logEvent({
                user_id: req.user.id,
                event_type: 'force_logout',
                event_category: 'admin',
                success: true,
                ip_address: req.ip,
                user_agent: req.get('User-Agent'),
                resource_type: 'user',
                resource_id: user.id.toString(),
                metadata: {
                    target_user_id: user.id
                }
            });

            res.json({
                success: true,
                message: 'User sessions terminated successfully'
            });

        } catch (error) {
            console.error('Error forcing logout:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to terminate user sessions'
            });
        }
    }

    // Get user statistics (admin only)
    static async getUserStatistics(req, res) {
        try {
            const stats = await User.getStatistics();

            res.json({
                success: true,
                data: stats
            });

        } catch (error) {
            console.error('Error getting user statistics:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to retrieve user statistics'
            });
        }
    }
}

module.exports = UserController;
