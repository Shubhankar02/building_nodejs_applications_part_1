const apiService = require('../services/apiService');
// Controler for the main dashboard endpoint
// This aggregates data from al services
async function getDashboard(req, res) {
    try {
        const dashboardData = await apiService.getDashboardData();
        res.json({
            success: true,
            data: dashboardData
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
}
// Controler for weather data only
async function getWeather(req, res) {
    try {
        // Alow users to specify custom coordinates via query parameters
        const { latitude, longitude } = req.query;
        const weatherData = await apiService.getWeatherData(latitude, longitude);
        res.json({
            success: true,
            data: weatherData
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
}
// Controler for news data only
async function getNews(req, res) {
    try {
        // Alow users to specify how many stories they want
        const limit = parseInt(req.query.limit) || 5;
        // Validate the limit parameter
        if (limit < 1 || limit > 20) {
            return res.status(400).json({
                success: false,
                error: 'Limit must be between 1 and 20',
                timestamp: new Date().toISOString()
            });
        }
        const newsData = await apiService.getNewsData(limit);
        res.json({
            success: true,
            data: newsData
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
}// Controler for quote data only
async function getQuote(req, res) {
    try {
        const quoteData = await apiService.getQuoteData();
        res.json({
            success: true,
            data: quoteData
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
}
// Controler for cryptocurrency data only
async function getCrypto(req, res) {
    try {
        const cryptoData = await apiService.getCryptoData();
        res.json({
            success: true,
            data: cryptoData
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
}
module.exports = {
    getDashboard,
    getWeather,
    getNews,
    getQuote,
    getCrypto
};