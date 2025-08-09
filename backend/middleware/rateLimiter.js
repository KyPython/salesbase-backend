/**
 * API Rate Limiting Middleware
 * 
 * Implements enterprise-grade rate limiting with different tiers
 * and configurable limits based on endpoint and user role.
 */
const redis = require('redis');
const { RateLimiterRedis } = require('rate-limiter-flexible');
const config = require('../config');

// Create Redis client
let redisClient;

// Initialize Redis client if Redis is available
try {
  redisClient = redis.createClient({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    enable_offline_queue: false,
  });
  
  // Log Redis connection errors but don't crash the app
  redisClient.on('error', (error) => {
    console.error('Redis error:', error);
  });
} catch (error) {
  console.error('Redis client creation error:', error);
}

// Fall back to memory if Redis is unavailable
const { RateLimiterMemory } = require('rate-limiter-flexible');

// Define rate limiting tiers with points and duration
const rateLimitTiers = {
  // Standard API endpoints
  standard: {
    points: 100,         // 100 requests
    duration: 15 * 60,   // per 15 minutes
  },
  // Authentication endpoints (more restricted)
  auth: {
    points: 10,          // 10 requests
    duration: 60,        // per minute
  },
  // Data export endpoints (heavily restricted)
  export: {
    points: 5,           // 5 requests
    duration: 60 * 60,   // per hour
  },
  // Admin operations
  admin: {
    points: 200,         // 200 requests
    duration: 15 * 60,   // per 15 minutes
  },
  // Special increased limits for premium tenants
  premium: {
    points: 300,         // 300 requests
    duration: 15 * 60,   // per 15 minutes
  }
};

// Create rate limiters for each tier
const limiters = {};

// Initialize rate limiters
Object.keys(rateLimitTiers).forEach(tier => {
  const tierConfig = rateLimitTiers[tier];
  
  if (redisClient && redisClient.connected) {
    // Use Redis-based rate limiter if Redis is available
    limiters[tier] = new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: `ratelimit:${tier}`,
      points: tierConfig.points,
      duration: tierConfig.duration,
    });
  } else {
    // Fall back to memory-based rate limiter
    limiters[tier] = new RateLimiterMemory({
      keyPrefix: `ratelimit:${tier}`,
      points: tierConfig.points,
      duration: tierConfig.duration,
    });
  }
});

/**
 * Determines which rate limiter tier to use based on the request
 * 
 * @param {Object} req - Express request object
 * @returns {string} - The tier name to use
 */
const getTierForRequest = (req) => {
  const path = req.path.toLowerCase();
  
  // Check for authentication endpoints
  if (path.includes('/auth/') || path.includes('/login') || path.includes('/register')) {
    return 'auth';
  }
  
  // Check for export endpoints
  if (path.includes('/export') || 
      (path.includes('/report') && req.query.format === 'csv') ||
      path.endsWith('/csv') || path.endsWith('/xlsx')) {
    return 'export';
  }
  
  // Check for admin endpoints
  if (path.includes('/admin') || 
      (req.user && req.user.role === 'admin')) {
    return 'admin';
  }
  
  // Check if user belongs to a premium tenant
  if (req.user && req.user.tenantTier === 'premium') {
    return 'premium';
  }
  
  // Default to standard tier
  return 'standard';
};

/**
 * Rate limiting middleware function
 * 
 * @param {Object} options - Optional configuration
 * @param {string} options.tier - Force a specific tier instead of auto-detection
 * @param {number} options.points - Override points limit
 * @returns {Function} - Express middleware function
 */
const rateLimiter = (options = {}) => {
  return async (req, res, next) => {
    try {
      // Determine which key to use for rate limiting
      // Use API key if available, otherwise IP address
      const key = req.headers['x-api-key'] || 
                 req.user?.id?.toString() || 
                 req.ip.replace(/::ffff:/, '');
                 
      // Get the tier to use (from options or auto-detect)
      const tier = options.tier || getTierForRequest(req);
      
      // Get the appropriate limiter
      const limiter = limiters[tier] || limiters.standard;
      
      // Try to consume a point
      const rateLimitResult = await limiter.consume(key, options.points || 1);
      
      // Add rate limit headers
      res.setHeader('X-RateLimit-Limit', rateLimitResult.limit);
      res.setHeader('X-RateLimit-Remaining', rateLimitResult.remainingPoints);
      res.setHeader('X-RateLimit-Reset', new Date(Date.now() + rateLimitResult.msBeforeNext).toISOString());
      
      next();
    } catch (error) {
      if (error.remainingPoints !== undefined) {
        // This is a rate limit error
        res.setHeader('Retry-After', Math.ceil(error.msBeforeNext / 1000));
        res.setHeader('X-RateLimit-Limit', error.limit);
        res.setHeader('X-RateLimit-Remaining', 0);
        res.setHeader('X-RateLimit-Reset', new Date(Date.now() + error.msBeforeNext).toISOString());
        
        res.status(429).json({
          error: 'Too many requests',
          message: 'API rate limit exceeded. Please try again later.',
          retryAfter: Math.ceil(error.msBeforeNext / 1000)
        });
      } else {
        // This is some other error
        console.error('Rate limiting error:', error);
        
        // Don't block the request if rate limiting fails
        next();
      }
    }
  };
};

// Export the middleware
module.exports = rateLimiter;
