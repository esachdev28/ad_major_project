/**
 * middleware/rateLimiter.js
 *
 * Production-grade Express rate limiting to protect API Sentinel against
 * denial-of-service (DoS), brute force, and probe flooding.
 */

const rateLimit = require('express-rate-limit');

/**
 * Global rate limiter for API endpoints:
 * Allows up to 1000 requests per 15-minute window per IP.
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this IP. Please try again after 15 minutes.',
  },
  skip: (req) => {
    // Optionally skip internal Docker health checks
    return req.path === '/api/health' || req.path === '/health';
  },
});

/**
 * Stricter rate limiter for manual health probe executions:
 * Allows up to 60 manual probes per minute per IP.
 */
const probeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many manual probe requests. Please wait a moment before probing again.',
  },
});

module.exports = {
  apiLimiter,
  probeLimiter,
};
