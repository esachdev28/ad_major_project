/**
 * step13_security.test.js
 *
 * Verification suite for Phase 13 Security Hardening:
 * 1. AES-256-GCM Encryption at rest for endpoint credentials/headers
 * 2. SSRF Guard re-validation across 3xx HTTP redirects
 * 3. Express API rate limiting and probe abuse prevention
 */

const http = require('http');
const assert = require('assert');
const prisma = require('../lib/prisma');
const { encrypt, decrypt, isEncrypted } = require('../utils/encryption');
const { executeProbe } = require('../services/probeService');

async function runSecurityTests() {
  console.log('\n🔒 Starting Phase 13: Security Hardening Verification Tests...\n');

  let testEndpoint = null;
  let redirectServer = null;

  try {
    // --------------------------------------------------------------------------
    // Test 1: AES-256-GCM Encryption Utility
    // --------------------------------------------------------------------------
    console.log('Test 1: Verify AES-256-GCM encryption and decryption');
    const secretHeaders = JSON.stringify({ Authorization: 'Bearer sk-super-secret-token-xyz-123' });
    const encrypted = encrypt(secretHeaders);

    assert(isEncrypted(encrypted), 'Expected output to have enc:v1: prefix');
    assert(!encrypted.includes('sk-super-secret-token-xyz-123'), 'Plaintext secret must not leak in ciphertext');

    const decrypted = decrypt(encrypted);
    assert.strictEqual(decrypted, secretHeaders, 'Decrypted text must match original plaintext');

    // Test legacy plaintext fallback
    const legacyPlaintext = '{"X-Legacy-Token": "legacy-value"}';
    assert.strictEqual(decrypt(legacyPlaintext), legacyPlaintext, 'Legacy plaintext must be returned unchanged');
    console.log('  ✅ Passed (AES-256-GCM authenticated cipher & transparent fallback verified)');

    // --------------------------------------------------------------------------
    // Test 2: Database Storage with Encrypted Headers
    // --------------------------------------------------------------------------
    console.log('Test 2: Verify APIEndpoint stores encrypted headers in PostgreSQL');
    const user = await prisma.user.findFirst();

    testEndpoint = await prisma.aPIEndpoint.create({
      data: {
        name: '__Security_Test_API',
        url: 'https://httpbin.org/status/200',
        method: 'GET',
        headers: encrypt(JSON.stringify({ 'X-Secret-Auth': 'super-secret-header-value' })),
        userId: user ? user.id : undefined,
      },
    });

    const rawInDb = await prisma.aPIEndpoint.findUnique({
      where: { id: testEndpoint.id },
    });
    assert(isEncrypted(rawInDb.headers), 'Headers stored in DB must be encrypted with enc:v1:');
    assert(!rawInDb.headers.includes('super-secret-header-value'), 'DB must not store plaintext secret');

    // Verify probeService can probe and decrypt headers seamlessly
    const probeRes = await executeProbe(testEndpoint);
    assert.strictEqual(probeRes.check.isHealthy, true, 'Probe must succeed with decrypted headers');
    console.log('  ✅ Passed (Headers verified encrypted at rest in PostgreSQL)');

    // --------------------------------------------------------------------------
    // Test 3: SSRF Re-validation on 3xx HTTP Redirects
    // --------------------------------------------------------------------------
    console.log('Test 3: Verify SSRF Guard blocks malicious 3xx redirect to loopback/private IP');

    // Create a local redirect server listening on a high port that redirects to 127.0.0.1
    let redirectPort = 9876;
    redirectServer = http.createServer((req, res) => {
      if (req.url === '/malicious-redirect') {
        res.writeHead(302, { Location: 'http://127.0.0.1:5432/internal' });
        res.end();
      } else if (req.url === '/safe-redirect') {
        res.writeHead(302, { Location: 'https://httpbin.org/status/200' });
        res.end();
      } else {
        res.writeHead(200);
        res.end('OK');
      }
    });

    await new Promise((resolve) => redirectServer.listen(redirectPort, '0.0.0.0', resolve));

    // Register an endpoint that points to the malicious redirect
    // (We bypass the initial validator via direct DB insert to simulate a domain that changes behavior)
    const ssrfRedirectEndpoint = await prisma.aPIEndpoint.create({
      data: {
        name: '__Malicious_Redirect_API',
        url: `http://localhost:${redirectPort}/malicious-redirect`,
        method: 'GET',
        userId: user ? user.id : undefined,
      },
    });

    const ssrfProbe = await executeProbe(ssrfRedirectEndpoint);
    assert.strictEqual(ssrfProbe.check.isHealthy, false, 'Malicious redirect must be marked unhealthy');
    assert(
      ssrfProbe.check.errorMessage.includes('SSRF Guard'),
      `Expected SSRF Guard error message, got: ${ssrfProbe.check.errorMessage}`
    );
    console.log(`  ✅ Passed (Blocked redirect to private destination: ${ssrfProbe.check.errorMessage})`);

    await prisma.aPIEndpoint.delete({ where: { id: ssrfRedirectEndpoint.id } });

    // --------------------------------------------------------------------------
    // Test 4: Rate Limiting Headers
    // --------------------------------------------------------------------------
    console.log('Test 4: Verify Express Rate Limiting headers on /api routes');
    // Using native fetch against the running server on port 5001
    const res = await fetch('http://localhost:5001/api/dashboard/stats');
    assert.strictEqual(res.status, 200);
    const limitHeader = res.headers.get('ratelimit-limit');
    assert(limitHeader !== null, 'Expected RateLimit-Limit header to be present');
    console.log(`  ✅ Passed (RateLimit-Limit active: ${limitHeader})`);

    console.log('\n🎉 ALL PHASE 13 SECURITY HARDENING TESTS PASSED SUCCESSFULLY!\n');
  } finally {
    if (redirectServer) {
      redirectServer.close();
    }
    if (testEndpoint) {
      try {
        await prisma.aPIEndpoint.delete({ where: { id: testEndpoint.id } });
      } catch (_) {}
    }
    await prisma.$disconnect();
  }
}

runSecurityTests().catch((err) => {
  console.error('\n❌ Security verification failed:', err);
  process.exit(1);
});
