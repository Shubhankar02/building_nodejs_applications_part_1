const Redis = require('ioredis');
require('dotenv').config();

let redis = null;

// Only initialize Redis if configuration is provided
if (process.env.REDIS_URL || process.env.REDIS_HOST) {
    try {
        const redisConfig = {
            retryDelayOnFailover: 100,
            enableReadyCheck: false,
            maxRetriesPerRequest: 3,
            lazyConnect: true,
            keepAlive: 30000,
            connectTimeout: 10000,
            commandTimeout: 5000,
        };

        // Use Redis URL if provided, otherwise use individual config
        if (process.env.REDIS_URL) {
            redis = new Redis(process.env.REDIS_URL, redisConfig);
        } else {
            redis = new Redis({
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT) || 6379,
                password: process.env.REDIS_PASSWORD || undefined,
                db: parseInt(process.env.REDIS_DB) || 0,
                ...redisConfig
            });
        }

        // Error handling
        redis.on('error', (error) => {
            console.error('Redis connection error:', error.message);
        });

        redis.on('connect', () => {
            console.log('Redis connected successfully');
        });

        redis.on('ready', () => {
            console.log('Redis ready for operations');
        });

        redis.on('close', () => {
            console.log('Redis connection closed');
        });

        redis.on('reconnecting', () => {
            console.log('Redis reconnecting...');
        });

    } catch (error) {
        console.error('Redis initialization error:', error.message);
        redis = null;
    }
} else {
    console.log('Redis configuration not found, running without Redis cache');
}

module.exports = redis;