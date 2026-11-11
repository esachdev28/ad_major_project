/**
 * workers/monitoringWorker.js
 *
 * Asynchronous Background Monitoring Engine for API Sentinel.
 * Designed to run inside Docker (`docker-compose up worker`) or as a standalone Node worker.
 *
 * Features:
 * - Periodic evaluation of all active endpoints based on custom intervals.
 * - Distributed Redis locking (`SET ... NX EX`) to prevent duplicate overlapping jobs.
 * - Bounded concurrency pool (max 5 parallel HTTP probes) to protect network resources.
 * - Publishes live worker heartbeat to Redis for operational visibility.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const prisma = require('../lib/prisma');
const redis = require('../lib/redis');
const { executeProbe } = require('../services/probeService');

const CONCURRENCY_LIMIT = 5;
const SCHEDULER_TICK_MS = 10000; // Evaluate endpoints every 10 seconds

/**
 * Executes a single monitoring cycle: finds due endpoints, acquires locks,
 * and runs bounded concurrent health checks.
 */
async function runMonitoringCycle() {
  const cycleStart = Date.now();
  let probedCount = 0;

  try {
    // 1. Update worker heartbeat in Redis
    try {
      if (redis.status === 'wait') await redis.connect();
      await redis.set('worker:heartbeat', new Date().toISOString(), 'EX', 60);
    } catch (_) {
      // Redis optional fallback: continue even if Redis is briefly restarting
    }

    // 2. Fetch active endpoints along with their single most recent check
    const endpoints = await prisma.aPIEndpoint.findMany({
      where: { isActive: true },
      include: {
        healthChecks: {
          orderBy: { checkedAt: 'desc' },
          take: 1,
        },
      },
    });

    const nowMs = Date.now();
    const dueEndpoints = [];

    // 3. Identify endpoints whose monitoring interval has elapsed
    for (const ep of endpoints) {
      const latestCheck = ep.healthChecks[0];
      const intervalMs = (ep.interval || 60) * 1000;

      if (!latestCheck) {
        dueEndpoints.push(ep);
      } else {
        const lastCheckTime = new Date(latestCheck.checkedAt).getTime();
        if (nowMs - lastCheckTime >= intervalMs) {
          dueEndpoints.push(ep);
        }
      }
    }

    if (dueEndpoints.length === 0) {
      return { probedCount: 0, elapsedMs: Date.now() - cycleStart };
    }

    console.log(`[Worker] Found ${dueEndpoints.length} endpoint(s) due for probing...`);

    // 4. Process due endpoints in bounded concurrency batches
    for (let i = 0; i < dueEndpoints.length; i += CONCURRENCY_LIMIT) {
      const batch = dueEndpoints.slice(i, i + CONCURRENCY_LIMIT);

      await Promise.allSettled(
        batch.map(async (ep) => {
          const lockKey = `lock:probe:${ep.id}`;
          let lockAcquired = true;

          try {
            if (redis.status === 'ready') {
              const lockRes = await redis.set(lockKey, 'locked', 'EX', 15, 'NX');
              lockAcquired = lockRes === 'OK';
            }
          } catch (_) {}

          if (!lockAcquired) {
            return; // Skip if another worker instance is already probing this endpoint
          }

          try {
            const result = await executeProbe(ep);
            probedCount++;
            const statusLabel = result.check.isHealthy ? 'HEALTHY' : 'FAILED';
            console.log(
              `[Worker] Probed [${ep.method}] ${ep.name} -> ${statusLabel} (${result.check.statusCode || 'ERR'}, ${result.check.latency}ms)`
            );
          } catch (probeErr) {
            console.error(`[Worker] Error probing ${ep.name}:`, probeErr.message);
          } finally {
            try {
              if (redis.status === 'ready') await redis.del(lockKey);
            } catch (_) {}
          }
        })
      );
    }
  } catch (err) {
    console.error('[Worker] Cycle error:', err.message);
  }

  return { probedCount, elapsedMs: Date.now() - cycleStart };
}

/**
 * Starts the continuous worker loop if executed directly as a standalone process.
 */
async function startWorker() {
  console.log('[Worker] 🛡️ API Sentinel Background Monitoring Worker started');
  console.log(`[Worker] Concurrency Limit: ${CONCURRENCY_LIMIT} | Tick Interval: ${SCHEDULER_TICK_MS / 1000}s`);

  try {
    await redis.connect();
  } catch (_) {}

  // Run first cycle immediately on boot
  await runMonitoringCycle();

  // Schedule recurring ticks
  const timer = setInterval(runMonitoringCycle, SCHEDULER_TICK_MS);

  const shutdown = async (signal) => {
    console.log(`\n[Worker] Received ${signal}. Closing worker gracefully...`);
    clearInterval(timer);
    await prisma.$disconnect();
    try {
      await redis.quit();
    } catch (_) {}
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

if (require.main === module) {
  startWorker();
}

module.exports = {
  runMonitoringCycle,
  startWorker,
  CONCURRENCY_LIMIT,
};
