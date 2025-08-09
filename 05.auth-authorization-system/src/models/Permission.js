const db = require('../config/database');

class Permission {
    constructor(permissionData) {
        this.id = permissionData.id;
        this.name = permissionData.name;
        this.description = permissionData.description;
        this.resource = permissionData.resource;
        this.action = permissionData.action;
        this.category = permissionData.category;
        this.is_system_permission = permissionData.is_system_permission;
        this.created_at = permissionData.created_at;
        this.created_by = permissionData.created_by;
    }

    // Create a new permission
    static async create(permissionData, createdBy = null) {
        const {
            name,
            description,
            resource,
            action,
            category = 'general'
        } = permissionData;

        try {
            const result = await db.query(`
                INSERT INTO permissions (name, description, resource, action, category, created_by)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *
            `, [name, description, resource, action, category, createdBy]);

            return new Permission(result.rows[0]);
        } catch (error) {
            if (error.code === '23505') {
                throw new Error('Permission name already exists');
            }
            throw error;
        }
    }

    // Find permission by ID
    static async findById(id) {
        try {
            const result = await db.query('SELECT * FROM permissions WHERE id = $1', [id]);
            return result.rows.length > 0 ? new Permission(result.rows[0]) : null;
        } catch (error) {
            console.error('Error finding permission by ID:', error);
            throw error;
        }
    }

    // Find permission by name
    static async findByName(name) {
        try {
            const result = await db.query('SELECT * FROM permissions WHERE name = $1', [name]);
            return result.rows.length > 0 ? new Permission(result.rows[0]) : null;
        } catch (error) {
            console.error('Error finding permission by name:', error);
            throw error;
        }
    }

    // Get all permissions grouped by category
    static async getAll(groupByCategory = false) {
        try {
            const result = await db.query(`
                SELECT * FROM permissions
                ORDER BY category, resource, action
            `);

            if (!groupByCategory) {
                return result.rows.map(row => new Permission(row));
            }

            // Group permissions by category
            const groupedPermissions = {};
            result.rows.forEach(row => {
                const permission = new Permission(row);
                if (!groupedPermissions[permission.category]) {
                    groupedPermissions[permission.category] = [];
                }
                groupedPermissions[permission.category].push(permission);
            });

            return groupedPermissions;
        } catch (error) {
            console.error('Error getting all permissions:', error);
            throw error;
        }
    }

    // Get permissions by resource
    static async getByResource(resource) {
        try {
            const result = await db.query(
                'SELECT * FROM permissions WHERE resource = $1 ORDER BY action',
                [resource]
            );
            return result.rows.map(row => new Permission(row));
        } catch (error) {
            console.error('Error getting permissions by resource:', error);
            throw error;
        }
    }

    // Delete permission (only if not system permission)
    async delete() {
        try {
            if (this.is_system_permission) {
                throw new Error('Cannot delete system permission');
            }

            await db.query('DELETE FROM permissions WHERE id = $1', [this.id]);
            return true;
        } catch (error) {
            console.error('Error deleting permission:', error);
            throw error;
        }
    }

    // Convert to JSON
    toJSON() {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            resource: this.resource,
            action: this.action,
            category: this.category,
            is_system_permission: this.is_system_permission,
            created_at: this.created_at
        };
    }
}

module.exports = Permission;
