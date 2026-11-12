/**
 * routes/mcpRoutes.js
 *
 * HTTP discovery and read-only execution bridge for API Sentinel's MCP diagnostic tools.
 * Allows the web UI and REST clients to inspect available MCP tools and invoke them
 * with identical Zod validation and security boundaries as the stdio MCP server.
 */

const express = require('express');
const { z } = require('zod');
const router = express.Router();
const { MCP_TOOL_DEFINITIONS } = require('../mcp/mcpTools');

// GET /api/mcp/tools
// Lists all registered MCP diagnostic tools and their input parameters
router.get('/tools', (req, res) => {
  const tools = MCP_TOOL_DEFINITIONS.map((t) => ({
    name: t.name,
    description: t.description,
    readOnly: true,
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
    data: tools,
  });
});

// POST /api/mcp/invoke
// Validates arguments via Zod and executes a registered read-only MCP tool
router.post('/invoke', async (req, res) => {
  try {
    const { tool, arguments: toolArgs = {} } = req.body;

    if (!tool || typeof tool !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Tool name ("tool") is required.',
      });
    }

    const toolDef = MCP_TOOL_DEFINITIONS.find((t) => t.name === tool);
    if (!toolDef) {
      return res.status(404).json({
        success: false,
        message: `Unknown MCP tool "${tool}".`,
      });
    }

    // Validate input arguments strictly using Zod
    const zodObject = z.object(toolDef.inputSchema);
    const parsed = zodObject.safeParse(toolArgs);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid tool arguments.',
        errors: parsed.error.issues,
      });
    }

    const result = await toolDef.handler(parsed.data);
    if (result.isError) {
      return res.status(404).json({
        success: false,
        tool,
        data: result.structuredData,
        message: result.structuredData?.error || 'Tool returned an error.',
      });
    }

    return res.status(200).json({
      success: true,
      tool,
      data: result.structuredData,
    });
  } catch (error) {
    console.error('MCP HTTP invoke error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to execute MCP tool',
    });
  }
});

module.exports = router;

