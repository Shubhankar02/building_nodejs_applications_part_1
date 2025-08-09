const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
// Define the user schema with validation rules
// Mongoose schemas define the structure and validation for our documents
const userSchema = new mongoose.Schema({
    socketId: {
        type: String,
        required: true,
        unique: true,
    },
    username: {
        type: String,
        required: [true, 'Username is required'],
        unique: true,
        trim: true,
        minlength: [3, 'Username must be at least 3 characters'],
        maxlength: [20, 'Username cannot exceed 20 characters'],
        match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores']
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters']
    },
    avatar: {
        type: String,
        default: function () {
            // Generate a simple avatar URL based on username
            return `https://ui-avatars.com/api/?name=${this.username}&background=random`;
        }
    },
    isOnline: {
        type: Boolean,
        default: false
    },
    lastSeen: {
        type: Date,
        default: Date.now
    },
    joinedRooms: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Room'
    }]
}, {
    timestamps: true, // Automatically add createdAt and updatedAt fields
    toJSON: {
        transform: function (doc, ret) {
            // Remove sensitive information when converting to JSON
            delete ret.password;
            return ret;
        }
    }
});
// Pre-save middleware to hash passwords before storing
// This runs automatically whenever we save a user document
userSchema.pre('save'
    , async function (next) {
        // Only hash the password if it's been modified or is new
        if (!this.isModified('password')) {
            return next();
        }
        try {
            // Hash the password with a salt rounds of 12
            const saltRounds = 12;
            this.password = await bcrypt.hash(this.password, saltRounds);
            next();
        } catch (error) {
            next(error);
        }
    });
// Instance method to verify passwords
// This allows us to call user.verifyPassword(plainPassword)
userSchema.methods.verifyPassword = async function (plainPassword) {
    try {
        return await bcrypt.compare(plainPassword, this.password);
    } catch (error) {
        return false;
    }
};
// Instance method to update online status
userSchema.methods.setOnlineStatus = async function (isOnline) {
    this.isOnline = isOnline;
    this.lastSeen = new Date();
    return await this.save();
};
// Static method to find online users
// Static methods are called on the model itself, not on instances
userSchema.statics.findOnlineUsers = function () {
    return this.find({ isOnline: true }).select('username avatar');
};
const User = mongoose.model('User', userSchema);
module.exports = User;