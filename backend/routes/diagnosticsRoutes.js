/**
 * routes/diagnosticsRoutes.js
 *
 * REST API endpoints for AI-Assisted Incident Diagnostics and Investigation History.
 */

const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { runDiagnosticInvestigation } = require('../services/aiDiagnosticsService');

// GET /api/diagnostics/status
// Checks AI provider configuration without leaking credentials
router.get('/status', (req, res) => {
  const apiKey = process.env.NVIDIA_API_KEY;
  const aiConfigured = Boolean(apiKey && apiKey !== 'your-nvidia-api-key-here');

  return res.status(200).json({
    success: true,
    data: {
      aiConfigured,
      provider: aiConfigured ? 'nvidia-nim' : 'deterministic-fallback',
      model: aiConfigured ? (process.env.NVIDIA_MODEL || 'nvidia/nemotron-3.5-lightning-30b-a3b') : 'rule-engine-v1',
      baseUrl: process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1',
    },
  });
});

// GET /api/diagnostics/history
// Retrieves recent saved diagnostic investigation reports
router.get('/history', async (req, res) => {
  try {
    const reports = await prisma.diagnosticReport.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        endpoint: { select: { id: true, name: true, url: true } },
      },
    });

    const formatted = reports.map((r) => ({
      id: r.id,
      query: r.query,
      provider: r.provider,
      model: r.model,
      summary: r.summary,
      verifiedFacts: JSON.parse(r.verifiedFacts || '[]'),
      hypotheses: JSON.parse(r.hypotheses || '[]'),
      recommendations: JSON.parse(r.recommendations || '[]'),
      evidenceContext: JSON.parse(r.evidenceContext || '{}'),
      endpoint: r.endpoint,
      createdAt: r.createdAt,
    }));

    return res.status(200).json({
      success: true,
      data: formatted,
    });
  } catch (error) {
    console.error('Error fetching diagnostics history:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve diagnostic investigation history',
    });
  }
});

// POST /api/diagnostics/investigate
// Runs an evidence-backed AI diagnostic investigation and persists the report
router.post('/investigate', async (req, res) => {
  try {
    const { query, endpointId, incidentId } = req.body;

    if (!query || typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Investigation query is required.',
      });
    }

    const report = await runDiagnosticInvestigation({
      query,
      endpointId: endpointId || undefined,
      incidentId: incidentId || undefined,
    });

    return res.status(201).json({
      success: true,
      data: report,
    });
  } catch (error) {
    console.error('Diagnostics investigation error:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to complete diagnostic investigation',
    });
  }
});

module.exports = router;
