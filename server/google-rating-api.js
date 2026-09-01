/**
 * Secure Google Places API wrapper
 * Handles authentication and caching of Google business ratings
 *
 * Environment variables required:
 * - GOOGLE_PLACES_API_KEY: Google Places API key (restricted to Places API)
 * - GOOGLE_BUSINESS_PLACE_ID: Place ID for "Teppich Paradies Oranienburg GmbH"
 */

const fetch = require('node-fetch');

const CACHE_DURATION = 3600000; // 1 hour in ms
const GOOGLE_PLACES_API_URL = 'https://places.googleapis.com/v1/places';

let cachedRating = null;
let cacheExpireTime = 0;

/**
 * Fetch the Google business rating from Places API
 * @returns {Promise<{rating: number, userRatingCount: number, error?: string}>}
 */
async function getGoogleRating() {
  // Return cached result if still valid
  if (cachedRating && Date.now() < cacheExpireTime) {
    console.log('[Google Rating] Returning cached rating');
    return cachedRating;
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const placeId = process.env.GOOGLE_BUSINESS_PLACE_ID;

  if (!apiKey || !placeId) {
    console.error('[Google Rating] Missing required environment variables');
    return {
      error: 'API configuration missing',
      rating: null,
      userRatingCount: null
    };
  }

  try {
    const fields = 'places.rating,places.userRatingCount';
    const url = `${GOOGLE_PLACES_API_URL}/${placeId}?fields=${fields}&key=${apiKey}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 5000 // 5 second timeout
    });

    if (!response.ok) {
      throw new Error(`Places API returned ${response.status}`);
    }

    const data = await response.json();

    if (!data.places || !data.places[0]) {
      throw new Error('No place data in response');
    }

    const place = data.places[0];
    const result = {
      rating: place.rating || null,
      userRatingCount: place.userRatingCount || 0,
      timestamp: new Date().toISOString()
    };

    // Update cache
    cachedRating = result;
    cacheExpireTime = Date.now() + CACHE_DURATION;

    console.log('[Google Rating] Successfully fetched:', result);
    return result;

  } catch (error) {
    console.error('[Google Rating] Error fetching from Places API:', error);
    return {
      error: error.message,
      rating: null,
      userRatingCount: null
    };
  }
}

/**
 * Express middleware for the rating endpoint
 */
function createRatingEndpoint() {
  return async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', process.env.SHOPIFY_STORE_URL || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    try {
      const rating = await getGoogleRating();

      // Don't expose errors or send fallback values on API failure
      if (rating.error || rating.rating === null) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Rating unavailable' }));
        return;
      }

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${Math.floor(CACHE_DURATION / 1000)}`
      });
      res.end(JSON.stringify({
        rating: rating.rating,
        userRatingCount: rating.userRatingCount,
        timestamp: rating.timestamp
      }));

    } catch (error) {
      console.error('[Google Rating Endpoint] Unhandled error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  };
}

module.exports = {
  getGoogleRating,
  createRatingEndpoint
};
