const User = require("../models/User");
const Room = require("../models/Room");
function handleConnection(io, socket) {
    console.log(`User connected: ${socket.username} (${socket.id})`);
    // Update user's online status if they're authenticated
    if (socket.id) {
        updateUserOnlineStatus(socket.id, true);
    }
    // Send welcome message and current online users
    socket.emit("connection_success", {
        message: "Connected to chat server",
        username: socket.username,
        userId: socket.id,
    });
    // Handle user disconnection
    socket.on("disconnect", async (reason) => {
        console.log(`User disconnected: ${socket.username} (${reason})`);
        // Update user's offline status
        if (socket.id) {
            await updateUserOnlineStatus(socket.id, false);
        }
        // Notify all rooms that user left
        const rooms = Array.from(socket.rooms);
        rooms.forEach((roomId) => {
            if (roomId !== socket.id) {
                // Skip the default room
                socket.to(roomId).emit("user_left", {
                    username: socket.username,
                    userId: socket.id,
                    timestamp: new Date(),
                });
            }
        });
    });
    // Handle manual disconnect
    socket.on("manual_disconnect", () => {
        socket.disconnect();
    });
}
// Helper function to update user online status
async function updateUserOnlineStatus(id, isOnline) {
    try {
        if (id) {
            await User.findOneAndUpdate({ socketId: id }, {
                isOnline: isOnline,
                lastSeen: new Date(),
            });
        }
    } catch (error) {
        console.error("Error updating user online status:", error);
    }
}
module.exports = { handleConnection };