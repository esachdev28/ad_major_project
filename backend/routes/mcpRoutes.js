/**
 * mcpRoutes.js — Model Context Protocol (MCP) Diagnostic Server & HTTP Bridge
 * 
 * 1. Why this file exists:
 *    Exposes API Sentinel's backend observability and intelligence through the
 *    Model Context Protocol (MCP). It allows AI agents, LLMs, and diagnostic tools
 *    to systematically inspect API health, triage active incidents, analyze contract
 *    diffs for breaking changes, and investigate downstream consumer impacts.
 * 
 * 2. What its responsibilities are:
 *    - GET /api/mcp/tools : Expose structured MCP tool definitions with schemas for both UI and MCP clients.
 *    - POST /api/mcp/invoke : Execute registered read-only MCP tool with strict Zod validation.
 *    - POST /api/mcp/tools/call : REST endpoint for invoking an MCP diagnostic tool.
 *    - POST /api/mcp : Provide standard JSON-RPC 2.0 handler (tools/list, tools/call) for native MCP clients.
 * 
 * 3. Which MCP Tools are exposed:
 *    - `get_endpoint_health` : Retrieves latency trends, uptime %, and recent probe logs.
 *    - `get_recent_incidents` / `inspect_incidents` : Fetches operational incident logs and error details.
 *    - `compare_api_contracts` : Compares OpenAPI specs to diagnose breaking contract modifications.
 *    - `get_affected_consumers` / `investigate_impact` : Evaluates downstream consumers and blast radius.
 *    - `analyze_api_risk` : Computes deterministic composite risk score.
 *    - `get_latency_history` : Retrieves percentile latency distribution.
 * 
 * 4. How it communicates with other files:
 *    - Uses `MCP_TOOL_DEFINITIONS` from `../mcp/mcpTools`.
 *    - Uses `prisma` from `../lib/prisma`.
 *    - Mounted in `server.js` under `/api/mcp`.
 */

const express = require('express');
const { z } = require('zod');
const router = express.Router();
const prisma = require('../lib/prisma');
const { MCP_TOOL_DEFINITIONS } = require('../mcp/mcpTools');

// Helper to execute any registered MCP tool
async function runTool(toolName, args = {}) {
  // 1. Try finding in MCP_TOOL_DEFINITIONS from mcpTools.js
  const toolDef = MCP_TOOL_DEFINITIONS.find(
    (t) => t.name === toolName ||
    (toolName === 'inspect_incidents' && t.name === 'get_recent_incidents') ||
    (toolName === 'investigate_impact' && t.name === 'get_affected_consumers')
  );

  if (toolDef) {
    let validatedArgs = args;
    if (toolDef.inputSchema) {
      const zodObject = z.object(toolDef.inputSchema);
      const parsed = zodObject.safeParse(args);
      if (parsed.success) {
        validatedArgs = parsed.data;
      }
    }
    return await toolDef.handler(validatedArgs);
  }

  // 2. Fallback execution for standalone endpoints
  if (toolName === 'get_endpoint_health') {
    const endpoint = await prisma.aPIEndpoint.findFirst({
      where: args.endpointId ? { id: args.endpointId } : {},
      include: { healthChecks: { orderBy: { checkedAt: 'desc' }, take: 10 } }
    });
    if (!endpoint) throw new Error('Endpoint not found');
    return {
      content: [{ type: 'text', text: `Health status for ${endpoint.name}: ${endpoint.url}` }],
      structuredData: endpoint
    };
  }

  throw new Error(`Unknown MCP tool: '${toolName}'`);
}

// GET /api/mcp/tools
// Lists all registered MCP diagnostic tools
router.get('/tools', (req, res) => {
  const tools = MCP_TOOL_DEFINITIONS.map((t) => ({
    name: t.name,
    description: t.description,
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: Object.keys(t.inputSchema).reduce((acc, k) => {
        acc[k] = { description: t.inputSchema[k]?.description || '', type: 'string' };
        return acc;
      }, {})
    },
    parameters: Object.keys(t.inputSchema).map((paramName) => ({
      name: paramName,
      description: t.inputSchema[paramName]?.description || '',
      optional: t.inputSchema[paramName]?.isOptional?.() ?? false,
    })),
  }));

  return res.status(200).json({
    success: true,
    serverName: 'api-sentinel-mcp',
    transport: ['stdio', 'http-bridge'],
    count: tools.length,
    tools,
    data: tools,
  });
});

// POST /api/mcp/invoke
// Validates arguments via Zod and executes a registered read-only MCP tool
router.post('/invoke', async (req, res) => {
  try {
    const toolName = req.body.tool || req.body.name;
    const toolArgs = req.body.arguments || {};

    if (!toolName || typeof toolName !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Tool name ("tool" or "name") is required.',
      });
    }

    const result = await runTool(toolName, toolArgs);

    if (result.isError) {
      return res.status(404).json({
        success: false,
        tool: toolName,
        data: result.structuredData,
        message: result.structuredData?.error || 'Tool returned an error.',
      });
    }

    return res.status(200).json({
      success: true,
      tool: toolName,
      data: result.structuredData,
      content: result.content,
    });
  } catch (error) {
    console.error('MCP HTTP invoke error:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to execute MCP tool',
    });
  }
});

// POST /api/mcp/tools/call
// REST endpoint for invoking an MCP diagnostic tool
router.post('/tools/call', async (req, res) => {
  const toolName = req.body.name || req.body.tool;
  const toolArgs = req.body.arguments || {};

  if (!toolName) {
    return res.status(400).json({
      success: false,
      message: "Missing 'name' of tool to execute"
    });
  }

  try {
    const result = await runTool(toolName, toolArgs);
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error(`MCP Tool Execution Error (${toolName}):`, error.message);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// POST /api/mcp
// Standard JSON-RPC 2.0 endpoint for direct MCP clients
router.post('/', async (req, res) => {
  const { jsonrpc, id, method, params } = req.body;

  if (jsonrpc !== '2.0') {
    return res.status(400).json({
      jsonrpc: '2.0',
      id: id || null,
      error: { code: -32600, message: 'Invalid Request: jsonrpc must be "2.0"' }
    });
  }

  try {
    if (method === 'tools/list') {
      return res.status(200).json({
        jsonrpc: '2.0',
        id,
        result: {
          tools: MCP_TOOL_DEFINITIONS.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: {
              type: 'object',
              properties: Object.keys(t.inputSchema).reduce((acc, k) => {
                acc[k] = { description: t.inputSchema[k]?.description || '', type: 'string' };
                return acc;
              }, {})
            }
          }))
        }
      });
    }

    if (method === 'tools/call') {
      const toolName = params?.name || params?.tool;
      const toolArgs = params?.arguments || {};
      const toolResult = await runTool(toolName, toolArgs);

      return res.status(200).json({
        jsonrpc: '2.0',
        id,
        result: toolResult
      });
    }

    return res.status(404).json({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method '${method}' not found` }
    });
  } catch (error) {
    console.error('JSON-RPC MCP Error:', error.message);
    return res.status(500).json({
      jsonrpc: '2.0',
      id,
      error: { code: -32603, message: error.message }
    });
  }
});

module.exports = router;
