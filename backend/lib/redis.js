/**
 * lib/redis.js
 *
 * Centralized Redis connection manager for API Sentinel background queues,
 * job synchronization, and caching.
 */

const Redis = require('ioredis');

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 200, 3000);
    return delay;
  },
  enableReadyCheck: true,
  lazyConnect: true,
});

redis.on('connect', () => {
  console.log(`[Redis] Connected to broker at ${redisUrl}`);
});

redis.on('error', (err) => {
  // Graceful log without crashing process
  console.warn(`[Redis] Connection warning: ${err.message}`);
});

module.exports = redis;

