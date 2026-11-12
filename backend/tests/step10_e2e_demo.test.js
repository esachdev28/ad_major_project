/**
 * tests/step10_e2e_demo.test.js
 *
 * Complete 8-Step End-to-End Verification Scenario (TASK.md Final Demonstration):
 * 1. Register Payment API & upload OpenAPI v1
 * 2. Register consumers (Mobile Application, Billing Service, Analytics Service)
 * 3. Upload OpenAPI v2 with breaking schema regressions
 * 4. Run contract compatibility analysis (detects BREAKING changes)
 * 5. Run impact analysis (identifies direct & transitive blast radius + risk score)
 * 6. Simulate HTTP 503 outage -> verify failure history & automatic incident creation
 * 7. Investigate via MCP tools (stdio) & AI Diagnostics -> verify evidence-backed report
 * 8. Restore API to HTTP 200 -> verify recovery & automatic incident resolution
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const assert = require('assert');
const http = require('http');
const express = require('express');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const prisma = require('../lib/prisma');

// Express Routers
const endpointRoutes = require('../routes/endpointRoutes');
const incidentRoutes = require('../routes/incidentRoutes');
const contractRoutes = require('../routes/contractRoutes');
const dependencyRoutes = require('../routes/dependencyRoutes');
const diagnosticsRoutes = require('../routes/diagnosticsRoutes');

async function runE2EDemo() {
  console.log('🚀 Starting Step 10: Complete 8-Step End-to-End Demonstration Test...\n');

  // Spin up real local mock Payment API server (200 -> 503 -> 200)
  let mockStatusCode = 200;
  const mockServer = http.createServer((req, res) => {
    res.writeHead(mockStatusCode, { 'Content-Type': 'application/json' });
    if (mockStatusCode === 200) {
      res.end(JSON.stringify({ payment_id: 'PAY-001', amount: 100, currency: 'INR' }));
    } else {
      res.end(JSON.stringify({ error: 'Service Unavailable' }));
    }
  });

  await new Promise((resolve) => mockServer.listen(0, '127.0.0.1', resolve));
  const mockPort = mockServer.address().port;

  // Forward https://httpbin.org/api/payments to our controllable local mock HTTP server
  // so SSRF Guard remains 100% strict while outage/recovery stays deterministic.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const urlStr = typeof input === 'string' ? input : input.url;
    if (urlStr === 'https://httpbin.org/api/payments') {
      return originalFetch(`http://127.0.0.1:${mockPort}/api/payments`, init);
    }
    return originalFetch(input, init);
  };

  // Mount full API Sentinel Express app on ephemeral test port
  const app = express();
  app.use(express.json());
  app.use('/api/endpoints', endpointRoutes);
  app.use('/api/incidents', incidentRoutes);
  app.use('/api/contracts', contractRoutes);
  app.use('/api/dependencies', dependencyRoutes);
  app.use('/api/diagnostics', diagnosticsRoutes);

  const apiServer = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${apiServer.address().port}`;

  const cleanup = { endpointId: null, serviceIds: [], reportIds: [] };

  try {
    // -------------------------------------------------------------------------
    // STEP 1: Register Payment API + Upload OpenAPI v1
    // -------------------------------------------------------------------------
    console.log('Step 1: Register Payment API & upload OpenAPI v1');
    const epRes = await (
      await originalFetch(`${baseUrl}/api/endpoints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '__E2E Payment API',
          url: 'https://httpbin.org/api/payments',
          method: 'GET',
          expectedStatus: 200,
          isActive: false,
        }),
      })
    ).json();
    assert.strictEqual(epRes.success, true);
    const endpointId = epRes.data.id;
    cleanup.endpointId = endpointId;
    assert.strictEqual(epRes.data.latestCheck.isHealthy, true);

    const specV1 = {
      openapi: '3.0.3',
      info: { title: 'E2E Payment API', version: '1.0.0' },
      paths: {
        '/api/payments': {
          get: {
            summary: 'Get payment details',
            responses: {
              '200': {
                description: 'Payment payload',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        payment_id: { type: 'string' },
                        amount: { type: 'number' },
                        currency: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
          post: {
            summary: 'Submit payment',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      amount: { type: 'number' },
                    },
                    required: ['amount'],
                  },
                },
              },
            },
            responses: { '201': { description: 'Created' } },
          },
        },
      },
    };

    const v1Res = await (
      await originalFetch(`${baseUrl}/api/contracts/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpointId, version: '1.0.0', specification: specV1 }),
      })
    ).json();
    assert.strictEqual(v1Res.success, true);
    const v1Id = v1Res.data.id;
    console.log('  ✅ Step 1 Passed (Endpoint healthy & OpenAPI v1.0.0 stored)');

    // -------------------------------------------------------------------------
    // STEP 2: Register Consumers & Dependency Graph
    // -------------------------------------------------------------------------
    console.log('Step 2: Register provider & consumer services (Mobile, Billing, Analytics)');
    const createSvc = async (payload) => {
      const r = await (
        await originalFetch(`${baseUrl}/api/dependencies/services`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      ).json();
      assert.strictEqual(r.success, true);
      cleanup.serviceIds.push(r.data.id);
      return r.data;
    };

    const paymentSvc = await createSvc({ name: '__E2E_Payment_Svc', criticality: 'CRITICAL', endpointId });
    const mobileSvc = await createSvc({ name: '__E2E_Mobile_App', criticality: 'CRITICAL' });
    const billingSvc = await createSvc({ name: '__E2E_Billing_Svc', criticality: 'HIGH' });
    const analyticsSvc = await createSvc({ name: '__E2E_Analytics_Svc', criticality: 'MEDIUM' });

    const linkEdge = async (providerId, consumerId) => {
      const r = await (
        await originalFetch(`${baseUrl}/api/dependencies/integrations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ providerId, consumerId, contractVersion: '1.0.0' }),
        })
      ).json();
      assert.strictEqual(r.success, true);
    };

    await linkEdge(paymentSvc.id, mobileSvc.id);
    await linkEdge(paymentSvc.id, billingSvc.id);
    await linkEdge(billingSvc.id, analyticsSvc.id);
    console.log('  ✅ Step 2 Passed (4 services & 3 directed integrations created)');

    // -------------------------------------------------------------------------
    // STEP 3: Upload OpenAPI v2 with Breaking Changes
    // -------------------------------------------------------------------------
    console.log('Step 3: Upload OpenAPI v2 (removed payment_id, amount type change, required request field)');
    const specV2 = {
      openapi: '3.0.3',
      info: { title: 'E2E Payment API', version: '2.0.0' },
      paths: {
        '/api/payments': {
          get: {
            summary: 'Get payment details',
            responses: {
              '200': {
                description: 'Payment payload',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        // payment_id removed
                        amount: { type: 'string' }, // number -> string
                        currency: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
          post: {
            summary: 'Submit payment',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      amount: { type: 'number' },
                      idempotency_key: { type: 'string' },
                    },
                    required: ['amount', 'idempotency_key'], // newly required field
                  },
                },
              },
            },
            responses: { '201': { description: 'Created' } },
          },
        },
      },
    };

    const v2Res = await (
      await originalFetch(`${baseUrl}/api/contracts/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpointId, version: '2.0.0', specification: specV2 }),
      })
    ).json();
    assert.strictEqual(v2Res.success, true);
    const v2Id = v2Res.data.id;
    console.log('  ✅ Step 3 Passed');

    // -------------------------------------------------------------------------
    // STEP 4: Run Compatibility Analysis
    // -------------------------------------------------------------------------
    console.log('Step 4: Run contract compatibility analysis (v1 -> v2)');
    const diffRes = await (
      await originalFetch(`${baseUrl}/api/contracts/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baselineVersionId: v1Id, targetVersionId: v2Id }),
      })
    ).json();
    assert.strictEqual(diffRes.success, true);
    assert.strictEqual(diffRes.data.isCompatible, false);
    assert(diffRes.data.breakingCount >= 3, 'Expected >= 3 breaking changes');
    console.log(`  ✅ Step 4 Passed (${diffRes.data.breakingCount} BREAKING changes detected)`);

    // -------------------------------------------------------------------------
    // STEP 5: Run Impact Analysis
    // -------------------------------------------------------------------------
    console.log('Step 5: Run blast radius & risk impact analysis');
    const impactRes = await (
      await originalFetch(`${baseUrl}/api/dependencies/impact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId: paymentSvc.id,
          baselineVersionId: v1Id,
          targetVersionId: v2Id,
        }),
      })
    ).json();
    assert.strictEqual(impactRes.success, true);
    assert.strictEqual(impactRes.data.blastRadius.directCount, 2);
    assert.strictEqual(impactRes.data.blastRadius.transitiveCount, 1);
    assert(impactRes.data.riskScore >= 75, `Expected CRITICAL risk score >= 75, got ${impactRes.data.riskScore}`);
    console.log(`  ✅ Step 5 Passed (Risk Score: ${impactRes.data.riskScore}/100 [${impactRes.data.riskLevel}])`);

    // -------------------------------------------------------------------------
    // STEP 6: Simulate Payment API Failure (HTTP 503 x3)
    // -------------------------------------------------------------------------
    console.log('Step 6: Simulate HTTP 503 failure & verify automatic Incident creation');
    mockStatusCode = 503;
    for (let i = 0; i < 3; i++) {
      const pRes = await (
        await originalFetch(`${baseUrl}/api/endpoints/${endpointId}/check`, { method: 'POST' })
      ).json();
      assert.strictEqual(pRes.data.isHealthy, false);
      assert.strictEqual(pRes.data.statusCode, 503);
    }

    const openIncident = await prisma.incident.findFirst({
      where: { endpointId, status: 'OPEN' },
    });
    assert(openIncident, 'Expected OPEN incident after 3 consecutive 503 failures');
    assert.strictEqual(openIncident.severity, 'CRITICAL');
    console.log(`  ✅ Step 6 Passed (Created CRITICAL OPEN incident: "${openIncident.title}")`);

    // -------------------------------------------------------------------------
    // STEP 7: Investigate via MCP Tools & AI Diagnostics
    // -------------------------------------------------------------------------
    console.log('Step 7: Investigate via official MCP stdio Client & AI Diagnostics');
    const transport = new StdioClientTransport({
      command: 'node',
      args: [path.join(__dirname, '../mcp/mcpServer.js')],
      cwd: path.join(__dirname, '..'),
    });
    const mcpClient = new Client({ name: 'e2e-demo-client', version: '1.0.0' }, { capabilities: {} });
    await mcpClient.connect(transport);

    try {
      const mcpHealth = await mcpClient.callTool({ name: 'get_endpoint_health', arguments: { endpointId } });
      const mcpInc = await mcpClient.callTool({ name: 'get_incident_details', arguments: { incidentId: openIncident.id } });
      const mcpDiff = await mcpClient.callTool({
        name: 'compare_api_contracts',
        arguments: { baselineVersionId: v1Id, targetVersionId: v2Id },
      });
      const mcpCons = await mcpClient.callTool({ name: 'get_affected_consumers', arguments: { endpointId } });

      assert(!mcpHealth.isError && !mcpInc.isError && !mcpDiff.isError && !mcpCons.isError);
      assert.strictEqual(JSON.parse(mcpHealth.content[0].text).endpoints[0].latestCheck.statusCode, 503);
      assert.strictEqual(JSON.parse(mcpCons.content[0].text).directConsumers.length, 2);
    } finally {
      await mcpClient.close();
    }

    const diagRes = await (
      await originalFetch(`${baseUrl}/api/diagnostics/investigate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'Why is __E2E Payment API failing, and which integrations could be affected?',
          endpointId,
          incidentId: openIncident.id,
        }),
      })
    ).json();
    assert.strictEqual(diagRes.success, true);
    cleanup.reportIds.push(diagRes.data.id);
    assert(diagRes.data.verifiedFacts.length >= 1 && diagRes.data.hypotheses.length >= 1);
    console.log(`  ✅ Step 7 Passed (MCP tools + AI Report via ${diagRes.data.provider})`);

    // -------------------------------------------------------------------------
    // STEP 8: Restore API to HTTP 200 -> Verify Auto-Recovery
    // -------------------------------------------------------------------------
    console.log('Step 8: Restore local Payment API to HTTP 200 & verify automatic resolution');
    mockStatusCode = 200;
    const recRes = await (
      await originalFetch(`${baseUrl}/api/endpoints/${endpointId}/check`, { method: 'POST' })
    ).json();
    assert.strictEqual(recRes.data.isHealthy, true);
    assert.strictEqual(recRes.data.statusCode, 200);

    const resolvedIncident = await prisma.incident.findUnique({ where: { id: openIncident.id } });
    assert.strictEqual(resolvedIncident.status, 'RESOLVED');
    assert(resolvedIncident.resolvedAt !== null);
    console.log('  ✅ Step 8 Passed (Incident auto-resolved cleanly)');

    console.log('\n🏆 COMPLETE 8-STEP E2E DEMONSTRATION PASSED 100%!\n');
  } finally {
    globalThis.fetch = originalFetch;
    apiServer.close();
    mockServer.close();

    if (cleanup.reportIds.length > 0) {
      await prisma.diagnosticReport.deleteMany({ where: { id: { in: cleanup.reportIds } } });
    }
    if (cleanup.serviceIds.length > 0) {
      await prisma.service.deleteMany({ where: { id: { in: cleanup.serviceIds } } });
    }
    if (cleanup.endpointId) {
      await prisma.aPIEndpoint.delete({ where: { id: cleanup.endpointId } });
    }
  }
}

runE2EDemo()
  .catch((err) => {
    console.error('❌ E2E Demo Test failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

