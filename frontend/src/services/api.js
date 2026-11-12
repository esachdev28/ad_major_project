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
 *    - Execute HTTP GET requests to `/api/health` and `/api/dashboard/stats`.
 *    - Handle network errors gracefully (e.g. backend down / connection refused).
 *    - Parse JSON responses and return structured data to calling components.
 *
 * 3. Which functions it contains:
 *    - `checkHealth()`: Checks backend server connectivity and returns health status.
 *    - `checkDbHealth()`: Checks PostgreSQL database connectivity via Prisma.
 *    - `getDashboardStats()`: Fetches live database statistics from Express.
 *
 * 4. How it communicates with other files:
 *    - Imported by `Dashboard.jsx` (or other pages/components) to fetch data.
 *    - Communicates over HTTP with Express routes running on `http://localhost:5001`.
 *
 * 5. Why this chosen approach is appropriate:
 *    - Native `fetch` is built into modern browsers; no extra library (like Axios) needed.
 *    - Clean async/await syntax is easy for a first-year student to understand and explain.
 *    - Centralized error handling prevents unhandled promise rejections and UI crashes.
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
        ...options.headers,
      },
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

/**
 * Fetches dashboard operational metrics from Express.
 * Calls: GET /api/dashboard/stats
 *
 * @returns {Promise<{success: boolean, dataSource: string, data: {totalApis: number, healthyApis: number, failedApis: number, averageLatency: string}}>}
 */
export async function getDashboardStats() {
  return await apiRequest('/api/dashboard/stats');
}

export async function getDashboardAnalytics(hours = 24) {
  return await apiRequest(`/api/dashboard/analytics?hours=${hours}`);
}

export async function getEndpointHistory(id, hours = 24) {
  return await apiRequest(`/api/endpoints/${encodeURIComponent(id)}/history?hours=${hours}`);
}

export async function getEndpoints(params = {}) {
  const query = new URLSearchParams(params).toString();
  return apiRequest(query ? `/api/endpoints?${query}` : '/api/endpoints');
}

export async function getEndpoint(id) {
  return apiRequest(`/api/endpoints/${encodeURIComponent(id)}`);
}

export async function createEndpoint(endpoint) {
  return apiRequest('/api/endpoints', { method: 'POST', body: JSON.stringify(endpoint) });
}

export async function updateEndpoint(id, endpoint) {
  return apiRequest(`/api/endpoints/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(endpoint) });
}

export async function deleteEndpoint(id) {
  return apiRequest(`/api/endpoints/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function checkEndpointNow(id) {
  return apiRequest(`/api/endpoints/${encodeURIComponent(id)}/check`, { method: 'POST' });
}

// ==========================================
// Incident Management APIs
// ==========================================

export async function getIncidents(params = {}) {
  const query = new URLSearchParams(params).toString();
  const endpoint = query ? `/api/incidents?${query}` : '/api/incidents';
  return apiRequest(endpoint);
}

export async function getIncidentById(id) {
  return apiRequest(`/api/incidents/${encodeURIComponent(id)}`);
}

export async function acknowledgeIncident(id) {
  return apiRequest(`/api/incidents/${encodeURIComponent(id)}/acknowledge`, { method: 'PATCH' });
}

export async function resolveIncident(id) {
  return apiRequest(`/api/incidents/${encodeURIComponent(id)}/resolve`, { method: 'PATCH' });
}

// ==========================================
// API Contract Management & Versioning
// ==========================================

export async function getContracts() {
  return apiRequest('/api/contracts');
}

export async function getContractVersion(versionId) {
  return apiRequest(`/api/contracts/${encodeURIComponent(versionId)}`);
}

export async function uploadContract(data) {
  return apiRequest('/api/contracts/upload', { method: 'POST', body: JSON.stringify(data) });
}

export async function deleteContractVersion(versionId) {
  return apiRequest(`/api/contracts/${encodeURIComponent(versionId)}`, { method: 'DELETE' });
}

export async function compareContracts(baselineVersionId, targetVersionId) {
  return apiRequest('/api/contracts/compare', {
    method: 'POST',
    body: JSON.stringify({ baselineVersionId, targetVersionId }),
  });
}

// ==========================================
// Dependency Graph & Impact Analysis APIs
// ==========================================

export async function getDependencyGraph() {
  return apiRequest('/api/dependencies/graph');
}

export async function createService(data) {
  return apiRequest('/api/dependencies/services', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteService(id) {
  return apiRequest(`/api/dependencies/services/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function createIntegration(data) {
  return apiRequest('/api/dependencies/integrations', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteIntegration(id) {
  return apiRequest(`/api/dependencies/integrations/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function analyzeDependencyImpact(data) {
  return apiRequest('/api/dependencies/impact', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ==========================================
// MCP & AI-Assisted Diagnostics APIs
// ==========================================

export async function getMcpTools() {
  return apiRequest('/api/mcp/tools');
}

export async function getDiagnosticsStatus() {
  return apiRequest('/api/diagnostics/status');
}

export async function getDiagnosticsHistory() {
  return apiRequest('/api/diagnostics/history');
}

export async function runDiagnosticInvestigation(data) {
  return apiRequest('/api/diagnostics/investigate', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ==========================================
// Authentication & Organization APIs (Phase 2)
// ==========================================

export async function registerUser(data) {
  const res = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
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
    body: JSON.stringify(data),
  });
  if (res.token) {
    setAuthToken(res.token);
    if (res.activeOrganization?.id) setActiveOrgId(res.activeOrganization.id);
  }
  return res;
}

export async function getCurrentUser() {
  return apiRequest('/api/auth/me');
}

export async function switchOrganization(organizationId) {
  const res = await apiRequest('/api/auth/switch-org', {
    method: 'POST',
    body: JSON.stringify({ organizationId }),
  });
  if (res.token) {
    setAuthToken(res.token);
    setActiveOrgId(organizationId);
  }
  return res;
}

export async function getOrganizations() {
  return apiRequest('/api/organizations');
}

export async function createOrganization(name) {
  return apiRequest('/api/organizations', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export function logoutUser() {
  setAuthToken(null);
  setActiveOrgId(null);
}

export { API_BASE_URL };
