/**
 * incidentRoutes.js
 *
 * REST API endpoints for viewing, filtering, acknowledging, and resolving incidents.
 */

const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');

// ==============================================================================
// GET /api/incidents
// Lists incidents with optional status and severity filters
// ==============================================================================
router.get('/', async (req, res) => {
  try {
    const { status, severity } = req.query;

    const where = {};
    if (status && status !== 'ALL') {
      where.status = status.toUpperCase();
    }
    if (severity && severity !== 'ALL') {
      where.severity = severity.toUpperCase();
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

module.exports = router;
