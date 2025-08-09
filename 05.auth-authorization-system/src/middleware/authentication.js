const jwt = require('jsonwebtoken');
const User = require('../models/User');
const tokenService = require('../services/tokenService');
const auditService = require('../services/auditService');

// Main authentication middleware
async function authenticateToken(req, res, next) {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Extract Bearer token

        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Access token is required',
                code: 'TOKEN_MISSING'
            });
        }

        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Check if session is still valid
        const session = await tokenService.findSessionByToken(token);
        if (!session || !session.is_active || session.force_logout) {
            return res.status(401).json({
                success: false,
                error: 'Session is invalid or expired',
                code: 'SESSION_INVALID'
            });
        }

        // Get user and verify account status
        const user = await User.findById(decoded.userId);
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }

        if (!user.is_active) {
            return res.status(401).json({
                success: false,
                error: 'Account is deactivated',
                code: 'ACCOUNT_DEACTIVATED'
            });
        }

        if (user.isAccountLocked()) {
            return res.status(401).json({
                success: false,
                error: 'Account is temporarily locked',
                code: 'ACCOUNT_LOCKED'
            });
        }

        // Update session last accessed time
        await tokenService.updateSessionLastAccessed(session.id, req.ip);

        // Attach user and session to request
        req.user = user;
        req.session = session;
        req.token = token;

        next();
    } catch (error) {
        console.error('Authentication error:', error);

        // Handle different JWT errors
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                error: 'Invalid token',
                code: 'TOKEN_INVALID'
            });
        }

        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                error: 'Token has expired',
                code: 'TOKEN_EXPIRED'
            });
        }

        res.status(500).json({
            success: false,
            error: 'Authentication failed',
            code: 'AUTH_ERROR'
        });
    }
}

// Optional authentication middleware (sets user if token is valid but doesn't require it)
async function optionalAuthentication(req, res, next) {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (token) {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.userId);

            if (user && user.is_active && !user.isAccountLocked()) {
                const session = await tokenService.findSessionByToken(token);
                if (session && session.is_active && !session.force_logout) {
                    req.user = user;
                    req.session = session;
                    req.token = token;

                    // Update session access time
                    await tokenService.updateSessionLastAccessed(session.id, req.ip);
                }
            }
        }

        next();
    } catch (error) {
        // For optional auth, we silently continue without setting user
        next();
    }
}

// Middleware to require email verification
function requireEmailVerification(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            error: 'Authentication required'
        });
    }

    if (!req.user.email_verified) {
        return res.status(403).json({
            success: false,
            error: 'Email verification required',
            code: 'EMAIL_NOT_VERIFIED'
        });
    }

    next();
}

// Middleware to require account verification
function requireAccountVerification(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            error: 'Authentication required'
        });
    }

    if (!req.user.is_verified) {
        return res.status(403).json({
            success: false,
            error: 'Account verification required',
            code: 'ACCOUNT_NOT_VERIFIED'
        });
    }

    next();
}

module.exports = {
    authenticateToken,
    optionalAuthentication,
    requireEmailVerification,
    requireAccountVerification
};
