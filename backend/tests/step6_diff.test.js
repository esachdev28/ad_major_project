/**
 * tests/step6_diff.test.js
 *
 * Automated verification tests for Step 6: Breaking-Change Detection Engine
 * Tests:
 * - Endpoint removal
 * - Response property removal (e.g. payment_id)
 * - Newly required request property addition
 * - Incompatible data type change (number -> string)
 * - Enum value removal
 * - Optional field addition & documentation-only updates (NON_BREAKING)
 * - POST /api/contracts/compare route
 */

const assert = require('assert');
const { compareOpenApiSpecs } = require('../services/contractDiffService');
const express = require('express');
const contractRoutes = require('../routes/contractRoutes');

async function runTests() {
  console.log('🧪 Starting Step 6: Breaking-Change Detection Engine Tests...\n');

  const specV1 = {
    openapi: '3.0.3',
    info: { title: 'Payment API', version: '1.0.0' },
    paths: {
      '/payments': {
        get: {
          summary: 'Fetch payment',
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      payment_id: { type: 'string' },
                      amount: { type: 'number' },
                      currency: { type: 'string', enum: ['INR', 'USD', 'EUR'] },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          summary: 'Create payment',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    amount: { type: 'number' },
                    status: { type: 'string', enum: ['PENDING', 'PAID'] },
                  },
                  required: ['amount'],
                },
              },
            },
          },
          responses: { '201': { description: 'Created' } },
        },
      },
      '/legacy-status': {
        get: {
          responses: { '200': { description: 'OK' } },
        },
      },
    },
  };

  // Test 1: Breaking changes (removed path, removed response field, type change, new required field, enum removal)
  console.log('Test 1: Detect multiple BREAKING changes (path removal, field removal, type incompatibility, enum removal, required request field)');
  const specV2Breaking = {
    openapi: '3.0.3',
    info: { title: 'Payment API', version: '2.0.0' },
    paths: {
      '/payments': {
        get: {
          summary: 'Fetch payment v2',
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      // payment_id REMOVED (BREAKING)
                      amount: { type: 'string' }, // TYPE CHANGED number -> string (BREAKING)
                      currency: { type: 'string', enum: ['INR', 'USD', 'EUR'] },
                      trace_id: { type: 'string' }, // OPTIONAL ADDITION (NON_BREAKING)
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          summary: 'Create payment',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    amount: { type: 'number' },
                    status: { type: 'string', enum: ['PENDING'] }, // ENUM 'PAID' REMOVED (BREAKING)
                    idempotency_key: { type: 'string' }, // NEW REQUIRED FIELD (BREAKING)
                  },
                  required: ['amount', 'idempotency_key'],
                },
              },
            },
          },
          responses: { '201': { description: 'Created' } },
        },
      },
      // /legacy-status REMOVED (BREAKING)
    },
  };

  const reportBreaking = compareOpenApiSpecs(specV1, specV2Breaking);
  assert.strictEqual(reportBreaking.isCompatible, false);
  assert(reportBreaking.breakingCount >= 5, `Expected at least 5 breaking changes, got ${reportBreaking.breakingCount}`);

  const rules = new Set(reportBreaking.changes.map((c) => c.rule));
  assert(rules.has('ENDPOINT_REMOVED'), 'Should detect ENDPOINT_REMOVED');
  assert(rules.has('RESPONSE_PROPERTY_REMOVED'), 'Should detect RESPONSE_PROPERTY_REMOVED (payment_id)');
  assert(rules.has('TYPE_INCOMPATIBLE'), 'Should detect TYPE_INCOMPATIBLE (amount)');
  assert(rules.has('REQUIRED_REQUEST_PROPERTY_ADDED'), 'Should detect REQUIRED_REQUEST_PROPERTY_ADDED');
  assert(rules.has('ENUM_VALUE_REMOVED'), 'Should detect ENUM_VALUE_REMOVED');
  assert(rules.has('OPTIONAL_PROPERTY_ADDED'), 'Should detect OPTIONAL_PROPERTY_ADDED (trace_id)');
  assert(rules.has('DOCUMENTATION_UPDATED'), 'Should detect DOCUMENTATION_UPDATED');
  console.log(`  ✅ Passed (Detected ${reportBreaking.breakingCount} BREAKING, ${reportBreaking.nonBreakingCount} NON_BREAKING)`);

  // Test 2: Backward-compatible changes only
  console.log('Test 2: Verify backward-compatible changes report isCompatible = true');
  const specV2Safe = {
    openapi: '3.0.3',
    info: { title: 'Payment API', version: '1.1.0' },
    paths: {
      '/payments': {
        ...specV1.paths['/payments'],
        get: {
          ...specV1.paths['/payments'].get,
          summary: 'Fetch payment (updated docs)',
        },
      },
      '/legacy-status': specV1.paths['/legacy-status'],
      '/payments/health': {
        get: { responses: { '200': { description: 'OK' } } },
      },
    },
  };

  const reportSafe = compareOpenApiSpecs(specV1, specV2Safe);
  assert.strictEqual(reportSafe.isCompatible, true);
  assert.strictEqual(reportSafe.breakingCount, 0);
  console.log(`  ✅ Passed (isCompatible = true, 0 breaking changes)`);

  // Test 3: POST /api/contracts/compare route
  console.log('Test 3: Test POST /api/contracts/compare Express route');
  const app = express();
  app.use(express.json());
  app.use('/api/contracts', contractRoutes);
  const server = app.listen(5093);

  try {
    const res = await fetch('http://127.0.0.1:5093/api/contracts/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baselineSpec: specV1, targetSpec: specV2Breaking }),
    });
    const json = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(json.success, true);
    assert.strictEqual(json.data.isCompatible, false);
    console.log('  ✅ Passed');
  } finally {
    server.close();
  }

  console.log('\n🎉 ALL STEP 6 VERIFICATION TESTS PASSED SUCCESSFULLY!\n');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
