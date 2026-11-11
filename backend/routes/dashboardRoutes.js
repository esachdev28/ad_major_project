/**
 * dashboardRoutes.js
 * 
 * 1. Why this file exists:
 *    Serves dashboard statistics computed directly from PostgreSQL using Prisma ORM.
 *    Replaces the previous static demo metrics with dynamic database aggregates.
 * 
 * 2. What its responsibilities are:
 *    - Handle GET requests for `/api/dashboard/stats`.
 *    - Query PostgreSQL via Prisma to compute:
 *      * Total registered APIs (count of APIEndpoint records).
 *      * Healthy APIs (count of endpoints whose most recent HealthCheck is healthy).
 *      * Failed APIs (count of endpoints whose most recent HealthCheck is unhealthy).
 *      * Average latency (aggregate average latency across HealthCheck records).
 *    - Return a clear "dataSource": "database" indicator.
 *    - Return 0 counts and "0 ms" if the database tables are empty, without throwing errors.
 *    - Handle database connectivity failures safely without leaking credentials.
 * 
 * 3. Which functions/handlers it contains:
 *    - GET /stats handler: Asynchronously queries Prisma and responds with metrics JSON.
 * 
 * 4. How it communicates with other files:
 *    - Imports shared `prisma` client from `../lib/prisma`.
 *    - Exported via `module.exports` and mounted in `server.js` at `/api/dashboard`.
 *    - Consumed by `frontend/src/services/api.js` to render the React dashboard cards.
 * 
 * 5. Database Request Flow:
 *    React Dashboard -> Express Route (GET /api/dashboard/stats) -> Prisma Client
 *    -> PostgreSQL Database -> Prisma Response -> Express JSON Response -> React State -> UI Update.
 */

const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');

// GET /api/dashboard/stats
// Calculates live operational statistics from PostgreSQL using Prisma
router.get('/stats', async (req, res) => {
  try {
    // 1. Fetch endpoints along with their latest health check (ordered by checkedAt descending)
    // This single query replaces the separate count() call — endpoints.length gives the total
    const endpoints = await prisma.aPIEndpoint.findMany({
      select: {
        id: true,
        healthChecks: {
          orderBy: { checkedAt: 'desc' },
          take: 1,
          select: {
            isHealthy: true,
            latency: true
          }
        }
      }
    });

    const totalApis = endpoints.length;

    // 2. Count healthy and failed endpoints based on their latest health check
    let healthyApis = 0;
    let failedApis = 0;

    for (const ep of endpoints) {
      const latestCheck = ep.healthChecks[0];
      if (latestCheck) {
        if (latestCheck.isHealthy) {
          healthyApis++;
        } else {
          failedApis++;
        }
      }
    }

    // 3. Calculate average latency across all available HealthCheck records using Prisma aggregate
    const latencyAggregate = await prisma.healthCheck.aggregate({
      _avg: {
        latency: true
      }
    });

    const avgLatencyNum = latencyAggregate._avg.latency
      ? Math.round(latencyAggregate._avg.latency)
      : 0;

    // 4. Send clean JSON response
    return res.status(200).json({
      success: true,
      dataSource: 'database',
      data: {
        totalApis,
        healthyApis,
        failedApis,
        averageLatency: `${avgLatencyNum} ms`
      },
      message: 'Live database-backed statistics'
    });
  } catch (error) {
    // Log internal error on server without leaking sensitive DB credentials to client
    console.error('Error fetching dashboard statistics from database:', error.message);

    // Return safe fallback values so frontend doesn't crash if database is temporarily unavailable
    return res.status(500).json({
      success: false,
      dataSource: 'database',
      data: {
        totalApis: 0,
        healthyApis: 0,
        failedApis: 0,
        averageLatency: '0 ms'
      },
      message: 'Failed to retrieve database statistics. Please ensure PostgreSQL is connected.'
    });
  }
});

module.exports = router;
