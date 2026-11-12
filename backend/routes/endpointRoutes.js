const express = require('express');
const prisma = require('../lib/prisma');
const { validateUrlForMonitoring } = require('../utils/urlValidator');
const { executeProbe } = require('../services/probeService');
const { encrypt, decrypt } = require('../utils/encryption');
const { probeLimiter } = require('../middleware/rateLimiter');

const router = express.Router();
const allowedMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'];
const allowedFields = [
  'name',
  'url',
  'method',
  'description',
  'isActive',
  'interval',
  'timeout',
  'expectedStatus',
  'headers',
];

async function validateEndpointInput(body, isUpdate = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object.' };
  }
  const keys = Object.keys(body);
  const unsupported = keys.find((key) => !allowedFields.includes(key));
  if (unsupported) return { error: `Field "${unsupported}" cannot be changed.` };
  if (isUpdate && keys.length === 0) return { error: 'Provide at least one field to update.' };

  const data = {};
  if (!isUpdate || Object.hasOwn(body, 'name')) {
    if (typeof body.name !== 'string' || !body.name.trim()) return { error: 'Name is required.' };
    data.name = body.name.trim();
  }

  if (!isUpdate || Object.hasOwn(body, 'url')) {
    if (typeof body.url !== 'string' || !body.url.trim()) return { error: 'URL is required.' };
    const ssrfResult = await validateUrlForMonitoring(body.url.trim());
    if (!ssrfResult.isValid) {
      return { error: `URL rejected by SSRF Guard: ${ssrfResult.error}` };
    }
    data.url = ssrfResult.parsedUrl.toString();
  }

  if (!isUpdate || Object.hasOwn(body, 'method')) {
    if (typeof body.method !== 'string' || !allowedMethods.includes(body.method.trim().toUpperCase())) {
      return { error: 'Method must be GET, POST, PUT, PATCH, DELETE, or HEAD.' };
    }
    data.method = body.method.trim().toUpperCase();
  }

  if (Object.hasOwn(body, 'description')) {
    if (body.description !== null && typeof body.description !== 'string') return { error: 'Description must be text.' };
    data.description = typeof body.description === 'string' && body.description.trim() ? body.description.trim() : null;
  }

  if (Object.hasOwn(body, 'isActive')) {
    data.isActive = Boolean(body.isActive);
  }

  if (Object.hasOwn(body, 'interval')) {
    const parsed = parseInt(body.interval, 10);
    if (isNaN(parsed) || parsed < 5) return { error: 'Monitoring interval must be at least 5 seconds.' };
    data.interval = parsed;
  }

  if (Object.hasOwn(body, 'timeout')) {
    const parsed = parseInt(body.timeout, 10);
    if (isNaN(parsed) || parsed < 100 || parsed > 30000) return { error: 'Timeout must be between 100ms and 30000ms.' };
    data.timeout = parsed;
  }

  if (Object.hasOwn(body, 'expectedStatus')) {
    const parsed = parseInt(body.expectedStatus, 10);
    if (isNaN(parsed) || parsed < 100 || parsed > 599) return { error: 'Expected HTTP status must be between 100 and 599.' };
    data.expectedStatus = parsed;
  }

  if (Object.hasOwn(body, 'headers')) {
    if (body.headers === null || body.headers === '') {
      data.headers = null;
    } else if (typeof body.headers === 'object') {
      data.headers = encrypt(JSON.stringify(body.headers));
    } else if (typeof body.headers === 'string') {
      try {
        JSON.parse(body.headers);
        data.headers = encrypt(body.headers);
      } catch (_) {
        return { error: 'Headers must be a valid JSON object.' };
      }
    }
  }

  return { data };
}

router.get('/', async (req, res) => {
  try {
    const { active, search } = req.query;
    const where = {};

    if (active !== undefined) {
      where.isActive = active === 'true';
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { url: { contains: search, mode: 'insensitive' } },
      ];
    }

    const endpoints = await prisma.aPIEndpoint.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        healthChecks: {
          orderBy: { checkedAt: 'desc' },
          take: 20,
        },
        incidents: {
          where: { status: 'OPEN' },
          take: 1,
        },
      },
    });

    const formatted = endpoints.map((ep) => {
      const checks = ep.healthChecks || [];
      const latestCheck = checks[0] || null;
      const totalChecks = checks.length;
      const healthyChecks = checks.filter((c) => c.isHealthy).length;
      const uptime = totalChecks > 0 ? Math.round((healthyChecks / totalChecks) * 100) : 100;

      return {
        id: ep.id,
        name: ep.name,
        url: ep.url,
        method: ep.method,
        description: ep.description,
        isActive: ep.isActive,
        interval: ep.interval,
        timeout: ep.timeout,
        expectedStatus: ep.expectedStatus,
        createdAt: ep.createdAt,
        updatedAt: ep.updatedAt,
        latestCheck: latestCheck
          ? {
              id: latestCheck.id,
              statusCode: latestCheck.statusCode,
              latency: latestCheck.latency,
              isHealthy: latestCheck.isHealthy,
              errorMessage: latestCheck.errorMessage,
              checkedAt: latestCheck.checkedAt,
            }
          : null,
        uptime,
        hasOpenIncident: ep.incidents && ep.incidents.length > 0,
      };
    });

    res.json({ success: true, data: formatted });
  } catch (error) {
    console.error('Unable to list API endpoints:', error.message);
    res.status(500).json({ success: false, message: 'Unable to retrieve API endpoints.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const endpoint = await prisma.aPIEndpoint.findUnique({
      where: { id: req.params.id },
      include: {
        healthChecks: {
          orderBy: { checkedAt: 'desc' },
          take: 20,
        },
        incidents: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        versions: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!endpoint) return res.status(404).json({ success: false, message: 'API endpoint not found.' });
    if (endpoint.headers) {
      endpoint.headers = decrypt(endpoint.headers);
    }
    res.json({ success: true, data: endpoint });
  } catch (error) {
    console.error('Unable to retrieve API endpoint:', error.message);
    res.status(500).json({ success: false, message: 'Unable to retrieve API endpoint.' });
  }
});

router.post('/', async (req, res) => {
  const result = await validateEndpointInput(req.body);
  if (result.error) return res.status(400).json({ success: false, message: result.error });
  try {
    const endpoint = await prisma.aPIEndpoint.create({ data: result.data });

    // Execute an immediate initial probe so status is immediately populated
    let latestCheck = null;
    try {
      const probeRes = await executeProbe(endpoint);
      latestCheck = probeRes.check;
    } catch (probeErr) {
      console.warn('Initial probe warning:', probeErr.message);
    }

    const responseData = {
      ...endpoint,
      headers: endpoint.headers ? decrypt(endpoint.headers) : null,
      latestCheck,
    };

    res.status(201).json({
      success: true,
      data: responseData,
      message: 'API endpoint created and initially probed.',
    });
  } catch (error) {
    console.error('Unable to create API endpoint:', error.message);
    res.status(500).json({ success: false, message: 'Unable to create API endpoint.' });
  }
});

router.put('/:id', async (req, res) => {
  const result = await validateEndpointInput(req.body, true);
  if (result.error) return res.status(400).json({ success: false, message: result.error });
  try {
    const existing = await prisma.aPIEndpoint.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!existing) return res.status(404).json({ success: false, message: 'API endpoint not found.' });
    const endpoint = await prisma.aPIEndpoint.update({ where: { id: req.params.id }, data: result.data });
    const responseData = {
      ...endpoint,
      headers: endpoint.headers ? decrypt(endpoint.headers) : null,
    };
    res.json({ success: true, data: responseData, message: 'API endpoint updated.' });
  } catch (error) {
    console.error('Unable to update API endpoint:', error.message);
    res.status(500).json({ success: false, message: 'Unable to update API endpoint.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const existing = await prisma.aPIEndpoint.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!existing) return res.status(404).json({ success: false, message: 'API endpoint not found.' });
    // The schema's onDelete: Cascade rules remove checks, incidents, and versions.
    await prisma.aPIEndpoint.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'API endpoint and its associated records were deleted.' });
  } catch (error) {
    console.error('Unable to delete API endpoint:', error.message);
    res.status(500).json({ success: false, message: 'Unable to delete API endpoint.' });
  }
});

router.post('/:id/check', probeLimiter, async (req, res) => {
  try {
    const endpoint = await prisma.aPIEndpoint.findUnique({ where: { id: req.params.id } });
    if (!endpoint) return res.status(404).json({ success: false, message: 'API endpoint not found.' });

    const probeResult = await executeProbe(endpoint);
    res.status(200).json({
      success: true,
      data: probeResult.check,
      message: probeResult.check.isHealthy
        ? `Check passed with HTTP ${probeResult.check.statusCode} (${probeResult.check.latency}ms)`
        : `Check failed: ${probeResult.check.errorMessage || 'HTTP Error'}`,
    });
  } catch (error) {
    console.error('Manual probe failed:', error.message);
    res.status(500).json({ success: false, message: error.message || 'Failed to execute manual probe.' });
  }
});

// ==============================================================================
// GET /api/endpoints/:id/history
// Retrieves historical check logs, uptime %, error rate, and P50/P95/P99 latency
// ==============================================================================
router.get('/:id/history', async (req, res) => {
  try {
    const { id } = req.params;
    const hours = parseInt(req.query.hours, 10) || 24;
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const sinceDate = new Date(Date.now() - hours * 3600 * 1000);

    const endpoint = await prisma.aPIEndpoint.findUnique({ where: { id } });
    if (!endpoint) {
      return res.status(404).json({ success: false, message: 'API endpoint not found.' });
    }

    const checks = await prisma.healthCheck.findMany({
      where: {
        endpointId: id,
        checkedAt: { gte: sinceDate },
      },
      orderBy: { checkedAt: 'desc' },
      take: limit,
    });

    const total = checks.length;
    const healthyCount = checks.filter((c) => c.isHealthy).length;
    const uptime = total > 0 ? Number(((healthyCount / total) * 100).toFixed(2)) : 100;
    const errorRate = total > 0 ? Number((((total - healthyCount) / total) * 100).toFixed(2)) : 0;

    const latencies = checks
      .map((c) => c.latency)
      .filter((l) => typeof l === 'number')
      .sort((a, b) => a - b);

    const getPerc = (p) => {
      if (latencies.length === 0) return 0;
      const idx = Math.ceil((p / 100) * latencies.length) - 1;
      return latencies[Math.max(0, Math.min(idx, latencies.length - 1))];
    };

    const statusDistribution = {};
    for (const c of checks) {
      const key = c.statusCode ? `${Math.floor(c.statusCode / 100)}xx` : 'Network/Timeout';
      statusDistribution[key] = (statusDistribution[key] || 0) + 1;
    }

    return res.status(200).json({
      success: true,
      data: {
        endpointId: id,
        endpointName: endpoint.name,
        totalChecks: total,
        uptime,
        errorRate,
        percentiles: {
          p50: getPerc(50),
          p95: getPerc(95),
          p99: getPerc(99),
        },
        statusDistribution,
        history: [...checks].reverse(),
      },
    });
  } catch (error) {
    console.error('Error fetching endpoint history:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve endpoint history',
    });
  }
});

module.exports = router;
