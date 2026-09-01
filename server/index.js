/**
 * Express server for Teppich Paradies Shopify theme
 * Provides secure backend endpoints for theme functionality
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { createRatingEndpoint } = require('./google-rating-api');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: [
    'https://teppich-paradies-live.myshopify.com',
    'https://teppich-paradies.de',
    'https://www.teppich-paradies.de',
    'http://localhost:3000', // For development
    process.env.SHOPIFY_STORE_URL
  ].filter(Boolean)
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// Google rating endpoint
app.get('/api/store/google-rating', createRatingEndpoint());

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('[Express Error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 Health check: http://localhost:${PORT}/health`);
    console.log(`⭐ Google rating API: http://localhost:${PORT}/api/store/google-rating`);
  });
}

module.exports = app;
