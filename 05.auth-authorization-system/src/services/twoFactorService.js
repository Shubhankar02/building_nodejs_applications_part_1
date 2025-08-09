const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const crypto = require('crypto');

class TwoFactorService {
    // Generate a new 2FA secret for a user
    static generateSecret(userEmail, serviceName = 'Auth System') {
        const secret = speakeasy.generateSecret({
            name: userEmail,
            issuer: serviceName,
            length: 32
        });

        return secret;
    }

    // Generate QR code for 2FA setup
    static async generateQRCode(secret) {
        try {
            const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);
            return qrCodeUrl;
        } catch (error) {
            console.error('Error generating QR code:', error);
            throw error;
        }
    }

    // Verify a 2FA code
    static verifyCode(secret, token, window = 1) {
        try {
            const verified = speakeasy.totp.verify({
                secret: secret,
                encoding: 'base32',
                token: token,
                window: window // Allow some time drift
            });

            return verified;
        } catch (error) {
            console.error('Error verifying 2FA code:', error);
            return false;
        }
    }

    // Generate backup codes for 2FA
    static generateBackupCodes(count = 10) {
        const codes = [];
        for (let i = 0; i < count; i++) {
            // Generate 8-character alphanumeric backup codes
            const code = crypto.randomBytes(4).toString('hex').toUpperCase();
            codes.push(code);
        }
        return codes;
    }

    // Verify backup code
    static verifyBackupCode(storedCodes, providedCode) {
        const index = storedCodes.indexOf(providedCode.toUpperCase());
        if (index !== -1) {
            // Remove used backup code
            storedCodes.splice(index, 1);
            return true;
        }
        return false;
    }

    // Generate emergency codes for account recovery
    static generateEmergencyCodes(count = 5) {
        const codes = [];
        for (let i = 0; i < count; i++) {
            // Generate longer emergency codes
            const code = crypto.randomBytes(8).toString('hex').toUpperCase();
            codes.push(code);
        }
        return codes;
    }
}

module.exports = TwoFactorService;
