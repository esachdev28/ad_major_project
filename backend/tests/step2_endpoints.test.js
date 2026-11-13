/**
 * tests/step2_endpoints.test.js
 *
 * Automated verification test suite for Step 2:
 * - Endpoint CRUD operations
 * - SSRF Protection validation (blocking loopback, private IPs, metadata)
 * - Immediate on-demand manual probing
 */

const assert = require('assert');
const { validateUrlForMonitoring } = require('../utils/urlValidator');
const prisma = require('../lib/prisma');
const { executeProbe } = require('../services/probeService');

async function runTests() {
  console.log('🧪 Starting Step 2: Endpoint Registry & SSRF Guard Verification Tests...\n');

  // Test 1: SSRF Guard blocks localhost
  console.log('Test 1: SSRF Guard blocks loopback hostname (localhost)');
  const resLocal = await validateUrlForMonitoring('http://localhost:8080/api/keys');
  assert.strictEqual(resLocal.isValid, false, 'Expected localhost to be rejected');
  assert(resLocal.error.includes('SSRF protection'), 'Expected SSRF error message');
  console.log('  ✅ Passed');

  // Test 2: SSRF Guard blocks private RFC 1918 IPv4
  console.log('Test 2: SSRF Guard blocks private IP range (192.168.1.1)');
  const resPrivate = await validateUrlForMonitoring('http://192.168.1.1/admin');
  assert.strictEqual(resPrivate.isValid, false, 'Expected 192.168.1.1 to be rejected');
  console.log('  ✅ Passed');

  // Test 3: SSRF Guard blocks cloud metadata IP (169.254.169.254)
  console.log('Test 3: SSRF Guard blocks cloud metadata endpoint (169.254.169.254)');
  const resMeta = await validateUrlForMonitoring('http://169.254.169.254/latest/meta-data/');
  assert.strictEqual(resMeta.isValid, false, 'Expected metadata IP to be rejected');
  console.log('  ✅ Passed');

  // Test 4: SSRF Guard permits safe public HTTPS URL
  console.log('Test 4: SSRF Guard permits safe public HTTPS URL');
  const resSafe = await validateUrlForMonitoring('https://httpbin.org/status/200');
  assert.strictEqual(resSafe.isValid, true, 'Expected public HTTPS URL to be valid');
  console.log('  ✅ Passed');

  // Test 5: Endpoint Registration in DB
  console.log('Test 5: Create and persist new APIEndpoint in PostgreSQL');
  const testEp = await prisma.aPIEndpoint.create({
    data: {
      name: 'Test Probe Service',
      url: 'https://httpbin.org/status/200',
      method: 'GET',
      interval: 30,
      timeout: 4000,
      expectedStatus: 200,
    },
  });
  assert(testEp.id, 'Expected endpoint to have generated CUID');
  console.log(`  ✅ Created test endpoint ID: ${testEp.id}`);

  // Test 6: Probe Execution
  console.log('Test 6: Execute probe against test endpoint');
  const probeResult = await executeProbe(testEp);
  assert.strictEqual(probeResult.success, true, 'Probe execution should succeed');
  assert.strictEqual(probeResult.check.isHealthy, true, 'Probe should report healthy');
  assert.strictEqual(probeResult.check.statusCode, 200, 'Probe should return HTTP 200');
  assert(probeResult.check.latency > 0, 'Probe latency must be > 0');
  console.log(`  ✅ Probe recorded latency: ${probeResult.check.latency}ms, status: ${probeResult.check.statusCode}`);

  // Test 7: Clean up test endpoint
  console.log('Test 7: Delete test endpoint and cascade cleanup');
  await prisma.aPIEndpoint.delete({ where: { id: testEp.id } });
  const checkExists = await prisma.aPIEndpoint.findUnique({ where: { id: testEp.id } });
  assert.strictEqual(checkExists, null, 'Endpoint should be completely deleted');
  console.log('  ✅ Passed');

  console.log('\n🎉 ALL STEP 2 VERIFICATION TESTS PASSED SUCCESSFULLY!\n');
}

runTests()
  .catch((err) => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
