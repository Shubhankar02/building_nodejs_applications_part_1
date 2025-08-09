const db = require('../config/database');

class AuditService {
    // Log an audit event
    static async logEvent(eventData) {
        try {
            const {
                user_id = null,
                session_id = null,
                event_type,
                event_category,
                resource_type = null,
                resource_id = null,
                ip_address = null,
                user_agent = null,
                request_method = null,
                request_path = null,
                success = true,
                error_message = null,
                metadata = {}
            } = eventData;

            await db.query(`
                INSERT INTO audit_logs (
                    user_id, session_id, event_type, event_category,
                    resource_type, resource_id, ip_address, user_agent,
                    request_method, request_path, success, error_message, metadata
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            `, [
                user_id, session_id, event_type, event_category,
                resource_type, resource_id, ip_address, user_agent,
                request_method, request_path, success, error_message,
                JSON.stringify(metadata)
            ]);

        } catch (error) {
            // Don't throw errors for audit logging to prevent breaking main functionality
            console.error('Error logging audit event:', error);
        }
    }

    // Get audit logs with filtering and pagination
    static async getAuditLogs(filters = {}, page = 1, limit = 50) {
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

            // Get total count for pagination
            let countQuery = query.replace(/SELECT.*FROM/, 'SELECT COUNT(*) FROM')
                               .replace(/LEFT JOIN.*ON.*/, '')
                               .replace(/ORDER BY.*/, '')
                               .replace(/LIMIT.*/, '');

            const countResult = await db.query(countQuery, params);
            const totalCount = parseInt(countResult.rows[0].count);

            return {
                logs: result.rows.map(row => ({
                    ...row,
                    metadata: typeof row.metadata === 'string' ?
                        JSON.parse(row.metadata) : row.metadata
                })),
                pagination: {
                    page,
                    limit,
                    total: totalCount,
                    pages: Math.ceil(totalCount / limit)
                }
            };
        } catch (error) {
            console.error('Error getting audit logs:', error);
            throw error;
        }
    }

    // Get security alerts (failed logins, suspicious activities)
    static async getSecurityAlerts(days = 7) {
        try {
            const result = await db.query(`
                SELECT
                    event_type,
                    COUNT(*) as count,
                    array_agg(DISTINCT ip_address) as ip_addresses,
                    MAX(created_at) as latest_occurrence
                FROM audit_logs
                WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '${days} days'
                AND success = FALSE
                AND event_category IN ('authentication', 'authorization', 'security')
                GROUP BY event_type
                ORDER BY count DESC, latest_occurrence DESC
            `);

            return result.rows;
        } catch (error) {
            console.error('Error getting security alerts:', error);
            throw error;
        }
    }

    // Get user activity summary
    static async getUserActivitySummary(userId, days = 30) {
        try {
            const result = await db.query(`
                SELECT
                    event_category,
                    event_type,
                    COUNT(*) as count,
                    COUNT(CASE WHEN success THEN 1 END) as successful_count,
                    COUNT(CASE WHEN NOT success THEN 1 END) as failed_count,
                    MAX(created_at) as last_activity
                FROM audit_logs
                WHERE user_id = $1
                AND created_at >= CURRENT_TIMESTAMP - INTERVAL '${days} days'
                GROUP BY event_category, event_type
                ORDER BY last_activity DESC
            `, [userId]);

            return result.rows;
        } catch (error) {
            console.error('Error getting user activity summary:', error);
            throw error;
        }
    }

    // Get audit statistics
    static async getAuditStatistics(days = 30) {
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
}

module.exports = AuditService;
