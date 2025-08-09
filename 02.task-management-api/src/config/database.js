const { Pool } = require('pg');
require('dotenv').config();
// Database connection configuration
// In production, these values would come from environment variables
const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'task_management',
    password: process.env.DB_PASSWORD || 'password',
    port: process.env.DB_PORT || 5432,
    // Connection pool settings for better performance
    // These settings help manage database connections efficiently
    max: 20, // Maximum number of connections in the pool
    idleTimeoutMillis: 30000, // How long a connection can stay idle
    connectionTimeoutMillis: 2000, // How long to wait when connecting
});
// Test the database connection when the module loads
// This helps us catch connection problems early
pool.on('connect', () => {
    console.log('Connected to PostgreSQL database');
});
pool.on('error', (err) => {
    console.error('Database connection error:', err);
    process.exit(-1);
});
// Helper function to execute queries with better error handling
async function query(text, params) {
    const start = Date.now();
    try {
        const result = await pool.query(text, params);
        const duration = Date.now() - start;
        console.log('Executed query', {
            text, duration, rows: result.rowCount
        });
        return result;
    } catch (error) {
        console.error('Database query error:', error);
        throw error;
    }
}
// Helper function to execute queries within a transaction
// Transactions ensure that multiple database operations succeed or fail together
async function getClient() {
    const client = await pool.connect();
    // Add query method to client for consistency
    const originalQuery = client.query;
    client.query = async function (text, params) {
        const start = Date.now();
        try {
            const result = await originalQuery.call(this, text, params);
            const duration = Date.now() - start;
            console.log('Executed query', {
                text, duration, rows: result.rowCount
            });
            return result;
        } catch (error) {
            console.error('Database query error:', error);
            throw error;
        }
    };
    return client;
}
module.exports = {
    query,
    getClient,
    pool
};