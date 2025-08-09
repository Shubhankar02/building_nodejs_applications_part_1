const express = require('express');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const router = express.Router();
// User registration endpoint
router.post('/register', async (req, res) => {
    try {
        const { email, name, password } = req.body;
        // Basic validation
        if (!email || !name || !password) {
            return res.status(400).json({
                error: 'Email, name, and password are required'
            });
        }
        // Create new user using our User model
        const user = await User.create({ email, name, password });
        // Generate JWT token for immediate login
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '7d' }
        );
        res.status(201).json({
            message: 'User created successfully',
            user: user.toJSON(),
            token
        });
    } catch (error) {
        console.error('Registration error:', error);
        if (error.message === 'Email already exists') {
            return res.status(409).json({ error: error.message });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
});
// User login endpoint
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({
                error: 'Email and password are required'
            });
        }
        // Find user by email using our User model
        const user = await User.findByEmail(email);
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        // Verify password using the model method
        const isValidPassword = await user.verifyPassword(password);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        // Generate JWT token
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '7d' }
        );
        res.json({
            message: 'Login successful',
            user: user.toJSON(),
            token
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
module.exports = router;