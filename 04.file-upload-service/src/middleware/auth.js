const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware to verify JWT tokens and authenticate users
async function authenticateToken(req, res, next) {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Extract token from "Bearer TOKEN"

        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Access token is required'
            });
        }

        // Verify the JWT token
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET || 'fallback-secret-key'
        );

        // Find the user in the database
        const user = await User.findById(decoded.userId);

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Invalid token: user not found'
            });
        }

        // Attach user information to the request object
        req.user = {
            id: user.id,
            email: user.email,
            name: user.name
        };

        next();

    } catch (error) {
        console.error('Authentication error:', error);

        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                error: 'Invalid token'
            });
        }

        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                error: 'Token has expired'
            });
        }

        res.status(500).json({
            success: false,
            error: 'Authentication failed'
        });
    }
}

// Optional authentication middleware (for public endpoints that can benefit from user context)
async function optionalAuthentication(req, res, next) {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (token) {
            const decoded = jwt.verify(
                token,
                process.env.JWT_SECRET || 'fallback-secret-key'
            );

            const user = await User.findById(decoded.userId);

            if (user) {
                req.user = {
                    id: user.id,
                    email: user.email,
                    name: user.name
                };
            }
        }

        next();
    } catch (error) {
        // For optional authentication, we don't return errors
        // Just continue without setting req.user
        next();
    }
}

module.exports = {
    authenticateToken,
    optionalAuthentication
};
