const rateLimit = require('express-rate-limit');
const { RateLimiterRedis, RateLimiterMemory } = require('rate-limiter-flexible');
const redis = require('../config/redis');
const auditService = require('../services/auditService');

// Redis-based rate limiter for production
const createRedisRateLimiter = (options) => {
    return new RateLimiterRedis({
        storeClient: redis,
        keyPrefix: options.keyPrefix || 'rl',
        points: options.points || 5, // Number of requests
        duration: options.duration || 60, // Per duration in seconds
        blockDuration: options.blockDuration || 60, // Block for duration in seconds
        execEvenly: false // Disable evenly-executed delays to avoid added latency
    });
};

// Memory-based fallback rate limiter
const createMemoryRateLimiter = (options) => {
    return new RateLimiterMemory({
        keyPrefix: options.keyPrefix || 'rl',
        points: options.points || 5,
        duration: options.duration || 60,
        blockDuration: options.blockDuration || 60
    });
};

// Authentication rate limiting (increased limits for testing)
const authRateLimiter = redis ?
    createRedisRateLimiter({
        keyPrefix: 'auth',
        points: 100, // 100 attempts
        duration: 900, // Per 15 minutes
        blockDuration: 300 // Block for 5 minutes
    }) :
    createMemoryRateLimiter({
        keyPrefix: 'auth',
        points: 100,
        duration: 900,
        blockDuration: 300
    });

// Password reset rate limiting (increased for testing)
const passwordResetRateLimiter = redis ?
    createRedisRateLimiter({
        keyPrefix: 'pwd_reset',
        points: 20, // 20 attempts
        duration: 3600, // Per hour
        blockDuration: 900 // Block for 15 minutes
    }) :
    createMemoryRateLimiter({
        keyPrefix: 'pwd_reset',
        points: 20,
        duration: 3600,
        blockDuration: 900
    });

// Registration rate limiting (increased for testing)
const registrationRateLimiter = redis ?
    createRedisRateLimiter({
        keyPrefix: 'register',
        points: 20, // 20 registrations
        duration: 3600, // Per hour
        blockDuration: 900 // Block for 15 minutes
    }) :
    createMemoryRateLimiter({
        keyPrefix: 'register',
        points: 20,
        duration: 3600,
        blockDuration: 900
    });

// General API rate limiting (increased for testing)
const apiRateLimiter = redis ?
    createRedisRateLimiter({
        keyPrefix: 'api',
        points: 1000, // 1000 requests
        duration: 60, // Per minute
        blockDuration: 30 // Block for 30 seconds
    }) :
    createMemoryRateLimiter({
        keyPrefix: 'api',
        points: 1000,
        duration: 60,
        blockDuration: 30
    });

// Create rate limiting middleware
function createRateLimitMiddleware(rateLimiter, options = {}) {
    return async (req, res, next) => {
        try {
            // Bypass in development or when explicitly disabled
            if (process.env.NODE_ENV !== 'production' || process.env.RATE_LIMIT_DISABLED === 'true') {
                return next();
            }
            // Use IP address as the key, but could be enhanced with user ID for authenticated requests
            const key = req.user ? `user_${req.user.id}` : req.ip;

            await rateLimiter.consume(key);
            next();
        } catch (rejRes) {
            // Rate limit exceeded
            const secs = Math.round(rejRes.msBeforeNext / 1000) || 1;

            // Log rate limit violation
            await auditService.logEvent({
                user_id: req.user?.id,
                event_type: 'rate_limit_exceeded',
                event_category: 'security',
                success: false,
                error_message: `Rate limit exceeded for ${options.action || 'unknown action'}`,
                ip_address: req.ip,
                user_agent: req.get('User-Agent'),
                request_method: req.method,
                request_path: req.path,
                metadata: {
                    rate_limit_type: options.action,
                    retry_after_seconds: secs,
                    remaining_points: rejRes.remainingPoints || 0
                }
            });

            res.set('Retry-After', String(secs));
            res.status(429).json({
                success: false,
                error: 'Too many requests',
                code: 'RATE_LIMIT_EXCEEDED',
                retry_after: secs,
                message: `Rate limit exceeded. Try again in ${secs} seconds.`
            });
        }
    };
}

// Export configured rate limiting middleware
const authRateLimit = createRateLimitMiddleware(authRateLimiter, { action: 'authentication' });
const passwordResetRateLimit = createRateLimitMiddleware(passwordResetRateLimiter, { action: 'password_reset' });
const registrationRateLimit = createRateLimitMiddleware(registrationRateLimiter, { action: 'registration' });
const apiRateLimit = createRateLimitMiddleware(apiRateLimiter, { action: 'api_access' });

// Express-rate-limit based middleware for simple cases (increased for testing)
const simpleRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Limit each IP to 1000 requests per windowMs
    message: {
        success: false,
        error: 'Too many requests from this IP',
        code: 'RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true, // Return rate limit info in headers
    legacyHeaders: false,
    skip: (req) => {
        // Skip rate limiting for certain IPs or conditions
        const trustedIPs = ['127.0.0.1', '::1']; // localhost
        return trustedIPs.includes(req.ip);
    }
});

module.exports = {
    authRateLimit,
    passwordResetRateLimit,
    registrationRateLimit,
    apiRateLimit,
    simpleRateLimit,
    createRateLimitMiddleware
};
