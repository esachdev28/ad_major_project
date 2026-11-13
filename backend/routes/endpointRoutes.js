/**
 * endpointRoutes.js — API Endpoint Management & Failure Detection Probe
 * 
 * 1. Why this file exists:
 *    Manages the lifecycle of registered API endpoints in API Sentinel. It provides
 *    CRUD operations for monitored endpoints and executes real-time HTTP health probes
 *    to detect latency spikes, non-2xx status codes, and network outages.
 * 
 * 2. What its responsibilities are:
 *    - GET /api/endpoints : List all registered endpoints with latest health check and open incidents.
 *    - POST /api/endpoints : Register an endpoint for continuous observability.
 *    - GET /api/endpoints/:id : Retrieve endpoint details, recent checks, incidents, and consumers.
 *    - POST /api/endpoints/:id/probe : Active failure detection probe that pings the target URL,
 *      measures latency, writes a HealthCheck record, and automatically creates an Incident on failure.
 *    - DELETE /api/endpoints/:id : Remove an endpoint and cascade-delete associated telemetry.
 * 
 * 3. Which functions/handlers it contains:
 *    - router.get('/', ...) : List endpoints with relations.
 *    - router.post('/', ...) : Validate and store new APIEndpoint.
 *    - router.get('/:id', ...) : Detailed endpoint view.
 *    - router.post('/:id/probe', ...) : Failure detection ping engine using native fetch.
 *    - router.delete('/:id', ...) : Safe cascade deletion.
 * 
 * 4. How it communicates with other files:
 *    - Imports `prisma` from `../lib/prisma` to execute PostgreSQL queries.
 *    - Mounted in `server.js` under `/api/endpoints`.
 *    - Consumed by `frontend/src/services/api.js` and MCP diagnostic tools.
 * 
 * 5. Why this chosen approach is appropriate:
 *    - Native Node.js `fetch` with AbortController handles timeouts cleanly without third-party HTTP clients.
 *    - Automatic incident generation on consecutive or single probe failure implements the core problem statement.
 * 
 * 6. Database Request Flow:
 *    Client -> POST /api/endpoints/:id/probe -> Fetch ping target URL -> Record HealthCheck
 *    -> (if failed) Record Incident -> PostgreSQL -> Express JSON Response.
 */

const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');

// GET /api/endpoints
// Lists all registered API endpoints with their latest health check and open incident count
router.get('/', async (req, res) => {
  try {
    const endpoints = await prisma.aPIEndpoint.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        healthChecks: {
          orderBy: { checkedAt: 'desc' },
          take: 1
        },
        incidents: {
          where: { status: 'OPEN' },
          select: { id: true, title: true, status: true }
        },
        _count: {
          select: {
            integrations: true,
            versions: true
          }
        }
      }
    });

    return res.status(200).json({
      success: true,
      data: endpoints,
      message: 'Endpoints retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching endpoints:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve endpoints from database'
    });
  }
});

// POST /api/endpoints
// Registers a new API endpoint for monitoring
router.post('/', async (req, res) => {
  const { name, url, method = 'GET', description, userId } = req.body;

  if (!name || !url) {
    return res.status(400).json({
      success: false,
      message: 'Validation error: name and url are required fields'
    });
  }

  // Basic URL structure validation
  try {
    new URL(url);
  } catch (_) {
    return res.status(400).json({
      success: false,
      message: 'Validation error: invalid URL format'
    });
  }

  try {
    const newEndpoint = await prisma.aPIEndpoint.create({
      data: {
        name,
        url,
        method: method.toUpperCase(),
        description: description || null,
        userId: userId || null
      }
    });

    return res.status(201).json({
      success: true,
      data: newEndpoint,
      message: 'API Endpoint registered successfully'
    });
  } catch (error) {
    console.error('Error creating endpoint:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to create endpoint in database'
    });
  }
});

// GET /api/endpoints/:id
// Retrieves full telemetry, history, and dependencies for a single endpoint
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const endpoint = await prisma.aPIEndpoint.findUnique({
      where: { id },
      include: {
        healthChecks: {
          orderBy: { checkedAt: 'desc' },
          take: 20
        },
        incidents: {
          orderBy: { createdAt: 'desc' },
          take: 10
        },
        versions: {
          orderBy: { createdAt: 'desc' }
        },
        integrations: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!endpoint) {
      return res.status(404).json({
        success: false,
        message: `Endpoint with ID ${id} not found`
      });
    }

    return res.status(200).json({
      success: true,
      data: endpoint,
      message: 'Endpoint details retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching endpoint details:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve endpoint details'
    });
  }
});

// POST /api/endpoints/:id/probe
// Failure Detection Engine: Active HTTP probe that measures latency, status, and creates incident if failing
router.post('/:id/probe', async (req, res) => {
  const { id } = req.params;

  try {
    const endpoint = await prisma.aPIEndpoint.findUnique({
      where: { id }
    });

    if (!endpoint) {
      return res.status(404).json({
        success: false,
        message: `Endpoint with ID ${id} not found`
      });
    }

    const startTime = Date.now();
    let statusCode = null;
    let isHealthy = false;
    let errorMessage = null;
    let latency = 0;

    // Set a 7-second timeout for the probe using standard AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    try {
      const response = await fetch(endpoint.url, {
        method: endpoint.method,
        signal: controller.signal,
        headers: {
          'User-Agent': 'APISentinel-HealthProbe/1.0'
        }
      });

      clearTimeout(timeoutId);
      latency = Date.now() - startTime;
      statusCode = response.status;
      // An endpoint is considered healthy if status is 2xx or 3xx
      isHealthy = response.ok || (statusCode >= 200 && statusCode < 400);

      if (!isHealthy) {
        errorMessage = `HTTP check failed with status code ${statusCode} (${response.statusText || 'Error'})`;
      }
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      latency = Date.now() - startTime;
      isHealthy = false;

      if (fetchErr.name === 'AbortError') {
        errorMessage = 'Probe timed out after 7000ms';
        statusCode = 504;
      } else {
        errorMessage = `Network failure: ${fetchErr.message}`;
      }
    }

    // 1. Record HealthCheck row in PostgreSQL
    const checkRecord = await prisma.healthCheck.create({
      data: {
        endpointId: endpoint.id,
        statusCode,
        latency,
        isHealthy,
        errorMessage
      }
    });

    // 2. Automated Failure Detection & Incident Creation
    // If the probe failed and there is no open incident yet, create one automatically
    let createdIncident = null;
    if (!isHealthy) {
      const existingOpenIncident = await prisma.incident.findFirst({
        where: {
          endpointId: endpoint.id,
          status: 'OPEN'
        }
      });

      if (!existingOpenIncident) {
        createdIncident = await prisma.incident.create({
          data: {
            endpointId: endpoint.id,
            title: `Outage detected: ${endpoint.name} (${statusCode || 'Network Error'})`,
            description: `Automated probe failure recorded at ${new Date().toISOString()}. ${errorMessage}. Measured response time: ${latency}ms.`,
            status: 'OPEN'
          }
        });
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        healthCheck: checkRecord,
        incident: createdIncident,
        isHealthy,
        latency: `${latency} ms`,
        statusCode
      },
      message: isHealthy ? 'Probe passed successfully' : 'Probe failed; telemetry and incident logged'
    });
  } catch (error) {
    console.error('Error running endpoint probe:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while executing probe'
    });
  }
});

// DELETE /api/endpoints/:id
// Removes an endpoint and cascades to checks, incidents, versions, and integrations
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.aPIEndpoint.delete({
      where: { id }
    });

    return res.status(200).json({
      success: true,
      message: 'API Endpoint and associated telemetry deleted successfully'
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'Endpoint not found'
      });
    }

    console.error('Error deleting endpoint:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete endpoint'
    });
  }
});

module.exports = router;

