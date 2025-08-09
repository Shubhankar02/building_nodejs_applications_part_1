const { Pool } = require('pg');
require('dotenv').config();
// Database connection configuration with optimizations for file metadata operations
const pool = new Pool({
    user: process.env.DB_USER || 'shubhankarborade',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'file_service',
    password: process.env.DB_PASSWORD || 'admin',
    port: process.env.DB_PORT || 5432, // Optimized connection pool settings for file processing workloads
    max: 20, // Higher connection limit for concurrent file operations
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Explicit connection initializer expected by app.js
async function connectDatabase() {
    try {
        // Simple connectivity check
        await pool.query('SELECT 1');
        return true;
    } catch (error) {
        console.error('Failed to connect to database:', error);
        throw error;
    }
}
// Enhanced query logging for file operations debugging
async function query(text, params) {
    const start = Date.now();
    try {
        const result = await pool.query(text, params);
        const duration = Date.now() - start;
        // Log slow queries for performance monitoring
        if (duration > 100) {
            console.warn('Slow query detected:', { text, duration, rows: result.rowCount });
        } else {
            console.log('Query executed:', { duration, rows: result.rowCount });
        }
        return result;
    } catch (error) {
        console.error('Database query error:', error);
        throw error;
    }
}
// Transaction support for complex file operations
async function getClient() {
    const client = await pool.connect();
    const originalQuery = client.query;
    client.query = async function (text, params) {
        const start = Date.now();
        try {
            const result = await originalQuery.call(this, text, params);
            const duration = Date.now() - start;
            console.log('Transaction query executed:', { duration, rows: result.rowCount });
            return result;
        } catch (error) {
            console.error('Transaction query error:', error);
            throw error;
        }
    };
    return client;
}
module.exports = {
    query,
    getClient,
    pool,
    connectDatabase
};