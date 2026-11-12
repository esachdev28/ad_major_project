/**
 * tests/step8_mcp.test.js
 *
 * End-to-End Verification Tests for Step 8: Official MCP Server
 * Connects a real MCP Client via StdioClientTransport to `mcp/mcpServer.js`
 * and verifies tool discovery, real DB tool execution, secret redaction,
 * error handling, and the HTTP MCP bridge routes.
 */

const assert = require('assert');
const path = require('path');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const prisma = require('../lib/prisma');
const express = require('express');
const mcpRoutes = require('../routes/mcpRoutes');

async function runTests() {
  console.log('🧪 Starting Step 8: Model Context Protocol (MCP) Server Verification Tests...\n');

  // 1. Connect real MCP Client to mcpServer.js over stdio
  console.log('Test 1: Connect MCP Client over stdio and discover all 7 diagnostic tools');
  const transport = new StdioClientTransport({
    command: 'node',
    args: [path.join(__dirname, '../mcp/mcpServer.js')],
    cwd: path.join(__dirname, '..'),
  });

  const client = new Client(
    { name: 'api-sentinel-test-client', version: '1.0.0' },
    { capabilities: {} }
  );

  await client.connect(transport);

  try {
    const toolsList = await client.listTools();
    const toolNames = toolsList.tools.map((t) => t.name);
    assert.strictEqual(toolNames.length, 7, `Expected 7 MCP tools, got ${toolNames.length}`);
    for (const expected of [
      'get_endpoint_health',
      'get_recent_incidents',
      'get_incident_details',
      'compare_api_contracts',
      'get_affected_consumers',
      'analyze_api_risk',
      'get_latency_history',
    ]) {
      assert(toolNames.includes(expected), `Missing MCP tool: ${expected}`);
    }
    console.log(`  ✅ Passed (Discovered tools: ${toolNames.join(', ')})`);

    // 2. Execute get_endpoint_health over MCP stdio
    console.log('Test 2: Execute get_endpoint_health over MCP stdio & verify secret redaction');
    const healthRes = await client.callTool({ name: 'get_endpoint_health', arguments: {} });
    assert(!healthRes.isError, 'get_endpoint_health should succeed');
    const healthPayload = JSON.parse(healthRes.content[0].text);
    assert(healthPayload.count >= 1, 'Expected at least 1 endpoint in DB');
    assert.strictEqual(healthPayload.endpoints[0].headers, undefined, 'Headers/secrets must not be exposed');
    console.log(`  ✅ Passed (Retrieved ${healthPayload.count} endpoints safely)`);

    // 3. Execute get_recent_incidents over MCP stdio
    console.log('Test 3: Execute get_recent_incidents over MCP stdio');
    const incRes = await client.callTool({ name: 'get_recent_incidents', arguments: { limit: 5 } });
    assert(!incRes.isError);
    const incPayload = JSON.parse(incRes.content[0].text);
    assert(Array.isArray(incPayload.incidents));
    console.log(`  ✅ Passed (Retrieved ${incPayload.count} incident(s))`);

    // 4. Execute get_affected_consumers and analyze_api_risk over MCP stdio
    console.log('Test 4: Execute get_affected_consumers & analyze_api_risk over MCP stdio');
    const paymentSvc = await prisma.service.findFirst({ where: { name: 'Payment Processing Gateway' } });
    if (paymentSvc) {
      const consRes = await client.callTool({
        name: 'get_affected_consumers',
        arguments: { serviceId: paymentSvc.id },
      });
      assert(!consRes.isError);
      const consPayload = JSON.parse(consRes.content[0].text);
      assert(consPayload.directConsumers.length >= 1, 'Expected direct consumers');

      const riskRes = await client.callTool({
        name: 'analyze_api_risk',
        arguments: { serviceId: paymentSvc.id },
      });
      assert(!riskRes.isError);
      const riskPayload = JSON.parse(riskRes.content[0].text);
      assert(typeof riskPayload.riskScore === 'number');
      console.log(`  ✅ Passed (Risk Score: ${riskPayload.riskScore}/100 [${riskPayload.riskLevel}])`);
    } else {
      console.log('  ⚠️ Skipped seeded Payment Processing Gateway check (not seeded)');
    }

    // 5. Execute get_incident_details with non-existent ID -> graceful isError response
    console.log('Test 5: Verify graceful error handling on missing incidentId');
    const errRes = await client.callTool({
      name: 'get_incident_details',
      arguments: { incidentId: 'non_existent_id_999' },
    });
    assert.strictEqual(errRes.isError, true, 'Missing incident should set isError=true');
    console.log('  ✅ Passed');
  } finally {
    await client.close();
  }

  // 6. Test HTTP Bridge Routes (/api/mcp/tools and /api/mcp/invoke)
  console.log('Test 6: Verify HTTP MCP Bridge (/api/mcp/tools and /api/mcp/invoke)');
  const app = express();
  app.use(express.json());
  app.use('/api/mcp', mcpRoutes);
  const server = app.listen(5088);

  try {
    const toolsHttp = await (await fetch('http://127.0.0.1:5088/api/mcp/tools')).json();
    assert.strictEqual(toolsHttp.success, true);
    assert.strictEqual(toolsHttp.count, 7);

    const invokeBad = await fetch('http://127.0.0.1:5088/api/mcp/invoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'get_latency_history', arguments: {} }), // missing required endpointId
    });
    assert.strictEqual(invokeBad.status, 400, 'Missing required Zod parameter must return 400');

    console.log('  ✅ Passed');
  } finally {
    server.close();
  }

  console.log('\n🎉 ALL STEP 8 VERIFICATION TESTS PASSED SUCCESSFULLY!\n');
}

runTests()
  .catch((err) => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
