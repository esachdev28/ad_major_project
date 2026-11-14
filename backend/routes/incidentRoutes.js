/**
 * incidentRoutes.js — Incident Tracking, Investigation & Resolution Management
 * 
 * 1. Why this file exists:
 *    Provides incident lifecycle management for API Sentinel. When API failures,
 *    timeouts, or schema breakages occur, incidents record the operational disruption,
 *    its severity, resolution state, and investigation audit trail.
 * 
 * 2. What its responsibilities are:
 *    - GET /api/incidents : List all incidents, optionally filtered by status, severity, or endpointId.
 *    - GET /api/incidents/:id : Retrieve detailed incident information with recent probe history.
 *    - POST /api/incidents : Manually report an incident.
 *    - PATCH /api/incidents/:id : Update incident status (OPEN, INVESTIGATING, ACKNOWLEDGED, RESOLVED).
 *    - PATCH /api/incidents/:id/acknowledge : Acknowledge an open incident.
 *    - PATCH /api/incidents/:id/resolve : Mark an incident as resolved with timestamp.
 *    - DELETE /api/incidents/:id : Delete an incident record.
 * 
 * 3. Which functions/handlers it contains:
 *    - Route handlers for GET, POST, PATCH (status, acknowledge, resolve), and DELETE.
 * 
 * 4. How it communicates with other files:
 *    - Uses shared `prisma` singleton from `../lib/prisma`.
 *    - Mounted in `server.js` under `/api/incidents`.
 *    - Queried by frontend audit trail, Incidents.jsx, Dashboard.jsx, and MCP diagnostic tool `inspect_incidents`.
 */

const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');

// ==============================================================================
// GET /api/incidents
// Lists incidents with optional status, severity, and endpointId filters
// ==============================================================================
router.get('/', async (req, res) => {
  try {
    const { status, severity, endpointId } = req.query;

    const where = {};
    if (status && status !== 'ALL') {
      where.status = status.toUpperCase();
    }
    if (severity && severity !== 'ALL') {
      where.severity = severity.toUpperCase();
    }
    if (endpointId) {
      where.endpointId = endpointId;
    }

    const incidents = await prisma.incident.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: {
        endpoint: {
          select: {
            id: true,
            name: true,
            url: true,
            method: true,
          },
        },
      },
    });

    return res.status(200).json({
      success: true,
      data: incidents,
      message: 'Incidents retrieved successfully',
    });
  } catch (error) {
    console.error('Error fetching incidents:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve incidents',
    });
  }
});

// ==============================================================================
// GET /api/incidents/:id
// Retrieves detailed incident data including endpoint and recent failing probes
// ==============================================================================
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const incident = await prisma.incident.findUnique({
      where: { id },
      include: {
        endpoint: {
          include: {
            healthChecks: {
              orderBy: { checkedAt: 'desc' },
              take: 15,
            },
          },
        },
      },
    });

    if (!incident) {
      return res.status(404).json({
        success: false,
        message: 'Incident not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: incident,
    });
  } catch (error) {
    console.error('Error fetching incident detail:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve incident details',
    });
  }
});

// ==============================================================================
// POST /api/incidents
// Creates a new incident manually
// ==============================================================================
router.post('/', async (req, res) => {
  const { endpointId, title, description, status = 'OPEN', severity = 'HIGH' } = req.body;

  if (!endpointId || !title) {
    return res.status(400).json({
      success: false,
      message: 'Validation error: endpointId and title are required',
    });
  }

  try {
    const endpoint = await prisma.aPIEndpoint.findUnique({
      where: { id: endpointId },
    });

    if (!endpoint) {
      return res.status(404).json({
        success: false,
        message: `Endpoint with ID ${endpointId} does not exist`,
      });
    }

    const incident = await prisma.incident.create({
      data: {
        endpointId,
        title,
        description: description || null,
        status: status.toUpperCase(),
        severity: severity ? severity.toUpperCase() : 'HIGH',
      },
      include: {
        endpoint: {
          select: { id: true, name: true, url: true, method: true },
        },
      },
    });

    return res.status(201).json({
      success: true,
      data: incident,
      message: 'Incident reported successfully',
    });
  } catch (error) {
    console.error('Error creating incident:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to create incident record',
    });
  }
});

// ==============================================================================
// PATCH /api/incidents/:id
// Updates status of an incident (OPEN, INVESTIGATING, ACKNOWLEDGED, RESOLVED)
// ==============================================================================
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { status, title, description, severity } = req.body;

  const validStatuses = ['OPEN', 'INVESTIGATING', 'ACKNOWLEDGED', 'RESOLVED'];
  if (status && !validStatuses.includes(status.toUpperCase())) {
    return res.status(400).json({
      success: false,
      message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
    });
  }

  const updateData = {};
  if (title) updateData.title = title;
  if (description !== undefined) updateData.description = description;
  if (severity) updateData.severity = severity.toUpperCase();

  if (status) {
    const formattedStatus = status.toUpperCase();
    updateData.status = formattedStatus;
    if (formattedStatus === 'RESOLVED') {
      updateData.resolvedAt = new Date();
    } else if (formattedStatus === 'ACKNOWLEDGED') {
      updateData.acknowledgedAt = new Date();
    }
  }

  try {
    const updatedIncident = await prisma.incident.update({
      where: { id },
      data: updateData,
      include: {
        endpoint: {
          select: { id: true, name: true, url: true, method: true },
        },
      },
    });

    return res.status(200).json({
      success: true,
      data: updatedIncident,
      message: 'Incident status updated successfully',
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'Incident not found',
      });
    }

    console.error('Error updating incident:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to update incident',
    });
  }
});

// ==============================================================================
// PATCH /api/incidents/:id/acknowledge
// Marks an incident as ACKNOWLEDGED
// ==============================================================================
router.patch('/:id/acknowledge', async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.incident.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Incident not found' });
    }

    if (existing.status === 'RESOLVED') {
      return res.status(400).json({ success: false, message: 'Cannot acknowledge an already resolved incident.' });
    }

    const updated = await prisma.incident.update({
      where: { id },
      data: {
        status: 'ACKNOWLEDGED',
        acknowledgedAt: new Date(),
      },
      include: {
        endpoint: {
          select: { id: true, name: true, url: true, method: true },
        },
      },
    });

    return res.status(200).json({
      success: true,
      data: updated,
      message: 'Incident acknowledged successfully.',
    });
  } catch (error) {
    console.error('Error acknowledging incident:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to acknowledge incident' });
  }
});

// ==============================================================================
// PATCH /api/incidents/:id/resolve
// Manually marks an incident as RESOLVED
// ==============================================================================
router.patch('/:id/resolve', async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.incident.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Incident not found' });
    }

    const updated = await prisma.incident.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
      },
      include: {
        endpoint: {
          select: { id: true, name: true, url: true, method: true },
        },
      },
    });

    return res.status(200).json({
      success: true,
      data: updated,
      message: 'Incident marked as resolved.',
    });
  } catch (error) {
    console.error('Error resolving incident:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to resolve incident' });
  }
});

// ==============================================================================
// DELETE /api/incidents/:id
// Deletes an incident record
// ==============================================================================
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.incident.delete({
      where: { id },
    });

    return res.status(200).json({
      success: true,
      message: 'Incident deleted successfully',
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'Incident not found',
      });
    }

    console.error('Error deleting incident:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete incident',
    });
  }
});

module.exports = router;
