const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Import database connection
const { connectDatabase } = require('./config/database');

// Import routes
const authRoutes = require('./routes/auth');
const fileRoutes = require('./routes/files');

// Import background processor
const backgroundProcessor = require('./services/backgroundProcessor');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware setup
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files
app.use('/static', express.static(path.join(__dirname, '..', 'public')));

// Request logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Health check endpoint
app.get('/health', (req, res) => {
    const processorStats = backgroundProcessor.getStats();

    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        background_processor: processorStats,
        database: 'connected' // You could add actual database health check here
    });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);

// Serve simple file upload interface
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// API documentation endpoint
app.get('/api', (req, res) => {
    res.json({
        name: 'File Upload and Processing Service',
        version: '1.0.0',
        description: 'A comprehensive file management system with processing capabilities',
        endpoints: {
            auth: {
                'POST /api/auth/register': 'Register a new user',
                'POST /api/auth/login': 'Login user',
                'GET /api/auth/profile': 'Get user profile (requires auth)',
                'PUT /api/auth/profile': 'Update user profile (requires auth)'
            },
            files: {
                'POST /api/files/upload': 'Upload files (requires auth)',
                'GET /api/files': 'Get user files with filtering (requires auth)',
                'GET /api/files/stats': 'Get storage statistics (requires auth)',
                'GET /api/files/:id': 'Get file details (requires auth)',
                'GET /api/files/:id/download': 'Download/view file (requires auth)',
                'PUT /api/files/:id': 'Update file metadata (requires auth)',
                'DELETE /api/files/:id': 'Delete file (requires auth)'
            }
        },
        upload_limits: {
            max_file_size: '100MB',
            max_files_per_request: 10,
            supported_types: [
                'image/jpeg', 'image/png', 'image/gif', 'image/webp',
                'application/pdf', 'text/plain', 'text/csv',
                'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            ]
        }
    });
});

// Global error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);

    // Don't leak error details in production
    const isDevelopment = process.env.NODE_ENV !== 'production';

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
        await connectDatabase();
        console.log('Database connected successfully');

        // Start the background processor
        backgroundProcessor.start();
        console.log('Background processor started');

        // Start the server
        app.listen(PORT, () => {
            console.log(`File Upload Service running on port ${PORT}`);
            console.log(`Visit http://localhost:${PORT} for the upload interface`);
            console.log(`Visit http://localhost:${PORT}/api for API documentation`);
        });

    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Graceful shutdown handling
process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down gracefully...');
    await backgroundProcessor.stop();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    await backgroundProcessor.stop();
    process.exit(0);
});

// Start the server
startServer();

module.exports = app;
