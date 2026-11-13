/**
 * services/probeService.js
 *
 * Core HTTP probing engine for API Sentinel.
 * Executes live health checks against registered endpoints, records response latency,
 * verifies expected status codes, re-validates redirects for SSRF protection,
 * decrypts encrypted authentication headers, and persists results to PostgreSQL.
 */

const prisma = require('../lib/prisma');
const { validateUrlForMonitoring } = require('../utils/urlValidator');
const { evaluateCheckForIncident } = require('./incidentService');
const { decrypt } = require('../utils/encryption');

const MAX_REDIRECTS = 5;

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

  // Initial SSRF validation check prior to network call
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

  // Decrypt custom headers if encrypted at rest (AES-256-GCM)
  let customHeaders = {};
  if (endpoint.headers) {
    try {
      const decryptedHeaders = decrypt(endpoint.headers);
      customHeaders = typeof decryptedHeaders === 'string'
        ? JSON.parse(decryptedHeaders)
        : (decryptedHeaders || {});
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
    let currentUrl = endpoint.url;
    let redirectCount = 0;
    let response = null;

    // Redirect following loop with strict SSRF re-validation on every hop
    while (redirectCount <= MAX_REDIRECTS) {
      response = await fetch(currentUrl, {
        method: redirectCount === 0 ? (endpoint.method || 'GET') : 'GET',
        headers: {
          'User-Agent': 'API-Sentinel-Monitor/1.0',
          ...customHeaders,
        },
        signal: controller.signal,
        redirect: 'manual',
      });

      const isRedirect = [301, 302, 303, 307, 308].includes(response.status);
      if (!isRedirect) {
        break;
      }

      const locationHeader = response.headers.get('location');
      if (!locationHeader) {
        break; // No location header provided, terminate at current response
      }

      redirectCount++;
      if (redirectCount > MAX_REDIRECTS) {
        throw new Error(`Exceeded maximum redirect limit of ${MAX_REDIRECTS} hops`);
      }

      // Resolve relative or absolute redirect destination
      const destinationUrl = new URL(locationHeader, currentUrl).href;

      // SSRF re-validation for the redirect target
      const redirectCheck = await validateUrlForMonitoring(destinationUrl);
      if (!redirectCheck.isValid) {
        throw new Error(`Blocked by SSRF Guard on redirect: ${redirectCheck.error}`);
      }

      currentUrl = destinationUrl;
    }

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

  // Evaluate check outcome for Incident Creation, Deduplication, or Auto-Recovery
  let incidentEvaluation = null;
  try {
    incidentEvaluation = await evaluateCheckForIncident(endpoint, savedCheck);
  } catch (evalErr) {
    console.warn('[ProbeService] Incident evaluation warning:', evalErr.message);
  }

  return {
    success: true,
    check: savedCheck,
    incidentEvaluation,
  };
}

module.exports = {
  executeProbe,
};
