const db = require('../config/database');

class Role {
    constructor(roleData) {
        this.id = roleData.id;
        this.name = roleData.name;
        this.description = roleData.description;
        this.is_system_role = roleData.is_system_role;
        this.is_default = roleData.is_default;
        this.parent_role_id = roleData.parent_role_id;
        this.level = roleData.level;
        this.created_at = roleData.created_at;
        this.updated_at = roleData.updated_at;
        this.created_by = roleData.created_by;
        this.updated_by = roleData.updated_by;
    }

    // Create a new role
    static async create(roleData, createdBy = null) {
        const {
            name,
            description,
            parent_role_id = null,
            is_default = false
        } = roleData;

        try {
            // Calculate level based on parent role
            let level = 0;
            if (parent_role_id) {
                const parentResult = await db.query(
                    'SELECT level FROM roles WHERE id = $1',
                    [parent_role_id]
                );
                if (parentResult.rows.length > 0) {
                    level = parentResult.rows[0].level + 1;
                }
            }

            const result = await db.query(`
                INSERT INTO roles (name, description, parent_role_id, level, is_default, created_by)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *
            `, [name, description, parent_role_id, level, is_default, createdBy]);

            return new Role(result.rows[0]);
        } catch (error) {
            if (error.code === '23505') {
                throw new Error('Role name already exists');
            }
            throw error;
        }
    }

    // Find role by ID
    static async findById(id) {
        try {
            const result = await db.query('SELECT * FROM roles WHERE id = $1', [id]);
            return result.rows.length > 0 ? new Role(result.rows[0]) : null;
        } catch (error) {
            console.error('Error finding role by ID:', error);
            throw error;
        }
    }

    // Find role by name
    static async findByName(name) {
        try {
            const result = await db.query('SELECT * FROM roles WHERE name = $1', [name]);
            return result.rows.length > 0 ? new Role(result.rows[0]) : null;
        } catch (error) {
            console.error('Error finding role by name:', error);
            throw error;
        }
    }

    // Get all roles with hierarchy
    static async getAll() {
        try {
            const result = await db.query(`
                SELECT * FROM roles
                ORDER BY level ASC, name ASC
            `);
            return result.rows.map(row => new Role(row));
        } catch (error) {
            console.error('Error getting all roles:', error);
            throw error;
        }
    }

    // Get role permissions
    async getPermissions() {
        try {
            const result = await db.query(`
                SELECT p.* FROM permissions p
                INNER JOIN role_permissions rp ON p.id = rp.permission_id
                WHERE rp.role_id = $1 AND rp.granted = TRUE
                ORDER BY p.category, p.name
            `, [this.id]);

            return result.rows;
        } catch (error) {
            console.error('Error getting role permissions:', error);
            throw error;
        }
    }

    // Add permission to role
    async addPermission(permissionId, grantedBy = null) {
        try {
            await db.query(`
                INSERT INTO role_permissions (role_id, permission_id, granted_by)
                VALUES ($1, $2, $3)
                ON CONFLICT (role_id, permission_id)
                DO UPDATE SET granted = TRUE, granted_by = $3
            `, [this.id, permissionId, grantedBy]);
        } catch (error) {
            console.error('Error adding permission to role:', error);
            throw error;
        }
    }

    // Remove permission from role
    async removePermission(permissionId) {
        try {
            await db.query(`
                UPDATE role_permissions
                SET granted = FALSE
                WHERE role_id = $1 AND permission_id = $2
            `, [this.id, permissionId]);
        } catch (error) {
            console.error('Error removing permission from role:', error);
            throw error;
        }
    }

    // Get users with this role
    async getUsers() {
        try {
            const result = await db.query(`
                SELECT u.id, u.email, u.username, u.first_name, u.last_name,
                       ur.assigned_at, ur.expires_at, ur.is_active
                FROM users u
                INNER JOIN user_roles ur ON u.id = ur.user_id
                WHERE ur.role_id = $1
                ORDER BY ur.assigned_at DESC
            `, [this.id]);

            return result.rows;
        } catch (error) {
            console.error('Error getting role users:', error);
            throw error;
        }
    }

    // Update role information
    async update(updateData, updatedBy = null) {
        try {
            const allowedFields = ['name', 'description', 'is_default'];
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

            paramCount++;
            updates.push(`updated_by = $${paramCount}`);
            values.push(updatedBy);

            paramCount++;
            values.push(this.id);

            const query = `
                UPDATE roles
                SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
                WHERE id = $${paramCount}
                RETURNING *
            `;

            const result = await db.query(query, values);

            if (result.rows.length > 0) {
                Object.assign(this, result.rows[0]);
            }

            return this;
        } catch (error) {
            console.error('Error updating role:', error);
            throw error;
        }
    }

    // Delete role (only if not system role and no users assigned)
    async delete() {
        try {
            if (this.is_system_role) {
                throw new Error('Cannot delete system role');
            }

            // Check if any users have this role
            const userCount = await db.query(
                'SELECT COUNT(*) FROM user_roles WHERE role_id = $1 AND is_active = TRUE',
                [this.id]
            );

            if (parseInt(userCount.rows[0].count) > 0) {
                throw new Error('Cannot delete role that is assigned to users');
            }

            await db.query('DELETE FROM roles WHERE id = $1', [this.id]);
            return true;
        } catch (error) {
            console.error('Error deleting role:', error);
            throw error;
        }
    }

    // Convert to JSON
    toJSON() {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            is_system_role: this.is_system_role,
            is_default: this.is_default,
            parent_role_id: this.parent_role_id,
            level: this.level,
            created_at: this.created_at,
            updated_at: this.updated_at,
            permissions: this.permissions // Include if loaded
        };
    }
}

module.exports = Role;
