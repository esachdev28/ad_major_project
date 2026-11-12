/**
 * tests/step5_contracts.test.js
 *
 * Automated verification tests for Step 5:
 * - Safe JSON and YAML OpenAPI 3.x parsing
 * - Invalid spec rejection
 * - Local $ref resolution
 * - SHA-256 duplicate specification hash detection (409 Conflict)
 */

const assert = require('assert');
const prisma = require('../lib/prisma');
const { parseAndValidateOpenApi } = require('../services/contractParserService');
const express = require('express');
const contractRoutes = require('../routes/contractRoutes');

async function runTests() {
  console.log('🧪 Starting Step 5: API Contract Management Verification Tests...\n');

  // 1. Test Valid JSON with $ref resolution
  console.log('Test 1: Parse valid OpenAPI 3.0 JSON and resolve local $ref');
  const jsonSpec = JSON.stringify({
    openapi: '3.0.3',
    info: { title: 'Test Payment API', version: '1.0.0' },
    paths: {
      '/payments': {
        get: {
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Payment' },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        Payment: {
          type: 'object',
          properties: {
            payment_id: { type: 'string' },
            amount: { type: 'number' },
          },
        },
      },
    },
  });

  const parsedJson = parseAndValidateOpenApi(jsonSpec);
  assert.strictEqual(parsedJson.isValid, true);
  assert.strictEqual(parsedJson.format, 'JSON');
  assert.strictEqual(parsedJson.operations.length, 1);
  assert.strictEqual(
    parsedJson.resolvedSpec.paths['/payments'].get.responses['200'].content['application/json'].schema.properties.amount.type,
    'number'
  );
  console.log('  ✅ Passed ($ref resolved and hash computed)');

  // 2. Test Valid YAML parsing
  console.log('Test 2: Parse valid OpenAPI 3.0 YAML');
  const yamlSpec = `openapi: "3.0.3"
info:
  title: Test YAML API
  version: "1.1.0"
paths:
  /health:
    get:
      summary: Health probe
      responses:
        "200":
          description: Healthy`;

  const parsedYaml = parseAndValidateOpenApi(yamlSpec);
  assert.strictEqual(parsedYaml.isValid, true);
  assert.strictEqual(parsedYaml.format, 'YAML');
  assert.strictEqual(parsedYaml.title, 'Test YAML API');
  console.log('  ✅ Passed');

  // 3. Test Invalid OpenAPI Rejection
  console.log('Test 3: Reject invalid OpenAPI spec missing paths and openapi version');
  const invalidRes = parseAndValidateOpenApi('{"info": {"title": "Broken"}}');
  assert.strictEqual(invalidRes.isValid, false);
  assert(invalidRes.errors.length >= 2);
  console.log('  ✅ Passed');

  // 4. Test Upload & Duplicate Hash Detection via API
  console.log('Test 4: Upload contract and verify SHA-256 duplicate rejection (409)');
  const ep = await prisma.aPIEndpoint.create({
    data: { name: 'Contract Test Endpoint', url: 'https://httpbin.org/status/200', isActive: false },
  });

  const app = express();
  app.use(express.json());
  app.use('/api/contracts', contractRoutes);
  const server = app.listen(5094);

  try {
    const resUpload1 = await fetch('http://127.0.0.1:5094/api/contracts/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpointId: ep.id, specification: jsonSpec }),
    });
    const json1 = await resUpload1.json();
    assert.strictEqual(resUpload1.status, 201);
    assert.strictEqual(json1.success, true);

    // Upload exact same spec again -> expect 409 Conflict
    const resUpload2 = await fetch('http://127.0.0.1:5094/api/contracts/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpointId: ep.id, version: '1.0.1', specification: jsonSpec }),
    });
    assert.strictEqual(resUpload2.status, 409);
    console.log('  ✅ Passed (Duplicate spec correctly rejected with 409 Conflict)');
  } finally {
    server.close();
    await prisma.aPIEndpoint.delete({ where: { id: ep.id } });
  }

  console.log('\n🎉 ALL STEP 5 VERIFICATION TESTS PASSED SUCCESSFULLY!\n');
}

runTests()
  .catch((err) => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
