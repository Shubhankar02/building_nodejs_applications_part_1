const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Database connection pool with optimized settings
const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'auth_system',
    password: process.env.DB_PASSWORD || 'password',
    port: parseInt(process.env.DB_PORT) || 5432,
    max: 20, // Maximum number of connections
    idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
    connectionTimeoutMillis: 2000, // Connection timeout
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Enhanced query function with logging and error handling
async function query(text, params = []) {
    const start = Date.now();
    
    try {
        const result = await pool.query(text, params);
        const duration = Date.now() - start;
        
        // Log slow queries for performance monitoring
        if (duration > 1000) {
            console.warn('Slow query detected:', {
                query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
                duration: `${duration}ms`,
                rows: result.rowCount
            });
        }
        
        return result;
    } catch (error) {
        console.error('Database query error:', {
            query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
            error: error.message,
            params: params
        });
        throw error;
    }
}

// Get a client from the pool for transactions
async function getClient() {
    const client = await pool.connect();
    
    // Add query logging to the client
    const originalQuery = client.query.bind(client);
    client.query = async function(text, params) {
        const start = Date.now();
        try {
            const result = await originalQuery(text, params);
            const duration = Date.now() - start;
            
            if (duration > 1000) {
                console.warn('Slow transaction query:', {
                    query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
                    duration: `${duration}ms`
                });
            }
            
            return result;
        } catch (error) {
            console.error('Transaction query error:', error.message);
            throw error;
        }
    };
    
    return client;
}

// Database connection function
async function connectDatabase() {
    try {
        // Test the connection
        await pool.query('SELECT NOW()');
        console.log('Database connection established successfully');
        
        // Run migrations if needed
        await runMigrations();
        
    } catch (error) {
        console.error('Database connection failed:', error.message);
        throw error;
    }
}

// Simple migration system
async function runMigrations() {
    try {
        // Create migrations table if it doesn't exist
        await pool.query(`
            CREATE TABLE IF NOT EXISTS migrations (
                id SERIAL PRIMARY KEY,
                filename VARCHAR(255) NOT NULL UNIQUE,
                executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Check for migration files
        const migrationsDir = path.join(__dirname, '..', 'migrations');
        
        if (!fs.existsSync(migrationsDir)) {
            console.log('No migrations directory found, skipping migrations');
            return;
        }
        
        const files = fs.readdirSync(migrationsDir)
            .filter(file => file.endsWith('.sql'))
            .sort();
        
        for (const file of files) {
            // Check if migration has already been run
            const result = await pool.query(
                'SELECT id FROM migrations WHERE filename = $1',
                [file]
            );
            
            if (result.rows.length > 0) {
                continue; // Already executed
            }
            
            console.log(`Running migration: ${file}`);
            
            // Read and execute migration file
            const migrationPath = path.join(migrationsDir, file);
            const migration = fs.readFileSync(migrationPath, 'utf8');
            
            // Execute migration in a transaction
            const client = await getClient();
            try {
                await client.query('BEGIN');
                await client.query(migration);
                await client.query(
                    'INSERT INTO migrations (filename) VALUES ($1)',
                    [file]
                );
                await client.query('COMMIT');
                console.log(`✓ Migration ${file} completed successfully`);
            } catch (error) {
                await client.query('ROLLBACK');
                console.error(`✗ Migration ${file} failed:`, error.message);
                throw error;
            } finally {
                client.release();
            }
        }
        
    } catch (error) {
        console.error('Migration error:', error.message);
        throw error;
    }
}

module.exports = {
    query,
    getClient,
    pool,
    connectDatabase
};