const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Import database module
const db = require('./config/database');
const redis = require('./config/redis');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');

// Import middleware
const { simpleRateLimit } = require('./middleware/rateLimiting');
const tokenService = require('./services/tokenService');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            formAction: ["'self'"],
        },
    },
    crossOriginEmbedderPolicy: false
}));

// CORS configuration
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Request parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
app.use(morgan('combined', {
    skip: (req, res) => res.statusCode < 400 // Only log errors in production
}));

// // Rate limiting
app.use(simpleRateLimit);

// Static files
app.use('/static', express.static(path.join(__dirname, '..', 'public')));

// Health check endpoint
app.get('/health', async (req, res) => {
    try {
        // Check database connection
        const dbResult = await db.query('SELECT 1');
        const dbHealth = dbResult.rows.length > 0 ? 'healthy' : 'unhealthy';

        // Check Redis connection
        let redisHealth = 'not configured';
        if (redis) {
            try {
                await redis.ping();
                redisHealth = 'healthy';
            } catch (error) {
                redisHealth = 'unhealthy';
            }
        }

        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            services: {
                database: dbHealth,
                redis: redisHealth
            }
        });
    } catch (error) {
        res.status(500).json({
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);

// Serve the main interface
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// API documentation endpoint
app.get('/api', (req, res) => {
    res.json({
        name: 'Authentication and Authorization System',
        version: '1.0.0',
        description: 'Enterprise-grade authentication system with role-based access control',
        endpoints: {
            auth: {
                'POST /api/auth/register': 'Register a new user',
                'POST /api/auth/login': 'Login user',
                'POST /api/auth/refresh': 'Refresh access token',
                'POST /api/auth/logout': 'Logout user',
                'POST /api/auth/forgot-password': 'Request password reset',
                'POST /api/auth/reset-password': 'Reset password',
                'GET /api/auth/verify-email/:token': 'Verify email address',
                'POST /api/auth/resend-verification': 'Resend email verification',
                'GET /api/auth/profile': 'Get user profile (requires auth)',
                'PUT /api/auth/profile': 'Update user profile (requires auth)',
                'POST /api/auth/change-password': 'Change password (requires auth)',
                'POST /api/auth/enable-2fa': 'Enable two-factor authentication',
                'POST /api/auth/verify-2fa': 'Verify and activate 2FA',
                'POST /api/auth/disable-2fa': 'Disable two-factor authentication'
            },
            users: {
                'GET /api/users': 'Get all users (admin only)',
                'GET /api/users/:id': 'Get user details (admin only)',
                'PUT /api/users/:id/status': 'Update user status (admin only)',
                'POST /api/users/:id/roles': 'Assign role to user (admin only)',
                'DELETE /api/users/:id/roles/:roleId': 'Remove role from user (admin only)',
                'POST /api/users/:id/force-logout': 'Force logout user (admin only)'
            },
            admin: {
                'GET /api/admin/stats': 'Get system statistics (admin only)',
                'GET /api/admin/audit-logs': 'Get audit logs (admin only)',
                'GET /api/admin/security-alerts': 'Get security alerts (admin only)',
                'GET /api/admin/roles': 'Get all roles (admin only)',
                'POST /api/admin/roles': 'Create new role (admin only)',
                'PUT /api/admin/roles/:id': 'Update role (admin only)',
                'DELETE /api/admin/roles/:id': 'Delete role (admin only)'
            }
        }
    });
});

// Global error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);

    // Don't leak error details in production
    const isDevelopment = process.env.NODE_ENV !== 'production';

    // Handle different types of errors
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: isDevelopment ? err.message : 'Invalid input data'
        });
    }

    if (err.code === '23505') { // PostgreSQL unique constraint violation
        return res.status(409).json({
            success: false,
            error: 'Resource already exists',
            details: isDevelopment ? err.message : 'Duplicate entry'
        });
    }

    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: isDevelopment ? err.message : 'Something went wrong',
        timestamp: new Date().toISOString()
    });
});

// Handle 404 errors
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        message: `The endpoint ${req.originalUrl} does not exist`,
        timestamp: new Date().toISOString()
    });
});

// Database connection and server startup
async function startServer() {
    try {
        // Connect to database
        await db.connectDatabase();
        console.log('✓ Database connected successfully');

        // Test Redis connection if configured
        if (redis) {
            try {
                await redis.ping();
                console.log('✓ Redis connected successfully');
            } catch (error) {
                console.warn('⚠ Redis connection failed:', error.message);
            }
        }

        // Start session cleanup job
        if (tokenService.cleanupExpiredSessions) {
            setInterval(async () => {
                try {
                    const cleaned = await tokenService.cleanupExpiredSessions();
                    if (cleaned > 0) {
                        console.log(`Cleaned up ${cleaned} expired sessions`);
                    }
                } catch (error) {
                    console.error('Error cleaning up expired sessions:', error);
                }
            }, 60 * 60 * 1000); // Run every hour
        }

        // Start the server
        app.listen(PORT, () => {
            console.log(`🚀 Authentication Service running on port ${PORT}`);
            console.log(`📱 Visit http://localhost:${PORT} for the web interface`);
            console.log(`📚 Visit http://localhost:${PORT}/api for API documentation`);
            console.log(`🔍 Health check: http://localhost:${PORT}/health`);
        });

    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// Graceful shutdown handling
process.on('SIGINT', async () => {
    console.log('\n🔄 Received SIGINT, shutting down gracefully...');
    
    // Close Redis connection
    if (redis) {
        await redis.quit();
        console.log('✓ Redis connection closed');
    }
    
    // Close database connection
    if (db && db.pool) {
        await db.pool.end();
        console.log('✓ Database connection closed');
    }
    
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🔄 Received SIGTERM, shutting down gracefully...');
    
    // Close Redis connection
    if (redis) {
        await redis.quit();
        console.log('✓ Redis connection closed');
    }
    
    // Close database connection
    if (db && db.pool) {
        await db.pool.end();
        console.log('✓ Database connection closed');
    }
    
    process.exit(0);
});

// Start the server
startServer();

module.exports = app;