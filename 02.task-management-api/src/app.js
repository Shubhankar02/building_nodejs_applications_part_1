const express = require('express');
const path = require('path');
require('dotenv').config();
// Import our database configuration to ensure connection is established
const db = require('./config/database');
// Import our route modules
const authRoutes = require('./routes/auth');
const taskRoutes = require('./routes/tasks');
const categoryRoutes = require('./routes/categories');
const app = express();

const PORT = process.env.PORT || 3000;
// Basic middleware
app.use(express.json()); // Parse JSON request bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies
// Simple logging middleware to see what requests are coming in
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});
// Mount our routes
app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/categories', categoryRoutes);
// Basic route for testing if server is running
app.get('/', (req, res) => {
    res.json({
        message: 'Task Management API is running!',
        version: '1.0.0',
        endpoints: {
            auth: '/api/auth',
            tasks: '/api/tasks',
            categories: '/api/categories'
        }
    });
});
// Simple error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Something went wrong!',
        message: err.message
    });
});
// Handle 404 for undefined routes
app.use((req, res) => {
    res.status(404).json({
        error: 'Route not found',
        path: req.originalUrl
    });
});
// Start the server
app.listen(PORT, () => {
    console.log(`Task Management API server running on port ${PORT}`);
    console.log(`Visit http://localhost:${PORT} to test the API`);
});
module.exports = app;