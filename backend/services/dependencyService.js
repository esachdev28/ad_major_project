/**
 * services/dependencyService.js
 *
 * Directed Dependency Graph Engine & Explainable Risk Scoring System.
 *
 * Features:
 * - Constructs directed dependency graphs (Provider -> Consumer) from PostgreSQL.
 * - Cycle-safe Breadth-First Search (BFS) for direct (depth=1) and transitive (depth>=2) consumers.
 * - Deterministic, explainable Risk Score (0-100) computed from:
 *   1. Provider service criticality (0-25 pts)
 *   2. Consumer blast radius & consumer criticality (0-35 pts)
 *   3. Contract breaking-change severity (0-25 pts)
 *   4. Active operational incidents & dependency depth (0-15 pts)
 */

const prisma = require('../lib/prisma');
const { compareOpenApiSpecs } = require('./contractDiffService');

const CRITICALITY_SCORES = {
  CRITICAL: 25,
  HIGH: 18,
  MEDIUM: 10,
  LOW: 5,
};

/**
 * Retrieves all services and directed dependency edges for graph visualization.
 */
async function getDependencyGraph() {
  const [services, dependencies] = await Promise.all([
    prisma.service.findMany({
      orderBy: { name: 'asc' },
      include: {
        endpoint: {
          select: {
            id: true,
            name: true,
            url: true,
            method: true,
            incidents: {
              where: { status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
              select: { id: true, severity: true, title: true },
            },
            healthChecks: {
              orderBy: { checkedAt: 'desc' },
              take: 1,
              select: { isHealthy: true, statusCode: true, latency: true },
            },
          },
        },
        _count: {
          select: { consumers: true, providers: true },
        },
      },
    }),
    prisma.serviceDependency.findMany({
      include: {
        provider: { select: { id: true, name: true, criticality: true } },
        consumer: { select: { id: true, name: true, criticality: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  return { services, integrations: dependencies };
}

/**
 * Performs cycle-safe BFS traversal starting from `targetServiceId` to compute
 * direct (depth=1) and transitive (depth>=2) downstream consumers.
 */
async function findAffectedConsumers(targetServiceId) {
  const { services, integrations } = await getDependencyGraph();
  const serviceMap = new Map(services.map((s) => [s.id, s]));

  const targetService = serviceMap.get(targetServiceId);
  if (!targetService) {
    throw new Error(`Service with ID "${targetServiceId}" not found.`);
  }

  // Adjacency list: providerId -> list of outgoing edges
  const adjacency = new Map();
  for (const edge of integrations) {
    if (!adjacency.has(edge.providerId)) adjacency.set(edge.providerId, []);
    adjacency.get(edge.providerId).push(edge);
  }

  const visited = new Set([targetServiceId]);
  const queue = [{ serviceId: targetServiceId, depth: 0, path: [targetService.name] }];

  const directConsumers = [];
  const transitiveConsumers = [];
  let maxDepth = 0;

  while (queue.length > 0) {
    const current = queue.shift();
    const outgoing = adjacency.get(current.serviceId) || [];

    for (const edge of outgoing) {
      if (visited.has(edge.consumerId)) {
        // Cycle detected or already visited via shorter path -> skip safely
        continue;
      }

      visited.add(edge.consumerId);
      const consumerNode = serviceMap.get(edge.consumerId);
      if (!consumerNode) continue;

      const nextDepth = current.depth + 1;
      const nextPath = [...current.path, consumerNode.name];
      if (nextDepth > maxDepth) maxDepth = nextDepth;

      const affectedEntry = {
        id: consumerNode.id,
        name: consumerNode.name,
        criticality: consumerNode.criticality,
        ownerTeam: consumerNode.ownerTeam,
        depth: nextDepth,
        impactType: nextDepth === 1 ? 'DIRECT' : 'TRANSITIVE',
        contractVersion: edge.contractVersion,
        dependencyPath: nextPath,
      };

      if (nextDepth === 1) {
        directConsumers.push(affectedEntry);
      } else {
        transitiveConsumers.push(affectedEntry);
      }

      queue.push({
        serviceId: consumerNode.id,
        depth: nextDepth,
        path: nextPath,
      });
    }
  }

  const allAffected = [...directConsumers, ...transitiveConsumers];
  return {
    targetService,
    directConsumers,
    transitiveConsumers,
    allAffected,
    maxDepth,
  };
}

/**
 * Computes a deterministic, explainable 0-100 Risk Score for a target service.
 */
function calculateDeterministicRisk({
  targetService,
  directConsumers,
  transitiveConsumers,
  maxDepth,
  breakingCount = 0,
  potentiallyBreakingCount = 0,
  openIncidentCount = 0,
}) {
  const factors = [];

  // Factor 1: Provider Criticality (Max 25)
  const providerPoints = CRITICALITY_SCORES[targetService.criticality] || 10;
  factors.push({
    name: 'Provider Criticality',
    points: providerPoints,
    maxPoints: 25,
    rationale: `Service criticality classified as ${targetService.criticality}.`,
  });

  // Factor 2: Blast Radius & Consumer Criticality (Max 35)
  const allConsumers = [...directConsumers, ...transitiveConsumers];
  const hasHighCritConsumer = allConsumers.some(
    (c) => c.criticality === 'CRITICAL' || c.criticality === 'HIGH'
  );
  const rawConsumerPoints =
    directConsumers.length * 8 +
    transitiveConsumers.length * 4 +
    (hasHighCritConsumer ? 5 : 0);
  const consumerPoints = Math.min(35, rawConsumerPoints);
  factors.push({
    name: 'Consumer Blast Radius',
    points: consumerPoints,
    maxPoints: 35,
    rationale: `${directConsumers.length} direct and ${transitiveConsumers.length} transitive consumer(s)${
      hasHighCritConsumer ? ' (includes CRITICAL/HIGH consumer)' : ''
    }.`,
  });

  // Factor 3: Contract Breaking-Change Severity (Max 25)
  const rawDiffPoints = breakingCount * 10 + potentiallyBreakingCount * 3;
  const diffPoints = Math.min(25, rawDiffPoints);
  factors.push({
    name: 'Contract Breaking Changes',
    points: diffPoints,
    maxPoints: 25,
    rationale:
      breakingCount > 0 || potentiallyBreakingCount > 0
        ? `${breakingCount} breaking and ${potentiallyBreakingCount} potentially breaking contract delta(s).`
        : 'No breaking contract deltas evaluated.',
  });

  // Factor 4: Operational Incidents & Depth (Max 15)
  const incidentPts = openIncidentCount > 0 ? 10 : 0;
  const depthPts = maxDepth >= 2 ? 5 : maxDepth === 1 ? 2 : 0;
  const opsPoints = Math.min(15, incidentPts + depthPts);
  factors.push({
    name: 'Operational Health & Depth',
    points: opsPoints,
    maxPoints: 15,
    rationale: `${openIncidentCount} active incident(s); max downstream dependency depth = ${maxDepth}.`,
  });

  const riskScore = Math.min(100, providerPoints + consumerPoints + diffPoints + opsPoints);
  const riskLevel =
    riskScore >= 75
      ? 'CRITICAL'
      : riskScore >= 50
      ? 'HIGH'
      : riskScore >= 25
      ? 'MEDIUM'
      : 'LOW';

  // Generate deterministic migration recommendations
  const recommendations = [];
  if (breakingCount > 0 && allConsumers.length > 0) {
    recommendations.push(
      `Coordinate backward-compatible rollout with ${directConsumers.map((c) => c.name).join(', ')} before deploying breaking contract changes.`
    );
  }
  if (transitiveConsumers.length > 0) {
    recommendations.push(
      `Notify downstream transitive teams (${transitiveConsumers.map((c) => c.name).join(', ')}) of potential cascading failures.`
    );
  }
  if (openIncidentCount > 0) {
    recommendations.push(
      `Resolve ${openIncidentCount} active incident(s) on the underlying API endpoint prior to releasing schema updates.`
    );
  }
  if (recommendations.length === 0) {
    recommendations.push('Risk exposure is minimal; standard automated deployment checks are sufficient.');
  }

  return {
    riskScore,
    riskLevel,
    formulaVersion: 'v1.0-deterministic',
    factors,
    migrationRecommendations: recommendations,
  };
}

/**
 * Full impact analysis orchestrator combining contract diffs (optional)
 * with dependency graph blast radius and deterministic risk scoring.
 */
async function analyzeImpact({ serviceId, endpointId, baselineVersionId, targetVersionId }) {
  let resolvedServiceId = serviceId;

  if (!resolvedServiceId && endpointId) {
    const svc = await prisma.service.findFirst({ where: { endpointId } });
    if (!svc) {
      throw new Error('No registered Service is linked to this API endpoint yet.');
    }
    resolvedServiceId = svc.id;
  }

  const traversal = await findAffectedConsumers(resolvedServiceId);
  const openIncidentCount = traversal.targetService.endpoint?.incidents?.length || 0;

  let diffSummary = null;
  let breakingCount = 0;
  let potentiallyBreakingCount = 0;

  if (baselineVersionId && targetVersionId) {
    const [v1, v2] = await Promise.all([
      prisma.aPIVersion.findUnique({ where: { id: baselineVersionId } }),
      prisma.aPIVersion.findUnique({ where: { id: targetVersionId } }),
    ]);

    if (v1 && v2) {
      diffSummary = compareOpenApiSpecs(v1.specification, v2.specification);
      breakingCount = diffSummary.breakingCount;
      potentiallyBreakingCount = diffSummary.potentiallyBreakingCount;
    }
  }

  const riskReport = calculateDeterministicRisk({
    targetService: traversal.targetService,
    directConsumers: traversal.directConsumers,
    transitiveConsumers: traversal.transitiveConsumers,
    maxDepth: traversal.maxDepth,
    breakingCount,
    potentiallyBreakingCount,
    openIncidentCount,
  });

  return {
    targetService: {
      id: traversal.targetService.id,
      name: traversal.targetService.name,
      criticality: traversal.targetService.criticality,
      ownerTeam: traversal.targetService.ownerTeam,
      endpointId: traversal.targetService.endpointId,
      openIncidentCount,
    },
    blastRadius: {
      totalAffectedCount: traversal.allAffected.length,
      directCount: traversal.directConsumers.length,
      transitiveCount: traversal.transitiveConsumers.length,
      maxDepth: traversal.maxDepth,
      directConsumers: traversal.directConsumers,
      transitiveConsumers: traversal.transitiveConsumers,
    },
    contractDiffSummary: diffSummary
      ? {
          baselineVersion: diffSummary.baselineVersion,
          targetVersion: diffSummary.targetVersion,
          breakingCount: diffSummary.breakingCount,
          potentiallyBreakingCount: diffSummary.potentiallyBreakingCount,
          nonBreakingCount: diffSummary.nonBreakingCount,
          isCompatible: diffSummary.isCompatible,
        }
      : null,
    ...riskReport,
  };
}

module.exports = {
  getDependencyGraph,
  findAffectedConsumers,
  calculateDeterministicRisk,
  analyzeImpact,
};
