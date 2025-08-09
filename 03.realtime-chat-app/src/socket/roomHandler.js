const Room = require("../models/Room");
const Message = require("../models/Message");
function handleRoomEvents(io, socket) {
    // Handle joining a room
    socket.on("join_room", async (data) => {
        try {
            const { roomName } = data;
            if (!roomName) {
                socket.emit("error", { message: "Room name is required" });
                return;
            }
            // Find or create the room
            let room = await Room.findOne({ name: roomName });
            if (!room) {
                // Create a new room if it doesn't exist
                room = new Room({
                    name: roomName,
                    description: `Chat room: ${roomName}`,
                    creator: socket.id,
                    members: socket.userId
                        ? [
                            {
                                user: socket.userId,
                                role: "admin",
                            },
                        ]
                        : [],
                });
                await room.save();
                console.log(`Created new room: ${roomName}`);
            } else if (socket.id && !room.isMember(socket.id)) {
                // Add user to existing room if not already a member
                await room.addMember(socket.id);
            }
            // Join the socket room
            socket.join(roomName);
            socket.currentRoom = roomName;
            // Mark user as active in this room
            if (socket.id) {
                await room.setUserActive(socket.id);
            }
            // Load recent messages for this room
            const recentMessages = await Message.getRoomMessages(room._id,
                1, 30);
            // Send room data and recent messages to the user
            socket.emit("room_joined", {
                room: {
                    id: room._id,
                    name: room.name,
                    description: room.description,
                    memberCount: room.members.length,
                },
            });
            // Notify other users in the room
            socket.to(roomName).emit("user_joined", {
                username: socket.username,
                userId: socket.userId,
                timestamp: new Date(),
                message: `${socket.username} joined the room
    `
                ,
            });
            console.log(`${socket.username} joined room: ${roomName}`);
        } catch (error) {
            console.error("Error joining room:", error);
            socket.emit("error", {
                message: "Failed to join room",
                details: error.message,
            });
        }
    });
    // Handle leaving a room
    socket.on("leave_room", async (data) => {
        try {
            const { roomName } = data;
            if (!roomName || !socket.currentRoom) {
                return;
            }
            // Leave the socket room
            socket.leave(roomName);
            // Update room to mark user as inactive
            const room = await Room.findOne({ name: roomName });
            if (room && socket.userId) {
                await room.setUserInactive(socket.userId);
            }
            // Notify other users
            socket.to(roomName).emit("user_left", {
                username: socket.username,
                userId: socket.userId,
                timestamp: new Date(),
                message: `${socket.username} left the room
        `
                ,
            });
            socket.currentRoom = null;
            console.log(`${socket.username} left room: ${roomName}`);
        } catch (error) {
            console.error("Error leaving room:", error);
        }
    });
    // Handle getting room list
    socket.on("get_rooms", async () => {
        try {
            // Get all public rooms with basic info
            const rooms = await Room.find({})
                .select("name description memberCount lastActivity")
                .sort({ lastActivity: -1 })
                .limit(20);
            socket.emit("rooms_list", { rooms });
        } catch (error) {
            console.error("Error getting rooms:", error);
            socket.emit("error", {
                message: "Failed to get rooms list",
            });
        }
    });
}
module.exports = { handleRoomEvents };