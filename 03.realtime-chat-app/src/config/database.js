const mongoose = require('mongoose');
require('dotenv').config();
// MongoDB connection configuration
// MongoDB connection strings include the database name and connection options
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/realtime_chat';
// Connection options for better performance and reliability
const connectionOptions = {
    // Connection pool settings
    maxPoolSize: 10, // Maximum number of connections
    serverSelectionTimeoutMS: 5000, // How long to try selecting a server
    socketTimeoutMS: 45000, // How long to wait for socket operations
    // Helpful for development debugging
    bufferCommands: false, // Disable mongoose buffering
};
// Connect to MongoDB with proper error handling
async function connectDatabase() {
    try {
        await mongoose.connect(MONGODB_URI, connectionOptions);
        console.log('Connected to MongoDB database');
        // Set up event listeners for connection monitoring
        mongoose.connection.on('error', (err) => {
            console.error('MongoDB connection error:', err);
        });
        mongoose.connection.on('disconnected', () => {
            console.log('MongoDB disconnected');
        });
        // Graceful shutdown handling
        process.on('SIGINT', async () => {
            await mongoose.connection.close();
            console.log('MongoDB connection closed due to application termination');
            process.exit(0);
        });
    } catch (error) {
        console.error('Failed to connect to MongoDB:', error);
        process.exit(1);
    }
}
module.exports = { connectDatabase };