/**
 * services/probeService.js
 *
 * Core HTTP probing engine for API Sentinel.
 * Powered by API Scout (@vedant23/api-scout) for reusable endpoint inspection,
 * response-time measurement, timeout enforcement, and status validation.
 *
 * Handles API Sentinel-specific domain concerns:
 * - Pre-flight SSRF Guard and redirect destination validation
 * - Decryption of AES-256-GCM encrypted headers
 * - Persisting HealthCheck telemetry to PostgreSQL
 * - Incident detection, deduplication, and auto-recovery
 */

const prisma = require('../lib/prisma');
const { validateUrlForMonitoring } = require('../utils/urlValidator');
const { evaluateCheckForIncident } = require('./incidentService');
const { decrypt } = require('../utils/encryption');
const { inspectAPI } = require('@vedant23/api-scout');

const MAX_REDIRECTS = 5;

/**
 * Probes a single endpoint and stores the result in PostgreSQL.
 *
 * @param {string|object} endpointOrId - Either the APIEndpoint object or its ID
 * @returns {Promise<{ success: boolean, check: object, message?: string, scout?: object }>}
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

  let currentUrl = endpoint.url;
  let redirectCount = 0;
  let isSsrfBlocked = false;
  let ssrfErrorMessage = null;

  // Validate redirect destinations against SSRF Guard
  while (redirectCount < MAX_REDIRECTS) {
    let hopRes;
    try {
      hopRes = await fetch(currentUrl, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'API-Sentinel-Monitor/1.0',
          ...customHeaders,
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(Math.min(timeoutMs, 2500)),
      });
      if (hopRes.body) {
        try { await hopRes.body.cancel(); } catch {}
      }
    } catch (_) {
      // If HEAD request is rejected or unsupported, attempt GET with manual redirect
      try {
        hopRes = await fetch(currentUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'API-Sentinel-Monitor/1.0',
            ...customHeaders,
          },
          redirect: 'manual',
          signal: AbortSignal.timeout(Math.min(timeoutMs, 2500)),
        });
        if (hopRes.body) {
          try { await hopRes.body.cancel(); } catch {}
        }
      } catch (_) {
        break;
      }
    }

    const isRedirect = [301, 302, 303, 307, 308].includes(hopRes?.status);
    if (!isRedirect) {
      break;
    }

    const locationHeader = hopRes.headers.get('location');
    if (!locationHeader) {
      break;
    }

    redirectCount++;
    if (redirectCount > MAX_REDIRECTS) {
      const failedCheck = await prisma.healthCheck.create({
        data: {
          endpointId: endpoint.id,
          statusCode: hopRes.status,
          latency: 0,
          isHealthy: false,
          errorMessage: `Exceeded maximum redirect limit of ${MAX_REDIRECTS} hops`,
        },
      });
      return { success: false, check: failedCheck, message: 'Max redirects exceeded' };
    }

    const destinationUrl = new URL(locationHeader, currentUrl).href;
    const redirectCheck = await validateUrlForMonitoring(destinationUrl);
    if (!redirectCheck.isValid) {
      isSsrfBlocked = true;
      ssrfErrorMessage = `Blocked by SSRF Guard: ${redirectCheck.error}`;
      break;
    }

    currentUrl = destinationUrl;
  }

  if (isSsrfBlocked) {
    const failedCheck = await prisma.healthCheck.create({
      data: {
        endpointId: endpoint.id,
        statusCode: null,
        latency: 0,
        isHealthy: false,
        errorMessage: ssrfErrorMessage,
      },
    });
    return { success: false, check: failedCheck, message: ssrfErrorMessage };
  }

  // Delegate HTTP inspection, latency measurement, timeout handling,
  // and status verification to API Scout
  const scoutResult = await inspectAPI(currentUrl, {
    method: endpoint.method || 'GET',
    timeout: timeoutMs,
    expectedStatus: endpoint.expectedStatus || 200,
    headers: {
      'User-Agent': 'API-Sentinel-Monitor/1.0',
      ...customHeaders,
    },
  });

  const statusCode = scoutResult.status;
  const latency = Math.max(1, scoutResult.responseTime);
  const isHealthy = scoutResult.ok;
  let errorMessage = null;

  if (!isHealthy) {
    if (scoutResult.error === 'TIMEOUT') {
      errorMessage = `Connection timed out after ${timeoutMs}ms`;
    } else if (scoutResult.error === 'STATUS_MISMATCH') {
      const expected = endpoint.expectedStatus || 200;
      errorMessage = `Expected HTTP ${expected}, but remote server returned ${statusCode}`;
    } else {
      errorMessage = scoutResult.message || 'Network connection failed';
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
    scout: scoutResult,
  };
}

module.exports = {
  executeProbe,
};
