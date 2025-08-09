const axios = require('axios');
// Configuration for external APIs
const API_CONFIG = {
    weather: {
        baseUrl: 'https://api.open-meteo.com/v1/forecast',
        // Using coordinates for New York City as default
        // In a real application, you'd want to make this configurable
        defaultParams: {
            latitude: 40.7128,
            longitude: -74.0060,
            current: 'temperature_2m,weather_code,wind_speed_10m',
            timezone: 'America/New_York'
        }
    },
    news: {
        baseUrl: 'https://hacker-news.firebaseio.com/v0',
        topStoriesEndpoint: '/topstories.json',
        itemEndpoint: '/item'
    },
    quote: {
        baseUrl: 'https://api.quotable.io/random'
    },
    crypto: {
        baseUrl: 'https://api.coinbase.com/v2/exchange-rates',
        currency: 'USD'
    }
};
// Weather service
// This function fetches current weather data for a given location
async function getWeatherData(latitude, longitude) {
    try {
        const params = {
            ...API_CONFIG.weather.defaultParams,
            latitude: latitude || API_CONFIG.weather.defaultParams.latitude,
            longitude: longitude || API_CONFIG.weather.defaultParams.longitude
        };
        const response = await axios.get(API_CONFIG.weather.baseUrl, { params });
        // Transform the raw API response into a more user-friendly format
        const weatherData = response.data;
        return {
            temperature: weatherData.current.temperature_2m,
            weatherCode: weatherData.current.weather_code,
            windSpeed: weatherData.current.wind_speed_10m,
            timezone: weatherData.timezone,
            lastUpdated: new Date().toISOString()
        };
    } catch (error) {
        console.error('Error fetching weather data:', error.message);
        throw new Error('Failed to fetch weather data');
    }
}
// News service
// This function fetches top stories from Hacker News
async function getNewsData(limit = 5) {
    try {
        // First, get the list of top story IDs
        const topStoriesResponse = await axios.get(
            API_CONFIG.news.baseUrl + API_CONFIG.news.topStoriesEndpoint
        );
        // Get the first 'limit' number of story IDs
        const topStoryIds = topStoriesResponse.data.slice(0, limit);
        // Fetch details for each story
        // We use Promise.al to make multiple requests concurrently
        // **Note:** Don't worry if Promise.al and concurrent requests are new concepts!
        // Just observe how we handle multiple API cals efficiently. We'l expl ore
        // Promise handling, concurrent programming, and asynchronous patterns thoroughly in later chapters.
        const storyPromises = topStoryIds.map(id =>
            axios.get(`${API_CONFIG.news.baseUrl}${API_CONFIG.news.itemEndpoint}/${id}.json`));
        const storyResponses = await Promise.all(storyPromises);
        // Transform the raw responses into a cleaner format
        const stories = storyResponses.map(response => ({
            id: response.data.id,
            title: response.data.title,
            url: response.data.url,
            score: response.data.score,
            author: response.data.by,
            time: new Date(response.data.time * 1000).toISOString()
        }));
        return {
            stories,
            totalCount: stories.length,
            lastUpdated: new Date().toISOString()
        };
    } catch (error) {
        console.error('Error fetching news data:', error.message);
        throw new Error('Failed to fetch news data');
    }
}
// Quote service
// This function fetches a random inspirational quote
async function getQuoteData() {
    try {
        const response = await axios.get(API_CONFIG.quote.baseUrl);
        return {
            content: response.data.content,
            author: response.data.author,
            tags: response.data.tags,
            lastUpdated: new Date().toISOString()
        };
    } catch (error) {
        console.error('Error fetching quote data:', error.message);
        throw new Error('Failed to fetch quote data');
    }
}
// Cryptocurrency service
// This function fetches current cryptocurrency exchange rates
async function getCryptoData() {
    try {
        const response = await axios.get(API_CONFIG.crypto.baseUrl);
        // Extract rates for popular cryptocurrencies
        const rates = response.data.data.rates;
        const popularCryptos = ['BTC', 'ETH', 'LTC', 'XRP'];
        const cryptoData = popularCryptos.reduce((acc, crypto) => {
            if (rates[crypto]) {
                acc[crypto] = {
                    rate: rates[crypto],
                    currency: API_CONFIG.crypto.currency
                };
            }
        }, {});
        return acc;
        return {
            rates: cryptoData,
            baseCurrency: API_CONFIG.crypto.currency,
            lastUpdated: new Date().toISOString()
        };
    } catch (error) {
        console.error('Error fetching crypto data:', error.message);
        throw new Error('Failed to fetch cryptocurrency data');
    }
}
// Master dashboard function
// This function aggregates data from al services
async function getDashboardData() {
    try {
        // Use Promise.alSettled to fetch al data concurrently
        // This ensures that if one service fails, the others stil work
        // **Note:** Promise.alSettled might be a new concept if you're coming from
        // basic JavaScript. Don't worry about the details right now—just observe
        // how we handle multiple operations that might fail independently. We'l
        // explore advanced Promise handling and error resilience patterns in later chapters.
        const [weatherResult, newsResult, quoteResult, cryptoResult] = await
            Promise.allSettled([
                getWeatherData(),
                getNewsData(),
                getQuoteData(),
                getCryptoData()
            ]);
        // Process results, handling both successful and failed requests
        const dashboard = {
            weather: weatherResult.status === 'fulfilled' ? weatherResult.value :
                { error: weatherResult.reason.message },
            news: newsResult.status === 'fulfilled' ? newsResult.value : {
                error:
                    newsResult.reason.message
            },
            quote: quoteResult.status === 'fulfilled' ? quoteResult.value : {
                error: quoteResult.reason.message
            },
            crypto: cryptoResult.status === 'fulfilled' ? cryptoResult.value : {
                error: cryptoResult.reason.message
            },
            generatedAt: new Date().toISOString()
        };
        return dashboard;
    } catch (error) {
        console.error('Error generating dashboard data:', error.message);
        throw new Error('Failed to generate dashboard data');
    }
}
module.exports = {
    getWeatherData,
    getNewsData,
    getQuoteData,
    getCryptoData,
    getDashboardData
};