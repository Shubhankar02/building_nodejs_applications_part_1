const socketIo = require("socket.io");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
// Socket.io configuration and authentication
function initializeSocket(server) {
    const io = socketIo(server, {
        cors: {
            origin: "*", // In production, specify your frontend domain
            methods: ["GET", "POST"],
        },
        connectionStateRecovery: {
            // Enable recovery in case of temporary connection issues
            maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
            skipMiddlewares: true,
        },
    });
    // Authentication middleware for socket connections
    // This runs for every socket connection attempt
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token;
            if (!token) {
                // For simplicity, we'll allow anonymous connections with a default user
                socket.userId = null;
                socket.username =
                    `Guest_${Math.random().toString(36).substring(7)}`
                    ;
                return next();
            }
            // Verify JWT token if provided
            const decoded = jwt.verify(
                token,
                process.env.JWT_SECRET || "your-secret-key"
            );
            const user = await User.findById(decoded.userId);
            if (!user) {
                return next(new Error("User not found"));
            }
            // Attach user information to socket for easy access
            socket.userId = user._id;
            socket.username = user.username;
            socket.user = user;
            next();
        } catch (error) {
            console.error("Socket authentication error:", error);
            next(new Error("Authentication failed"));
        }
    });
    return io;
}
module.exports = { initializeSocket };