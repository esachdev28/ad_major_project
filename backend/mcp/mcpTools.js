/**
 * mcp/mcpTools.js
 *
 * Read-only Model Context Protocol (MCP) Diagnostic Tools for API Sentinel.
 *
 * Security Boundaries:
 * - Strictly read-only database operations (no mutations, deletes, or shell execution).
 * - Zod schema validation for all tool arguments.
 * - Redacts endpoint headers/credentials from diagnostic outputs.
 * - Safe invocation logging to stderr so stdio JSON-RPC transport remains clean.
 */

const { z } = require('zod');
const prisma = require('../lib/prisma');
const { compareOpenApiSpecs } = require('../services/contractDiffService');
const { findAffectedConsumers, analyzeImpact } = require('../services/dependencyService');

function logToolInvocation(toolName, args, success) {
  console.error(
    `[MCP Tool] ${new Date().toISOString()} | ${toolName} | status=${success ? 'OK' : 'ERROR'} | args=${JSON.stringify(args)}`
  );
}

/**
 * Helper to format tool response consistently for both MCP SDK and HTTP REST routes.
 */
function formatResult(data) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2),
      },
    ],
    structuredData: data,
  };
}

function formatError(message) {
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: JSON.stringify({ error: message }, null, 2),
      },
    ],
    structuredData: { error: message },
  };
}

/**
 * Tool Definitions with Zod input schemas and read-only handlers.
 */
const MCP_TOOL_DEFINITIONS = [
  {
    name: 'get_endpoint_health',
    description:
      'Retrieve current health status, latest HTTP status code, response latency, and uptime percentage for registered API endpoints.',
    inputSchema: {
      endpointId: z.string().optional().describe('Specific APIEndpoint ID to inspect'),
      search: z.string().optional().describe('Optional name or URL substring filter'),
    },
    handler: async (args) => {
      try {
        const where = {};
        if (args.endpointId) where.id = args.endpointId;
        if (args.search) {
          where.OR = [
            { name: { contains: args.search, mode: 'insensitive' } },
            { url: { contains: args.search, mode: 'insensitive' } },
          ];
        }

        const endpoints = await prisma.aPIEndpoint.findMany({
          where,
          take: 25,
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            url: true,
            method: true,
            isActive: true,
            expectedStatus: true,
            // Explicitly omit `headers` to prevent leaking API credentials/tokens
            healthChecks: {
              orderBy: { checkedAt: 'desc' },
              take: 20,
              select: {
                statusCode: true,
                latency: true,
                isHealthy: true,
                errorMessage: true,
                checkedAt: true,
              },
            },
            incidents: {
              where: { status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
              select: { id: true, title: true, severity: true, status: true },
            },
          },
        });

        if (args.endpointId && endpoints.length === 0) {
          logToolInvocation('get_endpoint_health', args, false);
          return formatError(`Endpoint "${args.endpointId}" not found.`);
        }

        const results = endpoints.map((ep) => {
          const checks = ep.healthChecks || [];
          const healthyCount = checks.filter((c) => c.isHealthy).length;
          const uptime = checks.length > 0 ? Number(((healthyCount / checks.length) * 100).toFixed(2)) : 100;
          return {
            id: ep.id,
            name: ep.name,
            url: ep.url,
            method: ep.method,
            isActive: ep.isActive,
            expectedStatus: ep.expectedStatus,
            uptimePercent: uptime,
            latestCheck: checks[0] || null,
            openIncidents: ep.incidents,
          };
        });

        logToolInvocation('get_endpoint_health', args, true);
        return formatResult({ count: results.length, endpoints: results });
      } catch (err) {
        logToolInvocation('get_endpoint_health', args, false);
        return formatError(err.message);
      }
    },
  },
  {
    name: 'get_recent_incidents',
    description:
      'Retrieve recent API operational incidents including status (OPEN, ACKNOWLEDGED, RESOLVED), severity, and occurrence count.',
    inputSchema: {
      status: z.enum(['ALL', 'OPEN', 'ACKNOWLEDGED', 'RESOLVED']).optional().describe('Filter incidents by status'),
      limit: z.number().int().min(1).max(50).optional().describe('Maximum number of incidents to return (default 10)'),
    },
    handler: async (args) => {
      try {
        const limit = args.limit || 10;
        const where = {};
        if (args.status && args.status !== 'ALL') {
          where.status = args.status;
        }

        const incidents = await prisma.incident.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: limit,
          include: {
            endpoint: {
              select: { id: true, name: true, url: true, method: true },
            },
          },
        });

        logToolInvocation('get_recent_incidents', args, true);
        return formatResult({ count: incidents.length, incidents });
      } catch (err) {
        logToolInvocation('get_recent_incidents', args, false);
        return formatError(err.message);
      }
    },
  },
  {
    name: 'get_incident_details',
    description:
      'Retrieve full details, failure timeline, and recent health check logs for a specific incident ID.',
    inputSchema: {
      incidentId: z.string().min(1).describe('The ID of the incident to inspect'),
    },
    handler: async (args) => {
      try {
        const incident = await prisma.incident.findUnique({
          where: { id: args.incidentId },
          include: {
            endpoint: {
              select: {
                id: true,
                name: true,
                url: true,
                method: true,
                expectedStatus: true,
                healthChecks: {
                  orderBy: { checkedAt: 'desc' },
                  take: 10,
                  select: {
                    statusCode: true,
                    latency: true,
                    isHealthy: true,
                    errorMessage: true,
                    checkedAt: true,
                  },
                },
              },
            },
          },
        });

        if (!incident) {
          logToolInvocation('get_incident_details', args, false);
          return formatError(`Incident "${args.incidentId}" not found.`);
        }

        logToolInvocation('get_incident_details', args, true);
        return formatResult(incident);
      } catch (err) {
        logToolInvocation('get_incident_details', args, false);
        return formatError(err.message);
      }
    },
  },
  {
    name: 'compare_api_contracts',
    description:
      'Compare two stored OpenAPI specification versions (v1 vs v2) to identify BREAKING, POTENTIALLY_BREAKING, and NON_BREAKING changes.',
    inputSchema: {
      baselineVersionId: z.string().min(1).describe('ID of the baseline APIVersion record'),
      targetVersionId: z.string().min(1).describe('ID of the target APIVersion record'),
    },
    handler: async (args) => {
      try {
        const [v1, v2] = await Promise.all([
          prisma.aPIVersion.findUnique({
            where: { id: args.baselineVersionId },
            include: { endpoint: { select: { id: true, name: true } } },
          }),
          prisma.aPIVersion.findUnique({ where: { id: args.targetVersionId } }),
        ]);

        if (!v1 || !v2) {
          logToolInvocation('compare_api_contracts', args, false);
          return formatError('One or both specified API contract version IDs were not found.');
        }

        const report = compareOpenApiSpecs(v1.specification, v2.specification);
        logToolInvocation('compare_api_contracts', args, true);
        return formatResult({
          endpointName: v1.endpoint?.name || 'Unknown',
          ...report,
        });
      } catch (err) {
        logToolInvocation('compare_api_contracts', args, false);
        return formatError(err.message);
      }
    },
  },
  {
    name: 'get_affected_consumers',
    description:
      'Traverse the service dependency graph to list direct and transitive downstream consumers of a service or API endpoint.',
    inputSchema: {
      serviceId: z.string().optional().describe('Target Service ID'),
      endpointId: z.string().optional().describe('Target APIEndpoint ID linked to a Service'),
    },
    handler: async (args) => {
      try {
        let targetServiceId = args.serviceId;
        if (!targetServiceId && args.endpointId) {
          const svc = await prisma.service.findFirst({ where: { endpointId: args.endpointId } });
          if (!svc) {
            logToolInvocation('get_affected_consumers', args, false);
            return formatError(`No Service is registered for endpointId "${args.endpointId}".`);
          }
          targetServiceId = svc.id;
        }

        if (!targetServiceId) {
          logToolInvocation('get_affected_consumers', args, false);
          return formatError('Provide either serviceId or endpointId.');
        }

        const traversal = await findAffectedConsumers(targetServiceId);
        logToolInvocation('get_affected_consumers', args, true);
        return formatResult({
          targetService: {
            id: traversal.targetService.id,
            name: traversal.targetService.name,
            criticality: traversal.targetService.criticality,
          },
          directConsumers: traversal.directConsumers,
          transitiveConsumers: traversal.transitiveConsumers,
          maxDepth: traversal.maxDepth,
        });
      } catch (err) {
        logToolInvocation('get_affected_consumers', args, false);
        return formatError(err.message);
      }
    },
  },
  {
    name: 'analyze_api_risk',
    description:
      'Compute a deterministic 0-100 risk score, blast radius, and migration recommendations for a service or API contract update.',
    inputSchema: {
      serviceId: z.string().optional().describe('Target Service ID'),
      endpointId: z.string().optional().describe('Target APIEndpoint ID'),
      baselineVersionId: z.string().optional().describe('Optional baseline APIVersion ID'),
      targetVersionId: z.string().optional().describe('Optional target APIVersion ID'),
    },
    handler: async (args) => {
      try {
        if (!args.serviceId && !args.endpointId) {
          logToolInvocation('analyze_api_risk', args, false);
          return formatError('Provide either serviceId or endpointId.');
        }

        const report = await analyzeImpact({
          serviceId: args.serviceId,
          endpointId: args.endpointId,
          baselineVersionId: args.baselineVersionId,
          targetVersionId: args.targetVersionId,
        });

        logToolInvocation('analyze_api_risk', args, true);
        return formatResult(report);
      } catch (err) {
        logToolInvocation('analyze_api_risk', args, false);
        return formatError(err.message);
      }
    },
  },
  {
    name: 'get_latency_history',
    description:
      'Retrieve historical response latency percentiles (P50, P95, P99), error rate, and probe timestamps for an endpoint.',
    inputSchema: {
      endpointId: z.string().min(1).describe('APIEndpoint ID to query latency metrics for'),
      hours: z.number().int().min(1).max(720).optional().describe('Lookback window in hours (default 24)'),
      limit: z.number().int().min(1).max(200).optional().describe('Max probe samples (default 30)'),
    },
    handler: async (args) => {
      try {
        const hours = args.hours || 24;
        const limit = args.limit || 30;
        const sinceDate = new Date(Date.now() - hours * 3600 * 1000);

        const endpoint = await prisma.aPIEndpoint.findUnique({ where: { id: args.endpointId } });
        if (!endpoint) {
          logToolInvocation('get_latency_history', args, false);
          return formatError(`Endpoint "${args.endpointId}" not found.`);
        }

        const checks = await prisma.healthCheck.findMany({
          where: {
            endpointId: args.endpointId,
            checkedAt: { gte: sinceDate },
          },
          orderBy: { checkedAt: 'desc' },
          take: limit,
        });

        const total = checks.length;
        const healthy = checks.filter((c) => c.isHealthy).length;
        const uptime = total > 0 ? Number(((healthy / total) * 100).toFixed(2)) : 100;
        const errorRate = total > 0 ? Number((((total - healthy) / total) * 100).toFixed(2)) : 0;

        const latencies = checks
          .map((c) => c.latency)
          .filter((l) => typeof l === 'number')
          .sort((a, b) => a - b);

        const getPerc = (p) => {
          if (latencies.length === 0) return 0;
          const idx = Math.ceil((p / 100) * latencies.length) - 1;
          return latencies[Math.max(0, Math.min(idx, latencies.length - 1))];
        };

        logToolInvocation('get_latency_history', args, true);
        return formatResult({
          endpointId: endpoint.id,
          endpointName: endpoint.name,
          windowHours: hours,
          sampleCount: total,
          uptimePercent: uptime,
          errorRatePercent: errorRate,
          percentiles: {
            p50: getPerc(50),
            p95: getPerc(95),
            p99: getPerc(99),
          },
          samples: [...checks].reverse().map((c) => ({
            statusCode: c.statusCode,
            latencyMs: c.latency,
            isHealthy: c.isHealthy,
            checkedAt: c.checkedAt,
          })),
        });
      } catch (err) {
        logToolInvocation('get_latency_history', args, false);
        return formatError(err.message);
      }
    },
  },
];

module.exports = {
  MCP_TOOL_DEFINITIONS,
};
