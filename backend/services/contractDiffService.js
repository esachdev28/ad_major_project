/**
 * services/contractDiffService.js
 *
 * Deterministic OpenAPI 3.x Breaking-Change Comparison Engine.
 * Compares a baseline specification (v1) against a target specification (v2)
 * and classifies every structural delta into:
 * - BREAKING
 * - POTENTIALLY_BREAKING
 * - NON_BREAKING
 *
 * Each finding includes structured evidence (previous vs current),
 * severity (CRITICAL, HIGH, MEDIUM, INFO), human explanation, and recommendation.
 */

const { parseAndValidateOpenApi } = require('./contractParserService');

const HTTP_METHODS = new Set(['get', 'post', 'put', 'delete', 'patch', 'head', 'options']);

/**
 * Extracts JSON schema properties and required fields cleanly, including array items.
 */
function extractSchemaObject(schema) {
  if (!schema || typeof schema !== 'object') return null;
  if (schema.type === 'array' && schema.items) {
    return extractSchemaObject(schema.items);
  }
  return schema;
}

/**
 * Recursively compares two JSON schema objects (used for Request Bodies and Responses).
 */
function compareSchemas(oldSchemaRaw, newSchemaRaw, context, changes) {
  const oldSchema = extractSchemaObject(oldSchemaRaw);
  const newSchema = extractSchemaObject(newSchemaRaw);

  if (!oldSchema && !newSchema) return;

  if (oldSchema && !newSchema) {
    changes.push({
      classification: context.direction === 'response' ? 'BREAKING' : 'POTENTIALLY_BREAKING',
      severity: context.direction === 'response' ? 'HIGH' : 'MEDIUM',
      path: context.path,
      method: context.method,
      location: context.location,
      rule: 'SCHEMA_REMOVED',
      title: `Removed ${context.direction} payload schema`,
      explanation: `The ${context.direction} schema at ${context.fieldPath || 'root'} was removed in the new version.`,
      evidence: { previous: oldSchema.type || 'object', current: null },
      recommendation: 'Restore the schema or coordinate migration with active API consumers.',
    });
    return;
  }

  if (!oldSchema && newSchema) {
    changes.push({
      classification: 'NON_BREAKING',
      severity: 'INFO',
      path: context.path,
      method: context.method,
      location: context.location,
      rule: 'SCHEMA_ADDED',
      title: `Added ${context.direction} schema`,
      explanation: `New ${context.direction} payload schema introduced.`,
      evidence: { previous: null, current: newSchema.type || 'object' },
      recommendation: 'No action required for backward compatibility.',
    });
    return;
  }

  // 1. Check fundamental data-type compatibility
  if (oldSchema.type && newSchema.type && oldSchema.type !== newSchema.type) {
    // Allow integer -> number widening in responses/requests as potentially breaking or non-breaking,
    // but number -> string, string -> integer etc. are strictly BREAKING.
    const isSafeWidening = oldSchema.type === 'integer' && newSchema.type === 'number';
    changes.push({
      classification: isSafeWidening ? 'POTENTIALLY_BREAKING' : 'BREAKING',
      severity: isSafeWidening ? 'MEDIUM' : 'HIGH',
      path: context.path,
      method: context.method,
      location: context.location,
      rule: 'TYPE_INCOMPATIBLE',
      title: `Incompatible type change on "${context.fieldPath || 'root'}"`,
      explanation: `Field "${context.fieldPath || 'root'}" changed data type from "${oldSchema.type}" to "${newSchema.type}".`,
      evidence: { previous: oldSchema.type, current: newSchema.type },
      recommendation: `Keep "${context.fieldPath || 'root'}" as "${oldSchema.type}" or version the endpoint (e.g., /v2).`,
    });
    return;
  }

  // 2. Check Enum value removals
  if (Array.isArray(oldSchema.enum) && Array.isArray(newSchema.enum)) {
    const removedEnums = oldSchema.enum.filter((val) => !newSchema.enum.includes(val));
    if (removedEnums.length > 0) {
      changes.push({
        classification: 'BREAKING',
        severity: 'HIGH',
        path: context.path,
        method: context.method,
        location: context.location,
        rule: 'ENUM_VALUE_REMOVED',
        title: `Enum value(s) removed from "${context.fieldPath || 'field'}"`,
        explanation: `Enum values [${removedEnums.join(', ')}] were removed. Consumers sending or expecting these values will fail validation.`,
        evidence: { previous: oldSchema.enum, current: newSchema.enum },
        recommendation: 'Deprecate old enum values before removing them in a major release.',
      });
    }
  }

  // 3. Compare Object Properties
  const oldProps = oldSchema.properties || {};
  const newProps = newSchema.properties || {};
  const oldRequired = new Set(Array.isArray(oldSchema.required) ? oldSchema.required : []);
  const newRequired = new Set(Array.isArray(newSchema.required) ? newSchema.required : []);

  const allKeys = new Set([...Object.keys(oldProps), ...Object.keys(newProps)]);

  for (const prop of allKeys) {
    const propPath = context.fieldPath ? `${context.fieldPath}.${prop}` : prop;
    const inOld = prop in oldProps;
    const inNew = prop in newProps;

    if (inOld && !inNew) {
      // Property removed
      const isResponse = context.direction === 'response';
      changes.push({
        classification: isResponse ? 'BREAKING' : 'POTENTIALLY_BREAKING',
        severity: isResponse ? 'CRITICAL' : 'MEDIUM',
        path: context.path,
        method: context.method,
        location: context.location,
        rule: isResponse ? 'RESPONSE_PROPERTY_REMOVED' : 'REQUEST_PROPERTY_REMOVED',
        title: `Removed ${context.direction} property "${propPath}"`,
        explanation: isResponse
          ? `Response field "${propPath}" was removed. Downstream consumers reading "${propPath}" may crash or behave unexpectedly.`
          : `Request field "${propPath}" was removed from the schema. Strict validators may reject legacy payloads containing "${propPath}".`,
        evidence: { previous: oldProps[prop], current: null },
        recommendation: isResponse
          ? `Restore "${propPath}" to the response schema or migrate all downstream consumers first.`
          : `Support "${propPath}" as an ignored/deprecated field during a transition window.`,
      });
    } else if (!inOld && inNew) {
      // Property added
      const isRequiredNow = newRequired.has(prop);
      if (context.direction === 'request' && isRequiredNow) {
        changes.push({
          classification: 'BREAKING',
          severity: 'HIGH',
          path: context.path,
          method: context.method,
          location: context.location,
          rule: 'REQUIRED_REQUEST_PROPERTY_ADDED',
          title: `New required request property "${propPath}" added`,
          explanation: `A newly required property "${propPath}" was added to the request payload. Existing clients omitting "${propPath}" will receive HTTP 400/422 errors.`,
          evidence: { previous: null, current: { ...newProps[prop], required: true } },
          recommendation: `Make "${propPath}" optional with a server-side default value, or coordinate client updates.`,
        });
      } else {
        changes.push({
          classification: 'NON_BREAKING',
          severity: 'INFO',
          path: context.path,
          method: context.method,
          location: context.location,
          rule: 'OPTIONAL_PROPERTY_ADDED',
          title: `Added optional ${context.direction} property "${propPath}"`,
          explanation: `Added optional field "${propPath}" (${newProps[prop].type || 'any'}). Backward compatible for standard clients.`,
          evidence: { previous: null, current: newProps[prop] },
          recommendation: 'Safe to deploy without breaking existing integrations.',
        });
      }
    } else {
      // Property exists in both -> check if optional became required in request
      if (context.direction === 'request' && !oldRequired.has(prop) && newRequired.has(prop)) {
        changes.push({
          classification: 'BREAKING',
          severity: 'HIGH',
          path: context.path,
          method: context.method,
          location: context.location,
          rule: 'PROPERTY_BECAME_REQUIRED',
          title: `Request property "${propPath}" became required`,
          explanation: `Field "${propPath}" was previously optional but is now mandatory.`,
          evidence: { previous: { required: false }, current: { required: true } },
          recommendation: `Provide a default fallback value for "${propPath}" on the server.`,
        });
      }

      // Recurse into nested property schema
      compareSchemas(oldProps[prop], newProps[prop], { ...context, fieldPath: propPath }, changes);
    }
  }
}

/**
 * Compares two OpenAPI specifications (raw strings or objects) and returns
 * a structured compatibility report.
 */
function compareOpenApiSpecs(rawSpecV1, rawSpecV2) {
  const parsedV1 = parseAndValidateOpenApi(rawSpecV1);
  if (!parsedV1.isValid) {
    throw new Error(`Invalid baseline specification: ${parsedV1.errors.join(', ')}`);
  }

  const parsedV2 = parseAndValidateOpenApi(rawSpecV2);
  if (!parsedV2.isValid) {
    throw new Error(`Invalid target specification: ${parsedV2.errors.join(', ')}`);
  }

  const spec1 = parsedV1.resolvedSpec;
  const spec2 = parsedV2.resolvedSpec;
  const changes = [];

  const paths1 = spec1.paths || {};
  const paths2 = spec2.paths || {};
  const allPaths = new Set([...Object.keys(paths1), ...Object.keys(paths2)]);

  for (const pathKey of allPaths) {
    const p1 = paths1[pathKey];
    const p2 = paths2[pathKey];

    if (p1 && !p2) {
      changes.push({
        classification: 'BREAKING',
        severity: 'CRITICAL',
        path: pathKey,
        method: 'ALL',
        location: 'path',
        rule: 'ENDPOINT_REMOVED',
        title: `Removed API path "${pathKey}"`,
        explanation: `The entire route "${pathKey}" was removed in v${parsedV2.version}. All consumers calling this route will receive HTTP 404.`,
        evidence: { previous: Object.keys(p1), current: null },
        recommendation: 'Keep the deprecated route active or redirect traffic before removing.',
      });
      continue;
    }

    if (!p1 && p2) {
      changes.push({
        classification: 'NON_BREAKING',
        severity: 'INFO',
        path: pathKey,
        method: 'ALL',
        location: 'path',
        rule: 'ENDPOINT_ADDED',
        title: `Added new API path "${pathKey}"`,
        explanation: `Introduced new endpoint path "${pathKey}".`,
        evidence: { previous: null, current: Object.keys(p2) },
        recommendation: 'No action required.',
      });
      continue;
    }

    // Compare HTTP methods under this path
    const allMethods = new Set([
      ...Object.keys(p1).filter((m) => HTTP_METHODS.has(m.toLowerCase())),
      ...Object.keys(p2).filter((m) => HTTP_METHODS.has(m.toLowerCase())),
    ]);

    for (const methodKey of allMethods) {
      const mUpper = methodKey.toUpperCase();
      const op1 = p1[methodKey];
      const op2 = p2[methodKey];

      if (op1 && !op2) {
        changes.push({
          classification: 'BREAKING',
          severity: 'CRITICAL',
          path: pathKey,
          method: mUpper,
          location: 'method',
          rule: 'METHOD_REMOVED',
          title: `Removed HTTP method ${mUpper} ${pathKey}`,
          explanation: `Operation ${mUpper} ${pathKey} was removed. Clients using this method will fail with HTTP 405 Method Not Allowed.`,
          evidence: { previous: mUpper, current: null },
          recommendation: `Maintain ${mUpper} handler until all registered consumers migrate.`,
        });
        continue;
      }

      if (!op1 && op2) {
        changes.push({
          classification: 'NON_BREAKING',
          severity: 'INFO',
          path: pathKey,
          method: mUpper,
          location: 'method',
          rule: 'METHOD_ADDED',
          title: `Added HTTP method ${mUpper} ${pathKey}`,
          explanation: `New operation ${mUpper} ${pathKey} added.`,
          evidence: { previous: null, current: mUpper },
          recommendation: 'Safe additive change.',
        });
        continue;
      }

      // 1. Compare Parameters
      const params1 = new Map((op1.parameters || []).map((p) => [`${p.in}:${p.name}`, p]));
      const params2 = new Map((op2.parameters || []).map((p) => [`${p.in}:${p.name}`, p]));

      for (const [key, param1] of params1.entries()) {
        if (!params2.has(key)) {
          changes.push({
            classification: param1.required ? 'BREAKING' : 'POTENTIALLY_BREAKING',
            severity: param1.required ? 'HIGH' : 'MEDIUM',
            path: pathKey,
            method: mUpper,
            location: 'parameter',
            rule: 'PARAMETER_REMOVED',
            title: `Removed ${param1.in} parameter "${param1.name}"`,
            explanation: `Parameter "${param1.name}" (in ${param1.in}) was removed.`,
            evidence: { previous: param1, current: null },
            recommendation: 'Verify consumers no longer depend on passing this parameter.',
          });
        } else {
          const param2 = params2.get(key);
          if (!param1.required && param2.required) {
            changes.push({
              classification: 'BREAKING',
              severity: 'HIGH',
              path: pathKey,
              method: mUpper,
              location: 'parameter',
              rule: 'PARAMETER_BECAME_REQUIRED',
              title: `Parameter "${param1.name}" became required`,
              explanation: `Parameter "${param1.name}" changed from optional to required.`,
              evidence: { previous: { required: false }, current: { required: true } },
              recommendation: `Provide a server default for "${param1.name}".`,
            });
          }
          const t1 = param1.schema?.type;
          const t2 = param2.schema?.type;
          if (t1 && t2 && t1 !== t2) {
            changes.push({
              classification: 'BREAKING',
              severity: 'HIGH',
              path: pathKey,
              method: mUpper,
              location: 'parameter',
              rule: 'PARAMETER_TYPE_CHANGED',
              title: `Parameter "${param1.name}" type changed (${t1} -> ${t2})`,
              explanation: `Parameter "${param1.name}" expects "${t2}" instead of "${t1}".`,
              evidence: { previous: t1, current: t2 },
              recommendation: `Accept both types or introduce a new parameter name.`,
            });
          }
        }
      }

      for (const [key, param2] of params2.entries()) {
        if (!params1.has(key)) {
          if (param2.required) {
            changes.push({
              classification: 'BREAKING',
              severity: 'HIGH',
              path: pathKey,
              method: mUpper,
              location: 'parameter',
              rule: 'REQUIRED_PARAMETER_ADDED',
              title: `Added required ${param2.in} parameter "${param2.name}"`,
              explanation: `New mandatory parameter "${param2.name}" added. Existing callers omitting it will fail.`,
              evidence: { previous: null, current: param2 },
              recommendation: `Make "${param2.name}" optional or provide a default value.`,
            });
          } else {
            changes.push({
              classification: 'NON_BREAKING',
              severity: 'INFO',
              path: pathKey,
              method: mUpper,
              location: 'parameter',
              rule: 'OPTIONAL_PARAMETER_ADDED',
              title: `Added optional ${param2.in} parameter "${param2.name}"`,
              explanation: `Optional parameter "${param2.name}" added.`,
              evidence: { previous: null, current: param2 },
              recommendation: 'Backward compatible change.',
            });
          }
        }
      }

      // 2. Compare Request Body
      const reqBody1 = op1.requestBody?.content?.['application/json']?.schema;
      const reqBody2 = op2.requestBody?.content?.['application/json']?.schema;

      if (!op1.requestBody?.required && op2.requestBody?.required) {
        changes.push({
          classification: 'BREAKING',
          severity: 'HIGH',
          path: pathKey,
          method: mUpper,
          location: 'requestBody',
          rule: 'REQUEST_BODY_BECAME_REQUIRED',
          title: 'Request body became mandatory',
          explanation: `Operation ${mUpper} ${pathKey} now requires a JSON request body.`,
          evidence: { previous: { required: false }, current: { required: true } },
          recommendation: 'Ensure clients send valid payloads or keep body optional.',
        });
      }

      if (reqBody1 || reqBody2) {
        compareSchemas(
          reqBody1,
          reqBody2,
          { path: pathKey, method: mUpper, location: 'requestBody', direction: 'request', fieldPath: '' },
          changes
        );
      }

      // 3. Compare Primary 2xx Responses
      const resCodes = ['200', '201'];
      for (const code of resCodes) {
        const res1 = op1.responses?.[code];
        const res2 = op2.responses?.[code];

        if (res1 && !res2) {
          changes.push({
            classification: 'BREAKING',
            severity: 'CRITICAL',
            path: pathKey,
            method: mUpper,
            location: 'response',
            rule: 'SUCCESS_RESPONSE_REMOVED',
            title: `Removed HTTP ${code} response definition`,
            explanation: `Expected HTTP ${code} response was removed.`,
            evidence: { previous: code, current: null },
            recommendation: `Verify expected success status code has not broken clients.`,
          });
        } else if (res1 && res2) {
          const schema1 = res1.content?.['application/json']?.schema;
          const schema2 = res2.content?.['application/json']?.schema;
          if (schema1 || schema2) {
            compareSchemas(
              schema1,
              schema2,
              { path: pathKey, method: mUpper, location: 'response', direction: 'response', fieldPath: '' },
              changes
            );
          }
        }
      }

      // 4. Compare Security Requirements
      const hasSec1 = Array.isArray(op1.security) && op1.security.length > 0;
      const hasSec2 = Array.isArray(op2.security) && op2.security.length > 0;
      if (!hasSec1 && hasSec2) {
        changes.push({
          classification: 'BREAKING',
          severity: 'CRITICAL',
          path: pathKey,
          method: mUpper,
          location: 'security',
          rule: 'AUTHENTICATION_ADDED',
          title: `Authentication requirement added to ${mUpper} ${pathKey}`,
          explanation: 'Endpoint previously did not require authentication, but now enforces security credentials.',
          evidence: { previous: 'Public', current: op2.security },
          recommendation: 'Issue API keys/tokens to consumers prior to enforcing authentication.',
        });
      }

      // 5. Compare Documentation-only changes if no functional delta occurred on summary
      if (op1.summary !== op2.summary || op1.description !== op2.description) {
        changes.push({
          classification: 'NON_BREAKING',
          severity: 'INFO',
          path: pathKey,
          method: mUpper,
          location: 'documentation',
          rule: 'DOCUMENTATION_UPDATED',
          title: `Updated documentation for ${mUpper} ${pathKey}`,
          explanation: 'Endpoint summary or description text was updated.',
          evidence: { previous: op1.summary || op1.description, current: op2.summary || op2.description },
          recommendation: 'No functional impact.',
        });
      }
    }
  }

  // Assign deterministic IDs
  const indexedChanges = changes.map((c, idx) => ({ id: `diff-${idx + 1}`, ...c }));

  const breakingCount = indexedChanges.filter((c) => c.classification === 'BREAKING').length;
  const potentiallyBreakingCount = indexedChanges.filter((c) => c.classification === 'POTENTIALLY_BREAKING').length;
  const nonBreakingCount = indexedChanges.filter((c) => c.classification === 'NON_BREAKING').length;

  return {
    baselineVersion: parsedV1.version,
    targetVersion: parsedV2.version,
    totalChanges: indexedChanges.length,
    breakingCount,
    potentiallyBreakingCount,
    nonBreakingCount,
    isCompatible: breakingCount === 0,
    changes: indexedChanges,
  };
}

module.exports = {
  compareOpenApiSpecs,
};
