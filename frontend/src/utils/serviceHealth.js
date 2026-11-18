export const SERVICE_HEALTH_STATES = {
  HEALTHY: { label: 'Healthy', color: '#10b981' },
  DEGRADED: { label: 'Degraded', color: '#f59e0b' },
  FAILED: { label: 'Failed', color: '#ef4444' },
  UNKNOWN: { label: 'Not monitored', color: '#64748b' },
};

/**
 * Derives a display state from the latest real check and active incidents.
 * A missing check stays unknown; endpoint registration alone is not health.
 */
export function getServiceHealth(node) {
  const endpoint = node.endpoint;
  const latestCheck = endpoint?.healthChecks?.[0];

  if (!latestCheck) return 'UNKNOWN';
  if (!latestCheck.isHealthy) return 'FAILED';
  if (endpoint.incidents?.length > 0) return 'DEGRADED';
  return 'HEALTHY';
}
