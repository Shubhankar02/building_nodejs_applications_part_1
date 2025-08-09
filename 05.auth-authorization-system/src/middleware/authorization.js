const User = require('../models/User');
const auditService = require('../services/auditService');

// Authorization middleware factory for role-based access control
function requirePermission(permissionName, options = {}) {
    return async (req, res, next) => {
        try {
            // Check if user is authenticated
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    error: 'Authentication required',
                    code: 'AUTH_REQUIRED'
                });
            }

            // Load user with roles and permissions if not already loaded
            let user = req.user;
            if (!user.permissions) {
                user = await User.findById(req.user.id, true);
                if (!user) {
                    return res.status(401).json({
                        success: false,
                        error: 'User not found',
                        code: 'USER_NOT_FOUND'
                    });
                }
                req.user = user; // Update request with full user data
            }

            // Check if user has required permission
            const hasPermission = await user.hasPermission(permissionName);

            if (!hasPermission) {
                // Log authorization failure
                await auditService.logEvent({
                    user_id: user.id,
                    session_id: req.session?.id,
                    event_type: 'authorization_denied',
                    event_category: 'authorization',
                    success: false,
                    error_message: `Missing permission: ${permissionName}`,
                    ip_address: req.ip,
                    user_agent: req.get('User-Agent'),
                    request_method: req.method,
                    request_path: req.path,
                    metadata: {
                        required_permission: permissionName,
                        user_permissions: user.permissions?.map(p => p.name) || []
                    }
                });

                return res.status(403).json({
                    success: false,
                    error: 'Insufficient permissions',
                    code: 'INSUFFICIENT_PERMISSIONS',
                    required_permission: permissionName
                });
            }

            // Log successful authorization if configured
            if (options.logSuccess) {
                await auditService.logEvent({
                    user_id: user.id,
                    session_id: req.session?.id,
                    event_type: 'authorization_granted',
                    event_category: 'authorization',
                    success: true,
                    ip_address: req.ip,
                    user_agent: req.get('User-Agent'),
                    request_method: req.method,
                    request_path: req.path,
                    metadata: {
                        granted_permission: permissionName
                    }
                });
            }

            next();
        } catch (error) {
            console.error('Authorization middleware error:', error);

            await auditService.logEvent({
                user_id: req.user?.id,
                event_type: 'authorization_error',
                event_category: 'authorization',
                success: false,
                error_message: error.message,
                ip_address: req.ip,
                user_agent: req.get('User-Agent'),
                request_method: req.method,
                request_path: req.path
            });

            res.status(500).json({
                success: false,
                error: 'Authorization check failed',
                code: 'AUTHORIZATION_ERROR'
            });
        }
    };
}

// Middleware to require specific role
function requireRole(roleName) {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    error: 'Authentication required'
                });
            }

            // Load user roles if not already loaded
            let user = req.user;
            if (!user.roles) {
                user = await User.findById(req.user.id, true);
                req.user = user;
            }

            // Check if user has required role
            const hasRole = user.roles?.some(role => role.name === roleName);

            if (!hasRole) {
                await auditService.logEvent({
                    user_id: user.id,
                    event_type: 'role_check_failed',
                    event_category: 'authorization',
                    success: false,
                    error_message: `Missing role: ${roleName}`,
                    ip_address: req.ip,
                    user_agent: req.get('User-Agent'),
                    metadata: {
                        required_role: roleName,
                        user_roles: user.roles?.map(r => r.name) || []
                    }
                });

                return res.status(403).json({
                    success: false,
                    error: 'Insufficient role privileges',
                    required_role: roleName
                });
            }

            next();
        } catch (error) {
            console.error('Role check error:', error);
            res.status(500).json({
                success: false,
                error: 'Role verification failed'
            });
        }
    };
}

// Middleware for resource ownership validation
function requireOwnership(resourceIdParam = 'id', resourceType = 'resource') {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    error: 'Authentication required'
                });
            }

            const resourceId = req.params[resourceIdParam];
            const userId = req.user.id;

            // This is a generic ownership check - in practice, you'd implement
            // specific ownership validation for each resource type
            // For now, we'll check if the resource belongs to the user

            // Add resource ownership to request for use by controllers
            req.resourceOwnership = {
                resourceId,
                userId,
                isOwner: resourceId === userId.toString() // Simple check for demo
            };

            next();
        } catch (error) {
            console.error('Ownership check error:', error);
            res.status(500).json({
                success: false,
                error: 'Ownership verification failed'
            });
        }
    };
}

// Middleware to check multiple permission options (OR logic)
function requireAnyPermission(permissions) {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    error: 'Authentication required'
                });
            }

            let user = req.user;
            if (!user.permissions) {
                user = await User.findById(req.user.id, true);
                req.user = user;
            }

            // Check if user has any of the required permissions
            const hasAnyPermission = await Promise.all(
                permissions.map(permission => user.hasPermission(permission))
            );

            if (!hasAnyPermission.some(Boolean)) {
                await auditService.logEvent({
                    user_id: user.id,
                    event_type: 'authorization_denied',
                    event_category: 'authorization',
                    success: false,
                    error_message: `Missing any of permissions: ${permissions.join(', ')}`,
                    ip_address: req.ip,
                    user_agent: req.get('User-Agent'),
                    metadata: {
                        required_permissions: permissions,
                        user_permissions: user.permissions?.map(p => p.name) || []
                    }
                });

                return res.status(403).json({
                    success: false,
                    error: 'Insufficient permissions',
                    required_any_of: permissions
                });
            }

            next();
        } catch (error) {
            console.error('Multiple permission check error:', error);
            res.status(500).json({
                success: false,
                error: 'Permission verification failed'
            });
        }
    };
}

// Admin-only middleware (super admin or admin role)
const requireAdmin = requireAnyPermission(['system.admin', 'system.config']);

// Moderator or higher middleware
const requireModerator = requireAnyPermission(['content.moderate', 'system.admin']);

module.exports = {
    requirePermission,
    requireRole,
    requireOwnership,
    requireAnyPermission,
    requireAdmin,
    requireModerator
};
