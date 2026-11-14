/**
 * integrationRoutes.js — Consumer Dependency Tracking & Impact Assessment
 * 
 * 1. Why this file exists:
 *    Maintains the integration dependency graph for API Sentinel. Modern systems
 *    have many microservices, mobile apps, and frontends depending on shared APIs.
 *    This module maps which consumers depend on which API endpoints to perform
 *    automated Impact Assessments during outages or contract breaking changes.
 * 
 * 2. What its responsibilities are:
 *    - GET /api/integrations : List all registered consumer dependencies.
 *    - POST /api/integrations : Register a new consuming application/service for an API.
 *    - GET /api/integrations/endpoint/:endpointId : Retrieve consumers dependent on an endpoint.
 *    - GET /api/integrations/impact/:endpointId : Perform Impact Assessment, calculating
 *      blast radius, critical services at risk, and alerting contacts for incident triage.
 *    - DELETE /api/integrations/:id : Unregister a dependency.
 * 
 * 3. Which functions/handlers it contains:
 *    - router.get('/', ...) : Global dependency overview.
 *    - router.post('/', ...) : Register consumer mapping.
 *    - router.get('/endpoint/:endpointId', ...) : Scoped consumer listing.
 *    - router.get('/impact/:endpointId', ...) : Impact Assessment computation.
 *    - router.delete('/:id', ...) : Safe deletion.
 * 
 * 4. How it communicates with other files:
 *    - Queries the `Integration` and `APIEndpoint` models via `../lib/prisma`.
 *    - Mounted in `server.js` under `/api/integrations`.
 *    - Invoked by MCP diagnostic tool `investigate_impact`.
 * 
 * 5. Why this chosen approach is appropriate:
 *    - Direct relational integrity with cascading deletes ensures no orphaned dependencies.
 *    - Structured impact response provides immediate blast-radius visibility for engineering teams.
 * 
 * 6. Database Request Flow:
 *    Client -> GET /api/integrations/impact/:endpointId -> Query integrations in PostgreSQL
 *    -> Group by criticality & blast radius -> Return Impact Assessment JSON.
 */

const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');

// GET /api/integrations
// Lists all registered consumer dependencies across all endpoints
router.get('/', async (req, res) => {
  try {
    const integrations = await prisma.integration.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        endpoint: {
          select: { id: true, name: true, url: true, method: true }
        }
      }
    });

    return res.status(200).json({
      success: true,
      data: integrations,
      message: 'Integration dependencies retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching integrations:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve integrations from database'
    });
  }
});

// POST /api/integrations
// Registers a new consumer application depending on an API endpoint
router.post('/', async (req, res) => {
  const {
    endpointId,
    consumerName,
    serviceType = 'frontend',
    contactEmail,
    environment = 'production',
    criticality = 'HIGH'
  } = req.body;

  if (!endpointId || !consumerName) {
    return res.status(400).json({
      success: false,
      message: 'Validation error: endpointId and consumerName are required'
    });
  }

  const validCriticalities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  const formattedCriticality = criticality.toUpperCase();
  if (!validCriticalities.includes(formattedCriticality)) {
    return res.status(400).json({
      success: false,
      message: `Invalid criticality. Must be one of: ${validCriticalities.join(', ')}`
    });
  }

  try {
    const endpoint = await prisma.aPIEndpoint.findUnique({
      where: { id: endpointId }
    });

    if (!endpoint) {
      return res.status(404).json({
        success: false,
        message: `API Endpoint with ID ${endpointId} not found`
      });
    }

    const integration = await prisma.integration.create({
      data: {
        endpointId,
        consumerName,
        serviceType,
        contactEmail: contactEmail || null,
        environment,
        criticality: formattedCriticality
      }
    });

    return res.status(201).json({
      success: true,
      data: integration,
      message: `Consumer dependency '${consumerName}' registered successfully`
    });
  } catch (error) {
    console.error('Error registering integration:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to create integration dependency'
    });
  }
});

// GET /api/integrations/endpoint/:endpointId
// Lists all consumer dependencies for a specific endpoint
router.get('/endpoint/:endpointId', async (req, res) => {
  const { endpointId } = req.params;

  try {
    const dependencies = await prisma.integration.findMany({
      where: { endpointId },
      orderBy: { criticality: 'asc' }
    });

    return res.status(200).json({
      success: true,
      data: dependencies,
      message: 'Endpoint dependencies retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching endpoint dependencies:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve dependencies'
    });
  }
});

// GET /api/integrations/impact/:endpointId
// Impact Assessment Engine: Computes blast radius and lists all affected downstream consumers
router.get('/impact/:endpointId', async (req, res) => {
  const { endpointId } = req.params;

  try {
    const endpoint = await prisma.aPIEndpoint.findUnique({
      where: { id: endpointId },
      include: {
        integrations: true,
        incidents: {
          where: { status: 'OPEN' }
        }
      }
    });

    if (!endpoint) {
      return res.status(404).json({
        success: false,
        message: `Endpoint with ID ${endpointId} not found`
      });
    }

    const integrations = endpoint.integrations || [];
    const criticalCount = integrations.filter(i => i.criticality === 'CRITICAL').length;
    const highCount = integrations.filter(i => i.criticality === 'HIGH').length;

    // Determine overall blast radius risk level
    let blastRadiusRisk = 'LOW';
    if (criticalCount > 0) blastRadiusRisk = 'CRITICAL';
    else if (highCount > 0 || integrations.length > 3) blastRadiusRisk = 'HIGH';
    else if (integrations.length > 0) blastRadiusRisk = 'MEDIUM';

    // Unique contact emails for notification dispatch
    const notificationList = Array.from(
      new Set(integrations.map(i => i.contactEmail).filter(Boolean))
    );

    const impactAssessment = {
      endpoint: {
        id: endpoint.id,
        name: endpoint.name,
        url: endpoint.url,
        method: endpoint.method
      },
      hasActiveIncident: endpoint.incidents.length > 0,
      activeIncidentCount: endpoint.incidents.length,
      blastRadiusRisk,
      totalConsumersAffected: integrations.length,
      criticalConsumersAffected: criticalCount,
      highConsumersAffected: highCount,
      notificationContacts: notificationList,
      affectedConsumers: integrations.map(item => ({
        id: item.id,
        name: item.consumerName,
        serviceType: item.serviceType,
        environment: item.environment,
        criticality: item.criticality,
        contact: item.contactEmail || 'Unassigned'
      }))
    };

    return res.status(200).json({
      success: true,
      data: impactAssessment,
      message: `Impact assessment calculated: ${integrations.length} consumers identified`
    });
  } catch (error) {
    console.error('Error generating impact assessment:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate impact assessment'
    });
  }
});

// DELETE /api/integrations/:id
// Deletes a consumer dependency mapping
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.integration.delete({
      where: { id }
    });

    return res.status(200).json({
      success: true,
      message: 'Consumer dependency deleted successfully'
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'Integration not found'
      });
    }

    console.error('Error deleting integration:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete integration'
    });
  }
});

module.exports = router;

