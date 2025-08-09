const mongoose = require('mongoose');
// Define the message schema for storing chat messages
const messageSchema = new mongoose.Schema({
    content: {
        type: String,
        required: [true, 'Message content is required'],
        trim: true,
        maxlength: [1000, 'Message cannot exceed 1000 characters']
    },
    sender: {
        type: String,
        required: true
    },
    room: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Room',
        required: true
    },
    messageType: {
        type: String,
        enum: ['text', 'image'
            , 'file'
            , 'system'],
        default: 'text'
    },
    // For system messages like "User joined the room"
    systemData: {
        action: String,
        targetUser: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    },
    // For tracking message interactions
    reactions: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        emoji: String,
        createdAt: {
            type: Date,
            default: Date.now
        }
    }],
    // For message editing and deletion
    edited: {
        isEdited: {
            type: Boolean,
            default: false
        },
        editedAt: Date,
        originalContent: String
    },
    isDeleted: {
        type: Boolean,
        default: false
    },
    deletedAt: Date
}, {
    timestamps: true
});
// Create indexes for efficient message queries
// These are crucial for performance when loading conversation history
messageSchema.index({ room: 1, createdAt: -1 });
messageSchema.index({ sender: 1 });
messageSchema.index({ createdAt: -1 });
// Pre-save middleware to update room's last activity and message count
messageSchema.pre('save'
    , async function (next) {
        if (this.isNew) {
            try {
                // Update the room's last activity and increment message count
                await mongoose.model('Room').findByIdAndUpdate(
                    this.room,
                    {
                        lastActivity: this.createdAt,
                        $inc: { messageCount: 1 }
                    }
                );
            } catch (error) {
                console.error('Error updating room activity:', error);
            }
        }
        next();
    });
// Instance method to edit a message
messageSchema.methods.editContent = async function (newContent) {
    if (this.isDeleted) {
        throw new Error('Cannot edit a deleted message');
    }
    // Store original content if this is the first edit
    if (!this.edited.isEdited) {
        this.edited.originalContent = this.content;
    }
    this.content = newContent;
    this.edited.isEdited = true;
    this.edited.editedAt = new Date();
    return await this.save();
};
// Instance method to delete a message
messageSchema.methods.deleteMessage = async function () {
    this.isDeleted = true;
    this.deletedAt = new Date();
    this.content = 'This message has been deleted';
    return await this.save();
};
// Instance method to add a reaction
messageSchema.methods.addReaction = async function (userId, emoji) {
    // Check if user already reacted with this emoji
    const existingReaction = this.reactions.find(reaction =>
        reaction.user.toString() === userId.toString() && reaction.emoji === emoji
    );
    if (existingReaction) {
        // Remove the reaction if it already exists (toggle behavior)
        this.reactions = this.reactions.filter(reaction =>
            !(reaction.user.toString() === userId.toString() && reaction.emoji === emoji)
        );
    } else {
        // Add the new reaction
        this.reactions.push({
            user: userId,
            emoji: emoji
        });
    }
    return await this.save();
};
// Static method to get recent messages for a room with pagination
messageSchema.statics.getRoomMessages = function (roomId, page = 1, limit = 50) {
    return this.find({
        room: roomId,
        isDeleted: false
    })
        .populate('sender', 'username avatar')
        .sort({ createdAt: -1 }) // Most recent first
        .limit(limit)
        .skip((page - 1) * limit)
        .lean(); // Use lean() for better performance when we don't need full mongoose documents
};
// Static method to create a system message
messageSchema.statics.createSystemMessage = function (roomId, action,
    userId, targetUserId = null) {
    return this.create({
        content: this.generateSystemMessageContent(action, userId, targetUserId),
        sender: userId,
        room: roomId,
        messageType: 'system',
        systemData: {
            action: action,
            targetUser: targetUserId
        }
    });
};
// Helper method to generate system message content
messageSchema.statics.generateSystemMessageContent = function (action, userId, targetUserId) {
    switch (action) {
        case 'join':
            return 'joined the room';
        case 'leave':
            return 'left the room';
        case 'kick':
            return 'was removed from the room';
        case 'promote':
            return 'was promoted to moderator';
        default:
            return 'performed an action';
    }
};
const Message = mongoose.model('Message', messageSchema);
module.exports = Message;