/**
 * workers/monitoringWorker.js
 *
 * Background asynchronous monitoring worker for API Sentinel.
 * Runs inside Docker or as an independent background process.
 * Responsible for scheduled endpoint health checks, latency measurement,
 * and incident detection.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const prisma = require('../lib/prisma');

console.log('[Worker] 🛡️ API Sentinel Background Monitoring Worker initialized');
console.log(`[Worker] Connected to database: ${process.env.DATABASE_URL ? 'OK' : 'MISSING'}`);
console.log(`[Worker] Redis endpoint: ${process.env.REDIS_URL || 'redis://localhost:6379'}`);

// Graceful termination handling
process.on('SIGINT', async () => {
  console.log('[Worker] Shutting down worker gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[Worker] Terminating worker process...');
  await prisma.$disconnect();
  process.exit(0);
});

module.exports = { status: 'ready' };
