const db = require('../config/database');
const bcrypt = require('bcryptjs');
class User {
    constructor(userData) {
        this.id = userData.id;
        this.email = userData.email;
        this.name = userData.name;
        this.password_hash = userData.password_hash;
        this.created_at = userData.created_at;
        this.updated_at = userData.updated_at;
    }
    // Create a new user with hashed password
    // This method handles both password hashing and database insertion
    static async create(userData) {
        const { email, name, password } = userData;
        try {
// Hash the password before storing it
// We use a salt rounds value of 12 for good security without being too slow
            const saltRounds = 12;
            const password_hash = await bcrypt.hash(password, saltRounds);
            const result = await db.query(
                `INSERT INTO users (email, name, password_hash)
VALUES ($1, $2, $3)
RETURNING id, email, name, created_at, updated_at`
                ,
                [email, name, password_hash]
            );
            return new User(result.rows[0]);
        } catch (error) {
            // Handle database constraint violations gracefully
            if (error.code === '23505') { // Unique violation error code
                throw new Error('Email already exists');
            }
            throw error;
        }
    }
    // Find a user by email address
    static async findByEmail(email) {
        try {
            const result = await db.query(
                'SELECT * FROM users WHERE email = $1',
                [email]
            );
            if (result.rows.length === 0) {
                return null;
            }
            return new User(result.rows[0]);
        } catch (error) {
            console.error('Error finding user by email:', error);
            throw error;
        }
    }
    // Find a user by ID
    static async findById(id) {
        try {
            const result = await db.query(
                'SELECT id, email, name, created_at, updated_at FROM users WHERE id = $1',
                [id]
            );
            if (result.rows.length === 0) {
                return null;
            }
            return new User(result.rows[0]);
        } catch (error) {
            console.error('Error finding user by ID:'
                , error);
            throw error;
        }
    }
    // Verify a password against the stored hash
    // This method is used during login to check if the provided password is
    correct
    async verifyPassword(password) {
        try {
            return await bcrypt.compare(password, this.password_hash);
        } catch (error) {
            console.error('Error verifying password:', error);
            return false;
        }
    }
    // Convert user instance to JSON, excluding sensitive data
    // We never want to send password hashes to the client
    toJSON() {
        return {
            id: this.id,
            email: this.email,
            name: this.name,
            created_at: this.created_at,
            updated_at: this.updated_at
        };
    }
}
module.exports = User;