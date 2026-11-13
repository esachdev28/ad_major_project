/**
 * versionRoutes.js — API Specification Management & Breaking-Change Diff Engine
 * 
 * 1. Why this file exists:
 *    Provides version-controlled storage for API contracts (OpenAPI/Swagger) and
 *    implements the Breaking-Change Analysis Engine required by API Sentinel.
 *    It analyzes contract evolution to detect removed endpoints, removed fields,
 *    newly required parameters, and incompatible data types before breaking changes hit production.
 * 
 * 2. What its responsibilities are:
 *    - POST /api/versions : Store an OpenAPI/Swagger contract for an API endpoint.
 *    - GET /api/versions/endpoint/:endpointId : List all stored contract versions for an endpoint.
 *    - GET /api/versions/:id : Retrieve full specification content of a version.
 *    - POST /api/versions/diff : Execute breaking change comparison between two specifications
 *      (either by passing version IDs or raw specification JSON bodies).
 * 
 * 3. Which functions/handlers it contains:
 *    - `compareSpecifications(oldSpec, newSpec)` : Pure JavaScript semantic diff analyzer.
 *    - router.post('/', ...) : Upload and store API specification.
 *    - router.get('/endpoint/:endpointId', ...) : List version history.
 *    - router.post('/diff', ...) : Execute breaking change report.
 * 
 * 4. How it communicates with other files:
 *    - Uses `prisma` from `../lib/prisma` to store and load `APIVersion` records.
 *    - Mounted in `server.js` under `/api/versions`.
 *    - Called by MCP diagnostic tool `compare_api_contracts`.
 * 
 * 5. Why this chosen approach is appropriate:
 *    - Pure JavaScript algorithmic parsing of OpenAPI schema trees.
 *    - Requires no external diffing binaries or unverified third-party libraries.
 *    - Categorizes changes into BREAKING vs NON_BREAKING with clear developer remediation advice.
 * 
 * 6. Database Request Flow:
 *    Client -> POST /api/versions/diff -> Retrieve Old/New versions from PostgreSQL
 *    -> Parse OpenAPI JSON -> Run semantic rule comparison -> Return structured breaking-change report.
 */

const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');

/**
 * Semantic Breaking-Change Diff Analyzer
 * Compares two OpenAPI / Swagger specifications and returns structured breaking and non-breaking changes.
 * 
 * @param {Object} oldSpec - Parsed OpenAPI specification of base version
 * @param {Object} newSpec - Parsed OpenAPI specification of new version
 * @returns {Object} Comprehensive diff report with risk level and categorized changes
 */
function compareSpecifications(oldSpec, newSpec) {
  const changes = [];

  const oldPaths = (oldSpec && oldSpec.paths) || {};
  const newPaths = (newSpec && newSpec.paths) || {};

  const httpMethods = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'];

  // 1. Check for removed endpoints or HTTP methods
  for (const path of Object.keys(oldPaths)) {
    if (!newPaths[path]) {
      changes.push({
        type: 'REMOVED_ENDPOINT',
        path,
        isBreaking: true,
        message: `Endpoint '${path}' was completely removed in the new specification.`
      });
      continue;
    }

    const oldMethods = oldPaths[path];
    const newMethods = newPaths[path];

    for (const method of httpMethods) {
      if (oldMethods[method] && !newMethods[method]) {
        changes.push({
          type: 'REMOVED_OPERATION',
          path,
          method: method.toUpperCase(),
          isBreaking: true,
          message: `HTTP method '${method.toUpperCase()}' was removed from '${path}'.`
        });
      } else if (!oldMethods[method] && newMethods[method]) {
        changes.push({
          type: 'ADDED_OPERATION',
          path,
          method: method.toUpperCase(),
          isBreaking: false,
          message: `New HTTP method '${method.toUpperCase()}' added to '${path}'.`
        });
      } else if (oldMethods[method] && newMethods[method]) {
        // Both versions have this method: compare parameters and request/response schemas
        const oldOp = oldMethods[method];
        const newOp = newMethods[method];

        // 2. Check query/path/header parameters
        const oldParams = oldOp.parameters || [];
        const newParams = newOp.parameters || [];

        const oldParamMap = new Map(oldParams.map(p => [`${p.in}:${p.name}`, p]));
        const newParamMap = new Map(newParams.map(p => [`${p.in}:${p.name}`, p]));

        // Check for removed parameters
        for (const [key, oldP] of oldParamMap.entries()) {
          if (!newParamMap.has(key)) {
            changes.push({
              type: 'REMOVED_PARAMETER',
              path,
              method: method.toUpperCase(),
              parameter: oldP.name,
              paramIn: oldP.in,
              isBreaking: true,
              message: `Parameter '${oldP.name}' (${oldP.in}) was removed from ${method.toUpperCase()} ${path}.`
            });
          }
        }

        // Check for newly required parameters or modified types
        for (const [key, newP] of newParamMap.entries()) {
          const oldP = oldParamMap.get(key);
          if (!oldP) {
            if (newP.required) {
              changes.push({
                type: 'NEW_REQUIRED_PARAMETER',
                path,
                method: method.toUpperCase(),
                parameter: newP.name,
                paramIn: newP.in,
                isBreaking: true,
                message: `Newly required parameter '${newP.name}' (${newP.in}) added to ${method.toUpperCase()} ${path}. Existing consumers will fail.`
              });
            } else {
              changes.push({
                type: 'ADDED_OPTIONAL_PARAMETER',
                path,
                method: method.toUpperCase(),
                parameter: newP.name,
                paramIn: newP.in,
                isBreaking: false,
                message: `Optional parameter '${newP.name}' (${newP.in}) added.`
              });
            }
          } else {
            // Check parameter type changes
            const oldType = oldP.type || (oldP.schema && oldP.schema.type);
            const newType = newP.type || (newP.schema && newP.schema.type);
            if (oldType && newType && oldType !== newType) {
              changes.push({
                type: 'INCOMPATIBLE_TYPE_CHANGE',
                path,
                method: method.toUpperCase(),
                parameter: newP.name,
                oldType,
                newType,
                isBreaking: true,
                message: `Parameter '${newP.name}' type changed from '${oldType}' to '${newType}'.`
              });
            }
          }
        }

        // 3. Check Response / Request Body Schemas (OpenAPI 3.x / Swagger 2.0 properties)
        const oldSchema = extractPrimarySchema(oldOp);
        const newSchema = extractPrimarySchema(newOp);

        if (oldSchema && newSchema) {
          compareSchemaProperties(oldSchema, newSchema, `${method.toUpperCase()} ${path}`, changes);
        }
      }
    }
  }

  // 4. Check for entirely new endpoints (Non-breaking)
  for (const path of Object.keys(newPaths)) {
    if (!oldPaths[path]) {
      changes.push({
        type: 'ADDED_ENDPOINT',
        path,
        isBreaking: false,
        message: `New endpoint '${path}' was added.`
      });
    }
  }

  const breakingCount = changes.filter(c => c.isBreaking).length;
  const nonBreakingCount = changes.filter(c => !c.isBreaking).length;

  let riskLevel = 'NONE';
  if (breakingCount > 3) riskLevel = 'CRITICAL';
  else if (breakingCount > 0) riskLevel = 'HIGH';
  else if (nonBreakingCount > 0) riskLevel = 'LOW';

  return {
    isBreaking: breakingCount > 0,
    riskLevel,
    breakingCount,
    nonBreakingCount,
    totalChanges: changes.length,
    changes
  };
}

// Helper to extract response or request schema object from an operation
function extractPrimarySchema(op) {
  // Check 200/201 response schema (OpenAPI 3 or Swagger 2)
  if (op.responses) {
    const successRes = op.responses['200'] || op.responses['201'] || op.responses.default;
    if (successRes) {
      if (successRes.content && successRes.content['application/json']) {
        return successRes.content['application/json'].schema;
      }
      if (successRes.schema) {
        return successRes.schema;
      }
    }
  }
  return null;
}

// Compares fields, required attributes, and data types between two JSON schemas
function compareSchemaProperties(oldSchema, newSchema, context, changes) {
  const oldProps = oldSchema.properties || {};
  const newProps = newSchema.properties || {};
  const oldRequired = new Set(oldSchema.required || []);
  const newRequired = new Set(newSchema.required || []);

  // Removed properties in response/request
  for (const propName of Object.keys(oldProps)) {
    if (!newProps[propName]) {
      changes.push({
        type: 'REMOVED_FIELD',
        context,
        field: propName,
        isBreaking: true,
        message: `Field '${propName}' was removed from schema at ${context}.`
      });
    }
  }

  // Check newly required fields or type changes
  for (const [propName, newProp] of Object.entries(newProps)) {
    const oldProp = oldProps[propName];

    if (!oldProp) {
      if (newRequired.has(propName) && !oldRequired.has(propName)) {
        changes.push({
          type: 'NEW_REQUIRED_FIELD',
          context,
          field: propName,
          isBreaking: true,
          message: `Field '${propName}' is newly marked as required at ${context}.`
        });
      } else {
        changes.push({
          type: 'ADDED_FIELD',
          context,
          field: propName,
          isBreaking: false,
          message: `Optional field '${propName}' added to schema at ${context}.`
        });
      }
    } else {
      // Type change
      const oldType = oldProp.type;
      const newType = newProp.type;
      if (oldType && newType && oldType !== newType) {
        changes.push({
          type: 'INCOMPATIBLE_FIELD_TYPE',
          context,
          field: propName,
          oldType,
          newType,
          isBreaking: true,
          message: `Field '${propName}' changed type from '${oldType}' to '${newType}' at ${context}.`
        });
      }
    }
  }
}

// POST /api/versions
// Uploads and stores a new API specification version
router.post('/', async (req, res) => {
  const { endpointId, version, specification } = req.body;

  if (!endpointId || !version || !specification) {
    return res.status(400).json({
      success: false,
      message: 'Validation error: endpointId, version, and specification are required'
    });
  }

  // Validate that specification is valid JSON
  let parsedSpec = null;
  try {
    parsedSpec = typeof specification === 'string' ? JSON.parse(specification) : specification;
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: 'Invalid specification: must be valid JSON content'
    });
  }

  try {
    const endpoint = await prisma.aPIEndpoint.findUnique({
      where: { id: endpointId }
    });

    if (!endpoint) {
      return res.status(404).json({
        success: false,
        message: `Endpoint with ID ${endpointId} not found`
      });
    }

    const newVersion = await prisma.aPIVersion.create({
      data: {
        endpointId,
        version,
        specification: typeof specification === 'string' ? specification : JSON.stringify(specification, null, 2)
      }
    });

    return res.status(201).json({
      success: true,
      data: newVersion,
      message: `Specification version '${version}' stored successfully`
    });
  } catch (error) {
    console.error('Error saving API version:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to save specification version'
    });
  }
});

// GET /api/versions/endpoint/:endpointId
// Lists all stored specification versions for an endpoint
router.get('/endpoint/:endpointId', async (req, res) => {
  const { endpointId } = req.params;

  try {
    const versions = await prisma.aPIVersion.findMany({
      where: { endpointId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        endpointId: true,
        version: true,
        createdAt: true
      }
    });

    return res.status(200).json({
      success: true,
      data: versions,
      message: 'Specification versions retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching versions:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve specification versions'
    });
  }
});

// GET /api/versions/:id
// Retrieves full content of an API specification version
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const versionRecord = await prisma.aPIVersion.findUnique({
      where: { id }
    });

    if (!versionRecord) {
      return res.status(404).json({
        success: false,
        message: 'Specification version not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: versionRecord,
      message: 'Specification retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching version:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve version'
    });
  }
});

// POST /api/versions/diff
// Executes Breaking-Change Analysis between two specifications
router.post('/diff', async (req, res) => {
  const { oldVersionId, newVersionId, oldSpec, newSpec } = req.body;

  let parsedOld = null;
  let parsedNew = null;

  try {
    // Case 1: Version IDs provided from database
    if (oldVersionId && newVersionId) {
      const [v1, v2] = await Promise.all([
        prisma.aPIVersion.findUnique({ where: { id: oldVersionId } }),
        prisma.aPIVersion.findUnique({ where: { id: newVersionId } })
      ]);

      if (!v1 || !v2) {
        return res.status(404).json({
          success: false,
          message: 'One or both specification version records were not found in database'
        });
      }

      parsedOld = JSON.parse(v1.specification);
      parsedNew = JSON.parse(v2.specification);
    } 
    // Case 2: Raw specifications passed directly in request body
    else if (oldSpec && newSpec) {
      parsedOld = typeof oldSpec === 'string' ? JSON.parse(oldSpec) : oldSpec;
      parsedNew = typeof newSpec === 'string' ? JSON.parse(newSpec) : newSpec;
    } else {
      return res.status(400).json({
        success: false,
        message: 'Provide either (oldVersionId and newVersionId) or (oldSpec and newSpec)'
      });
    }

    // Run semantic breaking-change analysis
    const diffReport = compareSpecifications(parsedOld, parsedNew);

    return res.status(200).json({
      success: true,
      data: diffReport,
      message: diffReport.isBreaking
        ? `Breaking changes detected! Risk level: ${diffReport.riskLevel}`
        : 'Contract comparison complete. No breaking changes detected.'
    });
  } catch (error) {
    console.error('Error running specification diff:', error.message);
    return res.status(500).json({
      success: false,
      message: `Diff engine error: ${error.message}`
    });
  }
});

module.exports = router;
module.exports.compareSpecifications = compareSpecifications;

