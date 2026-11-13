/**
 * services/incidentService.js
 *
 * Deterministic Incident Management Engine for API Sentinel.
 *
 * Policies:
 * - Threshold Creation: Opens a new incident only after `failureThreshold` (default 3)
 *   consecutive failed health checks occur for an endpoint.
 * - Deduplication: If an incident is already OPEN or ACKNOWLEDGED for the failing endpoint,
 *   increments `occurrenceCount` and updates `lastFailureAt` instead of creating spam duplicates.
 * - Auto-Recovery: Automatically marks an active incident as RESOLVED when a subsequent
 *   probe succeeds (`isHealthy === true`).
 */

const prisma = require('../lib/prisma');

/**
 * Evaluates a newly recorded HealthCheck against incident policies.
 *
 * @param {object} endpoint - The APIEndpoint record
 * @param {object} check - The newly saved HealthCheck record
 * @returns {Promise<{ action: string, incident?: object }>}
 */
async function evaluateCheckForIncident(endpoint, check) {
  if (!endpoint || !check) {
    return { action: 'NO_OP' };
  }

  const threshold = endpoint.failureThreshold || 3;

  // Check for any existing active (OPEN or ACKNOWLEDGED) incident
  const activeIncident = await prisma.incident.findFirst({
    where: {
      endpointId: endpoint.id,
      status: { in: ['OPEN', 'ACKNOWLEDGED'] },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!check.isHealthy) {
    // -----------------------------------------
    // CASE 1: PROBE FAILED
    // -----------------------------------------
    if (activeIncident) {
      // Deduplicate: update existing incident instead of spawning duplicates
      const updated = await prisma.incident.update({
        where: { id: activeIncident.id },
        data: {
          occurrenceCount: { increment: 1 },
          lastFailureAt: check.checkedAt || new Date(),
        },
      });
      return { action: 'DEDUPLICATED', incident: updated };
    }

    // No active incident -> check if consecutive failure threshold is met
    const recentChecks = await prisma.healthCheck.findMany({
      where: { endpointId: endpoint.id },
      orderBy: { checkedAt: 'desc' },
      take: threshold,
    });

    if (recentChecks.length >= threshold && recentChecks.every((c) => !c.isHealthy)) {
      const severity = !check.statusCode || check.statusCode >= 500 ? 'CRITICAL' : 'HIGH';
      const title = check.statusCode
        ? `HTTP ${check.statusCode} Outage on ${endpoint.name}`
        : `Connection Failure / Timeout on ${endpoint.name}`;

      const description =
        `Detected ${threshold} consecutive failed health probes. ` +
        `Latest error: ${check.errorMessage || 'Unexpected HTTP status'}.`;

      const created = await prisma.incident.create({
        data: {
          endpointId: endpoint.id,
          title,
          description,
          status: 'OPEN',
          severity,
          occurrenceCount: threshold,
          lastFailureAt: check.checkedAt || new Date(),
        },
      });

      console.log(`[Incident Engine] 🚨 Opened ${severity} incident for ${endpoint.name}: ${title}`);
      return { action: 'CREATED', incident: created };
    }

    return { action: 'BELOW_THRESHOLD' };
  } else {
    // -----------------------------------------
    // CASE 2: PROBE SUCCEEDED (RECOVERY CHECK)
    // -----------------------------------------
    if (activeIncident) {
      const resolved = await prisma.incident.update({
        where: { id: activeIncident.id },
        data: {
          status: 'RESOLVED',
          resolvedAt: new Date(),
          description: `${activeIncident.description || ''}\n[Auto-Resolved] Endpoint recovered with HTTP ${check.statusCode} (${check.latency}ms).`.trim(),
        },
      });

      console.log(`[Incident Engine] ✅ Auto-resolved incident for ${endpoint.name} (${resolved.id})`);
      return { action: 'RESOLVED', incident: resolved };
    }

    return { action: 'HEALTHY' };
  }
}

module.exports = {
  evaluateCheckForIncident,
};
