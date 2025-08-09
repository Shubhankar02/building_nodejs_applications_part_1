// Simple in-memory rate limiter
// In a production application, you'd use Redis or a similar store
const requestCounts = new Map();

function rateLimiter(maxRequests = 100, windowMs = 15 * 60 * 1000) {
    return (req, res, next) => {
        const clientId = req.ip || 'unknown';
        const currentTime = Date.now();

        // Clean up old entries
        for (const [id, data] of requestCounts.entries()) {
            if (currentTime - data.firstRequest > windowMs) {
                requestCounts.delete(id);
            }
        }

        // Check current client's request count
        const clientData = requestCounts.get(clientId);

        if (!clientData) {
            requestCounts.set(clientId, {
                count: 1,
                firstRequest: currentTime
            });
            return next();
        }

        if (clientData.count >= maxRequests) {
            return res.status(429).json({
                error: 'Too many requests',
                message: 'Rate limit exceeded. Please try again later.',
                timestamp: new Date().toISOString()
            });
        }

        clientData.count++;
        next();
    };
}

module.exports = rateLimiter;
