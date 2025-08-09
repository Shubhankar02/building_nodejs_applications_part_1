const Role = require('../models/Role');
const Permission = require('../models/Permission');
const auditService = require('../services/auditService');
const joi = require('joi');

class RoleController {
    // Get all roles
    static async getAllRoles(req, res) {
        try {
            const roles = await Role.getAll();

            // Load permissions for each role
            const rolesWithPermissions = await Promise.all(
                roles.map(async (role) => {
                    const permissions = await role.getPermissions();
                    return {
                        ...role.toJSON(),
                        permissions: permissions
                    };
                })
            );

            res.json({
                success: true,
                data: {
                    roles: rolesWithPermissions
                }
            });

        } catch (error) {
            console.error('Error getting all roles:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to retrieve roles'
            });
        }
    }

    // Create a new role
    static async createRole(req, res) {
        try {
            const schema = joi.object({
                name: joi.string().min(2).max(100).required(),
                description: joi.string().max(500).optional(),
                parent_role_id: joi.number().integer().optional(),
                is_default: joi.boolean().default(false)
            });

            const { error, value } = schema.validate(req.body);

            if (error) {
                return res.status(400).json({
                    success: false,
                    error: 'Validation failed',
                    details: error.details.map(detail => detail.message)
                });
            }

            // Check if role name already exists
            const existingRole = await Role.findByName(value.name);
            if (existingRole) {
                return res.status(409).json({
                    success: false,
                    error: 'Role name already exists'
                });
            }

            // Create the role
            const role = await Role.create(value, req.user.id);

            // Log the action
            await auditService.logEvent({
                user_id: req.user.id,
                event_type: 'role_created',
                event_category: 'admin',
                success: true,
                ip_address: req.ip,
                user_agent: req.get('User-Agent'),
                resource_type: 'role',
                resource_id: role.id.toString(),
                metadata: {
                    role_name: role.name,
                    role_description: role.description
                }
            });

            res.status(201).json({
                success: true,
                message: 'Role created successfully',
                data: {
                    role: role.toJSON()
                }
            });

        } catch (error) {
            console.error('Error creating role:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to create role',
                details: error.message
            });
        }
    }

    // Get role details
    static async getRoleDetails(req, res) {
        try {
            const roleId = parseInt(req.params.roleId);

            if (isNaN(roleId)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid role ID'
                });
            }

            const role = await Role.findById(roleId);

            if (!role) {
                return res.status(404).json({
                    success: false,
                    error: 'Role not found'
                });
            }

            // Load permissions and users for this role
            const permissions = await role.getPermissions();
            const users = await role.getUsers();

            res.json({
                success: true,
                data: {
                    role: {
                        ...role.toJSON(),
                        permissions: permissions,
                        users: users
                    }
                }
            });

        } catch (error) {
            console.error('Error getting role details:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to retrieve role details'
            });
        }
    }

    // Update role
    static async updateRole(req, res) {
        try {
            const roleId = parseInt(req.params.roleId);

            if (isNaN(roleId)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid role ID'
                });
            }

            const schema = joi.object({
                name: joi.string().min(2).max(100).optional(),
                description: joi.string().max(500).optional(),
                is_default: joi.boolean().optional()
            });

            const { error, value } = schema.validate(req.body);

            if (error) {
                return res.status(400).json({
                    success: false,
                    error: 'Validation failed',
                    details: error.details.map(detail => detail.message)
                });
            }

            const role = await Role.findById(roleId);

            if (!role) {
                return res.status(404).json({
                    success: false,
                    error: 'Role not found'
                });
            }

            // Check if it's a system role
            if (role.is_system_role) {
                return res.status(403).json({
                    success: false,
                    error: 'Cannot modify system role'
                });
            }

            // Check if new name conflicts with existing role
            if (value.name && value.name !== role.name) {
                const existingRole = await Role.findByName(value.name);
                if (existingRole) {
                    return res.status(409).json({
                        success: false,
                        error: 'Role name already exists'
                    });
                }
            }

            // Update the role
            const updatedRole = await role.update(value, req.user.id);

            // Log the action
            await auditService.logEvent({
                user_id: req.user.id,
                event_type: 'role_updated',
                event_category: 'admin',
                success: true,
                ip_address: req.ip,
                user_agent: req.get('User-Agent'),
                resource_type: 'role',
                resource_id: role.id.toString(),
                metadata: {
                    role_name: role.name,
                    changes: value
                }
            });

            res.json({
                success: true,
                message: 'Role updated successfully',
                data: {
                    role: updatedRole.toJSON()
                }
            });

        } catch (error) {
            console.error('Error updating role:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update role',
                details: error.message
            });
        }
    }

    // Delete role
    static async deleteRole(req, res) {
        try {
            const roleId = parseInt(req.params.roleId);

            if (isNaN(roleId)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid role ID'
                });
            }

            const role = await Role.findById(roleId);

            if (!role) {
                return res.status(404).json({
                    success: false,
                    error: 'Role not found'
                });
            }

            // Check if it's a system role
            if (role.is_system_role) {
                return res.status(403).json({
                    success: false,
                    error: 'Cannot delete system role'
                });
            }

            // Delete the role
            const deleted = await role.delete();

            if (!deleted) {
                return res.status(400).json({
                    success: false,
                    error: 'Role cannot be deleted (may have assigned users)'
                });
            }

            // Log the action
            await auditService.logEvent({
                user_id: req.user.id,
                event_type: 'role_deleted',
                event_category: 'admin',
                success: true,
                ip_address: req.ip,
                user_agent: req.get('User-Agent'),
                resource_type: 'role',
                resource_id: role.id.toString(),
                metadata: {
                    role_name: role.name
                }
            });

            res.json({
                success: true,
                message: 'Role deleted successfully'
            });

        } catch (error) {
            console.error('Error deleting role:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to delete role',
                details: error.message
            });
        }
    }

    // Assign permission to role
    static async assignPermission(req, res) {
        try {
            const roleId = parseInt(req.params.roleId);
            const { permission_id } = req.body;

            if (isNaN(roleId)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid role ID'
                });
            }

            const role = await Role.findById(roleId);
            const permission = await Permission.findById(permission_id);

            if (!role) {
                return res.status(404).json({
                    success: false,
                    error: 'Role not found'
                });
            }

            if (!permission) {
                return res.status(404).json({
                    success: false,
                    error: 'Permission not found'
                });
            }

            // Assign permission to role
            await role.addPermission(permission_id, req.user.id);

            // Log the action
            await auditService.logEvent({
                user_id: req.user.id,
                event_type: 'permission_assigned',
                event_category: 'admin',
                success: true,
                ip_address: req.ip,
                user_agent: req.get('User-Agent'),
                resource_type: 'role',
                resource_id: role.id.toString(),
                metadata: {
                    role_name: role.name,
                    permission_name: permission.name
                }
            });

            res.json({
                success: true,
                message: 'Permission assigned successfully'
            });

        } catch (error) {
            console.error('Error assigning permission:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to assign permission',
                details: error.message
            });
        }
    }

    // Remove permission from role
    static async removePermission(req, res) {
        try {
            const roleId = parseInt(req.params.roleId);
            const permissionId = parseInt(req.params.permissionId);

            if (isNaN(roleId) || isNaN(permissionId)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid role ID or permission ID'
                });
            }

            const role = await Role.findById(roleId);
            const permission = await Permission.findById(permissionId);

            if (!role) {
                return res.status(404).json({
                    success: false,
                    error: 'Role not found'
                });
            }

            if (!permission) {
                return res.status(404).json({
                    success: false,
                    error: 'Permission not found'
                });
            }

            // Remove permission from role
            await role.removePermission(permissionId);

            // Log the action
            await auditService.logEvent({
                user_id: req.user.id,
                event_type: 'permission_removed',
                event_category: 'admin',
                success: true,
                ip_address: req.ip,
                user_agent: req.get('User-Agent'),
                resource_type: 'role',
                resource_id: role.id.toString(),
                metadata: {
                    role_name: role.name,
                    permission_name: permission.name
                }
            });

            res.json({
                success: true,
                message: 'Permission removed successfully'
            });

        } catch (error) {
            console.error('Error removing permission:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to remove permission',
                details: error.message
            });
        }
    }

    // Get all permissions
    static async getAllPermissions(req, res) {
        try {
            const permissions = await Permission.getAll(true); // Group by category

            res.json({
                success: true,
                data: {
                    permissions: permissions
                }
            });

        } catch (error) {
            console.error('Error getting all permissions:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to retrieve permissions'
            });
        }
    }

    // Create a new permission
    static async createPermission(req, res) {
        try {
            const schema = joi.object({
                name: joi.string().min(2).max(100).required(),
                description: joi.string().max(500).optional(),
                resource: joi.string().min(2).max(100).required(),
                action: joi.string().min(2).max(50).required(),
                category: joi.string().min(2).max(50).default('general')
            });

            const { error, value } = schema.validate(req.body);

            if (error) {
                return res.status(400).json({
                    success: false,
                    error: 'Validation failed',
                    details: error.details.map(detail => detail.message)
                });
            }

            // Check if permission name already exists
            const existingPermission = await Permission.findByName(value.name);
            if (existingPermission) {
                return res.status(409).json({
                    success: false,
                    error: 'Permission name already exists'
                });
            }

            // Create the permission
            const permission = await Permission.create(value, req.user.id);

            // Log the action
            await auditService.logEvent({
                user_id: req.user.id,
                event_type: 'permission_created',
                event_category: 'admin',
                success: true,
                ip_address: req.ip,
                user_agent: req.get('User-Agent'),
                resource_type: 'permission',
                resource_id: permission.id.toString(),
                metadata: {
                    permission_name: permission.name,
                    resource: permission.resource,
                    action: permission.action
                }
            });

            res.status(201).json({
                success: true,
                message: 'Permission created successfully',
                data: {
                    permission: permission.toJSON()
                }
            });

        } catch (error) {
            console.error('Error creating permission:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to create permission',
                details: error.message
            });
        }
    }
}

module.exports = RoleController;