const express = require('express');
const AuthController = require('../controllers/authController');
const { authenticateToken, requireEmailVerification } = require('../middleware/authentication');
const { authRateLimit, passwordResetRateLimit } = require('../middleware/rateLimiting');
const { requireAdmin, requireModerator } = require('../middleware/authorization');

const router = express.Router();

// Public authentication routes with rate limiting
// Use registration-specific limiter to avoid contention with login attempts
const { registrationRateLimit } = require('../middleware/rateLimiting');
router.post('/register', registrationRateLimit, AuthController.register);
router.post('/login', authRateLimit, AuthController.login);
router.post('/refresh', AuthController.refreshToken);
router.post('/forgot-password', passwordResetRateLimit, AuthController.requestPasswordReset);
router.post('/reset-password', passwordResetRateLimit, AuthController.resetPassword);
router.get('/verify-email/:token', AuthController.verifyEmail);
router.post('/resend-verification', authRateLimit, AuthController.resendEmailVerification);

// Protected routes requiring authentication
router.use(authenticateToken);

// Basic profile operations
router.get('/profile', AuthController.getProfile);
router.put('/profile', AuthController.updateProfile);
router.post('/logout', AuthController.logout);

// Password management (requires email verification)
router.post('/change-password', requireEmailVerification, AuthController.changePassword);

// Two-factor authentication routes
router.post('/enable-2fa', requireEmailVerification, AuthController.enableTwoFactor);
router.post('/verify-2fa', requireEmailVerification, AuthController.verifyTwoFactor);
router.post('/disable-2fa', requireEmailVerification, AuthController.disableTwoFactor);

module.exports = router;