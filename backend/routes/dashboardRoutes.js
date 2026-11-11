/**
 * dashboardRoutes.js
 *
 * Serves live operational statistics, worker status, and fleet-wide
 * latency trends from PostgreSQL and Redis.
 */

const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const redis = require('../lib/redis');

/**
 * Helper to compute P50, P95, P99 latency percentiles from a sorted array of numbers.
 */
function calculatePercentiles(latencies) {
  if (!latencies || latencies.length === 0) {
    return { p50: 0, p95: 0, p99: 0 };
  }
  const sorted = [...latencies].sort((a, b) => a - b);
  const getPerc = (p) => {
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
  };
  return {
    p50: getPerc(50),
    p95: getPerc(95),
    p99: getPerc(99),
  };
}

// GET /api/dashboard/stats
router.get('/stats', async (req, res) => {
  try {
    const [endpoints, openIncidentsCount, totalChecksCount, latencyAggregate] = await Promise.all([
      prisma.aPIEndpoint.findMany({
        select: {
          id: true,
          healthChecks: {
            orderBy: { checkedAt: 'desc' },
            take: 1,
            select: {
              isHealthy: true,
              latency: true,
            },
          },
        },
      }),
      prisma.incident.count({ where: { status: 'OPEN' } }),
      prisma.healthCheck.count(),
      prisma.healthCheck.aggregate({
        _avg: { latency: true },
      }),
    ]);

    const totalApis = endpoints.length;
    let healthyApis = 0;
    let failedApis = 0;

    for (const ep of endpoints) {
      const latestCheck = ep.healthChecks[0];
      if (latestCheck) {
        if (latestCheck.isHealthy) healthyApis++;
        else failedApis++;
      }
    }

    const avgLatencyNum = latencyAggregate._avg.latency
      ? Math.round(latencyAggregate._avg.latency)
      : 0;

    // Check Docker Worker status via Redis heartbeat
    let workerHeartbeat = null;
    let workerOnline = false;
    try {
      if (redis.status === 'wait') await redis.connect();
      workerHeartbeat = await redis.get('worker:heartbeat');
      if (workerHeartbeat) {
        const diffMs = Date.now() - new Date(workerHeartbeat).getTime();
        workerOnline = diffMs < 60000;
      }
    } catch (_) {}

    return res.status(200).json({
      success: true,
      dataSource: 'database',
      data: {
        totalApis,
        healthyApis,
        failedApis,
        activeIncidents: openIncidentsCount,
        totalChecks: totalChecksCount,
        averageLatency: `${avgLatencyNum} ms`,
        workerOnline,
        workerHeartbeat,
      },
      message: 'Live database-backed statistics',
    });
  } catch (error) {
    console.error('Error fetching dashboard statistics:', error.message);
    return res.status(500).json({
      success: false,
      dataSource: 'database',
      data: {
        totalApis: 0,
        healthyApis: 0,
        failedApis: 0,
        activeIncidents: 0,
        totalChecks: 0,
        averageLatency: '0 ms',
        workerOnline: false,
      },
      message: 'Failed to retrieve database statistics.',
    });
  }
});

// GET /api/dashboard/analytics
// Returns fleet latency history, percentile calculations (P50, P95, P99), and recent logs
router.get('/analytics', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours, 10) || 24;
    const sinceDate = new Date(Date.now() - hours * 3600 * 1000);

    const recentChecks = await prisma.healthCheck.findMany({
      where: {
        checkedAt: { gte: sinceDate },
      },
      orderBy: { checkedAt: 'desc' },
      take: 100,
      include: {
        endpoint: {
          select: { name: true, method: true },
        },
      },
    });

    const latencies = recentChecks.map((c) => c.latency).filter((l) => typeof l === 'number');
    const percentiles = calculatePercentiles(latencies);

    const total = recentChecks.length;
    const healthyCount = recentChecks.filter((c) => c.isHealthy).length;
    const errorRate = total > 0 ? Number((((total - healthyCount) / total) * 100).toFixed(2)) : 0;

    // Reverse to chronological order for charting
    const series = [...recentChecks].reverse().map((c) => ({
      id: c.id,
      endpointName: c.endpoint?.name || 'Unknown',
      latency: c.latency || 0,
      statusCode: c.statusCode,
      isHealthy: c.isHealthy,
      checkedAt: c.checkedAt,
    }));

    return res.status(200).json({
      success: true,
      data: {
        percentiles,
        errorRate,
        totalAnalyzed: total,
        series,
      },
    });
  } catch (error) {
    console.error('Error computing dashboard analytics:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to compute latency analytics.',
    });
  }
});

module.exports = router;
