/**
 * services/probeService.js
 *
 * Core HTTP probing engine for API Sentinel.
 * Executes live health checks against registered endpoints, records response latency,
 * verifies expected status codes, and persists results to the database.
 */

const prisma = require('../lib/prisma');
const { validateUrlForMonitoring } = require('../utils/urlValidator');

/**
 * Probes a single endpoint and stores the result in PostgreSQL.
 *
 * @param {string|object} endpointOrId - Either the APIEndpoint object or its ID
 * @returns {Promise<{ success: boolean, check: object, message?: string }>}
 */
async function executeProbe(endpointOrId) {
  let endpoint = endpointOrId;
  if (typeof endpointOrId === 'string') {
    endpoint = await prisma.aPIEndpoint.findUnique({
      where: { id: endpointOrId },
    });
  }

  if (!endpoint) {
    throw new Error('Endpoint not found');
  }

  // SSRF validation check prior to network call
  const urlCheck = await validateUrlForMonitoring(endpoint.url);
  if (!urlCheck.isValid) {
    const failedCheck = await prisma.healthCheck.create({
      data: {
        endpointId: endpoint.id,
        statusCode: null,
        latency: 0,
        isHealthy: false,
        errorMessage: `Blocked by SSRF Guard: ${urlCheck.error}`,
      },
    });
    return { success: false, check: failedCheck, message: urlCheck.error };
  }

  const timeoutMs = endpoint.timeout || 5000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let customHeaders = {};
  if (endpoint.headers) {
    try {
      customHeaders = typeof endpoint.headers === 'string'
        ? JSON.parse(endpoint.headers)
        : endpoint.headers;
    } catch (_) {
      // Ignore header parse issues
    }
  }

  const startTime = Date.now();
  let statusCode = null;
  let isHealthy = false;
  let errorMessage = null;
  let latency = 0;

  try {
    const response = await fetch(endpoint.url, {
      method: endpoint.method || 'GET',
      headers: {
        'User-Agent': 'API-Sentinel-Monitor/1.0',
        ...customHeaders,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    latency = Math.max(1, Date.now() - startTime);
    statusCode = response.status;

    const expected = endpoint.expectedStatus || 200;
    // Considered healthy if matches configured expectedStatus, or if status < 400 when default 200
    if (statusCode === expected || (expected === 200 && statusCode >= 200 && statusCode < 300)) {
      isHealthy = true;
    } else {
      isHealthy = false;
      errorMessage = `Expected HTTP ${expected}, but remote server returned ${statusCode}`;
    }
  } catch (error) {
    clearTimeout(timeoutId);
    latency = Math.max(1, Date.now() - startTime);
    isHealthy = false;

    if (error.name === 'AbortError') {
      errorMessage = `Connection timed out after ${timeoutMs}ms`;
    } else {
      errorMessage = error.message || 'Network connection failed';
    }
  }

  // Persist HealthCheck outcome to PostgreSQL
  const savedCheck = await prisma.healthCheck.create({
    data: {
      endpointId: endpoint.id,
      statusCode,
      latency,
      isHealthy,
      errorMessage,
    },
  });

  return {
    success: true,
    check: savedCheck,
  };
}

module.exports = {
  executeProbe,
};
