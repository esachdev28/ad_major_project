/**
 * tests/step4_incidents.test.js
 *
 * Automated verification tests for Step 4:
 * - Threshold-based Incident Creation (3 consecutive failures)
 * - Incident Deduplication (no duplicate spam incidents)
 * - Incident Acknowledgment API
 * - Automatic Incident Resolution on Recovery
 */

const assert = require('assert');
const prisma = require('../lib/prisma');
const { evaluateCheckForIncident } = require('../services/incidentService');
const express = require('express');
const incidentRoutes = require('../routes/incidentRoutes');

async function runTests() {
  console.log('🧪 Starting Step 4: Incident Detection & Deduplication Verification Tests...\n');

  // Create isolated test endpoint
  const ep = await prisma.aPIEndpoint.create({
    data: {
      name: 'Incident Test Service',
      url: 'https://httpbin.org/status/200',
      method: 'GET',
      failureThreshold: 3,
      isActive: false, // prevent docker worker interference
    },
  });

  try {
    // 1. Failure #1 (below threshold)
    console.log('Test 1: Failure #1 and #2 stay below threshold');
    const c1 = await prisma.healthCheck.create({
      data: { endpointId: ep.id, statusCode: 503, latency: 120, isHealthy: false, errorMessage: 'Service Unavailable' },
    });
    const res1 = await evaluateCheckForIncident(ep, c1);
    assert.strictEqual(res1.action, 'BELOW_THRESHOLD');

    const c2 = await prisma.healthCheck.create({
      data: { endpointId: ep.id, statusCode: 503, latency: 130, isHealthy: false, errorMessage: 'Service Unavailable' },
    });
    const res2 = await evaluateCheckForIncident(ep, c2);
    assert.strictEqual(res2.action, 'BELOW_THRESHOLD');
    console.log('  ✅ Passed (No premature incidents created)');

    // 2. Failure #3 (meets threshold -> opens incident)
    console.log('Test 2: Failure #3 triggers CRITICAL OPEN incident');
    const c3 = await prisma.healthCheck.create({
      data: { endpointId: ep.id, statusCode: 503, latency: 140, isHealthy: false, errorMessage: 'Service Unavailable' },
    });
    const res3 = await evaluateCheckForIncident(ep, c3);
    assert.strictEqual(res3.action, 'CREATED');
    assert.strictEqual(res3.incident.status, 'OPEN');
    assert.strictEqual(res3.incident.severity, 'CRITICAL');
    assert.strictEqual(res3.incident.occurrenceCount, 3);
    console.log(`  ✅ Passed (Created Incident ID: ${res3.incident.id})`);

    // 3. Failure #4 (deduplication -> increments occurrenceCount instead of creating duplicate)
    console.log('Test 3: Failure #4 deduplicates onto active incident');
    const c4 = await prisma.healthCheck.create({
      data: { endpointId: ep.id, statusCode: 503, latency: 150, isHealthy: false, errorMessage: 'Service Unavailable' },
    });
    const res4 = await evaluateCheckForIncident(ep, c4);
    assert.strictEqual(res4.action, 'DEDUPLICATED');
    assert.strictEqual(res4.incident.id, res3.incident.id);
    assert.strictEqual(res4.incident.occurrenceCount, 4);
    const totalIncidents = await prisma.incident.count({ where: { endpointId: ep.id } });
    assert.strictEqual(totalIncidents, 1);
    console.log('  ✅ Passed (Occurrence count = 4, Total incidents = 1)');

    // 4. Test API Acknowledge route
    console.log('Test 4: PATCH /api/incidents/:id/acknowledge transitions status to ACKNOWLEDGED');
    const app = express();
    app.use(express.json());
    app.use('/api/incidents', incidentRoutes);
    const server = app.listen(5095);
    try {
      const ackRes = await fetch(`http://127.0.0.1:5095/api/incidents/${res3.incident.id}/acknowledge`, {
        method: 'PATCH',
      });
      const ackJson = await ackRes.json();
      assert.strictEqual(ackRes.status, 200);
      assert.strictEqual(ackJson.data.status, 'ACKNOWLEDGED');
      console.log('  ✅ Passed');
    } finally {
      server.close();
    }

    // 5. Healthy check triggers Auto-Resolution
    console.log('Test 5: Healthy check triggers automatic incident resolution');
    const c5 = await prisma.healthCheck.create({
      data: { endpointId: ep.id, statusCode: 200, latency: 45, isHealthy: true },
    });
    const res5 = await evaluateCheckForIncident(ep, c5);
    assert.strictEqual(res5.action, 'RESOLVED');
    assert.strictEqual(res5.incident.status, 'RESOLVED');
    assert(res5.incident.resolvedAt !== null);
    console.log('  ✅ Passed (Auto-resolved incident)');
  } finally {
    // Cleanup test endpoint (cascades checks & incidents)
    await prisma.aPIEndpoint.delete({ where: { id: ep.id } });
  }

  console.log('\n🎉 ALL STEP 4 VERIFICATION TESTS PASSED SUCCESSFULLY!\n');
}

runTests()
  .catch((err) => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
