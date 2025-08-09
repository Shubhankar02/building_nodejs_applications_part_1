const express = require("express");
const http = require("http");
const path = require("path");
require("dotenv").config();
// Import database connection
const { connectDatabase } = require("./config/database");
// Import Socket.io configuration
const { initializeSocket } = require("./config/socket");
// Import socket event handlers
const { handleConnection } = require("./socket/connectionHandler");
const { handleRoomEvents } = require("./socket/roomHandler");
const { handleMessageEvents } = require("./socket/messageHandler");
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;
// Basic middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Serve static files from public directory
app.use(express.static(path.join(__dirname,
    "../public")));
// Basic route for testing
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname,
        "../public/index.html"));
});
// API status endpoint
app.get("/api/status", (req, res) => {
    res.json({
        message: "Real-time Chat API is running!",
        version: "1.0.0",
        timestamp: new Date().toISOString(),
    });
});
// Initialize Socket.io
const io = initializeSocket(server);
// Set up socket event handlers
io.on("connection", (socket) => {
    console.log('socket.userId', socket.userId);
    // Handle basic connection events
    handleConnection(io, socket);
    // Handle room-related events
    handleRoomEvents(io, socket);
    // Handle message-related events
    handleMessageEvents(io, socket);
});
// Error handling middleware
app.use((err, req, res, next) => {
    console.error("Unhandled error:", err);
    res.status(500).json({
        error: "Something went wrong!",
        message: err.message,
    });
});
// Handle 404 for undefined routes
app.use((req, res) => {
    res.status(404).json({
        error: "Route not found",
        path: req.originalUrl,
    });
});
// Start the server
async function startServer() {
    try {
        // Connect to database first
        await connectDatabase();
        // Start the HTTP server
        server.listen(PORT, () => {
            console.log(`Real-time Chat server running on port ${PORT}`);
            console.log(`Visit http://localhost:${PORT} to use the chat application`);
        });
    } catch (error) {
        console.error("Failed to start server:", error);
        process.exit(1);
    }
}
startServer();
module.exports = app;