const Message = require("../models/Message");
const Room = require("../models/Room");
function handleMessageEvents(io, socket) {
    // Handle sending a message
    socket.on("send_message", async (data) => {
            try {
                const { content, roomName } = data;
                if (!content || !content.trim()) {
                    socket.emit("error", {
                        message: "Message content cannot be empty"
                    });
                    return;
                }
                if (!roomName || !socket.currentRoom) {
                    socket.emit("error", {
                        message: "You must be in a room to send messages",
                    });
                    return;
                }
                // Find the room
                const room = await Room.findOne({ name: roomName });
                if (!room) {
                    socket.emit("error", { message: "Room not found" });
                    return;
                }
                // Create the message in database
                const message = new Message({
                    content: content.trim(),
                    sender: socket.id,
                    room: room._id,
                    messageType: "text",
                });
                await message.save();
                // Populate sender information for broadcasting
                await message.populate("sender", "username avatar");
                // Prepare message data for broadcasting
                const messageData = {
                    id: message._id,
                    content: message.content,
                    sender: {
                        id: message.sender._id,
                        username: socket.username,
                        avatar:
                            message.sender?.avatar ||
                            `https://ui-avatars.com/api/?name=${socket.username}&background=random`
                        ,
                    },
                    room: roomName,
                    timestamp: message.createdAt,
                    messageType: message.messageType,
                };
                // Broadcast message to all users in the room (including sender)
                io.to(roomName).emit("new_message", messageData);
                console.log(`Message sent in ${roomName} by ${socket.username}: ${content.substring(0, 50)}...`);
            } catch (error) {
                console.error("Error sending message:", error);
                socket.emit("error", {
                    message: "Failed to send message"
                    ,
                    details: error.message,
                });
            }
        });
    // Handle message reactions (optional feature)
    socket.on("add_reaction", async (data) => {
        try {
            const { messageId, emoji } = data;
            if (!socket.id) {
                socket.emit("error", {
                    message: "You must be logged in to react to messages",
                });
                return;
            }
            const message = await Message.findById(messageId);
            if (!message) {
                socket.emit("error", { message: "Message not found" });
                return;
            }
            await message.addReaction(socket.id, emoji);
            // Broadcast the reaction to all users in the room
            const room = await Room.findById(message.room);
            if (room) {
                io.to(room.name).emit("message_reaction", {
                    messageId: messageId,
                    emoji: emoji,
                    userId: socket.id,
                    username: socket.username,
                    timestamp: new Date(),
                });
            }
        } catch (error) {
            console.error("Error adding reaction:", error);
            socket.emit("error", { message: "Failed to add reaction" });
        }
    });
    // Handle typing indicators
    socket.on("typing_start", (data) => {
        const { roomName } = data;
        if (roomName && socket.currentRoom === roomName) {
            socket.to(roomName).emit("user_typing", {
                username: socket.username,
                userId: socket.id,
            });
        }
    });
    socket.on("typing_stop"
        , (data) => {
            const { roomName } = data;
            if (roomName && socket.currentRoom === roomName) {
                socket.to(roomName).emit("user_stopped_typing", {
                    username: socket.username,
                    userId: socket.id,
                });
            }
        });
}
module.exports = { handleMessageEvents };