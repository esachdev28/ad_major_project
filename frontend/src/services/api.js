/**
 * api.js
 *
 * 1. Why this file exists:
 *    Centralizes all HTTP communication between the React frontend and Express backend.
 *    By placing network requests here, we prevent hardcoding API URLs across multiple
 *    components and maintain a single source of truth for backend endpoints.
 *
 * 2. What its responsibilities are:
 *    - Define the backend Base URL (configurable via Vite env variables or fallback).
 *    - Manage JWT authentication tokens and active organization context.
 *    - Execute HTTP requests with standardized JSON serialization and authentication headers.
 *    - Provide typed, documented client methods for endpoints, incidents, contracts,
 *      dependencies, MCP tools, and AI diagnostics.
 *    - Handle network errors gracefully (e.g. backend down / connection refused).
 *    - Parse JSON responses and return structured data to calling components.
 *
 * 3. Which functions it contains:
 *    - Auth & Orgs: `getAuthToken`, `setAuthToken`, `getActiveOrgId`, `setActiveOrgId`,
 *      `registerUser`, `loginUser`, `getCurrentUser`, `switchOrganization`, `getOrganizations`,
 *      `createOrganization`, `logoutUser`.
 *    - Health: `checkHealth`, `checkDbHealth`.
 *    - Dashboard: `getDashboardStats`, `getDashboardAnalytics`.
 *    - Endpoints: `getEndpoints`, `getEndpoint`, `getEndpointHistory`, `createEndpoint`,
 *      `updateEndpoint`, `deleteEndpoint`, `probeEndpoint`, `checkEndpointNow`.
 *    - Incidents: `getIncidents`, `getIncidentById`, `updateIncidentStatus`,
 *      `acknowledgeIncident`, `resolveIncident`.
 *    - Contracts & Versions: `getContracts`, `getContractVersion`, `uploadContract`,
 *      `deleteContractVersion`, `compareContracts`, `diffSpecifications`.
 *    - Dependencies & Impact: `getDependencyGraph`, `createService`, `deleteService`,
 *      `createIntegration`, `deleteIntegration`, `analyzeDependencyImpact`, `getImpactAssessment`.
 *    - MCP & Diagnostics: `getMcpTools`, `callMcpTool`, `getDiagnosticsStatus`,
 *      `getDiagnosticsHistory`, `runDiagnosticInvestigation`.
 *
 * 4. How it communicates with other files:
 *    - Consumed by `Dashboard.jsx`, `Endpoints.jsx`, `Incidents.jsx`, `Contracts.jsx`,
 *      `Dependencies.jsx`, `Diagnostics.jsx`, and `AuthModal.jsx`.
 *    - Dispatches HTTP requests to Express endpoints mounted at `/api/*`.
 *
 * 5. Why this chosen approach is appropriate:
 *    - Native `fetch` is built into modern browsers; no extra library (like Axios) needed.
 *    - Clean async/await syntax is easy to maintain and explain.
 *    - Preserves compatibility across single-page dashboard and multi-route views.
 */

// Base URL for the API Sentinel backend.
// In our unified, zero-CORS architecture, API calls use relative paths ('') by default
// because the React app and Express API are served from the exact same origin!
// Can still be overridden with VITE_API_URL if connecting to a separate host.
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export function getAuthToken() {
  return typeof localStorage !== 'undefined' ? localStorage.getItem('api_sentinel_token') : null;
}

export function setAuthToken(token) {
  if (typeof localStorage !== 'undefined') {
    if (token) localStorage.setItem('api_sentinel_token', token);
    else localStorage.removeItem('api_sentinel_token');
  }
}

export function getActiveOrgId() {
  return typeof localStorage !== 'undefined' ? localStorage.getItem('api_sentinel_org_id') : null;
}

export function setActiveOrgId(orgId) {
  if (typeof localStorage !== 'undefined') {
    if (orgId) localStorage.setItem('api_sentinel_org_id', orgId);
    else localStorage.removeItem('api_sentinel_org_id');
  }
}

/**
 * Helper to execute a fetch request with timeout and friendly error formatting.
 * Handles the scenario where the Express server is not running at all.
 *
 * @param {string} endpoint - The path to fetch (e.g. '/api/health')
 * @param {RequestInit} [options={}] - Standard fetch options (method, headers, body)
 * @returns {Promise<any>} - Parsed JSON response
 */
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;

  const token = getAuthToken();
  const orgId = getActiveOrgId();
  const authHeaders = {};
  if (token) authHeaders['Authorization'] = `Bearer ${token}`;
  if (orgId) authHeaders['x-organization-id'] = orgId;

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
        ...(options.headers || {})
      },
      body: options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : undefined
    });

    if (!response.ok) {
      // Try to parse the backend's JSON error response to extract custom error message
      let errorMessage = `Server responded with status ${response.status}: ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData && errorData.message) {
          errorMessage = errorData.message;
        }
      } catch (_) {
        // Fallback to HTTP status message if response is not JSON
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    // If fetch failed due to network / connection refused (e.g. backend offline)
    if (error.name === 'TypeError') {
      const host = API_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5001');
      throw new Error(`Cannot connect to backend at ${host}. Ensure Express is running.`);
    }
    // Re-throw with original or enhanced message
    throw error;
  }
}

// ==========================================
// Health & Diagnostic APIs
// ==========================================

/**
 * Checks the health status of the Express backend.
 * Calls: GET /api/health
 *
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function checkHealth() {
  return await apiRequest('/api/health');
}

/**
 * Checks the database connectivity status of PostgreSQL via Prisma.
 * Calls: GET /api/health/db
 *
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function checkDbHealth() {
  return await apiRequest('/api/health/db');
}

// ==========================================
// Dashboard Metrics & Analytics APIs
// ==========================================

/**
 * Fetches dashboard operational metrics from Express.
 * Calls: GET /api/dashboard/stats
 *
 * @returns {Promise<{success: boolean, dataSource: string, data: {totalApis: number, healthyApis: number, failedApis: number, averageLatency: string}}>}
 */
export async function getDashboardStats() {
  return await apiRequest('/api/dashboard/stats');
}

/**
 * Fetches aggregated dashboard analytics over a time window.
 * Calls: GET /api/dashboard/analytics?hours=X
 */
export async function getDashboardAnalytics(hours = 24) {
  return await apiRequest(`/api/dashboard/analytics?hours=${hours}`);
}

// ==========================================
// Endpoints API
// ==========================================

/**
 * Endpoints API: Lists registered endpoints with optional filtering.
 * Supports string filter or query parameter object.
 * Calls: GET /api/endpoints
 */
export async function getEndpoints(params = {}) {
  let query = '';
  if (typeof params === 'string') {
    query = params ? `?status=${encodeURIComponent(params)}` : '';
  } else if (params && typeof params === 'object') {
    const search = new URLSearchParams(params).toString();
    query = search ? `?${search}` : '';
  }
  return await apiRequest(`/api/endpoints${query}`);
}

/**
 * Endpoints API: Fetches single endpoint details by ID.
 * Calls: GET /api/endpoints/:id
 */
export async function getEndpoint(id) {
  return await apiRequest(`/api/endpoints/${encodeURIComponent(id)}`);
}

/**
 * Endpoints API: Fetches historical health checks for an endpoint.
 * Calls: GET /api/endpoints/:id/history?hours=X
 */
export async function getEndpointHistory(id, hours = 24) {
  return await apiRequest(`/api/endpoints/${encodeURIComponent(id)}/history?hours=${hours}`);
}

/**
 * Endpoints API: Registers a new endpoint for monitoring.
 * Calls: POST /api/endpoints
 */
export async function createEndpoint(endpointData) {
  return await apiRequest('/api/endpoints', {
    method: 'POST',
    body: endpointData
  });
}

/**
 * Endpoints API: Updates an existing endpoint configuration.
 * Calls: PUT /api/endpoints/:id
 */
export async function updateEndpoint(id, endpointData) {
  return await apiRequest(`/api/endpoints/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: endpointData
  });
}

/**
 * Endpoints API: Deletes an endpoint.
 * Calls: DELETE /api/endpoints/:id
 */
export async function deleteEndpoint(id) {
  return await apiRequest(`/api/endpoints/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}

/**
 * Endpoints API: Triggers active failure detection probe on an endpoint.
 * Calls: POST /api/endpoints/:id/probe
 */
export async function probeEndpoint(id) {
  return await apiRequest(`/api/endpoints/${encodeURIComponent(id)}/probe`, {
    method: 'POST'
  });
}

/**
 * Endpoints API: Immediate probe check (alias for test-suite compatibility).
 * Calls: POST /api/endpoints/:id/check
 */
export async function checkEndpointNow(id) {
  return await apiRequest(`/api/endpoints/${encodeURIComponent(id)}/check`, {
    method: 'POST'
  });
}

// ==========================================
// Incident Management APIs
// ==========================================

/**
 * Incidents API: Lists operational incidents with optional filtering.
 * Supports string filter (status) or query parameter object.
 * Calls: GET /api/incidents
 */
export async function getIncidents(params = {}) {
  let query = '';
  if (typeof params === 'string') {
    query = params ? `?status=${encodeURIComponent(params)}` : '';
  } else if (params && typeof params === 'object') {
    const search = new URLSearchParams(params).toString();
    query = search ? `?${search}` : '';
  }
  return await apiRequest(`/api/incidents${query}`);
}

/**
 * Incidents API: Fetches single incident by ID.
 * Calls: GET /api/incidents/:id
 */
export async function getIncidentById(id) {
  return await apiRequest(`/api/incidents/${encodeURIComponent(id)}`);
}

/**
 * Incidents API: Updates incident status (e.g. RESOLVED, INVESTIGATING).
 * Calls: PATCH /api/incidents/:id
 */
export async function updateIncidentStatus(id, status) {
  return await apiRequest(`/api/incidents/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { status }
  });
}

/**
 * Incidents API: Acknowledges an active incident.
 * Calls: PATCH /api/incidents/:id/acknowledge
 */
export async function acknowledgeIncident(id) {
  return await apiRequest(`/api/incidents/${encodeURIComponent(id)}/acknowledge`, {
    method: 'PATCH'
  });
}

/**
 * Incidents API: Resolves an active incident.
 * Calls: PATCH /api/incidents/:id/resolve
 */
export async function resolveIncident(id) {
  return await apiRequest(`/api/incidents/${encodeURIComponent(id)}/resolve`, {
    method: 'PATCH'
  });
}

// ==========================================
// API Contract Management & Versioning
// ==========================================

export async function getContracts() {
  return await apiRequest('/api/contracts');
}

export async function getContractVersion(versionId) {
  return await apiRequest(`/api/contracts/${encodeURIComponent(versionId)}`);
}

export async function uploadContract(data) {
  return await apiRequest('/api/contracts/upload', {
    method: 'POST',
    body: data
  });
}

export async function deleteContractVersion(versionId) {
  return await apiRequest(`/api/contracts/${encodeURIComponent(versionId)}`, {
    method: 'DELETE'
  });
}

export async function compareContracts(baselineVersionId, targetVersionId) {
  return await apiRequest('/api/contracts/compare', {
    method: 'POST',
    body: { baselineVersionId, targetVersionId }
  });
}

/**
 * Breaking-Change Engine: Compares two OpenAPI specs for breaking changes.
 * Calls: POST /api/versions/diff
 */
export async function diffSpecifications(diffPayload) {
  return await apiRequest('/api/versions/diff', {
    method: 'POST',
    body: diffPayload
  });
}

// ==========================================
// Dependency Graph & Impact Analysis APIs
// ==========================================

export async function getDependencyGraph() {
  return await apiRequest('/api/dependencies/graph');
}

export async function createService(data) {
  return await apiRequest('/api/dependencies/services', {
    method: 'POST',
    body: data
  });
}

export async function deleteService(id) {
  return await apiRequest(`/api/dependencies/services/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}

export async function createIntegration(data) {
  return await apiRequest('/api/dependencies/integrations', {
    method: 'POST',
    body: data
  });
}

export async function deleteIntegration(id) {
  return await apiRequest(`/api/dependencies/integrations/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}

export async function analyzeDependencyImpact(data) {
  return await apiRequest('/api/dependencies/impact', {
    method: 'POST',
    body: data
  });
}

/**
 * Impact Assessment Engine: Computes blast radius and lists affected consumers.
 * Calls: GET /api/integrations/impact/:endpointId
 */
export async function getImpactAssessment(endpointId) {
  return await apiRequest(`/api/integrations/impact/${encodeURIComponent(endpointId)}`);
}

// ==========================================
// MCP & AI-Assisted Diagnostics APIs
// ==========================================

/**
 * MCP Diagnostics: Lists available tools.
 * Calls: GET /api/mcp/tools
 */
export async function getMcpTools() {
  return await apiRequest('/api/mcp/tools');
}

/**
 * MCP Diagnostics: Invokes an MCP diagnostic tool.
 * Calls: POST /api/mcp/tools/call
 */
export async function callMcpTool(name, args = {}) {
  return await apiRequest('/api/mcp/tools/call', {
    method: 'POST',
    body: { name, arguments: args }
  });
}

export async function getDiagnosticsStatus() {
  return await apiRequest('/api/diagnostics/status');
}

export async function getDiagnosticsHistory() {
  return await apiRequest('/api/diagnostics/history');
}

export async function runDiagnosticInvestigation(data) {
  return await apiRequest('/api/diagnostics/investigate', {
    method: 'POST',
    body: data
  });
}

// ==========================================
// Authentication & Organization APIs
// ==========================================

export async function registerUser(data) {
  const res = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: data
  });
  if (res.token) {
    setAuthToken(res.token);
    if (res.organization?.id) setActiveOrgId(res.organization.id);
  }
  return res;
}

export async function loginUser(data) {
  const res = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: data
  });
  if (res.token) {
    setAuthToken(res.token);
    if (res.activeOrganization?.id) setActiveOrgId(res.activeOrganization.id);
  }
  return res;
}

export async function getCurrentUser() {
  return await apiRequest('/api/auth/me');
}

export async function switchOrganization(organizationId) {
  const res = await apiRequest('/api/auth/switch-org', {
    method: 'POST',
    body: { organizationId }
  });
  if (res.token) {
    setAuthToken(res.token);
    setActiveOrgId(organizationId);
  }
  return res;
}

export async function getOrganizations() {
  return await apiRequest('/api/organizations');
}

export async function createOrganization(name) {
  return await apiRequest('/api/organizations', {
    method: 'POST',
    body: { name }
  });
}

export function logoutUser() {
  setAuthToken(null);
  setActiveOrgId(null);
}

export { API_BASE_URL };
