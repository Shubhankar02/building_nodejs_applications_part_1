const db = require('../config/database');

class AuditLog {
    constructor(logData) {
        this.id = logData.id;
        this.user_id = logData.user_id;
        this.session_id = logData.session_id;
        this.event_type = logData.event_type;
        this.event_category = logData.event_category;
        this.resource_type = logData.resource_type;
        this.resource_id = logData.resource_id;
        this.ip_address = logData.ip_address;
        this.user_agent = logData.user_agent;
        this.request_method = logData.request_method;
        this.request_path = logData.request_path;
        this.success = logData.success;
        this.error_message = logData.error_message;
        this.metadata = logData.metadata;
        this.created_at = logData.created_at;
    }

    // Find audit logs with filtering
    static async findWithFilters(filters = {}, page = 1, limit = 50) {
        try {
            const {
                user_id,
                event_type,
                event_category,
                success,
                start_date,
                end_date,
                ip_address
            } = filters;

            let query = `
                SELECT
                    al.*,
                    u.email as user_email,
                    u.first_name,
                    u.last_name
                FROM audit_logs al
                LEFT JOIN users u ON al.user_id = u.id
                WHERE 1=1
            `;

            const params = [];
            let paramCount = 0;

            if (user_id) {
                paramCount++;
                query += ` AND al.user_id = ${paramCount}`;
                params.push(user_id);
            }

            if (event_type) {
                paramCount++;
                query += ` AND al.event_type = ${paramCount}`;
                params.push(event_type);
            }

            if (event_category) {
                paramCount++;
                query += ` AND al.event_category = ${paramCount}`;
                params.push(event_category);
            }

            if (success !== undefined) {
                paramCount++;
                query += ` AND al.success = ${paramCount}`;
                params.push(success);
            }

            if (start_date) {
                paramCount++;
                query += ` AND al.created_at >= ${paramCount}`;
                params.push(start_date);
            }

            if (end_date) {
                paramCount++;
                query += ` AND al.created_at <= ${paramCount}`;
                params.push(end_date);
            }

            if (ip_address) {
                paramCount++;
                query += ` AND al.ip_address = ${paramCount}`;
                params.push(ip_address);
            }

            query += ` ORDER BY al.created_at DESC`;
            query += ` LIMIT ${limit} OFFSET ${(page - 1) * limit}`;

            const result = await db.query(query, params);

            return result.rows.map(row => {
                const log = new AuditLog(row);
                log.user_email = row.user_email;
                log.user_name = row.first_name && row.last_name ?
                    `${row.first_name} ${row.last_name}` : null;
                return log;
            });
        } catch (error) {
            console.error('Error finding audit logs:', error);
            throw error;
        }
    }

    // Get audit log statistics
    static async getStatistics(days = 30) {
        try {
            const result = await db.query(`
                SELECT
                    COUNT(*) as total_events,
                    COUNT(CASE WHEN success THEN 1 END) as successful_events,
                    COUNT(CASE WHEN NOT success THEN 1 END) as failed_events,
                    COUNT(DISTINCT user_id) as unique_users,
                    COUNT(DISTINCT ip_address) as unique_ips,
                    COUNT(CASE WHEN event_category = 'authentication' THEN 1 END) as auth_events,
                    COUNT(CASE WHEN event_category = 'authorization' THEN 1 END) as authz_events,
                    COUNT(CASE WHEN event_category = 'security' THEN 1 END) as security_events
                FROM audit_logs
                WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '${days} days'
            `);

            return result.rows[0];
        } catch (error) {
            console.error('Error getting audit statistics:', error);
            throw error;
        }
    }

    // Convert to JSON
    toJSON() {
        return {
            id: this.id,
            user_id: this.user_id,
            session_id: this.session_id,
            event_type: this.event_type,
            event_category: this.event_category,
            resource_type: this.resource_type,
            resource_id: this.resource_id,
            ip_address: this.ip_address,
            user_agent: this.user_agent,
            request_method: this.request_method,
            request_path: this.request_path,
            success: this.success,
            error_message: this.error_message,
            metadata: typeof this.metadata === 'string' ?
                JSON.parse(this.metadata) : this.metadata,
            created_at: this.created_at,
            // Include user information if available
            user_email: this.user_email,
            user_name: this.user_name
        };
    }
}

module.exports = AuditLog;