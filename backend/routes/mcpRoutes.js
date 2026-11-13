/**
 * mcpRoutes.js — Model Context Protocol (MCP) Diagnostic Server
 * 
 * 1. Why this file exists:
 *    Exposes API Sentinel's backend observability and intelligence through the
 *    Model Context Protocol (MCP). It allows AI agents, LLMs, and diagnostic tools
 *    to systematically inspect API health, triage active incidents, analyze contract
 *    diffs for breaking changes, and investigate downstream consumer impacts.
 * 
 * 2. What its responsibilities are:
 *    - GET /api/mcp/tools : Expose structured MCP tool definitions with JSON Schemas.
 *    - POST /api/mcp/tools/call : Execute an MCP tool by name with validated arguments.
 *    - POST /api/mcp : Provide standard JSON-RPC 2.0 handler (`tools/list`, `tools/call`)
 *      for native MCP-compatible AI clients.
 * 
 * 3. Which MCP Tools are exposed:
 *    - `get_endpoint_health` : Retrieves latency trends, uptime %, and recent probe logs for an endpoint.
 *    - `inspect_incidents` : Fetches operational incident logs, error details, and status.
 *    - `compare_api_contracts` : Compares OpenAPI specs to diagnose breaking contract modifications.
 *    - `investigate_impact` : Evaluates downstream consumers and blast radius affected by an endpoint.
 * 
 * 4. How it communicates with other files:
 *    - Queries Prisma models (`aPIEndpoint`, `healthCheck`, `incident`, `aPIVersion`, `integration`).
 *    - Imports `compareSpecifications` from `./versionRoutes`.
 *    - Mounted in `server.js` under `/api/mcp`.
 * 
 * 5. Why this chosen approach is appropriate:
 *    - Conforms to Model Context Protocol specification without requiring external binary bridges.
 *    - Supports both RESTful discovery and JSON-RPC 2.0 payloads in standard JavaScript.
 *    - Returns structured markdown / text evidence formatted specifically for AI reasoning.
 * 
 * 6. MCP Request Flow:
 *    AI Agent / MCP Client -> POST /api/mcp (tools/call) -> Execute Sentinel Diagnostic
 *    -> Query PostgreSQL -> Format structured evidence text -> Return MCP content envelope.
 */

const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { compareSpecifications } = require('./versionRoutes');

// Definition of all MCP tools exposed by API Sentinel
const MCP_TOOLS = [
  {
    name: 'get_endpoint_health',
    description: 'Retrieves real-time health telemetry, latency measurements, and recent probe outcomes for a registered API endpoint.',
    inputSchema: {
      type: 'object',
      properties: {
        endpointId: {
          type: 'string',
          description: 'Unique identifier of the APIEndpoint in API Sentinel'
        },
        limit: {
          type: 'integer',
          description: 'Number of recent health checks to retrieve (default: 10)',
          default: 10
        }
      },
      required: ['endpointId']
    }
  },
  {
    name: 'inspect_incidents',
    description: 'Inspects active or historical operational disruptions, failure causes, and resolution details across monitored APIs.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['OPEN', 'INVESTIGATING', 'RESOLVED', 'ALL'],
          description: 'Filter incidents by lifecycle status (default: OPEN)',
          default: 'OPEN'
        },
        endpointId: {
          type: 'string',
          description: 'Optional endpoint ID to filter incidents for a specific service'
        }
      }
    }
  },
  {
    name: 'compare_api_contracts',
    description: 'Compares two API specification contracts (OpenAPI/Swagger) to detect breaking changes such as removed endpoints, removed fields, newly required fields, or incompatible data types.',
    inputSchema: {
      type: 'object',
      properties: {
        oldVersionId: {
          type: 'string',
          description: 'Database ID of the base/original APIVersion'
        },
        newVersionId: {
          type: 'string',
          description: 'Database ID of the updated APIVersion'
        },
        oldSpec: {
          type: 'string',
          description: 'Raw JSON string of original OpenAPI specification (if comparing without saved IDs)'
        },
        newSpec: {
          type: 'string',
          description: 'Raw JSON string of modified OpenAPI specification (if comparing without saved IDs)'
        }
      }
    }
  },
  {
    name: 'investigate_impact',
    description: 'Investigates downstream services, client applications, and integrations that depend on an API endpoint, assessing outage or breaking-change blast radius.',
    inputSchema: {
      type: 'object',
      properties: {
        endpointId: {
          type: 'string',
          description: 'Unique identifier of the APIEndpoint to analyze for consumer impact'
        }
      },
      required: ['endpointId']
    }
  }
];

/**
 * Diagnostic Tool Execution Engine
 * Executes tool logic and returns structured MCP response envelope.
 */
async function executeMcpTool(name, args = {}) {
  switch (name) {
    case 'get_endpoint_health': {
      const { endpointId, limit = 10 } = args;
      if (!endpointId) {
        throw new Error("Missing required argument: 'endpointId'");
      }

      const endpoint = await prisma.aPIEndpoint.findUnique({
        where: { id: endpointId },
        include: {
          healthChecks: {
            orderBy: { checkedAt: 'desc' },
            take: Number(limit)
          }
        }
      });

      if (!endpoint) {
        throw new Error(`Endpoint with ID '${endpointId}' was not found.`);
      }

      const checks = endpoint.healthChecks;
      const total = checks.length;
      const healthy = checks.filter(c => c.isHealthy).length;
      const uptimePct = total > 0 ? Math.round((healthy / total) * 100) : 0;
      const avgLatency = total > 0
        ? Math.round(checks.reduce((sum, c) => sum + (c.latency || 0), 0) / total)
        : 0;

      const report = {
        endpointId: endpoint.id,
        name: endpoint.name,
        url: endpoint.url,
        method: endpoint.method,
        currentStatus: checks[0]?.isHealthy ? 'HEALTHY' : (checks.length > 0 ? 'FAILING' : 'UNKNOWN'),
        recentUptime: `${uptimePct}%`,
        averageLatency: `${avgLatency} ms`,
        checksRecorded: total,
        latestChecks: checks.map(c => ({
          timestamp: c.checkedAt,
          statusCode: c.statusCode,
          latency: `${c.latency} ms`,
          isHealthy: c.isHealthy,
          error: c.errorMessage || 'None'
        }))
      };

      return {
        content: [
          {
            type: 'text',
            text: `### Health Diagnostic for ${endpoint.name}\n` +
                  `- **URL**: ${endpoint.method} ${endpoint.url}\n` +
                  `- **Status**: ${report.currentStatus}\n` +
                  `- **Recent Uptime**: ${report.recentUptime}\n` +
                  `- **Average Latency**: ${report.averageLatency}\n\n` +
                  `\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\``
          }
        ],
        structuredData: report
      };
    }

    case 'inspect_incidents': {
      const { status = 'OPEN', endpointId } = args;
      const whereClause = {};

      if (status && status !== 'ALL') {
        whereClause.status = status.toUpperCase();
      }
      if (endpointId) {
        whereClause.endpointId = endpointId;
      }

      const incidents = await prisma.incident.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        include: {
          endpoint: {
            select: { name: true, url: true, method: true }
          }
        }
      });

      const incidentSummaries = incidents.map(inc => ({
        id: inc.id,
        endpoint: `${inc.endpoint.method} ${inc.endpoint.name} (${inc.endpoint.url})`,
        title: inc.title,
        description: inc.description,
        status: inc.status,
        createdAt: inc.createdAt,
        resolvedAt: inc.resolvedAt
      }));

      return {
        content: [
          {
            type: 'text',
            text: `### Incident Diagnostic Report\n` +
                  `Found **${incidents.length}** incidents matching filter (Status: ${status || 'ALL'}):\n\n` +
                  incidents.map(i => `* **[${i.status}]** ${i.title} (Endpoint: ${i.endpoint.name}) — Reported: ${new Date(i.createdAt).toLocaleString()}`).join('\n') +
                  `\n\n\`\`\`json\n${JSON.stringify(incidentSummaries, null, 2)}\n\`\`\``
          }
        ],
        structuredData: incidentSummaries
      };
    }

    case 'compare_api_contracts': {
      const { oldVersionId, newVersionId, oldSpec, newSpec } = args;

      let parsedOld = null;
      let parsedNew = null;

      if (oldVersionId && newVersionId) {
        const [v1, v2] = await Promise.all([
          prisma.aPIVersion.findUnique({ where: { id: oldVersionId } }),
          prisma.aPIVersion.findUnique({ where: { id: newVersionId } })
        ]);

        if (!v1 || !v2) {
          throw new Error('One or both specification versions could not be found.');
        }

        parsedOld = JSON.parse(v1.specification);
        parsedNew = JSON.parse(v2.specification);
      } else if (oldSpec && newSpec) {
        parsedOld = typeof oldSpec === 'string' ? JSON.parse(oldSpec) : oldSpec;
        parsedNew = typeof newSpec === 'string' ? JSON.parse(newSpec) : newSpec;
      } else {
        throw new Error('Provide either (oldVersionId, newVersionId) or (oldSpec, newSpec).');
      }

      const diffResult = compareSpecifications(parsedOld, parsedNew);

      return {
        content: [
          {
            type: 'text',
            text: `### Contract Breaking-Change Diagnostic\n` +
                  `- **Breaking Changes Detected**: ${diffResult.isBreaking ? '⚠️ YES' : '✅ NO'}\n` +
                  `- **Risk Level**: ${diffResult.riskLevel}\n` +
                  `- **Breaking Count**: ${diffResult.breakingCount}\n` +
                  `- **Non-Breaking Count**: ${diffResult.nonBreakingCount}\n\n` +
                  `#### Detailed Findings:\n` +
                  diffResult.changes.map(c => `* ${c.isBreaking ? '❌ **[BREAKING]**' : 'ℹ️ [SAFE]'} ${c.message}`).join('\n') +
                  `\n\n\`\`\`json\n${JSON.stringify(diffResult, null, 2)}\n\`\`\``
          }
        ],
        structuredData: diffResult
      };
    }

    case 'investigate_impact': {
      const { endpointId } = args;
      if (!endpointId) {
        throw new Error("Missing required argument: 'endpointId'");
      }

      const endpoint = await prisma.aPIEndpoint.findUnique({
        where: { id: endpointId },
        include: {
          integrations: true,
          incidents: { where: { status: 'OPEN' } }
        }
      });

      if (!endpoint) {
        throw new Error(`Endpoint with ID '${endpointId}' not found.`);
      }

      const integrations = endpoint.integrations || [];
      const criticalCount = integrations.filter(i => i.criticality === 'CRITICAL').length;
      const highCount = integrations.filter(i => i.criticality === 'HIGH').length;

      let blastRadius = 'LOW';
      if (criticalCount > 0) blastRadius = 'CRITICAL';
      else if (highCount > 0 || integrations.length > 2) blastRadius = 'HIGH';
      else if (integrations.length > 0) blastRadius = 'MEDIUM';

      const impact = {
        endpoint: `${endpoint.method} ${endpoint.name} (${endpoint.url})`,
        blastRadius,
        hasActiveOutage: endpoint.incidents.length > 0,
        totalConsumers: integrations.length,
        criticalConsumers: criticalCount,
        affectedServices: integrations.map(i => ({
          name: i.consumerName,
          type: i.serviceType,
          criticality: i.criticality,
          environment: i.environment,
          contact: i.contactEmail || 'Unassigned'
        }))
      };

      return {
        content: [
          {
            type: 'text',
            text: `### Downstream Impact Assessment for ${endpoint.name}\n` +
                  `- **Blast Radius Severity**: ${blastRadius}\n` +
                  `- **Active Incidents**: ${endpoint.incidents.length > 0 ? '⚠️ YES' : '✅ NO'}\n` +
                  `- **Dependent Consumers**: ${integrations.length} (${criticalCount} Critical, ${highCount} High)\n\n` +
                  `#### Affected Downstream Consumers:\n` +
                  integrations.map(i => `* **${i.consumerName}** [${i.criticality}] (${i.serviceType}, ${i.environment}) — Alert Contact: ${i.contactEmail || 'None'}`).join('\n') +
                  `\n\n\`\`\`json\n${JSON.stringify(impact, null, 2)}\n\`\`\``
          }
        ],
        structuredData: impact
      };
    }

    default:
      throw new Error(`Unknown MCP tool: '${name}'`);
  }
}

// GET /api/mcp/tools
// Exposes the list of diagnostic tools conforming to Model Context Protocol
router.get('/tools', (req, res) => {
  return res.status(200).json({
    success: true,
    tools: MCP_TOOLS
  });
});

// POST /api/mcp/tools/call
// REST endpoint for invoking an MCP diagnostic tool
router.post('/tools/call', async (req, res) => {
  const { name, arguments: toolArgs } = req.body;

  if (!name) {
    return res.status(400).json({
      success: false,
      message: "Missing 'name' of tool to execute"
    });
  }

  try {
    const result = await executeMcpTool(name, toolArgs || {});
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error(`MCP Tool Execution Error (${name}):`, error.message);
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
        result: { tools: MCP_TOOLS }
      });
    }

    if (method === 'tools/call') {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};
      const toolResult = await executeMcpTool(toolName, toolArgs);

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

