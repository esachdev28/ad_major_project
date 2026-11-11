/**
 * tests/step3_monitoring.test.js
 *
 * Automated verification tests for Step 3:
 * - Asynchronous Monitoring Worker cycle execution
 * - Redis heartbeat publication
 * - Latency percentiles (P50, P95, P99) & time-series endpoints
 */

const assert = require('assert');
const prisma = require('../lib/prisma');
const redis = require('../lib/redis');
const { runMonitoringCycle } = require('../workers/monitoringWorker');
const express = require('express');
const dashboardRoutes = require('../routes/dashboardRoutes');
const endpointRoutes = require('../routes/endpointRoutes');

async function runTests() {
  console.log('🧪 Starting Step 3: Monitoring Engine & Analytics Verification Tests...\n');

  // 1. Test Worker cycle
  console.log('Test 1: Execute monitoring worker cycle & verify Redis heartbeat');
  const cycleRes = await runMonitoringCycle();
  assert(typeof cycleRes.probedCount === 'number', 'probedCount should be a number');
  if (redis.status === 'wait') await redis.connect();
  const hb = await redis.get('worker:heartbeat');
  assert(hb, 'Worker heartbeat should be recorded in Redis');
  console.log(`  ✅ Passed (Heartbeat: ${hb})`);

  // 2. Test Dashboard Analytics & Endpoint History APIs
  const app = express();
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/endpoints', endpointRoutes);

  const server = app.listen(5096);
  try {
    console.log('Test 2: Verify GET /api/dashboard/analytics returns P50, P95, P99 percentiles');
    const resAnalytics = await fetch('http://127.0.0.1:5096/api/dashboard/analytics');
    const jsonAnalytics = await resAnalytics.json();
    assert.strictEqual(resAnalytics.status, 200);
    assert.strictEqual(jsonAnalytics.success, true);
    assert(typeof jsonAnalytics.data.percentiles.p50 === 'number');
    assert(typeof jsonAnalytics.data.percentiles.p95 === 'number');
    assert(typeof jsonAnalytics.data.percentiles.p99 === 'number');
    assert(Array.isArray(jsonAnalytics.data.series));
    console.log(`  ✅ Passed (Analyzed: ${jsonAnalytics.data.totalAnalyzed} probes, P95: ${jsonAnalytics.data.percentiles.p95}ms)`);

    console.log('Test 3: Verify GET /api/endpoints/:id/history calculates uptime & distribution');
    const ep = await prisma.aPIEndpoint.findFirst();
    assert(ep, 'At least one endpoint must exist in DB');
    const resHist = await fetch(`http://127.0.0.1:5096/api/endpoints/${ep.id}/history`);
    const jsonHist = await resHist.json();
    assert.strictEqual(resHist.status, 200);
    assert.strictEqual(jsonHist.success, true);
    assert(typeof jsonHist.data.uptime === 'number');
    assert(jsonHist.data.statusDistribution);
    console.log(`  ✅ Passed (Endpoint: ${ep.name}, Uptime: ${jsonHist.data.uptime}%)`);
  } finally {
    server.close();
  }

  console.log('\n🎉 ALL STEP 3 VERIFICATION TESTS PASSED SUCCESSFULLY!\n');
}

runTests()
  .catch((err) => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    try {
      await redis.quit();
    } catch (_) {}
  });
