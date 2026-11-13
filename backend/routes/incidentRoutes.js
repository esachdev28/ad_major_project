/**
 * incidentRoutes.js — Incident Tracking & Investigation Management
 * 
 * 1. Why this file exists:
 *    Provides incident lifecycle management for API Sentinel. When API failures,
 *    timeouts, or schema breakages occur, incidents record the operational disruption,
 *    its severity, resolution state, and investigation audit trail.
 * 
 * 2. What its responsibilities are:
 *    - GET /api/incidents : List all incidents, optionally filtered by status or endpointId.
 *    - POST /api/incidents : Manually report an incident.
 *    - PATCH /api/incidents/:id : Update incident status (e.g. OPEN -> INVESTIGATING -> RESOLVED).
 *      Automatically timestamps `resolvedAt` when marked as RESOLVED.
 *    - DELETE /api/incidents/:id : Delete an incident record.
 * 
 * 3. Which functions/handlers it contains:
 *    - router.get('/', ...) : List with optional query filters.
 *    - router.post('/', ...) : Create incident record.
 *    - router.patch('/:id', ...) : Transition status and audit timestamps.
 *    - router.delete('/:id', ...) : Remove incident.
 * 
 * 4. How it communicates with other files:
 *    - Uses shared `prisma` singleton from `../lib/prisma`.
 *    - Mounted in `server.js` under `/api/incidents`.
 *    - Queried by frontend audit trail and MCP diagnostic tool `inspect_incidents`.
 * 
 * 5. Why this chosen approach is appropriate:
 *    - Enforces standard operational states (OPEN, INVESTIGATING, RESOLVED).
 *    - Includes parent endpoint data for rapid developer triaging without multiple requests.
 * 
 * 6. Database Request Flow:
 *    Client -> PATCH /api/incidents/:id -> Update status in PostgreSQL -> Return updated incident.
 */

const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');

// GET /api/incidents
// Lists incidents with optional filters: ?status=OPEN or ?endpointId=xyz
router.get('/', async (req, res) => {
  const { status, endpointId } = req.query;

  const whereClause = {};
  if (status) {
    whereClause.status = status.toUpperCase();
  }
  if (endpointId) {
    whereClause.endpointId = endpointId;
  }

  try {
    const incidents = await prisma.incident.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      include: {
        endpoint: {
          select: {
            id: true,
            name: true,
            url: true,
            method: true
          }
        }
      }
    });

    return res.status(200).json({
      success: true,
      data: incidents,
      message: 'Incidents retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching incidents:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve incidents from database'
    });
  }
});

// POST /api/incidents
// Creates a new incident manually
router.post('/', async (req, res) => {
  const { endpointId, title, description, status = 'OPEN' } = req.body;

  if (!endpointId || !title) {
    return res.status(400).json({
      success: false,
      message: 'Validation error: endpointId and title are required'
    });
  }

  try {
    // Verify endpoint exists
    const endpoint = await prisma.aPIEndpoint.findUnique({
      where: { id: endpointId }
    });

    if (!endpoint) {
      return res.status(404).json({
        success: false,
        message: `Endpoint with ID ${endpointId} does not exist`
      });
    }

    const incident = await prisma.incident.create({
      data: {
        endpointId,
        title,
        description: description || null,
        status: status.toUpperCase()
      }
    });

    return res.status(201).json({
      success: true,
      data: incident,
      message: 'Incident reported successfully'
    });
  } catch (error) {
    console.error('Error creating incident:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to create incident record'
    });
  }
});

// PATCH /api/incidents/:id
// Updates status of an incident (OPEN, INVESTIGATING, RESOLVED)
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { status, title, description } = req.body;

  const validStatuses = ['OPEN', 'INVESTIGATING', 'RESOLVED'];
  if (status && !validStatuses.includes(status.toUpperCase())) {
    return res.status(400).json({
      success: false,
      message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
    });
  }

  const updateData = {};
  if (title) updateData.title = title;
  if (description !== undefined) updateData.description = description;

  if (status) {
    const formattedStatus = status.toUpperCase();
    updateData.status = formattedStatus;
    if (formattedStatus === 'RESOLVED') {
      updateData.resolvedAt = new Date();
    } else {
      updateData.resolvedAt = null;
    }
  }

  try {
    const updatedIncident = await prisma.incident.update({
      where: { id },
      data: updateData,
      include: {
        endpoint: {
          select: { id: true, name: true, url: true }
        }
      }
    });

    return res.status(200).json({
      success: true,
      data: updatedIncident,
      message: 'Incident status updated successfully'
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'Incident not found'
      });
    }

    console.error('Error updating incident:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to update incident'
    });
  }
});

// DELETE /api/incidents/:id
// Deletes an incident record
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.incident.delete({
      where: { id }
    });

    return res.status(200).json({
      success: true,
      message: 'Incident deleted successfully'
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'Incident not found'
      });
    }

    console.error('Error deleting incident:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete incident'
    });
  }
});

module.exports = router;

