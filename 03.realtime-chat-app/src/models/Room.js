const mongoose = require('mongoose');
// Define the room schema for organizing conversations
const roomSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Room name is required'],
        trim: true,
        minlength: [1, 'Room name cannot be empty'],
        maxlength: [50, 'Room name cannot exceed 50 characters']
    },
    description: {
        type: String,
        maxlength: [200, 'Description cannot exceed 200 characters'],
        default: '',
    },
    isPrivate: {
        type: Boolean,
        default: false
    },
    creator: {
        type: mongoose.Schema.Types.String,
        required: true
    },
    members: [{
        user: {
            type: mongoose.Schema.Types.String
        },
        joinedAt: {
            type: Date,
            default: Date.now
        },
        role: {
            type: String,
            enum: ['member', 'moderator', 'admin'],
            default: 'member'
        }
    }],
    activeUsers: [{
        type: mongoose.Schema.Types.String
    }],
    lastActivity: {
        type: Date,
        default: Date.now
    },
    messageCount: {
        type: Number,
        default: 0
    },
}, {
    timestamps: true
});
// Create indexes for better query performance
// These help MongoDB find rooms quickly when searching or filtering
roomSchema.index({ name: 1 });
roomSchema.index({ creator: 1 });
roomSchema.index({ 'members.user': 1 });
roomSchema.index({ lastActivity: -1 });
// Instance method to add a member to the room
roomSchema.methods.addMember = async function (userId, role = 'member') {
    // Check if user is already a member
    const existingMember = this.members.find(member => member.user.toString() === userId.toString());
    if (existingMember) {
        throw new Error('User is already a member of this room');
    }
    this.members.push({
        user: userId,
        role: role,
        joinedAt: new Date()
    });
    return await this.save();
};
// Instance method to remove a member from the room
roomSchema.methods.removeMember = async function (userId) {
    this.members = this.members.filter(member =>
        member.user.toString() !== userId.toString()
    );
    // Also remove from active users if present
    this.activeUsers = this.activeUsers.filter(activeUser =>
        activeUser.toString() !== userId.toString()
    );
    return await this.save();
};
// Instance method to check if a user is a member
roomSchema.methods.isMember = function (userId) {
    return this.members.some(member => member.user.toString() === userId.toString()
    );
};
// Instance method to get member role
roomSchema.methods.getMemberRole = function (userId) {
    const member = this.members.find(member => member.user.toString() === userId.toString()
    );
    return member ? member.role : null;
};
// Instance method to set user as active in the room
roomSchema.methods.setUserActive = async function (userId) {
    if (!this.activeUsers.includes(userId)) {
        this.activeUsers.push(userId);
        await this.save();
    }
};
// Instance method to set user as inactive in the room
roomSchema.methods.setUserInactive = async function (userId) {
    this.activeUsers = this.activeUsers.filter(activeUser =>
        activeUser.toString() !== userId.toString()
    );
    await this.save();
};
// Static method to find rooms for a specific user
roomSchema.statics.findUserRooms = function (userId) {
    return this.find({ 'members.user': userId })
        .populate('creator', 'username')
        .populate('members.user', 'username avatar')
        .sort({ lastActivity: -1 });
};
const Room = mongoose.model('Room', roomSchema);
module.exports = Room;