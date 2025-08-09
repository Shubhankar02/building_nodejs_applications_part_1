require('dotenv').config();

const securityConfig = {
    // JWT Configuration
    jwt: {
        secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production',
        expiresIn: process.env.JWT_EXPIRES_IN || '1d',
        refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
        issuer: process.env.JWT_ISSUER || 'auth-system',
        audience: process.env.JWT_AUDIENCE || 'auth-system-users'
    },

    // Password Policy
    password: {
        minLength: 8,
        maxLength: 128,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true,
        preventReuse: 5, // Prevent reusing last 5 passwords
        maxAge: 90 * 24 * 60 * 60 * 1000, // 90 days in milliseconds
        resetTokenExpiry: 60 * 60 * 1000 // 1 hour
    },

    // Account Lockout Policy
    lockout: {
        maxAttempts: 5,
        lockoutDuration: 30 * 60 * 1000, // 30 minutes
        escalationAttempts: [5, 10, 15], // Escalate lockout duration
        escalationDurations: [
            30 * 60 * 1000,  // 30 minutes
            60 * 60 * 1000,  // 1 hour
            24 * 60 * 60 * 1000  // 24 hours
        ]
    },

    // Session Management
    session: {
        defaultExpiry: 24 * 60 * 60 * 1000, // 24 hours
        rememberMeExpiry: 30 * 24 * 60 * 60 * 1000, // 30 days
        maxConcurrentSessions: 5,
        cleanupInterval: 60 * 60 * 1000 // 1 hour
    },

    // Two-Factor Authentication
    twoFactor: {
        window: 1, // Allow 1 step tolerance for time drift
        backupCodesCount: 10,
        serviceName: process.env.APP_NAME || 'Auth System'
    },

    // Rate Limiting
    rateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // Limit each IP to 100 requests per windowMs
        message: 'Too many requests from this IP, please try again later.',
        standardHeaders: true,
        legacyHeaders: false,
        
        // Specific limits for different endpoints
        auth: {
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 5, // 5 attempts per window
            blockDuration: 15 * 60 * 1000 // 15 minutes
        },
        
        passwordReset: {
            windowMs: 60 * 60 * 1000, // 1 hour
            max: 3, // 3 attempts per hour
            blockDuration: 60 * 60 * 1000 // 1 hour
        }
    },

    // Security Headers
    security: {
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
        
        // Additional security options
        hidePoweredBy: true,
        noSniff: true,
        frameguard: { action: 'deny' },
        xssFilter: true,
        referrerPolicy: { policy: 'same-origin' }
    },

    // Email Configuration
    email: {
        verificationTokenExpiry: 24 * 60 * 60 * 1000, // 24 hours
        from: process.env.FROM_EMAIL || 'noreply@example.com',
        templates: {
            verification: 'email-verification',
            passwordReset: 'password-reset',
            welcome: 'welcome-email'
        }
    },

    // Audit Logging
    audit: {
        retentionDays: 90,
        logLevels: ['error', 'warn', 'info'],
        sensitiveFields: ['password', 'token', 'secret'],
        maxLogSize: 10 * 1024 * 1024, // 10MB
        archiveOldLogs: true
    },

    // Environment-specific settings
    development: {
        enableDebugLogs: true,
        skipEmailVerification: false,
        allowWeakPasswords: false
    },

    production: {
        enableDebugLogs: false,
        enforceHttps: true,
        requireEmailVerification: true,
        enableSecurityHeaders: true
    }
};

// Get configuration based on environment
function getConfig() {
    const env = process.env.NODE_ENV || 'development';
    const config = { ...securityConfig };

    // Apply environment-specific overrides
    if (config[env]) {
        Object.assign(config, config[env]);
    }

    return config;
}

// Validate required environment variables
function validateConfig() {
    const requiredVars = [
        'JWT_SECRET',
        'DB_HOST',
        'DB_NAME',
        'DB_USER',
        'DB_PASSWORD'
    ];

    const missing = requiredVars.filter(varName => !process.env[varName]);

    if (missing.length > 0) {
        console.error('Missing required environment variables:', missing.join(', '));
        
        if (process.env.NODE_ENV === 'production') {
            throw new Error('Required environment variables are missing');
        } else {
            console.warn('Some environment variables are missing, using defaults');
        }
    }
}

// Initialize configuration
validateConfig();

module.exports = getConfig();