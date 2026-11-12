/**
 * tests/step7_dependencies.test.js
 *
 * Automated verification tests for Step 7:
 * - Service & Integration Registry CRUD
 * - Self-dependency rejection
 * - Cycle-safe BFS traversal (direct vs transitive consumers)
 * - Deterministic Risk Scoring & Impact Analysis API
 */

const assert = require('assert');
const prisma = require('../lib/prisma');
const { findAffectedConsumers, calculateDeterministicRisk } = require('../services/dependencyService');
const express = require('express');
const dependencyRoutes = require('../routes/dependencyRoutes');

async function runTests() {
  console.log('🧪 Starting Step 7: Dependency Graph & Impact Analysis Verification Tests...\n');

  const app = express();
  app.use(express.json());
  app.use('/api/dependencies', dependencyRoutes);
  const server = app.listen(5089);

  const createdIds = [];

  try {
    // 1. Register 3 services via API
    console.log('Test 1: Register 3 services (Provider -> Direct Consumer -> Transitive Consumer)');
    const sA = await (await fetch('http://127.0.0.1:5089/api/dependencies/services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '__Test_Core_API', criticality: 'CRITICAL', ownerTeam: 'Core' }),
    })).json();
    const sB = await (await fetch('http://127.0.0.1:5089/api/dependencies/services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '__Test_Billing_Svc', criticality: 'HIGH', ownerTeam: 'Finance' }),
    })).json();
    const sC = await (await fetch('http://127.0.0.1:5089/api/dependencies/services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '__Test_Analytics_Svc', criticality: 'MEDIUM', ownerTeam: 'Data' }),
    })).json();

    assert.strictEqual(sA.success, true);
    assert.strictEqual(sB.success, true);
    assert.strictEqual(sC.success, true);
    createdIds.push(sA.data.id, sB.data.id, sC.data.id);
    console.log('  ✅ Passed');

    // 2. Reject self-dependency
    console.log('Test 2: Reject self-dependency edge (400)');
    const selfRes = await fetch('http://127.0.0.1:5089/api/dependencies/integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId: sA.data.id, consumerId: sA.data.id }),
    });
    assert.strictEqual(selfRes.status, 400);
    console.log('  ✅ Passed');

    // 3. Link A -> B -> C AND cycle C -> A
    console.log('Test 3: Link A -> B -> C and cyclic edge C -> A, verify cycle-safe BFS depth');
    await fetch('http://127.0.0.1:5089/api/dependencies/integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId: sA.data.id, consumerId: sB.data.id, contractVersion: '1.0.0' }),
    });
    await fetch('http://127.0.0.1:5089/api/dependencies/integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId: sB.data.id, consumerId: sC.data.id, contractVersion: '1.0.0' }),
    });
    await fetch('http://127.0.0.1:5089/api/dependencies/integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId: sC.data.id, consumerId: sA.data.id, contractVersion: '1.0.0' }),
    });

    const traversal = await findAffectedConsumers(sA.data.id);
    assert.strictEqual(traversal.directConsumers.length, 1);
    assert.strictEqual(traversal.directConsumers[0].name, '__Test_Billing_Svc');
    assert.strictEqual(traversal.transitiveConsumers.length, 1);
    assert.strictEqual(traversal.transitiveConsumers[0].name, '__Test_Analytics_Svc');
    assert.strictEqual(traversal.maxDepth, 2);
    console.log('  ✅ Passed (Direct: 1, Transitive: 1, Cycle handled cleanly)');

    // 4. Deterministic risk scoring & explainable factors
    console.log('Test 4: Calculate deterministic Risk Score with breaking changes and active incident');
    const risk = calculateDeterministicRisk({
      targetService: traversal.targetService,
      directConsumers: traversal.directConsumers,
      transitiveConsumers: traversal.transitiveConsumers,
      maxDepth: traversal.maxDepth,
      breakingCount: 3,
      potentiallyBreakingCount: 0,
      openIncidentCount: 1,
    });
    assert(risk.riskScore >= 75 && risk.riskScore <= 100);
    assert.strictEqual(risk.riskLevel, 'CRITICAL');
    assert.strictEqual(risk.factors.length, 4);
    console.log(`  ✅ Passed (Risk Score: ${risk.riskScore}/100 [${risk.riskLevel}])`);

    // 5. Impact Analysis API
    console.log('Test 5: Verify POST /api/dependencies/impact route');
    const impactRes = await fetch('http://127.0.0.1:5089/api/dependencies/impact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceId: sA.data.id }),
    });
    const impactJson = await impactRes.json();
    assert.strictEqual(impactRes.status, 200);
    assert.strictEqual(impactJson.success, true);
    assert.strictEqual(impactJson.data.blastRadius.totalAffectedCount, 2);
    console.log(`  ✅ Passed (Risk Score via API: ${impactJson.data.riskScore}/100)`);
  } finally {
    server.close();
    if (createdIds.length > 0) {
      await prisma.service.deleteMany({ where: { id: { in: createdIds } } });
    }
  }

  console.log('\n🎉 ALL STEP 7 VERIFICATION TESTS PASSED SUCCESSFULLY!\n');
}

runTests()
  .catch((err) => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

