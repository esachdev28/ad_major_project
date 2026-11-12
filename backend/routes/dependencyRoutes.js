/**
 * dependencyRoutes.js
 *
 * REST API endpoints for Service Registry, Integration Edges, Directed Dependency Graph,
 * and Blast Radius / Risk Score Impact Analysis.
 */

const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { getDependencyGraph, analyzeImpact } = require('../services/dependencyService');

const ALLOWED_CRITICALITY = new Set(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);

// ==============================================================================
// GET /api/dependencies/graph
// Returns all Service nodes and directed Provider -> Consumer edges
// ==============================================================================
router.get('/graph', async (req, res) => {
  try {
    const graph = await getDependencyGraph();
    return res.status(200).json({
      success: true,
      data: graph,
    });
  } catch (error) {
    console.error('Error building dependency graph:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve dependency graph',
    });
  }
});

// ==============================================================================
// GET /api/dependencies/services
// Lists all registered services
// ==============================================================================
router.get('/services', async (req, res) => {
  try {
    const graph = await getDependencyGraph();
    return res.status(200).json({
      success: true,
      data: graph.services,
    });
  } catch (error) {
    console.error('Error listing services:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve services' });
  }
});

// ==============================================================================
// POST /api/dependencies/services
// Registers a new service (optionally linked to an APIEndpoint)
// ==============================================================================
router.post('/services', async (req, res) => {
  try {
    const { name, description, criticality = 'MEDIUM', ownerTeam, endpointId } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Service name is required.' });
    }

    const cleanCriticality = String(criticality).toUpperCase();
    if (!ALLOWED_CRITICALITY.has(cleanCriticality)) {
      return res.status(400).json({
        success: false,
        message: 'Criticality must be CRITICAL, HIGH, MEDIUM, or LOW.',
      });
    }

    if (endpointId) {
      const ep = await prisma.aPIEndpoint.findUnique({ where: { id: endpointId } });
      if (!ep) {
        return res.status(404).json({ success: false, message: 'Linked API endpoint not found.' });
      }
    }

    const created = await prisma.service.create({
      data: {
        name: name.trim(),
        description: description ? description.trim() : null,
        criticality: cleanCriticality,
        ownerTeam: ownerTeam ? ownerTeam.trim() : null,
        endpointId: endpointId || null,
      },
    });

    return res.status(201).json({
      success: true,
      data: created,
      message: `Service "${created.name}" registered.`,
    });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({
        success: false,
        message: 'A service with this name already exists.',
      });
    }
    console.error('Error registering service:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to register service' });
  }
});

// ==============================================================================
// DELETE /api/dependencies/services/:id
// Deletes a service and cascades its integration edges
// ==============================================================================
router.delete('/services/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.service.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }

    await prisma.service.delete({ where: { id } });
    return res.status(200).json({
      success: true,
      message: `Service "${existing.name}" deleted.`,
    });
  } catch (error) {
    console.error('Error deleting service:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to delete service' });
  }
});

// ==============================================================================
// POST /api/dependencies/integrations
// Links a Consumer service to a Provider service
// ==============================================================================
router.post('/integrations', async (req, res) => {
  try {
    const { providerId, consumerId, contractVersion, notes } = req.body;

    if (!providerId || !consumerId) {
      return res.status(400).json({
        success: false,
        message: 'Both providerId and consumerId are required.',
      });
    }

    if (providerId === consumerId) {
      return res.status(400).json({
        success: false,
        message: 'A service cannot depend on itself.',
      });
    }

    const [provider, consumer] = await Promise.all([
      prisma.service.findUnique({ where: { id: providerId } }),
      prisma.service.findUnique({ where: { id: consumerId } }),
    ]);

    if (!provider || !consumer) {
      return res.status(404).json({
        success: false,
        message: 'Provider or consumer service was not found.',
      });
    }

    const edge = await prisma.serviceDependency.create({
      data: {
        providerId,
        consumerId,
        contractVersion: contractVersion ? contractVersion.trim() : null,
        notes: notes ? notes.trim() : null,
      },
      include: {
        provider: { select: { id: true, name: true } },
        consumer: { select: { id: true, name: true } },
      },
    });

    return res.status(201).json({
      success: true,
      data: edge,
      message: `Linked consumer "${consumer.name}" -> provider "${provider.name}".`,
    });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({
        success: false,
        message: 'This integration dependency already exists.',
      });
    }
    console.error('Error creating integration:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to create integration' });
  }
});

// ==============================================================================
// DELETE /api/dependencies/integrations/:id
// Removes a directed integration link
// ==============================================================================
router.delete('/integrations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.serviceDependency.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Integration link not found' });
    }

    await prisma.serviceDependency.delete({ where: { id } });
    return res.status(200).json({
      success: true,
      message: 'Integration link removed.',
    });
  } catch (error) {
    console.error('Error removing integration:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to remove integration' });
  }
});

// ==============================================================================
// POST /api/dependencies/impact
// Computes blast radius (direct & transitive consumers) and deterministic risk score
// ==============================================================================
router.post('/impact', async (req, res) => {
  try {
    const { serviceId, endpointId, baselineVersionId, targetVersionId } = req.body;

    if (!serviceId && !endpointId) {
      return res.status(400).json({
        success: false,
        message: 'Provide either serviceId or endpointId to analyze impact.',
      });
    }

    const report = await analyzeImpact({
      serviceId,
      endpointId,
      baselineVersionId,
      targetVersionId,
    });

    return res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error) {
    console.error('Impact analysis error:', error.message);
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to compute impact analysis',
    });
  }
});

module.exports = router;

