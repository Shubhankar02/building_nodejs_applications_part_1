const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/database');
const redis = require('../config/redis');

class TokenService {
    // Generate JWT access token
    static async generateAccessToken(user, expiresIn = '1d') {
        try {
            const payload = {
                userId: user.id,
                email: user.email,
                tokenType: 'access',
                iat: Math.floor(Date.now() / 1000)
            };

            const token = jwt.sign(payload, process.env.JWT_SECRET, {
                expiresIn,
                issuer: 'auth-system',
                audience: 'auth-system-users'
            });

            return token;
        } catch (error) {
            console.error('Error generating access token:', error);
            throw error;
        }
    }

    // Generate refresh token
    static async generateRefreshToken(user) {
        try {
            const refreshToken = crypto.randomBytes(64).toString('hex');

            // Store refresh token hash in database for security
            const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

            return {
                token: refreshToken,
                hash: tokenHash
            };
        } catch (error) {
            console.error('Error generating refresh token:', error);
            throw error;
        }
    }

    // Create user session
    static async createSession(sessionData) {
        try {
            const {
                user_id,
                access_token,
                refresh_token,
                device_info = {},
                ip_address,
                user_agent,
                is_remembered = false
            } = sessionData;

            // Calculate expiration based on remember me option
            const expirationHours = is_remembered ? 24 * 30 : 24; // 30 days or 1 day
            const expiresAt = new Date(Date.now() + expirationHours * 60 * 60 * 1000);

            // Hash the refresh token for storage
            const refreshTokenHash = crypto.createHash('sha256')
                .update(refresh_token.token || refresh_token)
                .digest('hex');

            const result = await db.query(`
                INSERT INTO user_sessions (
                    user_id, session_token, refresh_token, device_info,
                    ip_address, user_agent, expires_at, is_remembered
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING *
            `, [
                user_id,
                access_token,
                refreshTokenHash,
                JSON.stringify(device_info),
                ip_address,
                user_agent,
                expiresAt,
                is_remembered
            ]);

            // Cache session in Redis for fast lookup
            if (redis) {
                const sessionKey = `session:${access_token}`;
                await redis.setex(sessionKey, expirationHours * 3600, JSON.stringify({
                    id: result.rows[0].id,
                    user_id: result.rows[0].user_id,
                    is_active: true,
                    expires_at: result.rows[0].expires_at
                }));
            }

            return result.rows[0];
        } catch (error) {
            console.error('Error creating session:', error);
            throw error;
        }
    }

    // Find session by token
    static async findSessionByToken(token) {
        try {
            // Try Redis cache first
            if (redis) {
                const sessionKey = `session:${token}`;
                const cachedSession = await redis.get(sessionKey);
                if (cachedSession) {
                    const session = JSON.parse(cachedSession);
                    // Verify session is still valid
                    if (new Date(session.expires_at) > new Date() && session.is_active) {
                        return session;
                    }
                }
            }

            // Fall back to database
            const result = await db.query(`
                SELECT * FROM user_sessions
                WHERE session_token = $1
                AND is_active = TRUE
                AND expires_at > CURRENT_TIMESTAMP
                AND force_logout = FALSE
            `, [token]);

            if (result.rows.length === 0) {
                return null;
            }

            const session = result.rows[0];

            // Update cache
            if (redis) {
                const sessionKey = `session:${token}`;
                const expirationSeconds = Math.floor((new Date(session.expires_at) - new Date()) / 1000);
                await redis.setex(sessionKey, expirationSeconds, JSON.stringify(session));
            }

            return session;
        } catch (error) {
            console.error('Error finding session by token:', error);
            throw error;
        }
    }

    // Verify refresh token
    static async verifyRefreshToken(refreshToken) {
        try {
            const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

            const result = await db.query(`
                SELECT * FROM user_sessions
                WHERE refresh_token = $1
                AND is_active = TRUE
                AND expires_at > CURRENT_TIMESTAMP
            `, [tokenHash]);

            return result.rows.length > 0 ? result.rows[0] : null;
        } catch (error) {
            console.error('Error verifying refresh token:', error);
            throw error;
        }
    }

    // Update session last accessed time
    static async updateSessionLastAccessed(sessionId, ipAddress) {
        try {
            await db.query(`
                UPDATE user_sessions
                SET last_accessed = CURRENT_TIMESTAMP,
                    ip_address = $2
                WHERE id = $1
            `, [sessionId, ipAddress]);

            // Update cache if using Redis
            if (redis) {
                const session = await db.query('SELECT session_token FROM user_sessions WHERE id = $1', [sessionId]);
                if (session.rows.length > 0) {
                    const sessionKey = `session:${session.rows[0].session_token}`;
                    const cachedSession = await redis.get(sessionKey);
                    if (cachedSession) {
                        const sessionData = JSON.parse(cachedSession);
                        sessionData.last_accessed = new Date().toISOString();
                        const ttl = await redis.ttl(sessionKey);
                        await redis.setex(sessionKey, ttl, JSON.stringify(sessionData));
                    }
                }
            }
        } catch (error) {
            console.error('Error updating session last accessed:', error);
            throw error;
        }
    }

    // Invalidate session
    static async invalidateSession(sessionId) {
        try {
            // Get session token for cache invalidation
            const sessionResult = await db.query(
                'SELECT session_token FROM user_sessions WHERE id = $1',
                [sessionId]
            );

            // Update database
            await db.query(`
                UPDATE user_sessions
                SET is_active = FALSE
                WHERE id = $1
            `, [sessionId]);

            // Remove from cache
            if (redis && sessionResult.rows.length > 0) {
                const sessionKey = `session:${sessionResult.rows[0].session_token}`;
                await redis.del(sessionKey);
            }
        } catch (error) {
            console.error('Error invalidating session:', error);
            throw error;
        }
    }

    // Invalidate all user sessions
    static async invalidateAllUserSessions(userId) {
        try {
            // Get all session tokens for cache invalidation
            const sessionsResult = await db.query(
                'SELECT session_token FROM user_sessions WHERE user_id = $1 AND is_active = TRUE',
                [userId]
            );

            // Update database
            await db.query(`
                UPDATE user_sessions
                SET is_active = FALSE
                WHERE user_id = $1
            `, [userId]);

            // Remove from cache
            if (redis) {
                const deletePromises = sessionsResult.rows.map(row =>
                    redis.del(`session:${row.session_token}`)
                );
                await Promise.all(deletePromises);
            }
        } catch (error) {
            console.error('Error invalidating all user sessions:', error);
            throw error;
        }
    }

    // Invalidate all sessions except one
    static async invalidateAllUserSessionsExcept(userId, exceptSessionId) {
        try {
            // Get session tokens to invalidate
            const sessionsResult = await db.query(`
                SELECT session_token FROM user_sessions
                WHERE user_id = $1 AND is_active = TRUE AND id != $2
            `, [userId, exceptSessionId]);

            // Update database
            await db.query(`
                UPDATE user_sessions
                SET is_active = FALSE
                WHERE user_id = $1 AND id != $2
            `, [userId, exceptSessionId]);

            // Remove from cache
            if (redis) {
                const deletePromises = sessionsResult.rows.map(row =>
                    redis.del(`session:${row.session_token}`)
                );
                await Promise.all(deletePromises);
            }
        } catch (error) {
            console.error('Error invalidating user sessions except one:', error);
            throw error;
        }
    }

    // Clean up expired sessions
    static async cleanupExpiredSessions() {
        try {
            // Get expired session tokens for cache cleanup
            const expiredSessions = await db.query(`
                SELECT session_token FROM user_sessions
                WHERE expires_at < CURRENT_TIMESTAMP OR force_logout = TRUE
            `);

            // Delete expired sessions from database
            const result = await db.query(`
                DELETE FROM user_sessions
                WHERE expires_at < CURRENT_TIMESTAMP OR force_logout = TRUE
            `);

            // Clean up cache
            if (redis && expiredSessions.rows.length > 0) {
                const deletePromises = expiredSessions.rows.map(row =>
                    redis.del(`session:${row.session_token}`)
                );
                await Promise.all(deletePromises);
            }

            console.log(`Cleaned up ${result.rowCount} expired sessions`);
            return result.rowCount;
        } catch (error) {
            console.error('Error cleaning up expired sessions:', error);
            throw error;
        }
    }

    // Get user's active sessions
    static async getUserSessions(userId) {
        try {
            const result = await db.query(`
                SELECT
                    id, device_info, ip_address, user_agent,
                    created_at, last_accessed, expires_at, is_remembered
                FROM user_sessions
                WHERE user_id = $1 AND is_active = TRUE
                ORDER BY last_accessed DESC
            `, [userId]);

            return result.rows.map(session => ({
                ...session,
                device_info: typeof session.device_info === 'string' ?
                    JSON.parse(session.device_info) : session.device_info,
                is_current: false // This would be set by comparing with current session
            }));
        } catch (error) {
            console.error('Error getting user sessions:', error);
            throw error;
        }
    }
}

module.exports = TokenService;
