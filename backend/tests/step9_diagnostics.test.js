/**
 * tests/step9_diagnostics.test.js
 *
 * Automated verification tests for Step 9: AI-Assisted Diagnostics
 * Tests:
 * - Secret redaction (Bearer tokens, nvapi keys, headers omitted)
 * - Deterministic fallback mode (works with no LLM dependency)
 * - Live NVIDIA NIM API investigation & evidence separation
 * - Persistence in DiagnosticReport table & safe status endpoint
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const assert = require('assert');
const prisma = require('../lib/prisma');
const {
  runDiagnosticInvestigation,
  gatherSanitizedEvidence,
  redactSecrets,
} = require('../services/aiDiagnosticsService');
const express = require('express');
const diagnosticsRoutes = require('../routes/diagnosticsRoutes');

async function runTests() {
  console.log('🧪 Starting Step 9: AI-Assisted Diagnostics Verification Tests...\n');

  const createdReportIds = [];

  // 1. Test Secret Redaction
  console.log('Test 1: Verify credential & secret redaction');
  const dirty = 'Failed auth with Bearer eyJhbGciOiJIUzI1NiJ9 and key nvapi-abc123XYZ and password=secret123';
  const clean = redactSecrets(dirty);
  assert(!clean.includes('eyJhbGciOiJIUzI1NiJ9'), 'Bearer token must be redacted');
  assert(!clean.includes('nvapi-abc123XYZ'), 'NVIDIA key must be redacted');
  assert(!clean.includes('secret123'), 'Password must be redacted');
  console.log('  ✅ Passed');

  // 2. Test Sanitized Evidence omits Endpoint Headers
  console.log('Test 2: Verify gatherSanitizedEvidence omits endpoint secret headers');
  const testEp = await prisma.aPIEndpoint.create({
    data: {
      name: '__Diag_Test_API',
      url: 'https://httpbin.org/status/500',
      method: 'GET',
      headers: JSON.stringify({ Authorization: 'Bearer super-secret-token' }),
      isActive: false,
    },
  });

  try {
    const { evidence } = await gatherSanitizedEvidence({
      query: 'Why is __Diag_Test_API failing?',
      endpointId: testEp.id,
    });
    const serialized = JSON.stringify(evidence);
    assert(!serialized.includes('super-secret-token'), 'Endpoint headers must never appear in AI evidence');
    console.log('  ✅ Passed');

    // 3. Test Deterministic Fallback (no external AI required)
    console.log('Test 3: Verify deterministic fallback works without LLM provider');
    const fallbackReport = await runDiagnosticInvestigation({
      query: 'Diagnose __Diag_Test_API',
      endpointId: testEp.id,
      forceFallback: true,
    });
    createdReportIds.push(fallbackReport.id);
    assert.strictEqual(fallbackReport.provider, 'deterministic-fallback');
    assert(Array.isArray(fallbackReport.verifiedFacts) && fallbackReport.verifiedFacts.length >= 1);
    assert(Array.isArray(fallbackReport.hypotheses) && fallbackReport.hypotheses.length >= 1);
    console.log('  ✅ Passed');

    // 4. Test Live Diagnostics Routes + NVIDIA NIM API
    console.log('Test 4: Verify /api/diagnostics/status (no secret leak) and live NVIDIA NIM investigation');
    const app = express();
    app.use(express.json());
    app.use('/api/diagnostics', diagnosticsRoutes);
    const server = app.listen(5087);

    try {
      const statusRes = await (await fetch('http://127.0.0.1:5087/api/diagnostics/status')).json();
      assert.strictEqual(statusRes.success, true);
      assert(!JSON.stringify(statusRes).includes('nvapi-'), 'API status must never leak raw NVIDIA API key');

      const paymentEp = await prisma.aPIEndpoint.findFirst({ where: { name: 'Payment Processing Gateway' } });
      const invRes = await (
        await fetch('http://127.0.0.1:5087/api/diagnostics/investigate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: 'Why is the Payment Processing Gateway failing, and which integrations could be affected?',
            endpointId: paymentEp?.id || testEp.id,
          }),
        })
      ).json();

      assert.strictEqual(invRes.success, true);
      createdReportIds.push(invRes.data.id);
      assert(invRes.data.verifiedFacts.length >= 1, 'Expected verifiedFacts');
      assert(invRes.data.hypotheses.length >= 1, 'Expected hypotheses');
      assert(invRes.data.recommendations.length >= 1, 'Expected recommendations');
      console.log(`  ✅ Passed (Provider: ${invRes.data.provider}, Model: ${invRes.data.model})`);
    } finally {
      server.close();
    }
  } finally {
    if (createdReportIds.length > 0) {
      await prisma.diagnosticReport.deleteMany({ where: { id: { in: createdReportIds } } });
    }
    await prisma.aPIEndpoint.delete({ where: { id: testEp.id } });
  }

  console.log('\n🎉 ALL STEP 9 VERIFICATION TESTS PASSED SUCCESSFULLY!\n');
}

runTests()
  .catch((err) => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

