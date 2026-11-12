/**
 * contractRoutes.js
 *
 * REST API routes for OpenAPI / Swagger API Contract versioning and validation.
 */

const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { parseAndValidateOpenApi } = require('../services/contractParserService');
const { compareOpenApiSpecs } = require('../services/contractDiffService');

// ==============================================================================
// GET /api/contracts
// Lists all registered endpoints alongside their uploaded API contract versions
// ==============================================================================
router.get('/', async (req, res) => {
  try {
    const endpoints = await prisma.aPIEndpoint.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        url: true,
        method: true,
        versions: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            version: true,
            title: true,
            format: true,
            specHash: true,
            createdAt: true,
          },
        },
      },
    });

    return res.status(200).json({
      success: true,
      data: endpoints,
    });
  } catch (error) {
    console.error('Error listing contracts:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve API contracts',
    });
  }
});

// ==============================================================================
// GET /api/contracts/endpoint/:endpointId
// Lists all contract versions for a specific endpoint
// ==============================================================================
router.get('/endpoint/:endpointId', async (req, res) => {
  try {
    const { endpointId } = req.params;

    const versions = await prisma.aPIVersion.findMany({
      where: { endpointId },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({
      success: true,
      data: versions,
    });
  } catch (error) {
    console.error('Error fetching endpoint versions:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve contract versions',
    });
  }
});

// ==============================================================================
// GET /api/contracts/:versionId
// Retrieves full specification and extracted OpenAPI operations for a version
// ==============================================================================
router.get('/:versionId', async (req, res) => {
  try {
    const { versionId } = req.params;

    const contract = await prisma.aPIVersion.findUnique({
      where: { id: versionId },
      include: {
        endpoint: {
          select: { id: true, name: true, url: true },
        },
      },
    });

    if (!contract) {
      return res.status(404).json({
        success: false,
        message: 'Contract version not found',
      });
    }

    const parsed = parseAndValidateOpenApi(contract.specification);

    return res.status(200).json({
      success: true,
      data: {
        ...contract,
        operations: parsed.isValid ? parsed.operations : [],
      },
    });
  } catch (error) {
    console.error('Error reading contract version:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to load contract details',
    });
  }
});

// ==============================================================================
// POST /api/contracts/upload
// Validates and stores an OpenAPI 3.0/3.1 JSON or YAML specification version
// ==============================================================================
router.post('/upload', async (req, res) => {
  try {
    const { endpointId, version, specification } = req.body;

    if (!endpointId) {
      return res.status(400).json({
        success: false,
        message: 'Target endpointId is required.',
      });
    }

    const endpoint = await prisma.aPIEndpoint.findUnique({ where: { id: endpointId } });
    if (!endpoint) {
      return res.status(404).json({
        success: false,
        message: 'Target endpoint not found.',
      });
    }

    // Parse & Validate OpenAPI Specification
    const validation = parseAndValidateOpenApi(specification);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: `Invalid OpenAPI specification: ${validation.errors.join(' ')}`,
        errors: validation.errors,
      });
    }

    const effectiveVersion = version && version.trim() ? version.trim() : validation.version;

    // Duplicate specification hash detection
    const duplicateSpec = await prisma.aPIVersion.findFirst({
      where: {
        endpointId,
        specHash: validation.specHash,
      },
    });

    if (duplicateSpec) {
      return res.status(409).json({
        success: false,
        message: `An identical specification (SHA-256: ${validation.specHash.slice(0, 12)}...) already exists as version "${duplicateSpec.version}".`,
      });
    }

    const rawText = typeof specification === 'string'
      ? specification
      : JSON.stringify(specification, null, 2);

    const created = await prisma.aPIVersion.create({
      data: {
        endpointId,
        version: effectiveVersion,
        title: validation.title,
        format: validation.format,
        specHash: validation.specHash,
        specification: rawText,
      },
    });

    return res.status(201).json({
      success: true,
      data: {
        ...created,
        operations: validation.operations,
      },
      message: `OpenAPI ${validation.format} contract v${effectiveVersion} uploaded and validated (${validation.operations.length} operations extracted).`,
    });
  } catch (error) {
    console.error('Contract upload error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to upload OpenAPI contract',
    });
  }
});

// ==============================================================================
// POST /api/contracts/compare
// Compares two stored APIVersion contracts (or inline specs) for breaking changes
// ==============================================================================
router.post('/compare', async (req, res) => {
  try {
    const { baselineVersionId, targetVersionId, baselineSpec, targetSpec } = req.body;

    let rawV1 = baselineSpec;
    let rawV2 = targetSpec;
    let endpointName = 'Custom Comparison';

    if (baselineVersionId && targetVersionId) {
      const [v1, v2] = await Promise.all([
        prisma.aPIVersion.findUnique({
          where: { id: baselineVersionId },
          include: { endpoint: { select: { name: true } } },
        }),
        prisma.aPIVersion.findUnique({ where: { id: targetVersionId } }),
      ]);

      if (!v1 || !v2) {
        return res.status(404).json({
          success: false,
          message: 'One or both selected contract versions could not be found.',
        });
      }

      rawV1 = v1.specification;
      rawV2 = v2.specification;
      endpointName = v1.endpoint?.name || endpointName;
    }

    if (!rawV1 || !rawV2) {
      return res.status(400).json({
        success: false,
        message: 'Both baseline and target contract versions or specifications are required.',
      });
    }

    const diffReport = compareOpenApiSpecs(rawV1, rawV2);

    return res.status(200).json({
      success: true,
      data: {
        endpointName,
        ...diffReport,
      },
    });
  } catch (error) {
    console.error('Contract comparison error:', error.message);
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to compare API contracts',
    });
  }
});

// ==============================================================================
// DELETE /api/contracts/:versionId
// Deletes a stored contract version
// ==============================================================================
router.delete('/:versionId', async (req, res) => {
  try {
    const { versionId } = req.params;

    const existing = await prisma.aPIVersion.findUnique({ where: { id: versionId } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Contract version not found' });
    }

    await prisma.aPIVersion.delete({ where: { id: versionId } });

    return res.status(200).json({
      success: true,
      message: `Deleted contract version ${existing.version}`,
    });
  } catch (error) {
    console.error('Error deleting contract version:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to delete contract version' });
  }
});

module.exports = router;
