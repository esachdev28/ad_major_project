/**
 * mcp/mcpServer.js
 *
 * Official Model Context Protocol (MCP) Server for API Sentinel.
 * Uses `@modelcontextprotocol/sdk` over stdio transport so MCP-compatible AI clients
 * (Claude Desktop, Cursor, Antigravity, MCP Inspector) can discover and execute
 * read-only diagnostic tools against live PostgreSQL observability data.
 *
 * Usage:
 *   node mcp/mcpServer.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const prisma = require('../lib/prisma');
const { MCP_TOOL_DEFINITIONS } = require('./mcpTools');

function createSentinelMcpServer() {
  const server = new McpServer({
    name: 'api-sentinel-mcp',
    version: '1.0.0',
  });

  // Register all 7 read-only diagnostic tools
  for (const toolDef of MCP_TOOL_DEFINITIONS) {
    server.tool(
      toolDef.name,
      toolDef.description,
      toolDef.inputSchema,
      async (args) => {
        const result = await toolDef.handler(args || {});
        return {
          isError: Boolean(result.isError),
          content: result.content,
        };
      }
    );
  }

  return server;
}

async function startStdioServer() {
  const server = createSentinelMcpServer();
  const transport = new StdioServerTransport();

  console.error('[MCP Server] 🛡️ API Sentinel MCP Server starting on stdio transport...');
  await server.connect(transport);
  console.error(`[MCP Server] Ready — ${MCP_TOOL_DEFINITIONS.length} diagnostic tools registered.`);

  const shutdown = async () => {
    console.error('[MCP Server] Shutting down...');
    await server.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (require.main === module) {
  startStdioServer().catch((err) => {
    console.error('[MCP Server] Fatal startup error:', err);
    process.exit(1);
  });
}

module.exports = {
  createSentinelMcpServer,
};
