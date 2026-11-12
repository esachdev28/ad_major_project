/**
 * services/contractParserService.js
 *
 * Safe OpenAPI 3.0 / 3.1 (and Swagger 2.0) parser, validator, and normalizer.
 * Supports both JSON and YAML inputs, enforces safe YAML schema deserialization,
 * calculates deterministic SHA-256 specification hashes, and resolves local $refs.
 */

const yaml = require('js-yaml');
const crypto = require('crypto');

const MAX_SPEC_BYTES = 2 * 1024 * 1024; // 2 MB limit
const HTTP_METHODS = new Set(['get', 'post', 'put', 'delete', 'patch', 'head', 'options']);

/**
 * Recursively sorts object keys for deterministic canonical hashing.
 */
function canonicalize(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(canonicalize);

  const sorted = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = canonicalize(obj[key]);
  }
  return sorted;
}

/**
 * Resolves local JSON pointers like "#/components/schemas/Order" safely (cycle protected).
 */
function resolveLocalRefs(node, rootSpec, visited = new Set()) {
  if (node === null || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map((item) => resolveLocalRefs(item, rootSpec, visited));

  if (typeof node.$ref === 'string' && node.$ref.startsWith('#/')) {
    const refPath = node.$ref;
    if (visited.has(refPath)) {
      return { $circularRef: refPath };
    }
    const parts = refPath.slice(2).split('/').map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'));
    let target = rootSpec;
    for (const part of parts) {
      if (target && typeof target === 'object' && part in target) {
        target = target[part];
      } else {
        target = null;
        break;
      }
    }
    if (target) {
      const nextVisited = new Set(visited);
      nextVisited.add(refPath);
      return resolveLocalRefs(target, rootSpec, nextVisited);
    }
  }

  const resolved = {};
  for (const [key, value] of Object.entries(node)) {
    resolved[key] = resolveLocalRefs(value, rootSpec, visited);
  }
  return resolved;
}

/**
 * Parses and validates raw OpenAPI JSON or YAML content.
 *
 * @param {string|object} rawInput - Raw OpenAPI text or parsed object
 * @returns {{ isValid: boolean, format?: string, parsedSpec?: object, resolvedSpec?: object, specHash?: string, title?: string, version?: string, operations?: array, errors?: array }}
 */
function parseAndValidateOpenApi(rawInput) {
  const errors = [];

  if (!rawInput) {
    return { isValid: false, errors: ['Specification content cannot be empty.'] };
  }

  let rawText = typeof rawInput === 'string' ? rawInput.trim() : JSON.stringify(rawInput);

  if (Buffer.byteLength(rawText, 'utf8') > MAX_SPEC_BYTES) {
    return { isValid: false, errors: ['Specification file exceeds maximum allowed size (2 MB).'] };
  }

  let parsedSpec = null;
  let format = 'JSON';

  // 1. Parse JSON or Safe YAML
  if (typeof rawInput === 'object' && !Array.isArray(rawInput)) {
    parsedSpec = rawInput;
    format = 'JSON';
  } else {
    try {
      parsedSpec = JSON.parse(rawText);
      format = 'JSON';
    } catch (jsonErr) {
      try {
        // Use JSON_SCHEMA in js-yaml to prevent unsafe JS type/function execution
        parsedSpec = yaml.load(rawText, { schema: yaml.JSON_SCHEMA });
        format = 'YAML';
      } catch (yamlErr) {
        return {
          isValid: false,
          errors: [`Invalid JSON or YAML syntax: ${yamlErr.message}`],
        };
      }
    }
  }

  if (!parsedSpec || typeof parsedSpec !== 'object' || Array.isArray(parsedSpec)) {
    return { isValid: false, errors: ['OpenAPI specification must parse into a valid object.'] };
  }

  // 2. Validate OpenAPI Version Header
  const openApiVer = parsedSpec.openapi;
  const swaggerVer = parsedSpec.swagger;

  if (!openApiVer && !swaggerVer) {
    errors.push('Missing required "openapi" (e.g. "3.0.3") or "swagger" version declaration.');
  } else if (openApiVer && !/^3\.(0|1)(\.\d+)?$/.test(String(openApiVer))) {
    errors.push(`Unsupported OpenAPI version "${openApiVer}". Supported: OpenAPI 3.0.x and 3.1.x.`);
  }

  // 3. Validate Info block
  if (!parsedSpec.info || typeof parsedSpec.info !== 'object') {
    errors.push('Missing required "info" metadata object.');
  } else {
    if (!parsedSpec.info.title) errors.push('Missing required "info.title" field.');
    if (!parsedSpec.info.version) errors.push('Missing required "info.version" field.');
  }

  // 4. Validate Paths block
  if (!parsedSpec.paths || typeof parsedSpec.paths !== 'object' || Array.isArray(parsedSpec.paths)) {
    errors.push('Missing or invalid "paths" object defining API routes.');
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  // 5. Compute SHA-256 hash of canonical JSON
  const canonicalJson = JSON.stringify(canonicalize(parsedSpec));
  const specHash = crypto.createHash('sha256').update(canonicalJson).digest('hex');

  // 6. Resolve local $ref schemas and extract operation summaries
  const resolvedSpec = resolveLocalRefs(parsedSpec, parsedSpec);
  const operations = [];

  for (const [pathKey, pathItem] of Object.entries(resolvedSpec.paths || {})) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    for (const [methodKey, op] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(methodKey.toLowerCase()) || !op) continue;
      operations.push({
        path: pathKey,
        method: methodKey.toUpperCase(),
        summary: op.summary || op.description || '',
        parametersCount: Array.isArray(op.parameters) ? op.parameters.length : 0,
        hasRequestBody: Boolean(op.requestBody),
        responseCodes: op.responses ? Object.keys(op.responses) : [],
      });
    }
  }

  return {
    isValid: true,
    format,
    parsedSpec,
    resolvedSpec,
    specHash,
    title: parsedSpec.info.title,
    version: String(parsedSpec.info.version),
    operations,
  };
}

module.exports = {
  parseAndValidateOpenApi,
  resolveLocalRefs,
};
