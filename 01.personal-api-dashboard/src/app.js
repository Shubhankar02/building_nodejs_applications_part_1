const express = require('express');
const dotenv = require('dotenv');
const dashboardController = require('./controllers/dashboardController');

// Load environment variables from .env file
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware for parsing JSON requests
app.use(express.json());

// Custom middleware to log all requests
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Basic route for testing
app.get('/', (req, res) => {
    res.json({
        message: 'Welcome to your Personal API Dashboard',
        availableEndpoints: [
            '/health',
            '/dashboard',
            '/weather',
            '/news',
            '/quote',
            '/crypto'
        ]
    });
});

// Dashboard routes
app.get('/dashboard', dashboardController.getDashboard);
app.get('/weather', dashboardController.getWeather);
app.get('/news', dashboardController.getNews);
app.get('/quote', dashboardController.getQuote);
app.get('/crypto', dashboardController.getCrypto);

// Global error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err.message);
    console.error('Stack:', err.stack);

    res.status(500).json({
        error: 'Something went wrong!',
        message: err.message,
        timestamp: new Date().toISOString()
    });
});

// Handle 404 errors for undefined routes
app.use((req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        message: `The endpoint ${req.originalUrl} does not exist`,
        timestamp: new Date().toISOString()
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Visit http://localhost:${PORT} to see your dashboard`);
});

module.exports = app;